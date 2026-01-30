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
 * 非同期操作を安全に実行し、エラーをキャッチしてToolResult形式で返す
 *
 * @param operation 操作名（エラーメッセージ用）
 * @param fn 実行する非同期関数
 * @returns 操作結果のPromise
 */
export async function safeExecuteAsync<T extends ToolResult>(
  operation: string,
  fn: () => Promise<T>,
): Promise<T | ToolResult> {
  try {
    return await fn();
  } catch (error) {
    return {
      success: false,
      message: formatOperationError(operation, error),
    };
  }
}
