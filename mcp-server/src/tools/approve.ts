/**
 * workflow_approve ツール - レビュー承認
 *
 * 指定されたタスクのレビューフェーズでユーザー承認を行い、次のフェーズへ遷移する。
 *
 * @spec docs/workflows/ワ-クフロ-並列タスク対応/spec.md
 */

import { stateManager } from '../state/manager.js';
import type { ApproveResult } from '../state/types.js';
import { APPROVE_TYPE_MAPPING } from '../phases/definitions.js';
import { getTaskByIdOrError, validateRequiredString, safeExecute, verifySessionToken } from './helpers.js';
import { MISSING_PARAM_ERRORS, phaseNotMatchError } from '../utils/errors.js';

/**
 * レビューを承認
 *
 * @param taskId タスクID（必須）
 * @param type 承認タイプ（'design'など）
 * @param sessionToken セッショントークン（オプション、REQ-6）
 * @returns 承認結果
 */
export function workflowApprove(taskId?: string, type?: string, sessionToken?: string): ApproveResult {
  // タスク状態を取得
  const taskResult = getTaskByIdOrError(taskId);
  if ('error' in taskResult) {
    return taskResult.error as ApproveResult;
  }

  const { taskState } = taskResult;

  // REQ-6: セッショントークン検証
  const tokenError = verifySessionToken(taskState, sessionToken);
  if (tokenError) return tokenError as ApproveResult;

  // 承認タイプの検証
  const typeValidation = validateRequiredString(type, MISSING_PARAM_ERRORS.APPROVE_TYPE);
  if ('error' in typeValidation) {
    return typeValidation.error as ApproveResult;
  }

  // 承認マッピングの検証
  const approveMapping = APPROVE_TYPE_MAPPING[typeValidation.value];
  if (!approveMapping) {
    const validTypes = Object.keys(APPROVE_TYPE_MAPPING).join(', ');
    return {
      success: false,
      message: `不明な承認タイプ: ${typeValidation.value}。有効: ${validTypes}`,
    };
  }

  const currentPhase = taskState.phase;
  const { expectedPhase, nextPhase } = approveMapping;

  // フェーズチェック
  if (currentPhase !== expectedPhase) {
    return {
      success: false,
      message: phaseNotMatchError(expectedPhase, currentPhase),
    };
  }

  // 承認処理を実行
  return safeExecute('承認処理', () => {
    // FR-9: 承認フラグを記録
    if (!taskState.approvals) taskState.approvals = {};
    taskState.approvals[typeValidation.value as keyof typeof taskState.approvals] = true;
    stateManager.writeTaskState(taskState.workflowDir, taskState);

    // フェーズを更新
    stateManager.updateTaskPhase(taskState.taskId, nextPhase);

    return {
      success: true,
      taskId: taskState.taskId,
      approved: typeValidation.value,
      nextPhase,
      message: `${typeValidation.value}レビューを承認しました。次のフェーズ: ${nextPhase}`,
    };
  }) as ApproveResult;
}

/**
 * ツール定義（MCP SDK用）
 *
 * MCPサーバーがクライアントに公開するツールのスキーマ定義。
 */
export const approveToolDefinition = {
  name: 'workflow_approve',
  description: '指定されたタスクのレビューフェーズを承認します。requirementsフェーズでは "requirements"、design_reviewフェーズでは "design"、test_designフェーズでは "test_design" を指定します。',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'タスクID（必須）',
      },
      type: {
        type: 'string',
        description: '承認タイプ（requirements, design, test_design）',
        enum: ['requirements', 'design', 'test_design'],
      },
      sessionToken: {
        type: 'string',
        description: 'セッショントークン（REQ-6: Orchestrator認証用）',
      },
    },
    required: ['type'],
  },
};
