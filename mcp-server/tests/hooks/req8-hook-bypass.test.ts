/**
 * REQ-8: analyzeBashCommand() hook矛盾解消テスト
 *
 * @spec docs/workflows/評価レポート全課題解決/test-design.md
 *
 * 対象関数: analyzeBashCommand() (phase-edit-guard.js)
 * 目的: bash-whitelistで許可されたコマンドがisExplicitlyAllowed=trueを返すことを検証
 * TDDフェーズ: Red（テストは失敗する予定）
 */

import { describe, it, expect } from 'vitest';

// CommonJSモジュールのインポート
const phaseEditGuard = require('../../../hooks/phase-edit-guard');
const { checkBashWhitelist } = require('../../../hooks/bash-whitelist');

describe('REQ-8: analyzeBashCommand() hook矛盾解消', () => {
  describe('TC-8-1: bash-whitelist許可でバイパス', () => {
    it('should return isExplicitlyAllowed=true for whitelisted command', () => {
      // REQ-8: bash-whitelistで許可されたコマンドはバイパス
      const command = 'node -e "console.log(1)"';
      const analysis = phaseEditGuard.analyzeBashCommand(command);

      // 期待: isExplicitlyAllowed=true（現在未実装なので失敗する）
      expect(analysis).toHaveProperty('isExplicitlyAllowed');
      expect(analysis.isExplicitlyAllowed).toBe(true);
    });
  });

  describe('TC-8-2: checkBashWhitelistがallowed=true', () => {
    it('should confirm node -e is allowed in bash-whitelist', () => {
      // REQ-8: bash-whitelistの動作確認
      const result = checkBashWhitelist('node -e "console.log(1)"', 'research');

      // 期待: allowed=true
      expect(result.allowed).toBe(true);
    });
  });

  describe('TC-8-3: FILE_MODIFYING_CHECKスキップ', () => {
    it('should skip file modifying check for whitelisted command', () => {
      // REQ-8: ホワイトリスト許可の場合、FILE_MODIFYING_CHECKをスキップ
      const command = 'ls -la';
      const analysis = phaseEditGuard.analyzeBashCommand(command);

      // 期待: isModifying=false, filePath=null
      expect(analysis.isModifying).toBe(false);
      expect(analysis.filePath).toBeNull();
    });
  });
});
