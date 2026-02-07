/**
 * REQ-2: HMAC署名テスト
 * @spec docs/workflows/ワ-クフロ-プラグイン大規模対応根本改修/spec.md
 *
 * テスト対象:
 * - writeTaskState: HMAC署名の生成と追加
 * - readTaskState: HMAC署名の検証
 * - 改ざん検出
 * - 後方互換性（署名なし状態ファイルの自動移行）
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as crypto from 'crypto';
import type { TaskState } from '../types.js';

// Mock os module for consistent hostname/username
vi.mock('os', () => ({
  hostname: vi.fn(() => 'test-hostname'),
  userInfo: vi.fn(() => ({ username: 'test-user' })),
}));

// writtenData is shared between mock and tests
let writtenData: Map<string, string>;

// Mock fs module
vi.mock('fs', () => {
  const writtenDataRef = (): Map<string, string> => {
    // Access via the closure in each call
    return (globalThis as any).__hmac_test_writtenData || new Map();
  };
  return {
    existsSync: vi.fn((filepath: string) => {
      return writtenDataRef().has(filepath.toString());
    }),
    mkdirSync: vi.fn(() => undefined),
    writeFileSync: vi.fn((filepath: string, data: string) => {
      writtenDataRef().set(filepath.toString(), data.toString());
    }),
    readFileSync: vi.fn((filepath: string) => {
      const data = writtenDataRef().get(filepath.toString());
      if (!data) throw new Error('File not found');
      return Buffer.from(data);
    }),
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(() => ({ isDirectory: () => false })),
  };
});

describe('REQ-2: HMAC署名機能', () => {
  beforeEach(() => {
    writtenData = new Map();
    (globalThis as any).__hmac_test_writtenData = writtenData;
    vi.clearAllMocks();
  });

  afterEach(() => {
    writtenData.clear();
    delete (globalThis as any).__hmac_test_writtenData;
  });

  /**
   * テストヘルパー: サンプル状態オブジェクトを生成
   */
  function createSampleState(overrides?: Partial<TaskState>): TaskState {
    return {
      taskId: 'task-001',
      taskName: 'テストタスク',
      phase: 'research',
      workflowDir: '/test/workflow',
      startedAt: '2026-02-07T00:00:00.000Z',
      checklist: {},
      history: [],
      subPhases: {},
      ...overrides,
    };
  }

  /**
   * テストヘルパー: HMAC署名を計算（期待値検証用）
   * 実際のmanager.tsの実装と同じロジック
   */
  function calculateExpectedSignature(stateObj: Record<string, unknown>): string {
    const hostname = 'test-hostname';
    const username = 'test-user';

    // PBKDF2でキー生成（manager.tsと同じパラメータ）
    const key = crypto.pbkdf2Sync(
      hostname + username,
      'workflow-mcp-v1',
      100000,
      32,
      'sha256'
    );

    // stateIntegrity フィールドを除外
    const { stateIntegrity, ...stateWithoutSignature } = stateObj;
    const data = JSON.stringify(stateWithoutSignature, Object.keys(stateWithoutSignature).sort());

    // HMAC-SHA256で署名（base64）
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(data, 'utf8');
    return hmac.digest('base64');
  }

  describe('TC-2-1: writeTaskState adds stateIntegrity field', () => {
    test('書き込み時に stateIntegrity フィールドが追加される', async () => {
      const { stateManager } = await import('../manager.js');
      const taskWorkflowDir = '/test/workflow';
      const state = createSampleState();

      stateManager.writeTaskState(taskWorkflowDir, state);

      const writtenContent = writtenData.get('/test/workflow/workflow-state.json');
      expect(writtenContent).toBeDefined();

      const parsedState = JSON.parse(writtenContent!);
      expect(parsedState).toHaveProperty('stateIntegrity');
      expect(typeof parsedState.stateIntegrity).toBe('string');
      expect(parsedState.stateIntegrity.length).toBeGreaterThan(0);
    });
  });

  describe('TC-2-2: Same state generates same signature (deterministic)', () => {
    test('同じ状態は同じ署名を生成する（決定論的）', async () => {
      const { stateManager } = await import('../manager.js');
      const taskWorkflowDir = '/test/workflow';
      const state = createSampleState({ taskId: 'task-deterministic' });

      stateManager.writeTaskState(taskWorkflowDir, state);
      const signature1 = JSON.parse(writtenData.get('/test/workflow/workflow-state.json')!).stateIntegrity;

      stateManager.writeTaskState(taskWorkflowDir, state);
      const signature2 = JSON.parse(writtenData.get('/test/workflow/workflow-state.json')!).stateIntegrity;

      expect(signature1).toBe(signature2);
    });
  });

  describe('TC-2-3: Different state generates different signature', () => {
    test('異なる状態は異なる署名を生成する', async () => {
      const { stateManager } = await import('../manager.js');
      const taskWorkflowDir = '/test/workflow';
      const state1 = createSampleState({ taskId: 'task-001' });
      const state2 = createSampleState({ taskId: 'task-002' });

      stateManager.writeTaskState(taskWorkflowDir, state1);
      const signature1 = JSON.parse(writtenData.get('/test/workflow/workflow-state.json')!).stateIntegrity;

      stateManager.writeTaskState(taskWorkflowDir, state2);
      const signature2 = JSON.parse(writtenData.get('/test/workflow/workflow-state.json')!).stateIntegrity;

      expect(signature1).not.toBe(signature2);
    });
  });

  describe('TC-2-4: readTaskState verifies valid signature successfully', () => {
    test('正しい署名を持つ状態ファイルを正常に読み込める', async () => {
      const { stateManager } = await import('../manager.js');
      const taskWorkflowDir = '/test/workflow';
      const originalState = createSampleState({ taskId: 'task-valid' });

      stateManager.writeTaskState(taskWorkflowDir, originalState);

      const readState = stateManager.readTaskState(taskWorkflowDir);

      expect(readState).not.toBeNull();
      expect(readState?.taskId).toBe('task-valid');
      expect(readState?.taskName).toBe('テストタスク');
      expect(readState?.phase).toBe('research');
    });
  });

  describe('TC-2-5: readTaskState returns null for tampered state', () => {
    test('改ざんされた状態ファイルは null を返す', async () => {
      const { stateManager } = await import('../manager.js');
      const taskWorkflowDir = '/test/workflow';
      const originalState = createSampleState({ taskId: 'task-tampered' });

      stateManager.writeTaskState(taskWorkflowDir, originalState);

      // 改ざん: taskNameを変更
      const writtenContent = writtenData.get('/test/workflow/workflow-state.json')!;
      const parsedState = JSON.parse(writtenContent);
      parsedState.taskName = '改ざんされたタスク';
      writtenData.set('/test/workflow/workflow-state.json', JSON.stringify(parsedState, null, 2));

      const readState = stateManager.readTaskState(taskWorkflowDir);

      expect(readState).toBeNull();
    });

    test('不正な署名を持つ状態ファイルは null を返す', async () => {
      const { stateManager } = await import('../manager.js');
      const taskWorkflowDir = '/test/workflow';
      const originalState = createSampleState({ taskId: 'task-invalid-sig' });

      stateManager.writeTaskState(taskWorkflowDir, originalState);

      // 改ざん: 署名を無効な値に変更
      const writtenContent = writtenData.get('/test/workflow/workflow-state.json')!;
      const parsedState = JSON.parse(writtenContent);
      parsedState.stateIntegrity = 'aW52YWxpZF9zaWduYXR1cmU=';
      writtenData.set('/test/workflow/workflow-state.json', JSON.stringify(parsedState, null, 2));

      const readState = stateManager.readTaskState(taskWorkflowDir);

      expect(readState).toBeNull();
    });
  });

  describe('TC-2-6: readTaskState auto-migrates unsigned state files', () => {
    test('署名なし状態ファイルを自動移行する（後方互換性）', async () => {
      const { stateManager } = await import('../manager.js');
      const taskWorkflowDir = '/test/workflow';
      const unsignedState = createSampleState({ taskId: 'task-unsigned' });

      // 署名なし状態ファイルを直接書き込み
      writtenData.set('/test/workflow/workflow-state.json', JSON.stringify(unsignedState, null, 2));

      const readState = stateManager.readTaskState(taskWorkflowDir);

      expect(readState).not.toBeNull();
      expect(readState?.taskId).toBe('task-unsigned');

      // 自動移行により署名が追加される
      const updatedContent = writtenData.get('/test/workflow/workflow-state.json')!;
      const updatedState = JSON.parse(updatedContent);
      expect(updatedState).toHaveProperty('stateIntegrity');
    });
  });

  describe('TC-2-7: Signature uses PBKDF2 key generation', () => {
    test('PBKDF2でキーを生成している', async () => {
      const { stateManager } = await import('../manager.js');
      const taskWorkflowDir = '/test/workflow';
      const state = createSampleState({ taskId: 'task-pbkdf2' });

      stateManager.writeTaskState(taskWorkflowDir, state);

      const writtenContent = writtenData.get('/test/workflow/workflow-state.json')!;
      const parsedState = JSON.parse(writtenContent);
      const actualSignature = parsedState.stateIntegrity;

      const expectedSignature = calculateExpectedSignature(parsedState);

      expect(actualSignature).toBe(expectedSignature);
    });
  });

  describe('署名検証の詳細テスト', () => {
    test('phaseの改ざんを検出できる', async () => {
      const { stateManager } = await import('../manager.js');
      const taskWorkflowDir = '/test/workflow';
      const originalState = createSampleState({ phase: 'research' });

      stateManager.writeTaskState(taskWorkflowDir, originalState);

      const writtenContent = writtenData.get('/test/workflow/workflow-state.json')!;
      const parsedState = JSON.parse(writtenContent);
      parsedState.phase = 'implementation';
      writtenData.set('/test/workflow/workflow-state.json', JSON.stringify(parsedState, null, 2));

      const readState = stateManager.readTaskState(taskWorkflowDir);

      expect(readState).toBeNull();
    });

    test('historyの改ざんを検出できる', async () => {
      const { stateManager } = await import('../manager.js');
      const taskWorkflowDir = '/test/workflow';
      const originalState = createSampleState({
        history: [
          { phase: 'research', action: 'start', timestamp: '2026-02-07T00:00:00Z' },
        ],
      });

      stateManager.writeTaskState(taskWorkflowDir, originalState);

      const writtenContent = writtenData.get('/test/workflow/workflow-state.json')!;
      const parsedState = JSON.parse(writtenContent);
      parsedState.history.push({ phase: 'implementation', action: 'skip', timestamp: '2026-02-07T01:00:00Z' });
      writtenData.set('/test/workflow/workflow-state.json', JSON.stringify(parsedState, null, 2));

      const readState = stateManager.readTaskState(taskWorkflowDir);

      expect(readState).toBeNull();
    });
  });

  describe('エッジケース', () => {
    test('空のhistoryでも署名生成できる', async () => {
      const { stateManager } = await import('../manager.js');
      const taskWorkflowDir = '/test/workflow';
      const state = createSampleState({ history: [] });

      stateManager.writeTaskState(taskWorkflowDir, state);
      const readState = stateManager.readTaskState(taskWorkflowDir);

      expect(readState).not.toBeNull();
      expect(readState?.history).toEqual([]);
    });

    test('特殊文字を含むtaskNameでも署名生成できる', async () => {
      const { stateManager } = await import('../manager.js');
      const taskWorkflowDir = '/test/workflow';
      const state = createSampleState({
        taskName: 'タスク名: 特殊文字 "quotes" & <tags>'
      });

      stateManager.writeTaskState(taskWorkflowDir, state);
      const readState = stateManager.readTaskState(taskWorkflowDir);

      expect(readState).not.toBeNull();
      expect(readState?.taskName).toBe('タスク名: 特殊文字 "quotes" & <tags>');
    });
  });
});
