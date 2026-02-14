/**
 * workflow_next ツール - 次フェーズへ遷移
 *
 * 指定されたタスクを次のフェーズへ遷移する。
 * レビューフェーズでは承認が、並列フェーズでは全サブフェーズの完了が必要。
 *
 * @spec docs/workflows/ワ-クフロ-並列タスク対応/spec.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { stateManager } from '../state/manager.js';
import type { NextResult, TaskSize, TaskState, PhaseName } from '../state/types.js';
import { DEFAULT_TASK_SIZE } from '../state/types.js';
import {
  requiresApproval,
  isParallelPhase,
  getNextPhase,
  PHASE_DESCRIPTIONS,
  calculatePhaseSkips,
} from '../phases/definitions.js';
import { getTaskByIdOrError, safeExecute, verifySessionToken } from './helpers.js';
import { STATE_ERRORS } from '../utils/errors.js';
import { DesignValidator, formatValidationError } from '../validation/design-validator.js';
import { validateArtifactQuality, PHASE_ARTIFACT_REQUIREMENTS, validateSemanticConsistency } from '../validation/artifact-validator.js';
import { validateScopePostExecution } from '../validation/scope-validator.js';
import { auditLogger } from '../audit/logger.js';

/** スコープサイズ制限（REQ-3, REQ-R4: 環境変数対応） */
const MAX_SCOPE_FILES = Math.min(
  Math.max(parseInt(process.env.MAX_SCOPE_FILES || '1000', 10) || 1000, 10),
  10000
);
const MAX_SCOPE_DIRS = Math.min(
  Math.max(parseInt(process.env.MAX_SCOPE_DIRS || '100', 10) || 100, 5),
  1000
);

/** テスト基準値の定義 */
const MIN_TESTS = 0; // テスト存在チェック用

/**
 * フェーズ名から成果物ファイル名への対応表（REQ-3: 品質検証強化）
 *
 * @spec docs/workflows/ワークフロー全問題完全解決/spec.md REQ-3
 */
const PHASE_TO_ARTIFACT: Partial<Record<PhaseName, string[]>> = {
  research: ['research.md'],
  requirements: ['requirements.md'],
  test_design: ['test-design.md'],
};

/**
 * フェーズ遷移時の成果物品質チェック（REQ-3: 強化版）
 *
 * 存在チェックだけでなく、以下の品質検証も実施:
 * - 最小行数チェック
 * - 必須セクションチェック
 * - 禁止パターン検出（TODO, TBD, WIP, FIXME）
 * - ダミーテキスト検出
 * - ヘッダーのみ検出
 *
 * @param phase 現在のフェーズ
 * @param docsDir ドキュメントディレクトリ
 * @returns エラーメッセージの配列（空なら問題なし）
 */
function checkPhaseArtifacts(phase: PhaseName, docsDir: string): string[] {
  const artifactFiles = PHASE_TO_ARTIFACT[phase];
  if (!artifactFiles) {
    return [];
  }

  const allErrors: string[] = [];

  for (const artifactFile of artifactFiles) {
    const filePath = path.join(docsDir, artifactFile);

    // ファイル存在チェック
    if (!fs.existsSync(filePath)) {
      allErrors.push(`${artifactFile} が存在しません`);
      continue;
    }

    // 品質要件を取得
    const requirements = PHASE_ARTIFACT_REQUIREMENTS[artifactFile];
    if (!requirements) {
      continue;
    }

    // 品質検証を実行
    const validationResult = validateArtifactQuality(filePath, requirements);
    if (!validationResult.passed) {
      allErrors.push(...validationResult.errors);
    }
  }

  return allErrors;
}

/**
 * 設計-実装整合性チェックを実行（REQ-6: 必須化）
 *
 * @param docsDir ドキュメントディレクトリ
 * @returns エラーがある場合はエラー結果、ない場合は null
 */
function performDesignValidation(docsDir: string): NextResult | null {
  const validator = new DesignValidator(docsDir);
  const validationResult = validator.validateAll();

  if (!validationResult.passed) {
    return {
      success: false,
      message: formatValidationError(validationResult),
    };
  }

  return null;
}

/**
 * 次のフェーズへ遷移
 *
 * @param taskId タスクID
 * @param sessionToken セッショントークン（オプション、REQ-6）
 * @returns 遷移結果
 */
export function workflowNext(taskId?: string, sessionToken?: string): NextResult {
  // タスク状態を取得
  const result = getTaskByIdOrError(taskId);
  if ('error' in result) {
    return result.error as NextResult;
  }

  const taskState = result.taskState;
  const currentPhase = taskState.phase;

  // REQ-6: セッショントークン検証
  const tokenError = verifySessionToken(taskState, sessionToken);
  if (tokenError) return tokenError as NextResult;

  // 完了済みチェック
  if (currentPhase === 'completed') {
    return {
      success: false,
      message: STATE_ERRORS.TASK_ALREADY_COMPLETED,
    };
  }

  // REQ-B1: requirements承認チェック
  if (currentPhase === 'requirements') {
    if (!taskState.approvals?.requirements) {
      return {
        success: false,
        message: 'requirements承認が必要です。workflow_approve requirements を実行してください',
      };
    }
  }

  // レビュー承認が必要かチェック
  if (requiresApproval(currentPhase)) {
    return {
      success: false,
      message: `${currentPhase}フェーズはユーザー承認が必要です。workflow_approve で承認してください`,
    };
  }

  // 並列フェーズの場合、全サブフェーズが完了しているかチェック
  if (isParallelPhase(currentPhase)) {
    const incompleteSubPhases = stateManager.getIncompleteSubPhases(taskState.taskId);
    if (incompleteSubPhases.length > 0) {
      return {
        success: false,
        message: `並列フェーズの未完了サブフェーズがあります: ${incompleteSubPhases.join(', ')}。workflow_complete_sub で完了してください`,
      };
    }
  }

  // スコープのファイル数・ディレクトリ数を取得
  const scopeFileCount = taskState.scope?.affectedFiles?.length || 0;
  const scopeDirCount = taskState.scope?.affectedDirs?.length || 0;

  // REQ-1: parallel_analysis → parallel_design 遷移時のスコープ必須チェック
  if (currentPhase === 'parallel_analysis') {
    if (scopeFileCount === 0 && scopeDirCount === 0) {
      return {
        success: false,
        message: 'スコープが設定されていません。workflow_set_scope で影響範囲を設定してください',
      };
    }
  }

  // REQ-3: スコープサイズ制限チェック（全フェーズ共通）
  if (scopeFileCount > 0 || scopeDirCount > 0) {
    const scopeErrors: string[] = [];
    if (scopeFileCount > MAX_SCOPE_FILES) {
      scopeErrors.push(`ファイル数: ${scopeFileCount}/${MAX_SCOPE_FILES}`);
    }
    if (scopeDirCount > MAX_SCOPE_DIRS) {
      scopeErrors.push(`ディレクトリ数: ${scopeDirCount}/${MAX_SCOPE_DIRS}`);
    }

    if (scopeErrors.length > 0) {
      const errorMessage = `スコープが大きすぎます。\n${scopeErrors.join('\n')}\nタスクを分割してください。`;
      return {
        success: false,
        message: errorMessage,
      };
    }
  }

  // REQ-2: testing → regression_test 遷移時のテスト結果検証
  if (currentPhase === 'testing') {
    const testResult = getLatestTestResult(taskState, 'testing');
    if (!testResult) {
      return {
        success: false,
        message: 'テスト結果が記録されていません。workflow_record_test_result でテスト結果を記録してください',
      };
    }
    if (testResult.exitCode !== 0) {
      return {
        success: false,
        message: `テストが失敗しています（exitCode: ${testResult.exitCode}）。テストを修正してから次フェーズに進んでください`,
      };
    }

    // REQ-4: testing通過時にtestBaselineを自動設定
    if (testResult.passedCount !== undefined || testResult.failedCount !== undefined) {
      const totalCount = (testResult.passedCount || 0) + (testResult.failedCount || 0);
      if (totalCount > 0) {
        const updatedState = {
          ...taskState,
          testBaseline: {
            capturedAt: new Date().toISOString(),
            totalTests: totalCount,
            passedTests: testResult.passedCount || 0,
            failedTests: [],
          },
        };
        stateManager.writeTaskState(taskState.workflowDir, updatedState);
      }
    }
  }

  // REQ-2: regression_test → parallel_verification 遷移時のテスト結果検証
  if (currentPhase === 'regression_test') {
    const testResult = getLatestTestResult(taskState, 'regression_test');
    if (!testResult) {
      return {
        success: false,
        message: 'リグレッションテスト結果が記録されていません。workflow_record_test_result でテスト結果を記録してください',
      };
    }
    if (testResult.exitCode !== 0) {
      return {
        success: false,
        message: `リグレッションテストが失敗しています（exitCode: ${testResult.exitCode}）。テストを修正してから次フェーズに進んでください`,
      };
    }

    // REQ-4: testBaseline必須チェック
    if (!taskState.testBaseline) {
      return {
        success: false,
        message: 'テストベースラインが設定されていません。testingフェーズでテスト結果を記録してください。',
      };
    }

    // REQ-4: テスト総数の回帰チェック
    const currentTotal = (testResult.passedCount || 0) + (testResult.failedCount || 0);
    if (currentTotal > 0 && currentTotal < taskState.testBaseline.totalTests) {
      return {
        success: false,
        message: `テスト総数が減少しています（baseline: ${taskState.testBaseline.totalTests}, 現在: ${currentTotal}）。テストの削除は禁止です。`,
      };
    }

    // REQ-4: パスしたテスト数の回帰チェック
    if (testResult.passedCount !== undefined && testResult.passedCount < taskState.testBaseline.passedTests) {
      return {
        success: false,
        message: `パスしたテスト数が減少しています（baseline: ${taskState.testBaseline.passedTests}, 現在: ${testResult.passedCount}）。`,
      };
    }
  }

  // 設計-実装整合性チェック（test_impl → implementation 遷移時）
  if (currentPhase === 'test_impl') {
    const docsDir = taskState.docsDir || taskState.workflowDir;
    const validationError = performDesignValidation(docsDir);
    if (validationError) {
      return validationError;
    }
  }

  // 設計-実装整合性チェック（refactoring → parallel_quality 遷移時）
  if (currentPhase === 'refactoring') {
    const docsDir = taskState.docsDir || taskState.workflowDir;
    const validationError = performDesignValidation(docsDir);
    if (validationError) {
      return validationError;
    }
  }

  // ★★★ 成果物品質チェック（REQ-3: 強化版） ★★★
  const artifactDocsDir = taskState.docsDir || taskState.workflowDir;
  const artifactErrors = checkPhaseArtifacts(currentPhase, artifactDocsDir);
  if (artifactErrors.length > 0) {
    return {
      success: false,
      message: `${currentPhase}フェーズの成果物に問題があります:\n${artifactErrors.map(e => `  - ${e}`).join('\n')}\n\n出力先: ${artifactDocsDir}/`,
    };
  }

  // ★★★ REQ-B2 + FR-7: 意味的整合性チェック（test_design以降のフェーズ） ★★★
  const semanticCheckPhases: PhaseName[] = ['test_design', 'test_impl', 'implementation', 'refactoring', 'parallel_quality'];
  if (semanticCheckPhases.includes(currentPhase)) {
    const docsDir = taskState.docsDir || taskState.workflowDir;
    const semanticResult = validateSemanticConsistency(docsDir);

    // FR-7: 環境変数SEMANTIC_CHECK_STRICTによる動作制御（デフォルト: true = 厳格モード）
    const strictMode = process.env.SEMANTIC_CHECK_STRICT !== 'false';

    if (semanticResult.warnings.length > 0) {
      const warningMessage = semanticResult.warnings.map(w => `  - ${w}`).join('\n');

      if (strictMode) {
        // 厳格モード: エラーとしてブロック
        auditLogger.log({
          event: 'semantic_check_failed',
          taskId: taskState.taskId,
          phase: currentPhase,
          missingRequirements: semanticResult.warnings.filter(w => w.includes('missing')),
          extraImplementations: semanticResult.warnings.filter(w => w.includes('extra')),
          strictMode: true,
        });

        return {
          success: false,
          message: `${currentPhase}フェーズの意味的整合性チェックに失敗しました:\n${warningMessage}\n\n設計書と実装コードの不整合を解消してください。\n（警告モードで続行する場合: SEMANTIC_CHECK_STRICT=false を設定）`,
        };
      } else {
        // 警告モード: 警告のみで続行
        console.warn('[semantic] 意味的整合性の警告（警告モード）:');
        semanticResult.warnings.forEach(w => console.warn(`  - ${w}`));

        auditLogger.log({
          event: 'semantic_check_failed',
          taskId: taskState.taskId,
          phase: currentPhase,
          missingRequirements: semanticResult.warnings.filter(w => w.includes('missing')),
          extraImplementations: semanticResult.warnings.filter(w => w.includes('extra')),
          strictMode: false,
        });
      }
    }
  }

  // REQ-5: スコープ事後検証（docs_update→commit遷移時）
  if (currentPhase === 'docs_update') {
    const scopeFiles = taskState.scope?.affectedFiles || [];
    const scopeDirs = taskState.scope?.affectedDirs || [];
    if (scopeFiles.length > 0 || scopeDirs.length > 0) {
      try {
        const scopeResult = validateScopePostExecution(scopeFiles, scopeDirs);
        if (!scopeResult.valid) {
          // REQ-2: SCOPE_STRICTはデフォルトtrue（厳格モード）
          const isStrict = process.env.SCOPE_STRICT !== 'false';

          if (isStrict) {
            return {
              success: false,
              message: `スコープ外のファイルが変更されています:\n${scopeResult.outOfScopeFiles.map(f => `  - ${f}`).join('\n')}\n\nSCOPE_STRICT（デフォルト）のためブロックされました。`,
            };
          }

          // REQ-1c: SCOPE_STRICT=false の監査ログ
          auditLogger.log({
            event: 'bypass_enabled',
            variable: 'SCOPE_STRICT',
            taskId: taskState.taskId,
            phase: taskState.phase,
          });

          // 警告モード: 警告のみで続行
          console.warn(`[scope] スコープ外変更検出（警告モード）: ${scopeResult.outOfScopeFiles.join(', ')}`);
        }
      } catch (e) {
        // git未初期化等のエラーは無視して続行
        console.warn('[scope] スコープ事後検証をスキップ:', e);
      }
    }
  }

  // タスクサイズを取得（未設定の場合はlargeとして扱う）
  const taskSize: TaskSize = taskState.taskSize || DEFAULT_TASK_SIZE;

  // REQ-C3: 動的フェーズスキップ判定（自動検出）
  // REQ-FIX-2: userIntentをcalculatePhaseSkipsに渡してスキップオーバーライドを有効化
  const phaseSkipReasons = calculatePhaseSkips(taskState.scope || {}, taskState.userIntent);

  // REQ-B4/D-1: ユーザー指定のスキップフェーズをマージ
  if (taskState.skippedPhases && taskState.skippedPhases.length > 0) {
    for (const phase of taskState.skippedPhases) {
      if (!phaseSkipReasons[phase]) {
        phaseSkipReasons[phase] = 'ユーザー指定（--skip-phases）';
      }
    }
  }

  // 次のフェーズを取得（タスクサイズに応じた遷移）
  let nextPhase = getNextPhase(currentPhase, taskSize);
  if (!nextPhase) {
    return {
      success: false,
      message: STATE_ERRORS.CANNOT_PROCEED,
    };
  }

  // parallel_quality → testing 遷移時のcode_review承認チェック
  if (currentPhase === 'parallel_quality' && nextPhase === 'testing') {
    const codeReviewAutoApprove = process.env.CODE_REVIEW_APPROVAL === 'false';
    if (!codeReviewAutoApprove && !taskState.approvals?.code_review) {
      return {
        success: false,
        message: 'code_review承認が必要です。workflow_approve code_review を実行してください',
      };
    }
  }

  // スキップ対象フェーズを飛ばす
  const skippedPhases: string[] = [];
  while (nextPhase && phaseSkipReasons[nextPhase]) {
    skippedPhases.push(nextPhase);
    nextPhase = getNextPhase(nextPhase, taskSize);
  }

  if (!nextPhase) {
    return {
      success: false,
      message: STATE_ERRORS.CANNOT_PROCEED,
    };
  }

  // フェーズ遷移を実行
  return safeExecute('フェーズ遷移', () => {
    // REQ-C3: スキップ理由を状態に記録
    if (Object.keys(phaseSkipReasons).length > 0) {
      const updatedState = {
        ...taskState,
        phaseSkipReasons,
      };
      stateManager.writeTaskState(taskState.workflowDir, updatedState);
    }

    stateManager.updateTaskPhase(taskState.taskId, nextPhase);

    // スキップ通知メッセージ
    let skipMessage = '';
    if (skippedPhases.length > 0) {
      const skipDetails = skippedPhases.map(p => `  - ${p}: ${phaseSkipReasons[p]}`).join('\n');
      skipMessage = `\n\n以下のフェーズをスキップしました:\n${skipDetails}`;
    }

    return {
      success: true,
      taskId: taskState.taskId,
      from: currentPhase,
      to: nextPhase,
      description: PHASE_DESCRIPTIONS[nextPhase],
      message: `${currentPhase} → ${nextPhase} に遷移しました${skipMessage}`,
      workflow_context: {
        workflowDir: taskState.workflowDir,
        phase: nextPhase,
        currentPhase: currentPhase,
      },
    };
  }) as NextResult;
}

/**
 * 最新のテスト結果を取得
 *
 * @param taskState タスク状態
 * @param phase テストフェーズ（'testing' または 'regression_test'）
 * @returns 最新のテスト結果、または undefined
 */
function getLatestTestResult(
  taskState: TaskState,
  phase: 'testing' | 'regression_test'
) {
  const results = taskState.testResults || [];
  const phaseResults = results.filter(r => r.phase === phase);

  if (phaseResults.length === 0) {
    return undefined;
  }

  // 最新のタイムスタンプのものを返す（タイムスタンプ逆順でソート）
  return phaseResults.sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
}

/**
 * ツール定義（MCP SDK用）
 *
 * MCPサーバーがクライアントに公開するツールのスキーマ定義。
 */
export const nextToolDefinition = {
  name: 'workflow_next',
  description: '指定されたタスクを次のフェーズへ遷移します。レビューフェーズでは承認が必要です。並列フェーズでは全サブフェーズの完了が必要です。',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'タスクID（必須）',
      },
      sessionToken: {
        type: 'string',
        description: 'セッショントークン（REQ-6: Orchestrator認証用）',
      },
    },
    required: [],
  },
};
