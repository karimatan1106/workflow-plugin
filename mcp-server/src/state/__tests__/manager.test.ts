/**
 * WorkflowStateManager テスト
 * @spec docs/workflows/アーティファクトテンプレートテスト/test-design.md
 * @spec docs/workflows/ワ-クフロ-並列タスク対応/spec.md
 *
 * 成果物テンプレート作成機能のテスト
 *
 * 注: GlobalStateは廃止され、ディレクトリスキャンベースの管理に移行しました。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';

// fsモジュールをモック
vi.mock('fs', () => ({
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
  unlinkSync: vi.fn(),
  openSync: vi.fn(() => 999),
  writeSync: vi.fn(),
  closeSync: vi.fn(),
}));

// lock-utilsモジュールをモック (FR-1)
vi.mock('../lock-utils.js', () => ({
  atomicWriteJson: vi.fn(),
  acquireLock: vi.fn(async () => vi.fn()),
  logLockEvent: vi.fn(),
}));

// cacheモジュールをモック (FR-11)
vi.mock('../cache.js', () => ({
  taskCache: {
    get: vi.fn(() => null),
    set: vi.fn(),
    invalidate: vi.fn(),
    clear: vi.fn(),
    getHitRate: vi.fn(() => 0),
  },
  isCacheEnabled: vi.fn(() => false),
  TaskCache: vi.fn(),
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
    const manager = new WorkflowStateManager('/test/workflows');

    const taskState = manager.createTask('テストタスク');

    expect(taskState.docsDir).toBeDefined();
    expect(taskState.docsDir).toContain('テストタスク');
  });

  it('createTaskでdocsDirディレクトリが作成される', async () => {
    const { WorkflowStateManager } = await importManager();
    const manager = new WorkflowStateManager('/test/workflows');

    manager.createTask('テストタスク');

    // mkdirSyncが呼ばれたことを確認
    expect(fs.mkdirSync).toHaveBeenCalled();
  });

  it('ワークフロー成果物ディレクトリが作成される', async () => {
    const { WorkflowStateManager } = await importManager();
    const manager = new WorkflowStateManager('/test/workflows');

    manager.createTask('テストタスク');

    // mkdirSyncが呼ばれたことを確認（ワークフローディレクトリ作成）
    const mkdirCalls = vi.mocked(fs.mkdirSync).mock.calls;
    expect(mkdirCalls.length).toBeGreaterThan(0);

    // writeFileSyncが呼ばれたことを確認（タスクログファイル作成）
    const writeFileCalls = vi.mocked(fs.writeFileSync).mock.calls;
    expect(writeFileCalls.length).toBeGreaterThan(0);

    // タスクログファイルが作成されることを確認
    const writtenPaths = writeFileCalls.map(call => call[0] as string);
    expect(writtenPaths.some(p => p.includes('log.md'))).toBe(true);
  });

  it('workflowDirとdocsDirの両方が作成される', async () => {
    const { WorkflowStateManager } = await importManager();
    const manager = new WorkflowStateManager('/test/workflows');

    manager.createTask('テストタスク');

    // mkdirSyncの呼び出しを確認
    const mkdirCalls = vi.mocked(fs.mkdirSync).mock.calls;
    const createdDirs = mkdirCalls.map(call => call[0] as string);

    // 少なくとも2つのディレクトリが作成される（workflowDirとdocsDir）
    expect(createdDirs.length).toBeGreaterThanOrEqual(2);
    // docsDirにタスク名が含まれる
    expect(createdDirs.some(d => d.includes('テストタスク'))).toBe(true);
  });
});

describe('WorkflowStateManager - initializeSubPhases テスト', () => {
  it('parallel_analysisでthreat_modelingとplanningが初期化される', async () => {
    const { WorkflowStateManager } = await importManager();
    const manager = new WorkflowStateManager('/test/workflows');

    const subPhases = manager.initializeSubPhases('parallel_analysis');

    expect(subPhases).toHaveProperty('threat_modeling', 'pending');
    expect(subPhases).toHaveProperty('planning', 'pending');
  });

  it('parallel_designで3つのサブフェーズが初期化される', async () => {
    const { WorkflowStateManager } = await importManager();
    const manager = new WorkflowStateManager('/test/workflows');

    const subPhases = manager.initializeSubPhases('parallel_design');

    expect(subPhases).toHaveProperty('state_machine', 'pending');
    expect(subPhases).toHaveProperty('flowchart', 'pending');
    expect(subPhases).toHaveProperty('ui_design', 'pending');
  });

  it('非並列フェーズでは空オブジェクトが返る', async () => {
    const { WorkflowStateManager } = await importManager();
    const manager = new WorkflowStateManager('/test/workflows');

    const subPhases = manager.initializeSubPhases('research');

    expect(Object.keys(subPhases)).toHaveLength(0);
  });
});

describe('WorkflowStateManager - discoverTasks テスト', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('workflowsディレクトリが存在しない場合は空配列を返す', async () => {
    const { WorkflowStateManager } = await importManager();
    const manager = new WorkflowStateManager('/test/workflows');

    vi.mocked(fs.existsSync).mockReturnValue(false);

    const tasks = manager.discoverTasks();

    expect(tasks).toEqual([]);
  });

  it('workflowsディレクトリが空の場合は空配列を返す', async () => {
    const { WorkflowStateManager } = await importManager();
    const manager = new WorkflowStateManager('/test/workflows');

    vi.mocked(fs.existsSync).mockReturnValue(true);
    // readdirSyncをモック
    const readdirSyncMock = vi.fn().mockReturnValue([]);
    vi.spyOn(fs, 'readdirSync').mockImplementation(readdirSyncMock as any);

    const tasks = manager.discoverTasks();

    expect(tasks).toEqual([]);
  });

  it('completedタスクは除外される', async () => {
    const { WorkflowStateManager } = await importManager();
    const manager = new WorkflowStateManager('/test/workflows');

    vi.mocked(fs.existsSync).mockReturnValue(true);

    const mockTaskState = {
      taskId: '20260125_100000',
      taskName: 'テストタスク',
      phase: 'completed',
      workflowDir: '/test/workflows/20260125_100000_テストタスク',
      docsDir: 'docs/workflows/テストタスク',
      startedAt: '2026-01-25T10:00:00.000Z',
      checklist: {},
      history: [],
      subPhases: {},
    };

    // readdirSyncをモック
    vi.spyOn(fs, 'readdirSync').mockReturnValue(['20260125_100000_テストタスク'] as any);
    // statSyncをモック
    vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as any);
    // readFileSyncをモック
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockTaskState));

    const tasks = manager.discoverTasks();

    expect(tasks).toEqual([]);
  });

  it('アクティブなタスクが正しく返される', async () => {
    const { WorkflowStateManager } = await importManager();
    const manager = new WorkflowStateManager('/test/workflows');

    vi.mocked(fs.existsSync).mockReturnValue(true);

    const mockTaskState = {
      taskId: '20260125_100000',
      taskName: 'テストタスク',
      phase: 'research',
      workflowDir: '/test/workflows/20260125_100000_テストタスク',
      docsDir: 'docs/workflows/テストタスク',
      startedAt: '2026-01-25T10:00:00.000Z',
      checklist: {},
      history: [],
      subPhases: {},
    };

    vi.spyOn(fs, 'readdirSync').mockReturnValue(['20260125_100000_テストタスク'] as any);
    vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as any);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockTaskState));

    const tasks = manager.discoverTasks();

    expect(tasks).toHaveLength(1);
    expect(tasks[0].taskId).toBe('20260125_100000');
    expect(tasks[0].phase).toBe('research');
  });

  it('複数のアクティブタスクが正しく返される', async () => {
    const { WorkflowStateManager } = await importManager();
    const manager = new WorkflowStateManager('/test/workflows');

    vi.mocked(fs.existsSync).mockReturnValue(true);

    const mockTaskA = {
      taskId: '20260125_100000',
      taskName: 'タスクA',
      phase: 'research',
      workflowDir: '/test/workflows/20260125_100000_タスクA',
      docsDir: 'docs/workflows/タスクA',
      startedAt: '2026-01-25T10:00:00.000Z',
      checklist: {},
      history: [],
      subPhases: {},
    };

    const mockTaskB = {
      taskId: '20260125_110000',
      taskName: 'タスクB',
      phase: 'implementation',
      workflowDir: '/test/workflows/20260125_110000_タスクB',
      docsDir: 'docs/workflows/タスクB',
      startedAt: '2026-01-25T11:00:00.000Z',
      checklist: {},
      history: [],
      subPhases: {},
    };

    vi.spyOn(fs, 'readdirSync').mockReturnValue([
      '20260125_100000_タスクA',
      '20260125_110000_タスクB',
    ] as any);
    vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as any);
    vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
      if (String(filePath).includes('タスクA')) {
        return JSON.stringify(mockTaskA);
      }
      return JSON.stringify(mockTaskB);
    });

    const tasks = manager.discoverTasks();

    expect(tasks).toHaveLength(2);
  });
});

describe('WorkflowStateManager - getTaskById テスト', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('存在するtaskIdでタスクが返される', async () => {
    const { WorkflowStateManager } = await importManager();
    const manager = new WorkflowStateManager('/test/workflows');

    vi.mocked(fs.existsSync).mockReturnValue(true);

    const mockTaskState = {
      taskId: '20260125_100000',
      taskName: 'テストタスク',
      phase: 'research',
      workflowDir: '/test/workflows/20260125_100000_テストタスク',
      docsDir: 'docs/workflows/テストタスク',
      startedAt: '2026-01-25T10:00:00.000Z',
      checklist: {},
      history: [],
      subPhases: {},
    };

    vi.spyOn(fs, 'readdirSync').mockReturnValue(['20260125_100000_テストタスク'] as any);
    vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as any);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockTaskState));

    const task = manager.getTaskById('20260125_100000');

    expect(task).not.toBeNull();
    expect(task?.taskId).toBe('20260125_100000');
  });

  it('存在しないtaskIdでnullが返される', async () => {
    const { WorkflowStateManager } = await importManager();
    const manager = new WorkflowStateManager('/test/workflows');

    vi.mocked(fs.existsSync).mockReturnValue(true);

    const mockTaskState = {
      taskId: '20260125_100000',
      taskName: 'テストタスク',
      phase: 'research',
      workflowDir: '/test/workflows/20260125_100000_テストタスク',
      docsDir: 'docs/workflows/テストタスク',
      startedAt: '2026-01-25T10:00:00.000Z',
      checklist: {},
      history: [],
      subPhases: {},
    };

    vi.spyOn(fs, 'readdirSync').mockReturnValue(['20260125_100000_テストタスク'] as any);
    vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as any);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockTaskState));

    const task = manager.getTaskById('nonexistent_id');

    expect(task).toBeNull();
  });

  it('completedタスクのtaskIdでnullが返される', async () => {
    const { WorkflowStateManager } = await importManager();
    const manager = new WorkflowStateManager('/test/workflows');

    vi.mocked(fs.existsSync).mockReturnValue(true);

    const mockTaskState = {
      taskId: '20260125_100000',
      taskName: 'テストタスク',
      phase: 'completed',
      workflowDir: '/test/workflows/20260125_100000_テストタスク',
      docsDir: 'docs/workflows/テストタスク',
      startedAt: '2026-01-25T10:00:00.000Z',
      checklist: {},
      history: [],
      subPhases: {},
    };

    vi.spyOn(fs, 'readdirSync').mockReturnValue(['20260125_100000_テストタスク'] as any);
    vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as any);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockTaskState));

    const task = manager.getTaskById('20260125_100000');

    expect(task).toBeNull();
  });
});
