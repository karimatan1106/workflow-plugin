/**
 * workflow_back ツール - 部分差し戻し
 *
 * 指定されたタスクを指定フェーズにリセットする（現在より前のフェーズのみ）。
 * リセット履歴が記録される。
 *
 * @spec docs/workflows/ワークフロー大規模対応改善/spec.md
 */

import { stateManager } from '../state/manager.js';
import type { ResetResult, PhaseName, TaskSize } from '../state/types.js';
import { DEFAULT_TASK_SIZE } from '../state/types.js';
import { getPhaseIndex, PHASES_BY_SIZE } from '../phases/definitions.js';
import { getTaskByIdOrError, safeExecute } from './helpers.js';

/**
 * タスクを指定フェーズに差し戻し
 *
 * @param taskId タスクID（必須）
 * @param targetPhase 差し戻し先フェーズ（必須）
 * @param reason 差し戻し理由（オプション）
 * @returns 差し戻し結果
 */
export function workflowBack(
  taskId?: string,
  targetPhase?: string,
  reason?: string
): ResetResult {
  // タスク状態を取得
  const result = getTaskByIdOrError(taskId);
  if ('error' in result) {
    return result.error as ResetResult;
  }

  const { taskState } = result;
  const fromPhase = taskState.phase;

  // targetPhaseの検証
  if (!targetPhase || typeof targetPhase !== 'string') {
    return {
      success: false,
      message: 'targetPhaseを指定してください',
    };
  }

  // タスクサイズを取得
  const taskSize: TaskSize = taskState.taskSize || DEFAULT_TASK_SIZE;
  const phases = PHASES_BY_SIZE[taskSize];

  // targetPhaseが有効なフェーズかチェック
  if (!phases.includes(targetPhase as PhaseName)) {
    return {
      success: false,
      message: `不正なフェーズ名: ${targetPhase}`,
    };
  }

  // targetPhaseが現在のフェーズより前かチェック
  const currentIndex = getPhaseIndex(fromPhase, taskSize);
  const targetIndex = getPhaseIndex(targetPhase as PhaseName, taskSize);

  if (targetIndex >= currentIndex) {
    return {
      success: false,
      message: `差し戻し先フェーズは現在のフェーズ（${fromPhase}）より前である必要があります`,
    };
  }

  // 差し戻し処理を実行
  return safeExecute('差し戻し', () => {
    // resetHistoryに記録
    const existingResetHistory = taskState.resetHistory || [];
    const newResetEntry = {
      fromPhase,
      reason: reason || `${targetPhase}フェーズへ差し戻し`,
      timestamp: new Date().toISOString(),
    };

    const updatedState = {
      ...taskState,
      phase: targetPhase as PhaseName,
      resetHistory: [...existingResetHistory, newResetEntry],
    };

    stateManager.writeTaskState(taskState.workflowDir, updatedState);

    return {
      success: true,
      taskId: taskState.taskId,
      fromPhase,
      toPhase: targetPhase as PhaseName,
      reason: reason || `${targetPhase}フェーズへ差し戻し`,
      message: `${fromPhase} → ${targetPhase} に差し戻しました`,
    };
  }) as ResetResult;
}

/**
 * ツール定義（MCP SDK用）
 */
export const backToolDefinition = {
  name: 'workflow_back',
  description: '指定されたタスクを指定フェーズに差し戻します。現在のフェーズより前のフェーズのみ指定可能です。リセット理由を記録できます。',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'タスクID（必須）',
      },
      targetPhase: {
        type: 'string',
        description: '差し戻し先フェーズ（例: requirements, planning, test_impl など）',
      },
      reason: {
        type: 'string',
        description: '差し戻し理由（オプション）',
      },
    },
    required: ['targetPhase'],
  },
};
