/**
 * 型定義テスト (types.ts)
 * @spec docs/workflows/20260117_150655_ワ-クフロ-スキル未実装機能の追加/test-design.md
 * @spec docs/workflows/ワ-クフロ-並列タスク対応/spec.md
 *
 * テスト設計書のテストID: TS-001 〜 TS-005
 *
 * 注: ActiveTask は並列タスク対応により削除されました。
 * TS-004 のテストは削除されています。
 */

import { describe, it, expect } from 'vitest';
import type {
  TaskState,
  StartResult,
} from '../types.js';

// 実装済みの型・定数をインポート
import type { TaskSize } from '../types.js';
import { DEFAULT_TASK_SIZE } from '../types.js';

describe('types.ts - タスクサイズ機能の型定義', () => {
  describe('TS-001: TaskSize型が正しい値を許容する', () => {
    it('large が有効な値として許容される（small/mediumは廃止）', () => {
      // TaskSize型が定義されていることを確認
      const largeSize: TaskSize = 'large';

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
        taskSize: 'large',
      };

      expect(taskState.taskSize).toBe('large');
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

  // 注: TS-004 (ActiveTaskにtaskSizeフィールドが存在する) は削除されました。
  // ActiveTask 型は並列タスク対応により廃止されました。
  // @see docs/workflows/ワ-クフロ-並列タスク対応/spec.md

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

  describe('TS-006: TaskStateにdocsDirフィールドが存在する', () => {
    it('TaskState型にdocsDir?プロパティがある', () => {
      const taskState: TaskState = {
        phase: 'research',
        taskId: '20260118_090000',
        taskName: 'テストタスク',
        workflowDir: '/path/to/workflow',
        startedAt: new Date().toISOString(),
        checklist: {},
        history: [],
        subPhases: {},
        taskSize: 'large',
        docsDir: 'docs/workflows/テストタスク',
      };

      expect(taskState.docsDir).toBe('docs/workflows/テストタスク');
    });

    it('docsDirはオプショナルである（後方互換性）', () => {
      const taskStateWithoutDocsDir: TaskState = {
        phase: 'research',
        taskId: '20260118_090000',
        taskName: 'テストタスク',
        workflowDir: '/path/to/workflow',
        startedAt: new Date().toISOString(),
        checklist: {},
        history: [],
        subPhases: {},
      };

      expect(taskStateWithoutDocsDir.docsDir).toBeUndefined();
    });
  });

  describe('TS-007: StartResultにdocsDirフィールドが存在する', () => {
    it('StartResult型にdocsDir?プロパティがある', () => {
      const startResult: StartResult = {
        success: true,
        taskId: '20260118_090000',
        taskName: 'テストタスク',
        phase: 'research',
        workflowDir: '/path/to/workflow',
        message: 'タスク開始',
        taskSize: 'large',
        docsDir: 'docs/workflows/テストタスク',
      };

      expect(startResult.docsDir).toBe('docs/workflows/テストタスク');
    });
  });
});
