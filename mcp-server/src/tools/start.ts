/**
 * workflow_start ツール - 新規タスク開始
 *
 * 新しいワークフロータスクを作成し、researchフェーズから開始する。
 *
 * @spec docs/spec/features/workflow-mcp-server.md
 */

import * as crypto from 'crypto';
import { stateManager } from '../state/manager.js';
import type { StartResult, PhaseName } from '../state/types.js';
import { DEFAULT_TASK_SIZE } from '../state/types.js';
import { validateRequiredString, safeExecute } from './helpers.js';
import { MISSING_PARAM_ERRORS } from '../utils/errors.js';
import { MANDATORY_PHASES, MAX_SKIP_COUNT, PHASES_LARGE } from '../phases/definitions.js';

/** セッショントークン生成バイト数 */
const SESSION_TOKEN_BYTES = 32;

/**
 * 新規タスクを開始
 *
 * @param taskName タスク名（日本語可）
 * @param skipPhases スキップするフェーズ（カンマ区切り、REQ-B4/D-1）
 * @returns 開始結果
 *
 * 注: sizeパラメータは廃止されました。全てのタスクはlargeサイズで開始されます。
 */
export function workflowStart(taskName: string, skipPhases?: string): StartResult {
  // タスク名の検証
  const nameValidation = validateRequiredString(taskName, MISSING_PARAM_ERRORS.TASK_NAME);
  if ('error' in nameValidation) {
    return nameValidation.error as StartResult;
  }

  // REQ-B4/D-1: スキップフェーズのパースと検証
  let skipPhaseList: string[] = [];
  if (skipPhases) {
    skipPhaseList = skipPhases.split(',').map(p => p.trim()).filter(Boolean);

    // 有効なフェーズ名かチェック
    const validPhases = PHASES_LARGE as readonly string[];
    const invalidPhases = skipPhaseList.filter(p => !validPhases.includes(p));
    if (invalidPhases.length > 0) {
      return {
        success: false,
        message: `Invalid phase names: ${invalidPhases.join(', ')}`,
      };
    }

    // スキップ不可フェーズのチェック
    const mandatoryNames = MANDATORY_PHASES as readonly string[];
    const invalidSkips = skipPhaseList.filter(p => mandatoryNames.includes(p));
    if (invalidSkips.length > 0) {
      return {
        success: false,
        message: `Cannot skip mandatory phases: ${invalidSkips.join(', ')}`,
      };
    }

    // スキップ数上限チェック（全19フェーズの50%）
    if (skipPhaseList.length > MAX_SKIP_COUNT) {
      return {
        success: false,
        message: `Cannot skip more than 50% of phases (max: ${MAX_SKIP_COUNT}, requested: ${skipPhaseList.length})`,
      };
    }
  }

  // タスク作成を実行（常にlargeサイズ）
  return safeExecute('タスク開始', () => {
    const taskState = stateManager.createTask(nameValidation.value, DEFAULT_TASK_SIZE);

    // REQ-6: セッショントークン生成
    const sessionToken = crypto.randomBytes(SESSION_TOKEN_BYTES).toString('hex');
    taskState.sessionToken = sessionToken;

    // REQ-B4/D-1: スキップフェーズを記録
    if (skipPhaseList.length > 0) {
      taskState.skippedPhases = skipPhaseList;
      taskState.skipReason = 'user-specified';
    }

    stateManager.writeTaskState(taskState.workflowDir, taskState);

    let skipMessage = '';
    if (skipPhaseList.length > 0) {
      skipMessage = `\nSkipped phases: ${skipPhaseList.join(', ')}`;
    }

    return {
      success: true,
      taskId: taskState.taskId,
      taskName: taskState.taskName,
      phase: taskState.phase,
      workflowDir: taskState.workflowDir,
      docsDir: taskState.docsDir,
      taskSize: taskState.taskSize,
      sessionToken,
      message: `タスク「${taskState.taskName}」を開始しました。フェーズ: research、サイズ: large${skipMessage}`,
    };
  }) as StartResult;
}

/**
 * ツール定義（MCP SDK用）
 *
 * MCPサーバーがクライアントに公開するツールのスキーマ定義。
 * 注: sizeパラメータは廃止されました。全てのタスクはlarge（19フェーズ）で開始されます。
 */
export const startToolDefinition = {
  name: 'workflow_start',
  description: '新規ワークフロータスクを開始します。タスク名を指定して、researchフェーズから開始します。',
  inputSchema: {
    type: 'object',
    properties: {
      taskName: {
        type: 'string',
        description: 'タスク名（日本語可）',
      },
      skipPhases: {
        type: 'string',
        description: 'スキップするフェーズ（カンマ区切り、例: "test_impl,testing,regression_test"）',
      },
    },
    required: ['taskName'],
  },
};
