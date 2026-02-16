/**
 * フェーズ定義・遷移ルール
 *
 * ワークフローのフェーズ順序、並列グループ、説明、
 * 許可拡張子などを定義する。
 *
 * @spec docs/spec/features/workflow-mcp-server.md
 */

import type { PhaseName, SubPhaseName, TaskSize } from '../state/types.js';
import { DEFAULT_TASK_SIZE } from '../state/types.js';

// ============================================================================
// フェーズ順序定義
// ============================================================================

/**
 * Small: 8フェーズ（簡易ワークフロー）
 *
 * 軽微な修正・ドキュメント更新向け。設計フェーズをスキップ。
 */
export const PHASES_SMALL: PhaseName[] = [
  'research',
  'requirements',
  'parallel_analysis',
  'implementation',
  'testing',
  'commit',
  'push',
  'completed',
];

/**
 * Medium: 14フェーズ（中規模ワークフロー）
 *
 * 通常の機能追加向け。設計フェーズとTDDサイクルを含む。
 */
export const PHASES_MEDIUM: PhaseName[] = [
  'research',
  'requirements',
  'parallel_analysis',
  'parallel_design',
  'design_review',
  'test_design',
  'test_impl',
  'implementation',
  'refactoring',
  'parallel_quality',
  'testing',
  'commit',
  'push',
  'ci_verification',
  'completed',
];

/**
 * Large: 19フェーズ（全ワークフロー）
 *
 * TDD方式を採用した完全なワークフロー。
 * 調査 → 要件定義 → 設計 → テスト → 実装 → 品質チェック → リグレッションテスト → デプロイ
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
  'regression_test',       // リグレッションテスト
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
 */
export const PHASES_BY_SIZE: Record<TaskSize, PhaseName[]> = {
  small: PHASES_SMALL,
  medium: PHASES_MEDIUM,
  large: PHASES_LARGE,
};

/**
 * サイズ別必須フェーズマップ
 *
 * タスクサイズに応じた必須フェーズ（スキップ不可）を定義。
 */
export const MANDATORY_PHASES_BY_SIZE: Record<TaskSize, PhaseName[]> = {
  small: ['research', 'requirements', 'parallel_analysis'],
  medium: ['research', 'requirements', 'parallel_analysis'],
  large: ['research', 'requirements', 'parallel_analysis', 'completed'],
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
  return size === 'small' || size === 'medium' || size === 'large';
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

/**
 * サブフェーズ依存関係定義（REQ-6）
 *
 * 各並列フェーズ内のサブフェーズ間の依存関係を定義する。
 * キーはサブフェーズ名、値は依存するサブフェーズ名の配列。
 *
 * 例: { flowchart: ['state_machine'] } は、
 * flowchartを完了するにはstate_machineが先に完了している必要があることを示す。
 */
export const SUB_PHASE_DEPENDENCIES: Record<string, Partial<Record<SubPhaseName, SubPhaseName[]>>> = {
  parallel_design: {
    state_machine: [], // 依存なし（最初に実行可能）
    flowchart: ['state_machine'], // state_machine完了後に実行可能
    ui_design: ['state_machine', 'flowchart'], // state_machine, flowchart完了後に実行可能
  },
  parallel_analysis: {
    threat_modeling: [], // 依存なし
    planning: ['threat_modeling'], // REQ-B3: threat_modeling完了後に実行（技術的に強制）
  },
  parallel_quality: {
    build_check: [], // 依存なし
    code_review: [], // 依存なし（独立実行可）
  },
  parallel_verification: {
    manual_test: [], // 依存なし
    security_scan: [], // 依存なし
    performance_test: [], // 依存なし
    e2e_test: [], // 依存なし（全て独立実行可）
  },
};

/**
 * サブフェーズの依存関係を取得
 *
 * @param parentPhase 並列フェーズ名
 * @param subPhase サブフェーズ名
 * @returns 依存するサブフェーズの配列
 */
export function getSubPhaseDependencies(parentPhase: string, subPhase: string): string[] {
  const deps = SUB_PHASE_DEPENDENCIES[parentPhase];
  if (!deps) return [];
  return deps[subPhase as SubPhaseName] || [];
}

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
  regression_test: 'リグレッションテストフェーズ - 既存機能の回帰テストを実行',
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
  regression_test: '.md .test.ts .test.tsx .spec.ts .spec.tsx',
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
export const REVIEW_PHASES: (PhaseName | SubPhaseName)[] = ['requirements', 'design_review', 'test_design', 'code_review'];

/**
 * 承認タイプとフェーズのマッピング
 *
 * 承認タイプ（'design'など）をキーとし、
 * その承認が有効なフェーズと遷移先フェーズを値として保持する。
 */
export const APPROVE_TYPE_MAPPING: Record<string, { expectedPhase: PhaseName; nextPhase: PhaseName }> = {
  requirements: { expectedPhase: 'requirements', nextPhase: 'parallel_analysis' },
  design: { expectedPhase: 'design_review', nextPhase: 'test_design' },
  test_design: { expectedPhase: 'test_design', nextPhase: 'test_impl' },
  code_review: { expectedPhase: 'parallel_quality', nextPhase: 'testing' },
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
export function requiresApproval(phase: PhaseName | SubPhaseName): boolean {
  return REVIEW_PHASES.includes(phase);
}

/**
 * 拡張子文字列をセットに変換（スペース区切り）
 *
 * @param extensionStr 拡張子文字列（スペース区切り）
 * @returns 拡張子セット
 */
function parseExtensions(extensionStr: string): Set<string> {
  return new Set(extensionStr.split(' ').filter(Boolean));
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
    parseExtensions(ext).forEach(e => allExtensions.add(e));
  }
  return Array.from(allExtensions).sort().join(' ');
}

// ============================================================================
// REQ-B4/D-1: スキップ不可フェーズ定義
// ============================================================================

/**
 * スキップ不可フェーズ
 *
 * これらのフェーズはユーザーが --skip-phases で指定してもスキップできない。
 * research: 調査は必須（品質の基盤）
 * requirements: 要件定義は必須（スコープの明確化）
 * planning: 設計は必須（技術的方針の決定）
 * completed: 完了状態は遷移先であり、スキップの対象外
 */
export const MANDATORY_PHASES: PhaseName[] = ['research', 'requirements', 'parallel_analysis', 'completed'];

/**
 * 最大スキップ数（全19フェーズの50%）
 */
export const MAX_SKIP_COUNT = Math.floor(PHASES_LARGE.length * 0.5);

// ============================================================================
// REQ-C3: 動的フェーズスキップ機構
// ============================================================================

/**
 * タスクスコープからスキップ対象フェーズを判定
 *
 * ファイル拡張子を分析し、コードファイルやテストファイルの有無から
 * スキップ可能なフェーズを決定する。
 *
 * @param scope タスクスコープ（affectedFiles配列）
 * @returns スキップすべきフェーズとその理由のマップ
 */
// REQ-FIX-2: userIntentキーワードによるスキップオーバーライド
// @spec docs/workflows/レビュ-指摘6件の根本原因修正/spec.md
const TEST_KEYWORDS = ['テスト', 'test', '試験', 'testing'];
const IMPL_KEYWORDS = ['実装', 'implementation', 'implement', '開発'];

export function calculatePhaseSkips(
  scope: { affectedFiles?: string[]; files?: string[] },
  userIntent?: string
): Record<string, string> {
  const files = scope.affectedFiles || scope.files || [];
  const phaseSkipReasons: Record<string, string> = {};

  // ファイルが空の場合はスキップ判定しない
  if (files.length === 0) {
    return phaseSkipReasons;
  }

  // コードファイルの拡張子
  const codeExtensions = ['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'cpp', 'c', 'go', 'rs'];
  // テストファイルのパターン
  const testPatterns = /\.(test|spec)\.(ts|tsx|js|jsx)$/;
  // ドキュメントファイルの拡張子
  const docExtensions = ['md', 'mdx', 'txt'];

  const hasCodeFiles = files.some(f => {
    const ext = f.split('.').pop() || '';
    return codeExtensions.includes(ext) && !testPatterns.test(f);
  });
  const hasTestFiles = files.some(f => testPatterns.test(f));

  // コードファイルがない場合
  if (!hasCodeFiles) {
    phaseSkipReasons['implementation'] = 'コードファイルが影響範囲に含まれないため';
    phaseSkipReasons['refactoring'] = 'コードファイルが影響範囲に含まれないため';
  }

  // テストファイルがない場合
  if (!hasTestFiles) {
    phaseSkipReasons['test_impl'] = 'テストファイルが影響範囲に含まれないため';
  }

  // コードファイルもテストファイルもない場合
  if (!hasCodeFiles && !hasTestFiles) {
    phaseSkipReasons['testing'] = 'テスト対象ファイルが影響範囲に含まれないため';
    phaseSkipReasons['regression_test'] = 'テスト対象ファイルが影響範囲に含まれないため';
  }

  // REQ-FIX-2: userIntentによるスキップオーバーライド
  // ユーザーの明示指示はスコープベースの判定より優先される
  if (userIntent) {
    const intentLower = userIntent.toLowerCase();
    if (TEST_KEYWORDS.some(kw => intentLower.includes(kw.toLowerCase()))) {
      delete phaseSkipReasons['test_impl'];
      delete phaseSkipReasons['testing'];
      delete phaseSkipReasons['regression_test'];
    }
    if (IMPL_KEYWORDS.some(kw => intentLower.includes(kw.toLowerCase()))) {
      delete phaseSkipReasons['implementation'];
      delete phaseSkipReasons['refactoring'];
    }
  }

  return phaseSkipReasons;
}

// ============================================================================
// フェーズガイド定義
// ============================================================================

import type { PhaseGuide } from '../state/types.js';

/**
 * 全フェーズのガイド情報マスター定義
 * Orchestratorへの構造化情報提供用
 */
export const PHASE_GUIDES: Partial<Record<string, PhaseGuide>> = {
  research: {
    phaseName: 'research',
    description: '調査フェーズ - 要件分析・既存コード調査',
    requiredSections: ['## サマリー', '## 調査結果', '## 既存実装の分析'],
    outputFile: '{docsDir}/research.md',
    allowedBashCategories: ['readonly'],
    editableFileTypes: ['.md'],
    minLines: 50,
    subagentType: 'general-purpose',
    model: 'haiku',
  },
  requirements: {
    phaseName: 'requirements',
    description: '要件定義フェーズ - 機能要件・非機能要件・受け入れ基準の定義',
    requiredSections: ['## サマリー', '## 機能要件', '## 非機能要件'],
    outputFile: '{docsDir}/requirements.md',
    inputFiles: ['{docsDir}/research.md'],
    allowedBashCategories: ['readonly'],
    editableFileTypes: ['.md'],
    minLines: 50,
    subagentType: 'general-purpose',
    model: 'sonnet',
  },
  parallel_analysis: {
    phaseName: 'parallel_analysis',
    description: '並列分析フェーズ - 脅威モデリング + 設計を並列実行',
    subPhases: {
      threat_modeling: {
        phaseName: 'threat_modeling',
        description: '脅威モデリング - セキュリティ脅威の特定・対策検討',
        requiredSections: ['## サマリー', '## 脅威シナリオ', '## リスク評価', '## セキュリティ要件'],
        outputFile: '{docsDir}/threat-model.md',
        inputFiles: ['{docsDir}/requirements.md'],
        allowedBashCategories: ['readonly'],
        editableFileTypes: ['.md'],
        minLines: 50,
        subagentType: 'general-purpose',
        model: 'sonnet',
      },
      planning: {
        phaseName: 'planning',
        description: '設計フェーズ - 仕様書作成',
        requiredSections: ['## サマリー', '## 概要', '## 実装計画', '## 変更対象ファイル'],
        outputFile: '{docsDir}/spec.md',
        inputFiles: ['{docsDir}/requirements.md'],
        allowedBashCategories: ['readonly'],
        editableFileTypes: ['.md'],
        minLines: 50,
        subagentType: 'general-purpose',
        model: 'sonnet',
      },
    },
  },
  parallel_design: {
    phaseName: 'parallel_design',
    description: '並列設計フェーズ - ステートマシン + フローチャート + UI設計を並列実行',
    subPhases: {
      state_machine: {
        phaseName: 'state_machine',
        description: 'ステートマシン図作成 - UI・状態遷移の設計',
        outputFile: '{docsDir}/state-machine.mmd',
        inputFiles: ['{docsDir}/spec.md'],
        allowedBashCategories: ['readonly'],
        editableFileTypes: ['.md', '.mmd'],
        minLines: 15,
        subagentType: 'general-purpose',
        model: 'haiku',
      },
      flowchart: {
        phaseName: 'flowchart',
        description: 'フローチャート作成 - 処理フロー・ロジックの設計',
        outputFile: '{docsDir}/flowchart.mmd',
        inputFiles: ['{docsDir}/spec.md'],
        allowedBashCategories: ['readonly'],
        editableFileTypes: ['.md', '.mmd'],
        minLines: 15,
        subagentType: 'general-purpose',
        model: 'haiku',
      },
      ui_design: {
        phaseName: 'ui_design',
        description: 'UI設計 - レイアウト・状態遷移・操作フロー設計',
        requiredSections: ['## サマリー', '## CLIインターフェース設計', '## エラーメッセージ設計', '## APIレスポンス設計', '## 設定ファイル設計'],
        outputFile: '{docsDir}/ui-design.md',
        inputFiles: ['{docsDir}/spec.md'],
        allowedBashCategories: ['readonly'],
        editableFileTypes: ['.md', '.mmd'],
        minLines: 50,
        subagentType: 'general-purpose',
        model: 'sonnet',
      },
    },
  },
  design_review: {
    phaseName: 'design_review',
    description: '設計レビュー - AIによる技術レビュー + ユーザー承認',
    allowedBashCategories: ['readonly'],
    editableFileTypes: ['.md'],
    subagentType: 'general-purpose',
    model: 'sonnet',
  },
  test_design: {
    phaseName: 'test_design',
    description: 'テスト設計フェーズ',
    requiredSections: ['## サマリー', '## テスト方針', '## テストケース'],
    outputFile: '{docsDir}/test-design.md',
    inputFiles: ['{docsDir}/spec.md', '{docsDir}/state-machine.mmd', '{docsDir}/flowchart.mmd'],
    allowedBashCategories: ['readonly'],
    editableFileTypes: ['.md'],
    minLines: 50,
    subagentType: 'general-purpose',
    model: 'sonnet',
  },
  test_impl: {
    phaseName: 'test_impl',
    description: 'テスト実装フェーズ（TDD Red） - テストコード先行作成',
    inputFiles: ['{docsDir}/test-design.md'],
    allowedBashCategories: ['readonly', 'testing'],
    editableFileTypes: ['.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx', '.md'],
    subagentType: 'general-purpose',
    model: 'sonnet',
  },
  implementation: {
    phaseName: 'implementation',
    description: '実装フェーズ（TDD Green） - テストを通す実装',
    inputFiles: ['{docsDir}/test-design.md', '{docsDir}/spec.md', '{docsDir}/requirements.md'],
    allowedBashCategories: ['readonly', 'testing', 'implementation'],
    editableFileTypes: ['*'],
    subagentType: 'general-purpose',
    model: 'sonnet',
  },
  refactoring: {
    phaseName: 'refactoring',
    description: 'リファクタリングフェーズ - コード品質改善',
    allowedBashCategories: ['readonly', 'testing', 'implementation'],
    editableFileTypes: ['*'],
    subagentType: 'general-purpose',
    model: 'haiku',
  },
  parallel_quality: {
    phaseName: 'parallel_quality',
    description: '並列品質チェック - ビルド確認 + コードレビュー',
    subPhases: {
      build_check: {
        phaseName: 'build_check',
        description: 'ビルド確認フェーズ',
        allowedBashCategories: ['readonly', 'testing', 'implementation'],
        editableFileTypes: ['*'],
        subagentType: 'general-purpose',
        model: 'haiku',
      },
      code_review: {
        phaseName: 'code_review',
        description: 'コードレビュー - AIによる実装・テストレビュー',
        requiredSections: ['## サマリー', '## 設計-実装整合性', '## コード品質', '## セキュリティ'],
        outputFile: '{docsDir}/code-review.md',
        inputFiles: ['{docsDir}/spec.md'],
        allowedBashCategories: ['readonly'],
        editableFileTypes: ['.md'],
        minLines: 30,
        subagentType: 'general-purpose',
        model: 'sonnet',
      },
    },
  },
  testing: {
    phaseName: 'testing',
    description: 'テスト実行フェーズ',
    allowedBashCategories: ['readonly', 'testing'],
    editableFileTypes: ['.md', '.test.ts', '.test.tsx'],
    subagentType: 'general-purpose',
    model: 'haiku',
  },
  regression_test: {
    phaseName: 'regression_test',
    description: 'リグレッションテストフェーズ - 既存機能の回帰テストを実行',
    allowedBashCategories: ['readonly', 'testing'],
    editableFileTypes: ['.md', '.test.ts', '.test.tsx'],
    subagentType: 'general-purpose',
    model: 'haiku',
  },
  parallel_verification: {
    phaseName: 'parallel_verification',
    description: '並列検証フェーズ',
    subPhases: {
      manual_test: {
        phaseName: 'manual_test',
        description: '手動確認フェーズ',
        requiredSections: ['## テストシナリオ', '## テスト結果'],
        outputFile: '{docsDir}/manual-test.md',
        allowedBashCategories: ['readonly'],
        editableFileTypes: ['.md'],
        minLines: 20,
        subagentType: 'general-purpose',
        model: 'haiku',
      },
      security_scan: {
        phaseName: 'security_scan',
        description: 'セキュリティスキャンフェーズ',
        requiredSections: ['## 脆弱性スキャン結果', '## 検出された問題'],
        outputFile: '{docsDir}/security-scan.md',
        allowedBashCategories: ['readonly', 'testing'],
        editableFileTypes: ['.md'],
        minLines: 20,
        subagentType: 'general-purpose',
        model: 'haiku',
      },
      performance_test: {
        phaseName: 'performance_test',
        description: 'パフォーマンステストフェーズ',
        requiredSections: ['## パフォーマンス計測結果', '## ボトルネック分析'],
        outputFile: '{docsDir}/performance-test.md',
        allowedBashCategories: ['readonly', 'testing'],
        editableFileTypes: ['.md'],
        minLines: 20,
        subagentType: 'general-purpose',
        model: 'haiku',
      },
      e2e_test: {
        phaseName: 'e2e_test',
        description: 'E2Eテストフェーズ',
        requiredSections: ['## E2Eテストシナリオ', '## テスト実行結果'],
        outputFile: '{docsDir}/e2e-test.md',
        allowedBashCategories: ['readonly', 'testing'],
        editableFileTypes: ['.md', '.test.ts', '.spec.ts'],
        minLines: 20,
        subagentType: 'general-purpose',
        model: 'haiku',
      },
    },
  },
  docs_update: {
    phaseName: 'docs_update',
    description: 'ドキュメント更新フェーズ',
    allowedBashCategories: ['readonly'],
    editableFileTypes: ['.md', '.mdx'],
    subagentType: 'general-purpose',
    model: 'haiku',
  },
  commit: {
    phaseName: 'commit',
    description: 'コミットフェーズ',
    allowedBashCategories: ['readonly', 'implementation'],
    subagentType: 'general-purpose',
    model: 'haiku',
  },
  push: {
    phaseName: 'push',
    description: 'プッシュフェーズ',
    allowedBashCategories: ['readonly', 'implementation'],
    subagentType: 'general-purpose',
    model: 'haiku',
  },
  ci_verification: {
    phaseName: 'ci_verification',
    description: 'CI検証フェーズ',
    allowedBashCategories: ['readonly'],
    editableFileTypes: ['.md'],
    subagentType: 'general-purpose',
    model: 'haiku',
  },
  deploy: {
    phaseName: 'deploy',
    description: 'デプロイフェーズ',
    allowedBashCategories: ['readonly'],
    editableFileTypes: ['.md'],
    subagentType: 'general-purpose',
    model: 'haiku',
  },
};

/**
 * フェーズガイドを取得（docsDirプレースホルダー解決付き）
 *
 * @param phase フェーズ名
 * @param docsDir ドキュメントディレクトリパス（オプション）
 * @returns フェーズガイド（見つからない場合はundefined）
 */
export function resolvePhaseGuide(phase: string, docsDir?: string): PhaseGuide | undefined {
  const guide = PHASE_GUIDES[phase];
  if (!guide) return undefined;

  // シャローコピーを作成
  const resolved = { ...guide };

  if (docsDir) {
    // outputFileのプレースホルダーを置換
    if (resolved.outputFile) {
      resolved.outputFile = resolved.outputFile.replace('{docsDir}', docsDir);
    }
    // inputFilesのプレースホルダーを置換
    if (resolved.inputFiles) {
      resolved.inputFiles = resolved.inputFiles.map(f => f.replace('{docsDir}', docsDir));
    }
    // subPhasesも再帰的に解決
    if (resolved.subPhases) {
      const resolvedSubPhases: Record<string, PhaseGuide> = {};
      for (const [key, subGuide] of Object.entries(resolved.subPhases)) {
        // サブフェーズのguideもPHASE_GUIDESから取得を試みる
        const subResolved = { ...subGuide };
        if (subResolved.outputFile) {
          subResolved.outputFile = subResolved.outputFile.replace('{docsDir}', docsDir);
        }
        if (subResolved.inputFiles) {
          subResolved.inputFiles = subResolved.inputFiles.map(f => f.replace('{docsDir}', docsDir));
        }
        resolvedSubPhases[key] = subResolved;
      }
      resolved.subPhases = resolvedSubPhases;
    }
  }

  return resolved;
}
