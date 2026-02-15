/**
 * REQ-C: workflow_status レスポンスのコンテキスト情報追加テスト
 *
 * workflow_status ツールの応答に scope 情報と approvals 情報が
 * 含まれることを検証する。
 * 実装はまだ存在しないため、テストファーストで作成（TDD Red Phase）。
 *
 * @spec docs/workflows/ワ-クフロ-プラグイン構造的問題9件の根本原因修正/test-design.md
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';

// stateManager をモック
vi.mock('../../state/manager.js', () => ({
  stateManager: {
    getTaskById: vi.fn(),
    discoverTasks: vi.fn(),
    updateTaskPhase: vi.fn(),
    getIncompleteSubPhases: vi.fn().mockReturnValue([]),
    writeTaskState: vi.fn(),
    initializeSubPhases: vi.fn().mockReturnValue({}),
  },
}));

import { stateManager } from '../../state/manager.js';
import { workflowStatus } from '../status.js';

describe('REQ-C: workflow_status コンテキスト情報追加', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('TC-C1: scope 情報の追加', () => {
    test('workflow_status レスポンスに scope 情報が含まれる', () => {
      // scope が設定されたタスク状態をモック
      const mockTask = {
        taskId: 'test-task-001',
        taskName: 'テストタスク',
        phase: 'implementation',
        workflowDir: '/tmp/test-workflow',
        docsDir: '/tmp/test-docs',
        taskSize: 'large',
        userIntent: 'テスト用タスク',
        scope: {
          files: ['src/backend/src/tools/status.ts', 'src/backend/src/tools/approve.ts'],
          dirs: ['src/backend/src/'],
          glob: 'src/backend/src/**/*.ts',
        },
      };

      vi.mocked(stateManager.discoverTasks).mockReturnValue([mockTask] as any);

      const result = workflowStatus('test-task-001');

      expect(result.success).toBe(true);
      // REQ-C: scope フィールドが追加されていること
      expect((result as any).scope).toBeDefined();
      expect((result as any).scope.files).toContain('src/backend/src/tools/status.ts');
      expect((result as any).scope.dirs).toContain('src/backend/src/');
      expect((result as any).scope.glob).toBe('src/backend/src/**/*.ts');
    });

    test('scope 未設定時は空オブジェクトまたは undefined が返される', () => {
      const mockTask = {
        taskId: 'test-task-002',
        taskName: 'スコープなしタスク',
        phase: 'research',
        workflowDir: '/tmp/test-workflow-2',
        docsDir: '/tmp/test-docs-2',
        taskSize: 'large',
        userIntent: 'テスト',
      };

      vi.mocked(stateManager.discoverTasks).mockReturnValue([mockTask] as any);

      const result = workflowStatus('test-task-002');

      expect(result.success).toBe(true);
      // scope が undefined または空オブジェクト
      const scope = (result as any).scope;
      if (scope !== undefined) {
        expect(scope.files).toEqual([]);
      }
    });
  });

  describe('TC-C2: approvals 情報の追加', () => {
    test('承認済み項目が approvals フィールドに反映される', () => {
      const mockTask = {
        taskId: 'test-task-003',
        taskName: '承認テストタスク',
        phase: 'test_design',
        workflowDir: '/tmp/test-workflow-3',
        docsDir: '/tmp/test-docs-3',
        taskSize: 'large',
        userIntent: '承認テスト',
        approvals: {
          requirements: true,
          design: true,
          test_design: false,
          code_review: false,
        },
      };

      vi.mocked(stateManager.discoverTasks).mockReturnValue([mockTask] as any);

      const result = workflowStatus('test-task-003');

      expect(result.success).toBe(true);
      // REQ-C: approvals フィールドが追加されていること
      const approvals = (result as any).approvals;
      expect(approvals).toBeDefined();
      expect(approvals.requirements).toBe(true);
      expect(approvals.design).toBe(true);
      expect(approvals.test_design).toBe(false);
      expect(approvals.code_review).toBe(false);
    });
  });

  describe('TC-C3: approvals 情報の初期状態', () => {
    test('タスク開始直後の approvals は全て false または未定義', () => {
      const mockTask = {
        taskId: 'test-task-004',
        taskName: '新規タスク',
        phase: 'research',
        workflowDir: '/tmp/test-workflow-4',
        docsDir: '/tmp/test-docs-4',
        taskSize: 'large',
        userIntent: '新規タスクテスト',
        // approvals が未設定の状態
      };

      vi.mocked(stateManager.discoverTasks).mockReturnValue([mockTask] as any);

      const result = workflowStatus('test-task-004');

      expect(result.success).toBe(true);
      const approvals = (result as any).approvals;
      // approvals が定義されている場合、全て false
      if (approvals) {
        expect(approvals.requirements).toBeFalsy();
        expect(approvals.design).toBeFalsy();
        expect(approvals.test_design).toBeFalsy();
        expect(approvals.code_review).toBeFalsy();
      }
      // approvals が undefined の場合もテストパスとする
    });
  });
});
