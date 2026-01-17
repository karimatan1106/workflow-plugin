/**
 * workflow_status ツール - 現在の状態を取得
 *
 * 現在のワークフロー状態（アクティブタスク、フェーズ、サブフェーズ状態など）を返す。
 *
 * @spec docs/specs/domains/workflow/mcp-server.md
 */

import { stateManager } from '../state/manager.js';
import type { StatusResult, PhaseName } from '../state/types.js';
import { PHASE_DESCRIPTIONS, isParallelPhase } from '../phases/definitions.js';

/**
 * 現在のワークフロー状態を取得
 *
 * @returns ステータス結果
 */
export function workflowStatus(): StatusResult {
  const globalState = stateManager.readGlobalState();

  // アクティブなタスクがない場合
  if (globalState.activeTasks.length === 0) {
    return {
      success: true,
      status: 'idle',
      message: 'タスクなし。workflow_start でタスクを開始してください',
    };
  }

  const currentTask = globalState.activeTasks[0];
  const taskState = stateManager.readTaskState(currentTask.workflowDir);

  // タスク状態ファイルが見つからない場合
  if (!taskState) {
    return {
      success: false,
      status: 'error',
      message: 'タスク状態ファイルが見つかりません',
    };
  }

  const phase = taskState.phase as PhaseName;

  // 基本的な結果を構築
  const result: StatusResult = {
    success: true,
    status: 'active',
    taskId: currentTask.taskId,
    taskName: currentTask.taskName,
    phase,
    workflowDir: currentTask.workflowDir,
    activeTasks: globalState.activeTasks.length,
    allTasks: globalState.activeTasks.map((t) => ({
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
  description: '現在のワークフロー状態を取得します。アクティブなタスク、フェーズ、並列フェーズのサブフェーズ状態などを返します。',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};
