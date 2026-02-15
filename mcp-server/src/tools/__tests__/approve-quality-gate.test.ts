/**
 * REQ-H: 承認ゲート品質チェックテスト
 *
 * workflow_approve ツールで design 承認時に artifact-validator が
 * 自動実行され、品質基準未達の場合に承認が拒否されることを検証する。
 * 実装はまだ存在しないため、テストファーストで作成（TDD Red Phase）。
 *
 * @spec docs/workflows/ワ-クフロ-プラグイン構造的問題9件の根本原因修正/test-design.md
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { APPROVE_TYPE_MAPPING } from '../../phases/definitions.js';

// stateManager をモック
vi.mock('../../state/manager.js', () => ({
  stateManager: {
    getTaskById: vi.fn(),
    discoverTasks: vi.fn(),
    updateTaskPhase: vi.fn(),
    getIncompleteSubPhases: vi.fn().mockReturnValue([]),
    writeTaskState: vi.fn(),
  },
}));

// fs モジュールをモック
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => '# Mock Content\n'.repeat(50)),
    statSync: vi.fn(() => ({ size: 2000 } as any)),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

import { stateManager } from '../../state/manager.js';
import * as fs from 'fs';
import { workflowApprove } from '../approve.js';

describe('REQ-H: 承認ゲート品質チェック', () => {
  const mockSessionToken = 'test-session-token-12345';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * ヘルパー: design_review フェーズのタスク状態を作成
   */
  function createDesignReviewTask(overrides: Record<string, any> = {}) {
    return {
      taskId: 'test-task-approve',
      taskName: 'テスト承認タスク',
      phase: 'design_review',
      workflowDir: '/tmp/test-workflow',
      docsDir: '/tmp/test-docs',
      taskSize: 'large',
      sessionToken: mockSessionToken,
      approvals: {},
      ...overrides,
    };
  }

  describe('TC-H1: design 承認時の成果物未作成エラー', () => {
    test('spec.md が存在しない場合に承認が拒否される', () => {
      const mockTask = createDesignReviewTask();
      vi.mocked(stateManager.getTaskById).mockReturnValue(mockTask as any);

      // spec.md が存在しない
      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => {
        const p = String(filePath);
        if (p.includes('spec.md')) return false;
        return true;
      });

      const result = workflowApprove('test-task-approve', 'design', mockSessionToken);

      // REQ-H: 成果物チェックにより承認が拒否されること
      expect(result.success).toBe(false);
      // エラーメッセージに spec.md が含まれる
      const message = (result as any).message || '';
      const details = (result as any).details || [];
      const hasSpecError = message.includes('spec.md') ||
        details.some((d: string) => d.includes('spec.md'));
      expect(hasSpecError).toBe(true);
    });
  });

  describe('TC-H2: design 承認時の品質基準達成', () => {
    test('全成果物が品質基準を満たしている場合に承認が許可される', () => {
      const mockTask = createDesignReviewTask();
      vi.mocked(stateManager.getTaskById).mockReturnValue(mockTask as any);

      // 全成果物が存在
      vi.mocked(fs.existsSync).mockReturnValue(true);
      // 十分な行数のコンテンツ
      vi.mocked(fs.readFileSync).mockReturnValue(
        '# Spec Document\n\n## サマリー\n\nテスト仕様書\n\n## 機能一覧\n\n- 機能A\n- 機能B\n'.repeat(10)
      );
      vi.mocked(fs.statSync).mockReturnValue({ size: 5000 } as any);

      const result = workflowApprove('test-task-approve', 'design', mockSessionToken);

      expect(result.success).toBe(true);
    });
  });

  describe('TC-H3: 警告レベル問題での承認許可', () => {
    test('成果物に警告レベルの問題がある場合でも承認が許可される', () => {
      const mockTask = createDesignReviewTask();
      vi.mocked(stateManager.getTaskById).mockReturnValue(mockTask as any);

      // 成果物は存在するが内容が不十分
      vi.mocked(fs.existsSync).mockReturnValue(true);
      // 短い内容（30行程度 = 警告レベル）
      vi.mocked(fs.readFileSync).mockReturnValue(
        '# Spec\n\n## サマリー\n\n短い仕様書\n'.repeat(6)
      );
      vi.mocked(fs.statSync).mockReturnValue({ size: 500 } as any);

      const result = workflowApprove('test-task-approve', 'design', mockSessionToken);

      // 承認は許可される
      expect(result.success).toBe(true);
      // warnings フィールドが含まれる可能性がある
      const warnings = (result as any).warnings;
      if (warnings) {
        expect(Array.isArray(warnings)).toBe(true);
      }
    });
  });

  describe('TC-H4: design 以外の承認タイプでのチェックスキップ', () => {
    test('requirements 承認時には成果物チェックがスキップされる', () => {
      const mockTask = createDesignReviewTask({
        phase: 'requirements',
      });
      vi.mocked(stateManager.getTaskById).mockReturnValue(mockTask as any);

      // 成果物は存在しない状態
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = workflowApprove('test-task-approve', 'requirements', mockSessionToken);

      // requirements 承認は成果物チェックなしで成功する
      expect(result.success).toBe(true);
    });

    test('code_review 承認時にも成果物チェックはスキップされる', () => {
      const mockTask = createDesignReviewTask({
        phase: 'parallel_quality',
      });
      vi.mocked(stateManager.getTaskById).mockReturnValue(mockTask as any);

      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = workflowApprove('test-task-approve', 'code_review', mockSessionToken);

      // code_review 承認も成果物チェック不要
      expect(result.success).toBe(true);
    });
  });
});
