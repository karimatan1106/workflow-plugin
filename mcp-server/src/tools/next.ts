/**
 * workflow_next ツール - 次フェーズへ遷移
 *
 * 指定されたタスクを次のフェーズへ遷移する。
 * レビューフェーズでは承認が、並列フェーズでは全サブフェーズの完了が必要。
 *
 * @spec docs/workflows/ワ-クフロ-並列タスク対応/spec.md
 */

import { stateManager } from '../state/manager.js';
import type { NextResult, TaskSize, TaskState } from '../state/types.js';
import { DEFAULT_TASK_SIZE } from '../state/types.js';
import {
  requiresApproval,
  isParallelPhase,
  getNextPhase,
  PHASE_DESCRIPTIONS,
} from '../phases/definitions.js';
import { getTaskByIdOrError, safeExecute } from './helpers.js';
import { STATE_ERRORS } from '../utils/errors.js';
import { DesignValidator, formatValidationError } from '../validation/design-validator.js';

/**
 * 設計-実装整合性チェックを実行
 *
 * @param docsDir ドキュメントディレクトリ
 * @returns エラーがある場合はエラー結果、ない場合は null
 */
function performDesignValidation(docsDir: string): NextResult | null {
  if (process.env.SKIP_DESIGN_VALIDATION) {
    return null;
  }

  const validator = new DesignValidator(docsDir);
  const validationResult = validator.validateAll();

  if (!validationResult.passed) {
    const strict = process.env.VALIDATE_DESIGN_STRICT !== 'false';

    if (strict) {
      return {
        success: false,
        message: formatValidationError(validationResult),
      };
    } else {
      // 警告モード: ログ出力のみ
      console.warn('[設計検証] 警告モード - 未実装項目があります');
      console.warn(formatValidationError(validationResult));
    }
  }

  return null;
}

/**
 * 次のフェーズへ遷移
 *
 * @param taskId タスクID（必須）
 * @returns 遷移結果
 */
export function workflowNext(taskId?: string): NextResult {
  // タスク状態を取得
  const result = getTaskByIdOrError(taskId);
  if ('error' in result) {
    return result.error as NextResult;
  }

  const { taskState } = result;
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
    const incompleteSubPhases = stateManager.getIncompleteSubPhases(taskState.taskId);
    if (incompleteSubPhases.length > 0) {
      return {
        success: false,
        message: `並列フェーズの未完了サブフェーズがあります: ${incompleteSubPhases.join(', ')}。workflow_complete_sub で完了してください`,
      };
    }
  }

  // REQ-2: testing → regression_test 遷移時のテスト結果検証
  if (currentPhase === 'testing') {
    const testResult = getLatestTestResult(taskState, 'testing');
    if (!testResult) {
      return {
        success: false,
        message: 'テスト結果が記録されていません。workflow_record_test_result でテスト結果を記録してください',
      };
    }
    if (testResult.exitCode !== 0) {
      return {
        success: false,
        message: `テストが失敗しています（exitCode: ${testResult.exitCode}）。テストを修正してから次フェーズに進んでください`,
      };
    }
  }

  // REQ-2: regression_test → parallel_verification 遷移時のテスト結果検証
  if (currentPhase === 'regression_test') {
    const testResult = getLatestTestResult(taskState, 'regression_test');
    if (!testResult) {
      return {
        success: false,
        message: 'リグレッションテスト結果が記録されていません。workflow_record_test_result でテスト結果を記録してください',
      };
    }
    if (testResult.exitCode !== 0) {
      return {
        success: false,
        message: `リグレッションテストが失敗しています（exitCode: ${testResult.exitCode}）。テストを修正してから次フェーズに進んでください`,
      };
    }
  }

  // 設計-実装整合性チェック（test_impl → implementation 遷移時）
  if (currentPhase === 'test_impl') {
    const docsDir = taskState.docsDir || taskState.workflowDir;
    const validationError = performDesignValidation(docsDir);
    if (validationError) {
      return validationError;
    }
  }

  // 設計-実装整合性チェック（refactoring → parallel_quality 遷移時）
  if (currentPhase === 'refactoring') {
    const docsDir = taskState.docsDir || taskState.workflowDir;
    const validationError = performDesignValidation(docsDir);
    if (validationError) {
      return validationError;
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
    stateManager.updateTaskPhase(taskState.taskId, nextPhase);

    return {
      success: true,
      taskId: taskState.taskId,
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
 * 最新のテスト結果を取得
 *
 * @param taskState タスク状態
 * @param phase テストフェーズ（'testing' または 'regression_test'）
 * @returns 最新のテスト結果、または undefined
 */
function getLatestTestResult(
  taskState: TaskState,
  phase: 'testing' | 'regression_test'
): { phase: 'testing' | 'regression_test'; exitCode: number; timestamp: string; summary?: string } | undefined {
  const results = taskState.testResults || [];
  const phaseResults = results.filter(r => r.phase === phase);
  if (phaseResults.length === 0) {
    return undefined;
  }
  // 最新のタイムスタンプのものを返す
  return phaseResults.sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
}

/**
 * ツール定義（MCP SDK用）
 *
 * MCPサーバーがクライアントに公開するツールのスキーマ定義。
 */
export const nextToolDefinition = {
  name: 'workflow_next',
  description: '指定されたタスクを次のフェーズへ遷移します。レビューフェーズでは承認が必要です。並列フェーズでは全サブフェーズの完了が必要です。',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'タスクID（必須）',
      },
    },
    required: [],
  },
};
