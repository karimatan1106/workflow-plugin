/**
 * REQ-9: splitCompoundCommand() セミコロンテスト
 *
 * @spec docs/workflows/評価レポート全課題解決/test-design.md
 *
 * 対象関数: splitCompoundCommand() (bash-whitelist.js)
 * 目的: JS内セミコロンがBash区切りとして誤解析されないことを検証
 * TDDフェーズ: Red（テストは失敗する予定）
 */

import { describe, it, expect } from 'vitest';

// CommonJSモジュールのインポート
// splitCompoundCommandはexportされていない可能性があるため、
// checkBashWhitelistの動作を通じて間接的にテスト
const { checkBashWhitelist } = require('../../../hooks/bash-whitelist');

describe('REQ-9: splitCompoundCommand() セミコロン処理', () => {
  describe('TC-9-1: node -e内セミコロン1コマンド', () => {
    it('should treat node -e with semicolons as single command', () => {
      // REQ-9: クォート内のセミコロンは分割対象外
      const command = 'node -e "var a=1;console.log(a)"';
      const result = checkBashWhitelist(command, 'research');

      // 期待: allowed=true（1つのコマンドとして処理）
      // 現在は2つに分割されてエラーになる可能性がある
      expect(result.allowed).toBe(true);
    });
  });

  describe('TC-9-2: node -e外セミコロン正常分割', () => {
    it('should split commands with && correctly', () => {
      // REQ-9: クォート外のセミコロン・&&は分割対象
      const command = 'node -e "var a=1;console.log(a)" && echo done';
      const result = checkBashWhitelist(command, 'research');

      // 期待: allowed=true（各コマンドが個別にチェックされる）
      expect(result.allowed).toBe(true);
    });
  });

  describe('TC-9-3: python -c内セミコロン1コマンド', () => {
    it('should treat python -c with semicolons as single command', () => {
      // REQ-9: Python版も同様
      const command = 'python -c "a=1;print(a)"';
      const result = checkBashWhitelist(command, 'research');

      // 期待: allowed=false（pythonはブラックリスト）
      // ただし、1コマンドとして処理されることを確認
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('禁止');
    });
  });

  describe('TC-9-4: 通常のセミコロン分割', () => {
    it('should split normal semicolon-separated commands', () => {
      // REQ-9: クォートなしのセミコロンは分割
      const command = 'ls; pwd';
      const result = checkBashWhitelist(command, 'research');

      // 期待: allowed=true（各コマンドが個別にチェックされる）
      expect(result.allowed).toBe(true);
    });
  });

  describe('TC-9-5: シングルクォート正しく処理', () => {
    it('should handle single quotes correctly', () => {
      // REQ-9: シングルクォート内のセミコロンも保護
      const command = "node -e 'var a=1;console.log(a)'";
      const result = checkBashWhitelist(command, 'research');

      // 期待: allowed=true
      expect(result.allowed).toBe(true);
    });
  });
});
