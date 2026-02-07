/**
 * REQ-1: next.ts planningフェーズscope必須チェックテスト
 *
 * parallel_analysis → parallel_design 遷移時にscope設定を必須化する。
 *
 * @spec docs/workflows/ワ-クフロ-大規模対応根本改修/test-design.md
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { workflowNext } from '../next.js';
import { stateManager } from '../../state/manager.js';
import type { TaskState } from '../../state/types.js';

// stateManagerをモック化
vi.mock('../../state/manager.js', () => ({
  stateManager: {
    getTaskById: vi.fn(),
    writeTaskState: vi.fn(),
    updateTaskPhase: vi.fn(),
    getIncompleteSubPhases: vi.fn(() => []),
    discoverTasks: vi.fn(() => []),
  },
}));

// design-validatorをモック化（テスト対象外）
vi.mock('../../validation/design-validator.js', () => ({
  DesignValidator: vi.fn().mockImplementation(() => ({
    validateAll: vi.fn(() => ({ passed: true, errors: [] })),
  })),
  formatValidationError: vi.fn(() => 'validation error'),
}));

interface NextResult {
  success: boolean;
  message?: string;
  from?: string;
  to?: string;
}

describe('REQ-1: planningフェーズscope必須チェック', () => {
  const mockTaskId = 'test_20260207_130000';

  function createTaskState(overrides: Partial<TaskState> = {}): TaskState {
    return {
      taskId: mockTaskId,
      taskName: 'Test Task',
      phase: 'parallel_analysis',
      workflowDir: '/tmp/test-workflow',
      docsDir: '/tmp/test-docs',
      startedAt: '2026-02-07T00:00:00Z',
      checklist: {},
      history: [],
      subPhases: {},
      taskSize: 'large',
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SKIP_DESIGN_VALIDATION = 'true';
  });

  // TC-1.1: planningフェーズでscope未設定→遷移ブロック
  test('TC-1.1: parallel_analysisからの遷移時にscope未設定→ブロック', () => {
    const taskState = createTaskState({
      phase: 'parallel_analysis',
      scope: undefined,
    });
    vi.mocked(stateManager.getTaskById).mockReturnValue(taskState);
    vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

    const result = workflowNext(mockTaskId) as NextResult;

    expect(result.success).toBe(false);
    expect(result.message).toContain('スコープが設定されていません');
  });

  // TC-1.1b: scope空配列→ブロック
  test('TC-1.1b: scope空配列→ブロック', () => {
    const taskState = createTaskState({
      phase: 'parallel_analysis',
      scope: { affectedFiles: [], affectedDirs: [] },
    });
    vi.mocked(stateManager.getTaskById).mockReturnValue(taskState);
    vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

    const result = workflowNext(mockTaskId) as NextResult;

    expect(result.success).toBe(false);
    expect(result.message).toContain('スコープが設定されていません');
  });

  // TC-1.2: scope設定済み→遷移成功
  test('TC-1.2: scope設定済み→parallel_designに遷移成功', () => {
    const taskState = createTaskState({
      phase: 'parallel_analysis',
      scope: { affectedFiles: [], affectedDirs: ['src/backend/'] },
    });
    vi.mocked(stateManager.getTaskById).mockReturnValue(taskState);
    vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

    const result = workflowNext(mockTaskId) as NextResult;

    expect(result.success).toBe(true);
    expect(result.to).toBe('parallel_design');
  });

  // TC-1.2b: affectedFilesのみ設定→遷移成功
  test('TC-1.2b: affectedFilesのみ設定→遷移成功', () => {
    const taskState = createTaskState({
      phase: 'parallel_analysis',
      scope: { affectedFiles: ['src/a.ts'], affectedDirs: [] },
    });
    vi.mocked(stateManager.getTaskById).mockReturnValue(taskState);
    vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

    const result = workflowNext(mockTaskId) as NextResult;

    expect(result.success).toBe(true);
    expect(result.to).toBe('parallel_design');
  });

  // TC-1.2c: 他フェーズはscopeチェック無し
  test('TC-1.2c: requirementsフェーズはscopeチェック無し', () => {
    const taskState = createTaskState({
      phase: 'requirements',
      scope: undefined,
    });
    vi.mocked(stateManager.getTaskById).mockReturnValue(taskState);

    const result = workflowNext(mockTaskId) as NextResult;

    expect(result.success).toBe(true);
  });
});
