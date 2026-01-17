/**
 * リトライ機構
 *
 * ファイルシステム操作などで発生する一時的なエラー（EBUSY, EAGAIN等）に対して
 * 指数バックオフでリトライを行う。
 *
 * @spec docs/specs/domains/workflow/mcp-server.md
 */

// ============================================================================
// 定数
// ============================================================================

/**
 * リトライ可能なエラーコード
 *
 * - EBUSY: リソースがビジー状態
 * - EAGAIN: リソースが一時的に利用不可
 * - ENOENT: ファイルが見つからない（一時的な場合あり）
 * - EACCES: アクセス権エラー（ロック時に発生することがある）
 */
const RETRYABLE_ERROR_CODES = ['EBUSY', 'EAGAIN', 'ENOENT', 'EACCES'] as const;

// ============================================================================
// 型定義
// ============================================================================

/**
 * リトライオプション
 */
export interface RetryOptions {
  /** 最大リトライ回数（デフォルト: 3） */
  maxRetries?: number;
  /** 初回待機時間（ミリ秒、デフォルト: 100） */
  initialDelayMs?: number;
  /** バックオフ倍率（デフォルト: 2） */
  backoffMultiplier?: number;
  /** リトライ時コールバック */
  onRetry?: (attempt: number, error: Error) => void;
}

/** デフォルトのリトライオプション */
const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'onRetry'>> = {
  maxRetries: 3,
  initialDelayMs: 100,
  backoffMultiplier: 2,
};

// ============================================================================
// リトライ判定関数
// ============================================================================

/**
 * エラーがリトライ可能かどうかを判定
 *
 * リトライ可能なエラーの条件:
 * 1. Errorインスタンスである
 * 2. SyntaxError, TypeErrorではない
 * 3. NodeJS.ErrnoExceptionで、コードがリトライ可能なコードに含まれる
 *
 * @param error 判定するエラー
 * @returns リトライ可能であればtrue
 */
export function isRetryableError(error: unknown): boolean {
  // null/undefined はリトライ不可
  if (error === null || error === undefined) {
    return false;
  }

  // 文字列エラーはリトライ不可
  if (typeof error === 'string') {
    return false;
  }

  // Errorオブジェクトでない場合はリトライ不可
  if (!(error instanceof Error)) {
    return false;
  }

  // SyntaxError, TypeError などはリトライしない
  if (error instanceof SyntaxError || error instanceof TypeError) {
    return false;
  }

  // NodeJS.ErrnoException の場合、コードを確認
  const errnoError = error as NodeJS.ErrnoException;
  if (errnoError.code && typeof errnoError.code === 'string') {
    return (RETRYABLE_ERROR_CODES as readonly string[]).includes(errnoError.code);
  }

  // コードがない一般的なエラーはリトライ不可
  return false;
}

// ============================================================================
// リトライ実行関数
// ============================================================================

/**
 * 指定された操作を指数バックオフでリトライする
 *
 * 使用例:
 * ```typescript
 * const result = await withRetry(
 *   () => fs.promises.readFile(path),
 *   { maxRetries: 5, onRetry: (attempt, err) => console.log(`Retry ${attempt}`) }
 * );
 * ```
 *
 * @param operation リトライする非同期操作
 * @param options リトライオプション
 * @returns 操作の結果
 * @throws 最大リトライ回数を超えた場合、またはリトライ不可能なエラーの場合
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = DEFAULT_RETRY_OPTIONS.maxRetries,
    initialDelayMs = DEFAULT_RETRY_OPTIONS.initialDelayMs,
    backoffMultiplier = DEFAULT_RETRY_OPTIONS.backoffMultiplier,
    onRetry,
  } = options;

  let lastError: Error | undefined;
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // 最後の試行でなければリトライを検討
      if (attempt < maxRetries) {
        // リトライ可能なエラーかチェック
        if (!isRetryableError(error)) {
          throw lastError;
        }

        // リトライコールバックを呼び出し
        if (onRetry) {
          onRetry(attempt + 1, lastError);
        }

        // 指数バックオフで待機
        await sleep(delay);
        delay *= backoffMultiplier;
      }
    }
  }

  // 最大リトライ回数を超えた
  throw lastError;
}

/**
 * 指定ミリ秒待機する
 *
 * @param ms 待機時間（ミリ秒）
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
