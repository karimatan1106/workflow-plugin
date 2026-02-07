/**
 * REQ-1: テスト結果偽造防止テスト
 *
 * workflowRecordTestResultツールの整合性検証機能をテストする。
 * テスト設計書のTC-1.1〜TC-1.8に基づいて、exitCodeと出力の矛盾を検出することを検証。
 *
 * @spec docs/workflows/ワークフロー1000万行対応強化/test-design.md
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { workflowRecordTestResult } from '../record-test-result.js';
import type { TaskState } from '../../state/types.js';
import { getTaskByIdOrError, safeExecute } from '../helpers.js';
import { stateManager } from '../../state/manager.js';

// ============================================================================
// モック設定
// ============================================================================

vi.mock('../../state/manager.js', () => ({
  stateManager: {
    writeTaskState: vi.fn(),
    getTaskById: vi.fn(),
  },
}));

vi.mock('../helpers.js', () => ({
  getTaskByIdOrError: vi.fn(),
  safeExecute: vi.fn((label, fn) => fn()),
}));

// ============================================================================
// テスト用データ
// ============================================================================

/**
 * モックタスク状態（testingフェーズ）
 */
const createMockTaskState = (overrides?: Partial<TaskState>): TaskState => ({
  taskId: 'test-task-001',
  taskName: 'テストタスク',
  phase: 'testing',
  workflowDir: '/tmp/test-workflow',
  startedAt: '2026-02-07T10:00:00Z',
  checklist: {},
  history: [],
  subPhases: {},
  testResults: [],
  ...overrides,
});

// ============================================================================
// テストスイート
// ============================================================================

describe('workflowRecordTestResult - REQ-1: テスト結果偽造防止', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  // ==========================================================================
  // TC-1.1: exitCode=0 + FAILキーワード → ブロック
  // ==========================================================================

  test('TC-1.1: exitCode=0 + "FAILED"を含むoutput → success: false', () => {
    const mockTaskState = createMockTaskState();

    vi.mocked(getTaskByIdOrError).mockReturnValue({ taskState: mockTaskState });

    const result = workflowRecordTestResult(
      'test-task-001',
      0,
      undefined,
      '✓ should validate input\n✗ should handle errors\n\n5 tests passed, 2 FAILED'
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('失敗を示すキーワード');
    expect(result.message).toContain('exitCodeは0（成功）');
  });

  test('TC-1.2: exitCode=0 + "Error"を含むoutput → success: false', () => {
    const mockTaskState = createMockTaskState();

    vi.mocked(getTaskByIdOrError).mockReturnValue({ taskState: mockTaskState });

    const result = workflowRecordTestResult(
      'test-task-002',
      0,
      undefined,
      'Tests completed. 3 passed, 2 Errors detected in validation. This is a longer output.'
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('失敗を示すキーワード');
  });

  test('TC-1.3: exitCode=0 + "×"を含むoutput → success: false', () => {
    const mockTaskState = createMockTaskState();

    vi.mocked(getTaskByIdOrError).mockReturnValue({ taskState: mockTaskState });

    const result = workflowRecordTestResult(
      'test-task-003',
      0,
      undefined,
      '✓ test 1 passed\n× test 2 failed\n\nTests completed with some failures detected.'
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('失敗を示すキーワード');
  });

  // ==========================================================================
  // TC-1.4: exitCode=1 + "passed"のみ → ブロック
  // ==========================================================================

  test('TC-1.4: exitCode=1 + "all tests passed"含む（FAILなし） → success: false', () => {
    const mockTaskState = createMockTaskState();

    vi.mocked(getTaskByIdOrError).mockReturnValue({ taskState: mockTaskState });

    const result = workflowRecordTestResult(
      'test-task-004',
      1,
      undefined,
      'All tests passed successfully! Great job! Everything is working perfectly.'
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('全テスト成功を示していますが');
    expect(result.message).toContain('exitCodeは非ゼロ（失敗）');
  });

  // ==========================================================================
  // TC-1.5: exitCode=0 + 正常なテスト出力 → 成功
  // ==========================================================================

  test('TC-1.5: exitCode=0 + 正常なテストフレームワーク出力 → success: true', () => {
    const mockTaskState = createMockTaskState();

    vi.mocked(getTaskByIdOrError).mockReturnValue({ taskState: mockTaskState });
    vi.mocked(stateManager.writeTaskState).mockImplementation(() => {});

    // REQ-4: 200文字以上 + フレームワークパターン必須
    const output = 'Test execution\n✓ should validate input (15ms)\n✓ should handle errors (8ms)\n\nTests: 5 passed, 5 total' + ' '.repeat(100);

    const result = workflowRecordTestResult(
      'test-task-005',
      0,
      undefined,
      output
    );

    expect(result.success).toBe(true);
    expect(result.taskId).toBe('test-task-001');
    expect(result.phase).toBe('testing');
    expect(result.result).toBeDefined();
    expect((result as any).result?.exitCode).toBe(0);
    expect((result as any).result?.passedCount).toBe(5);
    expect((result as any).result?.failedCount).toBeUndefined();
  });

  // ==========================================================================
  // TC-1.6: exitCode=1 + "5 tests passed, 2 failed" → 成功
  // ==========================================================================

  test('TC-1.6: exitCode=1 + パスと失敗両方記載 → success: true', () => {
    const mockTaskState = createMockTaskState();

    vi.mocked(getTaskByIdOrError).mockReturnValue({ taskState: mockTaskState });
    vi.mocked(stateManager.writeTaskState).mockImplementation(() => {});

    // REQ-4: 200文字以上必要
    const output = 'Tests: 5 passed, 2 failed, 7 total\n  FAIL src/user.test.ts\n  FAIL src/order.test.ts' + ' '.repeat(117);

    const result = workflowRecordTestResult(
      'test-task-006',
      1,
      undefined,
      output
    );

    expect(result.success).toBe(true);
    expect((result as any).result?.exitCode).toBe(1);
    expect((result as any).result?.passedCount).toBe(5);
    expect((result as any).result?.failedCount).toBe(2);
  });

  // ==========================================================================
  // TC-1.7: テストフレームワーク構造なし → 警告（ブロックしない）
  // ==========================================================================

  test('TC-1.7: exitCode=0 + テストフレームワーク構造なし → REQ-4で真正性検証エラー', () => {
    const mockTaskState = createMockTaskState();

    vi.mocked(getTaskByIdOrError).mockReturnValue({ taskState: mockTaskState });
    vi.mocked(stateManager.writeTaskState).mockImplementation(() => {});

    // REQ-4対応: フレームワーク構造なしの出力は真正性検証でブロックされる
    // 200文字以上だが、フレームワークパターンがない
    const output = 'Everything is fine. No problems detected. ' + 'x'.repeat(160);

    const result = workflowRecordTestResult(
      'test-task-007',
      0,
      undefined,
      output
    );

    // 真正性検証でブロックされる
    expect(result.success).toBe(false);
    expect(result.message).toContain('[真正性検証エラー]');
  });

  // ==========================================================================
  // TC-1.8: スタックトレースを含むexitCode=0 → 警告
  // ==========================================================================

  test('TC-1.8: exitCode=0 + スタックトレース含む → 警告付きで成功', () => {
    const mockTaskState = createMockTaskState();

    vi.mocked(getTaskByIdOrError).mockReturnValue({ taskState: mockTaskState });
    vi.mocked(stateManager.writeTaskState).mockImplementation(() => {});

    // REQ-4: 200文字以上 + フレームワークパターン必須
    const output = 'Test execution\nTests: 5 passed, 5 total\nat UserService.getUser (src/user.ts:10:5)\nExpected 5 but got 10' + ' '.repeat(97);

    const result = workflowRecordTestResult(
      'test-task-008',
      0,
      undefined,
      output
    );

    expect(result.success).toBe(true);
    expect(consoleWarnSpy).toHaveBeenCalled();

    // エラーパターン警告を確認
    const warningCalls = consoleWarnSpy.mock.calls.map(call => call.join(' '));
    const hasErrorPatternWarning = warningCalls.some(msg =>
      msg.includes('エラーパターン') || msg.includes('スタックトレース')
    );
    expect(hasErrorPatternWarning).toBe(true);
  });

  // ==========================================================================
  // output長さ不足のテスト
  // ==========================================================================

  test('TC-1.9: output < 50文字 → ブロック', () => {
    const mockTaskState = createMockTaskState();

    vi.mocked(getTaskByIdOrError).mockReturnValue({ taskState: mockTaskState });

    const result = workflowRecordTestResult(
      'test-task-009',
      0,
      undefined,
      '5 tests passed' // 15文字のみ
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('50文字以上必要');
  });

  // ==========================================================================
  // フェーズチェック
  // ==========================================================================

  test('フェーズ制限: implementation フェーズでは記録できない', () => {
    const mockTaskState = createMockTaskState({ phase: 'implementation' });

    vi.mocked(getTaskByIdOrError).mockReturnValue({ taskState: mockTaskState });

    const result = workflowRecordTestResult(
      'test-task-010',
      0,
      undefined,
      'This is a valid test output with more than 50 characters to meet the requirement.'
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('testing/regression_testフェーズでのみ可能');
  });

  // ==========================================================================
  // 引数検証
  // ==========================================================================

  test('引数検証: exitCode が数値でない → エラー', () => {
    const mockTaskState = createMockTaskState();

    vi.mocked(getTaskByIdOrError).mockReturnValue({ taskState: mockTaskState });

    const result = workflowRecordTestResult(
      'test-task-011',
      undefined as any,
      undefined,
      'This is a valid test output with more than 50 characters to meet the requirement.'
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('exitCodeは数値');
  });

  test('引数検証: output が未指定 → エラー', () => {
    const mockTaskState = createMockTaskState();

    vi.mocked(getTaskByIdOrError).mockReturnValue({ taskState: mockTaskState });

    const result = workflowRecordTestResult(
      'test-task-012',
      0,
      undefined,
      undefined
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('outputパラメータは必須');
  });
});
