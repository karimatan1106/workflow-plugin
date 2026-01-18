/**
 * WorkflowStateManager テスト
 * @spec docs/workflows/アーティファクトテンプレートテスト/test-design.md
 *
 * 成果物テンプレート作成機能のテスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// fsモジュールをモック
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// manager.jsを動的インポート（モック後にインポートする必要がある）
const importManager = async () => {
  const module = await import('../manager.js');
  return module;
};

describe('WorkflowStateManager - createTask テスト', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('createTaskでdocsDirが設定される', async () => {
    const { WorkflowStateManager } = await importManager();
    const manager = new WorkflowStateManager('/test/global.json', '/test/workflows');

    // readGlobalStateモック
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      phase: 'idle',
      activeTasks: [],
      history: [],
      checklist: {},
    }));

    const taskState = manager.createTask('テストタスク');

    expect(taskState.docsDir).toBeDefined();
    expect(taskState.docsDir).toContain('テストタスク');
  });

  it('createTaskでdocsDirディレクトリが作成される', async () => {
    const { WorkflowStateManager } = await importManager();
    const manager = new WorkflowStateManager('/test/global.json', '/test/workflows');

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      phase: 'idle',
      activeTasks: [],
      history: [],
      checklist: {},
    }));

    manager.createTask('テストタスク');

    // mkdirSyncが呼ばれたことを確認
    expect(fs.mkdirSync).toHaveBeenCalled();
  });

  it('成果物テンプレートがエンタープライズ構成に作成される', async () => {
    const { WorkflowStateManager } = await importManager();
    const manager = new WorkflowStateManager('/test/global.json', '/test/workflows');

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      phase: 'idle',
      activeTasks: [],
      history: [],
      checklist: {},
    }));

    manager.createTask('テストタスク');

    // writeFileSyncが複数回呼ばれたことを確認（テンプレートファイル作成）
    const writeFileCalls = vi.mocked(fs.writeFileSync).mock.calls;
    const writtenPaths = writeFileCalls.map(call => call[0] as string);

    // エンタープライズ構成のパスを確認
    expect(writtenPaths.some(p => p.includes('security') && p.includes('threat-models'))).toBe(true);
    expect(writtenPaths.some(p => p.includes('testing') && p.includes('plans'))).toBe(true);
    expect(writtenPaths.some(p => p.includes('specs') && p.includes('requirements'))).toBe(true);
    expect(writtenPaths.some(p => p.includes('architecture') && p.includes('diagrams'))).toBe(true);
    expect(writtenPaths.some(p => p.includes('specs') && p.includes('ui'))).toBe(true);
  });

  it('成果物配置先ディレクトリが自動作成される', async () => {
    const { WorkflowStateManager } = await importManager();
    const manager = new WorkflowStateManager('/test/global.json', '/test/workflows');

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      phase: 'idle',
      activeTasks: [],
      history: [],
      checklist: {},
    }));

    manager.createTask('テストタスク');

    // mkdirSyncの呼び出しを確認
    const mkdirCalls = vi.mocked(fs.mkdirSync).mock.calls;
    const createdDirs = mkdirCalls.map(call => call[0] as string);

    // エンタープライズ構成のディレクトリが作成されることを確認
    expect(createdDirs.some(d => d.includes('security'))).toBe(true);
    expect(createdDirs.some(d => d.includes('testing'))).toBe(true);
    expect(createdDirs.some(d => d.includes('architecture'))).toBe(true);
  });
});

describe('WorkflowStateManager - initializeSubPhases テスト', () => {
  it('parallel_analysisでthreat_modelingとplanningが初期化される', async () => {
    const { WorkflowStateManager } = await importManager();
    const manager = new WorkflowStateManager('/test/global.json', '/test/workflows');

    const subPhases = manager.initializeSubPhases('parallel_analysis');

    expect(subPhases).toHaveProperty('threat_modeling', 'pending');
    expect(subPhases).toHaveProperty('planning', 'pending');
  });

  it('parallel_designで3つのサブフェーズが初期化される', async () => {
    const { WorkflowStateManager } = await importManager();
    const manager = new WorkflowStateManager('/test/global.json', '/test/workflows');

    const subPhases = manager.initializeSubPhases('parallel_design');

    expect(subPhases).toHaveProperty('state_machine', 'pending');
    expect(subPhases).toHaveProperty('flowchart', 'pending');
    expect(subPhases).toHaveProperty('ui_design', 'pending');
  });

  it('非並列フェーズでは空オブジェクトが返る', async () => {
    const { WorkflowStateManager } = await importManager();
    const manager = new WorkflowStateManager('/test/global.json', '/test/workflows');

    const subPhases = manager.initializeSubPhases('research');

    expect(Object.keys(subPhases)).toHaveLength(0);
  });
});
