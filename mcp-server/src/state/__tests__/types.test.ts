/**
 * 型定義テスト (types.ts)
 * @spec docs/workflows/20260117_150655_ワ-クフロ-スキル未実装機能の追加/test-design.md
 *
 * テスト設計書のテストID: TS-001 〜 TS-005
 */

import { describe, it, expect } from 'vitest';
import type {
  TaskState,
  ActiveTask,
  StartResult,
} from '../types.js';

// 実装済みの型・定数をインポート
import type { TaskSize } from '../types.js';
import { DEFAULT_TASK_SIZE } from '../types.js';

describe('types.ts - タスクサイズ機能の型定義', () => {
  describe('TS-001: TaskSize型が正しい値を許容する', () => {
    it('small, medium, large が有効な値として許容される', () => {
      // TaskSize型が定義されていることを確認
      const smallSize: TaskSize = 'small';
      const mediumSize: TaskSize = 'medium';
      const largeSize: TaskSize = 'large';

      expect(smallSize).toBe('small');
      expect(mediumSize).toBe('medium');
      expect(largeSize).toBe('large');
    });
  });

  describe('TS-002: DEFAULT_TASK_SIZEがlargeである', () => {
    it('デフォルトのタスクサイズがlargeである', () => {
      expect(DEFAULT_TASK_SIZE).toBe('large');
    });
  });

  describe('TS-003: TaskStateにtaskSizeフィールドが存在する', () => {
    it('TaskState型にtaskSize?プロパティがある', () => {
      // タスク状態オブジェクトを作成
      const taskState: TaskState = {
        phase: 'research',
        taskId: '20260117_150000',
        taskName: 'テストタスク',
        workflowDir: '/path/to/workflow',
        startedAt: new Date().toISOString(),
        checklist: {},
        history: [],
        subPhases: {},
        // taskSize が追加されているはず
        taskSize: 'small',
      };

      expect(taskState.taskSize).toBe('small');
    });

    it('taskSizeはオプショナルである', () => {
      // taskSizeなしでもTaskStateとして有効
      const taskStateWithoutSize: TaskState = {
        phase: 'research',
        taskId: '20260117_150000',
        taskName: 'テストタスク',
        workflowDir: '/path/to/workflow',
        startedAt: new Date().toISOString(),
        checklist: {},
        history: [],
        subPhases: {},
      };

      expect(taskStateWithoutSize.taskSize).toBeUndefined();
    });
  });

  describe('TS-004: ActiveTaskにtaskSizeフィールドが存在する', () => {
    it('ActiveTask型にtaskSize?プロパティがある', () => {
      const activeTask: ActiveTask = {
        taskId: '20260117_150000',
        taskName: 'テストタスク',
        workflowDir: '/path/to/workflow',
        phase: 'research',
        // taskSize が追加されているはず
        taskSize: 'medium',
      };

      expect(activeTask.taskSize).toBe('medium');
    });

    it('taskSizeはオプショナルである', () => {
      const activeTaskWithoutSize: ActiveTask = {
        taskId: '20260117_150000',
        taskName: 'テストタスク',
        workflowDir: '/path/to/workflow',
        phase: 'research',
      };

      expect(activeTaskWithoutSize.taskSize).toBeUndefined();
    });
  });

  describe('TS-005: StartResultにtaskSizeフィールドが存在する', () => {
    it('StartResult型にtaskSize?プロパティがある', () => {
      const startResult: StartResult = {
        success: true,
        taskId: '20260117_150000',
        taskName: 'テストタスク',
        phase: 'research',
        workflowDir: '/path/to/workflow',
        message: 'タスク開始',
        // taskSize が追加されているはず
        taskSize: 'large',
      };

      expect(startResult.taskSize).toBe('large');
    });

    it('taskSizeはオプショナルである', () => {
      const startResultWithoutSize: StartResult = {
        success: true,
        taskId: '20260117_150000',
        taskName: 'テストタスク',
        phase: 'research',
        workflowDir: '/path/to/workflow',
        message: 'タスク開始',
      };

      expect(startResultWithoutSize.taskSize).toBeUndefined();
    });
  });
});
