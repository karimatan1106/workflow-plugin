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
