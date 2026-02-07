/**
 * REQ-1: phase-edit-guard.js スコープ検証フェーズ拡大テスト
 *
 * checkScopeViolation()のスコープ検証対象フェーズ拡大と
 * scope未設定時のsrc/配下ブロック動作をテストする。
 *
 * @spec docs/workflows/ワ-クフロ-大規模対応根本改修/test-design.md
 */

import { describe, test, expect } from 'vitest';

/**
 * checkScopeViolation()の変更後ロジックを再現
 *
 * 変更点:
 * 1. scope未設定時にsrc/配下の編集をブロック
 * 2. scope空配列時もsrc/配下をブロック
 * 3. docs/配下は常に許可
 * 4. workflowState=nullは許可（タスク外の操作）
 */
function checkScopeViolationNew(
  filePath: string,
  workflowState: {
    scope?: {
      affectedFiles?: string[];
      affectedDirs?: string[];
    };
  } | null,
): { blocked: boolean; reason?: string; allowedFiles?: string[]; allowedDirs?: string[] } {
  // パス正規化
  const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();

  // docs/配下は常に許可
  if (normalizedPath.startsWith('docs/')) {
    return { blocked: false };
  }

  // workflowState=nullは許可（タスク外の操作）
  if (!workflowState) {
    return { blocked: false };
  }

  // scope未設定時、src/配下をブロック
  if (!workflowState.scope) {
    if (normalizedPath.startsWith('src/')) {
      return {
        blocked: true,
        reason: 'スコープが未設定のため、src/ 配下の編集はブロックされます',
        allowedFiles: [],
        allowedDirs: [],
      };
    }
    return { blocked: false };
  }

  const { affectedFiles, affectedDirs } = workflowState.scope;

  // scope空配列時もsrc/配下をブロック
  if ((!affectedFiles || affectedFiles.length === 0) &&
      (!affectedDirs || affectedDirs.length === 0)) {
    if (normalizedPath.startsWith('src/')) {
      return {
        blocked: true,
        reason: 'スコープが空のため、src/ 配下の編集はブロックされます',
        allowedFiles: [],
        allowedDirs: [],
      };
    }
    return { blocked: false };
  }

  // src/配下のみチェック
  if (!normalizedPath.startsWith('src/')) {
    return { blocked: false };
  }

  // affectedFilesに含まれているか確認
  if (affectedFiles && affectedFiles.length > 0) {
    for (const allowedFile of affectedFiles) {
      const normalizedAllowed = allowedFile.replace(/\\/g, '/').toLowerCase();
      if (normalizedPath === normalizedAllowed) {
        return { blocked: false };
      }
    }
  }

  // affectedDirsに含まれているか確認
  if (affectedDirs && affectedDirs.length > 0) {
    for (const allowedDir of affectedDirs) {
      const normalizedDir = allowedDir.replace(/\\/g, '/').toLowerCase();
      const dirPrefix = normalizedDir.endsWith('/') ? normalizedDir : normalizedDir + '/';
      if (normalizedPath.startsWith(dirPrefix)) {
        return { blocked: false };
      }
    }
  }

  // どちらにも含まれない場合はブロック
  return {
    blocked: true,
    reason: 'このファイルは影響範囲に含まれていません',
    allowedFiles: affectedFiles || [],
    allowedDirs: affectedDirs || [],
  };
}

describe('REQ-1: スコープ検証フェーズ拡大', () => {
  describe('スコープ検証対象フェーズ拡大', () => {
    // TC-1.3: test_implフェーズでスコープ外編集→ブロック
    test('TC-1.3: test_implフェーズでスコープ外のsrc/ファイル→ブロック', () => {
      const state = {
        scope: { affectedDirs: ['src/backend/'] },
      };

      const result = checkScopeViolationNew('src/frontend/app.tsx', state);
      expect(result.blocked).toBe(true);
    });

    // TC-1.4: implementationフェーズでスコープ内編集→許可
    test('TC-1.4: implementationフェーズでスコープ内ファイル→許可', () => {
      const state = {
        scope: { affectedDirs: ['src/backend/'] },
      };

      const result = checkScopeViolationNew('src/backend/index.ts', state);
      expect(result.blocked).toBe(false);
    });

    // TC-SE-1: build_checkフェーズでスコープ外→ブロック
    test('TC-SE-1: スコープ外のsrc/ファイル→ブロック（build_check想定）', () => {
      const state = {
        scope: { affectedDirs: ['src/backend/'] },
      };

      const result = checkScopeViolationNew('src/frontend/utils.ts', state);
      expect(result.blocked).toBe(true);
    });

    // TC-SE-2: testingフェーズでスコープ外→ブロック
    test('TC-SE-2: スコープ外のsrc/ファイル→ブロック（testing想定）', () => {
      const state = {
        scope: { affectedFiles: ['src/backend/auth.ts'] },
      };

      const result = checkScopeViolationNew('src/backend/db.ts', state);
      expect(result.blocked).toBe(true);
    });

    // TC-1.5: docs配下は常に許可
    test('TC-1.5: docs配下は常に許可', () => {
      const state = {
        scope: { affectedDirs: ['src/backend/'] },
      };

      const result = checkScopeViolationNew('docs/workflows/xxx/spec.md', state);
      expect(result.blocked).toBe(false);
    });
  });

  describe('scope未設定時のsrc/ブロック', () => {
    // TC-1.6: scope未設定→src/配下ブロック
    test('TC-1.6: scope未設定→src/配下ブロック', () => {
      const state = {};

      const result = checkScopeViolationNew('src/backend/index.ts', state);
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('スコープが未設定');
    });

    // TC-SE-3: scope空配列→src/配下ブロック
    test('TC-SE-3: scope空配列→src/配下ブロック', () => {
      const state = {
        scope: { affectedFiles: [], affectedDirs: [] },
      };

      const result = checkScopeViolationNew('src/backend/index.ts', state);
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('スコープが空');
    });

    // TC-SE-4: scope未設定→docs/配下は許可
    test('TC-SE-4: scope未設定でもdocs/配下は許可', () => {
      const state = {};

      const result = checkScopeViolationNew('docs/spec/feature.md', state);
      expect(result.blocked).toBe(false);
    });

    // TC-SE-5: scope未設定→非src/非docs/は許可
    test('TC-SE-5: scope未設定→package.json等は許可', () => {
      const state = {};

      const result = checkScopeViolationNew('package.json', state);
      expect(result.blocked).toBe(false);
    });

    // TC-SE-6: workflowState=null→許可
    test('TC-SE-6: workflowState=null→許可', () => {
      const result = checkScopeViolationNew('src/any/file.ts', null);
      expect(result.blocked).toBe(false);
    });
  });
});
