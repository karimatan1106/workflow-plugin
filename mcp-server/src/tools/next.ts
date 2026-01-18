/**
 * workflow_next ツール - 次フェーズへ遷移
 *
 * 現在のフェーズから次のフェーズへ遷移する。
 * レビューフェーズでは承認が、並列フェーズでは全サブフェーズの完了が必要。
 *
 * @spec docs/specs/domains/workflow/mcp-server.md
 */

import { stateManager } from '../state/manager.js';
import type { NextResult, TaskSize } from '../state/types.js';
import { DEFAULT_TASK_SIZE } from '../state/types.js';
import {
  requiresApproval,
  isParallelPhase,
  getNextPhase,
  PHASE_DESCRIPTIONS,
} from '../phases/definitions.js';
import { getTaskStateOrError, safeExecute } from './helpers.js';
import { STATE_ERRORS } from '../utils/errors.js';

/**
 * 次のフェーズへ遷移
 *
 * @returns 遷移結果
 */
export function workflowNext(): NextResult {
  // タスクと状態を取得
  const result = getTaskStateOrError();
  if ('error' in result) {
    return result.error as NextResult;
  }

  const { task, taskState } = result;
  const currentPhase = taskState.phase;

  // 完了済みチェック
  if (currentPhase === 'completed') {
    return {
      success: false,
      message: STATE_ERRORS.TASK_ALREADY_COMPLETED,
    };
  }

  // レビュー承認が必要かチェック
  if (requiresApproval(currentPhase)) {
    return {
      success: false,
      message: `${currentPhase}フェーズはユーザー承認が必要です。workflow_approve で承認してください`,
    };
  }

  // 並列フェーズの場合、全サブフェーズが完了しているかチェック
  if (isParallelPhase(currentPhase)) {
    const incompleteSubPhases = stateManager.getIncompleteSubPhases(task.taskId);
    if (incompleteSubPhases.length > 0) {
      return {
        success: false,
        message: `並列フェーズの未完了サブフェーズがあります: ${incompleteSubPhases.join(', ')}。workflow_complete_sub で完了してください`,
      };
    }
  }

  // タスクサイズを取得（未設定の場合はlargeとして扱う）
  const taskSize: TaskSize = taskState.taskSize || DEFAULT_TASK_SIZE;

  // 次のフェーズを取得（タスクサイズに応じた遷移）
  const nextPhase = getNextPhase(currentPhase, taskSize);
  if (!nextPhase) {
    return {
      success: false,
      message: STATE_ERRORS.CANNOT_PROCEED,
    };
  }

  // フェーズ遷移を実行
  return safeExecute('フェーズ遷移', () => {
    stateManager.updateTaskPhase(task.taskId, nextPhase);

    return {
      success: true,
      from: currentPhase,
      to: nextPhase,
      description: PHASE_DESCRIPTIONS[nextPhase],
      message: `${currentPhase} → ${nextPhase} に遷移しました`,
      workflow_context: {
        workflowDir: taskState.workflowDir,
        phase: nextPhase,
        currentPhase: currentPhase,
      },
    };
  }) as NextResult;
}

/**
 * ツール定義（MCP SDK用）
 *
 * MCPサーバーがクライアントに公開するツールのスキーマ定義。
 */
export const nextToolDefinition = {
  name: 'workflow_next',
  description: '次のフェーズへ遷移します。レビューフェーズでは承認が必要です。並列フェーズでは全サブフェーズの完了が必要です。',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};
