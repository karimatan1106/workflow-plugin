/**
 * workflow_back ツールのテスト
 *
 * REQ-5: 部分差し戻し機能
 * - 差し戻し成功（implementation→requirements）
 * - 現在フェーズへの差し戻しはエラー
 * - 未来フェーズへの差し戻しはエラー
 * - 不正なフェーズ名でエラー
 * - 理由なしで差し戻し（デフォルトメッセージ）
 * - 複数回の差し戻し履歴記録
 *
 * @spec docs/workflows/ワ-クフロ-大規模対応改善/test-design.md
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { workflowBack } from '../back.js';
import { stateManager } from '../../state/manager.js';
import type { TaskState } from '../../state/types.js';

// stateManagerをモック化
vi.mock('../../state/manager.js', () => ({
  stateManager: {
    getTaskById: vi.fn(),
    writeTaskState: vi.fn(),
  },
}));

describe('workflowBack', () => {
  const mockTaskId = 'test_20260207_120000';
  let mockTaskState: TaskState;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTaskState = {
      taskId: mockTaskId,
      taskName: 'Test Task',
      phase: 'implementation',
      workflowDir: '/test/workflow',
      startedAt: '2026-02-07T12:00:00Z',
      checklist: {},
      history: [],
      subPhases: {},
      taskSize: 'large',
    };

    vi.mocked(stateManager.getTaskById).mockReturnValue(mockTaskState);
  });

  // TC-5.1: 差し戻し成功（implementation→requirements）
  test('should successfully reset to earlier phase', () => {
    const result = workflowBack(mockTaskId, 'requirements', '要件を見直すため');

    expect(result.success).toBe(true);
    expect(result.fromPhase).toBe('implementation');
    expect(result.toPhase).toBe('requirements');
    expect(result.reason).toBe('要件を見直すため');

    // writeTaskStateの呼び出しを確認
    const savedState = vi.mocked(stateManager.writeTaskState).mock.calls[0][1] as TaskState;
    expect(savedState.phase).toBe('requirements');
    expect(savedState.resetHistory).toHaveLength(1);
    expect(savedState.resetHistory![0].fromPhase).toBe('implementation');
    expect(savedState.resetHistory![0].reason).toBe('要件を見直すため');
  });

  // TC-5.2: 現在フェーズへの差し戻しはエラー
  test('should fail when target phase is current phase', () => {
    const result = workflowBack(mockTaskId, 'implementation');

    expect(result.success).toBe(false);
    expect(result.message).toContain('前である必要があります');
  });

  // TC-5.3: 未来フェーズへの差し戻しはエラー
  test('should fail when target phase is after current phase', () => {
    const result = workflowBack(mockTaskId, 'testing');

    expect(result.success).toBe(false);
    expect(result.message).toContain('前である必要があります');
  });

  // TC-5.4: 不正なフェーズ名でエラー
  test('should fail with invalid phase name', () => {
    const result = workflowBack(mockTaskId, 'invalid_phase');

    expect(result.success).toBe(false);
    expect(result.message).toContain('不正なフェーズ名');
  });

  // TC-5.5: 理由なしで差し戻し（デフォルトメッセージ）
  test('should use default reason when not provided', () => {
    const result = workflowBack(mockTaskId, 'requirements');

    expect(result.success).toBe(true);
    expect(result.reason).toContain('requirementsフェーズへ差し戻し');
  });

  // TC-5.6: 複数回の差し戻し履歴記録
  test('should record multiple reset history entries', () => {
    mockTaskState.phase = 'testing';
    mockTaskState.resetHistory = [];
    vi.mocked(stateManager.getTaskById).mockReturnValue(mockTaskState);

    // 1回目の差し戻し
    workflowBack(mockTaskId, 'implementation', '1st reset');

    // 状態を更新してから2回目
    mockTaskState.phase = 'implementation';
    mockTaskState.resetHistory = [
      {
        fromPhase: 'testing',
        reason: '1st reset',
        timestamp: new Date().toISOString(),
      },
    ];
    vi.mocked(stateManager.getTaskById).mockReturnValue(mockTaskState);

    const result = workflowBack(mockTaskId, 'requirements', '2nd reset');

    expect(result.success).toBe(true);

    const savedState = vi.mocked(stateManager.writeTaskState).mock.calls[1][1] as TaskState;
    expect(savedState.resetHistory).toHaveLength(2);
    expect(savedState.resetHistory![0].reason).toBe('1st reset');
    expect(savedState.resetHistory![1].reason).toBe('2nd reset');
  });

  // taskIdなしでエラー
  test('should fail when taskId is missing', () => {
    const result = workflowBack(undefined, 'requirements');

    expect(result.success).toBe(false);
    expect(result.message).toContain('taskIdは必須です');
  });

  // targetPhaseなしでエラー
  test('should fail when targetPhase is missing', () => {
    const result = workflowBack(mockTaskId, undefined);

    expect(result.success).toBe(false);
    expect(result.message).toContain('targetPhaseを指定してください');
  });

  // タスクが見つからない
  test('should fail when task is not found', () => {
    vi.mocked(stateManager.getTaskById).mockReturnValue(null);

    const result = workflowBack('unknown_task', 'requirements');

    expect(result.success).toBe(false);
    expect(result.message).toContain('指定されたタスクが見つかりません');
  });

  // researchからの差し戻しは不可（researchより前のフェーズがない）
  test('should fail when trying to reset from research phase', () => {
    mockTaskState.phase = 'research';
    vi.mocked(stateManager.getTaskById).mockReturnValue(mockTaskState);

    const result = workflowBack(mockTaskId, 'idle');

    expect(result.success).toBe(false);
  });
});
