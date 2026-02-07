/**
 * set-scope強化版のテスト（REQ-3: スコープ検証強化）
 *
 * @spec docs/workflows/ワ-クフロ-1000万行対応強化/test-design.md
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import os from 'os';
import { workflowSetScope } from '../set-scope.js';
import { stateManager } from '../../state/manager.js';
import type { TaskState } from '../../state/types.js';

// stateManagerをモック化
vi.mock('../../state/manager.js', () => ({
  stateManager: {
    getTaskById: vi.fn(),
    writeTaskState: vi.fn(),
  },
}));

// safeExecuteをモック化（実関数を直接呼ぶ）
vi.mock('../helpers.js', () => ({
  getTaskByIdOrError: vi.fn(),
  safeExecute: vi.fn((_label: string, fn: () => unknown) => fn()),
}));

// scope-validatorをモック化（REQ-5チェックをバイパスしてvalidateScopeExistsに到達させる）
vi.mock('../../validation/scope-validator.js', () => ({
  validateScopeDepth: vi.fn(() => ({ valid: true, errors: [] })),
  validateScopeFiles: vi.fn(() => ({ valid: true, errors: [] })),
}));

import { getTaskByIdOrError } from '../helpers.js';

let tmpDir: string;
let workflowDir: string;
let testTaskState: TaskState;

beforeEach(() => {
  vi.clearAllMocks();

  tmpDir = mkdtempSync(join(os.tmpdir(), 'set-scope-test-'));
  workflowDir = join(tmpDir, 'workflow');
  mkdirSync(workflowDir, { recursive: true });

  // テストタスク状態を作成
  testTaskState = {
    taskId: 'test-task-scope-1',
    taskName: 'Test Scope Task',
    phase: 'research',
    workflowDir,
    startedAt: new Date().toISOString(),
    checklist: {},
    history: [],
    subPhases: {},
  };

  // getTaskByIdOrErrorのモック: taskStateを返す
  vi.mocked(getTaskByIdOrError).mockReturnValue({ taskState: testTaskState });
});

afterEach(() => {
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('workflowSetScope - 存在チェック強化', () => {
  it('TC-3.1 統合: 存在しないファイルパス → ブロック', () => {
    const result = workflowSetScope(
      'test-task-scope-1',
      [
        join(tmpDir, 'nonexistent.ts'),
        join(tmpDir, 'fake.ts'),
      ],
      []
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('存在しないファイル');
    expect(result.message).toContain('nonexistent.ts');
    expect(result.message).toContain('fake.ts');
  });

  it('TC-3.2 統合: 存在しないディレクトリ → ブロック', () => {
    const result = workflowSetScope(
      'test-task-scope-1',
      [],
      [
        join(tmpDir, 'fake-dir'),
        join(tmpDir, 'non-exist'),
      ]
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('存在しないディレクトリ');
    expect(result.message).toContain('fake-dir');
    expect(result.message).toContain('non-exist');
  });

  it('TC-3.3: 空のスコープ → ブロック', () => {
    const result = workflowSetScope('test-task-scope-1', [], []);

    expect(result.success).toBe(false);
    expect(result.message).toContain('files または dirs の少なくとも1つを指定してください');
  });

  it('存在するファイル/ディレクトリ → 成功', () => {
    // 実ファイル・ディレクトリを作成
    const testFile = join(tmpDir, 'exists.ts');
    const testDir = join(tmpDir, 'exists-dir');
    writeFileSync(testFile, 'export const foo = 1;', 'utf-8');
    mkdirSync(testDir, { recursive: true });

    const result = workflowSetScope(
      'test-task-scope-1',
      [testFile],
      [testDir]
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain('影響範囲を設定しました');
  });
});

describe('workflowSetScope - 依存関係検証', () => {
  it('TC-3.6 統合: スコープ外依存検出 → 警告', () => {
    // ファイル構成:
    // - feature.ts → import { validate } from './utils'
    // - utils.ts → 存在する

    const featureFile = join(tmpDir, 'feature.ts');
    const utilsFile = join(tmpDir, 'utils.ts');

    writeFileSync(utilsFile, 'export const validate = () => {};', 'utf-8');
    writeFileSync(
      featureFile,
      `import { validate } from './utils';`,
      'utf-8'
    );

    // スコープにfeature.tsのみ含める
    const result = workflowSetScope(
      'test-task-scope-1',
      [featureFile],
      []
    );

    expect(result.success).toBe(true);
    const warnings = result.warnings as string[] | undefined;
    expect(warnings).toBeDefined();
    expect(warnings!.length).toBeGreaterThan(0);
    expect(warnings![0]).toContain('スコープ外依存');
  });

  it('TC-3.7 統合: 全依存がスコープ内 → 警告なし', () => {
    const featureFile = join(tmpDir, 'feature.ts');
    const utilsFile = join(tmpDir, 'utils.ts');

    writeFileSync(utilsFile, 'export const validate = () => {};', 'utf-8');
    writeFileSync(
      featureFile,
      `import { validate } from './utils';`,
      'utf-8'
    );

    // スコープにfeature.tsとutils.tsの両方を含める
    const result = workflowSetScope(
      'test-task-scope-1',
      [featureFile, utilsFile],
      []
    );

    expect(result.success).toBe(true);
    const warnings = result.warnings as string[] | undefined;
    expect(warnings).toBeUndefined();
  });
});
