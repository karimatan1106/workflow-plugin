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

// helpersをモック（verifySessionToken）
vi.mock('../helpers.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../helpers.js')>();
  return {
    ...original,
    verifySessionToken: vi.fn(() => null), // Always return null (success)
  };
});

// audit/loggerをモック
vi.mock('../../audit/logger.js', () => ({
  auditLogger: {
    log: vi.fn(),
    countRecentBypasses: vi.fn(() => 0),
    checkThreshold: vi.fn(() => false),
  },
}));

// validation/scope-validatorをモック
vi.mock('../../validation/scope-validator.js', () => ({
  validateScopePostExecution: vi.fn(() => ({
    valid: true,
    outOfScopeFiles: [],
    warnings: [],
  })),
}));

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
  performDesignValidation: vi.fn(() => null),
}));

// fsモジュールをモック
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(actual.existsSync),
    readFileSync: vi.fn(actual.readFileSync),
    statSync: vi.fn(actual.statSync),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

import { stateManager } from '../../state/manager.js';
import * as fs from 'fs';

const TEST_TASK_ID = '20260207_100000';

/**
 * 有効なモックコンテンツ（artifact-validator要件を満たす）
 * 各行は10文字以上必要（短い行の比率チェック対策）
 */
const MOCK_RESEARCH_MD = Array.from({length: 25}, (_, i) =>
  i === 0 ? '# Research調査結果ドキュメント' :
  i === 2 ? '## 調査結果' :
  i === 5 ? '調査内容の詳細を記載します。既存コードを分析しました。' :
  i === 10 ? '## 既存実装の分析' :
  i === 13 ? '分析内容の詳細を記載します。問題点を特定しました。' :
  `調査事項の内容を記載します。項目番号は${i}です。詳細な説明文。`
).join('\n');

const MOCK_REQUIREMENTS_MD = Array.from({length: 35}, (_, i) =>
  i === 0 ? '# Requirements要件定義ドキュメント' :
  i === 2 ? '## 背景と目的' :
  i === 5 ? '背景情報の詳細を記載します。プロジェクトの目的を説明します。' :
  i === 10 ? '## 機能要件の詳細' :
  i === 13 ? 'REQ-1: 機能要件の詳細な記述を行います。' :
  i === 20 ? '## 受入条件の定義' :
  i === 23 ? 'AC-1: 受入条件の詳細な記述を行います。' :
  `要件定義の内容を記載します。項目番号は${i}です。詳細な説明文。`
).join('\n');

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
      // パス区切り文字は環境依存なので正規表現でチェック
      expect(result.message).toMatch(/path.to.docs/);
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
      vi.mocked(fs.statSync).mockReturnValue({ size: 500 } as any);
      vi.mocked(fs.readFileSync).mockReturnValue(MOCK_RESEARCH_MD);

      const result = workflowNext(TEST_TASK_ID) as NextResult;

      expect(result.success).toBe(true);
      expect(result.from).toBe('research');
      expect(result.to).toBe('requirements');
    });
  });

  describe('TC-1-3: requirements フェーズで requirements.md なし', () => {
    it('success: false, 承認が必要というメッセージが返る（承認ゲートが成果物チェックより先）', () => {
      const taskState = createMockTaskState('requirements');
      // REQ-2実装済み: requirementsフェーズには承認が必要
      // 承認がないため、成果物チェックの前に承認エラーが返る
      vi.mocked(stateManager.getTaskById).mockReturnValue(taskState);
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      // requirements.md が存在しない
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        const pathStr = String(path);
        return !pathStr.includes('requirements.md');
      });

      const result = workflowNext(TEST_TASK_ID) as NextResult;

      expect(result.success).toBe(false);
      // 承認ゲートが先に発動するため、承認エラーメッセージが返る
      expect(result.message).toMatch(/承認が必要/);
    });
  });

  describe('TC-1-4: test_design フェーズで test-design.md なし', () => {
    it('success: false, 承認が必要というメッセージが返る（承認ゲートが成果物チェックより先）', () => {
      const taskState = createMockTaskState('test_design');
      // REQ-2実装済み: test_designフェーズには承認が必要
      // 承認がないため、成果物チェックの前に承認エラーが返る
      vi.mocked(stateManager.getTaskById).mockReturnValue(taskState);
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      // test-design.md が存在しない
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        const pathStr = String(path);
        return !pathStr.includes('test-design.md');
      });

      const result = workflowNext(TEST_TASK_ID) as NextResult;

      expect(result.success).toBe(false);
      // 承認ゲートが先に発動するため、承認エラーメッセージが返る
      expect(result.message).toMatch(/承認が必要/);
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

  describe('TC-1-6: SKIP_ARTIFACT_CHECK は削除された (REQ-1)', () => {
    it('SKIP_ARTIFACT_CHECK=true でも成果物チェックは実行される', () => {
      process.env.SKIP_ARTIFACT_CHECK = 'true';

      vi.mocked(stateManager.getTaskById).mockReturnValue(
        createMockTaskState('research')
      );
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      // research.md が存在しない
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = workflowNext(TEST_TASK_ID) as NextResult;

      // REQ-1により SKIP_ARTIFACT_CHECK は削除されたため、チェックは必ず実行される
      expect(result.success).toBe(false);
      expect(result.message).toContain('research.md');
    });
  });

  describe('TC-1-7: docsDir undefined → workflowDir を使用', () => {
    it('docsDirが未定義の場合、workflowDirをフォールバック', () => {
      vi.mocked(stateManager.getTaskById).mockReturnValue(
        createMockTaskState('research', { docsDir: undefined })
      );
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      // research.md が存在しない（パス区切り文字をnormalize）
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p).replace(/\\/g, '/');
        // workflowDirをベースにチェックされることを確認
        if (pathStr.includes('/path/to/workflow') && pathStr.includes('research.md')) {
          return false;
        }
        return false;
      });

      const result = workflowNext(TEST_TASK_ID) as NextResult;

      expect(result.success).toBe(false);
      expect(result.message).toContain('research.md');
      // workflowDirが使われていることを確認（パス区切り文字は環境依存）
      expect(result.message).toMatch(/path.to.workflow/);
    });
  });

  describe('TC-1-8: エラーメッセージ（承認ゲートが先）', () => {
    it('requirementsフェーズでは承認エラーが先に返る', () => {
      const taskState = createMockTaskState('requirements');
      // REQ-2実装済み: 承認がないため、承認エラーが先に返る
      vi.mocked(stateManager.getTaskById).mockReturnValue(taskState);
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      // requirements.md が存在しない
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        const pathStr = String(path);
        return !pathStr.includes('requirements.md');
      });

      const result = workflowNext(TEST_TASK_ID) as NextResult;

      expect(result.success).toBe(false);
      // 承認ゲートが先に発動
      expect(result.message).toMatch(/承認が必要/);
    });
  });
});
