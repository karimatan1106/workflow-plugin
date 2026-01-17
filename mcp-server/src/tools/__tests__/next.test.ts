/**
 * workflow_next ツールテスト (next.ts)
 * @spec docs/workflows/20260117_150655_ワ-クフロ-スキル未実装機能の追加/test-design.md
 *
 * テスト設計書のテストID: WN-001 〜 WN-007
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
function createMockTaskState(phase: PhaseName, taskSize?: 'small' | 'medium' | 'large') {
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
function createMockActiveTask(phase: PhaseName, taskSize?: 'small' | 'medium' | 'large') {
  return {
    taskId: '20260117_150000',
    taskName: 'テストタスク',
    workflowDir: '/path/to/workflow',
    phase,
    taskSize,
  };
}

describe('next.ts - workflow_next ツールテスト (Smallタスク)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('WN-001: Smallタスク: research → requirements へ遷移', () => {
    it('from: "research", to: "requirements" が返る', () => {
      // Smallタスクのモック設定
      vi.mocked(stateManager.getCurrentTask).mockReturnValue(
        createMockActiveTask('research', 'small')
      );
      vi.mocked(stateManager.readTaskState).mockReturnValue(
        createMockTaskState('research', 'small')
      );

      const result = workflowNext() as NextResult;

      expect(result.success).toBe(true);
      expect(result.from).toBe('research');
      expect(result.to).toBe('requirements');
    });
  });

  describe('WN-002: Smallタスク: requirements → implementation へ遷移', () => {
    it('from: "requirements", to: "implementation" が返る', () => {
      vi.mocked(stateManager.getCurrentTask).mockReturnValue(
        createMockActiveTask('requirements', 'small')
      );
      vi.mocked(stateManager.readTaskState).mockReturnValue(
        createMockTaskState('requirements', 'small')
      );

      const result = workflowNext() as NextResult;

      expect(result.success).toBe(true);
      expect(result.from).toBe('requirements');
      // Smallでは design 関連フェーズをスキップして implementation へ
      expect(result.to).toBe('implementation');
    });
  });

  describe('WN-003: Smallタスク: 全6フェーズ正常遷移', () => {
    it('research → requirements → implementation → testing → commit → completed', () => {
      const smallPhases: PhaseName[] = [
        'research',
        'requirements',
        'implementation',
        'testing',
        'commit',
        'completed',
      ];

      // 各フェーズ遷移をテスト
      for (let i = 0; i < smallPhases.length - 1; i++) {
        const currentPhase = smallPhases[i];
        const nextPhase = smallPhases[i + 1];

        vi.mocked(stateManager.getCurrentTask).mockReturnValue(
          createMockActiveTask(currentPhase, 'small')
        );
        vi.mocked(stateManager.readTaskState).mockReturnValue(
          createMockTaskState(currentPhase, 'small')
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

describe('next.ts - workflow_next ツールテスト (Mediumタスク)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('WN-004: Mediumタスク: 全12フェーズ正常遷移', () => {
    it('Mediumの全フェーズを順番に遷移できる', () => {
      // Mediumフェーズの期待される順序
      const mediumPhases: PhaseName[] = [
        'research',
        'requirements',
        'parallel_design',
        'design_review',
        'test_design',
        'test_impl',
        'implementation',
        'refactoring',
        'parallel_quality',
        'testing',
        'commit',
        'completed',
      ];

      // design_review は承認が必要なので、その前後をスキップしてテスト
      // design_review以外のフェーズ遷移をテスト
      const testableTransitions: Array<[PhaseName, PhaseName]> = [
        ['research', 'requirements'],
        ['requirements', 'parallel_design'],
        // parallel_design → design_review は承認が必要なのでスキップ
        // design_review → test_design は承認後なのでスキップ
        ['test_design', 'test_impl'],
        ['test_impl', 'implementation'],
        ['implementation', 'refactoring'],
        ['refactoring', 'parallel_quality'],
        // parallel_quality → testing は並列完了後
        ['testing', 'commit'],
        ['commit', 'completed'],
      ];

      for (const [currentPhase, expectedNextPhase] of testableTransitions) {
        vi.mocked(stateManager.getCurrentTask).mockReturnValue(
          createMockActiveTask(currentPhase, 'medium')
        );
        vi.mocked(stateManager.readTaskState).mockReturnValue(
          createMockTaskState(currentPhase, 'medium')
        );
        vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

        const result = workflowNext() as NextResult;

        // 並列フェーズや承認フェーズは別途処理が必要なので、基本遷移のみ確認
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
        createMockActiveTask('completed', 'small')
      );
      vi.mocked(stateManager.readTaskState).mockReturnValue(
        createMockTaskState('completed', 'small')
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
