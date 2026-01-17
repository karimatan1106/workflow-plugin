/**
 * フェーズ定義・遷移ルール
 *
 * ワークフローのフェーズ順序、並列グループ、説明、
 * 許可拡張子などを定義する。
 *
 * @spec docs/specs/domains/workflow/mcp-server.md
 */

import type { PhaseName, SubPhaseName, TaskSize } from '../state/types.js';
import { DEFAULT_TASK_SIZE } from '../state/types.js';

// ============================================================================
// フェーズ順序定義
// ============================================================================

/**
 * Large: 18フェーズ（全ワークフロー）
 *
 * TDD方式を採用した完全なワークフロー。
 * 調査 → 要件定義 → 設計 → テスト → 実装 → 品質チェック → デプロイ
 */
export const PHASES_LARGE: PhaseName[] = [
  'research',              // 調査
  'requirements',          // 要件定義
  'parallel_analysis',     // 並列分析（脅威モデリング + 計画）
  'parallel_design',       // 並列設計（ステートマシン + フローチャート + UI設計）
  'design_review',         // 設計レビュー（AIレビュー + ユーザー承認）
  'test_design',           // テスト設計
  'test_impl',             // テスト実装（TDD Red）
  'implementation',        // 実装（TDD Green）
  'refactoring',           // リファクタリング（TDD Refactor）
  'parallel_quality',      // 並列品質チェック
  'testing',               // テスト実行
  'parallel_verification', // 並列検証
  'docs_update',           // ドキュメント更新
  'commit',                // コミット
  'push',                  // プッシュ
  'ci_verification',       // CI検証
  'deploy',                // デプロイ
  'completed',             // 完了
];

/** 後方互換のためのエイリアス */
export const PHASES = PHASES_LARGE;

/**
 * サイズ別フェーズマップ
 *
 * タスクサイズに応じたフェーズ配列を取得するためのマップ。
 * 注: small/mediumは廃止されました。largeのみサポートします。
 */
export const PHASES_BY_SIZE: Record<TaskSize, PhaseName[]> = {
  large: PHASES_LARGE,
};

// ============================================================================
// タスクサイズ関連ユーティリティ
// ============================================================================

/**
 * 有効なタスクサイズかどうかを判定
 *
 * @param size 検証する値
 * @returns TaskSize型であればtrue
 */
export function isValidTaskSize(size: unknown): size is TaskSize {
  return size === 'large';
}

/**
 * タスクサイズのフェーズ数を取得
 *
 * @param size タスクサイズ
 * @returns フェーズ数
 */
export function getPhaseCount(size: TaskSize): number {
  return PHASES_BY_SIZE[size].length;
}

// ============================================================================
// 並列フェーズ定義
// ============================================================================

/**
 * 並列フェーズグループ定義
 *
 * 並列フェーズ名をキーとし、そのフェーズに含まれる
 * サブフェーズの配列を値として保持する。
 */
export const PARALLEL_GROUPS: Record<string, SubPhaseName[]> = {
  /** 並列分析: 脅威モデリングと計画を並列実行 */
  parallel_analysis: ['threat_modeling', 'planning'],
  /** 並列設計: ステートマシン、フローチャート、UI設計を並列実行 */
  parallel_design: ['state_machine', 'flowchart', 'ui_design'],
  /** 並列品質チェック: ビルド確認とコードレビューを並列実行 */
  parallel_quality: ['build_check', 'code_review'],
  /** 並列検証: 手動テスト、セキュリティスキャン、パフォーマンステスト、E2Eテストを並列実行 */
  parallel_verification: ['manual_test', 'security_scan', 'performance_test', 'e2e_test'],
};

// ============================================================================
// フェーズ説明
// ============================================================================

/**
 * フェーズの説明
 *
 * 各フェーズの目的と作業内容を日本語で説明する。
 */
export const PHASE_DESCRIPTIONS: Record<PhaseName, string> = {
  idle: 'アイドル状態 - タスクなし',
  research: '調査フェーズ - 要件分析・既存コード調査',
  requirements: '要件定義フェーズ - 機能要件・非機能要件・受け入れ基準の定義',
  parallel_analysis: '並列分析フェーズ - 脅威モデリング + 設計を並列実行',
  parallel_design: '並列設計フェーズ - ステートマシン + フローチャート + UI設計を並列実行',
  design_review: '設計レビュー - AIによる技術レビュー + ユーザー承認',
  test_design: 'テスト設計フェーズ',
  test_impl: 'テスト実装フェーズ（TDD Red） - テストコード先行作成',
  implementation: '実装フェーズ（TDD Green） - テストを通す実装',
  refactoring: 'リファクタリングフェーズ（TDD Refactor） - コード品質改善',
  parallel_quality: '並列品質チェックフェーズ - ビルド確認 + コードレビューを並列実行',
  testing: 'テスト実行フェーズ',
  parallel_verification: '並列検証フェーズ - 手動テスト + セキュリティスキャン + パフォーマンステスト + E2Eテストを並列実行',
  docs_update: 'ドキュメント更新フェーズ - 仕様書・READMEの更新',
  commit: 'コミットフェーズ',
  push: 'プッシュフェーズ - リモートへのプッシュ',
  ci_verification: 'CI検証フェーズ - CI/CDパイプラインの確認',
  deploy: 'デプロイフェーズ',
  completed: '完了',
};

/**
 * サブフェーズの説明
 *
 * 各サブフェーズの目的と作業内容を日本語で説明する。
 */
export const SUB_PHASE_DESCRIPTIONS: Record<SubPhaseName, string> = {
  threat_modeling: '脅威モデリングフェーズ - セキュリティ脅威の特定・対策検討',
  planning: '設計フェーズ - 仕様書作成',
  state_machine: 'ステートマシン図作成 - UI・状態遷移の設計',
  flowchart: 'フローチャート作成 - 処理フロー・ロジックの設計',
  ui_design: 'UI設計フェーズ - レイアウト・状態遷移・操作フロー設計',
  build_check: 'ビルド確認フェーズ',
  code_review: 'コードレビュー - AIによる実装・テストレビュー',
  manual_test: '手動確認フェーズ',
  security_scan: 'セキュリティスキャンフェーズ - 自動脆弱性検出',
  performance_test: 'パフォーマンステストフェーズ - 性能・負荷テスト',
  e2e_test: 'E2Eテストフェーズ - エンドツーエンドテストの実行',
};

// ============================================================================
// 許可拡張子定義
// ============================================================================

/**
 * フェーズごとの許可拡張子
 *
 * 各フェーズで編集が許可されるファイル拡張子を定義する。
 * '*' は全ての拡張子を許可、'' は編集不可を意味する。
 */
export const PHASE_EXTENSIONS: Record<PhaseName, string> = {
  idle: '',
  research: '.md .mdx .txt',
  requirements: '.md .mdx .txt',
  parallel_analysis: '.md .mdx .txt',
  parallel_design: '.md .mdx .txt .mmd',
  design_review: '.md',
  test_design: '.md .test.ts .test.tsx .spec.ts .spec.tsx',
  test_impl: '.test.ts .test.tsx .spec.ts .spec.tsx .md',
  implementation: '*',
  refactoring: '*',
  parallel_quality: '*',
  testing: '.md .test.ts .test.tsx .spec.ts .spec.tsx',
  parallel_verification: '.md',
  docs_update: '.md .mdx .txt',
  commit: '',
  push: '',
  ci_verification: '.md',
  deploy: '.md',
  completed: '',
};

/**
 * サブフェーズごとの許可拡張子
 *
 * 各サブフェーズで編集が許可されるファイル拡張子を定義する。
 */
export const SUB_PHASE_EXTENSIONS: Record<SubPhaseName, string> = {
  threat_modeling: '.md .mdx .txt',
  planning: '.md .mdx .txt',
  state_machine: '.md .mdx .txt .mmd',
  flowchart: '.md .mdx .txt .mmd',
  ui_design: '.md .mdx .txt .mmd',
  build_check: '*',
  code_review: '.md',
  manual_test: '.md',
  security_scan: '.md',
  performance_test: '.md',
  e2e_test: '.md .test.ts .test.tsx .spec.ts .spec.tsx',
};

// ============================================================================
// 承認関連定義
// ============================================================================

/**
 * ユーザー承認が必要なフェーズ
 *
 * これらのフェーズでは、workflow_approveコマンドで
 * 明示的に承認を得ないと次のフェーズに進めない。
 */
export const REVIEW_PHASES: PhaseName[] = ['design_review'];

/**
 * 承認タイプとフェーズのマッピング
 *
 * 承認タイプ（'design'など）をキーとし、
 * その承認が有効なフェーズと遷移先フェーズを値として保持する。
 */
export const APPROVE_TYPE_MAPPING: Record<string, { expectedPhase: PhaseName; nextPhase: PhaseName }> = {
  design: { expectedPhase: 'design_review', nextPhase: 'test_design' },
};

// ============================================================================
// フェーズ判定関数
// ============================================================================

/**
 * フェーズが並列フェーズかどうかを判定
 *
 * @param phase 判定するフェーズ
 * @returns 並列フェーズであればtrue
 */
export function isParallelPhase(phase: PhaseName): boolean {
  return phase in PARALLEL_GROUPS;
}

/**
 * 並列フェーズのサブフェーズを取得
 *
 * @param phase フェーズ名
 * @returns サブフェーズの配列（並列フェーズでない場合は空配列）
 */
export function getSubPhases(phase: PhaseName): SubPhaseName[] {
  return PARALLEL_GROUPS[phase] || [];
}

/**
 * フェーズのインデックスを取得
 *
 * @param phase フェーズ名
 * @param taskSize タスクサイズ
 * @returns フェーズのインデックス（見つからない場合は-1）
 */
export function getPhaseIndex(phase: PhaseName, taskSize: TaskSize = DEFAULT_TASK_SIZE): number {
  const phases = PHASES_BY_SIZE[taskSize];
  return phases.indexOf(phase);
}

/**
 * 次のフェーズを取得
 *
 * @param currentPhase 現在のフェーズ
 * @param taskSize タスクサイズ
 * @returns 次のフェーズ（末尾の場合はnull）
 */
export function getNextPhase(currentPhase: PhaseName, taskSize: TaskSize = DEFAULT_TASK_SIZE): PhaseName | null {
  const phases = PHASES_BY_SIZE[taskSize];
  const currentIndex = phases.indexOf(currentPhase);
  if (currentIndex === -1 || currentIndex >= phases.length - 1) {
    return null;
  }
  return phases[currentIndex + 1];
}

/**
 * フェーズが承認必須かどうかを判定
 *
 * @param phase 判定するフェーズ
 * @returns 承認が必要であればtrue
 */
export function requiresApproval(phase: PhaseName): boolean {
  return REVIEW_PHASES.includes(phase);
}

/**
 * 並列フェーズの許可拡張子を集約して取得
 *
 * 並列フェーズの場合、全サブフェーズの許可拡張子を
 * マージして返す。
 *
 * @param phase フェーズ名
 * @returns 許可拡張子の文字列（スペース区切り）
 */
export function getParallelPhaseExtensions(phase: PhaseName): string {
  const subPhases = getSubPhases(phase);
  if (subPhases.length === 0) {
    return PHASE_EXTENSIONS[phase];
  }

  const allExtensions = new Set<string>();
  for (const sp of subPhases) {
    const ext = SUB_PHASE_EXTENSIONS[sp];
    // '*' が含まれる場合は全て許可
    if (ext === '*') {
      return '*';
    }
    // 拡張子をセットに追加
    for (const e of ext.split(' ').filter(Boolean)) {
      allExtensions.add(e);
    }
  }
  return Array.from(allExtensions).sort().join(' ');
}
