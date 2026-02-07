/**
 * workflow_record_test_result ツール - テスト結果を記録
 *
 * testing/regression_testフェーズでのテスト実行結果をTaskStateに記録する。
 * REQ-2: outputパラメータ必須化、テストキーワード検証、件数自動抽出。
 *
 * @spec docs/workflows/ワ-クフロ-大規模対応根本改修/spec.md
 */

import { stateManager } from '../state/manager.js';
import type { ToolResult } from '../state/types.js';
import { getTaskByIdOrError, safeExecute } from './helpers.js';

/** テスト出力に含まれるべきキーワード */
const TEST_KEYWORDS = [
  'test', 'tests', 'spec', 'passed', 'failed', 'error',
  'assert', 'expect', 'vitest', 'jest', 'mocha',
  'PASS', 'FAIL', 'ok', 'not ok',
];

/** 失敗を示すキーワード */
const FAILURE_KEYWORDS = ['FAIL', 'failed', 'error', 'Error'];

/**
 * 正規表現マッチから数値を安全に抽出
 * @param match 正規表現マッチ結果
 * @param index キャプチャグループのインデックス
 * @returns パースされた数値、またはundefined
 */
function extractNumber(match: RegExpMatchArray | null, index: number): number | undefined {
  return match ? parseInt(match[index], 10) : undefined;
}

/**
 * テスト件数を出力テキストから抽出
 *
 * jest形式: "Tests: 5 passed, 2 failed, 7 total"
 * vitest形式: "Tests  42 passed (42)"
 */
function extractTestCounts(output: string): { passedCount?: number; failedCount?: number } {
  const patterns = [
    /Tests:\s+(\d+)\s+passed/,   // jest形式: "Tests: 5 passed, 5 total"
    /Tests\s+(\d+)\s+passed/,    // vitest形式: "Tests  42 passed (42)"
    /(\d+)\s+passed/,            // 汎用形式
  ];

  const result: { passedCount?: number; failedCount?: number } = {};

  // passed カウント抽出
  for (const pattern of patterns) {
    result.passedCount = extractNumber(output.match(pattern), 1);
    if (result.passedCount !== undefined) break;
  }

  // failed カウント抽出
  const failPatterns = [
    /(?:Tests:\s*)?(\d+)\s+failed/,  // jest形式
    /(\d+)\s+failed/,                // 汎用形式
  ];
  for (const pattern of failPatterns) {
    result.failedCount = extractNumber(output.match(pattern), 1);
    if (result.failedCount !== undefined) break;
  }

  return result;
}

/**
 * テスト結果を記録
 *
 * @param taskId タスクID（必須）
 * @param exitCode 終了コード（0=成功、非0=失敗）
 * @param summary サマリー（オプション）
 * @param output テスト実行の出力（必須、50文字以上）
 * @returns 記録結果
 */
export function workflowRecordTestResult(
  taskId?: string,
  exitCode?: number,
  summary?: string,
  output?: string
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

  // REQ-2: outputパラメータ必須チェック
  if (!output || typeof output !== 'string') {
    return {
      success: false,
      message: 'outputパラメータは必須です。テスト実行の出力を指定してください',
    };
  }

  // REQ-2: output最小長チェック（50文字以上）
  if (output.length < 50) {
    return {
      success: false,
      message: 'outputは50文字以上必要です。テスト実行の完全な出力を指定してください',
    };
  }

  // REQ-2: テストキーワード存在チェック（警告のみ）
  const hasTestKeyword = TEST_KEYWORDS.some(kw =>
    output.toLowerCase().includes(kw.toLowerCase())
  );
  if (!hasTestKeyword) {
    console.warn('[record-test-result] テスト関連キーワードが見つかりません。テスト実行の出力であることを確認してください');
  }

  // REQ-2: exitCode=0 + 失敗キーワード矛盾チェック（警告のみ）
  if (exitCode === 0) {
    const hasFailureKeyword = FAILURE_KEYWORDS.some(kw => output.includes(kw));
    if (hasFailureKeyword) {
      console.warn('[record-test-result] exitCode=0ですが、出力に失敗を示すキーワードが含まれています。結果を確認してください');
    }
  }

  // テスト結果記録を実行
  return safeExecute('テスト結果記録', () => {
    // 既存のtestResultsを取得（なければ空配列）
    const existingResults = taskState.testResults || [];

    // REQ-2: テスト件数を自動抽出
    const counts = extractTestCounts(output);

    // REQ-2: outputが500文字を超える場合は末尾500文字のみ保存
    const truncatedOutput = output.length > 500 ? output.slice(-500) : output;

    // 新しいテスト結果を追加
    const newResult = {
      phase: currentPhase as 'testing' | 'regression_test',
      exitCode,
      timestamp: new Date().toISOString(),
      summary: summary || undefined,
      output: truncatedOutput,
      passedCount: counts.passedCount,
      failedCount: counts.failedCount,
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
  description: 'テスト実行結果（exitCode + output）をTaskStateに記録します。testing/regression_testフェーズでのみ使用可能です。',
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
      output: {
        type: 'string',
        description: 'テスト実行の出力（必須、50文字以上）',
      },
    },
    required: ['exitCode', 'output'],
  },
};
