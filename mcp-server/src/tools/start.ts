/**
 * workflow_start ツール - 新規タスク開始
 *
 * 新しいワークフロータスクを作成し、researchフェーズから開始する。
 *
 * @spec docs/specs/domains/workflow/mcp-server.md
 */

import { stateManager } from '../state/manager.js';
import type { StartResult } from '../state/types.js';
import { DEFAULT_TASK_SIZE } from '../state/types.js';
import { validateRequiredString, safeExecute } from './helpers.js';
import { MISSING_PARAM_ERRORS } from '../utils/errors.js';

/**
 * 新規タスクを開始
 *
 * @param taskName タスク名（日本語可）
 * @returns 開始結果
 *
 * 注: sizeパラメータは廃止されました。全てのタスクはlargeサイズで開始されます。
 */
export function workflowStart(taskName: string): StartResult {
  // タスク名の検証
  const nameValidation = validateRequiredString(taskName, MISSING_PARAM_ERRORS.TASK_NAME);
  if ('error' in nameValidation) {
    return nameValidation.error as StartResult;
  }

  // タスク作成を実行（常にlargeサイズ）
  return safeExecute('タスク開始', () => {
    const taskState = stateManager.createTask(nameValidation.value, DEFAULT_TASK_SIZE);

    return {
      success: true,
      taskId: taskState.taskId,
      taskName: taskState.taskName,
      phase: taskState.phase,
      workflowDir: taskState.workflowDir,
      docsDir: taskState.docsDir,
      taskSize: taskState.taskSize,
      message: `タスク「${taskState.taskName}」を開始しました。フェーズ: research、サイズ: large`,
    };
  }) as StartResult;
}

/**
 * ツール定義（MCP SDK用）
 *
 * MCPサーバーがクライアントに公開するツールのスキーマ定義。
 * 注: sizeパラメータは廃止されました。全てのタスクはlarge（18フェーズ）で開始されます。
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
    },
    required: ['taskName'],
  },
};
