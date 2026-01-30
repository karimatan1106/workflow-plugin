/**
 * workflow_status ツール - 現在の状態を取得
 *
 * taskIdが指定されていない場合: 全アクティブタスクの一覧を返す
 * taskIdが指定されている場合: 指定タスクの詳細を返す
 *
 * @spec docs/workflows/ワ-クフロ-並列タスク対応/spec.md
 */

import { stateManager } from '../state/manager.js';
import type { StatusResult, PhaseName } from '../state/types.js';
import { PHASE_DESCRIPTIONS, isParallelPhase } from '../phases/definitions.js';

/**
 * 現在のワークフロー状態を取得
 *
 * @param taskId タスクID（オプション）
 * @returns ステータス結果
 */
export function workflowStatus(taskId?: string): StatusResult {
  // ディレクトリスキャンでアクティブタスクを取得
  const activeTasks = stateManager.discoverTasks();

  // アクティブなタスクがない場合
  if (activeTasks.length === 0) {
    return {
      success: true,
      status: 'idle',
      message: 'タスクなし。workflow_start でタスクを開始してください',
    };
  }

  // taskIdが指定されていない場合: 全タスク一覧を返す
  if (!taskId) {
    return {
      success: true,
      status: 'active',
      tasks: activeTasks.map((t) => ({
        taskId: t.taskId,
        taskName: t.taskName,
        phase: t.phase,
        docsDir: t.docsDir,
      })),
      message: `${activeTasks.length}件のアクティブタスクがあります`,
    };
  }

  // taskIdが指定されている場合: 指定タスクの詳細を返す
  const taskState = activeTasks.find((t) => t.taskId === taskId);

  if (!taskState) {
    return {
      success: false,
      status: 'error',
      error: 'TASK_NOT_FOUND',
      message: `指定されたタスクが見つかりません: ${taskId}`,
    };
  }

  const phase = taskState.phase as PhaseName;

  // 基本的な結果を構築
  const result: StatusResult = {
    success: true,
    status: 'active',
    taskId: taskState.taskId,
    taskName: taskState.taskName,
    phase,
    workflowDir: taskState.workflowDir,
    docsDir: taskState.docsDir,
    activeTasks: activeTasks.length,
    allTasks: activeTasks.map((t) => ({
      taskId: t.taskId,
      taskName: t.taskName,
      phase: t.phase,
    })),
    message: PHASE_DESCRIPTIONS[phase] || phase,
    taskSize: taskState.taskSize,
  };

  // 並列フェーズの場合、サブフェーズ状態を追加
  if (isParallelPhase(phase)) {
    // サブフェーズが初期化されていない場合は初期化
    const subPhases = Object.keys(taskState.subPhases || {}).length > 0
      ? taskState.subPhases
      : stateManager.initializeSubPhases(phase);

    result.subPhases = subPhases;
    result.isParallelPhase = true;
  }

  return result;
}

/**
 * ツール定義（MCP SDK用）
 *
 * MCPサーバーがクライアントに公開するツールのスキーマ定義。
 */
export const statusToolDefinition = {
  name: 'workflow_status',
  description: '現在のワークフロー状態を取得します。taskIdを省略すると全アクティブタスクの一覧を返し、taskIdを指定すると指定タスクの詳細を返します。',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'タスクID（省略時は全タスク一覧）',
      },
    },
    required: [],
  },
};
