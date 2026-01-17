/**
 * workflow_start ツールテスト (start.ts)
 * @spec docs/workflows/20260117_150655_ワ-クフロ-スキル未実装機能の追加/test-design.md
 *
 * small/mediumサイズは廃止されたため、largeサイズのみをテスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

  describe('タスク開始（常にlargeサイズ）', () => {
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

      const result = workflowStart('テストタスク') as StartResult & { taskSize?: string };

      expect(result.success).toBe(true);
      expect(result.taskSize).toBe('large');
    });
  });

  describe('taskName空でエラー', () => {
    it('success: false, message に "タスク名を指定" が含まれる', () => {
      const result = workflowStart('') as StartResult;

      expect(result.success).toBe(false);
      expect(result.message).toContain('タスク名を指定');
    });
  });

  describe('メッセージにサイズ情報が含まれる', () => {
    it('messageに "サイズ: large" が含まれる', () => {
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

      const result = workflowStart('テストタスク') as StartResult;

      expect(result.message).toContain('サイズ: large');
    });
  });
});

describe('start.ts - startToolDefinition テスト', () => {
  it('ツール定義にsizeパラメータが含まれない', async () => {
    const { startToolDefinition } = await import('../start.js');

    const properties = startToolDefinition.inputSchema.properties as Record<string, unknown>;

    expect(properties).not.toHaveProperty('size');
  });

  it('taskNameが必須である', async () => {
    const { startToolDefinition } = await import('../start.js');

    const required = startToolDefinition.inputSchema.required as string[];

    expect(required).toContain('taskName');
  });
});
