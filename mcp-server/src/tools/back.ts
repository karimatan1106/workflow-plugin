/**
 * workflow_back ツール - 部分差し戻し
 *
 * 指定されたタスクを指定フェーズにリセットする（現在より前のフェーズのみ）。
 * リセット履歴が記録される。
 *
 * @spec docs/workflows/ワークフロー大規模対応改善/spec.md
 */

import { stateManager } from '../state/manager.js';
import type { ResetResult, PhaseName, TaskSize } from '../state/types.js';
import { DEFAULT_TASK_SIZE } from '../state/types.js';
import { getPhaseIndex, PHASES_BY_SIZE } from '../phases/definitions.js';
import { getTaskByIdOrError, safeExecute, verifySessionToken } from './helpers.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * タスクを指定フェーズに差し戻し
 *
 * @param taskId タスクID（必須）
 * @param targetPhase 差し戻し先フェーズ（必須）
 * @param reason 差し戻し理由（オプション）
 * @param sessionToken セッショントークン（オプション、REQ-6）
 * @returns 差し戻し結果
 */
export function workflowBack(
  taskId?: string,
  targetPhase?: string,
  reason?: string,
  sessionToken?: string
): ResetResult {
  // タスク状態を取得
  const result = getTaskByIdOrError(taskId);
  if ('error' in result) {
    return result.error as ResetResult;
  }

  const { taskState } = result;

  // REQ-6: セッショントークン検証
  const tokenError = verifySessionToken(taskState, sessionToken);
  if (tokenError) return tokenError as ResetResult;
  const fromPhase = taskState.phase;

  // targetPhaseの検証
  if (!targetPhase || typeof targetPhase !== 'string') {
    return {
      success: false,
      message: 'targetPhaseを指定してください',
    };
  }

  // タスクサイズを取得（デフォルト: large）
  const taskSize: TaskSize = taskState.taskSize || DEFAULT_TASK_SIZE;
  const phases = PHASES_BY_SIZE[taskSize];

  // targetPhaseが有効なフェーズかチェック
  const targetPhaseTyped = targetPhase as PhaseName;
  if (!phases.includes(targetPhaseTyped)) {
    return {
      success: false,
      message: `不正なフェーズ名: ${targetPhase}`,
    };
  }

  // targetPhaseが現在のフェーズより前かチェック
  const currentIndex = getPhaseIndex(fromPhase, taskSize);
  const targetIndex = getPhaseIndex(targetPhaseTyped, taskSize);

  if (targetIndex >= currentIndex) {
    return {
      success: false,
      message: `差し戻し先フェーズは現在のフェーズ（${fromPhase}）より前である必要があります`,
    };
  }

  // 差し戻し処理を実行
  try {
    // REQ-C4: 成果物をバックアップ
    const docsDir = taskState.docsDir;
    const movedFiles = docsDir
      ? resetArtifactsFromPhaseSync(
          taskState.workflowDir,
          docsDir,
          taskState.taskId,
          targetPhase as PhaseName,
          taskSize
        )
      : [];

    if (!docsDir) {
      console.warn(`[workflow_back] docsDir is undefined for task ${taskState.taskId}`);
    }

    // resetHistoryに記録
    const resetReason = reason || `${targetPhase}フェーズへ差し戻し`;
    const newResetEntry = {
      fromPhase,
      reason: resetReason,
      timestamp: new Date().toISOString(),
    };

    const updatedState = {
      ...taskState,
      phase: targetPhase as PhaseName,
      resetHistory: [...(taskState.resetHistory || []), newResetEntry],
    };

    stateManager.writeTaskState(taskState.workflowDir, updatedState);

    // P1-3: task-index.json同期
    try {
      stateManager.syncTaskIndex(taskState.taskId, targetPhase as PhaseName, updatedState);
    } catch (e) {
      console.warn('[workflow_back] task-index sync warning:', e);
    }

    // REQ-C4: リカバリガイダンスを生成
    const guidance = generateRecoveryGuidance(targetPhase as PhaseName, resetReason);

    return {
      success: true,
      taskId: taskState.taskId,
      fromPhase,
      toPhase: targetPhase as PhaseName,
      reason: resetReason,
      message: `${fromPhase} → ${targetPhase} に差し戻しました\n\n${guidance}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `差し戻し処理中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * REQ-C4: 差し戻し先フェーズ以降の成果物をバックアップ
 *
 * 差し戻し先フェーズ以降の成果物をバックアップディレクトリに移動する。
 * バックアップディレクトリ名: `backup_{taskId}_{timestamp}`
 *
 * @param workflowDir ワークフローディレクトリ（内部状態管理用）
 * @param docsDir ドキュメントディレクトリ（成果物配置先）
 * @param taskId タスクID
 * @param targetPhase 差し戻し先フェーズ
 * @param taskSize タスクサイズ
 * @returns 移動した成果物ファイルのリスト
 */
function resetArtifactsFromPhaseSync(
  workflowDir: string,
  docsDir: string,
  taskId: string,
  targetPhase: PhaseName,
  taskSize: TaskSize
): string[] {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(workflowDir, `backup_${taskId}_${timestamp}`);

  // バックアップディレクトリを作成
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const movedFiles: string[] = [];

  // REQ-C4: フェーズ定義から成果物ファイルパターンを取得
  // targetPhase以降のフェーズの成果物のみをバックアップ対象とする
  const phases = PHASES_BY_SIZE[taskSize];
  const targetIndex = getPhaseIndex(targetPhase, taskSize);

  // フェーズごとの成果物マッピング
  const phaseArtifacts: Record<string, string[]> = {
    'requirements': ['requirements.md'],
    'parallel_analysis': ['threat-model.md', 'spec.md'],
    'parallel_design': ['state-machine.mmd', 'flowchart.mmd', 'ui-design.md'],
    'test_design': ['test-design.md'],
    'parallel_quality': ['code-review.md'],
    'parallel_verification': ['manual-test.md', 'security-scan.md', 'performance-test.md', 'e2e-test.md'],
  };

  // targetPhase以降のフェーズの成果物を収集
  const artifactPatterns: string[] = [];
  for (let i = targetIndex + 1; i < phases.length; i++) {
    const phase = phases[i];
    if (phaseArtifacts[phase]) {
      artifactPatterns.push(...phaseArtifacts[phase]);
    }
  }

  // REQ-C4: docsDirを直接使用してファイルパスを解決
  for (const pattern of artifactPatterns) {
    const filePath = path.join(docsDir, pattern);
    if (fs.existsSync(filePath)) {
      const destPath = path.join(backupDir, pattern);
      fs.renameSync(filePath, destPath);
      movedFiles.push(pattern);
    }
  }

  return movedFiles;
}

/**
 * REQ-C4: リカバリガイダンスメッセージを生成
 *
 * 差し戻し先フェーズに応じたリカバリガイダンスメッセージを生成する。
 *
 * @param targetPhase 差し戻し先フェーズ
 * @param reason 差し戻し理由
 * @returns ガイダンスメッセージ（マークダウン形式）
 */
function generateRecoveryGuidance(targetPhase: PhaseName, reason?: string): string {
  const reasonText = reason || '指定なし';
  return `
## リカバリガイダンス

${targetPhase}フェーズに差し戻しました。理由: ${reasonText}

### 次の作業
${targetPhase}フェーズの成果物を修正してください。

### 完了後
workflow_nextで次フェーズに進んでください。
`.trim();
}

/**
 * ツール定義（MCP SDK用）
 */
export const backToolDefinition = {
  name: 'workflow_back',
  description: '指定されたタスクを指定フェーズに差し戻します。現在のフェーズより前のフェーズのみ指定可能です。リセット理由を記録できます。',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'タスクID（必須）',
      },
      targetPhase: {
        type: 'string',
        description: '差し戻し先フェーズ（例: requirements, planning, test_impl など）',
      },
      reason: {
        type: 'string',
        description: '差し戻し理由（オプション）',
      },
      sessionToken: {
        type: 'string',
        description: 'セッショントークン（REQ-6: Orchestrator認証用）',
      },
    },
    required: ['targetPhase'],
  },
};
