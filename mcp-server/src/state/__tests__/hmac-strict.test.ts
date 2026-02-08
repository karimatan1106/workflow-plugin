/**
 * REQ-1: HMAC厳格化テスト
 *
 * HMAC_STRICTのデフォルト動作を検証する。
 * 移行期間終了後の動作をテストする（TDD Red Phase）。
 *
 * 現在の実装は移行期間中のため、これらのテストは一部失敗する。
 * REQ-1実装後に全て成功するようになる。
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateStateHmac, verifyStateHmac, _resetSignatureKeyCache } from '../manager.js';
import type { TaskState } from '../types.js';
import * as fs from 'fs';
import * as path from 'path';

// osモジュールをモック
vi.mock('os', () => ({
  hostname: vi.fn(() => 'test-hostname'),
  userInfo: vi.fn(() => ({ username: 'test-user' })),
}));

// 環境変数の元の値を保存
const originalEnv = { ...process.env };

/**
 * テスト用のタスク状態を作成
 */
function createTestTaskState(): TaskState {
  return {
    phase: 'research',
    taskId: '20260208_120000',
    taskName: 'テストタスク',
    workflowDir: '/test/workflow',
    docsDir: '/test/docs',
    startedAt: new Date().toISOString(),
    checklist: {},
    history: [],
    subPhases: {},
    taskSize: 'large',
  };
}

describe('REQ-1: HMAC厳格化テスト', () => {
  beforeEach(() => {
    // 環境変数をリセット
    process.env = { ...originalEnv };
    delete process.env.HMAC_STRICT;

    // キャッシュをリセット
    _resetSignatureKeyCache();
  });

  afterEach(() => {
    // 環境変数を元に戻す
    process.env = { ...originalEnv };
    _resetSignatureKeyCache();
  });

  describe('TC-1-1: HMAC_STRICT未設定(デフォルト)で署名なし状態ファイル', () => {
    test('verifyStateHmac()がfalseを返す（REQ-1実装済み）', () => {
      const state = createTestTaskState();
      const emptyHmac = '';

      // REQ-1実装済み: HMAC_STRICT=true がデフォルトになったため false を返す
      const result = verifyStateHmac(state, emptyHmac);

      expect(result).toBe(false); // REQ-1実装済み
    });
  });

  describe('TC-1-2: HMAC_STRICT未設定で署名不一致', () => {
    test('verifyStateHmac()がfalseを返す（REQ-1実装済み）', () => {
      const state = createTestTaskState();
      const validHmac = generateStateHmac(state);

      // 異なる状態で署名を生成（不一致）
      const modifiedState = { ...state, taskName: '改ざんされたタスク' };
      const invalidHmac = generateStateHmac(modifiedState);

      // 元の状態と異なる署名で検証
      const result = verifyStateHmac(state, invalidHmac);

      expect(result).toBe(false); // REQ-1実装済み
    });
  });

  describe('TC-1-3: HMAC_STRICT=falseで署名なし', () => {
    test('verifyStateHmac()がtrueを返す（互換モード）', () => {
      process.env.HMAC_STRICT = 'false';

      const state = createTestTaskState();
      const emptyHmac = '';

      // HMAC_STRICT=false の場合は署名なしでも許可
      const result = verifyStateHmac(state, emptyHmac);

      expect(result).toBe(true);
    });
  });

  describe('TC-1-4: 正常な署名', () => {
    test('verifyStateHmac()がtrueを返す', () => {
      const state = createTestTaskState();
      const validHmac = generateStateHmac(state);

      // 正しい署名で検証
      const result = verifyStateHmac(state, validHmac);

      expect(result).toBe(true);
    });
  });

  describe('TC-1-5: Base64不正値でエラー発生', () => {
    test('verifyStateHmac()がfalseを返す（REQ-1実装済み）', () => {
      const state = createTestTaskState();
      const invalidBase64 = 'これは不正なBase64文字列です!!!';

      // 不正なBase64文字列で検証
      const result = verifyStateHmac(state, invalidBase64);

      expect(result).toBe(false); // REQ-1実装済み
    });
  });

  describe('TC-1-6: generateStateHmac()が一貫した署名を生成', () => {
    test('同じ状態に対して同じ署名を生成する', () => {
      const state = createTestTaskState();

      const hmac1 = generateStateHmac(state);
      const hmac2 = generateStateHmac(state);

      expect(hmac1).toBe(hmac2);
      expect(hmac1).toMatch(/^[A-Za-z0-9+/]+=*$/); // Base64形式
    });
  });

  describe('TC-1-7: stateIntegrityフィールドは署名計算から除外', () => {
    test('stateIntegrityの有無で署名が変わらない', () => {
      const state = createTestTaskState();

      // stateIntegrityなしの状態で署名生成
      const hmacWithout = generateStateHmac(state);

      // stateIntegrityありの状態で署名生成（generateStateHmacは除外するはず）
      const stateWithIntegrity = { ...state, stateIntegrity: 'dummy-signature' };
      const hmacWith = generateStateHmac(stateWithIntegrity);

      // stateIntegrityフィールドは署名計算から除外されるため同じ署名になる
      expect(hmacWith).toBe(hmacWithout);
    });
  });

  describe('TC-1-8: HMAC_STRICT=trueで署名なし', () => {
    test('verifyStateHmac()がfalseを返す', () => {
      process.env.HMAC_STRICT = 'true';

      const state = createTestTaskState();
      const emptyHmac = '';

      // HMAC_STRICT=true の場合は署名なしを拒否
      const result = verifyStateHmac(state, emptyHmac);

      expect(result).toBe(false); // REQ-1実装済み
    });
  });
});
