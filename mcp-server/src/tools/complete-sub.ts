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
import { isParallelPhase, PARALLEL_GROUPS, getSubPhaseDependencies } from '../phases/definitions.js';
import { getTaskByIdOrError, validateRequiredString, safeExecute } from './helpers.js';
import { MISSING_PARAM_ERRORS, invalidValueError } from '../utils/errors.js';

/**
 * サブフェーズごとの必須成果物マッピング
 *
 * @spec docs/workflows/ワ-クフロ-成果物検証強制/spec.md
 */
const SUB_PHASE_REQUIRED_ARTIFACTS: Partial<Record<SubPhaseName, string[]>> = {
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
 * サブフェーズ完了時の成果物存在チェック
 *
 * @param subPhase サブフェーズ名
 * @param docsDir ドキュメントディレクトリ
 * @returns 未作成の成果物ファイル名の配列（空なら問題なし）
 */
function checkSubPhaseArtifacts(subPhase: SubPhaseName, docsDir: string): string[] {
  if (process.env.SKIP_ARTIFACT_CHECK === 'true') {
    return [];
  }
  const artifacts = SUB_PHASE_REQUIRED_ARTIFACTS[subPhase];
  if (!artifacts) {
    return [];
  }
  return artifacts.filter(f => !fs.existsSync(path.join(docsDir, f)));
}

/**
 * サブフェーズを完了としてマーク
 *
 * @param taskId タスクID（必須）
 * @param subPhase サブフェーズ名
 * @returns 完了結果
 */
export function workflowCompleteSub(taskId?: string, subPhase?: string): CompleteSubResult {
  // タスク状態を取得
  const result = getTaskByIdOrError(taskId);
  if ('error' in result) {
    return result.error as CompleteSubResult;
  }

  // サブフェーズ名の検証
  const validation = validateRequiredString(subPhase, MISSING_PARAM_ERRORS.SUB_PHASE);
  if ('error' in validation) {
    return validation.error as CompleteSubResult;
  }

  const { taskState } = result;
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

  // ★★★ 成果物存在チェック ★★★
  const docsDir = taskState.docsDir || taskState.workflowDir;
  const missingArtifacts = checkSubPhaseArtifacts(subPhaseName, docsDir);
  if (missingArtifacts.length > 0) {
    return {
      success: false,
      message: `${subPhaseName}の必須成果物が未作成です: ${missingArtifacts.join(', ')}\n出力先: ${docsDir}/`,
    };
  }

  // サブフェーズ完了処理を実行
  return safeExecute('サブフェーズ完了処理', () => {
    // サブフェーズを完了としてマーク
    stateManager.updateSubPhaseStatus(taskState.taskId, subPhaseName, 'completed');

    // 残りの未完了サブフェーズを取得
    const remaining = stateManager.getIncompleteSubPhases(taskState.taskId);
    const allCompleted = remaining.length === 0;

    // 結果メッセージを生成
    const message = allCompleted
      ? `${subPhaseName}を完了しました。全て完了。workflow_next で次へ進めます`
      : `${subPhaseName}を完了しました。残り: ${remaining.join(', ')}`;

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
    },
    required: ['subPhase'],
  },
};
