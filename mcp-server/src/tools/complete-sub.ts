/**
 * workflow_complete_sub ツール - サブフェーズ完了
 *
 * 並列フェーズのサブフェーズを完了としてマークする。
 * 全サブフェーズが完了すると次のフェーズに進める。
 *
 * @spec docs/specs/domains/workflow/mcp-server.md
 */

import { stateManager } from '../state/manager.js';
import type { CompleteSubResult, SubPhaseName } from '../state/types.js';
import { isParallelPhase, PARALLEL_GROUPS } from '../phases/definitions.js';
import { getTaskStateOrError, validateRequiredString, safeExecute } from './helpers.js';
import { MISSING_PARAM_ERRORS, invalidValueError } from '../utils/errors.js';

/**
 * サブフェーズを完了としてマーク
 *
 * @param subPhase サブフェーズ名
 * @returns 完了結果
 */
export function workflowCompleteSub(subPhase: string): CompleteSubResult {
  // サブフェーズ名の検証
  const validation = validateRequiredString(subPhase, MISSING_PARAM_ERRORS.SUB_PHASE);
  if ('error' in validation) {
    return validation.error as CompleteSubResult;
  }

  // タスクと状態を取得
  const result = getTaskStateOrError();
  if ('error' in result) {
    return result.error as CompleteSubResult;
  }

  const { task, taskState } = result;
  const currentPhase = taskState.phase;

  // 並列フェーズでない場合はエラー
  if (!isParallelPhase(currentPhase)) {
    return {
      success: false,
      message: `現在のフェーズ(${currentPhase})は並列フェーズではありません`,
    };
  }

  // サブフェーズの妥当性をチェック
  const validSubPhases = PARALLEL_GROUPS[currentPhase] || [];
  if (!validSubPhases.includes(validation.value as SubPhaseName)) {
    return {
      success: false,
      message: invalidValueError('サブフェーズ', validation.value, validSubPhases),
    };
  }

  // サブフェーズ完了処理を実行
  return safeExecute('サブフェーズ完了処理', () => {
    const subPhaseName = validation.value as SubPhaseName;

    // サブフェーズを完了としてマーク
    stateManager.updateSubPhaseStatus(task.taskId, subPhaseName, 'completed');

    // 残りの未完了サブフェーズを取得
    const remaining = stateManager.getIncompleteSubPhases(task.taskId);
    const allCompleted = remaining.length === 0;

    // 結果メッセージを生成
    const message = allCompleted
      ? `${subPhaseName}を完了しました。全て完了。workflow_next で次へ進めます`
      : `${subPhaseName}を完了しました。残り: ${remaining.join(', ')}`;

    return {
      success: true,
      subPhase: subPhaseName,
      phase: currentPhase,
      remaining,
      allCompleted,
      message,
      workflow_context: {
        workflowDir: taskState.workflowDir,
        phase: currentPhase,
        currentPhase: currentPhase,
        subPhase: subPhaseName,
      },
    };
  }) as CompleteSubResult;
}

/**
 * ツール定義（MCP SDK用）
 *
 * MCPサーバーがクライアントに公開するツールのスキーマ定義。
 */
export const completeSubToolDefinition = {
  name: 'workflow_complete_sub',
  description: '並列フェーズのサブフェーズを完了としてマークします。全サブフェーズが完了すると次のフェーズに進めます。',
  inputSchema: {
    type: 'object',
    properties: {
      subPhase: {
        type: 'string',
        description: 'サブフェーズ名（例: threat_modeling, planning, state_machine, flowchart, ui_design, build_check, code_review, manual_test, security_scan）',
      },
    },
    required: ['subPhase'],
  },
};
