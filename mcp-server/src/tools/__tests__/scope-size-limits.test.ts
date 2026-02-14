/**
 * REQ-3: スコープサイズ制限テスト
 * @spec docs/workflows/ワ-クフロ-プラグイン大規模対応根本改修/spec.md
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { workflowSetScope } from '../set-scope.js';
import { workflowNext } from '../next.js';
import { stateManager } from '../../state/manager.js';
import type { TaskState } from '../../state/types.js';

// Mock stateManager
vi.mock('../../state/manager.js', () => ({
  stateManager: {
    getTaskById: vi.fn(),
    writeTaskState: vi.fn(),
    updateTaskPhase: vi.fn(),
    getIncompleteSubPhases: vi.fn(() => []),
    discoverTasks: vi.fn(() => []),
  },
}));

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  statSync: vi.fn(() => ({ isDirectory: () => true })),
}));

// Mock dependency-analyzer
vi.mock('../../validation/dependency-analyzer.js', () => ({
  validateScopeExists: vi.fn(() => ({
    nonExistentFiles: [],
    nonExistentDirs: [],
  })),
  validateScopeDependencies: vi.fn(() => ({
    outOfScopeDependencies: [],
    suggestedAdditions: [],
  })),
}));

// Mock scope-validator (REQ-5 depth/file validation bypass)
vi.mock('../../validation/scope-validator.js', () => ({
  validateScopeDepth: vi.fn(() => ({ valid: true, errors: [] })),
  validateScopeFiles: vi.fn(() => ({ valid: true, errors: [] })),
}));

// Mock design-validator (for next.ts tests)
vi.mock('../../validation/design-validator.js', () => ({
  DesignValidator: vi.fn().mockImplementation(() => ({
    validateAll: vi.fn(() => ({ passed: true, errors: [] })),
  })),
  formatValidationError: vi.fn(() => 'validation error'),
}));

/**
 * Helper function to create TaskState for testing
 */
function createTaskState(overrides: Partial<TaskState> = {}): TaskState {
  return {
    taskId: 'test_20260207',
    taskName: 'Test Task',
    phase: 'requirements',
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

describe('REQ-3: Scope Size Limits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set scope size limits to test values (implementation defaults are much larger)
    process.env.SCOPE_MAX_FILES = '200';
    process.env.SCOPE_MAX_DIRS = '20';
    process.env.MAX_SCOPE_FILES = '200';
    process.env.MAX_SCOPE_DIRS = '20';
  });

  afterEach(() => {
    delete process.env.SCOPE_MAX_FILES;
    delete process.env.SCOPE_MAX_DIRS;
    delete process.env.MAX_SCOPE_FILES;
    delete process.env.MAX_SCOPE_DIRS;
  });

  describe('workflowSetScope - File Limits', () => {
    test('TC-3-1: set-scope with 200 files → success', () => {
      const taskState = createTaskState();
      vi.mocked(stateManager.getTaskById).mockReturnValue(taskState);

      const files = Array.from({ length: 200 }, (_, i) => `src/file${i}.ts`);

      const result = workflowSetScope('test_20260207', files, [], undefined, undefined, undefined);

      expect(result.success).toBe(true);
      expect(result.message).toContain('影響範囲を設定しました');
    });

    test('TC-3-2: set-scope with 201 files → rejected with "スコープが大きすぎます"', () => {
      const taskState = createTaskState();
      vi.mocked(stateManager.getTaskById).mockReturnValue(taskState);

      const files = Array.from({ length: 201 }, (_, i) => `src/file${i}.ts`);

      const result = workflowSetScope('test_20260207', files, [], undefined, undefined, undefined);

      expect(result.success).toBe(false);
      expect(result.message).toContain('スコープが大きすぎます');
      expect(result.message).toContain('201');
      expect(result.message).toContain('200');
      expect(result.message).toContain('タスクを機能単位に分割してください');
    });

    test('TC-3-2-extra: set-scope with 500 files → rejected with proper counts', () => {
      const taskState = createTaskState();
      vi.mocked(stateManager.getTaskById).mockReturnValue(taskState);

      const files = Array.from({ length: 500 }, (_, i) => `src/file${i}.ts`);

      const result = workflowSetScope('test_20260207', files, [], undefined, undefined, undefined);

      expect(result.success).toBe(false);
      expect(result.message).toContain('スコープが大きすぎます');
      expect(result.message).toContain('500');
    });
  });

  describe('workflowSetScope - Directory Limits', () => {
    test('TC-3-3: set-scope with 20 directories → success', () => {
      const taskState = createTaskState();
      vi.mocked(stateManager.getTaskById).mockReturnValue(taskState);

      const dirs = Array.from({ length: 20 }, (_, i) => `src/module${i}`);

      const result = workflowSetScope('test_20260207', [], dirs, undefined, undefined, undefined);

      expect(result.success).toBe(true);
      expect(result.message).toContain('影響範囲を設定しました');
    });

    test('TC-3-4: set-scope with 21 directories → rejected', () => {
      const taskState = createTaskState();
      vi.mocked(stateManager.getTaskById).mockReturnValue(taskState);

      const dirs = Array.from({ length: 21 }, (_, i) => `src/module${i}`);

      const result = workflowSetScope('test_20260207', [], dirs, undefined, undefined, undefined);

      expect(result.success).toBe(false);
      expect(result.message).toContain('スコープが大きすぎます');
      expect(result.message).toContain('21');
      expect(result.message).toContain('20');
      expect(result.message).toContain('タスクを機能単位に分割してください');
    });

    test('TC-3-4-extra: set-scope with 50 directories → rejected with proper counts', () => {
      const taskState = createTaskState();
      vi.mocked(stateManager.getTaskById).mockReturnValue(taskState);

      const dirs = Array.from({ length: 50 }, (_, i) => `src/module${i}`);

      const result = workflowSetScope('test_20260207', [], dirs, undefined, undefined, undefined);

      expect(result.success).toBe(false);
      expect(result.message).toContain('スコープが大きすぎます');
      expect(result.message).toContain('50');
    });
  });

  describe('workflowSetScope - Combined Limits', () => {
    test('TC-3-combined-1: 200 files + 20 directories → success', () => {
      const taskState = createTaskState();
      vi.mocked(stateManager.getTaskById).mockReturnValue(taskState);

      const files = Array.from({ length: 200 }, (_, i) => `src/file${i}.ts`);
      const dirs = Array.from({ length: 20 }, (_, i) => `src/module${i}`);

      const result = workflowSetScope('test_20260207', files, dirs);

      expect(result.success).toBe(true);
      expect(result.message).toContain('影響範囲を設定しました');
    });

    test('TC-3-combined-2: 201 files + 20 directories → rejected', () => {
      const taskState = createTaskState();
      vi.mocked(stateManager.getTaskById).mockReturnValue(taskState);

      const files = Array.from({ length: 201 }, (_, i) => `src/file${i}.ts`);
      const dirs = Array.from({ length: 20 }, (_, i) => `src/module${i}`);

      const result = workflowSetScope('test_20260207', files, dirs);

      expect(result.success).toBe(false);
      expect(result.message).toContain('スコープが大きすぎます');
    });

    test('TC-3-combined-3: 200 files + 21 directories → rejected', () => {
      const taskState = createTaskState();
      vi.mocked(stateManager.getTaskById).mockReturnValue(taskState);

      const files = Array.from({ length: 200 }, (_, i) => `src/file${i}.ts`);
      const dirs = Array.from({ length: 21 }, (_, i) => `src/module${i}`);

      const result = workflowSetScope('test_20260207', files, dirs);

      expect(result.success).toBe(false);
      expect(result.message).toContain('スコープが大きすぎます');
    });
  });

  describe('workflowNext - Scope Size Validation at Phase Transitions', () => {
    test('TC-3-5: next with oversized scope → blocked', () => {
      // next.ts uses module-level MAX_SCOPE_FILES (default 1000) / MAX_SCOPE_DIRS (default 100)
      const files = Array.from({ length: 1500 }, (_, i) => `src/file${i}.ts`);
      const taskState = createTaskState({
        phase: 'parallel_analysis',
        scope: {
          affectedFiles: files,
          affectedDirs: [],
        },
        subPhases: {
          threat_modeling: 'completed',
          planning: 'completed',
        },
      });

      vi.mocked(stateManager.getTaskById).mockReturnValue(taskState);
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      const result = workflowNext('test_20260207');

      expect(result.success).toBe(false);
      expect(result.message).toContain('スコープが大きすぎます');
      expect(stateManager.updateTaskPhase).not.toHaveBeenCalled();
    });

    test('TC-3-6: Error message contains "タスクを分割してください"', () => {
      // next.ts uses module-level MAX_SCOPE_DIRS (default 100)
      const dirs = Array.from({ length: 150 }, (_, i) => `src/module${i}`);
      const taskState = createTaskState({
        phase: 'parallel_analysis',
        scope: {
          affectedFiles: [],
          affectedDirs: dirs,
        },
        subPhases: {
          threat_modeling: 'completed',
          planning: 'completed',
        },
      });

      vi.mocked(stateManager.getTaskById).mockReturnValue(taskState);
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      const result = workflowNext('test_20260207');

      expect(result.success).toBe(false);
      expect(result.message).toContain('スコープが大きすぎます');
      expect(result.message).toContain('タスクを分割してください');
      expect(stateManager.updateTaskPhase).not.toHaveBeenCalled();
    });

    test('TC-3-7: next with valid scope (within default limits) → success', () => {
      // next.ts uses module-level MAX_SCOPE_FILES (default 1000) / MAX_SCOPE_DIRS (default 100)
      const files = Array.from({ length: 200 }, (_, i) => `src/file${i}.ts`);
      const dirs = Array.from({ length: 20 }, (_, i) => `src/module${i}`);
      const taskState = createTaskState({
        phase: 'parallel_analysis',
        scope: {
          affectedFiles: files,
          affectedDirs: dirs,
        },
        subPhases: {
          threat_modeling: 'completed',
          planning: 'completed',
        },
      });

      vi.mocked(stateManager.getTaskById).mockReturnValue(taskState);
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      const result = workflowNext('test_20260207');

      expect(result.success).toBe(true);
      expect(stateManager.updateTaskPhase).toHaveBeenCalledWith(
        'test_20260207',
        'parallel_design'
      );
    });

    test('TC-3-8: next (requirements→parallel_analysis) → 承認が必要（承認ゲートが先）', () => {
      const files = Array.from({ length: 201 }, (_, i) => `src/file${i}.ts`);
      const taskState = createTaskState({
        phase: 'requirements',
        scope: {
          affectedFiles: files,
          affectedDirs: [],
        },
      });

      vi.mocked(stateManager.getTaskById).mockReturnValue(taskState);

      const result = workflowNext('test_20260207');

      // REQ-2実装済み: requirementsフェーズには承認が必要
      // 承認ゲートが先に発動するため、スコープチェックの前に承認エラーが返る
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/承認が必要/);
      expect(stateManager.updateTaskPhase).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    test('TC-3-edge-1: set-scope with no files or dirs → rejected (needs at least one)', () => {
      const taskState = createTaskState();
      vi.mocked(stateManager.getTaskById).mockReturnValue(taskState);

      const result = workflowSetScope('test_20260207', [], []);

      // set-scope requires at least one file or directory
      expect(result.success).toBe(false);
      expect(result.message).toContain('少なくとも1つを指定してください');
    });

    test('TC-3-edge-2: Undefined scope in parallel_analysis → blocked (REQ-1: scope required)', () => {
      const taskState = createTaskState({
        phase: 'parallel_analysis',
        scope: undefined,
        subPhases: {
          threat_modeling: 'completed',
          planning: 'completed',
        },
      });

      vi.mocked(stateManager.getTaskById).mockReturnValue(taskState);
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      const result = workflowNext('test_20260207');

      // REQ-1: parallel_analysis → parallel_design transition requires scope
      expect(result.success).toBe(false);
      expect(result.message).toContain('スコープが設定されていません');
    });

    test('TC-3-edge-3: Exactly at limit (200 files) → success', () => {
      const taskState = createTaskState();
      vi.mocked(stateManager.getTaskById).mockReturnValue(taskState);

      const files = Array.from({ length: 200 }, (_, i) => `src/file${i}.ts`);

      const result = workflowSetScope('test_20260207', files, undefined);

      expect(result.success).toBe(true);
    });

    test('TC-3-edge-4: One over limit (201 files) → rejected', () => {
      const taskState = createTaskState();
      vi.mocked(stateManager.getTaskById).mockReturnValue(taskState);

      const files = Array.from({ length: 201 }, (_, i) => `src/file${i}.ts`);

      const result = workflowSetScope('test_20260207', files, undefined);

      expect(result.success).toBe(false);
      expect(result.message).toContain('201');
    });
  });
});
