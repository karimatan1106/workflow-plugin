/**
 * P1-2: workflow_link_tasks ツール - タスク親子リンク
 *
 * 既存の2タスク間に親子関係を設定する。
 * 循環参照の検出を行い、安全なリンクのみ許可する。
 *
 * @spec docs/spec/features/link-tasks.md
 */

import { stateManager } from '../state/manager.js';
import type { LinkTasksResult } from '../state/types.js';
import { getTaskByIdOrError, validateRequiredString, safeExecute, verifySessionToken } from './helpers.js';

/** 循環参照検出の最大深度 */
const MAX_TASK_DEPTH = 5;

/**
 * タスクリンクツール定義
 */
export const linkTasksToolDefinition = {
  name: 'workflow_link_tasks',
  description: '既存の2タスク間に親子関係を設定します。循環参照を自動検出します。',
  inputSchema: {
    type: 'object' as const,
    properties: {
      parentTaskId: { type: 'string', description: '親タスクID' },
      childTaskId: { type: 'string', description: '子タスクID' },
      sessionToken: { type: 'string', description: 'セッショントークン' },
    },
    required: ['parentTaskId', 'childTaskId'],
  },
};

/**
 * タスク間に親子関係を設定
 *
 * @param parentTaskId 親タスクID
 * @param childTaskId 子タスクID
 * @param sessionToken セッショントークン
 * @returns リンク結果
 */
export function workflowLinkTasks(
  parentTaskId?: string,
  childTaskId?: string,
  sessionToken?: string,
): LinkTasksResult {
  return safeExecute('link_tasks', () => {
    // パラメータ検証
    const parentIdCheck = validateRequiredString(parentTaskId, 'parentTaskIdは必須です');
    if ('error' in parentIdCheck) return parentIdCheck.error as LinkTasksResult;

    const childIdCheck = validateRequiredString(childTaskId, 'childTaskIdは必須です');
    if ('error' in childIdCheck) return childIdCheck.error as LinkTasksResult;

    // 自己参照チェック
    if (parentIdCheck.value === childIdCheck.value) {
      return {
        success: false,
        message: '親タスクと子タスクは同じタスクを指定できません',
      };
    }

    // 親子両タスク取得
    const parentResult = getTaskByIdOrError(parentIdCheck.value);
    if ('error' in parentResult) return parentResult.error as LinkTasksResult;
    const { taskState: parentState } = parentResult;

    const childResult = getTaskByIdOrError(childIdCheck.value);
    if ('error' in childResult) return childResult.error as LinkTasksResult;
    const { taskState: childState } = childResult;

    // セッショントークン検証（親タスクのトークンで認証）
    const tokenError = verifySessionToken(parentState, sessionToken);
    if (tokenError) return tokenError as LinkTasksResult;

    // 既存の親チェック（子タスクが既に別の親を持つ場合）
    const childHasExistingParent = childState.parentTaskId && childState.parentTaskId !== parentIdCheck.value;
    if (childHasExistingParent) {
      return {
        success: false,
        message: `子タスク ${childIdCheck.value} は既に親タスク ${childState.parentTaskId} にリンクされています`,
      };
    }

    // 重複リンクチェック
    const alreadyLinked = parentState.childTaskIds?.includes(childIdCheck.value) ?? false;
    if (alreadyLinked) {
      return {
        success: false,
        message: `タスク ${childIdCheck.value} は既に ${parentIdCheck.value} の子タスクです`,
      };
    }

    // 循環参照チェック（祖先チェーン走査）
    const hasCircular = detectCircularReference(parentIdCheck.value, childIdCheck.value);
    if (hasCircular) {
      return {
        success: false,
        message: '循環参照が検出されました。このリンクは作成できません',
      };
    }

    // リンク設定
    childState.parentTaskId = parentIdCheck.value;
    childState.taskType = 'child';

    if (!parentState.childTaskIds) {
      parentState.childTaskIds = [];
    }
    parentState.childTaskIds.push(childIdCheck.value);
    parentState.taskType = 'parent';

    // 両方を保存
    stateManager.writeTaskState(childState.workflowDir, childState);
    stateManager.writeTaskState(parentState.workflowDir, parentState);

    return {
      success: true,
      message: `タスク ${childIdCheck.value} を ${parentIdCheck.value} の子タスクとしてリンクしました`,
      parentTaskId: parentIdCheck.value,
      childTaskId: childIdCheck.value,
    };
  }) as LinkTasksResult;
}

/**
 * 循環参照を検出
 *
 * childTaskIdの子孫にparentTaskIdが含まれる場合、循環参照と判定する。
 *
 * @param parentTaskId 親にしようとしているタスクID
 * @param childTaskId 子にしようとしているタスクID
 * @returns 循環参照が検出された場合true
 */
function detectCircularReference(parentTaskId: string, childTaskId: string): boolean {
  const visited = new Set<string>();
  const queue = [childTaskId];

  for (let depth = 0; depth < MAX_TASK_DEPTH && queue.length > 0; depth++) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const taskState = stateManager.getTaskById(current);
    if (!taskState?.childTaskIds) continue;

    for (const cid of taskState.childTaskIds) {
      if (cid === parentTaskId) return true;
      if (!visited.has(cid)) {
        queue.push(cid);
      }
    }
  }

  return false;
}
