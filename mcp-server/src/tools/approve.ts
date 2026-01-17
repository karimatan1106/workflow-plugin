/**
 * workflow_approve ツール - レビュー承認
 *
 * レビューフェーズでユーザー承認を行い、次のフェーズへ遷移する。
 *
 * @spec docs/specs/domains/workflow/mcp-server.md
 */

import { stateManager } from '../state/manager.js';
import type { ApproveResult } from '../state/types.js';
import { APPROVE_TYPE_MAPPING } from '../phases/definitions.js';
import { getTaskStateOrError, validateRequiredString, safeExecute } from './helpers.js';
import { MISSING_PARAM_ERRORS, phaseNotMatchError } from '../utils/errors.js';

/**
 * レビューを承認
 *
 * @param type 承認タイプ（'design'など）
 * @returns 承認結果
 */
export function workflowApprove(type: string): ApproveResult {
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

  // タスクと状態を取得
  const result = getTaskStateOrError();
  if ('error' in result) {
    return result.error as ApproveResult;
  }

  const { task, taskState } = result;
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
    stateManager.updateTaskPhase(task.taskId, nextPhase);

    return {
      success: true,
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
  description: 'レビューフェーズを承認します。design_reviewフェーズでは "design" を指定します。',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        description: '承認タイプ（design）',
        enum: ['design'],
      },
    },
    required: ['type'],
  },
};
