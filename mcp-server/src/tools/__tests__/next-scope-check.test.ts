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

// fsモジュールをモック（成果物チェック用: デフォルトで全てtrue）
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(),
    statSync: vi.fn(() => ({ size: 500 })),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

import * as fs from 'fs';

/**
 * requirements.md用モックコンテンツ
 * 要件: 30行以上、必須セクション: '## 背景', '## 機能要件', '## 受入条件'
 */
const MOCK_REQUIREMENTS_MD = Array.from({length: 35}, (_, i) =>
  i === 0 ? '# Requirements' :
  i === 2 ? '## 背景' :
  i === 5 ? '背景情報を記載。' :
  i === 10 ? '## 機能要件' :
  i === 13 ? 'REQ-1: 要件1。' :
  i === 20 ? '## 受入条件' :
  i === 23 ? 'AC-1: 受入条件1。' :
  `内容行${i}`
).join('\n');

function getMockContent(filePath: unknown): string {
  return MOCK_REQUIREMENTS_MD;
}

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
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ size: 500 } as any);
    vi.mocked(fs.readFileSync).mockImplementation(((filePath: unknown) => getMockContent(filePath)) as any);
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
  test('TC-1.2c: requirementsフェーズはscopeチェック無し（ただし承認が必要）', () => {
    const taskState = createTaskState({
      phase: 'requirements',
      scope: undefined,
    });
    vi.mocked(stateManager.getTaskById).mockReturnValue(taskState);

    const result = workflowNext(mockTaskId) as NextResult;

    // REQ-2実装済み: requirementsフェーズには承認が必要
    // scopeチェックはないが、承認ゲートが先に発動する
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/承認が必要/);
  });
});
