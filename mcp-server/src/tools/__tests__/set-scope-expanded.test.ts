/**
 * REQ-1: set-scope.ts フェーズ拡張テスト
 *
 * research/requirements/planningフェーズでscope設定を可能にする。
 *
 * @spec docs/workflows/ワ-クフロ-大規模対応根本改修/test-design.md
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { workflowSetScope } from '../set-scope.js';
import { stateManager } from '../../state/manager.js';
import type { TaskState } from '../../state/types.js';

interface ScopeResult {
  success: boolean;
  message?: string;
  scope?: { affectedFiles: string[]; affectedDirs: string[] };
}

// stateManagerをモック化
vi.mock('../../state/manager.js', () => ({
  stateManager: {
    getTaskById: vi.fn(),
    writeTaskState: vi.fn(),
  },
}));

// dependency-analyzerをモック化（存在チェック・依存解析をバイパス）
vi.mock('../../validation/dependency-analyzer.js', () => ({
  validateScopeExists: vi.fn(() => ({ nonExistentFiles: [], nonExistentDirs: [] })),
  validateScopeDependencies: vi.fn(() => ({ valid: true, outOfScopeDependencies: [], suggestedAdditions: [] })),
}));

// scope-validatorをモック化（REQ-5ファイル存在・深度チェックをバイパス）
vi.mock('../../validation/scope-validator.js', () => ({
  validateScopeDepth: vi.fn(() => ({ valid: true, errors: [] })),
  validateScopeFiles: vi.fn(() => ({ valid: true, errors: [] })),
}));

describe('REQ-1: set-scope フェーズ拡張', () => {
  const mockTaskId = 'test_20260207_130000';

  function createTaskState(phase: string): TaskState {
    return {
      taskId: mockTaskId,
      taskName: 'Test Task',
      phase: phase as TaskState['phase'],
      workflowDir: '/tmp/test-workflow',
      startedAt: '2026-02-07T00:00:00Z',
      checklist: {},
      history: [],
      subPhases: {},
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-SS-1: researchフェーズでscope設定可能
  test('TC-SS-1: researchフェーズでscope設定可能', () => {
    vi.mocked(stateManager.getTaskById).mockReturnValue(createTaskState('research'));

    const result = workflowSetScope(mockTaskId, ['src/a.ts'], []) as ScopeResult;

    expect(result.success).toBe(true);
    expect(result.scope?.affectedFiles).toEqual(['src/a.ts']);
  });

  // TC-SS-2: requirementsフェーズでscope設定可能
  test('TC-SS-2: requirementsフェーズでscope設定可能', () => {
    vi.mocked(stateManager.getTaskById).mockReturnValue(createTaskState('requirements'));

    const result = workflowSetScope(mockTaskId, ['src/a.ts'], []) as ScopeResult;

    expect(result.success).toBe(true);
  });

  // TC-SS-3: planningフェーズでscope設定可能（※サブフェーズ）
  test('TC-SS-3: planningフェーズでscope設定可能', () => {
    vi.mocked(stateManager.getTaskById).mockReturnValue(createTaskState('planning'));

    const result = workflowSetScope(mockTaskId, [], ['src/backend/']) as ScopeResult;

    expect(result.success).toBe(true);
    expect(result.scope?.affectedDirs).toEqual(['src/backend/']);
  });

  // TC-SS-4: commitフェーズでscope設定不可
  test('TC-SS-4: commitフェーズでscope設定不可', () => {
    vi.mocked(stateManager.getTaskById).mockReturnValue(createTaskState('commit'));

    const result = workflowSetScope(mockTaskId, ['src/a.ts'], []) as ScopeResult;

    expect(result.success).toBe(false);
    expect(result.message).toContain('research/requirements/planning/implementation/refactoring/testing');
  });

  // TC-SS-5: docs_updateフェーズでscope設定不可
  test('TC-SS-5: docs_updateフェーズでscope設定不可', () => {
    vi.mocked(stateManager.getTaskById).mockReturnValue(createTaskState('docs_update'));

    const result = workflowSetScope(mockTaskId, ['src/a.ts'], []) as ScopeResult;

    expect(result.success).toBe(false);
  });

  // TC-SS-6: 空配列のみ指定→エラー
  test('TC-SS-6: 空配列のみ指定→エラー', () => {
    vi.mocked(stateManager.getTaskById).mockReturnValue(createTaskState('research'));

    const result = workflowSetScope(mockTaskId, [], []) as ScopeResult;

    expect(result.success).toBe(false);
    expect(result.message).toContain('files または dirs');
  });

  // TC-SS-7: filesのみ指定→成功
  test('TC-SS-7: filesのみ指定→成功', () => {
    vi.mocked(stateManager.getTaskById).mockReturnValue(createTaskState('research'));

    const result = workflowSetScope(mockTaskId, ['src/a.ts'], undefined) as ScopeResult;

    expect(result.success).toBe(true);
  });

  // TC-SS-8: dirsのみ指定→成功
  test('TC-SS-8: dirsのみ指定→成功', () => {
    vi.mocked(stateManager.getTaskById).mockReturnValue(createTaskState('research'));

    const result = workflowSetScope(mockTaskId, undefined, ['src/backend/']) as ScopeResult;

    expect(result.success).toBe(true);
  });
});
