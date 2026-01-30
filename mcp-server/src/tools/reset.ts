/**
 * workflow_reset ツール - タスクをリセット
 *
 * 指定されたタスクをresearchフェーズにリセットする。
 * リセット履歴が記録される。
 *
 * @spec docs/workflows/ワ-クフロ-並列タスク対応/spec.md
 */

import { stateManager } from '../state/manager.js';
import type { ResetResult } from '../state/types.js';
import { getTaskByIdOrError, safeExecute } from './helpers.js';

/**
 * タスクをresearchフェーズにリセット
 *
 * @param taskId タスクID（必須）
 * @param reason リセット理由（オプション）
 * @returns リセット結果
 */
export function workflowReset(taskId?: string, reason?: string): ResetResult {
  // タスク状態を取得
  const result = getTaskByIdOrError(taskId);
  if ('error' in result) {
    return result.error as ResetResult;
  }

  const { taskState } = result;
  const fromPhase = taskState.phase;

  // リセット処理を実行
  return safeExecute('リセット', () => {
    stateManager.resetTask(taskState.taskId, reason);

    return {
      success: true,
      taskId: taskState.taskId,
      fromPhase,
      toPhase: 'research',
      reason: reason || '',
      message: `${fromPhase} → research にリセットしました`,
    };
  }) as ResetResult;
}

/**
 * ツール定義（MCP SDK用）
 *
 * MCPサーバーがクライアントに公開するツールのスキーマ定義。
 */
export const resetToolDefinition = {
  name: 'workflow_reset',
  description: '指定されたタスクをresearchフェーズにリセットします。リセット理由を記録できます。',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'タスクID（必須）',
      },
      reason: {
        type: 'string',
        description: 'リセット理由（オプション）',
      },
    },
    required: [],
  },
};
