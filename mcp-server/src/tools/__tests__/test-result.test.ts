/**
 * workflow_record_test_result ツールのテスト
 *
 * REQ-2: テスト結果の検証
 * - テスト結果記録成功（testing、regression_test）
 * - 不正なフェーズでエラー
 * - exitCodeが数値でない場合エラー
 * - 複数回記録可能
 *
 * @spec docs/workflows/ワ-クフロ-大規模対応改善/test-design.md
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { workflowRecordTestResult } from '../record-test-result.js';
import { stateManager } from '../../state/manager.js';
import type { TaskState } from '../../state/types.js';

interface TestResultResponse {
  success: boolean;
  message?: string;
  result?: { exitCode: number; phase: string; summary?: string; timestamp: string };
}

// stateManagerをモック化
vi.mock('../../state/manager.js', () => ({
  stateManager: {
    getTaskById: vi.fn(),
    writeTaskState: vi.fn(),
  },
}));

describe('workflowRecordTestResult', () => {
  const mockTaskId = 'test_20260207_120000';
  let mockTaskState: TaskState;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTaskState = {
      taskId: mockTaskId,
      taskName: 'Test Task',
      phase: 'testing',
      workflowDir: '/test/workflow',
      startedAt: '2026-02-07T12:00:00Z',
      checklist: {},
      history: [],
      subPhases: {},
    };

    vi.mocked(stateManager.getTaskById).mockReturnValue(mockTaskState);
  });

  // TC-2.1: テスト結果記録成功（testing）
  test('should record test result in testing phase', () => {
    const result = workflowRecordTestResult(mockTaskId, 0, 'All tests passed') as TestResultResponse;

    expect(result.success).toBe(true);
    expect(result.result?.exitCode).toBe(0);
    expect(result.result?.phase).toBe('testing');
    expect(result.result?.summary).toBe('All tests passed');
    expect(result.message).toContain('exitCode: 0');
    expect(stateManager.writeTaskState).toHaveBeenCalled();
  });

  // TC-2.2: テスト結果記録成功（regression_test）
  test('should record test result in regression_test phase', () => {
    mockTaskState.phase = 'regression_test';
    vi.mocked(stateManager.getTaskById).mockReturnValue(mockTaskState);

    const result = workflowRecordTestResult(mockTaskId, 1, '3 tests failed') as TestResultResponse;

    expect(result.success).toBe(true);
    expect(result.result?.exitCode).toBe(1);
    expect(result.result?.phase).toBe('regression_test');
    expect(result.result?.summary).toBe('3 tests failed');
  });

  // TC-2.3: 不正なフェーズでエラー
  test('should fail when not in testing/regression_test phase', () => {
    mockTaskState.phase = 'implementation';
    vi.mocked(stateManager.getTaskById).mockReturnValue(mockTaskState);

    const result = workflowRecordTestResult(mockTaskId, 0);

    expect(result.success).toBe(false);
    expect(result.message).toContain('testing/regression_testフェーズでのみ可能です');
    expect(result.message).toContain('現在: implementation');
  });

  // TC-2.4: exitCodeが数値でない場合エラー
  test('should fail when exitCode is not a number', () => {
    const result = workflowRecordTestResult(mockTaskId, '0' as any);

    expect(result.success).toBe(false);
    expect(result.message).toContain('exitCodeは数値で指定してください');
  });

  // TC-2.5: 複数回記録可能
  test('should allow multiple test result records', () => {
    mockTaskState.testResults = [];
    vi.mocked(stateManager.getTaskById).mockReturnValue(mockTaskState);

    // 1回目
    workflowRecordTestResult(mockTaskId, 0, 'First run');

    // 1回目の呼び出しで保存された状態を取得し、2回目のmockに反映
    const firstSavedState = vi.mocked(stateManager.writeTaskState).mock.calls[0][1] as TaskState;
    vi.mocked(stateManager.getTaskById).mockReturnValue(firstSavedState);

    // 2回目
    const result = workflowRecordTestResult(mockTaskId, 1, 'Second run');

    expect(result.success).toBe(true);

    // writeTaskStateの呼び出しを確認（2回目の引数をチェック）
    const secondCall = vi.mocked(stateManager.writeTaskState).mock.calls[1];
    expect(secondCall).toBeDefined();
    const savedState = secondCall[1] as TaskState;
    expect(savedState.testResults).toHaveLength(2);
    expect(savedState.testResults![0].summary).toBe('First run');
    expect(savedState.testResults![1].summary).toBe('Second run');
  });

  // taskIdなしでエラー
  test('should fail when taskId is missing', () => {
    const result = workflowRecordTestResult(undefined, 0);

    expect(result.success).toBe(false);
    expect(result.message).toContain('taskIdは必須です');
  });

  // タスクが見つからない
  test('should fail when task is not found', () => {
    vi.mocked(stateManager.getTaskById).mockReturnValue(null);

    const result = workflowRecordTestResult('unknown_task', 0);

    expect(result.success).toBe(false);
    expect(result.message).toContain('指定されたタスクが見つかりません');
  });

  // summaryなしでも成功
  test('should succeed without summary', () => {
    const result = workflowRecordTestResult(mockTaskId, 0) as TestResultResponse;

    expect(result.success).toBe(true);
    expect(result.result?.summary).toBeUndefined();
  });

  // exitCode非0でも記録可能
  test('should record non-zero exitCode', () => {
    const result = workflowRecordTestResult(mockTaskId, 5, 'Build failed') as TestResultResponse;

    expect(result.success).toBe(true);
    expect(result.result?.exitCode).toBe(5);
  });
});
