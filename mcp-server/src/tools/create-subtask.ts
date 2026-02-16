/**
 * P1-2: workflow_create_subtask ツール - サブタスク作成
 *
 * 既存タスクの子タスクを新規作成する。
 * 親タスクにchildTaskIdsを追加し、子タスクにparentTaskIdを設定する。
 *
 * @spec docs/spec/features/create-subtask.md
 */

import { stateManager } from '../state/manager.js';
import type { CreateSubtaskResult, TaskSize } from '../state/types.js';
import { getTaskByIdOrError, validateRequiredString, safeExecute, verifySessionToken } from './helpers.js';

/**
 * サブタスク作成ツール定義
 */
export const createSubtaskToolDefinition = {
  name: 'workflow_create_subtask',
  description: '既存タスクの子タスク（サブタスク）を新規作成します。',
  inputSchema: {
    type: 'object' as const,
    properties: {
      parentTaskId: { type: 'string', description: '親タスクID' },
      subtaskName: { type: 'string', description: 'サブタスク名' },
      taskSize: { type: 'string', description: 'タスクサイズ（small/medium/large）' },
      sessionToken: { type: 'string', description: 'セッショントークン' },
    },
    required: ['parentTaskId', 'subtaskName'],
  },
};

/**
 * サブタスクを作成
 *
 * @param parentTaskId 親タスクID
 * @param subtaskName サブタスク名
 * @param taskSize タスクサイズ
 * @param sessionToken セッショントークン
 * @returns 作成結果
 */
export function workflowCreateSubtask(
  parentTaskId?: string,
  subtaskName?: string,
  taskSize?: string,
  sessionToken?: string,
): CreateSubtaskResult {
  return safeExecute('create_subtask', () => {
    // パラメータ検証
    const parentIdCheck = validateRequiredString(parentTaskId, 'parentTaskIdは必須です');
    if ('error' in parentIdCheck) return parentIdCheck.error as CreateSubtaskResult;

    const nameCheck = validateRequiredString(subtaskName, 'subtaskNameは必須です');
    if ('error' in nameCheck) return nameCheck.error as CreateSubtaskResult;

    // 親タスク取得
    const parentResult = getTaskByIdOrError(parentIdCheck.value);
    if ('error' in parentResult) return parentResult.error as CreateSubtaskResult;
    const { taskState: parentState } = parentResult;

    // セッショントークン検証
    const tokenError = verifySessionToken(parentState, sessionToken);
    if (tokenError) return tokenError as CreateSubtaskResult;

    // 子タスクを作成（有効なタスクサイズにフォールバック）
    const validatedSize: TaskSize = (taskSize === 'small' || taskSize === 'medium') ? (taskSize as TaskSize) : 'large';
    const childState = stateManager.createTask(nameCheck.value, validatedSize);

    // 子タスクに親情報を設定
    childState.parentTaskId = parentIdCheck.value;
    childState.taskType = 'child';
    childState.userIntent = parentState.userIntent;
    stateManager.writeTaskState(childState.workflowDir, childState);

    // 親タスクに子情報を追加
    if (!parentState.childTaskIds) {
      parentState.childTaskIds = [];
    }
    parentState.childTaskIds.push(childState.taskId);
    parentState.taskType = 'parent';
    stateManager.writeTaskState(parentState.workflowDir, parentState);

    return {
      success: true,
      message: `サブタスク「${nameCheck.value}」を作成しました（ID: ${childState.taskId}）`,
      childTaskId: childState.taskId,
      parentTaskId: parentIdCheck.value,
    };
  }) as CreateSubtaskResult;
}
