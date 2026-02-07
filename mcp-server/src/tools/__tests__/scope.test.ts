/**
 * workflow_set_scope ツールのテスト
 *
 * REQ-1: 影響範囲の定義と制御
 * - スコープ設定成功（ファイルのみ、ディレクトリのみ、両方）
 * - 空の引数でエラー
 * - research以外のフェーズでエラー
 *
 * @spec docs/workflows/ワ-クフロ-大規模対応改善/test-design.md
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

describe('workflowSetScope', () => {
  const mockTaskId = 'test_20260207_120000';
  let mockTaskState: TaskState;

  beforeEach(() => {
    vi.clearAllMocks();

    // デフォルトのmockタスク状態（researchフェーズ）
    mockTaskState = {
      taskId: mockTaskId,
      taskName: 'Test Task',
      phase: 'research',
      workflowDir: '/test/workflow',
      startedAt: '2026-02-07T12:00:00Z',
      checklist: {},
      history: [],
      subPhases: {},
    };

    vi.mocked(stateManager.getTaskById).mockReturnValue(mockTaskState);
  });

  // TC-1.1: スコープ設定成功（ファイルのみ）
  test('should set scope with files only', () => {
    const files = ['src/frontend/components/Button.tsx'];

    const result = workflowSetScope(mockTaskId, files, []) as ScopeResult;

    expect(result.success).toBe(true);
    expect(result.scope?.affectedFiles).toEqual(files);
    expect(result.scope?.affectedDirs).toEqual([]);
    expect(result.message).toContain('ファイル: 1件');
    expect(stateManager.writeTaskState).toHaveBeenCalledWith(
      mockTaskState.workflowDir,
      expect.objectContaining({
        scope: {
          affectedFiles: files,
          affectedDirs: [],
        },
      })
    );
  });

  // TC-1.2: スコープ設定成功（ディレクトリのみ）
  test('should set scope with dirs only', () => {
    const dirs = ['src/frontend/features/auth/'];

    const result = workflowSetScope(mockTaskId, [], dirs) as ScopeResult;

    expect(result.success).toBe(true);
    expect(result.scope?.affectedFiles).toEqual([]);
    expect(result.scope?.affectedDirs).toEqual(dirs);
    expect(result.message).toContain('ディレクトリ: 1件');
  });

  // TC-1.3: スコープ設定成功（ファイル+ディレクトリ）
  test('should set scope with both files and dirs', () => {
    const files = ['src/backend/index.ts'];
    const dirs = ['src/backend/domain/'];

    const result = workflowSetScope(mockTaskId, files, dirs) as ScopeResult;

    expect(result.success).toBe(true);
    expect(result.scope?.affectedFiles).toEqual(files);
    expect(result.scope?.affectedDirs).toEqual(dirs);
    expect(result.message).toContain('ファイル: 1件, ディレクトリ: 1件');
  });

  // TC-1.4: 空の引数でエラー
  test('should fail when both files and dirs are empty', () => {
    const result = workflowSetScope(mockTaskId, [], []);

    expect(result.success).toBe(false);
    expect(result.message).toContain('files または dirs の少なくとも1つを指定してください');
  });

  // TC-1.5: research以外のフェーズでエラー
  test('should fail when not in research phase', () => {
    mockTaskState.phase = 'implementation';
    vi.mocked(stateManager.getTaskById).mockReturnValue(mockTaskState);

    const result = workflowSetScope(mockTaskId, ['src/index.ts'], []);

    expect(result.success).toBe(false);
    expect(result.message).toContain('影響範囲の設定はresearch/requirements/planningフェーズでのみ可能です');
    expect(result.message).toContain('現在: implementation');
  });

  // タスクIDが指定されていない場合
  test('should fail when taskId is missing', () => {
    const result = workflowSetScope(undefined, ['src/index.ts'], []);

    expect(result.success).toBe(false);
    expect(result.message).toContain('taskIdは必須です');
  });

  // タスクが見つからない場合
  test('should fail when task is not found', () => {
    vi.mocked(stateManager.getTaskById).mockReturnValue(null);

    const result = workflowSetScope('unknown_task', ['src/index.ts'], []);

    expect(result.success).toBe(false);
    expect(result.message).toContain('指定されたタスクが見つかりません');
  });

  // 複数ファイル・複数ディレクトリ
  test('should set scope with multiple files and dirs', () => {
    const files = ['src/a.ts', 'src/b.ts', 'src/c.ts'];
    const dirs = ['src/domain/', 'src/application/'];

    const result = workflowSetScope(mockTaskId, files, dirs) as ScopeResult;

    expect(result.success).toBe(true);
    expect(result.scope?.affectedFiles).toEqual(files);
    expect(result.scope?.affectedDirs).toEqual(dirs);
    expect(result.message).toContain('ファイル: 3件, ディレクトリ: 2件');
  });
});
