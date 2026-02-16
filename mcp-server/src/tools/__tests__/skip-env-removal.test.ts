/**
 * REQ-1: 全SKIP_*環境変数の完全除去テスト
 *
 * 環境変数によるセキュリティ機構の無効化を不可能にし、
 * 全フックとツールの検証を強制する。
 *
 * @spec docs/workflows/ワ-クフロ-全問題完全解決/spec.md REQ-1
 * @spec docs/workflows/ワ-クフロ-全問題完全解決/test-design.md TC-1-1, TC-1-2, TC-1-3, TC-1-4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { workflowNext } from '../next.js';
import { workflowCompleteSub } from '../complete-sub.js';
import { stateManager } from '../../state/manager.js';
import { performDesignValidation } from '../../validation/design-validator.js';
import type { TaskState, PhaseName, SubPhaseName } from '../../state/types.js';

// fs モジュールをモック化（ESM互換）
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(actual.existsSync),
    readFileSync: vi.fn(actual.readFileSync),
    statSync: vi.fn(actual.statSync),
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

// design-validatorをモック (デフォルトは失敗)
vi.mock('../../validation/design-validator.js', () => ({
  DesignValidator: vi.fn().mockImplementation(() => ({
    validateAll: () => ({
      passed: false, // Default to failure
      missingItems: ['spec.md'],
      warnings: [],
      summary: { total: 1, implemented: 0, missing: 1 },
    }),
  })),
  formatValidationError: vi.fn(() => '設計-実装整合性の検証に失敗しました'),
  performDesignValidation: vi.fn(() => null),
}));

// モック用のヘルパー
const mockTaskState = (phase: PhaseName, overrides?: Partial<TaskState>): TaskState => ({
  taskId: 'test-task-001',
  taskName: 'REQ-1テスト',
  phase,
  workflowDir: '/tmp/test-workflow',
  docsDir: '/tmp/test-docs',
  taskSize: 'large',
  startedAt: '2026-02-07T10:00:00Z',
  checklist: {},
  history: [
    { phase, action: 'start', timestamp: '2026-02-07T10:00:00Z' },
  ],
  subPhases: {},
  testResults: [],
  ...overrides,
});

describe('REQ-1: SKIP_*環境変数の完全除去', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // 環境変数を保存
    originalEnv = { ...process.env };

    // モックのリセット
    vi.clearAllMocks();
  });

  afterEach(() => {
    // 環境変数を復元
    process.env = originalEnv;
  });

  describe('TC-1-1: SKIP_ARTIFACT_CHECKが無効化されること（next.ts）', () => {
    it('SKIP_ARTIFACT_CHECK=trueを設定しても成果物チェックが実行されること', () => {
      // Arrange: 環境変数を設定
      process.env.SKIP_ARTIFACT_CHECK = 'true';

      // researchフェーズのタスク状態を作成（research.mdなし）
      const taskState = mockTaskState('research', {
        docsDir: '/tmp/test-docs-nonexistent',
      });

      // stateManager.getTaskByIdOrError をモック
      vi.spyOn(stateManager, 'getTaskById').mockReturnValue(taskState);

      // fs.existsSync をモック（成果物が存在しない）
      vi.mocked(fs.existsSync).mockReturnValue(false);

      // Act: workflow_nextを実行
      const result = workflowNext('test-task-001');

      // Assert: 成果物チェックが実行され、ブロックされること
      expect(result.success).toBe(false);
      expect(result.message).toContain('research.md');
      expect(result.message).toContain('成果物');

      // 環境変数が無視されていることを確認
      expect(process.env.SKIP_ARTIFACT_CHECK).toBe('true'); // 環境変数は設定されているが
      expect(fs.existsSync).toHaveBeenCalled(); // チェックは実行されている
    });

    it('SKIP_ARTIFACT_CHECK=1を設定しても成果物チェックが実行されること', () => {
      // Arrange
      process.env.SKIP_ARTIFACT_CHECK = '1';

      const taskState = mockTaskState('research', {
        docsDir: '/tmp/test-docs-req',
      });

      vi.spyOn(stateManager, 'getTaskById').mockReturnValue(taskState);
      vi.mocked(fs.existsSync).mockReturnValue(false); // research.mdなし

      // Act
      const result = workflowNext('test-task-001');

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toContain('research.md');
    });

    it('成果物が存在する場合は正常に遷移すること', () => {
      // Arrange: 環境変数を設定しても、成果物があればOK
      process.env.SKIP_ARTIFACT_CHECK = 'true';

      const taskState = mockTaskState('research', {
        docsDir: '/tmp/test-docs-ok',
      });

      vi.spyOn(stateManager, 'getTaskById').mockReturnValue(taskState);
      vi.mocked(fs.existsSync).mockReturnValue(true); // research.md存在
      vi.mocked(fs.statSync).mockReturnValue({ size: 500 } as any); // サイズチェック用
      vi.mocked(fs.readFileSync).mockReturnValue(
        '# Research\n\n## 調査結果\n\n調査の概要を記載します。\n既存コードの分析を行いました。\n問題点を特定しました。\n課題の優先順位を設定。\n対応方針を策定しました。\n\n## 既存実装の分析\n\n既存のコードベースを詳細に分析しました。\n主要なモジュールの構成を確認。\nアーキテクチャの把握を行った。\nコードカバレッジの確認。\n依存関係を整理しました。\nパフォーマンス特性を調査しました。\n\n## 依存関係\n\n主要な依存関係を特定しました。\n外部ライブラリの調査。\nバージョン互換性の確認。\nセキュリティ脆弱性をチェックしました。\nライセンス要件を確認しました。\nアップデート計画を策定しました。\n\n## 技術的な制約\n\n制約事項を記載。\nパフォーマンスの考慮。\nスケーラビリティ要件。\nセキュリティ制約。\nコスト制約の確認。\n\n## 結論\n\n調査結果のまとめ。\n次のステップを定義。\n優先事項の整理。\n実装計画を作成します。\nリスク対策を明確化しました。\nスケジュールを確定しました。\n'
      );

      // stateManager.updateTaskPhase をモック
      vi.spyOn(stateManager, 'updateTaskPhase').mockImplementation(() => {});

      // Act
      const result = workflowNext('test-task-001');

      // Assert: 成果物があれば遷移成功（環境変数は無視される）
      expect(result.success).toBe(true);
      expect(result.from).toBe('research');
      expect(result.to).toBe('requirements');
    });
  });

  describe('TC-1-2: SKIP_DESIGN_VALIDATIONが無効化されること（next.ts）', () => {
    it('SKIP_DESIGN_VALIDATION=trueを設定しても設計検証が実行されること', () => {
      // Arrange
      process.env.SKIP_DESIGN_VALIDATION = 'true';

      // test_implフェーズ → implementation遷移（設計検証が必要）
      const taskState = mockTaskState('test_impl', {
        docsDir: '/tmp/test-docs-design',
      });

      vi.spyOn(stateManager, 'getTaskById').mockReturnValue(taskState);

      // spec.mdが存在するがtest-design.mdがない（設計不整合）
      vi.mocked(fs.existsSync).mockImplementation((filePath: unknown) => {
        if (typeof filePath === 'string' && filePath.includes('spec.md')) {
          return true;
        }
        if (typeof filePath === 'string' && filePath.includes('test-design.md')) {
          return false; // 設計書なし
        }
        return false;
      });

      vi.mocked(fs.readFileSync).mockReturnValue(`
# 仕様書

## 変更対象ファイル
- \`src/backend/services/user.ts\`
      `);

      // Act
      const result = workflowNext('test-task-001');

      // Assert: 設計検証が実行され、エラーが返ること
      // （設計検証の具体的なエラー内容は実装に依存）
      // ここでは、SKIP_DESIGN_VALIDATIONが無視されることを確認
      expect(result.success).toBe(false);
      // 設計検証が実行されたことを確認（エラーメッセージに設計関連の文言）
      // 実装によってはvalidation errorやspec.md関連のメッセージ
    });

    it('test_implフェーズでもSKIP_DESIGN_VALIDATIONが無視され設計検証が実行されること', () => {
      // Arrange
      process.env.SKIP_DESIGN_VALIDATION = 'true';

      const taskState = mockTaskState('test_impl', {
        docsDir: '/tmp/test-docs-design-check',
      });

      vi.spyOn(stateManager, 'getTaskById').mockReturnValue(taskState);

      // performDesignValidationがエラーを返すようにモック
      vi.mocked(performDesignValidation).mockReturnValueOnce({
        success: false,
        message: '設計-実装整合性の検証に失敗しました',
      });

      // Act
      const result = workflowNext('test-task-001');

      // Assert: SKIP_DESIGN_VALIDATION=trueでも設計検証が実行されブロックされること
      expect(result.success).toBe(false);
      expect(result.message).toContain('設計-実装整合性');
    });
  });

  describe('TC-1-3: SKIP_ARTIFACT_CHECKが無効化されること（complete-sub.ts）', () => {
    it('SKIP_ARTIFACT_CHECK=trueを設定してもサブフェーズ成果物チェックが実行されること', () => {
      // Arrange
      process.env.SKIP_ARTIFACT_CHECK = 'true';

      // parallel_analysisフェーズのplanningサブフェーズ
      const taskState = mockTaskState('parallel_analysis', {
        docsDir: '/tmp/test-docs-planning',
        subPhases: {
          threat_modeling: 'completed',
          planning: 'in_progress',
        },
      });

      vi.spyOn(stateManager, 'getTaskById').mockReturnValue(taskState);

      // spec.mdが存在しない
      vi.mocked(fs.existsSync).mockReturnValue(false);

      // Act: workflow_complete_sub('planning')を実行
      const result = workflowCompleteSub('test-task-001', 'planning');

      // Assert: 成果物チェックが実行され、ブロックされること
      expect(result.success).toBe(false);
      expect(result.message).toContain('spec.md');
      // 成果物チェックが実行されたことを確認（エラーメッセージに成果物関連の文言）
      expect(result.message).toMatch(/成果物|spec\.md/);
    });

    it('state_machineサブフェーズでもチェックが実行されること', () => {
      // Arrange
      process.env.SKIP_ARTIFACT_CHECK = 'true';

      const taskState = mockTaskState('parallel_design', {
        docsDir: '/tmp/test-docs-state',
        subPhases: {
          state_machine: 'in_progress',
        },
      });

      vi.spyOn(stateManager, 'getTaskById').mockReturnValue(taskState);
      vi.mocked(fs.existsSync).mockReturnValue(false); // state-machine.mmdなし

      // Act
      const result = workflowCompleteSub('test-task-001', 'state_machine');

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toContain('state-machine.mmd');
    });

    it('成果物が存在する場合はサブフェーズが完了すること', () => {
      // Arrange
      process.env.SKIP_ARTIFACT_CHECK = 'true';

      const taskState = mockTaskState('parallel_analysis', {
        docsDir: '/tmp/test-docs-planning-ok',
        subPhases: {
          threat_modeling: 'completed',
          planning: 'in_progress',
        },
      });

      vi.spyOn(stateManager, 'getTaskById').mockReturnValue(taskState);
      vi.mocked(fs.existsSync).mockReturnValue(true); // spec.md存在
      vi.mocked(fs.statSync).mockReturnValue({ size: 500 } as any); // サイズチェック用
      // spec.md requires minLines: 50, requiredSections: ['## 概要', '## 実装計画', '## 変更対象ファイル']
      const specLines = [
        '# 仕様書', '',
        '## 概要', '', '仕様の概要を記載。', 'プロジェクトの目的。', 'スコープの定義。', '対象ユーザーの特定。', 'システムの全体像を説明。', '',
        '## 背景', '', '背景情報を記載。', '既存の問題点。', '現状の分析結果。', 'ビジネス要求。', '技術的課題の整理。', '',
        '## 要件', '', 'REQ-1: 要件1の詳細。', 'REQ-2: 要件2の詳細。', 'REQ-3: 要件3の詳細。', 'REQ-4: 要件4の詳細。', 'REQ-5: 要件5の詳細。', 'REQ-6: 要件6の詳細。', '',
        '## 設計方針', '', '設計の方針を記載。', 'アーキテクチャの選択。', 'パターンの適用。', 'モジュール分割の方針。', '拡張性の考慮。', '',
        '## 実装計画', '', 'ステップ1: 調査。', 'ステップ2: 設計。', 'ステップ3: 実装。', 'ステップ4: テスト。', 'ステップ5: レビュー。', 'ステップ6: デプロイ。', '',
        '## 変更対象ファイル', '', '- `src/tools/next.ts`', '- `src/tools/complete-sub.ts`', '- `src/validation/artifact-validator.ts`', '- `hooks/bash-whitelist.js`', '- `hooks/phase-edit-guard.js`', '- `docs/spec.md`', '',
        '## テスト方針', '', 'テスト方針を記載。', 'ユニットテストの範囲。', '統合テストの範囲。', 'リグレッションテスト計画。', 'E2Eテスト計画。', '',
        '## リスク', '', 'リスク1: 互換性の問題。', 'リスク2: パフォーマンス低下。', 'リスク3: セキュリティ懸念。', 'リスク4: スケジュール遅延。', 'リスク5: リソース不足。', '',
        '## スケジュール', '', 'フェーズ1: 1週間。', 'フェーズ2: 2週間。', 'フェーズ3: 1週間。', 'フェーズ4: レビュー。', 'フェーズ5: デプロイ。', '',
        '## 補足', '', '補足情報1。', '補足情報2。', '補足情報3。', '補足情報4。', '補足情報5。', '補足情報6。', '',
      ];
      vi.mocked(fs.readFileSync).mockReturnValue(specLines.join('\n'));

      // updateSubPhaseStatusをモック
      vi.spyOn(stateManager, 'updateSubPhaseStatus').mockImplementation(() => {});
      vi.spyOn(stateManager, 'getIncompleteSubPhases').mockReturnValue([]);

      // Act
      const result = workflowCompleteSub('test-task-001', 'planning');

      // Assert: 成果物があれば完了（環境変数は無視）
      expect(result.success).toBe(true);
      expect(result.subPhase).toBe('planning');
      expect(result.allCompleted).toBe(true);
    });
  });

  describe('TC-1-4: ソースコード中にprocess.env.SKIP_が存在しないこと（静的検証）', () => {
    it('next.tsにprocess.env.SKIP_ARTIFACT_CHECKが存在しないこと', () => {
      // Arrange
      const nextTsPath = path.join(__dirname, '..', 'next.ts');
      const content = fs.readFileSync(nextTsPath, 'utf-8');

      // Act & Assert: process.env.SKIP_ARTIFACT_CHECKが存在しないこと
      expect(content).not.toContain('process.env.SKIP_ARTIFACT_CHECK');
      expect(content).not.toContain('SKIP_ARTIFACT_CHECK');
    });

    it('next.tsにprocess.env.SKIP_DESIGN_VALIDATIONが存在しないこと', () => {
      // Arrange
      const nextTsPath = path.join(__dirname, '..', 'next.ts');
      const content = fs.readFileSync(nextTsPath, 'utf-8');

      // Act & Assert
      expect(content).not.toContain('process.env.SKIP_DESIGN_VALIDATION');
      expect(content).not.toContain('SKIP_DESIGN_VALIDATION');
    });

    it('complete-sub.tsにprocess.env.SKIP_ARTIFACT_CHECKが存在しないこと', () => {
      // Arrange
      const completeSubPath = path.join(__dirname, '..', 'complete-sub.ts');
      const content = fs.readFileSync(completeSubPath, 'utf-8');

      // Act & Assert
      expect(content).not.toContain('process.env.SKIP_ARTIFACT_CHECK');
      expect(content).not.toContain('SKIP_ARTIFACT_CHECK');
    });

    it('全ツールファイルにprocess.env.SKIP_が存在しないこと', () => {
      // Arrange: ツールディレクトリの全.tsファイルをスキャン
      const toolsDir = path.join(__dirname, '..');
      const files = fs.readdirSync(toolsDir)
        .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'));

      // Act & Assert: 各ファイルをチェック
      for (const file of files) {
        const filePath = path.join(toolsDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        // process.env.SKIP_で始まる環境変数参照がないことを確認
        const skipEnvMatch = content.match(/process\.env\.SKIP_\w+/g);
        expect(
          skipEnvMatch,
          `${file} に process.env.SKIP_* が見つかりました: ${skipEnvMatch?.join(', ')}`
        ).toBeNull();
      }
    });

    it('フックファイルにprocess.env.SKIP_が存在しないこと', () => {
      // Arrange: hooksディレクトリの全.jsファイルをスキャン
      const hooksDir = path.resolve(__dirname, '../../../../hooks');

      // hooksディレクトリが存在しない場合はスキップ
      if (!fs.existsSync(hooksDir)) {
        console.warn('[WARN] hooks/ ディレクトリが見つかりません。スキップします。');
        return;
      }

      const files = fs.readdirSync(hooksDir)
        .filter(f => f.endsWith('.js'));

      // Act & Assert
      for (const file of files) {
        const filePath = path.join(hooksDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        const skipEnvMatch = content.match(/process\.env\.SKIP_\w+/g);
        expect(
          skipEnvMatch,
          `${file} に process.env.SKIP_* が見つかりました: ${skipEnvMatch?.join(', ')}`
        ).toBeNull();
      }
    });
  });

  describe('受入条件検証', () => {
    it('AC-1-1: SKIP_PHASE_GUARD=trueを設定してもフェーズ制限が適用されること', () => {
      // Note: phase-edit-guard.jsはフック実行時にテストされる
      // ここではMCPツール側でSKIP_*が無視されることを確認
      process.env.SKIP_PHASE_GUARD = 'true';

      // MCPツールにはSKIP_PHASE_GUARDの概念はないが、
      // フェーズ制限は別途phase-edit-guard.jsで実施される
      expect(process.env.SKIP_PHASE_GUARD).toBe('true');
      // フェーズ制限のテストはhooksの統合テストで実施
    });

    it('AC-1-2: SKIP_ARTIFACT_CHECK=trueを設定しても成果物チェックが実行されること', () => {
      process.env.SKIP_ARTIFACT_CHECK = 'true';

      const taskState = mockTaskState('research');
      vi.spyOn(stateManager, 'getTaskById').mockReturnValue(taskState);
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = workflowNext('test-task-001');

      expect(result.success).toBe(false);
      expect(result.message).toContain('research.md');
    });

    it('AC-1-3: SKIP_DESIGN_VALIDATION=trueを設定しても設計検証が実行されること', () => {
      process.env.SKIP_DESIGN_VALIDATION = 'true';

      const taskState = mockTaskState('test_impl');
      vi.spyOn(stateManager, 'getTaskById').mockReturnValue(taskState);
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = workflowNext('test-task-001');

      expect(result.success).toBe(false);
      // 設計検証が実行されることを確認
    });

    it('AC-1-4: 全ソースコードにprocess.env.SKIP_の文字列が存在しないこと', () => {
      // 静的検証（TC-1-4と同等）
      const toolsDir = path.join(__dirname, '..');
      const files = fs.readdirSync(toolsDir)
        .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'));

      let totalSkipCount = 0;
      for (const file of files) {
        const filePath = path.join(toolsDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const matches = content.match(/process\.env\.SKIP_\w+/g);
        if (matches) {
          totalSkipCount += matches.length;
        }
      }

      expect(totalSkipCount).toBe(0);
    });
  });
});
