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
