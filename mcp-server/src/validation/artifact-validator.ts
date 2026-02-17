/**
 * 成果物品質検証モジュール
 * @spec docs/workflows/ワークフロー全問題完全解決/spec.md REQ-3
 * @spec docs/workflows/ワ-クフロ-プラグインレビュ-指摘事項全件修正/spec.md
 * @spec docs/workflows/ワークフロー10M対応全問題根本原因修正/spec.md REQ-5, REQ-8, REQ-12
 *
 * REQ-B1: セクション密度チェック統合（MIN_SECTION_DENSITY環境変数）
 * REQ-B2: 意味的整合性チェックは semantic-checker.ts に移行済み
 * REQ-5: バリデーションタイムアウト（10秒制限）
 * REQ-12: サマリー行数制限 50→200行
 */

import * as fs from 'fs';
import * as path from 'path';

/** REQ-B1: セクション密度の最小閾値（デフォルト: 0.3 = 30%） */
const MIN_SECTION_DENSITY_RAW = parseFloat(process.env.MIN_SECTION_DENSITY || '0.3');
const MIN_DENSITY = 0.1;
const MAX_DENSITY = 1.0;

/** REQ-5: バリデーションタイムアウト（デフォルト: 10000ms = 10秒） */
const VALIDATION_TIMEOUT_MS = parseInt(process.env.VALIDATION_TIMEOUT_MS || '10000', 10);

/** REQ-12: サマリーセクションの最大行数（デフォルト: 200行） */
const MAX_SUMMARY_LINES = parseInt(process.env.MAX_SUMMARY_LINES || '200', 10);


/**
 * FR-6: 数値の範囲をバリデート（process.exit除去、RangeErrorをthrow）
 *
 * @param value 検証値
 * @param varName 環境変数名
 * @param min 最小値
 * @param max 最大値
 * @throws RangeError 範囲外の場合
 */
function validateRange(value: number, varName: string, min: number, max: number): void {
  if (value < min || value > max) {
    throw new RangeError(`${varName} must be between ${min} and ${max}, got ${value}`);
  }
}

// REQ-B1: 範囲バリデーション（グローバルスコープでの実行を削除）
// FR-6: エラーハンドリングは呼び出し元で実施
let MIN_SECTION_DENSITY = MIN_DENSITY;
try {
  validateRange(MIN_SECTION_DENSITY_RAW, 'MIN_SECTION_DENSITY', MIN_DENSITY, MAX_DENSITY);
  MIN_SECTION_DENSITY = MIN_SECTION_DENSITY_RAW;
} catch (error) {
  console.warn(`[artifact-validator] ${error instanceof Error ? error.message : error}, using default ${MIN_DENSITY}`);
}

/**
 * FR-12: 多言語セクション名定義
 */
export interface MultiLangSection {
  ja: string;
  en: string;
}

/**
 * 成果物の品質要件
 */
export interface ArtifactRequirement {
  minLines: number;
  /** P0-1: フェーズ遷移時に使用する最小行数（直接バリデーションよりも緩い値を設定可能） */
  minLinesForTransition?: number;
  requiredSections: string[] | MultiLangSection[];
}

/**
 * 成果物の検証結果
 */
export interface ArtifactValidationResult {
  passed: boolean;
  errors: string[];
}

// CRITICAL-1: N-gram関数は semantic-checker.ts に移行済み（削除）

/**
 * 構造要素判定ヘルパー関数
 *
 * Markdown文書の構造要素（区切り線、コードフェンス、テーブル区切り）を判定する。
 *
 * REQ-D2: コードブロック内の行とテーブルデータ行を除外するよう改善。
 * ただし、コードブロック内フラグ管理は呼び出し元で行うこと。
 *
 * @param line 判定対象の行（トリム済み）
 * @returns 構造要素の場合はtrue
 */
export function isStructuralLine(line: string): boolean {
  const trimmed = line.trim();
  // Markdownヘッダー: #で始まる行（## サマリー、### 概要 等）
  if (/^#+\s/.test(trimmed)) return true;
  // 区切り線: ---、***、___（3文字以上の繰り返し）
  if (/^[-*_]{3,}$/.test(trimmed)) return true;
  // コードフェンス: ```で始まる行
  if (trimmed.startsWith('```')) return true;
  // テーブルセパレータ行: |で始まりハイフン・コロン・スペースのみを含む（例: |---|---|---|）
  if (/^\s*\|[\s:-]+(\|[\s:-]+)*\|\s*$/.test(trimmed)) return true;
  // テーブルデータ行: パイプで始まりパイプで終わる行で内側に1つ以上のパイプを含む（2カラム以上）
  if (/^\s*\|.+\|.+\|\s*$/.test(trimmed)) return true;
  // Markdownラベルパターン: **太字**: のような構造ラベル
  if (/^\*\*[^*]+\*\*[:：]?\s*$/.test(trimmed)) return true;
  // リスト先頭のMarkdownラベル: - **太字**: のような構造ラベル
  if (/^[-*]\s+\*\*[^*]+\*\*[:：]?\s*$/.test(trimmed)) return true;
  // FIX-1: プレーンラベルパターン: リスト記号 + 50文字以内のラベル + コロン終端
  if (/^[-*]\s+.{1,50}[:：]\s*$/.test(trimmed)) return true;
  return false;
}

/** コードフェンス開始パターン（バックティックまたはチルダ3個以上） */
const CODE_FENCE_PATTERNS = ['```', '~~~'];

/**
 * コードフェンス開始/終了行を判定する
 *
 * @param trimmedLine トリム済みの行
 * @returns コードフェンス開始/終了行の場合true
 */
function isCodeFenceBoundary(trimmedLine: string): boolean {
  return CODE_FENCE_PATTERNS.some(pattern => trimmedLine.startsWith(pattern));
}

/**
 * FR-1: コードフェンス外の行のみを返す純粋関数
 *
 * Markdownコンテンツを行単位で走査し、コードフェンス（バックティック3個以上
 * またはチルダ3個以上）で囲まれた範囲の行を除外した行配列を返す。
 * コードフェンス開始行・終了行自体も返却配列から除外する。
 * O(n)の1パス処理、isInsideCodeFenceブールフラグで状態管理。
 *
 * @param content Markdownコンテンツ文字列
 * @returns コードフェンス外の行の配列
 */
export function extractNonCodeLines(content: string): string[] {
  const lines = content.split('\n');
  const result: string[] = [];
  let isInsideCodeFence = false;

  for (const line of lines) {
    const trimmed = line.trim();
    // コードフェンス開始/終了の判定
    if (isCodeFenceBoundary(trimmed)) {
      isInsideCodeFence = !isInsideCodeFence;
      continue;
    }
    // コードフェンス内の行はスキップ
    if (isInsideCodeFence) continue;
    // コードフェンス外の行はそのまま追加
    result.push(line);
  }

  return result;
}

/**
 * フェーズ別成果物要件定数
 *
 * 各フェーズで必要な成果物の品質基準を定義する。
 * - minLines: 最小行数（空白行を除く）
 * - requiredSections: 必須セクション（Markdown見出し or Mermaidキーワード）
 */
export const PHASE_ARTIFACT_REQUIREMENTS: Record<string, ArtifactRequirement> = {
  'research.md': {
    minLines: 20,
    minLinesForTransition: 16,
    requiredSections: [
      { ja: '## 調査結果', en: '## Investigation Results' },
      { ja: '## 既存実装の分析', en: '## Existing Implementation Analysis' },
    ],
  },
  'requirements.md': {
    minLines: 30,
    requiredSections: [
      { ja: '## 背景', en: '## Background' },
      { ja: '## 機能要件', en: '## Functional Requirements' },
      { ja: '## 受入条件', en: '## Acceptance Criteria' },
    ],
  },
  'spec.md': {
    minLines: 50,
    /** P0-2: フェーズ遷移時は最低5行のみ必須（full validation時は50行必須を維持） */
    minLinesForTransition: 5,
    requiredSections: [
      { ja: '## 概要', en: '## Overview' },
      { ja: '## 実装計画', en: '## Implementation Plan' },
      { ja: '## 変更対象ファイル', en: '## Target Files' },
    ],
  },
  'test-design.md': {
    minLines: 30,
    requiredSections: [
      { ja: '## テストケース', en: '## Test Cases' },
      { ja: '## テスト計画', en: '## Test Plan' },
    ],
  },
  'threat-model.md': {
    minLines: 20,
    /** P0-2: フェーズ遷移時は最低5行のみ必須（full validation時は20行必須を維持） */
    minLinesForTransition: 5,
    requiredSections: ['## 脅威', '## リスク'],
  },
  'state-machine.mmd': {
    minLines: 5,
    requiredSections: ['stateDiagram'],
  },
  'flowchart.mmd': {
    minLines: 5,
    requiredSections: ['flowchart'],
  },
  'ui-design.md': {
    minLines: 50,
    requiredSections: ['サマリー', 'CLIインターフェース設計', 'エラーメッセージ設計', 'APIレスポンス設計', '設定ファイル設計'],
  },
  'code-review.md': {
    minLines: 30,
    requiredSections: ['設計-実装整合性', 'コード品質', 'セキュリティ', 'パフォーマンス'],
  },
  'manual-test.md': {
    minLines: 20,
    requiredSections: ['テストシナリオ', 'テスト結果'],
  },
  'security-scan.md': {
    minLines: 20,
    requiredSections: ['脆弱性スキャン結果', '検出された問題'],
  },
  'performance-test.md': {
    minLines: 20,
    requiredSections: ['パフォーマンス計測結果', 'ボトルネック分析'],
  },
  'e2e-test.md': {
    minLines: 20,
    requiredSections: ['E2Eテストシナリオ', 'テスト実行結果'],
  },
  'test-impl-result.md': {
    minLines: 20,
    requiredSections: ['テスト実装', 'テストケース'],
  },

};

/**
 * 成果物の品質を検証する（内部実装）
 *
 * REQ-5: タイムアウトチェックを含む同期バリデーション実行
 *
 * @param filePath 検証対象ファイルパス
 * @param requirements 品質要件
 * @param startTime 開始時刻（タイムアウト計測用）
 * @returns 検証結果
 */
function validateArtifactQualityCore(
  filePath: string,
  requirements: ArtifactRequirement,
  startTime: number
): ArtifactValidationResult {
  const errors: string[] = [];
  const fileName = path.basename(filePath);

  // REQ-5: タイムアウトチェックヘルパー
  const checkTimeout = () => {
    const elapsed = Date.now() - startTime;
    if (elapsed > VALIDATION_TIMEOUT_MS) {
      throw new Error(`バリデーションタイムアウト（${VALIDATION_TIMEOUT_MS}ms超過）`);
    }
  };

  // 1. ファイル存在チェック
  checkTimeout();
  if (!fs.existsSync(filePath)) {
    errors.push(`${fileName} が存在しません`);
    return { passed: false, errors };
  }

  // 2. サイズチェック（0バイト）
  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    errors.push(`${fileName} が空ファイルです`);
    return { passed: false, errors };
  }

  // 3. ファイル読み込み
  const content = fs.readFileSync(filePath, 'utf-8');

  // 4. 行数チェック（空白行を除外）
  const lines = content.split('\n').filter(line => line.trim().length > 0);
  if (lines.length < requirements.minLines) {
    errors.push(
      `${fileName} の行数が不足しています（${lines.length}行 < ${requirements.minLines}行）`
    );
  }

  // 5. FR-12: 必須セクションチェック（多言語対応）
  const missingSections = requirements.requiredSections.filter(section => {
    if (typeof section === 'string') {
      return !content.includes(section);
    } else {
      // 多言語セクション: いずれかの言語でマッチすればOK
      return !content.includes(section.ja) && !content.includes(section.en);
    }
  });
  if (missingSections.length > 0) {
    const sectionNames = missingSections.map(s =>
      typeof s === 'string' ? s : `${s.ja} / ${s.en}`
    );
    errors.push(
      `${fileName} に必須セクションがありません: ${sectionNames.join(', ')}`
    );
  }

  // 6. 禁止パターンチェック（TODO, TBD, WIP, FIXME + 日本語プレースホルダー）
  const forbiddenPatterns = [
    'TODO',
    'TBD',
    'WIP',
    'FIXME',
    '未定',
    '未確定',
    '要検討',
    '検討中',
    '対応予定',
    'サンプル',
    'ダミー',
    '仮置き',
  ];
  // FR-1: コードフェンス外の行のみを対象に禁止パターンを検索
  const nonCodeContent = extractNonCodeLines(content).join('\n');
  const foundForbidden = forbiddenPatterns.filter(pattern =>
    nonCodeContent.includes(pattern)
  );

  // 角括弧プレースホルダーのチェック（Markdownリンク/参照パターンを除外）
  // FR-1: コードフェンス外の行のみを対象に検索
  const bracketPlaceholderPattern = /\[(?!関連|参考|注|例|出典)[^\]]{1,50}\]/g;
  const bracketMatches = nonCodeContent.match(bracketPlaceholderPattern);
  const foundBracketPlaceholders: string[] = [];
  if (bracketMatches) {
    // 重複排除
    const uniqueBrackets = Array.from(new Set(bracketMatches));
    foundBracketPlaceholders.push(...uniqueBrackets);
  }

  if (foundForbidden.length > 0 || foundBracketPlaceholders.length > 0) {
    const allPatterns = [...foundForbidden];
    if (foundBracketPlaceholders.length > 0) {
      allPatterns.push(`プレースホルダー括弧: ${foundBracketPlaceholders.slice(0, 3).join(', ')}${foundBracketPlaceholders.length > 3 ? '...' : ''}`);
    }
    errors.push(
      `${fileName} に禁止パターンが含まれています: ${allPatterns.join(', ')}`
    );
  }

  // 7. ダミーテキスト検出（同一行の3回以上繰り返し）
  // コードフェンス内の行は除外する（コード例は構文上の繰り返しが自然に発生する）
  // .mmd ファイル（Mermaid図）は構文上の繰り返し（閉じ括弧等）が自然に発生するため除外
  checkTimeout(); // REQ-5: タイムアウトチェック
  if (!filePath.endsWith('.mmd')) {
    const lineCountMap = new Map<string, number>();
    let insideCodeFence = false;
    for (const line of lines) {
      const trimmed = line.trim();
      // コードフェンスの開始/終了を追跡
      if (trimmed.startsWith('```')) {
        insideCodeFence = !insideCodeFence;
        continue;
      }
      // コードフェンス内の行はスキップ
      if (insideCodeFence) continue;
      if (trimmed.length > 0 && !isStructuralLine(trimmed)) {
        lineCountMap.set(trimmed, (lineCountMap.get(trimmed) || 0) + 1);
      }
    }

    const duplicates = Array.from(lineCountMap.entries()).filter(([_, count]) => count >= 3);
    if (duplicates.length > 0) {
      errors.push(
        `${fileName} にダミーテキストの疑いがあります（同一行の繰り返し）`
      );
    }
  }

  // 8. ヘッダーのみチェック（Markdown形式の場合）
  if (filePath.endsWith('.md')) {
    const nonHeaderLines = lines.filter(line => !line.trim().startsWith('#'));
    if (nonHeaderLines.length < 5) {
      errors.push(
        `${fileName} はヘッダーのみで本文が不足しています`
      );
    }
  }

  // 9. Mermaid図の特殊チェック
  if (filePath.endsWith('.mmd')) {
    const hasStateDiagram = content.includes('stateDiagram');
    const hasFlowchart = content.includes('flowchart');
    if (!hasStateDiagram && !hasFlowchart) {
      errors.push(
        `${fileName} に stateDiagram または flowchart キーワードがありません`
      );
    }
  }

  // 10. FR-7: セクション密度チェック（定義済みMarkdownファイルのみ）
  if (filePath.endsWith('.md') && PHASE_ARTIFACT_REQUIREMENTS[fileName]) {
    const densityResult = checkSectionDensity(content);
    if (!densityResult.valid) {
      errors.push(...densityResult.errors);
    }
  }

  // 11. FR-7: 短い行の比率チェック（定義済みMarkdownファイルのみ）
  if (filePath.endsWith('.md') && PHASE_ARTIFACT_REQUIREMENTS[fileName]) {
    const shortLineResult = checkShortLineRatio(content);
    if (!shortLineResult.valid) {
      errors.push(...shortLineResult.errors);
    }
  }

  // 12. FR-7: 必須セクションチェック（より詳細）
  const requiredSectionsResult = checkRequiredSections(fileName, content);
  if (!requiredSectionsResult.valid) {
    errors.push(...requiredSectionsResult.errors);
  }

  // 13. FR-7: コードパス参照チェック（spec.mdのみ）
  checkTimeout(); // REQ-5: タイムアウトチェック
  if (fileName === 'spec.md') {
    const codePathResult = checkCodePathReferences(content);
    if (!codePathResult.valid) {
      errors.push(...codePathResult.errors);
    }
  }

  // 14. REQ-12: サマリーセクション行数チェック（Markdownファイルのみ）
  checkTimeout(); // REQ-5: タイムアウトチェック
  if (filePath.endsWith('.md')) {
    const summaryResult = checkSummaryLength(content, MAX_SUMMARY_LINES);
    if (!summaryResult.valid) {
      errors.push(...summaryResult.errors);
    }
  }

  return {
    passed: errors.length === 0,
    errors,
  };
}

/**
 * 成果物の品質を検証する（公開API）
 *
 * REQ-5: タイムアウト処理を含むバリデーション実行
 *
 * @param filePath 検証対象ファイルパス
 * @param requirements 品質要件
 * @returns 検証結果
 */
export function validateArtifactQuality(
  filePath: string,
  requirements: ArtifactRequirement
): ArtifactValidationResult {
  const startTime = Date.now();

  try {
    return validateArtifactQualityCore(filePath, requirements, startTime);
  } catch (error) {
    // REQ-5: タイムアウトエラーをキャッチして適切なエラーメッセージを返す
    if (error instanceof Error && error.message.includes('タイムアウト')) {
      return {
        passed: false,
        errors: [error.message],
      };
    }
    // その他のエラーは再スロー
    throw error;
  }
}

/**
 * REQ-4: トレーサビリティ検証結果
 */
export interface TraceabilityValidationResult {
  passed: boolean;
  missingTraces: string[];
  errors: string[];
}

/**
 * REQ-4: 要件→テストのトレーサビリティ検証
 *
 * requirements.mdのREQ-IDがtest-design.mdで参照されているか検証する。
 *
 * @param docsDir ワークフロー成果物ディレクトリ
 * @returns トレーサビリティ検証結果
 */
export function validateTraceability(docsDir: string): TraceabilityValidationResult {
  const requirementsPath = path.join(docsDir, 'requirements.md');
  const testDesignPath = path.join(docsDir, 'test-design.md');
  const errors: string[] = [];
  const missingTraces: string[] = [];

  // ファイル存在チェック
  if (!fs.existsSync(requirementsPath)) {
    return { passed: false, missingTraces: [], errors: ['requirements.md not found'] };
  }
  if (!fs.existsSync(testDesignPath)) {
    return { passed: false, missingTraces: [], errors: ['test-design.md not found'] };
  }

  // requirements.mdからREQ-ID抽出
  const reqContent = fs.readFileSync(requirementsPath, 'utf-8');
  const reqIds = new Set<string>();
  const reqPattern = /REQ-(\d+)/g;
  let match;
  while ((match = reqPattern.exec(reqContent)) !== null) {
    reqIds.add(`REQ-${match[1]}`);
  }

  // REQ-IDが0件の場合、検証スキップ
  if (reqIds.size === 0) {
    return { passed: true, missingTraces: [], errors: [] };
  }

  // test-design.mdからREQ-ID参照を抽出
  const testContent = fs.readFileSync(testDesignPath, 'utf-8');
  const coveredReqs = new Set<string>();

  // TC-X-Y: REQ-N 形式
  const tcReqPattern = /REQ-(\d+)/g;
  while ((match = tcReqPattern.exec(testContent)) !== null) {
    coveredReqs.add(`REQ-${match[1]}`);
  }

  // カバーされていないREQ-IDを検出
  for (const reqId of reqIds) {
    if (!coveredReqs.has(reqId)) {
      missingTraces.push(reqId);
    }
  }

  return {
    passed: missingTraces.length === 0,
    missingTraces,
    errors,
  };
}

/**
 * REQ-3: セクション本文の品質検証
 *
 * 各セクションの本文が十分な内容を持っているか検証する。
 *
 * @param content Markdown内容
 * @param minChars セクションあたりの最小文字数（デフォルト: 50）
 * @returns 検証結果
 */
export function validateSectionContent(
  content: string,
  minChars: number = 50
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  // ## で始まるセクションに分割
  const sections = content.split(/^##\s+/m).slice(1);

  for (const section of sections) {
    const lines = section.split('\n');
    const sectionName = lines[0]?.trim() || 'Unknown';
    // ヘッダー行以外を本文として結合
    const bodyText = lines.slice(1)
      .filter(l => l.trim().length > 0)
      .filter(l => !l.trim().startsWith('#'))
      .filter(l => !l.trim().startsWith('|'))
      .filter(l => !l.trim().startsWith('-'))
      .join(' ');

    if (bodyText.length < minChars) {
      errors.push(`セクション「${sectionName}」の本文が不十分です（${bodyText.length}文字 < ${minChars}文字）`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * REQ-3: 本文比率の検証
 *
 * ヘッダーや構造要素ではなく、実際の本文がどれだけあるかを検証する。
 *
 * @param content Markdown内容
 * @param minRatio 最小本文比率（デフォルト: 0.6 = 60%）
 * @returns 検証結果
 */
export function validateContentRatio(
  content: string,
  minRatio: number = 0.6
): { valid: boolean; ratio: number; errors: string[] } {
  const errors: string[] = [];
  const lines = content.split('\n').filter(l => l.trim().length > 0);

  if (lines.length === 0) {
    return { valid: false, ratio: 0, errors: ['コンテンツが空です'] };
  }

  // ヘッダー系の行をカウント
  const structuralLines = lines.filter(l => {
    const trimmed = l.trim();
    return trimmed.startsWith('#') ||
           trimmed.startsWith('|') ||
           trimmed.startsWith('-') ||
           trimmed.startsWith('>') ||
           trimmed.startsWith('*') ||
           trimmed.startsWith('```');
  });

  const bodyLines = lines.length - structuralLines.length;
  const ratio = bodyLines / lines.length;

  if (ratio < minRatio) {
    errors.push(`本文の比率が低すぎます（${(ratio * 100).toFixed(1)}% < ${(minRatio * 100).toFixed(1)}%）`);
  }

  return { valid: errors.length === 0, ratio, errors };
}

/**
 * REQ-3: Mermaid図の構造検証
 *
 * ステートマシン図やフローチャートが十分な要素を持っているか検証する。
 *
 * @param content Mermaid図の内容
 * @param minStates 最小状態/ノード数（デフォルト: 3）
 * @param minTransitions 最小遷移/エッジ数（デフォルト: 2）
 * @returns 検証結果
 */
export function validateMermaidStructure(
  content: string,
  minStates: number = 3,
  minTransitions: number = 2
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (content.includes('stateDiagram')) {
    // 遷移カウント（-->）
    const transitions = (content.match(/-->/g) || []).length;
    // 状態カウント（[*]以外の --> の前後にある識別子）
    const stateNames = new Set<string>();
    const transitionPattern = /(\w+)\s*-->/g;
    let match;
    while ((match = transitionPattern.exec(content)) !== null) {
      if (match[1] !== '[*]') stateNames.add(match[1]);
    }
    const reversePattern = /-->\s*(\w+)/g;
    while ((match = reversePattern.exec(content)) !== null) {
      if (match[1] !== '[*]') stateNames.add(match[1]);
    }

    if (stateNames.size < minStates) {
      errors.push(`ステートマシン図の状態数が不十分です（${stateNames.size}個 < ${minStates}個）`);
    }
    if (transitions < minTransitions) {
      errors.push(`ステートマシン図の遷移数が不十分です（${transitions}個 < ${minTransitions}個）`);
    }
  }

  if (content.includes('flowchart')) {
    const nodes = new Set<string>();
    const nodePattern = /(\w+)[\[\(\{]/g;
    let match;
    while ((match = nodePattern.exec(content)) !== null) {
      nodes.add(match[1]);
    }
    const edges = (content.match(/-->/g) || []).length;

    if (nodes.size < minStates) {
      errors.push(`フローチャートのノード数が不十分です（${nodes.size}個 < ${minStates}個）`);
    }
    if (edges < minTransitions) {
      errors.push(`フローチャートのエッジ数が不十分です（${edges}個 < ${minTransitions}個）`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * FR-7 + REQ-B1: セクション密度の検証
 *
 * 各 ## セクションが最低限の実質的な内容を持っているか検証する。
 *
 * REQ-B1拡張: 密度比率（実内容行 / 総行数）で検証
 * - MIN_SECTION_DENSITY 環境変数（デフォルト: 0.3）を閾値として使用
 * - 従来の最小行数チェックも保持（後方互換性）
 *
 * @param content Markdown内容
 * @param minSubstantiveLines セクションあたりの最小実質行数（デフォルト: 5）
 * @returns 検証結果
 */
export function checkSectionDensity(
  content: string,
  minSubstantiveLines: number = 5
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  // ## で始まるセクションに分割
  const sections = content.split(/^##\s+/m).slice(1);

  // REQ-D2: コードブロック内フラグ管理
  let inCodeBlock = false;

  for (const section of sections) {
    const lines = section.split('\n');
    const sectionName = lines[0]?.trim() || 'Unknown';
    const sectionContent = lines.slice(1); // セクション名行を除外

    // REQ-B1: BUG-2修正: 一度の走査で実質行と構造行をカウント（重複排除）
    let substantiveCount = 0;
    let structuralCount = 0;
    inCodeBlock = false;

    for (const line of sectionContent) {
      const trimmed = line.trim();

      // コードブロックの開始/終了を追跡
      if (trimmed.startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        structuralCount++;
        continue;
      }

      // コードブロック内の行は構造要素として除外
      if (inCodeBlock) {
        structuralCount++;
        continue;
      }

      // 空白行は構造要素
      if (trimmed.length === 0) {
        structuralCount++;
        continue;
      }

      // ヘッダーは構造要素
      if (trimmed.startsWith('#')) {
        structuralCount++;
        continue;
      }

      // FIX-2: テーブルデータ行は実質行数にカウント（セパレータ行を除く）
      if (/^\s*\|.+\|.+\|\s*$/.test(trimmed) && !/^\s*\|[\s:-]+(\|[\s:-]+)*\|\s*$/.test(trimmed)) {
        substantiveCount++;
        continue;
      }

      // その他の構造要素
      if (isStructuralLine(trimmed)) {
        structuralCount++;
        continue;
      }

      // 実質的な行
      substantiveCount++;
    }

    // 密度比率検証（実内容行 / 有効行数）
    const totalLines = sectionContent.length;
    const effectiveTotal = totalLines - structuralCount;
    const density = effectiveTotal > 0 ? substantiveCount / effectiveTotal : 0;

    if (density < MIN_SECTION_DENSITY) {
      errors.push(
        `セクション「${sectionName}」の密度が低すぎます（${density.toFixed(2)} < ${MIN_SECTION_DENSITY}）。実内容: ${substantiveCount}行 / 総行数: ${totalLines}行`
      );
    }

    // 後方互換性: 最小行数チェックも実施
    if (substantiveCount < minSubstantiveLines) {
      errors.push(
        `セクション「${sectionName}」の実質行数が不足（${substantiveCount}行 < ${minSubstantiveLines}行）`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * FR-7: 短い行の比率検証
 *
 * 10文字未満の行が全体の50%を超えていないか検証する。
 *
 * @param content Markdown内容
 * @param shortLineThreshold 短い行の閾値（デフォルト: 10文字）
 * @param maxShortLineRatio 最大短い行比率（デフォルト: 0.5 = 50%）
 * @returns 検証結果
 */
export function checkShortLineRatio(
  content: string,
  shortLineThreshold: number = 10,
  maxShortLineRatio: number = 0.5
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const lines = content.split('\n').filter(l => l.trim().length > 0);

  if (lines.length === 0) {
    return { valid: false, errors: ['コンテンツが空です'] };
  }

  // 短い行をカウント（構造要素は除外）
  const shortLines = lines.filter(line => {
    const trimmed = line.trim();
    if (isStructuralLine(trimmed)) return false;
    return trimmed.length < shortLineThreshold;
  });

  const ratio = shortLines.length / lines.length;

  if (ratio > maxShortLineRatio) {
    errors.push(
      `短い行（<${shortLineThreshold}文字）の比率が高すぎます（${(ratio * 100).toFixed(1)}% > ${(maxShortLineRatio * 100).toFixed(1)}%）`
    );
  }

  return { valid: errors.length === 0, errors };
}

/**
 * FR-7: ファイルタイプ別の必須セクション検証
 *
 * ファイル名に基づいて必須セクションが存在するか検証する。
 *
 * @param fileName - ファイル名（例: "spec.md", "requirements.md"）
 * @param content - ファイル内容
 * @returns 検証結果
 */
export function checkRequiredSections(
  fileName: string,
  content: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // ファイルタイプ別の必須セクション定義
  const requirements = PHASE_ARTIFACT_REQUIREMENTS[fileName];
  if (!requirements) {
    // 定義されていないファイルはスキップ
    return { valid: true, errors: [] };
  }

  // FR-12: 必須セクションチェック（多言語対応）
  const missingSections = requirements.requiredSections.filter(section => {
    if (typeof section === 'string') {
      return !content.includes(section);
    } else {
      // 多言語セクション: いずれかの言語でマッチすればOK
      return !content.includes(section.ja) && !content.includes(section.en);
    }
  });

  if (missingSections.length > 0) {
    const sectionNames = missingSections.map(s =>
      typeof s === 'string' ? s : `${s.ja} / ${s.en}`
    );
    errors.push(
      `${fileName} に必須セクションがありません: ${sectionNames.join(', ')}`
    );
  }

  return { valid: errors.length === 0, errors };
}

/**
 * FR-7: 実装ドキュメントのコードパス参照検証
 *
 * spec.md などの実装系ドキュメントがソースコードパスを参照しているか検証する。
 *
 * @param content - ファイル内容
 * @returns 検証結果
 */
export function checkCodePathReferences(
  content: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // コードパスのパターン（src/, tests/, etc.）
  const codePathPatterns = [
    /src\/[a-zA-Z0-9_/-]+\.[a-zA-Z]+/,  // src/backend/foo.ts
    /tests?\/[a-zA-Z0-9_/-]+\.[a-zA-Z]+/,  // tests/foo.test.ts
    /e2e\/[a-zA-Z0-9_/-]+\.[a-zA-Z]+/,  // e2e/foo.spec.ts
  ];

  const hasCodeReference = codePathPatterns.some(pattern => pattern.test(content));

  if (!hasCodeReference) {
    errors.push(
      '実装ドキュメントにソースコードパスへの参照が見つかりません（src/, tests/, e2e/ など）'
    );
  }

  return { valid: errors.length === 0, errors };
}

/**
 * REQ-12: サマリーセクションの行数検証
 *
 * Markdownファイルの「## サマリー」セクションが指定行数以内かチェックする。
 *
 * @param content - Markdownファイル内容
 * @param maxLines - サマリーセクションの最大行数（デフォルト: 200）
 * @returns 検証結果
 */
export function checkSummaryLength(
  content: string,
  maxLines: number = 200
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // ## サマリー セクションを抽出
  const summaryPattern = /^##\s+サマリー\s*$/mi;
  const match = summaryPattern.exec(content);

  if (!match) {
    // サマリーセクションがない場合は検証をスキップ
    return { valid: true, errors: [] };
  }

  // サマリーセクションの開始位置
  const summaryStartIndex = match.index + match[0].length;

  // 次のセクション（## で始まる行）までを抽出
  const afterSummary = content.substring(summaryStartIndex);
  const nextSectionPattern = /^##\s+/m;
  const nextSectionMatch = nextSectionPattern.exec(afterSummary);

  let summaryContent: string;
  if (nextSectionMatch) {
    summaryContent = afterSummary.substring(0, nextSectionMatch.index);
  } else {
    summaryContent = afterSummary;
  }

  // サマリーセクションの行数をカウント（空白行を除く）
  const summaryLines = summaryContent.split('\n').filter(line => line.trim().length > 0);
  const lineCount = summaryLines.length;

  if (lineCount > maxLines) {
    errors.push(
      `サマリーセクションの行数が制限を超えています（${lineCount}行 > ${maxLines}行）`
    );
  }

  return { valid: errors.length === 0, errors };
}

// CRITICAL-1: semantic-checker.ts に移行済み
export { validateSemanticConsistency, SemanticConsistencyResult } from './semantic-checker.js';

/**
 * テストファイルの品質を検証する
 * @param content テストファイルの内容
 * @param filePath テストファイルのパス
 * @returns 検証結果
 */
export function validateTestFileQuality(content: string, filePath: string): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 拡張子チェック
  const validExtensions = ['.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx'];
  const hasValidExtension = validExtensions.some(ext => filePath.endsWith(ext));
  if (!hasValidExtension) {
    errors.push(`テストファイルの拡張子が不正です: ${filePath} (期待: ${validExtensions.join(', ')})`);
  }

  // アサーション存在チェック
  const assertionPatterns = [/\bexpect\s*\(/, /\bassert\s*\(/, /\bassert\./];
  const hasAssertions = assertionPatterns.some(pattern => pattern.test(content));
  if (!hasAssertions) {
    errors.push('テストファイルにアサーション（expect/assert）が見つかりません');
  }

  // テストケース数チェック
  const testCasePatterns = [/\bit\s*\(/, /\btest\s*\(/, /\bdescribe\s*\(/];
  const testCaseCount = testCasePatterns.reduce((count, pattern) => {
    const matches = content.match(new RegExp(pattern.source, 'g'));
    return count + (matches ? matches.length : 0);
  }, 0);

  if (testCaseCount === 0) {
    errors.push('テストファイルにテストケース（it/test/describe）が見つかりません');
  } else if (testCaseCount < 3) {
    warnings.push(`テストケース数が少ない可能性があります (検出: ${testCaseCount})`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// P0-2: キーワードトレーサビリティ検証
// ============================================================================

/** ソースフェーズからファイル名へのマッピング */
const SOURCE_PHASE_FILES: Record<string, string> = {
  requirements: 'requirements.md',
  spec: 'spec.md',
  'test-design': 'test-design.md',
};

/** ターゲットフェーズからファイル名へのマッピング */
const TARGET_PHASE_FILES: Record<string, string> = {
  spec: 'spec.md',
  'test-design': 'test-design.md',
};

/** 英語ストップワード */
const ENGLISH_STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'to', 'in', 'for', 'and', 'or', 'but', 'is', 'are',
  'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'shall', 'can', 'need',
  'not', 'no', 'nor', 'at', 'by', 'from', 'with', 'as', 'on', 'it', 'its',
  'this', 'that', 'these', 'those', 'which', 'what', 'who', 'whom', 'whose',
  'where', 'when', 'why', 'how', 'all', 'each', 'every', 'both', 'few',
  'more', 'most', 'other', 'some', 'such', 'than', 'too', 'very',
  'if', 'then', 'else', 'so', 'because', 'although', 'while', 'until',
  'about', 'above', 'after', 'before', 'between', 'into', 'through',
  'during', 'without', 'also', 'just', 'only', 'own', 'same',
]);

/** 日本語ストップワード */
const JAPANESE_STOP_WORDS = new Set([
  'こと', 'もの', 'ため', 'よう', 'さ', 'の', 'は', 'が', 'を', 'に',
  'で', 'と', 'も', 'な', 'し', 'する', 'ある', 'いる', 'なる', 'れる',
  'できる', 'この', 'その', 'あの', 'それ', 'これ', 'あれ', 'など',
  'また', 'および', 'または', 'ただし', 'なお', 'すなわち',
]);

/**
 * テキストからキーワードを抽出する
 *
 * Markdown装飾を除去し、技術用語・名詞句を抽出する。
 * 大文字で始まる単語、ハイフン結合語、カタカナ語、漢字2文字以上を対象とする。
 * ストップワード（助詞・助動詞等）は除外して、有意義なキーワードのみを抽出。
 *
 * @param text ソーステキスト
 * @returns 重複排除・正規化されたキーワード配列
 */
function extractKeywords(text: string): string[] {
  // Remove markdown formatting
  let cleaned = text
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
    .replace(/\*([^*]+)\*/g, '$1') // italic
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/```[\s\S]*?```/g, '') // code blocks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/^\s*[-*+]\s+/gm, '') // list markers
    .replace(/^\s*\d+\.\s+/gm, '') // ordered list markers
    .replace(/\|/g, ' ') // table separators
    .replace(/---+/g, '') // horizontal rules
    .replace(/^\s*>/gm, ''); // blockquotes

  const keywords = new Set<string>();

  // Extract English technical terms (PascalCase, camelCase, UPPER_CASE, hyphenated)
  const englishTerms = cleaned.match(/[A-Z][a-zA-Z]+(?:[A-Z][a-zA-Z]+)*/g) || [];
  for (const term of englishTerms) {
    const lower = term.toLowerCase();
    if (!ENGLISH_STOP_WORDS.has(lower) && lower.length >= 3) {
      keywords.add(lower);
    }
  }

  // Extract hyphenated terms
  const hyphenated = cleaned.match(/[a-zA-Z]+-[a-zA-Z]+(?:-[a-zA-Z]+)*/g) || [];
  for (const term of hyphenated) {
    const lower = term.toLowerCase();
    if (lower.length >= 5) {
      keywords.add(lower);
    }
  }

  // Extract UPPER_CASE identifiers
  const upperCase = cleaned.match(/[A-Z]{2,}(?:_[A-Z]{2,})*/g) || [];
  for (const term of upperCase) {
    const lower = term.toLowerCase();
    if (!ENGLISH_STOP_WORDS.has(lower) && lower.length >= 3) {
      keywords.add(lower);
    }
  }

  // Extract katakana words (3+ chars)
  const katakana = cleaned.match(/[\u30A0-\u30FF]{3,}/g) || [];
  for (const term of katakana) {
    if (!JAPANESE_STOP_WORDS.has(term)) {
      keywords.add(term);
    }
  }

  // Extract kanji words (2+ chars)
  const kanji = cleaned.match(/[\u4E00-\u9FFF]{2,}/g) || [];
  for (const term of kanji) {
    if (!JAPANESE_STOP_WORDS.has(term)) {
      keywords.add(term);
    }
  }

  return Array.from(keywords);
}

/**
 * キーワードトレーサビリティ検証
 *
 * 要件定義から実装までのキーワードトレーサビリティを検証する。
 *
 * @param docsDir ドキュメントディレクトリパス
 * @param sourcePhase トレース元フェーズ名 (requirements, spec, test-design)
 * @param targetPhase トレース先フェーズ名 (spec, test-design, implementation)
 * @param minCoverage 最小カバレッジ閾値 (デフォルト: 0.8)
 * @returns キーワードトレーサビリティ結果
 */
export function validateKeywordTraceability(
  docsDir: string,
  sourcePhase: string,
  targetPhase: string,
  minCoverage: number = 0.8
): { passed: boolean; coverage: number; missingKeywords: string[]; errors: string[]; warnings?: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Resolve source file
  const sourceFileName = SOURCE_PHASE_FILES[sourcePhase];
  if (!sourceFileName) {
    return { passed: false, coverage: 0, missingKeywords: [], errors: [`不正なソースフェーズ: ${sourcePhase}`] };
  }
  const sourceFilePath = path.join(docsDir, sourceFileName);
  if (!fs.existsSync(sourceFilePath)) {
    return { passed: false, coverage: 0, missingKeywords: [], errors: [`ソースファイルが見つかりません: ${sourceFilePath}`] };
  }

  // Read source
  let sourceText: string;
  try {
    sourceText = fs.readFileSync(sourceFilePath, 'utf-8');
  } catch (e) {
    return { passed: false, coverage: 0, missingKeywords: [], errors: [`ソースファイルの読み込みに失敗: ${e instanceof Error ? e.message : String(e)}`] };
  }

  // Extract keywords
  const keywords = extractKeywords(sourceText);
  if (keywords.length === 0) {
    return { passed: true, coverage: 1.0, missingKeywords: [], errors: [], warnings: ['ソースドキュメントからキーワードが抽出できませんでした'] };
  }

  // Resolve target file(s)
  let targetText = '';
  const targetFileName = TARGET_PHASE_FILES[targetPhase];
  if (targetFileName) {
    const targetFilePath = path.join(docsDir, targetFileName);
    if (!fs.existsSync(targetFilePath)) {
      return { passed: false, coverage: 0, missingKeywords: keywords, errors: [`ターゲットファイルが見つかりません: ${targetFilePath}`] };
    }
    try {
      targetText = fs.readFileSync(targetFilePath, 'utf-8');
    } catch (e) {
      return { passed: false, coverage: 0, missingKeywords: keywords, errors: [`ターゲットファイルの読み込みに失敗: ${e instanceof Error ? e.message : String(e)}`] };
    }
  } else if (targetPhase === 'implementation') {
    // For implementation, we just pass - actual code files would need scope info
    // This is a simplified version that checks if target docs exist
    warnings.push('implementation対象のコードスキャンはスコープ情報が必要なため省略されました');
    return { passed: true, coverage: 1.0, missingKeywords: [], errors: [], warnings };
  } else {
    return { passed: false, coverage: 0, missingKeywords: [], errors: [`不正なターゲットフェーズ: ${targetPhase}`] };
  }

  // Check coverage
  const targetLower = targetText.toLowerCase();
  const foundKeywords: string[] = [];
  const missingKeywords: string[] = [];

  for (const keyword of keywords) {
    if (targetLower.includes(keyword.toLowerCase())) {
      foundKeywords.push(keyword);
    } else {
      missingKeywords.push(keyword);
    }
  }

  const coverage = foundKeywords.length / keywords.length;

  // Check threshold
  const isStrict = process.env.SEMANTIC_TRACE_STRICT !== 'false';
  if (coverage < minCoverage) {
    if (isStrict) {
      errors.push(`キーワードカバレッジが閾値未満です: ${(coverage * 100).toFixed(1)}% < ${(minCoverage * 100).toFixed(1)}%`);
      return { passed: false, coverage, missingKeywords, errors, warnings };
    } else {
      warnings.push(`キーワードカバレッジが低い: ${(coverage * 100).toFixed(1)}% (閾値: ${(minCoverage * 100).toFixed(1)}%)`);
      return { passed: true, coverage, missingKeywords, errors: [], warnings };
    }
  }

  return { passed: true, coverage, missingKeywords, errors: [], warnings };
}

// ============================================================================
// GlobalRulesエクスポート関数
// ============================================================================

/**
 * GlobalRules型をエクスポートする
 *
 * artifact-validator.ts内の品質ルール定数をGlobalRules型に集約してエクスポート。
 * subagentプロンプト自動生成（buildPrompt）で使用される。
 * definitions.tsでモジュールロード時に1回だけ呼び出してGLOBAL_RULES_CACHEにキャッシュ。
 * バリデーションロジックは変更しない（ラッパー関数）。
 *
 * @returns 品質ルール定数をまとめたGlobalRulesインスタンス
 */
export function exportGlobalRules(): import('../state/types.js').GlobalRules {
  // 環境変数から値を安全に読み込む（パースエラー時はデフォルト値にフォールバック）
  let minSectionDensity = 0.3;
  try {
    const rawDensity = parseFloat(process.env.MIN_SECTION_DENSITY || '0.3');
    if (!isNaN(rawDensity) && rawDensity >= 0.1 && rawDensity <= 1.0) {
      minSectionDensity = rawDensity;
    }
  } catch {
    // フォールバック値を使用
  }

  let maxSummaryLines = 200;
  try {
    const rawMax = parseInt(process.env.MAX_SUMMARY_LINES || '200', 10);
    if (!isNaN(rawMax) && rawMax > 0) {
      maxSummaryLines = rawMax;
    }
  } catch {
    // フォールバック値を使用
  }

  let validationTimeoutMs = 10000;
  try {
    const rawTimeout = parseInt(process.env.VALIDATION_TIMEOUT_MS || '10000', 10);
    if (!isNaN(rawTimeout) && rawTimeout > 0) {
      validationTimeoutMs = rawTimeout;
    }
  } catch {
    // フォールバック値を使用
  }

  return {
    forbiddenPatterns: [
      'TODO', 'TBD', 'WIP', 'FIXME',
      '未定', '未確定', '要検討', '検討中',
      '対応予定', 'サンプル', 'ダミー', '仮置き',
    ],
    bracketPlaceholderRegex: /\[(?!関連|参考|注|例|出典)[^\]]{1,50}\]/g,
    bracketPlaceholderInfo: {
      pattern: '\\[(?!関連|参考|注|例|出典)[^\\]]{1,50}\\]',
      allowedKeywords: ['関連', '参考', '注', '例', '出典'],
      maxLength: 50,
    },
    duplicateLineThreshold: 3,
    duplicateExclusionPatterns: {
      headers: '^#+\\s',
      horizontalRules: '^[-*_]{3,}$',
      codeFences: '^```',
      tableSeparators: '^\\s*\\|[\\s:-]+(\\|[\\s:-]+)*\\|\\s*$',
      tableDataRows: '^\\s*\\|.+\\|.+\\|\\s*$',
      boldLabels: '^\\*\\*[^*]+\\*\\*[:：]?\\s*$',
      listBoldLabels: '^[-*]\\s+\\*\\*[^*]+\\*\\*[:：]?\\s*$',
      plainLabels: '^[-*]\\s+.{1,50}[:：]\\s*$',
    },
    minSectionDensity,
    minSectionLines: 5,
    maxSummaryLines,
    shortLineMinLength: 10,
    shortLineMaxRatio: 0.5,
    minNonHeaderLines: 5,
    mermaidMinStates: 3,
    mermaidMinTransitions: 2,
    testFileRules: {
      assertionPatterns: ['expect(', 'assert(', 'assert.'],
      testCasePatterns: ['it(', 'test(', 'describe('],
      minCount: 1,
    },
    traceabilityThreshold: 0.8,
    codePathRequired: {
      targetFiles: ['spec.md'],
      requiredPaths: ['src/', 'tests/'],
    },
    validationTimeoutMs,
  };
}
