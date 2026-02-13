/**
 * workflow_record_test_result ツール - テスト結果を記録
 *
 * testing/regression_testフェーズでのテスト実行結果をTaskStateに記録する。
 * REQ-1: 整合性検証強化（exitCode と output の矛盾を検出）
 * REQ-4: テスト実行の真正性証明
 *
 * @spec docs/workflows/ワ-クフロ-1000万行対応強化/spec.md
 * @spec docs/workflows/ワ-クフロ-全問題完全解決/spec.md REQ-4
 */

import { stateManager } from '../state/manager.js';
import type { ToolResult } from '../state/types.js';
import { getTaskByIdOrError, safeExecute, verifySessionToken } from './helpers.js';
import {
  validateTestAuthenticity,
  validateTestExecutionTime,
  recordTestOutputHash
} from '../validation/test-authenticity.js';

/** テスト出力の最小文字数 */
const MIN_OUTPUT_LENGTH = 50;

/** テスト出力の保存上限文字数（超過時は末尾のみ保存） */
const MAX_OUTPUT_LENGTH = 500;

/** テスト出力に含まれるべきキーワード */
const TEST_KEYWORDS = [
  'test', 'tests', 'spec', 'passed', 'failed', 'error',
  'assert', 'expect', 'vitest', 'jest', 'mocha',
  'PASS', 'FAIL', 'ok', 'not ok',
];

/** exitCode=0でブロックすべき失敗キーワード（大文字小文字不問） */
const BLOCKING_FAILURE_KEYWORDS = [
  'FAIL',
  'FAILED',
  'ERROR',
  'ERRORS',
  '×',
  '✗',
  'failing',
  'failures',
  'errored',
] as const;

const NEGATION_WORDS = ['0', 'no', 'zero', 'without'] as const;

/** exitCode≠0でブロックすべき成功キーワード（大文字小文字不問） */
const BLOCKING_SUCCESS_KEYWORDS = [
  'all tests passed',
  'tests passed',
  'all passed',
  '100% passed',
] as const;

/** テストフレームワーク構造を示すパターン（正規表現） */
const TEST_FRAMEWORK_PATTERNS = [
  /(\d+)\s+tests?\s+passed/i,                     // "5 tests passed", "1 test passed"
  /Tests:\s*(\d+)\s+passed/i,                      // "Tests: 5 passed, 5 total" (Jest)
  /PASS\s+.*\.(test|spec)\.(ts|js|tsx|jsx)/i,     // "PASS  ./user.test.ts"
  /✓.*test/i,                                      // "✓ should validate input"
  /Test Suites:\s*(\d+)\s+passed/i,                // "Test Suites: 1 passed, 1 total" (Jest)
] as const;

/** エラーパターン（警告用） */
const ERROR_PATTERNS = [
  /at\s+.*\(.*\.(ts|js|tsx|jsx):\d+:\d+\)/,       // スタックトレース
  /Expected.*but got/i,                            // Assertion error
  /(Uncaught|Unhandled)/i,                         // Uncaught exception
] as const;

function isKeywordNegated(output: string, keyword: string): boolean {
  const negationPattern = `\\b(${NEGATION_WORDS.join('|')})\\s+${keyword}\\b`;
  const regex = new RegExp(negationPattern, 'i');
  return regex.test(output);
}

/**
 * テスト出力とexitCodeの整合性を検証（Fail Closed）
 *
 * @param exitCode - テスト終了コード
 * @param output - テスト実行の出力
 * @returns 検証結果 { valid: boolean, reason?: string }
 */
function validateTestOutputConsistency(
  exitCode: number,
  output: string
): { valid: boolean; reason?: string } {

  // AC-1.1: exitCode=0 + FAILキーワード → ブロック
  if (exitCode === 0) {
    // Word boundary を使って単語単位でマッチ
    const hasFailure = BLOCKING_FAILURE_KEYWORDS.some(kw => {
      // 記号（×、✗）はそのままマッチ
      if (kw === '×' || kw === '✗') {
        return output.includes(kw);
      }
      // 大文字のキーワード（FAIL, FAILED, ERROR, ERRORS）:
      // 最初の文字が大文字の場合のみマッチ（"Errors", "ERROR", "Error" はマッチ、"errors" はマッチしない）
      // 小文字のキーワード（failing, failures, errored）は大文字小文字不問
      const isUpperCase = kw === kw.toUpperCase();
      if (isUpperCase) {
        // First letter capitalized (Error, Errors, ERROR, ERRORS etc.)
        const firstChar = kw.charAt(0);
        const rest = kw.slice(1).toLowerCase();
        const pattern = new RegExp(`\\b${firstChar}${rest}\\b`, 'i');
        // But only match if the actual matched text starts with uppercase
        const matches = output.match(new RegExp(`\\b(${firstChar}${rest})\\b`, 'gi')) || [];
        return matches.some(match => match.charAt(0) === match.charAt(0).toUpperCase());
      } else {
        // 小文字のキーワード: 否定語コンテキスト判定後にマッチ
        if (isKeywordNegated(output, kw)) {
          return false;
        }
        const pattern = new RegExp(`\\b${kw}\\b`, 'i');
        return pattern.test(output);
      }
    });
    if (hasFailure) {
      return {
        valid: false,
        reason: 'テスト出力に失敗を示すキーワードが含まれていますが、exitCodeは0（成功）です。出力内容とexitCodeに矛盾があります。',
      };
    }
  }

  // AC-1.2: exitCode≠0 + PASSのみ → ブロック
  if (exitCode !== 0) {
    const hasOnlySuccess = BLOCKING_SUCCESS_KEYWORDS.some(kw =>
      output.toLowerCase().includes(kw.toLowerCase())
    );
    const hasFailure = BLOCKING_FAILURE_KEYWORDS.some(kw => {
      if (kw === '×' || kw === '✗') {
        return output.includes(kw);
      }
      const isUpperCase = kw === kw.toUpperCase();
      if (isUpperCase) {
        const firstChar = kw.charAt(0);
        const rest = kw.slice(1).toLowerCase();
        const matches = output.match(new RegExp(`\\b(${firstChar}${rest})\\b`, 'gi')) || [];
        return matches.some(match => match.charAt(0) === match.charAt(0).toUpperCase());
      } else {
        if (isKeywordNegated(output, kw)) {
          return false;
        }
        const pattern = new RegExp(`\\b${kw}\\b`, 'i');
        return pattern.test(output);
      }
    });
    if (hasOnlySuccess && !hasFailure) {
      return {
        valid: false,
        reason: 'テスト出力は全テスト成功を示していますが、exitCodeは非ゼロ（失敗）です。出力内容とexitCodeに矛盾があります。',
      };
    }
  }

  return { valid: true };
}

/**
 * 正規表現マッチから数値を安全に抽出
 * @param output テキスト
 * @param patterns 正規表現パターンの配列
 * @returns パースされた数値、またはundefined
 */
function extractNumberFromPatterns(
  output: string,
  patterns: RegExp[]
): number | undefined {
  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
  }
  return undefined;
}

/**
 * テスト件数を出力テキストから抽出
 *
 * jest形式: "Tests: 5 passed, 2 failed, 7 total"
 * vitest形式: "Tests  42 passed (42)"
 */
function extractTestCounts(output: string): { passedCount?: number; failedCount?: number } {
  const passPatterns = [
    /Tests:\s+(\d+)\s+passed/,   // jest形式: "Tests: 5 passed, 5 total"
    /Tests\s+(\d+)\s+passed/,    // vitest形式: "Tests  42 passed (42)"
    /(\d+)\s+tests?\s+passed/,   // 汎用形式: "5 tests passed" or "1 test passed"
    /(\d+)\s+passed/,            // 最小形式: "5 passed"
  ];

  const failPatterns = [
    /(?:Tests:\s*)?(\d+)\s+failed/,  // jest形式
    /(\d+)\s+failed/,                // 汎用形式
  ];

  return {
    passedCount: extractNumberFromPatterns(output, passPatterns),
    failedCount: extractNumberFromPatterns(output, failPatterns),
  };
}

/**
 * テスト結果を記録
 *
 * @param taskId タスクID（必須）
 * @param exitCode 終了コード（0=成功、非0=失敗）
 * @param summary サマリー（オプション）
 * @param output テスト実行の出力（必須、50文字以上）
 * @param sessionToken セッショントークン（オプション、REQ-6）
 * @returns 記録結果
 */
export function workflowRecordTestResult(
  taskId?: string,
  exitCode?: number,
  summary?: string,
  output?: string,
  sessionToken?: string
): ToolResult {
  // タスク状態を取得
  const result = getTaskByIdOrError(taskId);
  if ('error' in result) {
    return result.error as ToolResult;
  }

  const { taskState } = result;

  // REQ-6: セッショントークン検証
  const tokenError = verifySessionToken(taskState, sessionToken);
  if (tokenError) return tokenError as ToolResult;
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

  // REQ-2: output最小長チェック
  if (output.length < MIN_OUTPUT_LENGTH) {
    return {
      success: false,
      message: `outputは${MIN_OUTPUT_LENGTH}文字以上必要です。テスト実行の完全な出力を指定してください`,
    };
  }

  // REQ-1: 整合性検証（Fail Closed）
  const validation = validateTestOutputConsistency(exitCode, output);
  if (!validation.valid) {
    return {
      success: false,
      message: validation.reason,
    };
  }

  // REQ-4: テスト実行の真正性検証
  // フェーズ開始時刻をタスク状態の履歴から取得
  // 現在のフェーズに遷移した最新のエントリを探す
  const phaseEntry = [...taskState.history]
    .reverse()
    .find(entry => entry.phase === currentPhase && entry.action === 'phase_start');
  const phaseStartedAt = phaseEntry?.timestamp || taskState.startedAt;

  const authenticityValidation = validateTestAuthenticity(output, exitCode, phaseStartedAt);
  if (!authenticityValidation.valid) {
    return {
      success: false,
      message: `[真正性検証エラー] ${authenticityValidation.reason}`,
    };
  }

  // REQ-C2: テスト実行時間の妥当性チェック
  const testStartTime = new Date(phaseStartedAt).getTime();
  const testEndTime = Date.now();
  const executionTimeValidation = validateTestExecutionTime(testStartTime, testEndTime);
  if (!executionTimeValidation.valid) {
    return {
      success: false,
      message: `[実行時間検証エラー] ${executionTimeValidation.reason}`,
    };
  }

  // REQ-C2: テスト出力ハッシュの記録と重複チェック
  const existingHashes = taskState.testOutputHashes || [];
  const hashValidation = recordTestOutputHash(output, existingHashes);
  if (!hashValidation.valid) {
    return {
      success: false,
      message: `[出力重複検証エラー] ${hashValidation.reason}`,
    };
  }

  // AC-1.3: テストフレームワーク構造なし → 警告（ブロックしない）
  const hasFrameworkStructure = TEST_FRAMEWORK_PATTERNS.some(pattern =>
    pattern.test(output)
  );
  if (!hasFrameworkStructure) {
    console.warn('[record-test-result] テストフレームワークの構造が検出されませんでした。テスト実行の出力であることを確認してください。');
  }

  // エラーパターン検出（警告のみ）
  const hasErrorPattern = ERROR_PATTERNS.some(pattern => pattern.test(output));
  if (hasErrorPattern) {
    console.warn('[record-test-result] テスト出力にエラーパターン（スタックトレース等）が含まれています。テスト結果を確認してください。');
  }

  // テスト結果記録を実行
  return safeExecute('テスト結果記録', () => {
    // 既存のtestResultsを取得（なければ空配列）
    const existingResults = taskState.testResults || [];

    // REQ-2: テスト件数を自動抽出
    const counts = extractTestCounts(output);

    // REQ-2: outputが上限を超える場合は末尾のみ保存
    const truncatedOutput = output.length > MAX_OUTPUT_LENGTH ? output.slice(-MAX_OUTPUT_LENGTH) : output;

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

    // REQ-C2: 新しいハッシュを追加
    const updatedHashes = [...existingHashes, hashValidation.hash];

    const updatedState = {
      ...taskState,
      testResults: [...existingResults, newResult],
      testOutputHashes: updatedHashes,
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
      sessionToken: {
        type: 'string',
        description: 'セッショントークン（REQ-6: Orchestrator認証用）',
      },
    },
    required: ['taskId', 'exitCode', 'output'],
  },
};
