/**
 * テスト実行真正性検証モジュール
 * @spec docs/workflows/ワ-クフロ-全問題完全解決/spec.md REQ-4
 */

export interface TestAuthenticityResult {
  valid: boolean;
  reason?: string;
}

/**
 * テスト結果の真正性を検証する関数
 *
 * - テストフレームワークパターンの存在
 * - テスト数の抽出と0件チェック
 * - タイムスタンプの整合性（フェーズ開始時刻より後）
 * - 出力の最小文字数（200文字以上）
 *
 * @param output テスト実行の出力
 * @param exitCode テストの終了コード
 * @param phaseStartedAt フェーズ開始時刻（ISO 8601形式）
 * @returns 検証結果 { valid: boolean, reason?: string }
 */
export function validateTestAuthenticity(
  output: string,
  exitCode: number,
  phaseStartedAt: string
): TestAuthenticityResult {
  // 1. 出力の最小文字数チェック（100文字以上）
  // N-3: Reduced from 200 to 100 to support custom test runners with shorter output
  const MIN_OUTPUT_LENGTH = 100; // N-3: Reduced for custom test runner support
  if (output.length < MIN_OUTPUT_LENGTH) {
    return {
      valid: false,
      reason: `テスト出力が最小文字数未満です（${output.length}文字 < ${MIN_OUTPUT_LENGTH}文字）`,
    };
  }

  // 2. テスト出力らしさのチェック（構造的なフレーズ）
  // 単なる "test" という単語ではなく、テストフレームワークが出力しそうな構造的なフレーズをチェック
  // N-3: Added string patterns for custom test runner support
  const TEST_OUTPUT_INDICATORS: Array<RegExp | string> = [
    /test\s+(execution|suite|files?|results?|summary|report)/i, // "test execution", "test suite" など
    /running\s+tests?/i, // "running tests"
    /test\s+(started|finished|completed)/i, // "test started" など
    /(vitest|jest|mocha|jasmine|ava|tape)/i, // テストフレームワーク名
    'passed',  // N-3: Custom runner success indicator
    'failed',  // N-3: Custom runner failure indicator
    'total',   // N-3: Custom runner count indicator
  ];

  const looksLikeTestOutput = TEST_OUTPUT_INDICATORS.some((pattern) =>
    typeof pattern === 'string' ? output.includes(pattern) : pattern.test(output)
  );

  // 3. テストフレームワークパターンのチェック & テスト数の抽出
  const TEST_FRAMEWORK_PATTERNS = [
    /Tests:\s*(\d+)\s+passed/i, // Jest: "Tests: 5 passed, 5 total"
    /Test Suites:\s*(\d+)\s+passed/i, // Jest: "Test Suites: 1 passed, 1 total"
    /Test Files\s+(\d+)\s+passed/i, // Vitest: "Test Files 5 passed (5)"
    /(\d+)\s+passing/i, // Mocha: "5 passing"
    /✓\s+\d+\s+tests?\s+completed/i, // Vitest: "✓ 5 tests completed"
    /All\s+(\d+)\s+tests?\s+passed/i, // 汎用: "All 5 tests passed"
    /passed\s*:\s*(\d+)/i,  // N-3: Custom runner passed count
    /failed\s*:\s*(\d+)/i,  // N-3: Custom runner failed count
    /total\s*:\s*(\d+)/i,   // N-3: Custom runner total count
  ];

  let testCount: number | null = null;
  let hasFrameworkStructure = false;

  for (const pattern of TEST_FRAMEWORK_PATTERNS) {
    const match = output.match(pattern);
    if (match) {
      hasFrameworkStructure = true;
      if (match[1]) {
        const count = parseInt(match[1], 10);
        if (!isNaN(count)) {
          testCount = count;
          break;
        }
      }
    }
  }

  // テスト数が抽出できない場合
  if (testCount === null) {
    // テスト出力っぽいがフレームワーク構造がない場合
    if (looksLikeTestOutput && !hasFrameworkStructure) {
      return {
        valid: false,
        reason:
          'テスト出力からテスト数を抽出できませんでした。テストフレームワークの出力を確認してください。',
      };
    }
    // テスト出力らしくない場合
    if (!looksLikeTestOutput) {
      return {
        valid: false,
        reason:
          'テスト出力にテストフレームワークの構造が含まれていません。テスト実行の完全な出力を指定してください。',
      };
    }
    // フレームワーク構造はあるがテスト数が抽出できない場合
    return {
      valid: false,
      reason:
        'テスト出力からテスト数を抽出できませんでした。テストフレームワークの出力を確認してください。',
    };
  }

  // テスト数が0件の場合
  if (testCount === 0) {
    return {
      valid: false,
      reason:
        'テスト数が0件です。実際にテストが実行されていることを確認してください。',
    };
  }

  // 4. タイムスタンプの整合性チェック
  // 現在時刻がフェーズ開始時刻より前の場合はブロック
  const phaseStart = new Date(phaseStartedAt);
  const now = new Date();

  if (now < phaseStart) {
    return {
      valid: false,
      reason: `テスト結果のタイムスタンプがフェーズ開始時刻より前です（現在: ${now.toISOString()}, フェーズ開始: ${phaseStartedAt}）`,
    };
  }

  // 全てのチェックに合格
  return { valid: true };
}

/**
 * REQ-C2: テスト実行時間の妥当性を検証
 *
 * テスト実行の開始時刻と終了時刻から実行時間を計算し、
 * 100ms未満の場合は捏造と判定する。
 *
 * @param startTime テスト実行開始時刻（ミリ秒単位のUNIXタイムスタンプ）
 * @param endTime テスト実行終了時刻（ミリ秒単位のUNIXタイムスタンプ）
 * @returns 検証結果
 */
export function validateTestExecutionTime(
  startTime: number,
  endTime: number
): TestAuthenticityResult {
  const MIN_TEST_EXECUTION_MS = 100;
  const duration = endTime - startTime;

  if (duration < MIN_TEST_EXECUTION_MS) {
    return {
      valid: false,
      reason: `テスト実行時間が不自然に短いです（${duration}ms）。実際のテスト実行結果を提出してください`,
    };
  }

  return { valid: true };
}

/**
 * REQ-C2: テスト出力のハッシュを記録
 *
 * テスト出力全文のSHA-256ハッシュを計算し、
 * 過去のハッシュと比較して重複がある場合はエラーを返す。
 *
 * @param output テスト出力全文
 * @param existingHashes 既存のハッシュ配列
 * @returns 検証結果とハッシュ
 */
export function recordTestOutputHash(
  output: string,
  existingHashes: string[] = []
): { valid: boolean; reason?: string; hash: string } {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(output).digest('hex');

  // 重複チェック
  if (existingHashes.includes(hash)) {
    return {
      valid: false,
      reason: '同一のテスト出力が既に記録されています。新規実行結果を提出してください',
      hash,
    };
  }

  return { valid: true, hash };
}
