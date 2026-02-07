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
} from '../phases/definitions.js';
import { getTaskByIdOrError, safeExecute } from './helpers.js';
import { STATE_ERRORS } from '../utils/errors.js';
import { DesignValidator, formatValidationError } from '../validation/design-validator.js';
import { validateArtifactQuality, PHASE_ARTIFACT_REQUIREMENTS } from '../validation/artifact-validator.js';

/** スコープサイズ制限（REQ-3） */
const MAX_SCOPE_FILES = 200;
const MAX_SCOPE_DIRS = 20;

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
      // 品質要件が定義されていない場合は存在チェックのみ
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
 * @returns 遷移結果
 */
export function workflowNext(taskId?: string): NextResult {
  // タスク状態を取得
  const result = getTaskByIdOrError(taskId);
  if ('error' in result) {
    return result.error as NextResult;
  }

  const taskState = result.taskState;
  const currentPhase = taskState.phase;

  // 完了済みチェック
  if (currentPhase === 'completed') {
    return {
      success: false,
      message: STATE_ERRORS.TASK_ALREADY_COMPLETED,
    };
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

  // スコープのファイル数・ディレクトリ数を取得（API互換性: 両フィールド名サポート）
  const scope = taskState.scope as any;
  const scopeFileCount = (scope?.affectedFiles?.length || scope?.files?.length || 0);
  const scopeDirCount = (scope?.affectedDirs?.length || scope?.directories?.length || 0);

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
      return {
        success: false,
        error: `スコープが大きすぎます。\n${scopeErrors.join('\n')}\nタスクを分割してください。`,
        message: `スコープが大きすぎます。\n${scopeErrors.join('\n')}\nタスクを分割してください。`,
      } as any;
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

  // タスクサイズを取得（未設定の場合はlargeとして扱う）
  const taskSize: TaskSize = taskState.taskSize || DEFAULT_TASK_SIZE;

  // 次のフェーズを取得（タスクサイズに応じた遷移）
  const nextPhase = getNextPhase(currentPhase, taskSize);
  if (!nextPhase) {
    return {
      success: false,
      message: STATE_ERRORS.CANNOT_PROCEED,
    };
  }

  // フェーズ遷移を実行
  return safeExecute('フェーズ遷移', () => {
    stateManager.updateTaskPhase(taskState.taskId, nextPhase);

    return {
      success: true,
      taskId: taskState.taskId,
      from: currentPhase,
      to: nextPhase,
      description: PHASE_DESCRIPTIONS[nextPhase],
      message: `${currentPhase} → ${nextPhase} に遷移しました`,
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
): { phase: 'testing' | 'regression_test'; exitCode: number; timestamp: string; summary?: string } | undefined {
  const results = taskState.testResults || [];
  const phaseResults = results.filter(r => r.phase === phase);

  // 最新のタイムスタンプのものを返す（タイムスタンプ逆順でソート）
  return phaseResults.length > 0
    ? phaseResults.sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]
    : undefined;
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
    },
    required: [],
  },
};
