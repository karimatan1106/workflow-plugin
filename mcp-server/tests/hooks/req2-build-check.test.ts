/**
 * REQ-2: checkBashWhitelist() build_check制限テスト
 *
 * @spec docs/workflows/評価レポート全課題解決/test-design.md
 *
 * 対象関数: checkBashWhitelist() (bash-whitelist.js)
 * 目的: build_checkフェーズでブラックリストチェック実行を検証
 * TDDフェーズ: Red（テストは失敗する予定）
 */

import { describe, it, expect } from 'vitest';

// CommonJSモジュールのインポート
const { checkBashWhitelist } = require('../../../hooks/bash-whitelist');

describe('REQ-2: checkBashWhitelist() build_check制限', () => {
  describe('TC-2-1: npm run build許可', () => {
    it('should allow npm run build in build_check phase', () => {
      // REQ-2: ビルドコマンドは許可
      const result = checkBashWhitelist('npm run build', 'build_check');

      // 期待: allowed=true
      expect(result.allowed).toBe(true);
    });
  });

  describe('TC-2-2: rm -rfブロック', () => {
    it('should block rm -rf in build_check phase', () => {
      // REQ-2: ブラックリストコマンドは全フェーズでブロック
      const result = checkBashWhitelist('rm -rf /', 'build_check');

      // 期待: allowed=false（現在はtrueなので失敗する）
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('禁止');
    });
  });

  describe('TC-2-3: evalブロック', () => {
    it('should block eval in build_check phase', () => {
      // REQ-2: evalは危険なのでブロック
      const result = checkBashWhitelist('eval "malicious"', 'build_check');

      // 期待: allowed=false（現在はtrueなので失敗する）
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('禁止');
    });
  });

  describe('TC-2-4: npx tsc許可', () => {
    it('should allow npx tsc in build_check phase', () => {
      // REQ-2: TypeScriptコンパイラは許可
      const result = checkBashWhitelist('npx tsc', 'build_check');

      // 期待: allowed=true
      expect(result.allowed).toBe(true);
    });
  });

  describe('TC-2-5: python3ブロック', () => {
    it('should block python3 in build_check phase', () => {
      // REQ-2: pythonスクリプトはブラックリストでブロック
      const result = checkBashWhitelist('python3 script.py', 'build_check');

      // 期待: allowed=false（現在はtrueなので失敗する）
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('禁止');
    });
  });
});
