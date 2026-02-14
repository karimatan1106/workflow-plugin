/**
 * REQ-2: 承認ゲートテスト
 *
 * requirements, test_design, code_reviewフェーズでの承認ゲートを検証する。
 * 現在の実装ではdesign_reviewのみが承認必須フェーズ。
 * REQ-2実装後は3つのフェーズが追加される（TDD Red Phase）。
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { REVIEW_PHASES, APPROVE_TYPE_MAPPING, requiresApproval } from '../../phases/definitions.js';

// stateManagerをモック
vi.mock('../../state/manager.js', () => ({
  stateManager: {
    getTaskById: vi.fn(),
    updateTaskPhase: vi.fn(),
    getIncompleteSubPhases: vi.fn().mockReturnValue([]),
    writeTaskState: vi.fn(),
  },
}));

// design-validatorをモック
vi.mock('../../validation/design-validator.js', () => ({
  DesignValidator: vi.fn(() => ({
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
import { workflowNext } from '../next.js';
import { workflowApprove } from '../approve.js';
import type { TaskState, PhaseName, NextResult, ApproveResult } from '../../state/types.js';

const TEST_TASK_ID = '20260208_120000';

/**
 * テスト用のタスク状態を作成
 */
function createMockTaskState(phase: PhaseName): TaskState {
  return {
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
}

describe('REQ-2: 承認ゲートテスト', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('definitions.ts: REVIEW_PHASES の確認', () => {
    test('REQ-2 + REQ-REVIEW-1: requirements, design_review, test_design, code_review が含まれる', () => {
      // REQ-REVIEW-1: code_review追加で承認ゲート一元管理
      expect(REVIEW_PHASES).toContain('requirements');
      expect(REVIEW_PHASES).toContain('design_review');
      expect(REVIEW_PHASES).toContain('test_design');
      expect(REVIEW_PHASES).toContain('code_review');
      expect(REVIEW_PHASES.length).toBe(4);
    });

    test('REQ-REVIEW-1: requiresApproval がcode_reviewに対してtrueを返す', () => {
      // code_reviewはSubPhaseNameだが、REVIEW_PHASESに追加されたため承認が必要
      expect(requiresApproval('code_review')).toBe(true);
      // 承認不要なフェーズではfalseを返すことも確認
      expect(requiresApproval('implementation')).toBe(false);
    });
  });

  describe('TC-2-1: requirementsフェーズでworkflow_next → 承認メッセージ', () => {
    test('success: false, 承認が必要というメッセージが返る（REQ-2実装済み）', () => {
      vi.mocked(stateManager.getTaskById).mockReturnValue(
        createMockTaskState('requirements')
      );
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      const result = workflowNext(TEST_TASK_ID) as NextResult;

      // REQ-2実装済み: requirementsは承認フェーズのため承認が必要
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/承認が必要/);
    });
  });

  describe('TC-2-2: test_designフェーズでworkflow_next → 承認メッセージ', () => {
    test('success: false, 承認が必要というメッセージが返る（REQ-2実装済み）', () => {
      vi.mocked(stateManager.getTaskById).mockReturnValue(
        createMockTaskState('test_design')
      );
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      const result = workflowNext(TEST_TASK_ID) as NextResult;

      // REQ-2実装済み: test_designは承認フェーズのため承認が必要
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/承認が必要/);
    });
  });

  describe('TC-2-3: parallel_qualityのcode_review完了後にworkflow_next → 承認メッセージ', () => {
    test('success: false, 承認が必要というメッセージが返る（REQ-2実装後）', () => {
      // code_reviewサブフェーズを完了済みとしてセットアップ
      const state = createMockTaskState('parallel_quality');
      state.subPhases = {
        build_check: 'completed',
        code_review: 'completed',
      };

      vi.mocked(stateManager.getTaskById).mockReturnValue(state);
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      const result = workflowNext(TEST_TASK_ID) as NextResult;

      // REQ-2実装済み: parallel_quality → testing 遷移時にcode_review承認が必要
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/code_review承認が必要/);
    });
  });

  describe('TC-2-4: workflowApprove("requirements")が成功する（REQ-2実装済み）', () => {
    test('approve type "requirements" で承認できる', () => {
      vi.mocked(stateManager.getTaskById).mockReturnValue(
        createMockTaskState('requirements')
      );

      // REQ-2実装済み: APPROVE_TYPE_MAPPING に 'requirements' が追加された
      const result = workflowApprove(TEST_TASK_ID, 'requirements') as ApproveResult;

      expect(result.success).toBe(true);
      expect(result.approved).toBe('requirements');
      expect(result.nextPhase).toBe('parallel_analysis');
    });
  });

  describe('TC-2-5: workflowApprove("test_design")が成功する（REQ-2実装済み）', () => {
    test('approve type "test_design" で承認できる', () => {
      vi.mocked(stateManager.getTaskById).mockReturnValue(
        createMockTaskState('test_design')
      );

      // REQ-2実装済み: APPROVE_TYPE_MAPPING に 'test_design' が追加された
      const result = workflowApprove(TEST_TASK_ID, 'test_design') as ApproveResult;

      expect(result.success).toBe(true);
      expect(result.approved).toBe('test_design');
      expect(result.nextPhase).toBe('test_impl');
    });
  });

  describe('TC-2-6: workflowApprove("code_review")が成功する（REQ-2実装済み）', () => {
    test('approve type "code_review" で承認できる', () => {
      // parallel_quality完了後の状態
      const state = createMockTaskState('parallel_quality');
      state.subPhases = {
        build_check: 'completed',
        code_review: 'completed',
      };

      vi.mocked(stateManager.getTaskById).mockReturnValue(state);

      // REQ-2実装済み: APPROVE_TYPE_MAPPING に 'code_review' が追加された
      const result = workflowApprove(TEST_TASK_ID, 'code_review') as ApproveResult;

      expect(result.success).toBe(true);
      expect(result.approved).toBe('code_review');
      expect(result.nextPhase).toBe('testing');
    });
  });

  describe('TC-2-7: APPROVE_TYPE_MAPPING の確認', () => {
    test('REQ-2実装済み: requirements, design, test_design, code_review が含まれる', () => {
      expect(APPROVE_TYPE_MAPPING).toHaveProperty('requirements');
      expect(APPROVE_TYPE_MAPPING).toHaveProperty('design');
      expect(APPROVE_TYPE_MAPPING).toHaveProperty('test_design');
      expect(APPROVE_TYPE_MAPPING).toHaveProperty('code_review');
      expect(Object.keys(APPROVE_TYPE_MAPPING).length).toBe(4);
    });

    test('code_reviewはAPPROVE_TYPE_MAPPINGに含まれる（REQ-2実装済み）', () => {
      // REQ-2実装済み: code_reviewがAPPROVE_TYPE_MAPPINGに追加された
      expect(APPROVE_TYPE_MAPPING).toHaveProperty('code_review');
      expect(APPROVE_TYPE_MAPPING.code_review).toEqual({ expectedPhase: 'parallel_quality', nextPhase: 'testing' });
    });
  });

  describe('TC-2-8: design_reviewの承認は引き続き動作する', () => {
    test('既存のdesign承認が正常に動作する', () => {
      vi.mocked(stateManager.getTaskById).mockReturnValue(
        createMockTaskState('design_review')
      );

      const result = workflowApprove(TEST_TASK_ID, 'design') as ApproveResult;

      expect(result.success).toBe(true);
      expect(result.approved).toBe('design');
      expect(result.nextPhase).toBe('test_design');
    });
  });
});
