/**
 * エラーハンドリング共通関数
 *
 * ワークフローツール全体で統一されたエラーメッセージ形式を提供する。
 * @spec docs/specs/domains/workflow/mcp-server.md
 */

/**
 * エラーオブジェクトからメッセージを安全に抽出する
 *
 * @param error 任意のエラーオブジェクト
 * @returns エラーメッセージ文字列
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * 操作失敗時の標準エラーメッセージを生成する
 *
 * @param operation 失敗した操作名（例: 'タスク開始', 'フェーズ遷移'）
 * @param error エラーオブジェクト
 * @returns フォーマットされたエラーメッセージ
 */
export function formatOperationError(operation: string, error: unknown): string {
  return `${operation}に失敗しました: ${extractErrorMessage(error)}`;
}

/**
 * 必須パラメータが欠落している場合のエラーメッセージ
 */
export const MISSING_PARAM_ERRORS = {
  /** タスク名が未指定 */
  TASK_NAME: 'タスク名を指定してください',
  /** タスクIDが未指定 */
  TASK_ID: 'タスクIDを指定してください',
  /** 承認タイプが未指定 */
  APPROVE_TYPE: '承認タイプを指定してください（有効: design）',
  /** サブフェーズ名が未指定 */
  SUB_PHASE: 'サブフェーズ名を指定してください',
} as const;

/**
 * 状態エラーメッセージ
 */
export const STATE_ERRORS = {
  /** アクティブなタスクがない */
  NO_ACTIVE_TASK: '進行中のタスクがありません',
  /** アクティブなタスクがない（別バリエーション） */
  NO_TASK: 'アクティブなタスクがありません',
  /** タスク状態ファイルが見つからない */
  TASK_STATE_NOT_FOUND: 'タスク状態ファイルが見つかりません',
  /** タスクが既に完了 */
  TASK_ALREADY_COMPLETED: 'タスクは既に完了しています',
  /** これ以上進めない */
  CANNOT_PROCEED: 'これ以上進めません',
} as const;

/**
 * タスクが見つからない場合のエラーメッセージを生成
 *
 * @param taskId 見つからなかったタスクID
 * @returns フォーマットされたエラーメッセージ
 */
export function taskNotFoundError(taskId: string): string {
  return `タスクが見つかりません: ${taskId}`;
}

/**
 * 無効な値のエラーメッセージを生成
 *
 * @param paramName パラメータ名
 * @param value 無効な値
 * @param validValues 有効な値のリスト
 * @returns フォーマットされたエラーメッセージ
 */
export function invalidValueError(
  paramName: string,
  value: string,
  validValues: readonly string[] | string[],
): string {
  return `無効な${paramName}です: ${value}。有効な値: ${validValues.join(', ')}`;
}

/**
 * フェーズ不一致エラーメッセージを生成
 *
 * @param expectedPhase 期待されるフェーズ
 * @param currentPhase 現在のフェーズ
 * @returns フォーマットされたエラーメッセージ
 */
export function phaseNotMatchError(expectedPhase: string, currentPhase: string): string {
  return `${expectedPhase}フェーズでのみ実行可能です（現在: ${currentPhase}）`;
}
