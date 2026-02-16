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
  workflowRecordKnownBug,
  recordKnownBugToolDefinition,
  workflowGetKnownBugs,
  getKnownBugsToolDefinition,
} from './test-tracking.js';

/** 影響範囲設定ツール */
export { workflowSetScope, setScopeToolDefinition } from './set-scope.js';

/** テスト結果記録ツール */
export { workflowRecordTestResult, recordTestResultToolDefinition } from './record-test-result.js';

/** 差し戻しツール */
export { workflowBack, backToolDefinition } from './back.js';

/** P0-3: 事前検証ツール */
export { workflowPreValidate, preValidateToolDefinition } from './pre-validate.js';

/** P0-1: フィードバック記録ツール */
export { workflowRecordFeedback, recordFeedbackToolDefinition } from './record-feedback.js';

/** P1-2: サブタスク作成ツール */
export { workflowCreateSubtask, createSubtaskToolDefinition } from './create-subtask.js';

/** P1-2: タスクリンクツール */
export { workflowLinkTasks, linkTasksToolDefinition } from './link-tasks.js';

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
  { name: 'workflow_record_known_bug', module: 'test-tracking' },
  { name: 'workflow_get_known_bugs', module: 'test-tracking' },
  { name: 'workflow_set_scope', module: 'set-scope' },
  { name: 'workflow_record_test_result', module: 'record-test-result' },
  { name: 'workflow_back', module: 'back' },
  { name: 'workflow_pre_validate', module: 'pre-validate' },
  { name: 'workflow_record_feedback', module: 'record-feedback' },
  { name: 'workflow_create_subtask', module: 'create-subtask' },
  { name: 'workflow_link_tasks', module: 'link-tasks' },
] as const;
