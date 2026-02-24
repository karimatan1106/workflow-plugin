/**
 * lock-utils テスト - atomicWriteJson の動作検証
 *
 * @spec docs/spec/features/lock-utils.md
 *
 * テスト対象: atomicWriteJson 関数
 * - 正常系: 一時ファイル書き込み後に rename が成功するケース
 * - リトライ系: EPERM / EBUSY エラー後にリトライして成功するケース
 * - 失敗系: リトライ上限に達して例外をスローするケース
 * - 即時スロー系: リトライ不要のエラー（ENOENT）で即時スローするケース
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';

// fs モジュールをモックして各関数の動作を制御する
vi.mock('fs', () => ({
  writeFileSync: vi.fn(),
  renameSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

// lock-utils を動的インポート（fs モック後にインポートする必要がある）
const importLockUtils = async () => {
  const module = await import('../lock-utils.js');
  return module;
};

describe('atomicWriteJson', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Atomics.wait をモックして sleepSync を即時リターンさせる
    vi.spyOn(Atomics, 'wait').mockReturnValue('ok' as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // TC-05: 正常系 - renameSync が1回で成功する
  it('TC-05: 正常系 - writeFileSync と renameSync が各1回呼ばれ、例外なく完了する', async () => {
    const { atomicWriteJson } = await importLockUtils();

    // renameSync は何もせずに成功（デフォルト動作）
    vi.mocked(fs.renameSync).mockImplementation(() => undefined);

    const testData = { key: 'value', num: 42 };
    expect(() => atomicWriteJson('/test/output.json', testData)).not.toThrow();

    // writeFileSync が1回呼ばれたことを確認
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    // renameSync が1回呼ばれたことを確認（リトライなし）
    expect(fs.renameSync).toHaveBeenCalledTimes(1);
    // 正常成功なので Atomics.wait は呼ばれないことを確認
    expect(Atomics.wait).not.toHaveBeenCalled();
  });

  // TC-01: EPERM リトライ成功 - 1回目 EPERM、2回目成功
  it('TC-01: EPERM リトライ成功 - 1回目に EPERM が発生し、2回目の rename で成功する', async () => {
    const { atomicWriteJson } = await importLockUtils();

    const epermError = Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
    let renameCallCount = 0;
    vi.mocked(fs.renameSync).mockImplementation(() => {
      renameCallCount++;
      if (renameCallCount === 1) {
        throw epermError;
      }
      // 2回目以降は何もせずに成功
    });

    expect(() => atomicWriteJson('/test/output.json', { data: 'test' })).not.toThrow();

    // renameSync が2回呼ばれたことを確認（初回失敗 + 1回リトライ）
    expect(fs.renameSync).toHaveBeenCalledTimes(2);
    // sleepSync が1回呼ばれたことを確認（リトライ前に待機）
    expect(Atomics.wait).toHaveBeenCalledTimes(1);
  });

  // TC-02: EBUSY リトライ成功 - 1回目 EBUSY、2回目成功
  it('TC-02: EBUSY リトライ成功 - 1回目に EBUSY が発生し、2回目の rename で成功する', async () => {
    const { atomicWriteJson } = await importLockUtils();

    const ebusyError = Object.assign(new Error('resource busy'), { code: 'EBUSY' });
    let renameCallCount = 0;
    vi.mocked(fs.renameSync).mockImplementation(() => {
      renameCallCount++;
      if (renameCallCount === 1) {
        throw ebusyError;
      }
      // 2回目以降は何もせずに成功
    });

    expect(() => atomicWriteJson('/test/output.json', { busy: true })).not.toThrow();

    // renameSync が2回呼ばれたことを確認（初回失敗 + 1回リトライ）
    expect(fs.renameSync).toHaveBeenCalledTimes(2);
    // sleepSync が1回呼ばれたことを確認（リトライ前に待機）
    expect(Atomics.wait).toHaveBeenCalledTimes(1);
  });

  // TC-03: 全リトライ失敗 - 4回全て EPERM でリトライ上限に達する
  it('TC-03: 全リトライ失敗 - maxRetries=3 を超えて全リトライが失敗し、EPERM 例外がスローされる', async () => {
    const { atomicWriteJson } = await importLockUtils();

    const epermError = Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
    // 全ての rename 呼び出しで EPERM をスロー
    vi.mocked(fs.renameSync).mockImplementation(() => {
      throw epermError;
    });

    expect(() => atomicWriteJson('/test/output.json', { fail: true })).toThrow();

    // renameSync が4回呼ばれたことを確認（初回 attempt=0 + 3回リトライ attempt=1,2,3）
    expect(fs.renameSync).toHaveBeenCalledTimes(4);
    // sleepSync が3回呼ばれたことを確認（各リトライ前に待機: attempt=0,1,2）
    expect(Atomics.wait).toHaveBeenCalledTimes(3);
    // 一時ファイルのクリーンアップが試みられたことを確認
    expect(fs.unlinkSync).toHaveBeenCalled();
  });

  // TC-04: ENOENT 即時スロー - リトライ不要エラーは即時スローする
  it('TC-04: ENOENT 即時スロー - ENOENT エラー発生時はリトライせず即時例外をスローする', async () => {
    const { atomicWriteJson } = await importLockUtils();

    const enoentError = Object.assign(new Error('no such file or directory'), { code: 'ENOENT' });
    vi.mocked(fs.renameSync).mockImplementation(() => {
      throw enoentError;
    });

    expect(() => atomicWriteJson('/test/output.json', { missing: true })).toThrow('no such file or directory');

    // renameSync が1回だけ呼ばれたことを確認（リトライなし）
    expect(fs.renameSync).toHaveBeenCalledTimes(1);
    // ENOENT はリトライしないので Atomics.wait は呼ばれないことを確認
    expect(Atomics.wait).not.toHaveBeenCalled();
    // 一時ファイルのクリーンアップが試みられたことを確認
    expect(fs.unlinkSync).toHaveBeenCalled();
  });
});
