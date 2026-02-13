/**
 * workflow_complete_sub ツール - サブフェーズ完了
 *
 * 並列フェーズのサブフェーズを完了としてマークする。
 * 全サブフェーズが完了すると次のフェーズに進める。
 *
 * @spec docs/workflows/ワ-クフロ-並列タスク対応/spec.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { stateManager } from '../state/manager.js';
import type { CompleteSubResult, SubPhaseName } from '../state/types.js';
import { isParallelPhase, PARALLEL_GROUPS, getSubPhaseDependencies, SUB_PHASE_DEPENDENCIES } from '../phases/definitions.js';
import { getTaskByIdOrError, validateRequiredString, safeExecute, verifySessionToken } from './helpers.js';
import { MISSING_PARAM_ERRORS, invalidValueError } from '../utils/errors.js';
import { validateArtifactQuality, PHASE_ARTIFACT_REQUIREMENTS } from '../validation/artifact-validator.js';

/**
 * REQ-B3: サブフェーズ依存関係の警告チェック
 *
 * @param parentPhase 並列フェーズ名
 * @param subPhase サブフェーズ名
 * @param currentSubPhases 現在のサブフェーズ状態
 * @returns 警告メッセージの配列
 */
function checkSubPhaseDependencyWarnings(
  parentPhase: string,
  subPhase: SubPhaseName,
  currentSubPhases: Record<string, string | undefined>
): string[] {
  const warnings: string[] = [];
  const phaseDeps = SUB_PHASE_DEPENDENCIES[parentPhase];
  if (!phaseDeps) {
    return warnings;
  }

  const deps = phaseDeps[subPhase] || [];
  if (deps.length === 0) {
    return warnings;
  }

  const incompleteDeps = deps.filter(
    dep => currentSubPhases[dep as SubPhaseName] !== 'completed'
  );

  if (incompleteDeps.length > 0) {
    warnings.push(
      `推奨: ${subPhase}を完了する前に、以下のサブフェーズを先に完了することを推奨します: ${incompleteDeps.join(', ')}`
    );
  }

  return warnings;
}

/**
 * サブフェーズ名から成果物ファイル名への対応表（REQ-3: 品質検証強化）
 *
 * @spec docs/workflows/ワークフロー全問題完全解決/spec.md REQ-3
 */
const SUB_PHASE_TO_ARTIFACT: Partial<Record<SubPhaseName, string[]>> = {
  threat_modeling: ['threat-model.md'],
  planning: ['spec.md'],
  state_machine: ['state-machine.mmd'],
  flowchart: ['flowchart.mmd'],
  ui_design: ['ui-design.md'],
  code_review: ['code-review.md'],
  manual_test: ['manual-test.md'],
  security_scan: ['security-scan.md'],
  performance_test: ['performance-test.md'],
  e2e_test: ['e2e-test.md'],
};

/**
 * サブフェーズ完了時の成果物品質チェック（REQ-3: 強化版）
 *
 * 存在チェックだけでなく、以下の品質検証も実施:
 * - 最小行数チェック
 * - 必須セクションチェック
 * - 禁止パターン検出（TODO, TBD, WIP, FIXME）
 * - ダミーテキスト検出
 * - ヘッダーのみ検出
 *
 * @param subPhase サブフェーズ名
 * @param docsDir ドキュメントディレクトリ
 * @returns エラーメッセージの配列（空なら問題なし）
 */
function checkSubPhaseArtifacts(subPhase: SubPhaseName, docsDir: string): string[] {
  const artifactFiles = SUB_PHASE_TO_ARTIFACT[subPhase];
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
 * サブフェーズを完了としてマーク
 *
 * @param taskId タスクID（必須）
 * @param subPhase サブフェーズ名
 * @param sessionToken セッショントークン（オプション、REQ-6）
 * @returns 完了結果
 */
export function workflowCompleteSub(taskId?: string, subPhase?: string, sessionToken?: string): CompleteSubResult {
  // タスク状態を取得
  const result = getTaskByIdOrError(taskId);
  if ('error' in result) {
    return result.error as CompleteSubResult;
  }

  const { taskState } = result;

  // REQ-6: セッショントークン検証
  const tokenError = verifySessionToken(taskState, sessionToken);
  if (tokenError) return tokenError as CompleteSubResult;

  // サブフェーズ名の検証
  const validation = validateRequiredString(subPhase, MISSING_PARAM_ERRORS.SUB_PHASE);
  if ('error' in validation) {
    return validation.error as CompleteSubResult;
  }
  const currentPhase = taskState.phase;

  // 並列フェーズでない場合はエラー
  if (!isParallelPhase(currentPhase)) {
    return {
      success: false,
      message: `現在のフェーズ(${currentPhase})は並列フェーズではありません`,
    };
  }

  // サブフェーズの妥当性をチェック
  const validSubPhases = PARALLEL_GROUPS[currentPhase] || [];
  if (!validSubPhases.includes(validation.value as SubPhaseName)) {
    return {
      success: false,
      message: invalidValueError('サブフェーズ', validation.value, validSubPhases),
    };
  }

  // ★★★ REQ-6: 依存関係チェック ★★★
  const subPhaseName = validation.value as SubPhaseName;
  const dependencies = getSubPhaseDependencies(currentPhase, subPhaseName);

  if (dependencies.length > 0) {
    const currentSubPhases = taskState.subPhases || {};
    const incompleteDeps = dependencies.filter(
      dep => currentSubPhases[dep as SubPhaseName] !== 'completed'
    );

    if (incompleteDeps.length > 0) {
      return {
        success: false,
        message: `${subPhaseName}を完了するには、以下のサブフェーズが先に完了している必要があります: ${incompleteDeps.join(', ')}`,
      };
    }
  }

  // ★★★ 成果物品質チェック（REQ-3: 強化版） ★★★
  const docsDir = taskState.docsDir || taskState.workflowDir;
  const artifactErrors = checkSubPhaseArtifacts(subPhaseName, docsDir);
  if (artifactErrors.length > 0) {
    return {
      success: false,
      message: `${subPhaseName}の成果物に問題があります:\n${artifactErrors.map(e => `  - ${e}`).join('\n')}\n\n出力先: ${docsDir}/`,
    };
  }

  // ★★★ REQ-B3: 依存関係の警告チェック ★★★
  const warnings = checkSubPhaseDependencyWarnings(currentPhase, subPhaseName, taskState.subPhases || {});

  // サブフェーズ完了処理を実行
  return safeExecute('サブフェーズ完了処理', () => {
    // サブフェーズを完了としてマーク
    stateManager.updateSubPhaseStatus(taskState.taskId, subPhaseName, 'completed');

    // 残りの未完了サブフェーズを取得
    const remaining = stateManager.getIncompleteSubPhases(taskState.taskId);
    const allCompleted = remaining.length === 0;

    // 結果メッセージを生成
    let message = allCompleted
      ? `${subPhaseName}を完了しました。全て完了。workflow_next で次へ進めます`
      : `${subPhaseName}を完了しました。残り: ${remaining.join(', ')}`;

    // REQ-B3: 警告メッセージを追加
    if (warnings.length > 0) {
      message += `\n\n⚠ 警告:\n${warnings.map(w => `  - ${w}`).join('\n')}`;
    }

    return {
      success: true,
      subPhase: subPhaseName,
      phase: currentPhase,
      remaining,
      allCompleted,
      message,
      workflow_context: {
        workflowDir: taskState.workflowDir,
        phase: currentPhase,
        currentPhase: currentPhase,
        subPhase: subPhaseName,
      },
    };
  }) as CompleteSubResult;
}

/**
 * ツール定義（MCP SDK用）
 *
 * MCPサーバーがクライアントに公開するツールのスキーマ定義。
 */
export const completeSubToolDefinition = {
  name: 'workflow_complete_sub',
  description: '指定されたタスクの並列フェーズのサブフェーズを完了としてマークします。全サブフェーズが完了すると次のフェーズに進めます。',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'タスクID（必須）',
      },
      subPhase: {
        type: 'string',
        description: 'サブフェーズ名（例: threat_modeling, planning, state_machine, flowchart, ui_design, build_check, code_review, manual_test, security_scan, performance_test, e2e_test）',
      },
      sessionToken: {
        type: 'string',
        description: 'セッショントークン（REQ-6: Orchestrator認証用）',
      },
    },
    required: ['subPhase'],
  },
};
