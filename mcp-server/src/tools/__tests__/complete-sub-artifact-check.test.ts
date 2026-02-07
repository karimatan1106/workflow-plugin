/**
 * complete-sub.ts のサブフェーズ完了時成果物チェックのテスト
 *
 * REQ-2: 成果物検証の強制
 * @spec /mnt/c/ツール/Workflow/workflow-plugin/mcp-server/docs/workflows/ワークフロー成果物検証強制/test-design.md
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { workflowCompleteSub } from '../complete-sub.js';
import type { PhaseName, SubPhaseName } from '../../state/types.js';

// fs モック
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));
import * as fs from 'fs';

// stateManager モック
vi.mock('../../state/manager.js', () => ({
  stateManager: {
    getTaskById: vi.fn(),
    updateSubPhaseStatus: vi.fn(),
    getIncompleteSubPhases: vi.fn().mockReturnValue([]),
  },
}));

import { stateManager } from '../../state/manager.js';

/**
 * モックタスク状態を作成
 */
function createMockTaskState(phase: PhaseName, subPhases: Record<string, string> = {}) {
  return {
    phase,
    taskId: 'test_task_123',
    taskName: 'テストタスク',
    workflowDir: '/path/to/workflow',
    docsDir: '/path/to/docs',
    startedAt: new Date().toISOString(),
    checklist: {},
    history: [],
    subPhases,
    taskSize: 'large' as const,
  };
}

describe('complete-sub.ts - 成果物チェック（REQ-2）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('TC-2-1: threat_modeling で threat-model.md なし', () => {
    it('should return success: false with message containing "threat-model.md"', () => {
      const mockTask = createMockTaskState('parallel_analysis', {
        threat_modeling: 'pending',
      });

      vi.mocked(stateManager.getTaskById).mockReturnValue(mockTask);
      vi.mocked(fs.existsSync).mockReturnValue(false); // ファイルなし

      const result = workflowCompleteSub('test_task_123', 'threat_modeling');

      expect(result.success).toBe(false);
      expect(result.message).toContain('threat-model.md');
      expect(fs.existsSync).toHaveBeenCalledWith('/path/to/docs/threat-model.md');
      expect(stateManager.updateSubPhaseStatus).not.toHaveBeenCalled();
    });
  });

  describe('TC-2-2: threat_modeling で threat-model.md あり', () => {
    it('should return success: true and update subphase status', () => {
      const mockTask = createMockTaskState('parallel_analysis', {
        threat_modeling: 'pending',
      });

      vi.mocked(stateManager.getTaskById).mockReturnValue(mockTask);
      vi.mocked(fs.existsSync).mockReturnValue(true); // ファイルあり
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      const result = workflowCompleteSub('test_task_123', 'threat_modeling');

      expect(result.success).toBe(true);
      expect(fs.existsSync).toHaveBeenCalledWith('/path/to/docs/threat-model.md');
      expect(stateManager.updateSubPhaseStatus).toHaveBeenCalledWith(
        'test_task_123',
        'threat_modeling',
        'completed'
      );
    });
  });

  describe('TC-2-3: planning で spec.md なし', () => {
    it('should return success: false with message containing "spec.md"', () => {
      const mockTask = createMockTaskState('parallel_analysis', {
        planning: 'pending',
      });

      vi.mocked(stateManager.getTaskById).mockReturnValue(mockTask);
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = workflowCompleteSub('test_task_123', 'planning');

      expect(result.success).toBe(false);
      expect(result.message).toContain('spec.md');
      expect(fs.existsSync).toHaveBeenCalledWith('/path/to/docs/spec.md');
      expect(stateManager.updateSubPhaseStatus).not.toHaveBeenCalled();
    });
  });

  describe('TC-2-4: state_machine で state-machine.mmd なし', () => {
    it('should return success: false with message containing "state-machine.mmd"', () => {
      const mockTask = createMockTaskState('parallel_design', {
        state_machine: 'pending',
      });

      vi.mocked(stateManager.getTaskById).mockReturnValue(mockTask);
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = workflowCompleteSub('test_task_123', 'state_machine');

      expect(result.success).toBe(false);
      expect(result.message).toContain('state-machine.mmd');
      expect(fs.existsSync).toHaveBeenCalledWith('/path/to/docs/state-machine.mmd');
      expect(stateManager.updateSubPhaseStatus).not.toHaveBeenCalled();
    });
  });

  describe('TC-2-5: flowchart で flowchart.mmd なし', () => {
    it('should return success: false with message containing "flowchart.mmd"', () => {
      const mockTask = createMockTaskState('parallel_design', {
        state_machine: 'completed', // 依存サブフェーズは完了
        flowchart: 'pending',
      });

      vi.mocked(stateManager.getTaskById).mockReturnValue(mockTask);
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = workflowCompleteSub('test_task_123', 'flowchart');

      expect(result.success).toBe(false);
      expect(result.message).toContain('flowchart.mmd');
      expect(fs.existsSync).toHaveBeenCalledWith('/path/to/docs/flowchart.mmd');
      expect(stateManager.updateSubPhaseStatus).not.toHaveBeenCalled();
    });
  });

  describe('TC-2-6: ui_design で ui-design.md なし', () => {
    it('should return success: false with message containing "ui-design.md"', () => {
      const mockTask = createMockTaskState('parallel_design', {
        state_machine: 'completed', // 依存サブフェーズは完了
        flowchart: 'completed',     // 依存サブフェーズは完了
        ui_design: 'pending',
      });

      vi.mocked(stateManager.getTaskById).mockReturnValue(mockTask);
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = workflowCompleteSub('test_task_123', 'ui_design');

      expect(result.success).toBe(false);
      expect(result.message).toContain('ui-design.md');
      expect(fs.existsSync).toHaveBeenCalledWith('/path/to/docs/ui-design.md');
      expect(stateManager.updateSubPhaseStatus).not.toHaveBeenCalled();
    });
  });

  describe('TC-2-7: code_review で code-review.md なし', () => {
    it('should return success: false with message containing "code-review.md"', () => {
      const mockTask = createMockTaskState('parallel_quality', {
        code_review: 'pending',
      });

      vi.mocked(stateManager.getTaskById).mockReturnValue(mockTask);
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = workflowCompleteSub('test_task_123', 'code_review');

      expect(result.success).toBe(false);
      expect(result.message).toContain('code-review.md');
      expect(fs.existsSync).toHaveBeenCalledWith('/path/to/docs/code-review.md');
      expect(stateManager.updateSubPhaseStatus).not.toHaveBeenCalled();
    });
  });

  describe('TC-2-8: build_check（チェック対象外）', () => {
    it('should return success: true without artifact check', () => {
      const mockTask = createMockTaskState('parallel_quality', {
        build_check: 'pending',
      });

      vi.mocked(stateManager.getTaskById).mockReturnValue(mockTask);
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      const result = workflowCompleteSub('test_task_123', 'build_check');

      expect(result.success).toBe(true);
      expect(fs.existsSync).not.toHaveBeenCalled(); // 成果物チェックなし
      expect(stateManager.updateSubPhaseStatus).toHaveBeenCalledWith(
        'test_task_123',
        'build_check',
        'completed'
      );
    });
  });

  describe('TC-2-9: SKIP_ARTIFACT_CHECK=true', () => {
    let originalEnv: string | undefined;

    beforeEach(() => {
      originalEnv = process.env.SKIP_ARTIFACT_CHECK;
      process.env.SKIP_ARTIFACT_CHECK = 'true';
    });

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.SKIP_ARTIFACT_CHECK;
      } else {
        process.env.SKIP_ARTIFACT_CHECK = originalEnv;
      }
    });

    it('should return success: true without artifact check', () => {
      const mockTask = createMockTaskState('parallel_analysis', {
        threat_modeling: 'pending',
      });

      vi.mocked(stateManager.getTaskById).mockReturnValue(mockTask);
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      const result = workflowCompleteSub('test_task_123', 'threat_modeling');

      expect(result.success).toBe(true);
      expect(fs.existsSync).not.toHaveBeenCalled(); // スキップされる
      expect(stateManager.updateSubPhaseStatus).toHaveBeenCalledWith(
        'test_task_123',
        'threat_modeling',
        'completed'
      );
    });
  });

  describe('TC-2-10: manual_test で manual-test.md なし', () => {
    it('should return success: false with message containing "manual-test.md"', () => {
      const mockTask = createMockTaskState('parallel_verification', {
        manual_test: 'pending',
      });

      vi.mocked(stateManager.getTaskById).mockReturnValue(mockTask);
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = workflowCompleteSub('test_task_123', 'manual_test');

      expect(result.success).toBe(false);
      expect(result.message).toContain('manual-test.md');
      expect(fs.existsSync).toHaveBeenCalledWith('/path/to/docs/manual-test.md');
      expect(stateManager.updateSubPhaseStatus).not.toHaveBeenCalled();
    });
  });

  describe('TC-2-11: security_scan で security-scan.md なし', () => {
    it('should return success: false with message containing "security-scan.md"', () => {
      const mockTask = createMockTaskState('parallel_verification', {
        security_scan: 'pending',
      });

      vi.mocked(stateManager.getTaskById).mockReturnValue(mockTask);
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = workflowCompleteSub('test_task_123', 'security_scan');

      expect(result.success).toBe(false);
      expect(result.message).toContain('security-scan.md');
      expect(fs.existsSync).toHaveBeenCalledWith('/path/to/docs/security-scan.md');
      expect(stateManager.updateSubPhaseStatus).not.toHaveBeenCalled();
    });
  });

  describe('TC-2-12: performance_test で performance-test.md なし', () => {
    it('should return success: false with message containing "performance-test.md"', () => {
      const mockTask = createMockTaskState('parallel_verification', {
        performance_test: 'pending',
      });

      vi.mocked(stateManager.getTaskById).mockReturnValue(mockTask);
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = workflowCompleteSub('test_task_123', 'performance_test');

      expect(result.success).toBe(false);
      expect(result.message).toContain('performance-test.md');
      expect(fs.existsSync).toHaveBeenCalledWith('/path/to/docs/performance-test.md');
      expect(stateManager.updateSubPhaseStatus).not.toHaveBeenCalled();
    });
  });

  describe('TC-2-13: e2e_test で e2e-test.md なし', () => {
    it('should return success: false with message containing "e2e-test.md"', () => {
      const mockTask = createMockTaskState('parallel_verification', {
        e2e_test: 'pending',
      });

      vi.mocked(stateManager.getTaskById).mockReturnValue(mockTask);
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = workflowCompleteSub('test_task_123', 'e2e_test');

      expect(result.success).toBe(false);
      expect(result.message).toContain('e2e-test.md');
      expect(fs.existsSync).toHaveBeenCalledWith('/path/to/docs/e2e-test.md');
      expect(stateManager.updateSubPhaseStatus).not.toHaveBeenCalled();
    });
  });
});
