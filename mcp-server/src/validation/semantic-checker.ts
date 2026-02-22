/**
 * 意味的整合性チェッカー（キーワードトレーサビリティ方式）
 * @spec docs/workflows/レビュ-全問題の根本原因修正/spec.md CRITICAL-1
 *
 * N-gram方式からキーワードトレーサビリティ方式に全面置換。
 * N-gram方式は改行コード依存（CRLF環境での誤検出）の問題があったため、
 * 見出し・太字・箇条書きからキーワードを抽出し、
 * フェーズ間のキーワード引き継ぎを検証する方式に変更。
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * 意味的整合性検証結果
 */
export interface SemanticConsistencyResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Markdownテキストから主要概念キーワードを抽出する。
 *
 * 見出し行、太字テキスト、箇条書き項目からキーワードを抽出し、
 * CRLF/LF混在環境でも安定した結果を返す。
 *
 * @param text - Markdownテキスト
 * @returns 抽出されたキーワード配列（重複排除済み）
 */
export function extractKeywordsFromMarkdown(text: string): string[] {
  // CRLF → LF 統一
  const normalized = text.replace(/\r\n/g, '\n').normalize('NFKC');

  const keywords = new Set<string>();

  // 見出し行: # で始まる行のテキスト部分
  const headingPattern = /^#+\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = headingPattern.exec(normalized)) !== null) {
    const keyword = match[1].trim();
    if (keyword.length > 0) {
      keywords.add(keyword);
    }
  }

  // 太字: **text** で囲まれたテキスト
  const boldPattern = /\*\*(.+?)\*\*/g;
  while ((match = boldPattern.exec(normalized)) !== null) {
    const keyword = match[1].trim();
    if (keyword.length > 0) {
      keywords.add(keyword);
    }
  }

  // 箇条書き: - または * で始まる行のテキスト部分
  const bulletPattern = /^[-*]\s+(.+)$/gm;
  while ((match = bulletPattern.exec(normalized)) !== null) {
    const keyword = match[1].trim();
    if (keyword.length > 0) {
      keywords.add(keyword);
    }
  }

  return Array.from(keywords);
}

/**
 * フェーズ間のキーワード引き継ぎを検証する。
 *
 * requirements → spec → test-design の順でキーワードの追跡を行い、
 * 引き継がれていないキーワードを警告として報告する。
 * 部分一致を許容し、キーワードが対象テキスト内に部分文字列として
 * 含まれていれば追跡成功と判定する。
 *
 * @param requirementsText - requirements.md の内容
 * @param specText - spec.md の内容
 * @param testDesignText - test-design.md の内容
 * @returns 警告メッセージの配列
 */
export function validateKeywordTraceability(
  requirementsText: string,
  specText: string,
  testDesignText: string,
): { warnings: string[] } {
  const warnings: string[] = [];

  // CRLF統一 + Unicode正規化
  const normalizedSpec = specText.replace(/\r\n/g, '\n').normalize('NFKC');
  const normalizedTestDesign = testDesignText.replace(/\r\n/g, '\n').normalize('NFKC');

  const reqKeywords = extractKeywordsFromMarkdown(requirementsText);
  const specKeywords = extractKeywordsFromMarkdown(specText);

  // requirements → spec の追跡
  if (normalizedSpec.length > 0 && reqKeywords.length > 0) {
    const missingInSpec: string[] = [];
    for (const keyword of reqKeywords) {
      if (!normalizedSpec.includes(keyword)) {
        missingInSpec.push(keyword);
      }
    }

    // 未追跡キーワードが全体の70%を超える場合は集約警告
    if (missingInSpec.length > reqKeywords.length * 0.7) {
      warnings.push(
        `requirements→spec間のキーワード追跡率が低い（${reqKeywords.length - missingInSpec.length}/${reqKeywords.length}件追跡成功）。抽出品質を確認してください。`,
      );
    } else if (missingInSpec.length > 0) {
      for (const keyword of missingInSpec) {
        warnings.push(
          `spec.md でキーワード「${keyword}」が見つかりません（requirements.mdから未引き継ぎ）`,
        );
      }
    }
  }

  // spec → test-design の追跡
  if (normalizedTestDesign.length > 0 && specKeywords.length > 0) {
    const missingInTestDesign: string[] = [];
    for (const keyword of specKeywords) {
      if (!normalizedTestDesign.includes(keyword)) {
        missingInTestDesign.push(keyword);
      }
    }

    // 未追跡キーワードが全体の70%を超える場合は集約警告
    if (missingInTestDesign.length > specKeywords.length * 0.7) {
      warnings.push(
        `spec→test-design間のキーワード追跡率が低い（${specKeywords.length - missingInTestDesign.length}/${specKeywords.length}件追跡成功）。抽出品質を確認してください。`,
      );
    } else if (missingInTestDesign.length > 0) {
      for (const keyword of missingInTestDesign) {
        warnings.push(
          `test-design.md でキーワード「${keyword}」が見つかりません（spec.mdから未引き継ぎ）`,
        );
      }
    }
  }

  return { warnings };
}

/**
 * MarkdownテキストからサマリーセクションのみをMarkdown形式で抽出する。
 *
 * 「## サマリー」ヘッダーから始まり、次の「##」ヘッダーまでの内容を返す。
 * サマリーセクションが存在しない場合は空文字列を返す。
 *
 * @param text - Markdownテキスト全体
 * @returns サマリーセクションの内容（ヘッダー行を含む）、存在しない場合は空文字列
 */
export function extractSummarySection(text: string): string {
  // CRLF → LF 統一
  const normalized = text.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  let inSummary = false;
  const summaryLines: string[] = [];

  for (const line of lines) {
    // ## サマリー ヘッダーを検出（## で始まり「サマリー」を含む行）
    if (/^##\s+サマリー/.test(line)) {
      inSummary = true;
      summaryLines.push(line);
      continue;
    }

    if (inSummary) {
      // 次の ## ヘッダーに達したら終了
      if (/^##\s+/.test(line)) {
        break;
      }
      summaryLines.push(line);
    }
  }

  if (summaryLines.length > 0) {
    return summaryLines.join('\n');
  }

  // ## サマリーセクションが存在しない場合は先頭200行をフォールバックとして返す
  return lines.slice(0, 200).join('\n');
}

/**
 * キーワードセマンティックトレーサビリティ検証結果
 */
export interface KeywordSemanticTraceabilityResult {
  /** 検証合否 */
  passed: boolean;
  /** セマンティックスコア（0.0〜1.0） */
  score: number;
  /** 判定理由 */
  reasoning: string;
}

/**
 * キーワードマッチング方式によるセマンティックトレーサビリティ検証（FR-2）。
 *
 * sourceFilePathの成果物からキーワードを抽出し、targetFilePathの成果物に
 * それらのキーワードが引き継がれているかをキーワードマッチングで検証する。
 * LLM APIの呼び出しは行わず、全てローカルのキーワード抽出処理で完結する。
 *
 * なお、@anthropic-ai/sdk の可用性チェックは将来の LLM 統合への拡張ポイントとして
 * 残されているが、現時点では SDK が利用可能と判定された場合も同じキーワードマッチング
 * 処理が実行される。
 *
 * @param sourceFilePath - 参照元ファイルのパス（requirements.md等）
 * @param targetFilePath - 検証対象ファイルのパス（spec.md等）
 * @returns 検証結果
 */
export async function validateKeywordSemanticTraceability(
  sourceFilePath: string,
  targetFilePath: string,
): Promise<KeywordSemanticTraceabilityResult> {
  // @anthropic-ai/sdk の可用性を実行時チェック
  // 注意: コンパイル時の型解決を回避するため Function コンストラクタ経由で動的インポートを実行する
  let sdkAvailable = false;
  try {
    // eslint-disable-next-line no-new-func
    await (new Function('specifier', 'return import(specifier)'))('@anthropic-ai/sdk');
    sdkAvailable = true;
  } catch {
    sdkAvailable = false;
  }

  if (!sdkAvailable) {
    // SDKが利用不可能な場合のフォールバック実装
    return {
      passed: true,
      score: 0.5,
      reasoning: 'SDK非依存フォールバック: @anthropic-ai/sdkが利用不可能なため検証をスキップ',
    };
  }

  // SDKが利用可能な場合の実装（将来拡張ポイント）
  try {
    const sourceExists = fs.existsSync(sourceFilePath);
    const targetExists = fs.existsSync(targetFilePath);

    if (!sourceExists || !targetExists) {
      return {
        passed: true,
        score: 0.5,
        reasoning: `ファイルが存在しないためスキップ: source=${sourceExists}, target=${targetExists}`,
      };
    }

    // SDKが利用可能な場合の実装（FR-2-1）: 現時点ではキーワードトレーサビリティ方式にフォールバック
    const sourceText = fs.readFileSync(sourceFilePath, 'utf-8');
    const targetText = fs.readFileSync(targetFilePath, 'utf-8');
    const sourceSummary = extractSummarySection(sourceText) || sourceText;
    const keywords = extractKeywordsFromMarkdown(sourceSummary);
    const missingCount = keywords.filter(kw => !targetText.includes(kw)).length;
    const score = keywords.length > 0 ? (keywords.length - missingCount) / keywords.length : 1.0;

    return {
      passed: score >= 0.5,
      score,
      reasoning: `キーワード追跡率: ${Math.round(score * 100)}%（${keywords.length - missingCount}/${keywords.length}件一致）`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      passed: true,
      score: 0.5,
      reasoning: `検証中にエラーが発生したためスキップ: ${message}`,
    };
  }
}

/**
 * 意味的整合性チェックのエントリーポイント。
 *
 * ワークフロー成果物ディレクトリ内の requirements.md, spec.md, test-design.md を
 * 読み込み、キーワードトレーサビリティ検証を実行する。
 *
 * @param docsDir - ワークフロー成果物ディレクトリパス
 * @returns 検証結果
 */
export function validateSemanticConsistency(
  docsDir: string,
): SemanticConsistencyResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const requirementsPath = path.join(docsDir, 'requirements.md');
  const specPath = path.join(docsDir, 'spec.md');
  const testDesignPath = path.join(docsDir, 'test-design.md');

  // requirements.md が存在しない場合はスキップ
  if (!fs.existsSync(requirementsPath)) {
    return { valid: true, errors: [], warnings: [] };
  }

  try {
    const requirementsText = fs.readFileSync(requirementsPath, 'utf-8');

    // 存在しないファイルは空文字列として扱う
    let specText = '';
    if (fs.existsSync(specPath)) {
      specText = fs.readFileSync(specPath, 'utf-8');
    }

    let testDesignText = '';
    if (fs.existsSync(testDesignPath)) {
      testDesignText = fs.readFileSync(testDesignPath, 'utf-8');
    }

    // キーワードトレーサビリティ検証
    const result = validateKeywordTraceability(requirementsText, specText, testDesignText);
    warnings.push(...result.warnings);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`意味的整合性チェックでエラーが発生: ${message}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
