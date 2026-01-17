/**
 * workflow_start ツール - 新規タスク開始
 *
 * 新しいワークフロータスクを作成し、researchフェーズから開始する。
 *
 * @spec docs/specs/domains/workflow/mcp-server.md
 */

import { stateManager } from '../state/manager.js';
import type { StartResult, TaskSize } from '../state/types.js';
import { DEFAULT_TASK_SIZE } from '../state/types.js';
import { isValidTaskSize } from '../phases/definitions.js';
import { validateRequiredString, safeExecute } from './helpers.js';
import { MISSING_PARAM_ERRORS, invalidValueError } from '../utils/errors.js';

/** 有効なタスクサイズの一覧 */
const VALID_TASK_SIZES: readonly string[] = ['small', 'medium', 'large'];

/**
 * 新規タスクを開始
 *
 * @param taskName タスク名（日本語可）
 * @param size タスクサイズ（省略時はlarge）
 * @returns 開始結果
 */
export function workflowStart(taskName: string, size?: string): StartResult {
  // タスク名の検証
  const nameValidation = validateRequiredString(taskName, MISSING_PARAM_ERRORS.TASK_NAME);
  if ('error' in nameValidation) {
    return nameValidation.error as StartResult;
  }

  // タスクサイズの検証
  let taskSize: TaskSize = DEFAULT_TASK_SIZE;
  if (size !== undefined) {
    if (!isValidTaskSize(size)) {
      return {
        success: false,
        message: invalidValueError('タスクサイズ', size, VALID_TASK_SIZES),
      };
    }
    taskSize = size;
  }

  // タスク作成を実行
  return safeExecute('タスク開始', () => {
    const taskState = stateManager.createTask(nameValidation.value, taskSize);

    return {
      success: true,
      taskId: taskState.taskId,
      taskName: taskState.taskName,
      phase: taskState.phase,
      workflowDir: taskState.workflowDir,
      taskSize: taskState.taskSize,
      message: `タスク「${taskState.taskName}」を開始しました。フェーズ: research、サイズ: ${taskSize}`,
    };
  }) as StartResult;
}

/**
 * ツール定義（MCP SDK用）
 *
 * MCPサーバーがクライアントに公開するツールのスキーマ定義。
 */
export const startToolDefinition = {
  name: 'workflow_start',
  description: '新規ワークフロータスクを開始します。タスク名を指定して、researchフェーズから開始します。',
  inputSchema: {
    type: 'object',
    properties: {
      taskName: {
        type: 'string',
        description: 'タスク名（日本語可）',
      },
      size: {
        type: 'string',
        description: 'タスクサイズ（small: 6フェーズ、medium: 12フェーズ、large: 17フェーズ）',
        enum: ['small', 'medium', 'large'],
      },
    },
    required: ['taskName'],
  },
};
