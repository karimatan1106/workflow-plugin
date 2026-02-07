/**
 * workflow_next ツールテスト - 成果物チェック (REQ-1)
 * @spec docs/workflows/ワークフロー成果物検証強制/test-design.md
 *
 * REQ-1: フェーズ遷移時に必須成果物の存在をチェックする
 *
 * TDD Red Phase: このテストは実装が完了するまで失敗します。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { workflowNext } from '../next.js';
import type { NextResult, PhaseName } from '../../state/types.js';

// stateManagerをモック
vi.mock('../../state/manager.js', () => ({
  stateManager: {
    getTaskById: vi.fn(),
    updateTaskPhase: vi.fn(),
    getIncompleteSubPhases: vi.fn().mockReturnValue([]),
  },
}));

// definitionsをモック
vi.mock('../../phases/definitions.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../phases/definitions.js')>();
  return {
    ...original,
  };
});

// design-validatorをモック
vi.mock('../../validation/design-validator.js', () => ({
  DesignValidator: vi.fn().mockImplementation(() => ({
    validateAll: vi.fn().mockReturnValue({
      passed: true,
      missingItems: [],
      warnings: [],
      summary: { total: 0, implemented: 0, missing: 0 },
    }),
  })),
  formatValidationError: vi.fn(),
}));

// fsモジュールをモック
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import { stateManager } from '../../state/manager.js';
import * as fs from 'fs';

const TEST_TASK_ID = '20260207_100000';

/**
 * テスト用のモックタスク状態を生成
 */
function createMockTaskState(phase: PhaseName, overrides = {}) {
  return {
    phase,
    taskId: TEST_TASK_ID,
    taskName: 'テストタスク',
    workflowDir: '/path/to/workflow',
    docsDir: '/path/to/docs',
    startedAt: new Date().toISOString(),
    checklist: {},
    history: [],
    subPhases: {},
    taskSize: 'large' as const,
    ...overrides,
  };
}

describe('next.ts - 成果物チェック (REQ-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // デフォルトではSKIP_ARTIFACT_CHECKは設定されていない
    delete process.env.SKIP_ARTIFACT_CHECK;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('TC-1-1: research フェーズで research.md なし', () => {
    it('success: false, メッセージに "research.md" が含まれる', () => {
      vi.mocked(stateManager.getTaskById).mockReturnValue(
        createMockTaskState('research')
      );
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      // research.md が存在しない
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        const pathStr = String(path);
        return !pathStr.includes('research.md');
      });

      const result = workflowNext(TEST_TASK_ID) as NextResult;

      expect(result.success).toBe(false);
      expect(result.message).toContain('research.md');
      expect(result.message).toContain('/path/to/docs');
    });
  });

  describe('TC-1-2: research フェーズで research.md あり', () => {
    it('success: true (遷移成功)', () => {
      vi.mocked(stateManager.getTaskById).mockReturnValue(
        createMockTaskState('research')
      );
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      // research.md が存在する
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        const pathStr = String(path);
        return pathStr.includes('research.md');
      });

      const result = workflowNext(TEST_TASK_ID) as NextResult;

      expect(result.success).toBe(true);
      expect(result.from).toBe('research');
      expect(result.to).toBe('requirements');
    });
  });

  describe('TC-1-3: requirements フェーズで requirements.md なし', () => {
    it('success: false, メッセージに "requirements.md" が含まれる', () => {
      vi.mocked(stateManager.getTaskById).mockReturnValue(
        createMockTaskState('requirements')
      );
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      // requirements.md が存在しない
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        const pathStr = String(path);
        return !pathStr.includes('requirements.md');
      });

      const result = workflowNext(TEST_TASK_ID) as NextResult;

      expect(result.success).toBe(false);
      expect(result.message).toContain('requirements.md');
    });
  });

  describe('TC-1-4: test_design フェーズで test-design.md なし', () => {
    it('success: false, メッセージに "test-design.md" が含まれる', () => {
      vi.mocked(stateManager.getTaskById).mockReturnValue(
        createMockTaskState('test_design')
      );
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      // test-design.md が存在しない
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        const pathStr = String(path);
        return !pathStr.includes('test-design.md');
      });

      const result = workflowNext(TEST_TASK_ID) as NextResult;

      expect(result.success).toBe(false);
      expect(result.message).toContain('test-design.md');
    });
  });

  describe('TC-1-5: implementation フェーズ（チェック対象外）', () => {
    it('成果物チェックなしで success: true', () => {
      vi.mocked(stateManager.getTaskById).mockReturnValue(
        createMockTaskState('implementation')
      );
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      // 成果物が存在しなくてもOK（implementationはチェック対象外）
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = workflowNext(TEST_TASK_ID) as NextResult;

      expect(result.success).toBe(true);
      expect(result.from).toBe('implementation');
      expect(result.to).toBe('refactoring');
    });
  });

  describe('TC-1-6: SKIP_ARTIFACT_CHECK=true', () => {
    it('成果物なしでも success: true', () => {
      process.env.SKIP_ARTIFACT_CHECK = 'true';

      vi.mocked(stateManager.getTaskById).mockReturnValue(
        createMockTaskState('research')
      );
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      // research.md が存在しない
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = workflowNext(TEST_TASK_ID) as NextResult;

      // SKIP_ARTIFACT_CHECKが有効なのでチェックをスキップして成功
      expect(result.success).toBe(true);
      expect(result.from).toBe('research');
      expect(result.to).toBe('requirements');
    });
  });

  describe('TC-1-7: docsDir undefined → workflowDir を使用', () => {
    it('docsDirが未定義の場合、workflowDirをフォールバック', () => {
      vi.mocked(stateManager.getTaskById).mockReturnValue(
        createMockTaskState('research', { docsDir: undefined })
      );
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      // research.md が存在しない
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        const pathStr = String(path);
        // workflowDirをベースにチェックされることを確認
        if (pathStr.includes('/path/to/workflow') && pathStr.includes('research.md')) {
          return false;
        }
        return true;
      });

      const result = workflowNext(TEST_TASK_ID) as NextResult;

      expect(result.success).toBe(false);
      expect(result.message).toContain('research.md');
      // workflowDirが使われていることを確認
      expect(result.message).toContain('/path/to/workflow');
    });
  });

  describe('TC-1-8: エラーメッセージに docsDir パス（出力先）が含まれる', () => {
    it('成果物なしエラーでdocsDirパスが表示される', () => {
      vi.mocked(stateManager.getTaskById).mockReturnValue(
        createMockTaskState('requirements')
      );
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      // requirements.md が存在しない
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        const pathStr = String(path);
        return !pathStr.includes('requirements.md');
      });

      const result = workflowNext(TEST_TASK_ID) as NextResult;

      expect(result.success).toBe(false);
      expect(result.message).toContain('requirements.md');
      expect(result.message).toContain('/path/to/docs');
    });
  });
});
