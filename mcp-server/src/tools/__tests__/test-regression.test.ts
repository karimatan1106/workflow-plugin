import { describe, test, expect, vi, beforeEach } from 'vitest';
import { workflowNext } from '../next.js';
import { stateManager } from '../../state/manager.js';
import type { TaskState } from '../../state/types.js';

// stateManagerをモック
vi.mock('../../state/manager.js', () => ({
  stateManager: {
    getTaskById: vi.fn(),
    updateTaskPhase: vi.fn(),
    getIncompleteSubPhases: vi.fn().mockReturnValue([]),
    writeTaskState: vi.fn(),
  },
}));

// REQ-4のテスト回帰チェック機能
// workflowNextツールでregression_testフェーズからの遷移を検証

describe('REQ-4: テスト回帰チェック', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('TC-4-1: regression_testフェーズでtestBaseline未設定→next → success: false', () => {
    test('baselineがない状態での遷移を拒否する', () => {
      const taskState: TaskState = {
        taskId: 'test-task-1',
        taskName: 'test-regression',
        phase: 'regression_test',
        startedAt: '2026-02-08T00:00:00Z',
        workflowDir: '/test/workflows/test-regression',
        docsDir: '/test/docs/workflows/test-regression',
        checklist: {},
        history: [],
        subPhases: {},
        // testBaselineが未設定
        testBaseline: undefined,
        testResults: [
          {
            phase: 'regression_test',
            timestamp: '2026-02-08T00:10:00Z',
            exitCode: 0,
            passedCount: 100,
            failedCount: 0,
          },
        ],
      };

      vi.mocked(stateManager.getTaskById).mockReturnValue(taskState);

      const result = workflowNext('test-task-1');

      expect(result.success).toBe(false);
      expect(result.message).toBeDefined();
      expect(result.message).toContain('ベースライン');
    });
  });

  describe('TC-4-2: テスト総数がbaseline以下 → success: false', () => {
    test('テスト数減少を検出する', async () => {
      const taskState: TaskState = {
        taskId: 'test-task-2',
        taskName: 'test-regression',
        phase: 'regression_test',
        startedAt: '2026-02-08T00:00:00Z',
        workflowDir: '/test/workflows/test-regression',
        docsDir: '/test/docs/workflows/test-regression',
        checklist: {},
        history: [],
        subPhases: {},
        testBaseline: {
          capturedAt: '2026-02-08T00:00:00Z',
          totalTests: 100,
          passedTests: 100,
          failedTests: [],
        },
        testResults: [
          {
            phase: 'regression_test',
            timestamp: '2026-02-08T00:10:00Z',
            exitCode: 0,
            passedCount: 90,
            failedCount: 0,
          },
        ],
      };

      vi.mocked(stateManager.getTaskById).mockReturnValue(taskState);

      const result = workflowNext('test-task-2');

      expect(result.success).toBe(false);
      expect(result.message).toBeDefined();
      expect(result.message).toContain('テスト総数が減少');
    });
  });

  describe('TC-4-3: パス数がbaseline以下 → success: false', () => {
    test('パス数減少を検出する', async () => {
      const taskState: TaskState = {
        taskId: 'test-task-3',
        taskName: 'test-regression',
        phase: 'regression_test',
        startedAt: '2026-02-08T00:00:00Z',
        workflowDir: '/test/workflows/test-regression',
        docsDir: '/test/docs/workflows/test-regression',
        checklist: {},
        history: [],
        subPhases: {},
        testBaseline: {
          capturedAt: '2026-02-08T00:00:00Z',
          totalTests: 100,
          passedTests: 100,
          failedTests: [],
        },
        testResults: [
          {
            phase: 'regression_test',
            timestamp: '2026-02-08T00:10:00Z',
            exitCode: 0,
            passedCount: 90,
            failedCount: 10,
          },
        ],
      };

      vi.mocked(stateManager.getTaskById).mockReturnValue(taskState);

      const result = workflowNext('test-task-3');

      expect(result.success).toBe(false);
      expect(result.message).toBeDefined();
      const messageString = String(result.message || '');
      expect(messageString.includes('パス') || messageString.includes('減少')).toBe(true);
    });
  });

  describe('TC-4-4: テスト数増加・パス数維持 → success: true（遷移成功）', () => {
    test('テスト追加でパスが維持されている場合は遷移を許可', async () => {
      const taskState: TaskState = {
        taskId: 'test-task-4',
        taskName: 'test-regression',
        phase: 'regression_test',
        startedAt: '2026-02-08T00:00:00Z',
        workflowDir: '/test/workflows/test-regression',
        docsDir: '/test/docs/workflows/test-regression',
        checklist: {},
        history: [],
        subPhases: {},
        testBaseline: {
          capturedAt: '2026-02-08T00:00:00Z',
          totalTests: 100,
          passedTests: 100,
          failedTests: [],
        },
        testResults: [
          {
            phase: 'regression_test',
            timestamp: '2026-02-08T00:10:00Z',
            exitCode: 0,
            passedCount: 105,
            failedCount: 0,
          },
        ],
      };

      vi.mocked(stateManager.getTaskById).mockReturnValue(taskState);

      const result = workflowNext('test-task-4');

      expect(result.success).toBe(true);
      expect(vi.mocked(stateManager.updateTaskPhase)).toHaveBeenCalled();
    });

    test('テスト数維持・パス数維持の場合も遷移を許可', async () => {
      const taskState: TaskState = {
        taskId: 'test-task-4b',
        taskName: 'test-regression',
        phase: 'regression_test',
        startedAt: '2026-02-08T00:00:00Z',
        workflowDir: '/test/workflows/test-regression',
        docsDir: '/test/docs/workflows/test-regression',
        checklist: {},
        history: [],
        subPhases: {},
        testBaseline: {
          capturedAt: '2026-02-08T00:00:00Z',
          totalTests: 100,
          passedTests: 100,
          failedTests: [],
        },
        testResults: [
          {
            phase: 'regression_test',
            timestamp: '2026-02-08T00:10:00Z',
            exitCode: 0,
            passedCount: 100,
            failedCount: 0,
          },
        ],
      };

      vi.mocked(stateManager.getTaskById).mockReturnValue(taskState);

      const result = workflowNext('test-task-4b');

      expect(result.success).toBe(true);
      expect(vi.mocked(stateManager.updateTaskPhase)).toHaveBeenCalled();
    });
  });

  describe('TC-4-5: testing→regression_test遷移時にtestBaselineが自動設定される', () => {
    test('testingフェーズ完了時にbaselineをキャプチャ', async () => {
      const taskState: TaskState = {
        taskId: 'test-task-5',
        taskName: 'test-baseline',
        phase: 'testing',
        startedAt: '2026-02-08T00:00:00Z',
        workflowDir: '/test/workflows/test-baseline',
        docsDir: '/test/docs/workflows/test-baseline',
        checklist: {},
        history: [],
        subPhases: {},
        testBaseline: undefined, // まだ未設定
        testResults: [
          {
            phase: 'testing',
            timestamp: '2026-02-08T00:00:00Z',
            exitCode: 0,
            passedCount: 100,
            failedCount: 0,
          },
        ],
      };

      vi.mocked(stateManager.getTaskById).mockReturnValue(taskState);

      const result = workflowNext('test-task-5');

      expect(result.success).toBe(true);

      // writeTaskStateが呼ばれ、testBaselineが設定されたことを確認
      const writeCall = vi.mocked(stateManager.writeTaskState).mock.calls[0];
      expect(writeCall).toBeDefined();

      const updatedState = writeCall[1] as TaskState; // 第2引数が更新後のstate
      expect(updatedState.testBaseline).toBeDefined();
      expect(updatedState.testBaseline!.totalTests).toBe(100);
      expect(updatedState.testBaseline!.passedTests).toBe(100);
      expect(updatedState.testBaseline!.capturedAt).toBeDefined();
    });

    test('testResultがない場合はエラー', async () => {
      const taskState: TaskState = {
        taskId: 'test-task-5b',
        taskName: 'test-baseline-error',
        phase: 'testing',
        startedAt: '2026-02-08T00:00:00Z',
        workflowDir: '/test/workflows/test-baseline-error',
        docsDir: '/test/docs/workflows/test-baseline-error',
        checklist: {},
        history: [],
        subPhases: {},
        testBaseline: undefined,
        testResults: [], // テスト結果なし
      };

      vi.mocked(stateManager.getTaskById).mockReturnValue(taskState);

      const result = workflowNext('test-task-5b');

      expect(result.success).toBe(false);
      expect(result.message).toBeDefined();
      const messageString = String(result.message || '');
      expect(messageString.includes('テスト結果')).toBe(true);
    });
  });
});
