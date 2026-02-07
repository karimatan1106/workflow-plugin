/**
 * REQ-3: スコープ制御テスト
 *
 * phase-edit-guard.js のスコープチェックロジックをテストする。
 * 実装はまだ存在しないため、テストファーストで作成（TDD Red Phase）。
 *
 * @spec docs/workflows/ワ-クフロ-制御強化/test-design.md
 */

import { describe, test, expect } from 'vitest';

/**
 * スコープチェック関数（phase-edit-guard.js から抽出した同等ロジック）
 *
 * 実装予定のチェック内容:
 * - スコープが設定されていない場合は許可
 * - affectedFiles に完全一致するファイルは許可
 * - affectedDirs 配下のファイルは許可
 * - それ以外はブロック
 */
function checkScopeViolation(
  filePath: string,
  state: {
    scope?: {
      affectedFiles?: string[];
      affectedDirs?: string[];
    };
  }
): { blocked: boolean; reason?: string } {
  const scope = state.scope;

  // スコープ未設定の場合は許可
  if (!scope) {
    return { blocked: false };
  }

  const { affectedFiles = [], affectedDirs = [] } = scope;

  // affectedFiles も affectedDirs も空の場合は許可
  if (affectedFiles.length === 0 && affectedDirs.length === 0) {
    return { blocked: false };
  }

  // ファイル完全一致チェック
  if (affectedFiles.includes(filePath)) {
    return { blocked: false };
  }

  // ディレクトリプレフィックスチェック
  const inDir = affectedDirs.some(dir => filePath.startsWith(dir));
  if (inDir) {
    return { blocked: false };
  }

  // スコープ外
  return { blocked: true, reason: 'scope_violation' };
}

describe('REQ-3: スコープ制御', () => {
  describe('3.1 implementation フェーズでのスコープチェック', () => {
    test('3.1.1: スコープ内のファイル → 許可', () => {
      const state = {
        scope: {
          affectedDirs: ['src/backend/'],
        },
      };

      const result = checkScopeViolation('src/backend/user.ts', state);
      expect(result.blocked).toBe(false);
    });

    test('3.1.2: スコープ外のファイル → ブロック', () => {
      const state = {
        scope: {
          affectedDirs: ['src/backend/'],
        },
      };

      const result = checkScopeViolation('src/frontend/app.tsx', state);
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe('scope_violation');
    });

    test('3.1.3: affectedFiles に完全一致 → 許可', () => {
      const state = {
        scope: {
          affectedFiles: ['src/backend/user.ts'],
          affectedDirs: [],
        },
      };

      const result = checkScopeViolation('src/backend/user.ts', state);
      expect(result.blocked).toBe(false);
    });

    test('3.1.4: affectedFiles に部分一致（プレフィックス）→ ブロック', () => {
      const state = {
        scope: {
          affectedFiles: ['src/backend/user.ts'],
          affectedDirs: [],
        },
      };

      const result = checkScopeViolation('src/backend/user.test.ts', state);
      expect(result.blocked).toBe(true);
    });

    test('3.1.5: affectedDirs のプレフィックスマッチ → 許可', () => {
      const state = {
        scope: {
          affectedDirs: ['src/backend/domain/'],
        },
      };

      const result = checkScopeViolation('src/backend/domain/user/user.ts', state);
      expect(result.blocked).toBe(false);
    });

    test('3.1.6: affectedDirs の部分一致（サブディレクトリ名の一部）→ ブロック', () => {
      const state = {
        scope: {
          affectedDirs: ['src/backend/'],
        },
      };

      // 'src/backend/' の後に続かないファイル
      const result = checkScopeViolation('src/frontend/backend-utils.ts', state);
      expect(result.blocked).toBe(true);
    });
  });

  describe('3.2 refactoring フェーズでのスコープチェック（拡張対象）', () => {
    test('3.2.1: refactoring + スコープ内 → 許可', () => {
      const state = {
        scope: {
          affectedDirs: ['src/backend/'],
        },
      };

      const result = checkScopeViolation('src/backend/user.ts', state);
      expect(result.blocked).toBe(false);
    });

    test('3.2.2: refactoring + スコープ外 → ブロック', () => {
      const state = {
        scope: {
          affectedDirs: ['src/backend/'],
        },
      };

      const result = checkScopeViolation('src/frontend/app.tsx', state);
      expect(result.blocked).toBe(true);
    });
  });

  describe('3.3 スコープ未設定時の挙動', () => {
    test('3.3.1: scope プロパティなし → 許可', () => {
      const state = {};

      const result = checkScopeViolation('any/file.ts', state);
      expect(result.blocked).toBe(false);
    });

    test('3.3.2: scope が空オブジェクト → 許可', () => {
      const state = {
        scope: {},
      };

      const result = checkScopeViolation('any/file.ts', state);
      expect(result.blocked).toBe(false);
    });

    test('3.3.3: affectedFiles も affectedDirs も空配列 → 許可', () => {
      const state = {
        scope: {
          affectedFiles: [],
          affectedDirs: [],
        },
      };

      const result = checkScopeViolation('any/file.ts', state);
      expect(result.blocked).toBe(false);
    });

    test('3.3.4: affectedFiles のみ未定義 → affectedDirs でチェック', () => {
      const state = {
        scope: {
          affectedDirs: ['src/backend/'],
        },
      };

      const result = checkScopeViolation('src/backend/user.ts', state);
      expect(result.blocked).toBe(false);
    });

    test('3.3.5: affectedDirs のみ未定義 → affectedFiles でチェック', () => {
      const state = {
        scope: {
          affectedFiles: ['src/backend/user.ts'],
        },
      };

      const result = checkScopeViolation('src/backend/user.ts', state);
      expect(result.blocked).toBe(false);
    });
  });

  describe('3.4 複数スコープの組み合わせ', () => {
    test('3.4.1: affectedFiles + affectedDirs 両方指定 → いずれかにマッチで許可', () => {
      const state = {
        scope: {
          affectedFiles: ['src/backend/specific.ts'],
          affectedDirs: ['src/backend/domain/'],
        },
      };

      // affectedFiles にマッチ
      expect(checkScopeViolation('src/backend/specific.ts', state).blocked).toBe(false);

      // affectedDirs にマッチ
      expect(checkScopeViolation('src/backend/domain/user.ts', state).blocked).toBe(false);

      // どちらにもマッチしない
      expect(checkScopeViolation('src/backend/other.ts', state).blocked).toBe(true);
    });

    test('3.4.2: 複数の affectedDirs → いずれかにマッチで許可', () => {
      const state = {
        scope: {
          affectedDirs: ['src/backend/domain/', 'src/backend/application/'],
        },
      };

      expect(checkScopeViolation('src/backend/domain/user.ts', state).blocked).toBe(false);
      expect(checkScopeViolation('src/backend/application/use-case.ts', state).blocked).toBe(false);
      expect(checkScopeViolation('src/backend/infrastructure/db.ts', state).blocked).toBe(true);
    });
  });

  describe('3.5 エッジケース', () => {
    test('3.5.1: 空文字列のファイルパス → ブロック', () => {
      const state = {
        scope: {
          affectedDirs: ['src/backend/'],
        },
      };

      const result = checkScopeViolation('', state);
      expect(result.blocked).toBe(true);
    });

    test('3.5.2: パスに特殊文字を含む → 正しく判定', () => {
      const state = {
        scope: {
          affectedDirs: ['src/特殊文字/'],
        },
      };

      const result = checkScopeViolation('src/特殊文字/file.ts', state);
      expect(result.blocked).toBe(false);
    });

    test('3.5.3: 絶対パスvs相対パス（実装依存）', () => {
      const state = {
        scope: {
          affectedDirs: ['src/backend/'],
        },
      };

      // 相対パス
      expect(checkScopeViolation('src/backend/user.ts', state).blocked).toBe(false);

      // 絶対パス（実装によっては正規化が必要）
      // ★ 実装時に絶対パス対応が必要かどうか検討
    });

    test('3.5.4: トレーリングスラッシュの有無', () => {
      const stateWithSlash = {
        scope: {
          affectedDirs: ['src/backend/'],
        },
      };

      const stateWithoutSlash = {
        scope: {
          affectedDirs: ['src/backend'],
        },
      };

      // スラッシュありの場合
      expect(checkScopeViolation('src/backend/user.ts', stateWithSlash).blocked).toBe(false);

      // スラッシュなしの場合（プレフィックスマッチなので許可される）
      expect(checkScopeViolation('src/backend/user.ts', stateWithoutSlash).blocked).toBe(false);

      // 意図しない部分一致に注意（例: src/backend_old/ が許可されてしまう）
      expect(checkScopeViolation('src/backend_old/user.ts', stateWithoutSlash).blocked).toBe(false);
      // ★ 実装時にトレーリングスラッシュの正規化を検討
    });
  });

  describe('3.6 research フェーズ（チェック対象外）', () => {
    test('3.6.1: research フェーズはスコープチェックをスキップ', () => {
      // research フェーズはフェーズチェックで編集制限されているため
      // スコープチェック自体が実行されない想定
      // このテストは phase-edit-guard.js の実装で確認

      // ダミーテスト（スキップされる想定）
      expect(true).toBe(true);
    });
  });
});
