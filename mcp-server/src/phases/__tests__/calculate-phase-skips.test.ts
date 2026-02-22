/**
 * calculatePhaseSkips 関数のユニットテスト
 *
 * BUG-4修正に伴うテストカバレッジ欠如の解消を目的として作成。
 * calculatePhaseSkips は純粋関数であるため外部依存のモックは不要。
 *
 * @spec docs/workflows/BUG-4テストカバレッジ欠如と根本原因の修正/test-design.md
 */

import { describe, it, expect } from 'vitest';
import { calculatePhaseSkips } from '../definitions.js';

describe('calculatePhaseSkips', () => {
  describe('スコープ未設定パス（files.length === 0）', () => {
    it('FR-1-1: 空のオブジェクトを渡した場合、test_impl・implementation・refactoringの3フェーズがスキップ対象になること', () => {
      // パターン1: 空オブジェクト
      const result1 = calculatePhaseSkips({});
      expect(result1).toHaveProperty('test_impl');
      expect(result1).toHaveProperty('implementation');
      expect(result1).toHaveProperty('refactoring');
      expect(result1.test_impl).toBeTruthy();
      expect(result1.implementation).toBeTruthy();
      expect(result1.refactoring).toBeTruthy();

      // パターン2: 空配列を持つオブジェクト
      const result2 = calculatePhaseSkips({ files: [] });
      expect(result2).toHaveProperty('test_impl');
      expect(result2).toHaveProperty('implementation');
      expect(result2).toHaveProperty('refactoring');
      expect(result2.test_impl).toBeTruthy();
      expect(result2.implementation).toBeTruthy();
      expect(result2.refactoring).toBeTruthy();
    });

    it('FR-1-2: userIntentにテストキーワードを含む場合、test_implがスキップ対象から除外されること', () => {
      // 日本語キーワード「テスト」
      const result1 = calculatePhaseSkips({}, 'テストを追加する');
      expect(result1).not.toHaveProperty('test_impl');
      // implementation と refactoring はまだスキップ対象
      expect(result1).toHaveProperty('implementation');
      expect(result1).toHaveProperty('refactoring');

      // 英語キーワード「testing」
      const result2 = calculatePhaseSkips({}, 'testing required');
      expect(result2).not.toHaveProperty('test_impl');
      expect(result2).toHaveProperty('implementation');
      expect(result2).toHaveProperty('refactoring');
    });

    it('FR-1-3: userIntentに実装キーワードを含む場合、implementationとrefactoringがスキップ対象から除外されること', () => {
      // 日本語キーワード「実装」
      const result1 = calculatePhaseSkips({}, '実装を行う');
      expect(result1).not.toHaveProperty('implementation');
      expect(result1).not.toHaveProperty('refactoring');
      // test_impl はまだスキップ対象
      expect(result1).toHaveProperty('test_impl');

      // 英語キーワード「implement」
      const result2 = calculatePhaseSkips({}, 'implement the feature');
      expect(result2).not.toHaveProperty('implementation');
      expect(result2).not.toHaveProperty('refactoring');
      expect(result2).toHaveProperty('test_impl');

      // 英語キーワード「implementation」
      const result3 = calculatePhaseSkips({}, 'implementation plan');
      expect(result3).not.toHaveProperty('implementation');
      expect(result3).not.toHaveProperty('refactoring');
      expect(result3).toHaveProperty('test_impl');
    });

    it('FR-1-4: userIntentにテストキーワードと実装キーワードの両方を含む場合、3フェーズ全てがスキップ対象から除外されること', () => {
      const result = calculatePhaseSkips({}, 'テストと実装を両方行う');
      expect(Object.keys(result)).toHaveLength(0);
    });
  });

  describe('スコープ設定済みパス', () => {
    it('FR-1-5: コードファイルとテストファイルの両方がスコープに含まれる場合、全フェーズがスキップ対象にならないこと', () => {
      const result = calculatePhaseSkips({ files: ['src/foo.ts', 'src/foo.test.ts'] });
      // hasCodeFiles=true, hasTestFiles=true なのでスキップなし
      expect(Object.keys(result)).toHaveLength(0);
    });

    it('FR-1-6: テストファイルのみスコープに含まれる場合、implementationとrefactoringがスキップ対象になること', () => {
      const result = calculatePhaseSkips({ files: ['src/foo.test.ts'] });
      // hasCodeFiles=false, hasTestFiles=true
      expect(result).toHaveProperty('implementation');
      expect(result).toHaveProperty('refactoring');
      // test_impl はスキップ対象にならない
      expect(result).not.toHaveProperty('test_impl');
    });

    it('FR-1-7: コードファイルのみスコープに含まれる場合、test_implがスキップ対象になること', () => {
      const result = calculatePhaseSkips({ files: ['src/foo.ts'] });
      // hasCodeFiles=true, hasTestFiles=false
      expect(result).toHaveProperty('test_impl');
      // implementation と refactoring はスキップ対象にならない
      expect(result).not.toHaveProperty('implementation');
      expect(result).not.toHaveProperty('refactoring');
    });
  });
});
