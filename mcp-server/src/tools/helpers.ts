/**
 * ツール共通ヘルパー
 *
 * 各ツールで共通して使用される検証・取得ロジックを提供する。
 *
 * @spec docs/specs/domains/workflow/mcp-server.md
 */

import { stateManager } from '../state/manager.js';
import type { ActiveTask, TaskState, ToolResult } from '../state/types.js';
import {
  STATE_ERRORS,
  formatOperationError,
} from '../utils/errors.js';

/**
 * 現在のタスクを取得
 *
 * アクティブなタスクがない場合はエラー結果を返す。
 *
 * @returns タスクまたはエラー結果
 */
export function getCurrentTaskOrError(): { task: ActiveTask } | { error: ToolResult } {
  const currentTask = stateManager.getCurrentTask();
  if (!currentTask) {
    return {
      error: {
        success: false,
        message: STATE_ERRORS.NO_ACTIVE_TASK,
      },
    };
  }
  return { task: currentTask };
}

/**
 * 現在のタスク状態を取得
 *
 * タスクまたはタスク状態が取得できない場合はエラー結果を返す。
 *
 * @returns タスクと状態、またはエラー結果
 */
export function getTaskStateOrError(): { task: ActiveTask; taskState: TaskState } | { error: ToolResult } {
  const taskResult = getCurrentTaskOrError();
  if ('error' in taskResult) {
    return taskResult;
  }

  const taskState = stateManager.readTaskState(taskResult.task.workflowDir);
  if (!taskState) {
    return {
      error: {
        success: false,
        message: STATE_ERRORS.TASK_STATE_NOT_FOUND,
      },
    };
  }

  return { task: taskResult.task, taskState };
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
