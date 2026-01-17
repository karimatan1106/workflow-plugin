/**
 * workflow_switch ツール - タスク切り替え
 *
 * 別のタスクをアクティブタスクとして切り替える。
 *
 * @spec docs/specs/domains/workflow/mcp-server.md
 */

import { stateManager } from '../state/manager.js';
import type { SwitchResult } from '../state/types.js';
import { validateRequiredString } from './helpers.js';
import { MISSING_PARAM_ERRORS, taskNotFoundError } from '../utils/errors.js';

/**
 * アクティブタスクを切り替え
 *
 * @param taskId 切り替え先のタスクID
 * @returns 切り替え結果
 */
export function workflowSwitch(taskId: string): SwitchResult {
  // タスクIDの検証
  const validation = validateRequiredString(taskId, MISSING_PARAM_ERRORS.TASK_ID);
  if ('error' in validation) {
    return validation.error as SwitchResult;
  }

  // タスク切り替えを実行
  const task = stateManager.switchTask(validation.value);

  if (!task) {
    return {
      success: false,
      message: taskNotFoundError(validation.value),
    };
  }

  return {
    success: true,
    taskId: task.taskId,
    taskName: task.taskName,
    message: `タスク「${task.taskName}」に切り替えました`,
  };
}

/**
 * ツール定義（MCP SDK用）
 *
 * MCPサーバーがクライアントに公開するツールのスキーマ定義。
 */
export const switchToolDefinition = {
  name: 'workflow_switch',
  description: '別のタスクに切り替えます。指定されたタスクがアクティブタスクの先頭になります。',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'タスクID（例: 20260115_123456）',
      },
    },
    required: ['taskId'],
  },
};
