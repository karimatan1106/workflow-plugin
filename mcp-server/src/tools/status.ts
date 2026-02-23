/**
 * workflow_status ツール - 現在の状態を取得
 *
 * taskIdが指定されていない場合: 全アクティブタスクの一覧を返す
 * taskIdが指定されている場合: 指定タスクの詳細を返す
 *
 * @spec docs/workflows/ワ-クフロ-並列タスク対応/spec.md
 */

import { stateManager } from '../state/manager.js';
import type { StatusResult, PhaseName } from '../state/types.js';
import { PHASE_DESCRIPTIONS, isParallelPhase, PHASES_BY_SIZE, resolvePhaseGuide } from '../phases/definitions.js';

/**
 * 現在のワークフロー状態を取得
 *
 * @param taskId タスクID（オプション）
 * @returns ステータス結果
 */
export function workflowStatus(taskId?: string): StatusResult {
  // ディレクトリスキャンでアクティブタスクを取得
  const activeTasks = stateManager.discoverTasks();

  // アクティブなタスクがない場合
  if (activeTasks.length === 0) {
    return {
      success: true,
      status: 'idle',
      message: 'タスクなし。workflow_start でタスクを開始してください',
    };
  }

  // taskIdが指定されていない場合: 全タスク一覧を返す
  if (!taskId) {
    return {
      success: true,
      status: 'active',
      tasks: activeTasks.map((t) => ({
        taskId: t.taskId,
        taskName: t.taskName,
        phase: t.phase,
        docsDir: t.docsDir,
      })),
      message: `${activeTasks.length}件のアクティブタスクがあります`,
    };
  }

  // taskIdが指定されている場合: 指定タスクの詳細を返す
  const taskState = activeTasks.find((t) => t.taskId === taskId);

  if (!taskState) {
    return {
      success: false,
      status: 'error',
      error: 'TASK_NOT_FOUND',
      message: `指定されたタスクが見つかりません: ${taskId}`,
    };
  }

  const phase = taskState.phase as PhaseName;

  // 基本的な結果を構築
  const currentTaskSize = taskState.taskSize || 'large';
  const activePhases = PHASES_BY_SIZE[currentTaskSize];

  const result: StatusResult = {
    success: true,
    status: 'active',
    taskId: taskState.taskId,
    taskName: taskState.taskName,
    phase,
    workflowDir: taskState.workflowDir,
    docsDir: taskState.docsDir,
    activeTasks: activeTasks.length,
    allTasks: activeTasks.map((t) => ({
      taskId: t.taskId,
      taskName: t.taskName,
      phase: t.phase,
    })),
    message: PHASE_DESCRIPTIONS[phase] || phase,
    taskSize: currentTaskSize,
    userIntent: taskState.userIntent || taskState.taskName,
    activePhases: [...activePhases],
  };

  // 並列フェーズの場合、サブフェーズ状態を追加
  if (isParallelPhase(phase)) {
    const existingSubPhases = taskState.subPhases || {};
    const hasSubPhases = Object.keys(existingSubPhases).length > 0;
    const subPhases = hasSubPhases ? existingSubPhases : stateManager.initializeSubPhases(phase);

    result.subPhases = subPhases;
    result.isParallelPhase = true;
  }

  // REQ-C: scope情報をレスポンスに追加
  if (taskState.scope) {
    (result as any).scope = taskState.scope;
  } else {
    (result as any).scope = { files: [], dirs: [], glob: '' };
  }

  // REQ-C: approvals情報をレスポンスに追加
  (result as any).approvals = taskState.approvals || {
    requirements: false,
    design: false,
    test_design: false,
    code_review: false,
  };

  // REQ-C3: スキップされたフェーズ情報を追加
  if (taskState.phaseSkipReasons && Object.keys(taskState.phaseSkipReasons).length > 0) {
    const skippedPhases = Object.entries(taskState.phaseSkipReasons)
      .map(([phaseName, reason]) => `- **${phaseName}**: ${reason}`)
      .join('\n');

    const skipInfo = `\n\n## スキップされたフェーズ\n\n${skippedPhases}`;
    result.message = (result.message || '') + skipInfo;
  }

  // phaseGuideを追加（idle/completed以外）
  if (phase !== 'idle' && phase !== 'completed') {
    const phaseGuide = resolvePhaseGuide(phase, taskState.docsDir, taskState.userIntent);
    if (phaseGuide) {
      // workflow_statusではサイズの大きなフィールドを除外してレスポンスを削減する
      // workflow_nextには引き続き全フィールドを含めることで後方互換性を維持する
      const slimGuide = { ...phaseGuide } as Record<string, unknown>;
      delete slimGuide['subagentTemplate'];
      delete slimGuide['content'];
      delete slimGuide['claudeMdSections'];
      if (slimGuide['subPhases'] && typeof slimGuide['subPhases'] === 'object') {
        for (const subPhase of Object.values(slimGuide['subPhases'] as Record<string, unknown>)) {
          if (subPhase && typeof subPhase === 'object') {
            const sub = subPhase as Record<string, unknown>;
            delete sub['subagentTemplate'];
            delete sub['content'];
            delete sub['claudeMdSections'];
          }
        }
      }
      result.phaseGuide = slimGuide as unknown as typeof phaseGuide;
    }
  }

  return result;
}

/**
 * ツール定義（MCP SDK用）
 *
 * MCPサーバーがクライアントに公開するツールのスキーマ定義。
 */
export const statusToolDefinition = {
  name: 'workflow_status',
  description: '現在のワークフロー状態を取得します。taskIdを省略すると全アクティブタスクの一覧を返し、taskIdを指定すると指定タスクの詳細を返します。',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'タスクID（省略時は全タスク一覧）',
      },
    },
    required: [],
  },
};
