/**
 * workflow_list ツール - タスク一覧
 *
 * アクティブなタスクの一覧を取得する。
 *
 * @spec docs/specs/domains/workflow/mcp-server.md
 */

import { stateManager } from '../state/manager.js';
import type { ListResult } from '../state/types.js';

/**
 * アクティブなタスク一覧を取得
 *
 * @returns タスク一覧結果
 */
export function workflowList(): ListResult {
  const globalState = stateManager.readGlobalState();

  // 各タスクの最新フェーズを取得
  const tasks = globalState.activeTasks.map((task) => {
    const taskState = stateManager.readTaskState(task.workflowDir);
    // タスク状態が取得できない場合はグローバル状態のフェーズを使用
    const phase = taskState?.phase || task.phase;

    return {
      taskId: task.taskId,
      taskName: task.taskName,
      phase,
      workflowDir: task.workflowDir,
    };
  });

  // 結果メッセージを生成
  const message = tasks.length > 0
    ? `${tasks.length}件のアクティブタスクがあります`
    : 'アクティブなタスクはありません';

  return {
    success: true,
    tasks,
    message,
  };
}

/**
 * ツール定義（MCP SDK用）
 *
 * MCPサーバーがクライアントに公開するツールのスキーマ定義。
 */
export const listToolDefinition = {
  name: 'workflow_list',
  description: 'アクティブなタスクの一覧を取得します。各タスクのID、名前、現在のフェーズを返します。',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};
