/**
 * ツール共通ヘルパー
 *
 * 各ツールで共通して使用される検証・取得ロジックを提供する。
 *
 * @spec docs/workflows/ワ-クフロ-並列タスク対応/spec.md
 */

import { stateManager } from '../state/manager.js';
import type { TaskState, ToolResult } from '../state/types.js';
import { formatOperationError } from '../utils/errors.js';
import { auditLogger } from '../audit/logger.js';

// 注: getCurrentTaskOrError と getTaskStateOrError は削除されました。
// 並列タスク対応により、明示的なtaskId指定ベースの getTaskByIdOrError を使用してください。
// @see docs/workflows/ワ-クフロ-並列タスク対応/spec.md

/**
 * taskIdでタスクを取得
 *
 * taskIdが指定されていない場合やタスクが見つからない場合はエラー結果を返す。
 *
 * @param taskId タスクID
 * @returns タスク状態、またはエラー結果
 */
export function getTaskByIdOrError(taskId: string | undefined): { taskState: TaskState } | { error: ToolResult } {
  // taskId必須チェック
  if (!taskId || taskId.trim() === '') {
    return {
      error: {
        success: false,
        error: 'TASK_ID_REQUIRED',
        message: 'taskIdは必須です',
      },
    };
  }

  // タスク検索
  const taskState = stateManager.getTaskById(taskId.trim());
  if (!taskState) {
    return {
      error: {
        success: false,
        error: 'TASK_NOT_FOUND',
        message: `指定されたタスクが見つかりません: ${taskId}`,
      },
    };
  }

  return { taskState };
}

/**
 * 必須文字列パラメータを検証
 *
 * @param value 検証する値
 * @param errorMessage エラーメッセージ
 * @returns 検証結果（成功時はtrimされた値）
 */
export function validateRequiredString(
  value: string | undefined,
  errorMessage: string,
): { value: string } | { error: ToolResult } {
  if (!value || value.trim() === '') {
    return {
      error: {
        success: false,
        message: errorMessage,
      },
    };
  }
  return { value: value.trim() };
}

/**
 * 操作を安全に実行し、エラーをキャッチしてToolResult形式で返す
 *
 * @param operation 操作名（エラーメッセージ用）
 * @param fn 実行する関数
 * @returns 操作結果
 */
export function safeExecute<T extends ToolResult>(
  operation: string,
  fn: () => T,
): T | ToolResult {
  try {
    return fn();
  } catch (error) {
    return {
      success: false,
      message: formatOperationError(operation, error),
    };
  }
}

/**
 * REQ-6/FR-10: Verify session token for state-changing tools
 *
 * @param taskState タスク状態
 * @param sessionToken セッショントークン（オプション）
 * @returns エラーの場合はToolResult、成功の場合はnull
 */
export function verifySessionToken(
  taskState: TaskState,
  sessionToken?: string
): ToolResult | null {
  const tokenRequired = process.env.SESSION_TOKEN_REQUIRED !== 'false';

  if (!tokenRequired) {
    auditLogger.log({
      event: 'bypass_enabled',
      variable: 'SESSION_TOKEN_REQUIRED',
      taskId: taskState.taskId,
      phase: taskState.phase,
    });
    return null; // bypass
  }

  if (taskState.sessionToken) {
    if (!sessionToken) {
      return {
        success: false,
        message: 'sessionTokenが必要です。このAPIはOrchestratorのみ実行可能です。',
      };
    }
    if (sessionToken !== taskState.sessionToken) {
      return {
        success: false,
        message: 'sessionTokenが無効です。',
      };
    }
  } else {
    console.warn('[verifySessionToken] 既存タスク（sessionTokenなし）- 警告のみ');
  }

  return null; // success
}

/**
 * C-3: フェーズ開始時刻をタスク履歴から取得
 *
 * taskState.historyから指定フェーズの最新開始時刻を逆順検索で取得する。
 *
 * @param history タスクの履歴エントリ配列
 * @param phaseName 検索するフェーズ名
 * @returns ISO 8601形式のタイムスタンプ、または見つからない場合はnull
 */
export function getPhaseStartedAt(
  history: Array<{ phase: string; action: string; timestamp: string }> | undefined,
  phaseName: string
): string | null {
  if (!history || history.length === 0) {
    return null;
  }

  // 逆順で検索（最新のエントリを優先）
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (entry.phase === phaseName && entry.action === 'phase_start') {
      return entry.timestamp;
    }
  }

  return null;
}

