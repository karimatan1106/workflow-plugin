/**
 * P0-1: workflow_record_feedback ツール - フィードバック記録
 *
 * ユーザーのフィードバックをタスクのuserIntentに記録する。
 * 追記モード（appendMode）で既存の意図を保持しつつ追加可能。
 *
 * @spec docs/spec/features/record-feedback.md
 */

import { stateManager } from '../state/manager.js';
import type { RecordFeedbackResult } from '../state/types.js';
import { getTaskByIdOrError, validateRequiredString, safeExecute, verifySessionToken } from './helpers.js';

/**
 * フィードバック記録ツール定義
 */
export const recordFeedbackToolDefinition = {
  name: 'workflow_record_feedback',
  description: 'ユーザーのフィードバックをタスクのuserIntentに記録します。',
  inputSchema: {
    type: 'object' as const,
    properties: {
      taskId: { type: 'string', description: 'タスクID' },
      feedback: { type: 'string', description: 'フィードバック内容（最大10000文字）' },
      appendMode: { type: 'boolean', description: '追記モード（trueの場合、既存のuserIntentに追記）' },
      sessionToken: { type: 'string', description: 'セッショントークン' },
    },
    required: ['feedback'],
  },
};

/** フィードバック最大文字数 */
const MAX_FEEDBACK_LENGTH = 10000;

/**
 * フィードバックをタスクに記録
 *
 * @param taskId タスクID
 * @param feedback フィードバック内容
 * @param appendMode 追記モード（デフォルトfalse = 置換）
 * @param sessionToken セッショントークン
 * @returns 記録結果
 */
export function workflowRecordFeedback(
  taskId?: string,
  feedback?: string,
  appendMode?: boolean,
  sessionToken?: string,
): RecordFeedbackResult {
  return safeExecute('record_feedback', () => {
    // パラメータ検証
    const feedbackCheck = validateRequiredString(feedback, 'feedbackは必須です');
    if ('error' in feedbackCheck) return feedbackCheck.error as RecordFeedbackResult;

    const feedbackText = feedbackCheck.value;
    if (feedbackText.length > MAX_FEEDBACK_LENGTH) {
      return {
        success: false,
        message: `フィードバックが最大文字数（${MAX_FEEDBACK_LENGTH}文字）を超えています（${feedbackText.length}文字）`,
      };
    }

    // タスク取得
    const taskResult = getTaskByIdOrError(taskId);
    if ('error' in taskResult) return taskResult.error as RecordFeedbackResult;
    const { taskState } = taskResult;

    // セッショントークン検証
    const tokenError = verifySessionToken(taskState, sessionToken);
    if (tokenError) return tokenError as RecordFeedbackResult;

    // userIntent 更新（appendModeの場合は既存テキストと結合）
    const baseIntent = appendMode && taskState.userIntent ? `${taskState.userIntent}\n\n` : '';
    let updatedUserIntent = baseIntent + feedbackText;

    // 最大長を超える場合は末尾を切り詰める
    if (updatedUserIntent.length > MAX_FEEDBACK_LENGTH) {
      updatedUserIntent = updatedUserIntent.slice(0, MAX_FEEDBACK_LENGTH);
    }

    taskState.userIntent = updatedUserIntent;
    stateManager.writeTaskState(taskState.workflowDir, taskState);

    return {
      success: true,
      message: appendMode ? 'フィードバックを追記しました' : 'フィードバックを記録しました',
      updatedUserIntent,
    };
  }) as RecordFeedbackResult;
}
