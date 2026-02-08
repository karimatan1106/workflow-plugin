/**
 * ワークフロー状態管理の型定義
 *
 * このモジュールでは、ワークフローシステム全体で使用される
 * 型定義とインターフェースを提供する。
 *
 * @spec docs/spec/features/workflow-mcp-server.md
 */

// ============================================================================
// タスクサイズ関連
// ============================================================================

/**
 * タスクサイズ
 *
 * ワークフローのフェーズ数を決定する:
 * - large: 19フェーズ（全ワークフロー）
 *
 * 注: small/mediumは廃止されました。全てのタスクはlargeサイズで実行されます。
 */
export type TaskSize = 'large';

/** デフォルトのタスクサイズ */
export const DEFAULT_TASK_SIZE: TaskSize = 'large';

// ============================================================================
// フェーズ関連
// ============================================================================

/**
 * サブフェーズの状態
 *
 * 並列フェーズ内の各サブフェーズが取りうる状態
 */
export type SubPhaseStatus = 'pending' | 'in_progress' | 'completed';

/**
 * フェーズ名
 *
 * ワークフローの各フェーズを識別する文字列リテラル型。
 * 順序定義用として使用される。
 */
export type PhaseName =
  | 'research'            // 調査フェーズ
  | 'requirements'        // 要件定義フェーズ
  | 'parallel_analysis'   // 並列分析フェーズ（脅威モデリング + 計画）
  | 'parallel_design'     // 並列設計フェーズ（ステートマシン + フローチャート + UI設計）
  | 'design_review'       // 設計レビュー（AIレビュー + ユーザー承認）
  | 'test_design'         // テスト設計フェーズ
  | 'test_impl'           // テスト実装フェーズ（TDD Red）
  | 'implementation'      // 実装フェーズ（TDD Green）
  | 'refactoring'         // リファクタリングフェーズ（TDD Refactor）
  | 'parallel_quality'    // 並列品質チェックフェーズ
  | 'testing'             // テスト実行フェーズ
  | 'regression_test'     // リグレッションテストフェーズ
  | 'parallel_verification' // 並列検証フェーズ
  | 'docs_update'         // ドキュメント更新フェーズ
  | 'commit'              // コミットフェーズ
  | 'push'                // プッシュフェーズ
  | 'ci_verification'     // CI検証フェーズ
  | 'deploy'              // デプロイフェーズ
  | 'completed'           // 完了
  | 'idle';               // アイドル状態（タスクなし）

/**
 * サブフェーズ名
 *
 * 並列フェーズ内で並行して実行される個別のサブフェーズを識別する。
 */
export type SubPhaseName =
  | 'threat_modeling'  // 脅威モデリング
  | 'planning'         // 設計・計画
  | 'state_machine'    // ステートマシン図作成
  | 'flowchart'        // フローチャート作成
  | 'ui_design'        // UI設計
  | 'build_check'      // ビルド確認
  | 'code_review'      // コードレビュー
  | 'manual_test'      // 手動テスト
  | 'security_scan'    // セキュリティスキャン
  | 'performance_test' // パフォーマンステスト
  | 'e2e_test';        // E2Eテスト

/**
 * サブフェーズの状態マップ
 *
 * 各サブフェーズ名をキーとし、その状態を値として保持する。
 * Partialなので、存在しないサブフェーズもある。
 */
export type SubPhases = Partial<Record<SubPhaseName, SubPhaseStatus>>;

// ============================================================================
// 履歴関連
// ============================================================================

/**
 * リセット履歴エントリ
 *
 * タスクがリセットされた際の記録。
 */
export interface ResetHistoryEntry {
  /** リセット前のフェーズ */
  fromPhase: PhaseName;
  /** リセット理由 */
  reason: string;
  /** リセット日時（ISO 8601形式） */
  timestamp: string;
}

/**
 * 履歴エントリ
 *
 * フェーズ遷移やアクションの履歴を記録する。
 */
export interface HistoryEntry {
  /** フェーズ名 */
  phase: PhaseName;
  /** 実行されたアクション */
  action: string;
  /** アクション実行日時（ISO 8601形式） */
  timestamp: string;
  /** 追加の詳細情報（オプション） */
  details?: string;
}

/**
 * テストベースライン
 *
 * researchフェーズで記録する既存テストの状態。
 * regression_testフェーズでの比較に使用する。
 */
export interface TestBaseline {
  /** 記録日時（ISO 8601形式） */
  capturedAt: string;
  /** 失敗していたテスト名の配列 */
  failedTests: string[];
  /** テスト総数 */
  totalTests: number;
  /** 成功したテスト数 */
  passedTests: number;
}

/**
 * 既知バグの深刻度
 */
export type BugSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * 既知バグの対応予定
 */
export type BugTargetPhase = 'next_sprint' | 'backlog' | 'deferred';

/**
 * 既知バグ
 *
 * regression_testフェーズで記録する既存バグの情報。
 * テスト削除ではなく、バグを適切に追跡するために使用する。
 *
 * @spec docs/spec/features/known-bugs.md
 */
export interface KnownBug {
  /** バグID（自動生成: BUG-001形式） */
  bugId: string;
  /** 失敗するテスト名 */
  testName: string;
  /** バグの説明 */
  description: string;
  /** 深刻度 */
  severity: BugSeverity;
  /** 関連Issue URL（オプション） */
  issueUrl?: string;
  /** 対応予定 */
  targetPhase: BugTargetPhase;
  /** 記録日時（ISO 8601形式） */
  recordedAt: string;
}

// ============================================================================
// タスク状態
// ============================================================================

/**
 * タスク状態
 *
 * 個別タスクの状態を表現する。
 * 各タスクディレクトリ内の workflow-state.json に保存される。
 */
export interface TaskState {
  /** 現在のフェーズ */
  phase: PhaseName;
  /** タスクID（例: 20260115_123456） */
  taskId: string;
  /** タスク名（日本語可） */
  taskName: string;
  /** ワークフローディレクトリのパス（内部状態用） */
  workflowDir: string;
  /** ドキュメントディレクトリのパス（成果物配置用） */
  docsDir?: string;
  /** タスク開始日時（ISO 8601形式） */
  startedAt: string;
  /** タスク完了日時（ISO 8601形式、完了時のみ） */
  completedAt?: string;
  /** チェックリストの状態 */
  checklist: Record<string, boolean>;
  /** フェーズ遷移履歴 */
  history: HistoryEntry[];
  /** 並列フェーズのサブフェーズ状態 */
  subPhases: SubPhases;
  /** リセット履歴（リセットされた場合のみ） */
  resetHistory?: ResetHistoryEntry[];
  /** タスクサイズ */
  taskSize?: TaskSize;
  /** test_implフェーズで作成したテストファイル */
  testFiles?: string[];
  /** researchフェーズで記録したテストベースライン */
  testBaseline?: TestBaseline;
  /** regression_testフェーズで記録した既知バグ */
  knownBugs?: KnownBug[];
  /** 影響範囲（REQ-1） */
  scope?: {
    /** 影響を受けるファイルのパスリスト */
    affectedFiles: string[];
    /** 影響を受けるディレクトリのパスリスト */
    affectedDirs: string[];
  };
  /** テスト結果記録（REQ-2） */
  testResults?: Array<{
    /** 実行フェーズ */
    phase: 'testing' | 'regression_test';
    /** 終了コード（0=成功、非0=失敗） */
    exitCode: number;
    /** 実行日時（ISO 8601形式） */
    timestamp: string;
    /** サマリー（オプション） */
    summary?: string;
    /** テスト実行の出力（末尾500文字まで） */
    output?: string;
    /** パスしたテスト件数（自動抽出） */
    passedCount?: number;
    /** 失敗したテスト件数（自動抽出） */
    failedCount?: number;
  }>;
  /**
   * 状態ファイルのHMAC-SHA256署名
   * @spec docs/workflows/ワ-クフロ-プラグイン大規模対応根本改修/spec.md#REQ-2
   */
  stateIntegrity?: string;
  /**
   * セッショントークン（workflow_startで生成、フェーズ遷移APIで検証）
   * @spec docs/workflows/ワークフロー全問題完全解決/spec.md#REQ-6
   */
  sessionToken?: string;
  /** 承認フラグ（FR-9: 段階的承認ゲート） */
  approvals?: {
    requirements?: boolean;
    design?: boolean;
    test_design?: boolean;
  };
}

// ============================================================================
// ツール結果型
// ============================================================================

// 注: ActiveTask と GlobalState は削除されました。
// 並列タスク対応により、ディレクトリスキャンベースの管理に移行しました。
// @see docs/workflows/ワ-クフロ-並列タスク対応/spec.md

/**
 * ツールの基本戻り値型
 *
 * 全てのツール結果の基底インターフェース。
 */
export interface ToolResult {
  /** 操作が成功したかどうか */
  success: boolean;
  /** ユーザーへのメッセージ */
  message?: string;
  /** 追加のプロパティ（型安全性のため、具象型で上書きする） */
  [key: string]: unknown;
}

/**
 * ステータスコマンドの結果
 *
 * workflow_status ツールの戻り値。
 */
export interface StatusResult extends ToolResult {
  /** ワークフローの状態 */
  status: 'idle' | 'active' | 'error';
  /** 現在のタスクID */
  taskId?: string;
  /** 現在のタスク名 */
  taskName?: string;
  /** 現在のフェーズ */
  phase?: PhaseName;
  /** ワークフローディレクトリ（内部状態用） */
  workflowDir?: string;
  /** ドキュメントディレクトリ（成果物配置用） */
  docsDir?: string;
  /** アクティブなタスク数 */
  activeTasks?: number;
  /** 全タスクの概要リスト */
  allTasks?: Array<{ taskId: string; taskName: string; phase: PhaseName }>;
  /** 並列フェーズのサブフェーズ状態 */
  subPhases?: SubPhases;
  /** 並列フェーズかどうか */
  isParallelPhase?: boolean;
  /** タスクサイズ */
  taskSize?: TaskSize;
}

/**
 * リストコマンドの結果
 *
 * workflow_list ツールの戻り値。
 */
export interface ListResult extends ToolResult {
  /** タスク一覧 */
  tasks: Array<{
    taskId: string;
    taskName: string;
    phase: PhaseName;
    workflowDir: string;
  }>;
}

/**
 * ワークフローコンテキスト
 *
 * PostToolUseフックに渡されるコンテキスト情報。
 * 成果物チェックなどで使用される。
 */
export interface WorkflowContext {
  /** ワークフローディレクトリパス */
  workflowDir: string;
  /** 遷移先フェーズ（nextの場合）または現在フェーズ（complete_subの場合） */
  phase: PhaseName;
  /** 遷移前フェーズ */
  currentPhase: PhaseName;
  /** 完了したサブフェーズ名（complete_subの場合のみ） */
  subPhase?: SubPhaseName;
}

/**
 * 次フェーズコマンドの結果
 *
 * workflow_next ツールの戻り値。
 */
export interface NextResult extends ToolResult {
  /** 遷移前のフェーズ */
  from?: PhaseName;
  /** 遷移後のフェーズ */
  to?: PhaseName;
  /** 遷移先フェーズの説明 */
  description?: string;
  /** フック用コンテキスト */
  workflow_context?: WorkflowContext;
}

/**
 * 開始コマンドの結果
 *
 * workflow_start ツールの戻り値。
 */
export interface StartResult extends ToolResult {
  /** 作成されたタスクID */
  taskId?: string;
  /** タスク名 */
  taskName?: string;
  /** 開始フェーズ */
  phase?: PhaseName;
  /** ワークフローディレクトリ（内部状態用） */
  workflowDir?: string;
  /** ドキュメントディレクトリ（成果物配置用） */
  docsDir?: string;
  /** タスクサイズ */
  taskSize?: TaskSize;
  /** セッショントークン */
  sessionToken?: string;
}

/**
 * 承認コマンドの結果
 *
 * workflow_approve ツールの戻り値。
 */
export interface ApproveResult extends ToolResult {
  /** 承認されたタイプ */
  approved?: string;
  /** 次のフェーズ */
  nextPhase?: PhaseName;
}

/**
 * サブフェーズ完了の結果
 *
 * workflow_complete_sub ツールの戻り値。
 */
export interface CompleteSubResult extends ToolResult {
  /** 完了したサブフェーズ */
  subPhase?: SubPhaseName;
  /** 現在のフェーズ */
  phase?: PhaseName;
  /** 残りの未完了サブフェーズ */
  remaining?: SubPhaseName[];
  /** 全サブフェーズが完了したかどうか */
  allCompleted?: boolean;
  /** フック用コンテキスト */
  workflow_context?: WorkflowContext;
}

// 注: SwitchResult は削除されました。
// 並列タスク対応により、workflow_switch ツールは廃止されました。
// @see docs/workflows/ワ-クフロ-並列タスク対応/spec.md

/**
 * リセットコマンドの結果
 *
 * workflow_reset ツールの戻り値。
 */
export interface ResetResult extends ToolResult {
  /** リセットされたタスクID */
  taskId?: string;
  /** リセット前のフェーズ */
  fromPhase?: PhaseName;
  /** リセット後のフェーズ（常に 'research'） */
  toPhase?: PhaseName;
  /** リセット理由 */
  reason?: string;
}
