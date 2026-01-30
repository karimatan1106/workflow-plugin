/**
 * workflow_list ツール - タスク一覧
 *
 * ディレクトリスキャンでアクティブなタスクの一覧を取得する。
 *
 * @spec docs/workflows/ワ-クフロ-並列タスク対応/spec.md
 */

import { stateManager } from '../state/manager.js';
import type { ListResult } from '../state/types.js';

/**
 * アクティブなタスク一覧を取得
 *
 * ディレクトリスキャンでアクティブタスクを発見し、一覧を返す。
 *
 * @returns タスク一覧結果
 */
export function workflowList(): ListResult {
  // ディレクトリスキャンでアクティブタスクを取得
  const activeTasks = stateManager.discoverTasks();

  const tasks = activeTasks.map((taskState) => ({
    taskId: taskState.taskId,
    taskName: taskState.taskName,
    phase: taskState.phase,
    workflowDir: taskState.workflowDir,
    docsDir: taskState.docsDir,
  }));

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
