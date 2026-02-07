/**
 * workflow_record_test_result ツール - テスト結果を記録
 *
 * testing/regression_testフェーズでのテスト実行結果をTaskStateに記録する。
 *
 * @spec docs/workflows/ワークフロー大規模対応改善/spec.md
 */

import { stateManager } from '../state/manager.js';
import type { ToolResult, PhaseName } from '../state/types.js';
import { getTaskByIdOrError, safeExecute } from './helpers.js';

/**
 * テスト結果を記録
 *
 * @param taskId タスクID（必須）
 * @param exitCode 終了コード（0=成功、非0=失敗）
 * @param summary サマリー（オプション）
 * @returns 記録結果
 */
export function workflowRecordTestResult(
  taskId?: string,
  exitCode?: number,
  summary?: string
): ToolResult {
  // タスク状態を取得
  const result = getTaskByIdOrError(taskId);
  if ('error' in result) {
    return result.error as ToolResult;
  }

  const { taskState } = result;
  const currentPhase = taskState.phase;

  // testing または regression_test フェーズでのみ許可
  if (currentPhase !== 'testing' && currentPhase !== 'regression_test') {
    return {
      success: false,
      message: `テスト結果の記録はtesting/regression_testフェーズでのみ可能です（現在: ${currentPhase}）`,
    };
  }

  // exitCodeの検証
  if (typeof exitCode !== 'number') {
    return {
      success: false,
      message: 'exitCodeは数値で指定してください',
    };
  }

  // テスト結果記録を実行
  return safeExecute('テスト結果記録', () => {
    // 既存のtestResultsを取得（なければ空配列）
    const existingResults = taskState.testResults || [];

    // 新しいテスト結果を追加
    const newResult = {
      phase: currentPhase as 'testing' | 'regression_test',
      exitCode,
      timestamp: new Date().toISOString(),
      summary: summary || undefined,
    };

    const updatedState = {
      ...taskState,
      testResults: [...existingResults, newResult],
    };

    stateManager.writeTaskState(taskState.workflowDir, updatedState);

    return {
      success: true,
      taskId: taskState.taskId,
      phase: currentPhase,
      result: newResult,
      message: `テスト結果を記録しました（exitCode: ${exitCode}）`,
    };
  }) as ToolResult;
}

/**
 * ツール定義（MCP SDK用）
 */
export const recordTestResultToolDefinition = {
  name: 'workflow_record_test_result',
  description: 'テスト実行結果（exitCode）をTaskStateに記録します。testing/regression_testフェーズでのみ使用可能です。',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'タスクID（必須）',
      },
      exitCode: {
        type: 'number',
        description: '終了コード（0=成功、非0=失敗）',
      },
      summary: {
        type: 'string',
        description: 'テスト結果のサマリー（オプション）',
      },
    },
    required: ['exitCode'],
  },
};
