/**
 * REQ-6: セッショントークンテスト
 *
 * workflowStartで発行されるsessionTokenによる操作認証を検証する。
 * 現在の実装にはsessionToken機能がない。
 * REQ-6実装後にこれらのテストが成功する（TDD Red Phase）。
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

// stateManagerをモック
vi.mock('../../state/manager.js', () => ({
  stateManager: {
    createTask: vi.fn(),
    getTaskById: vi.fn(),
    updateTaskPhase: vi.fn(),
    getIncompleteSubPhases: vi.fn().mockReturnValue([]),
    writeTaskState: vi.fn(),
  },
  generateSessionToken: vi.fn(() => 'a'.repeat(64)), // 64文字のランダム文字列
}));

// design-validatorをモック
vi.mock('../../validation/design-validator.js', () => ({
  DesignValidator: vi.fn().mockImplementation(() => ({
    validateAll: () => ({
      passed: true,
      missingItems: [],
      warnings: [],
      summary: { total: 0, implemented: 0, missing: 0 },
    }),
  })),
  formatValidationError: vi.fn(),
}));

// fsモジュールをモック
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => '# Mock Content\n'.repeat(30)),
    statSync: vi.fn(() => ({ size: 500 } as any)),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

import { stateManager } from '../../state/manager.js';
import { workflowStart } from '../start.js';
import { workflowNext } from '../next.js';
import type { TaskState, PhaseName, StartResult, NextResult } from '../../state/types.js';

const TEST_TASK_ID = '20260208_120000';

/**
 * テスト用のタスク状態を作成
 */
function createMockTaskState(phase: PhaseName, withSessionToken: boolean = false): TaskState {
  const state: TaskState = {
    phase,
    taskId: TEST_TASK_ID,
    taskName: 'テストタスク',
    workflowDir: '/test/workflow',
    docsDir: '/test/docs',
    startedAt: new Date().toISOString(),
    checklist: {},
    history: [],
    subPhases: {},
    taskSize: 'large',
  };

  if (withSessionToken) {
    // REQ-6実装後はsessionTokenフィールドが追加される
    (state as any).sessionToken = 'test-session-token-123';
  }

  return state;
}

// 環境変数の元の値を保存
const originalEnv = { ...process.env };

describe('REQ-6: セッショントークンテスト', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.SESSION_TOKEN_REQUIRED;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('TC-6-1: workflowStart()の戻り値にsessionTokenフィールドがある', () => {
    test('StartResult に sessionToken が含まれる（REQ-6実装済み）', () => {
      const mockState = createMockTaskState('research', true);
      vi.mocked(stateManager.createTask).mockReturnValue(mockState);

      const result = workflowStart('テストタスク') as StartResult;

      expect(result.success).toBe(true);
      // REQ-6実装済み: sessionToken フィールドが返される
      expect(result).toHaveProperty('sessionToken');
      expect(typeof result.sessionToken).toBe('string');
      expect(result.sessionToken).toMatch(/^[a-zA-Z0-9]+$/);
    });
  });

  describe('TC-6-2: sessionToken未指定でworkflowNext() → success: false', () => {
    test('sessionTokenなしでnextを呼ぶとエラーが返る（REQ-6実装済み）', () => {
      const mockState = createMockTaskState('research', true);
      vi.mocked(stateManager.getTaskById).mockReturnValue(mockState);
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      // sessionToken未指定で呼び出し
      const result = workflowNext(TEST_TASK_ID) as NextResult;

      // REQ-6実装済み: sessionToken検証が行われる
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/sessionToken/);
    });
  });

  describe('TC-6-3: sessionToken不一致でworkflowNext() → success: false', () => {
    test('誤ったsessionTokenでnextを呼ぶとエラーが返る（REQ-6実装済み）', () => {
      const mockState = createMockTaskState('research', true);
      vi.mocked(stateManager.getTaskById).mockReturnValue(mockState);
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      // 誤ったsessionTokenで呼び出し
      const result = workflowNext(TEST_TASK_ID, 'invalid-token') as NextResult;

      // REQ-6実装済み: sessionToken検証が行われる
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/sessionToken|無効/);
    });
  });

  describe('TC-6-4: sessionToken一致でworkflowNext() → success: true', () => {
    test('正しいsessionTokenでnextを呼ぶと成功する（REQ-6実装済み）', () => {
      const sessionToken = 'test-session-token-123';
      // test_implフェーズを使用（承認不要フェーズ）
      const mockState = createMockTaskState('test_impl', true);
      (mockState as any).sessionToken = sessionToken;

      vi.mocked(stateManager.getTaskById).mockReturnValue(mockState);
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      // 正しいsessionTokenで呼び出し
      const result = workflowNext(TEST_TASK_ID, sessionToken) as NextResult;

      expect(result.success).toBe(true);
      expect(result.from).toBe('test_impl');
      expect(result.to).toBe('implementation');
    });
  });

  describe('TC-6-5: SESSION_TOKEN_REQUIRED=falseでトークンなしworkflowNext() → success: true', () => {
    test('SESSION_TOKEN_REQUIRED=falseならトークンなしで動作する', () => {
      process.env.SESSION_TOKEN_REQUIRED = 'false';

      // test_implフェーズを使用（承認不要フェーズ）
      const mockState = createMockTaskState('test_impl', true);
      vi.mocked(stateManager.getTaskById).mockReturnValue(mockState);
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      // sessionToken未指定で呼び出し
      const result = workflowNext(TEST_TASK_ID) as NextResult;

      // SESSION_TOKEN_REQUIRED=false の場合はトークンなしでも成功
      expect(result.success).toBe(true);
    });
  });

  describe('TC-6-6: 既存タスク(sessionTokenフィールドなし)でnext → 警告のみで続行', () => {
    test('sessionTokenフィールドがないタスクは警告のみで処理を続行', () => {
      // sessionTokenフィールドがないレガシータスク
      // test_implフェーズを使用（承認不要フェーズ）
      const mockState = createMockTaskState('test_impl', false);
      vi.mocked(stateManager.getTaskById).mockReturnValue(mockState);
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      const result = workflowNext(TEST_TASK_ID) as NextResult;

      // sessionTokenフィールドがない既存タスクは警告のみで続行
      expect(result.success).toBe(true);
      expect(result.from).toBe('test_impl');
      expect(result.to).toBe('implementation');
    });
  });

  describe('TC-6-7: sessionTokenの形式チェック', () => {
    test('sessionTokenは32文字以上のランダム文字列（REQ-6実装済み）', () => {
      const mockState = createMockTaskState('research', true);
      vi.mocked(stateManager.createTask).mockReturnValue(mockState);

      const result = workflowStart('テストタスク') as StartResult;

      expect(result.success).toBe(true);
      // REQ-6実装済み: sessionTokenの形式をチェック
      const token = (result as any).sessionToken;
      expect(token).toBeTruthy();
      expect(token.length).toBeGreaterThanOrEqual(32);
      expect(token).toMatch(/^[a-zA-Z0-9]+$/);
    });
  });

  describe('TC-6-8: workflowNextの関数シグネチャ変更', () => {
    test('workflowNext(taskId, sessionToken) の形式で呼び出せる（REQ-6実装済み）', () => {
      const sessionToken = 'test-session-token-123';
      // test_implフェーズを使用（承認不要フェーズ）
      const mockState = createMockTaskState('test_impl', true);
      (mockState as any).sessionToken = sessionToken;

      vi.mocked(stateManager.getTaskById).mockReturnValue(mockState);
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      // 第2引数にsessionTokenを渡す
      const result = workflowNext(TEST_TASK_ID, sessionToken) as NextResult;

      expect(result.success).toBe(true);
      // REQ-6実装済み: sessionToken検証が行われる
      // 正しいトークンのため成功する
    });
  });
});
