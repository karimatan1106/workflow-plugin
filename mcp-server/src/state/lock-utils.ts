/**
 * ファイルロックユーティリティ（FR-1: State File Locking）
 *
 * シンプルなファイルベースのロック機構を提供する。
 * proper-lockfile パッケージを使用せず、標準のfsモジュールのみで実装。
 *
 * @spec docs/spec/features/lock-utils.md
 */

import * as fs from 'fs';

interface LockOptions {
  timeout?: number; // ms, default 5000
  retries?: number; // default 3
  staleTimeout?: number; // ms, default 10000
}

/**
 * ファイルロックを取得
 *
 * .lockファイルを使用してロックを実装する。
 * ロックファイルの作成にはO_EXCLフラグを使用し、排他制御を行う。
 *
 * @param filePath ロック対象のファイルパス
 * @param options ロックオプション
 * @returns ロック解放関数
 * @throws ロック取得に失敗した場合
 */
export async function acquireLock(filePath: string, options?: LockOptions): Promise<() => void> {
  const lockFile = filePath + '.lock';
  const timeout = options?.timeout ?? 5000;
  const retries = options?.retries ?? 3;
  const staleTimeout = options?.staleTimeout ?? 10000;

  const startTime = Date.now();
  let attempt = 0;

  while (attempt < retries) {
    try {
      // Try to create lock file exclusively (O_EXCL = fail if exists)
      const fd = fs.openSync(lockFile, 'wx');
      const lockData = JSON.stringify({
        pid: process.pid,
        timestamp: Date.now(),
        file: filePath,
      });
      fs.writeSync(fd, lockData);
      fs.closeSync(fd);

      logLockEvent('ACQUIRED', filePath);

      // Return release function
      return () => {
        try {
          fs.unlinkSync(lockFile);
          logLockEvent('RELEASED', filePath);
        } catch (error) {
          // Lock file may have been removed already
          console.warn(`[Lock] ロック解放時の警告: ${lockFile}`, error);
        }
      };
    } catch (error: any) {
      if (error.code === 'EEXIST') {
        // Lock file exists - check if stale
        try {
          const lockContent = fs.readFileSync(lockFile, 'utf-8');
          const lockData = JSON.parse(lockContent);
          const lockAge = Date.now() - lockData.timestamp;

          if (lockAge > staleTimeout) {
            // Stale lock - remove and retry
            logLockEvent('STALE', filePath);
            fs.unlinkSync(lockFile);
            continue;
          }
        } catch {
          // Invalid lock file - remove and retry
          try {
            fs.unlinkSync(lockFile);
          } catch {}
          continue;
        }

        // Lock is valid - wait and retry
        attempt++;
        if (attempt >= retries || Date.now() - startTime > timeout) {
          logLockEvent('FAILED', filePath);
          throw new Error(`ロック取得タイムアウト: ${filePath} (${attempt}回リトライ)`);
        }

        // Exponential backoff
        const backoff = Math.min(1000, 100 * Math.pow(2, attempt - 1));
        await new Promise((resolve) => setTimeout(resolve, backoff));
      } else {
        // Other error
        logLockEvent('FAILED', filePath);
        throw error;
      }
    }
  }

  logLockEvent('FAILED', filePath);
  throw new Error(`ロック取得失敗: ${filePath} (最大リトライ数: ${retries})`);
}

/**
 * 同期的に指定ミリ秒待機する
 *
 * Atomics.wait を使用してスレッドをブロックする同期スリープ実装。
 * テスト環境では Atomics.wait をモックすることで即時リターンさせることができる。
 *
 * @param ms 待機時間（ミリ秒）
 */
function sleepSync(ms: number): void {
  const sharedBuffer = new SharedArrayBuffer(4);
  const arr = new Int32Array(sharedBuffer);
  Atomics.wait(arr, 0, 0, ms);
}

/**
 * アトミックなJSONファイル書き込み
 *
 * 一時ファイルに書き込んでから rename することで、
 * 書き込み中のファイル破損を防ぐ。
 * EPERM または EBUSY エラーが発生した場合は最大3回リトライする。
 *
 * @param filePath ファイルパス
 * @param data 書き込むデータ
 */
export function atomicWriteJson<T>(filePath: string, data: T): void {
  const tmpFile = `${filePath}.tmp.${process.pid}`;
  const maxRetries = 3;
  let lastError: unknown;

  try {
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    throw error;
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      fs.renameSync(tmpFile, filePath);
      return;
    } catch (error: any) {
      lastError = error;
      if (error.code === 'EPERM' || error.code === 'EBUSY') {
        if (attempt < maxRetries) {
          sleepSync(100);
          continue;
        }
      } else {
        // Non-retryable error: clean up temp file and throw immediately
        try {
          fs.unlinkSync(tmpFile);
        } catch {}
        throw error;
      }
    }
  }

  // All retries exhausted: clean up temp file and throw the last error
  try {
    fs.unlinkSync(tmpFile);
  } catch {}
  throw lastError;
}

/**
 * ロックイベントをログ出力
 *
 * 監査用にロック取得・解放・失敗をログに記録する。
 *
 * @param event イベント種別
 * @param filePath ファイルパス
 */
export function logLockEvent(
  event: 'ACQUIRED' | 'RELEASED' | 'FAILED' | 'STALE',
  filePath: string,
): void {
  const timestamp = new Date().toISOString();
  const pid = process.pid;
  console.log(`[Lock] [${timestamp}] ${event} - ${filePath} (PID: ${pid})`);
}
