/**
 * workflow_reset ツール - タスクをリセット
 *
 * 現在のタスクをresearchフェーズにリセットする。
 * リセット履歴が記録される。
 *
 * @spec docs/specs/domains/workflow/mcp-server.md
 */

import { stateManager } from '../state/manager.js';
import type { ResetResult } from '../state/types.js';
import { getTaskStateOrError, safeExecute } from './helpers.js';

/**
 * タスクをresearchフェーズにリセット
 *
 * @param reason リセット理由（オプション）
 * @returns リセット結果
 */
export function workflowReset(reason?: string): ResetResult {
  // タスクと状態を取得
  const result = getTaskStateOrError();
  if ('error' in result) {
    return result.error as ResetResult;
  }

  const { task, taskState } = result;
  const fromPhase = taskState.phase;

  // リセット処理を実行
  return safeExecute('リセット', () => {
    stateManager.resetTask(task.taskId, reason);

    return {
      success: true,
      taskId: task.taskId,
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
  description: '現在のタスクをresearchフェーズにリセットします。リセット理由を記録できます。',
  inputSchema: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: 'リセット理由（オプション）',
      },
    },
    required: [],
  },
};
