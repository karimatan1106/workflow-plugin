/**
 * REQ-2: record-test-result.ts outputパラメータ検証テスト
 *
 * テスト実行の証拠としてoutputパラメータを必須化し、
 * テスト件数を自動抽出する機能をテストする。
 *
 * @spec docs/workflows/ワ-クフロ-大規模対応根本改修/test-design.md
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { workflowRecordTestResult } from '../record-test-result.js';
import { stateManager } from '../../state/manager.js';
import type { TaskState } from '../../state/types.js';

interface RecordResult {
  success: boolean;
  message?: string;
  result?: {
    phase: string;
    exitCode: number;
    output?: string;
    passedCount?: number;
    failedCount?: number;
  };
}

// stateManagerをモック化
vi.mock('../../state/manager.js', () => ({
  stateManager: {
    getTaskById: vi.fn(),
    writeTaskState: vi.fn(),
  },
}));

describe('REQ-2: テスト実行の証拠検証', () => {
  const mockTaskId = 'test_20260207_130000';

  function createTaskState(phase: string = 'testing'): TaskState {
    return {
      taskId: mockTaskId,
      taskName: 'Test Task',
      phase: phase as TaskState['phase'],
      workflowDir: '/tmp/test-workflow',
      startedAt: '2026-02-07T00:00:00Z',
      checklist: {},
      history: [],
      subPhases: {},
      testResults: [],
    };
  }

  // 50文字以上のテスト出力を生成するヘルパー
  function makeOutput(content: string, minLength: number = 100): string {
    if (content.length >= minLength) return content;
    return content + ' '.repeat(minLength - content.length);
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-2.1: outputなし→エラー
  test('TC-2.1: outputなしで記録→エラー', () => {
    vi.mocked(stateManager.getTaskById).mockReturnValue(createTaskState());

    const result = workflowRecordTestResult(mockTaskId, 0, 'summary') as RecordResult;

    expect(result.success).toBe(false);
    expect(result.message).toContain('output');
  });

  // TC-2.6: output50文字未満→エラー
  test('TC-2.6: output50文字未満→エラー', () => {
    vi.mocked(stateManager.getTaskById).mockReturnValue(createTaskState());

    const result = workflowRecordTestResult(mockTaskId, 0, 'summary', 'short') as RecordResult;

    expect(result.success).toBe(false);
    expect(result.message).toContain('50');
  });

  // TC-2.2: 正常なテスト出力→成功+件数抽出
  test('TC-2.2: 正常なテスト出力→成功、passedCount抽出', () => {
    vi.mocked(stateManager.getTaskById).mockReturnValue(createTaskState());

    const output = makeOutput('Test Suites: 1 passed, 1 total\nTests: 5 passed, 5 total\nTime: 1.2s');
    const result = workflowRecordTestResult(mockTaskId, 0, 'all passed', output) as RecordResult;

    expect(result.success).toBe(true);
    expect(result.result?.passedCount).toBe(5);
  });

  // TC-2.3: テストキーワードなし→警告+成功
  test('TC-2.3: テストキーワードなし→警告ログ、記録は成功', () => {
    vi.mocked(stateManager.getTaskById).mockReturnValue(createTaskState());
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const output = makeOutput('aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk llll mmmm');
    const result = workflowRecordTestResult(mockTaskId, 0, 'summary', output) as RecordResult;

    expect(result.success).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('テストフレームワーク'));

    warnSpy.mockRestore();
  });

  // TC-2.4: exitCode=0 + FAIL含む→ブロック（REQ-1強化: 整合性チェック）
  test('TC-2.4: exitCode=0 + FAIL含む→ブロック', () => {
    vi.mocked(stateManager.getTaskById).mockReturnValue(createTaskState());

    const output = makeOutput('FAIL src/backend/auth/login.test.ts - some test description here with details');
    const result = workflowRecordTestResult(mockTaskId, 0, 'summary', output) as RecordResult;

    expect(result.success).toBe(false);
    expect(result.message).toBeDefined();
  });

  // TC-2.5: テスト件数の抽出（passed+failed）
  test('TC-2.5: passed/failed件数を抽出', () => {
    vi.mocked(stateManager.getTaskById).mockReturnValue(createTaskState());

    const output = makeOutput('Tests: 8 passed, 2 failed, 10 total\nTest Suites: 2 passed, 1 failed');
    const result = workflowRecordTestResult(mockTaskId, 1, 'some failed', output) as RecordResult;

    expect(result.success).toBe(true);
    expect(result.result?.passedCount).toBe(8);
    expect(result.result?.failedCount).toBe(2);
  });

  // TC-RTO-1: outputが500文字以上→末尾500文字のみ保存
  test('TC-RTO-1: outputが500文字以上→末尾500文字のみ保存', () => {
    vi.mocked(stateManager.getTaskById).mockReturnValue(createTaskState());

    const longOutput = 'x'.repeat(400) + ' 5 tests passed ' + 'y'.repeat(500);
    const result = workflowRecordTestResult(mockTaskId, 0, 'ok', longOutput) as RecordResult;

    expect(result.success).toBe(true);
    // writeTaskStateに渡されるoutputが500文字以下であることを確認
    const savedState = vi.mocked(stateManager.writeTaskState).mock.calls[0]?.[1] as TaskState;
    const savedOutput = savedState?.testResults?.[0]?.output;
    expect(savedOutput).toBeDefined();
    expect(savedOutput!.length).toBeLessThanOrEqual(500);
  });

  // TC-RTO-2: regression_testフェーズでも動作
  test('TC-RTO-2: regression_testフェーズでも動作', () => {
    vi.mocked(stateManager.getTaskById).mockReturnValue(createTaskState('regression_test'));

    const output = makeOutput('Tests: 10 passed, 10 total - regression test run complete');
    const result = workflowRecordTestResult(mockTaskId, 0, 'ok', output) as RecordResult;

    expect(result.success).toBe(true);
    expect(result.result?.phase).toBe('regression_test');
  });

  // TC-RTO-3: vitest形式パース
  test('TC-RTO-3: vitest形式の出力パース', () => {
    vi.mocked(stateManager.getTaskById).mockReturnValue(createTaskState());

    const output = makeOutput('Tests  42 passed (42)\nDuration  3.21s\nTest Files  5 passed (5)');
    const result = workflowRecordTestResult(mockTaskId, 0, 'ok', output) as RecordResult;

    expect(result.success).toBe(true);
    expect(result.result?.passedCount).toBe(42);
  });

  // TC-RTO-4: jest形式パース
  test('TC-RTO-4: jest形式の出力パース', () => {
    vi.mocked(stateManager.getTaskById).mockReturnValue(createTaskState());

    const output = makeOutput('Tests: 3 failed, 39 passed, 42 total\nTest Suites: 1 failed, 4 passed');
    const result = workflowRecordTestResult(mockTaskId, 1, 'some failed', output) as RecordResult;

    expect(result.success).toBe(true);
    expect(result.result?.failedCount).toBe(3);
    expect(result.result?.passedCount).toBe(39);
  });

  // TC-RTO-5: exitCode未指定→エラー
  test('TC-RTO-5: exitCode未指定→エラー', () => {
    vi.mocked(stateManager.getTaskById).mockReturnValue(createTaskState());

    const result = workflowRecordTestResult(mockTaskId, undefined, 'ok', makeOutput('test output')) as RecordResult;

    expect(result.success).toBe(false);
    expect(result.message).toContain('exitCode');
  });

  // TC-RTO-6: 不正フェーズ→エラー
  test('TC-RTO-6: implementationフェーズ→エラー', () => {
    vi.mocked(stateManager.getTaskById).mockReturnValue(createTaskState('implementation'));

    const result = workflowRecordTestResult(mockTaskId, 0, 'ok', makeOutput('test output')) as RecordResult;

    expect(result.success).toBe(false);
    expect(result.message).toContain('testing/regression_test');
  });
});
