/**
 * 成果物品質検証モジュール
 * @spec docs/workflows/ワークフロー全問題完全解決/spec.md REQ-3
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * 成果物の品質要件
 */
export interface ArtifactRequirement {
  minLines: number;
  requiredSections: string[];
}

/**
 * 成果物の検証結果
 */
export interface ArtifactValidationResult {
  passed: boolean;
  errors: string[];
}

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
  // 区切り線: ---、***、___（3文字以上の繰り返し）
  if (/^[-*_]{3,}$/.test(trimmed)) return true;
  // コードフェンス: ```で始まる行
  if (trimmed.startsWith('```')) return true;
  // テーブルセパレータ行: |で始まりハイフン・コロンのみを含む（例: |---|---|）
  if (/^\|[\s\-:|]+\|$/.test(trimmed)) return true;
  // REQ-D2: テーブルデータ行: |で囲まれた行（パイプ区切りの行全て）
  if (/^\|.*\|$/.test(trimmed)) return true;
  // Markdownラベルパターン: **太字**: のような構造ラベル
  if (/^\*\*[^*]+\*\*[:：]?\s*$/.test(trimmed)) return true;
  // リスト先頭のMarkdownラベル: - **太字**: のような構造ラベル
  if (/^[-*]\s+\*\*[^*]+\*\*[:：]?\s*$/.test(trimmed)) return true;
  return false;
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
    requiredSections: ['## 調査結果', '## 既存実装の分析'],
  },
  'requirements.md': {
    minLines: 30,
    requiredSections: ['## 背景', '## 機能要件', '## 受入条件'],
  },
  'spec.md': {
    minLines: 50,
    requiredSections: ['## 概要', '## 実装計画', '## 変更対象ファイル'],
  },
  'test-design.md': {
    minLines: 30,
    requiredSections: ['## テストケース', '## テスト計画'],
  },
  'threat-model.md': {
    minLines: 20,
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

};

/**
 * 成果物の品質を検証する
 *
 * 検証項目:
 * 1. ファイル存在チェック
 * 2. 空ファイルチェック（0バイト）
 * 3. 最小行数チェック（空白行を除外）
 * 4. 必須セクションチェック
 * 5. 禁止パターン検出（TODO, TBD, WIP, FIXME）
 * 6. ダミーテキスト検出（同一行の3回以上繰り返し）
 * 7. ヘッダーのみ検出（.mdの場合、非ヘッダー行5行未満）
 * 8. Mermaid図のキーワードチェック（.mmdの場合）
 *
 * @param filePath 検証対象ファイルパス
 * @param requirements 品質要件
 * @returns 検証結果
 */
export function validateArtifactQuality(
  filePath: string,
  requirements: ArtifactRequirement
): ArtifactValidationResult {
  const errors: string[] = [];
  const fileName = path.basename(filePath);

  // 1. ファイル存在チェック
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

  // 5. 必須セクションチェック
  const missingSections = requirements.requiredSections.filter(
    section => !content.includes(section)
  );
  if (missingSections.length > 0) {
    errors.push(
      `${fileName} に必須セクションがありません: ${missingSections.join(', ')}`
    );
  }

  // 6. 禁止パターンチェック（TODO, TBD, WIP, FIXME）
  const forbiddenPatterns = ['TODO', 'TBD', 'WIP', 'FIXME'];
  const foundForbidden = forbiddenPatterns.filter(pattern =>
    content.includes(pattern)
  );
  if (foundForbidden.length > 0) {
    errors.push(
      `${fileName} に禁止パターンが含まれています: ${foundForbidden.join(', ')}`
    );
  }

  // 7. ダミーテキスト検出（同一行の3回以上繰り返し）
  // コードフェンス内の行は除外する（コード例は構文上の繰り返しが自然に発生する）
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
  if (fileName === 'spec.md') {
    const codePathResult = checkCodePathReferences(content);
    if (!codePathResult.valid) {
      errors.push(...codePathResult.errors);
    }
  }

  return {
    passed: errors.length === 0,
    errors,
  };
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
 * FR-7: セクション密度の検証
 *
 * 各 ## セクションが最低限の実質的な内容を持っているか検証する。
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

    // 実質的な行をカウント（空白行、ヘッダー、構造要素を除く）
    const substantiveLines = lines.slice(1).filter(line => {
      const trimmed = line.trim();

      // コードブロックの開始/終了を追跡
      if (trimmed.startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        return false; // コードフェンス自体は構造要素
      }

      // コードブロック内の行は構造要素として除外
      if (inCodeBlock) return false;

      if (trimmed.length === 0) return false;
      if (trimmed.startsWith('#')) return false;
      if (isStructuralLine(trimmed)) return false;
      return true;
    });

    if (substantiveLines.length < minSubstantiveLines) {
      errors.push(
        `セクション「${sectionName}」の実質行数が不足（${substantiveLines.length}行 < ${minSubstantiveLines}行）`
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

  // 必須セクションチェック
  const missingSections = requirements.requiredSections.filter(
    section => !content.includes(section)
  );

  if (missingSections.length > 0) {
    errors.push(
      `${fileName} に必須セクションがありません: ${missingSections.join(', ')}`
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
 * REQ-B2: 意味的整合性検証結果
 */
export interface SemanticConsistencyResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * REQ-B2: 日本語ストップワード辞書
 */
const STOP_WORDS = [
  'こと', 'ため', 'もの', 'これ', 'それ', 'あれ', 'この', 'その', 'あの',
  'の', 'は', 'が', 'を', 'に', 'で', 'と', 'から', 'まで', 'など',
  'する', 'ある', 'いる', 'なる', 'できる', 'れる', 'られる',
  'です', 'ます', 'である', 'ない', 'ください', 'ため', 'よう',
];

/**
 * REQ-B2: requirements.mdからキーワードを抽出
 *
 * @param requirementsContent - requirements.mdの内容
 * @returns 抽出されたキーワードのセット
 */
function extractRequirementKeywords(requirementsContent: string): Set<string> {
  const keywords = new Set<string>();

  // REQ-*セクションを抽出
  const reqSectionPattern = /^###\s+(REQ-[A-Z0-9]+).*?(?=^###|$)/gms;
  const matches = requirementsContent.matchAll(reqSectionPattern);

  for (const match of matches) {
    const sectionText = match[0];

    // 3文字以上の単語を抽出（名詞・動詞・形容詞相当）
    // ひらがな・カタカナ・漢字・英数字の組み合わせ
    const wordPattern = /[\u4e00-\u9faf\u3040-\u309f\u30a0-\u30ffa-zA-Z0-9]{3,}/g;
    const words = sectionText.match(wordPattern) || [];

    for (const word of words) {
      // ストップワード除外
      if (!STOP_WORDS.includes(word)) {
        keywords.add(word);
      }
    }
  }

  return keywords;
}

/**
 * REQ-B2: 意味的整合性チェック
 *
 * requirements.mdのキーワードが後続フェーズの成果物（spec.md, test-design.md, threat-model.md）
 * に適切に含まれているか検証する。
 *
 * @param workflowDir - ワークフロー成果物ディレクトリ
 * @returns 検証結果
 */
export function validateSemanticConsistency(
  workflowDir: string
): SemanticConsistencyResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ファイルパス
  const requirementsPath = path.join(workflowDir, 'requirements.md');
  const specPath = path.join(workflowDir, 'spec.md');
  const testDesignPath = path.join(workflowDir, 'test-design.md');
  const threatModelPath = path.join(workflowDir, 'threat-model.md');

  // requirements.md が存在しない場合はスキップ
  if (!fs.existsSync(requirementsPath)) {
    return { valid: true, errors: [], warnings: [] };
  }

  // requirements.md からキーワード抽出
  const requirementsContent = fs.readFileSync(requirementsPath, 'utf-8');
  const keywords = extractRequirementKeywords(requirementsContent);

  // キーワードが0件の場合はスキップ
  if (keywords.size === 0) {
    return { valid: true, errors: [], warnings: [] };
  }

  // 上位20個のキーワードを対象（頻度順ではなく、抽出順の最初20個）
  const topKeywords = Array.from(keywords).slice(0, 20);

  // 後続フェーズ成果物のチェック
  const artifactsToCheck = [
    { path: specPath, name: 'spec.md' },
    { path: testDesignPath, name: 'test-design.md' },
    { path: threatModelPath, name: 'threat-model.md' },
  ];

  for (const artifact of artifactsToCheck) {
    if (!fs.existsSync(artifact.path)) {
      continue; // ファイルが存在しない場合はスキップ
    }

    const content = fs.readFileSync(artifact.path, 'utf-8');

    // 各キーワードの出現回数をカウント
    for (const keyword of topKeywords) {
      const occurrences = (content.match(new RegExp(keyword, 'g')) || []).length;

      if (occurrences <= 1) {
        warnings.push(
          `${artifact.name} でキーワード「${keyword}」の出現が少ない（${occurrences}回）`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
