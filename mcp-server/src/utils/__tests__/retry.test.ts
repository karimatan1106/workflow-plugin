/**
 * リトライ機構テスト (retry.ts)
 * @spec docs/workflows/20260117_150655_ワ-クフロ-スキル未実装機能の追加/test-design.md
 *
 * テスト設計書のテストID: RE-001 〜 RE-011, WR-001 〜 WR-020
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

// 実装済みのモジュールをインポート
import { isRetryableError, withRetry } from '../retry.js';

// テスト用のunhandled rejection抑制（fake timersとの組み合わせで発生する既知の問題）
let originalUnhandledRejection: NodeJS.UnhandledRejectionListener | undefined;
beforeAll(() => {
  originalUnhandledRejection = process.listeners('unhandledRejection')[0] as NodeJS.UnhandledRejectionListener | undefined;
  process.removeAllListeners('unhandledRejection');
  process.on('unhandledRejection', (reason) => {
    // テスト用のEBUSYエラーは無視
    if (reason instanceof Error && (reason as NodeJS.ErrnoException).code === 'EBUSY') {
      return;
    }
    // その他のエラーは元のハンドラに委譲
    if (originalUnhandledRejection) {
      originalUnhandledRejection(reason, Promise.reject(reason));
    }
  });
});

afterAll(() => {
  process.removeAllListeners('unhandledRejection');
  if (originalUnhandledRejection) {
    process.on('unhandledRejection', originalUnhandledRejection);
  }
});

/**
 * EBUSYエラーを生成するヘルパー
 */
function createEBUSYError(): NodeJS.ErrnoException {
  const error = new Error('resource busy') as NodeJS.ErrnoException;
  error.code = 'EBUSY';
  return error;
}

/**
 * EAGAINエラーを生成するヘルパー
 */
function createEAGAINError(): NodeJS.ErrnoException {
  const error = new Error('try again') as NodeJS.ErrnoException;
  error.code = 'EAGAIN';
  return error;
}

/**
 * ENOENTエラーを生成するヘルパー
 */
function createENOENTError(): NodeJS.ErrnoException {
  const error = new Error('no such file or directory') as NodeJS.ErrnoException;
  error.code = 'ENOENT';
  return error;
}

/**
 * EACCESエラーを生成するヘルパー
 */
function createEACCESError(): NodeJS.ErrnoException {
  const error = new Error('permission denied') as NodeJS.ErrnoException;
  error.code = 'EACCES';
  return error;
}

/**
 * EPERMエラーを生成するヘルパー
 */
function createEPERMError(): NodeJS.ErrnoException {
  const error = new Error('operation not permitted') as NodeJS.ErrnoException;
  error.code = 'EPERM';
  return error;
}

describe('retry.ts - isRetryableError関数テスト', () => {
  describe('リトライ可能なエラー', () => {
    it('RE-001: EBUSYエラーはリトライ可能', () => {
      const error = createEBUSYError();
      expect(isRetryableError(error)).toBe(true);
    });

    it('RE-002: EAGAINエラーはリトライ可能', () => {
      const error = createEAGAINError();
      expect(isRetryableError(error)).toBe(true);
    });

    it('RE-003: ENOENTエラーはリトライ可能', () => {
      const error = createENOENTError();
      expect(isRetryableError(error)).toBe(true);
    });

    it('RE-004: EACCESエラーはリトライ可能', () => {
      const error = createEACCESError();
      expect(isRetryableError(error)).toBe(true);
    });
  });

  describe('リトライ不可能なエラー', () => {
    it('RE-005: SyntaxErrorはリトライ不可', () => {
      const error = new SyntaxError('Unexpected token');
      expect(isRetryableError(error)).toBe(false);
    });

    it('RE-006: TypeErrorはリトライ不可', () => {
      const error = new TypeError('Cannot read property');
      expect(isRetryableError(error)).toBe(false);
    });

    it('RE-007: 一般的なErrorはリトライ不可', () => {
      const error = new Error('generic error');
      expect(isRetryableError(error)).toBe(false);
    });

    it('RE-008: EPERMエラーはリトライ不可', () => {
      const error = createEPERMError();
      expect(isRetryableError(error)).toBe(false);
    });

    it('RE-009: nullはリトライ不可', () => {
      expect(isRetryableError(null)).toBe(false);
    });

    it('RE-010: undefinedはリトライ不可', () => {
      expect(isRetryableError(undefined)).toBe(false);
    });

    it('RE-011: 文字列エラーはリトライ不可', () => {
      expect(isRetryableError('error string')).toBe(false);
    });
  });
});

describe('retry.ts - withRetry関数テスト', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    // 未処理のタイマーを全て実行してからリアルタイマーに戻す
    await vi.runAllTimersAsync();
    vi.useRealTimers();
  });

  describe('正常系テスト', () => {
    it('WR-001: 1回目で成功時は結果を返す', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      const result = await withRetry(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('WR-002: 戻り値が正しく返される', async () => {
      const operation = vi.fn().mockResolvedValue(42);
      const result = await withRetry(operation);

      expect(result).toBe(42);
    });

    it('WR-003: オブジェクト戻り値も正しく返される', async () => {
      const expected = { a: 1, b: 'test' };
      const operation = vi.fn().mockResolvedValue(expected);
      const result = await withRetry(operation);

      expect(result).toEqual(expected);
    });
  });

  describe('リトライ動作テスト', () => {
    it('WR-004: 1回目失敗、2回目成功でリトライ', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(createEBUSYError())
        .mockResolvedValueOnce('success');

      const resultPromise = withRetry(operation);

      // 最初の失敗後、タイマーを進める
      await vi.advanceTimersByTimeAsync(100);

      const result = await resultPromise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('WR-005: 2回失敗、3回目成功でリトライ', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(createEBUSYError())
        .mockRejectedValueOnce(createEBUSYError())
        .mockResolvedValueOnce('success');

      const resultPromise = withRetry(operation);

      // タイマーを進める（100ms + 200ms）
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(200);

      const result = await resultPromise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('WR-006: 3回失敗、4回目成功でリトライ', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(createEBUSYError())
        .mockRejectedValueOnce(createEBUSYError())
        .mockRejectedValueOnce(createEBUSYError())
        .mockResolvedValueOnce('success');

      const resultPromise = withRetry(operation);

      // タイマーを進める（100ms + 200ms + 400ms）
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(200);
      await vi.advanceTimersByTimeAsync(400);

      const result = await resultPromise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(4);
    });

    it('WR-007: 4回連続失敗で元エラーをスロー', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(createEBUSYError())
        .mockRejectedValueOnce(createEBUSYError())
        .mockRejectedValueOnce(createEBUSYError())
        .mockRejectedValueOnce(createEBUSYError());

      const resultPromise = withRetry(operation);

      // 全リトライ分のタイマーを進める
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(200);
      await vi.advanceTimersByTimeAsync(400);

      await expect(resultPromise).rejects.toThrow('resource busy');
      expect(operation).toHaveBeenCalledTimes(4); // 1回目 + 3回リトライ
    });

    it('WR-008: onRetryコールバックが呼ばれる', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(createEBUSYError())
        .mockResolvedValueOnce('success');
      const onRetry = vi.fn();

      const resultPromise = withRetry(operation, { onRetry });

      await vi.advanceTimersByTimeAsync(100);

      await resultPromise;

      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
    });

    it('WR-009: リトライ回数が正しい', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(createEBUSYError())
        .mockRejectedValueOnce(createEBUSYError())
        .mockResolvedValueOnce('success');
      const onRetry = vi.fn();

      const resultPromise = withRetry(operation, { onRetry });

      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(200);

      await resultPromise;

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Error));
      expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(Error));
    });
  });

  describe('指数バックオフテスト', () => {
    it('WR-010: 初回待機時間は100ms', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(createEBUSYError())
        .mockResolvedValueOnce('success');

      const startTime = Date.now();
      const resultPromise = withRetry(operation);

      // 99msではまだリトライされない
      await vi.advanceTimersByTimeAsync(99);
      expect(operation).toHaveBeenCalledTimes(1);

      // 100msでリトライ
      await vi.advanceTimersByTimeAsync(1);
      await resultPromise;

      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('WR-011: 2回目待機時間は200ms', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(createEBUSYError())
        .mockRejectedValueOnce(createEBUSYError())
        .mockResolvedValueOnce('success');

      const resultPromise = withRetry(operation);

      // 1回目のリトライ（100ms後）
      await vi.advanceTimersByTimeAsync(100);
      expect(operation).toHaveBeenCalledTimes(2);

      // 2回目のリトライは200ms後
      await vi.advanceTimersByTimeAsync(199);
      expect(operation).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(1);
      await resultPromise;

      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('WR-012: 3回目待機時間は400ms', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(createEBUSYError())
        .mockRejectedValueOnce(createEBUSYError())
        .mockRejectedValueOnce(createEBUSYError())
        .mockResolvedValueOnce('success');

      const resultPromise = withRetry(operation);

      await vi.advanceTimersByTimeAsync(100); // 1回目リトライ
      await vi.advanceTimersByTimeAsync(200); // 2回目リトライ

      expect(operation).toHaveBeenCalledTimes(3);

      // 3回目のリトライは400ms後
      await vi.advanceTimersByTimeAsync(399);
      expect(operation).toHaveBeenCalledTimes(3);

      await vi.advanceTimersByTimeAsync(1);
      await resultPromise;

      expect(operation).toHaveBeenCalledTimes(4);
    });

    it('WR-013: カスタム初期待機時間', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(createEBUSYError())
        .mockResolvedValueOnce('success');

      const resultPromise = withRetry(operation, { initialDelayMs: 50 });

      await vi.advanceTimersByTimeAsync(49);
      expect(operation).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      await resultPromise;

      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('WR-014: カスタムバックオフ倍率', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(createEBUSYError())
        .mockRejectedValueOnce(createEBUSYError())
        .mockResolvedValueOnce('success');

      const resultPromise = withRetry(operation, {
        initialDelayMs: 50,
        backoffMultiplier: 3,
      });

      await vi.advanceTimersByTimeAsync(50);  // 1回目リトライ
      expect(operation).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(150); // 50 * 3 = 150ms後
      await resultPromise;

      expect(operation).toHaveBeenCalledTimes(3);
    });
  });

  describe('リトライ不可エラーテスト', () => {
    it('WR-015: SyntaxErrorは即座にスロー', async () => {
      const syntaxError = new SyntaxError('Unexpected token');
      const operation = vi.fn().mockRejectedValue(syntaxError);

      await expect(withRetry(operation)).rejects.toThrow(SyntaxError);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('WR-016: TypeErrorは即座にスロー', async () => {
      const typeError = new TypeError('Cannot read property');
      const operation = vi.fn().mockRejectedValue(typeError);

      await expect(withRetry(operation)).rejects.toThrow(TypeError);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('WR-017: 一般Errorは即座にスロー', async () => {
      const genericError = new Error('generic error');
      const operation = vi.fn().mockRejectedValue(genericError);

      await expect(withRetry(operation)).rejects.toThrow('generic error');
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('オプションテスト', () => {
    it('WR-018: maxRetries=0で即座にエラー', async () => {
      const operation = vi.fn().mockRejectedValueOnce(createEBUSYError());

      await expect(withRetry(operation, { maxRetries: 0 }))
        .rejects.toThrow('resource busy');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('WR-019: maxRetries=5でより多くリトライ', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(createEBUSYError())
        .mockRejectedValueOnce(createEBUSYError())
        .mockRejectedValueOnce(createEBUSYError())
        .mockRejectedValueOnce(createEBUSYError())
        .mockRejectedValueOnce(createEBUSYError())
        .mockRejectedValueOnce(createEBUSYError());

      const resultPromise = withRetry(operation, { maxRetries: 5 });

      // 5回リトライ分のタイマーを進める
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(200);
      await vi.advanceTimersByTimeAsync(400);
      await vi.advanceTimersByTimeAsync(800);
      await vi.advanceTimersByTimeAsync(1600);

      await expect(resultPromise).rejects.toThrow('resource busy');
      expect(operation).toHaveBeenCalledTimes(6); // 1回目 + 5回リトライ
    });

    it('WR-020: オプション未指定でデフォルト使用', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(createEBUSYError())
        .mockRejectedValueOnce(createEBUSYError())
        .mockRejectedValueOnce(createEBUSYError())
        .mockRejectedValueOnce(createEBUSYError());

      const resultPromise = withRetry(operation);

      // デフォルトは maxRetries=3、delay=100
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(200);
      await vi.advanceTimersByTimeAsync(400);

      await expect(resultPromise).rejects.toThrow();
      expect(operation).toHaveBeenCalledTimes(4); // 1回目 + 3回リトライ
    });
  });
});
