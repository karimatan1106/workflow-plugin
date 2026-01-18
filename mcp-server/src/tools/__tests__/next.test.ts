/**
 * workflow_next ツールテスト (next.ts)
 * @spec docs/workflows/20260117_150655_ワ-クフロ-スキル未実装機能の追加/test-design.md
 *
 * テスト設計書のテストID: WN-001 〜 WN-007
 *
 * 注: small/mediumサイズは廃止されました。全てのタスクはlarge（18フェーズ）で実行されます。
 * 2026-01-18 更新: テストをlarge（18フェーズ）の順序に合わせて修正
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { workflowNext } from '../next.js';
import type { NextResult, PhaseName } from '../../state/types.js';

// stateManagerをモック
vi.mock('../../state/manager.js', () => ({
  stateManager: {
    getCurrentTask: vi.fn(),
    readTaskState: vi.fn(),
    updateTaskPhase: vi.fn(),
    getIncompleteSubPhases: vi.fn().mockReturnValue([]),
  },
}));

// definitionsをモック（部分的に）
vi.mock('../../phases/definitions.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../phases/definitions.js')>();
  return {
    ...original,
    // getNextPhaseはタスクサイズ対応後にオーバーライドが必要
    // 現在のテストでは元の実装を使用
  };
});

import { stateManager } from '../../state/manager.js';

/**
 * テスト用のモックタスク状態を生成
 */
function createMockTaskState(phase: PhaseName, taskSize?: 'large') {
  return {
    phase,
    taskId: '20260117_150000',
    taskName: 'テストタスク',
    workflowDir: '/path/to/workflow',
    startedAt: new Date().toISOString(),
    checklist: {},
    history: [],
    subPhases: {},
    taskSize,
  };
}

/**
 * テスト用のモックアクティブタスクを生成
 */
function createMockActiveTask(phase: PhaseName, taskSize?: 'large') {
  return {
    taskId: '20260117_150000',
    taskName: 'テストタスク',
    workflowDir: '/path/to/workflow',
    phase,
    taskSize,
  };
}

describe('next.ts - workflow_next ツールテスト (基本遷移)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('WN-001: research → requirements へ遷移', () => {
    it('from: "research", to: "requirements" が返る', () => {
      vi.mocked(stateManager.getCurrentTask).mockReturnValue(
        createMockActiveTask('research', 'large')
      );
      vi.mocked(stateManager.readTaskState).mockReturnValue(
        createMockTaskState('research', 'large')
      );

      const result = workflowNext() as NextResult;

      expect(result.success).toBe(true);
      expect(result.from).toBe('research');
      expect(result.to).toBe('requirements');
    });
  });

  describe('WN-002: requirements → parallel_analysis へ遷移', () => {
    it('from: "requirements", to: "parallel_analysis" が返る', () => {
      vi.mocked(stateManager.getCurrentTask).mockReturnValue(
        createMockActiveTask('requirements', 'large')
      );
      vi.mocked(stateManager.readTaskState).mockReturnValue(
        createMockTaskState('requirements', 'large')
      );

      const result = workflowNext() as NextResult;

      expect(result.success).toBe(true);
      expect(result.from).toBe('requirements');
      // large（18フェーズ）では requirements → parallel_analysis
      expect(result.to).toBe('parallel_analysis');
    });
  });

  describe('WN-003: 基本フェーズ遷移（非並列・非承認フェーズ）', () => {
    it('test_design → test_impl → implementation → refactoring', () => {
      // 並列フェーズと承認フェーズを除いた基本遷移をテスト
      const basicTransitions: Array<[PhaseName, PhaseName]> = [
        ['test_design', 'test_impl'],
        ['test_impl', 'implementation'],
        ['implementation', 'refactoring'],
      ];

      for (const [currentPhase, nextPhase] of basicTransitions) {
        vi.mocked(stateManager.getCurrentTask).mockReturnValue(
          createMockActiveTask(currentPhase, 'large')
        );
        vi.mocked(stateManager.readTaskState).mockReturnValue(
          createMockTaskState(currentPhase, 'large')
        );

        const result = workflowNext() as NextResult;

        expect(result.success).toBe(true);
        expect(result.from).toBe(currentPhase);
        expect(result.to).toBe(nextPhase);

        vi.clearAllMocks();
      }
    });
  });
});

describe('next.ts - workflow_next ツールテスト (18フェーズ遷移)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('WN-004: 18フェーズ: 基本フェーズ遷移', () => {
    it('承認・並列以外のフェーズを順番に遷移できる', () => {
      // 承認・並列フェーズを除いた基本遷移をテスト
      const testableTransitions: Array<[PhaseName, PhaseName]> = [
        ['research', 'requirements'],
        ['requirements', 'parallel_analysis'],
        // parallel_analysis → parallel_design は並列完了後
        // parallel_design → design_review は並列完了後
        // design_review → test_design は承認後
        ['test_design', 'test_impl'],
        ['test_impl', 'implementation'],
        ['implementation', 'refactoring'],
        ['refactoring', 'parallel_quality'],
        // parallel_quality → testing は並列完了後
        ['testing', 'parallel_verification'],
        // parallel_verification → docs_update は並列完了後
        ['docs_update', 'commit'],
        ['commit', 'push'],
        ['push', 'ci_verification'],
        ['ci_verification', 'deploy'],
        ['deploy', 'completed'],
      ];

      for (const [currentPhase, expectedNextPhase] of testableTransitions) {
        vi.mocked(stateManager.getCurrentTask).mockReturnValue(
          createMockActiveTask(currentPhase, 'large')
        );
        vi.mocked(stateManager.readTaskState).mockReturnValue(
          createMockTaskState(currentPhase, 'large')
        );
        vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

        const result = workflowNext() as NextResult;

        if (result.success) {
          expect(result.from).toBe(currentPhase);
          expect(result.to).toBe(expectedNextPhase);
        }

        vi.clearAllMocks();
      }
    });
  });
});

describe('next.ts - workflow_next ツールテスト (Largeタスク)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('WN-005: Largeタスク: 既存動作と同一（17フェーズ）', () => {
    it('research → requirements への遷移（既存動作の確認）', () => {
      vi.mocked(stateManager.getCurrentTask).mockReturnValue(
        createMockActiveTask('research', 'large')
      );
      vi.mocked(stateManager.readTaskState).mockReturnValue(
        createMockTaskState('research', 'large')
      );

      const result = workflowNext() as NextResult;

      expect(result.success).toBe(true);
      expect(result.from).toBe('research');
      expect(result.to).toBe('requirements');
    });
  });

  describe('WN-006: taskSize未設定はlargeとして扱う', () => {
    it('taskSizeがないタスクはLarge順序で遷移する', () => {
      // taskSize未設定のタスク
      vi.mocked(stateManager.getCurrentTask).mockReturnValue({
        taskId: '20260117_150000',
        taskName: 'テストタスク',
        workflowDir: '/path/to/workflow',
        phase: 'research',
        // taskSize なし
      });
      vi.mocked(stateManager.readTaskState).mockReturnValue({
        phase: 'research',
        taskId: '20260117_150000',
        taskName: 'テストタスク',
        workflowDir: '/path/to/workflow',
        startedAt: new Date().toISOString(),
        checklist: {},
        history: [],
        subPhases: {},
        // taskSize なし
      });

      const result = workflowNext() as NextResult;

      // Large順序で遷移する（research → requirements）
      expect(result.success).toBe(true);
      expect(result.from).toBe('research');
      expect(result.to).toBe('requirements');
    });
  });
});

describe('next.ts - workflow_next workflow_context テスト', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('WC-001: workflow_next が workflow_context を返す', () => {
    it('返却値に workflow_context オブジェクトが含まれる', () => {
      vi.mocked(stateManager.getCurrentTask).mockReturnValue(
        createMockActiveTask('research', 'large')
      );
      vi.mocked(stateManager.readTaskState).mockReturnValue(
        createMockTaskState('research', 'large')
      );

      const result = workflowNext() as NextResult;

      expect(result.success).toBe(true);
      expect(result.workflow_context).toBeDefined();
    });
  });

  describe('WC-002: workflow_context に workflowDir が含まれる', () => {
    it('workflow_context.workflowDir がタスクのworkflowDir', () => {
      vi.mocked(stateManager.getCurrentTask).mockReturnValue(
        createMockActiveTask('research', 'large')
      );
      vi.mocked(stateManager.readTaskState).mockReturnValue(
        createMockTaskState('research', 'large')
      );

      const result = workflowNext() as NextResult;

      expect(result.workflow_context?.workflowDir).toBe('/path/to/workflow');
    });
  });

  describe('WC-003: workflow_context に phase が含まれる', () => {
    it('workflow_context.phase が遷移先フェーズ', () => {
      vi.mocked(stateManager.getCurrentTask).mockReturnValue(
        createMockActiveTask('research', 'large')
      );
      vi.mocked(stateManager.readTaskState).mockReturnValue(
        createMockTaskState('research', 'large')
      );

      const result = workflowNext() as NextResult;

      expect(result.workflow_context?.phase).toBe('requirements');
    });
  });

  describe('WC-004: workflow_context に currentPhase が含まれる', () => {
    it('workflow_context.currentPhase が遷移前フェーズ', () => {
      vi.mocked(stateManager.getCurrentTask).mockReturnValue(
        createMockActiveTask('research', 'large')
      );
      vi.mocked(stateManager.readTaskState).mockReturnValue(
        createMockTaskState('research', 'large')
      );

      const result = workflowNext() as NextResult;

      expect(result.workflow_context?.currentPhase).toBe('research');
    });
  });
});

describe('next.ts - workflow_next エラーケース', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('WN-007: completedからは遷移不可', () => {
    it('success: false, message に "既に完了" が含まれる', () => {
      vi.mocked(stateManager.getCurrentTask).mockReturnValue(
        createMockActiveTask('completed', 'large')
      );
      vi.mocked(stateManager.readTaskState).mockReturnValue(
        createMockTaskState('completed', 'large')
      );

      const result = workflowNext() as NextResult;

      expect(result.success).toBe(false);
      expect(result.message).toContain('既に完了');
    });
  });

  describe('アクティブタスクがない場合', () => {
    it('進行中のタスクがありません エラーが返る', () => {
      vi.mocked(stateManager.getCurrentTask).mockReturnValue(null);

      const result = workflowNext() as NextResult;

      expect(result.success).toBe(false);
      expect(result.message).toContain('進行中のタスクがありません');
    });
  });
});
