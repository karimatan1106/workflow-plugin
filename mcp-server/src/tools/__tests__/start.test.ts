/**
 * workflow_start ツールテスト (start.ts)
 * @spec docs/workflows/20260117_150655_ワ-クフロ-スキル未実装機能の追加/test-design.md
 *
 * テスト設計書のテストID: WS-001 〜 WS-007
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { workflowStart } from '../start.js';
import type { StartResult } from '../../state/types.js';

// fsモジュールをモック
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// stateManagerをモック
vi.mock('../../state/manager.js', () => ({
  stateManager: {
    createTask: vi.fn(),
  },
}));

import { stateManager } from '../../state/manager.js';

describe('start.ts - workflow_start ツールテスト', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('WS-001: size=smallでタスク開始', () => {
    it('success: true, taskSize: "small" が返る', () => {
      // モック設定: createTaskがtaskSizeを含む結果を返す
      vi.mocked(stateManager.createTask).mockReturnValue({
        phase: 'research',
        taskId: '20260117_150000',
        taskName: 'テストタスク',
        workflowDir: '/path/to/workflow',
        startedAt: new Date().toISOString(),
        checklist: {},
        history: [],
        subPhases: {},
        taskSize: 'small',
      });

      // タスクサイズ付きでworkflowStartを呼び出す
      const result = workflowStart('テストタスク', 'small') as StartResult & { taskSize?: string };

      expect(result.success).toBe(true);
      expect(result.taskSize).toBe('small');
    });
  });

  describe('WS-002: size=mediumでタスク開始', () => {
    it('success: true, taskSize: "medium" が返る', () => {
      vi.mocked(stateManager.createTask).mockReturnValue({
        phase: 'research',
        taskId: '20260117_150000',
        taskName: 'テストタスク',
        workflowDir: '/path/to/workflow',
        startedAt: new Date().toISOString(),
        checklist: {},
        history: [],
        subPhases: {},
        taskSize: 'medium',
      });

      const result = workflowStart('テストタスク', 'medium') as StartResult & { taskSize?: string };

      expect(result.success).toBe(true);
      expect(result.taskSize).toBe('medium');
    });
  });

  describe('WS-003: size=largeでタスク開始', () => {
    it('success: true, taskSize: "large" が返る', () => {
      vi.mocked(stateManager.createTask).mockReturnValue({
        phase: 'research',
        taskId: '20260117_150000',
        taskName: 'テストタスク',
        workflowDir: '/path/to/workflow',
        startedAt: new Date().toISOString(),
        checklist: {},
        history: [],
        subPhases: {},
        taskSize: 'large',
      });

      const result = workflowStart('テストタスク', 'large') as StartResult & { taskSize?: string };

      expect(result.success).toBe(true);
      expect(result.taskSize).toBe('large');
    });
  });

  describe('WS-004: size省略でlargeで開始', () => {
    it('success: true, taskSize: "large" がデフォルトで設定される', () => {
      vi.mocked(stateManager.createTask).mockReturnValue({
        phase: 'research',
        taskId: '20260117_150000',
        taskName: 'テストタスク',
        workflowDir: '/path/to/workflow',
        startedAt: new Date().toISOString(),
        checklist: {},
        history: [],
        subPhases: {},
        taskSize: 'large', // デフォルト
      });

      // size引数なしで呼び出し
      const result = workflowStart('テストタスク') as StartResult & { taskSize?: string };

      expect(result.success).toBe(true);
      expect(result.taskSize).toBe('large');
    });
  });

  describe('WS-005: 無効なsizeでエラー', () => {
    it('success: false, message に "無効なタスクサイズ" が含まれる', () => {
      // 無効なサイズを指定（文字列としては受け付けるが、バリデーションでエラー）
      const result = workflowStart('テストタスク', 'invalid') as StartResult;

      expect(result.success).toBe(false);
      expect(result.message).toContain('無効なタスクサイズ');
    });
  });

  describe('WS-006: taskName空でエラー', () => {
    it('success: false, message に "タスク名を指定" が含まれる', () => {
      // 空のタスク名で呼び出し
      const result = workflowStart('', 'small') as StartResult;

      expect(result.success).toBe(false);
      expect(result.message).toContain('タスク名を指定');
    });
  });

  describe('WS-007: メッセージにサイズ情報が含まれる', () => {
    it('messageに "サイズ: small" が含まれる', () => {
      vi.mocked(stateManager.createTask).mockReturnValue({
        phase: 'research',
        taskId: '20260117_150000',
        taskName: 'テストタスク',
        workflowDir: '/path/to/workflow',
        startedAt: new Date().toISOString(),
        checklist: {},
        history: [],
        subPhases: {},
        taskSize: 'small',
      });

      const result = workflowStart('テストタスク', 'small') as StartResult;

      expect(result.message).toContain('サイズ: small');
    });
  });
});

describe('start.ts - startToolDefinition テスト', () => {
  it('ツール定義にsizeパラメータが含まれる', async () => {
    const { startToolDefinition } = await import('../start.js');

    // inputSchema.properties にsizeがあることを確認
    const properties = startToolDefinition.inputSchema.properties as Record<string, unknown>;

    expect(properties).toHaveProperty('size');
    expect(properties.size).toEqual({
      type: 'string',
      description: expect.stringContaining('タスクサイズ'),
      enum: ['small', 'medium', 'large'],
    });
  });

  it('sizeはオプショナルである', async () => {
    const { startToolDefinition } = await import('../start.js');

    // required に size が含まれていないことを確認
    const required = startToolDefinition.inputSchema.required as string[];

    expect(required).not.toContain('size');
    expect(required).toContain('taskName');
  });
});
