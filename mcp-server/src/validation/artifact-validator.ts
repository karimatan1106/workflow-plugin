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
  const lineCountMap = new Map<string, number>();
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
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
