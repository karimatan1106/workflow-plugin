/**
 * REQ-1: canEditInPhase() fail-closed テスト
 *
 * @spec docs/workflows/評価レポート全課題解決/test-design.md
 *
 * 対象関数: canEditInPhase() (phase-edit-guard.js)
 * 目的: 未知フェーズでfail-closedの動作検証（false返却）
 * TDDフェーズ: Red（テストは失敗する予定）
 */

import { describe, it, expect } from 'vitest';

// CommonJSモジュールのインポート
const phaseEditGuard = require('../../../hooks/phase-edit-guard');

describe('REQ-1: canEditInPhase() fail-closed', () => {
  describe('TC-1-1: 未知フェーズでfalseを返す', () => {
    it('should return false for unknown_phase with code fileType', () => {
      // REQ-1: 未知フェーズはfail-closedでブロック
      const result = phaseEditGuard.canEditInPhase('unknown_phase', 'code');

      // 期待: false（現在はtrueを返すので失敗する）
      expect(result).toBe(false);
    });
  });

  describe('TC-1-2: phaseがnullでfalseを返す', () => {
    it('should return false when phase is null', () => {
      // REQ-1: null/undefinedはfail-closedでブロック
      const result = phaseEditGuard.canEditInPhase(null, 'code');

      // 期待: false
      expect(result).toBe(false);
    });
  });

  describe('TC-1-3: phaseがundefinedでfalseを返す', () => {
    it('should return false when phase is undefined', () => {
      // REQ-1: null/undefinedはfail-closedでブロック
      const result = phaseEditGuard.canEditInPhase(undefined, 'code');

      // 期待: false
      expect(result).toBe(false);
    });
  });

  describe('TC-1-4: 既存フェーズは影響なく動作', () => {
    it('should return true for implementation phase with code fileType', () => {
      // REQ-1: 既存の動作確認（implementationでcodeは許可）
      const result = phaseEditGuard.canEditInPhase('implementation', 'code');

      // 期待: true（既存動作維持）
      expect(result).toBe(true);
    });
  });

  describe('TC-1-5: researchでmarkdown許可', () => {
    it('should return true for research phase with spec fileType', () => {
      // REQ-1: 既存の動作確認（researchでmarkdownは許可）
      const result = phaseEditGuard.canEditInPhase('research', 'spec');

      // 期待: true（既存動作維持）
      expect(result).toBe(true);
    });
  });
});
