/**
 * ツールのエクスポート
 *
 * 全てのワークフローツールを一箇所からエクスポートする。
 *
 * @spec docs/spec/features/workflow-mcp-server.md
 */

// ============================================================================
// ツール実装のエクスポート
// ============================================================================

/** ステータス取得ツール */
export { workflowStatus, statusToolDefinition } from './status.js';

/** タスク開始ツール */
export { workflowStart, startToolDefinition } from './start.js';

/** 次フェーズ遷移ツール */
export { workflowNext, nextToolDefinition } from './next.js';

/** レビュー承認ツール */
export { workflowApprove, approveToolDefinition } from './approve.js';

/** タスクリセットツール */
export { workflowReset, resetToolDefinition } from './reset.js';

/** タスク一覧ツール */
export { workflowList, listToolDefinition } from './list.js';

/** サブフェーズ完了ツール */
export { workflowCompleteSub, completeSubToolDefinition } from './complete-sub.js';

/** テストファイル記録ツール */
export {
  workflowRecordTest,
  recordTestToolDefinition,
  workflowCaptureBaseline,
  captureBaselineToolDefinition,
  workflowGetTestInfo,
  getTestInfoToolDefinition,
} from './test-tracking.js';

// ============================================================================
// ツール定義のリスト
// ============================================================================

/**
 * 全ツール定義のリスト
 *
 * ツール名とモジュール名のマッピング。
 * 主にデバッグやドキュメント生成用。
 */
export const allToolDefinitions = [
  { name: 'workflow_status', module: 'status' },
  { name: 'workflow_start', module: 'start' },
  { name: 'workflow_next', module: 'next' },
  { name: 'workflow_approve', module: 'approve' },
  { name: 'workflow_reset', module: 'reset' },
  { name: 'workflow_list', module: 'list' },
  { name: 'workflow_complete_sub', module: 'complete-sub' },
  { name: 'workflow_record_test', module: 'test-tracking' },
  { name: 'workflow_capture_baseline', module: 'test-tracking' },
  { name: 'workflow_get_test_info', module: 'test-tracking' },
] as const;
