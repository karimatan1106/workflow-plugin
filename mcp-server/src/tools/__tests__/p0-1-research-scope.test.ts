/**
 * P0-1 テスト: researchフェーズスコープ設定とモデル変更の検証
 * @spec docs/workflows/P0問題3件の根本修正/test-design.md
 *
 * definitions.tsのPHASE_GUIDES.researchのmodelがsonnetであること、
 * checklistにworkflow_set_scopeの記述が含まれること、
 * workflowNext関数でresearch→requirements遷移時にスコープ未設定の場合
 * warningsが返ること（ブロックはされない）を検証する。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { workflowNext } from '../next.js';
import type { NextResult, PhaseName } from '../../state/types.js';

// stateManagerをモック化
vi.mock('../../state/manager.js', () => ({
  stateManager: {
    getTaskById: vi.fn(),
    updateTaskPhase: vi.fn(),
    getIncompleteSubPhases: vi.fn().mockReturnValue([]),
    writeTaskState: vi.fn(),
  },
}));

// design-validatorをモック化
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

// helpersをモック化（verifySessionToken）
vi.mock('../helpers.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../helpers.js')>();
  return {
    ...original,
    verifySessionToken: vi.fn(() => null),
  };
});

// audit/loggerをモック化
vi.mock('../../audit/logger.js', () => ({
  auditLogger: {
    log: vi.fn(),
    countRecentBypasses: vi.fn(() => 0),
    checkThreshold: vi.fn(() => false),
  },
}));

// validation/scope-validatorをモック化
vi.mock('../../validation/scope-validator.js', () => ({
  validateScopePostExecution: vi.fn(() => ({
    valid: true,
    outOfScopeFiles: [],
    warnings: [],
  })),
}));

// validation/test-authenticityをモック化
vi.mock('../../validation/test-authenticity.js', () => ({
  validateTestAuthenticity: vi.fn(() => ({ valid: true, warnings: [] })),
  recordTestOutputHash: vi.fn(),
}));

// fsモジュールをモック化（成果物チェック用: デフォルトでtrueを返す）
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => generateMockResearchMd()),
    statSync: vi.fn(() => ({ size: 800 })),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

import * as fs from 'fs';
import { stateManager } from '../../state/manager.js';

const TEST_TASK_ID = '20260217_p0_test';

/**
 * researchフェーズのモックタスク状態を生成するヘルパー
 * scopeパラメータでスコープの有無を制御する
 */
function createResearchTaskState(scope?: { affectedFiles: string[]; affectedDirs: string[] }) {
  return {
    taskId: TEST_TASK_ID,
    taskName: 'P0テストタスク',
    phase: 'research' as PhaseName,
    workflowDir: '/path/to/workflow',
    docsDir: '/path/to/docs',
    startedAt: new Date().toISOString(),
    checklist: {},
    history: [],
    subPhases: {},
    taskSize: 'large' as const,
    scope: scope,
  };
}

/**
 * research.mdのモックコンテンツを生成する
 * artifact-validatorの最小行数・必須セクション要件を満たすコンテンツ
 */
function generateMockResearchMd(): string {
  const lines = [
    '# P0問題調査結果',
    '',
    '## サマリー',
    '',
    '本調査はP0問題の根本原因を特定するための調査結果である。',
    '調査対象はworkflow-pluginのhooks/libディレクトリとmcp-serverディレクトリである。',
    '既存の実装パターンを確認し、修正対象の特定を完了した。',
    '主要な問題点は3件のP0問題として分類された。',
    '',
    '## 調査結果',
    '',
    'discover-tasks.jsのwriteTaskIndexCacheが非アトミック書き込みを使用していることが判明した。',
    'next.tsのPHASE_TO_ARTIFACTにparallel_analysisエントリが欠落していることが確認された。',
    'definitions.tsのresearchフェーズ設定でmodelがhaikuのままであることが確認された。',
    '調査の結果、3つの問題の修正方針が明確になった。',
    '',
    '## 既存実装の分析',
    '',
    'stateManagerのupdateTaskIndexForSingleTaskはatonicWriteJsonを使用して実装されている。',
    'complete-sub.tsではSUB_PHASE_TO_ARTIFACTが既に実装済みである。',
    'requirementsフェーズのchecklistにworkflow_set_scopeの記述が存在する。',
    '各問題の修正コストは最小限であり、既存の動作への影響も限定的である。',
    '',
  ];
  return lines.join('\n');
}

describe('P0-1: researchフェーズスコープ設定とモデル変更', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ size: 800 } as ReturnType<typeof fs.statSync>);
    vi.mocked(fs.readFileSync).mockReturnValue(generateMockResearchMd());
    delete process.env.SKIP_ARTIFACT_CHECK;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('TC-1-1: PHASE_GUIDES.researchのmodelがsonnetである', () => {
    it('researchフェーズの設定でmodelがsonnetに設定されている', async () => {
      // definitions.tsからPHASE_GUIDESを動的インポートで取得する
      const { PHASE_GUIDES } = await import('../../phases/definitions.js');

      const researchGuide = PHASE_GUIDES['research'];
      expect(researchGuide).toBeDefined();
      expect(researchGuide?.model).toBe('sonnet');
    });
  });

  describe('TC-1-2: PHASE_GUIDES.researchのchecklistにworkflow_set_scopeの記述が含まれる', () => {
    it('researchチェックリストにworkflow_set_scope文字列が存在する', async () => {
      const { PHASE_GUIDES } = await import('../../phases/definitions.js');

      const researchGuide = PHASE_GUIDES['research'];
      expect(researchGuide).toBeDefined();
      expect(researchGuide?.checklist).toBeDefined();

      const checklist = researchGuide?.checklist ?? [];
      const hasWorkflowSetScope = checklist.some(
        (item: string) => item.includes('workflow_set_scope')
      );
      expect(hasWorkflowSetScope).toBe(true);
    });

    it('researchチェックリストの要素数が4以上である（スコープ設定項目が追加されている）', async () => {
      const { PHASE_GUIDES } = await import('../../phases/definitions.js');

      const researchGuide = PHASE_GUIDES['research'];
      const checklist = researchGuide?.checklist ?? [];
      // 修正前は4項目、修正後は5項目以上になることを確認する
      expect(checklist.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('TC-1-3: research→requirements遷移時にスコープ未設定でwarningsが返る', () => {
    it('scopeがundefinedの場合、warningsフィールドにスコープ警告が含まれる', () => {
      const taskState = createResearchTaskState(undefined);
      vi.mocked(stateManager.getTaskById).mockReturnValue(taskState as any);
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      const result = workflowNext(TEST_TASK_ID) as NextResult;

      // スコープ未設定の場合、遷移は成功するがwarningsが返る
      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(Array.isArray(result.warnings)).toBe(true);
      expect((result.warnings as string[]).length).toBeGreaterThan(0);
    });

    it('warningsメッセージにworkflow_set_scopeへの言及が含まれる', () => {
      const taskState = createResearchTaskState(undefined);
      vi.mocked(stateManager.getTaskById).mockReturnValue(taskState as any);
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      const result = workflowNext(TEST_TASK_ID) as NextResult;

      expect(result.success).toBe(true);
      const warnings = (result.warnings as string[]) ?? [];
      const hasWorkflowSetScopeWarning = warnings.some(
        (w: string) => w.includes('workflow_set_scope') || w.includes('スコープ')
      );
      expect(hasWorkflowSetScopeWarning).toBe(true);
    });

    it('空のaffectedFilesとaffectedDirsでも警告が返る', () => {
      const taskState = createResearchTaskState({ affectedFiles: [], affectedDirs: [] });
      vi.mocked(stateManager.getTaskById).mockReturnValue(taskState as any);
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      const result = workflowNext(TEST_TASK_ID) as NextResult;

      // 空配列でもスコープ未設定と同等のため、successはtrueかつwarningsあり
      expect(result.success).toBe(true);
      const warnings = (result.warnings as string[]) ?? [];
      expect(warnings.length).toBeGreaterThan(0);
    });

    it('遷移後のフェーズがrequirementsである（ブロックではなく警告のみ）', () => {
      const taskState = createResearchTaskState(undefined);
      vi.mocked(stateManager.getTaskById).mockReturnValue(taskState as any);
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      const result = workflowNext(TEST_TASK_ID) as NextResult;

      // 警告があっても遷移は成功する
      expect(result.success).toBe(true);
      expect(result.from).toBe('research');
      expect(result.to).toBe('requirements');
    });
  });

  describe('TC-1-4: スコープ設定済みの場合はwarningsにスコープ警告が含まれない', () => {
    it('affectedDirsが設定済みの場合、スコープ警告が含まれない', () => {
      const taskState = createResearchTaskState({
        affectedFiles: [],
        affectedDirs: ['workflow-plugin/mcp-server/src/'],
      });
      vi.mocked(stateManager.getTaskById).mockReturnValue(taskState as any);
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      const result = workflowNext(TEST_TASK_ID) as NextResult;

      expect(result.success).toBe(true);
      // スコープが設定されている場合、スコープ関連の警告は含まれない
      const warnings = (result.warnings as string[]) ?? [];
      const hasWorkflowSetScopeWarning = warnings.some(
        (w: string) => w.includes('workflow_set_scope') || w.includes('スコープが設定されていません')
      );
      expect(hasWorkflowSetScopeWarning).toBe(false);
    });

    it('affectedFilesが設定済みの場合、スコープ警告が含まれない', () => {
      const taskState = createResearchTaskState({
        affectedFiles: ['workflow-plugin/hooks/lib/discover-tasks.js'],
        affectedDirs: [],
      });
      vi.mocked(stateManager.getTaskById).mockReturnValue(taskState as any);
      vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

      const result = workflowNext(TEST_TASK_ID) as NextResult;

      expect(result.success).toBe(true);
      const warnings = (result.warnings as string[]) ?? [];
      const hasWorkflowSetScopeWarning = warnings.some(
        (w: string) => w.includes('workflow_set_scope') || w.includes('スコープが設定されていません')
      );
      expect(hasWorkflowSetScopeWarning).toBe(false);
    });
  });
});
