/**
 * workflow_start ツール - 新規タスク開始
 *
 * 新しいワークフロータスクを作成し、researchフェーズから開始する。
 *
 * @spec docs/spec/features/workflow-mcp-server.md
 */

import * as crypto from 'crypto';
import { execSync } from 'child_process';
import { stateManager, generateSessionToken } from '../state/manager.js';
import type { StartResult, PhaseName } from '../state/types.js';
import { DEFAULT_TASK_SIZE } from '../state/types.js';
import { validateRequiredString, safeExecute } from './helpers.js';
import { MISSING_PARAM_ERRORS } from '../utils/errors.js';
import { MANDATORY_PHASES, MAX_SKIP_COUNT, PHASES_LARGE, PHASES_BY_SIZE } from '../phases/definitions.js';

/** セッショントークン生成バイト数 */
const SESSION_TOKEN_BYTES = 32;

/**
 * 新規タスクを開始
 *
 * @param taskName タスク名（日本語可）
 * @param skipPhases スキップするフェーズ（カンマ区切り、REQ-B4/D-1）
 * @param userIntent ユーザーの意図（オプション、10000文字まで）
 * @param taskSize タスクサイズ（オプション、デフォルト: large）
 * @returns 開始結果
 *
 * 注: sizeパラメータは廃止されました。全てのタスクはlargeサイズで開始されます。
 */
export function workflowStart(taskName: string, skipPhases?: string, userIntent?: string, taskSize?: string): StartResult {
  // タスク名の検証
  const nameValidation = validateRequiredString(taskName, MISSING_PARAM_ERRORS.TASK_NAME);
  if ('error' in nameValidation) {
    return nameValidation.error as StartResult;
  }

  // ユーザー意図の処理（10000文字まで）
  let processedUserIntent = userIntent;
  if (processedUserIntent && processedUserIntent.length > 10000) {
    processedUserIntent = processedUserIntent.substring(0, 10000);
  }

  // タスクサイズの検証
  const validatedTaskSize = (taskSize && ['small', 'medium', 'large'].includes(taskSize))
    ? taskSize as 'small' | 'medium' | 'large'
    : DEFAULT_TASK_SIZE;

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

  // タスク作成を実行
  return safeExecute('タスク開始', () => {
    const taskState = stateManager.createTask(nameValidation.value, validatedTaskSize);

    // REQ-6: セッショントークン生成
    const sessionToken = generateSessionToken();
    taskState.sessionToken = sessionToken;
    taskState.userIntent = processedUserIntent || nameValidation.value;
    taskState.taskSize = validatedTaskSize;

    // REQ-B4/D-1: スキップフェーズを記録
    if (skipPhaseList.length > 0) {
      taskState.skippedPhases = skipPhaseList;
      taskState.skipReason = 'user-specified';
    }

    // FIX-2: ワークフロー開始時の既存変更ファイルを記録
    let preExistingChanges: string[] = [];
    try {
      const diffOutput = execSync('git -c core.quotePath=false diff --name-only --ignore-submodules HEAD', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      if (diffOutput) {
        preExistingChanges = diffOutput.split('\n').map(f => f.trim()).filter(Boolean);
      }
    } catch (e) {
      console.warn('[workflow_start] git diff failed, preExistingChanges will be empty:', e);
    }

    // scopeオブジェクトにpreExistingChangesを保存
    if (!taskState.scope) {
      taskState.scope = { affectedFiles: [], affectedDirs: [] };
    }
    (taskState.scope as any).preExistingChanges = preExistingChanges;

    stateManager.writeTaskState(taskState.workflowDir, taskState);

    let skipMessage = '';
    if (skipPhaseList.length > 0) {
      skipMessage = `\nSkipped phases: ${skipPhaseList.join(', ')}`;
    }

    const validPhases = PHASES_BY_SIZE[validatedTaskSize] || PHASES_LARGE;

    return {
      success: true,
      taskId: taskState.taskId,
      taskName: taskState.taskName,
      phase: taskState.phase,
      workflowDir: taskState.workflowDir,
      docsDir: taskState.docsDir,
      taskSize: validatedTaskSize,
      userIntent: taskState.userIntent,
      validPhases: validPhases as readonly string[],
      sessionToken,
      message: `タスク「${taskState.taskName}」を開始しました。フェーズ: research、サイズ: ${validatedTaskSize}${skipMessage}`,
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
      userIntent: {
        type: 'string',
        description: 'ユーザーの意図（オプション、10000文字まで）',
      },
      taskSize: {
        type: 'string',
        description: 'タスクサイズ（small/medium/large、デフォルト: large）',
        enum: ['small', 'medium', 'large'],
      },
    },
    required: ['taskName'],
  },
};
