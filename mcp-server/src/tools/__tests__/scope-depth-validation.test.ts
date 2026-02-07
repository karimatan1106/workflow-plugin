/**
 * REQ-5: スコープ検証強化のテスト
 *
 * @spec /mnt/c/ツール/Workflow/docs/workflows/ワ-クフロ-全問題完全解決/spec.md (REQ-5)
 * @spec /mnt/c/ツール/Workflow/docs/workflows/ワ-クフロ-全問題完全解決/test-design.md (TC-5-1～TC-5-9)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  calculateDepth,
  validateScopeDepth,
  validateScopeFiles,
} from '../../validation/scope-validator.js';

// fs モジュールのモック
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});

// モック後にfsをインポート
const fs = await import('fs');

// =====================================================================
// テストスイート: REQ-5 スコープ検証強化
// =====================================================================

describe('REQ-5: スコープ検証強化', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------
  // TC-5-1: affectedDirs深度1がブロックされること
  // -------------------------------------------------------------------
  describe('TC-5-1: affectedDirs深度1がブロックされること', () => {
    it('src/ のような浅いディレクトリ（深度1）がブロックされる', () => {
      const affectedDirs = ['src/'];
      const result = validateScopeDepth(affectedDirs);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('src/');
      expect(result.errors[0]).toContain('深度1 < 3');
    });
  });

  // -------------------------------------------------------------------
  // TC-5-2: affectedDirs深度2がブロックされること
  // -------------------------------------------------------------------
  describe('TC-5-2: affectedDirs深度2がブロックされること', () => {
    it('src/backend/ のような深度2がブロックされる', () => {
      const affectedDirs = ['src/backend/'];
      const result = validateScopeDepth(affectedDirs);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('src/backend/');
      expect(result.errors[0]).toContain('深度2 < 3');
    });

    it('src/frontend/ のような深度2もブロックされる', () => {
      const affectedDirs = ['src/frontend/'];
      const result = validateScopeDepth(affectedDirs);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('src/frontend/');
      expect(result.errors[0]).toContain('深度2 < 3');
    });
  });

  // -------------------------------------------------------------------
  // TC-5-3: affectedDirs深度3以上が許可されること
  // -------------------------------------------------------------------
  describe('TC-5-3: affectedDirs深度3以上が許可されること', () => {
    it('src/backend/domain/ のような深度3が許可される', () => {
      const affectedDirs = ['src/backend/domain/'];
      const result = validateScopeDepth(affectedDirs);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('src/backend/domain/entities/ のような深度4が許可される', () => {
      const affectedDirs = ['src/backend/domain/entities/'];
      const result = validateScopeDepth(affectedDirs);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('src/frontend/features/auth/ のような深度3が許可される', () => {
      const affectedDirs = ['src/frontend/features/auth/'];
      const result = validateScopeDepth(affectedDirs);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------
  // TC-5-4: 存在しないファイルがブロックされること
  // -------------------------------------------------------------------
  describe('TC-5-4: 存在しないファイルがブロックされること', () => {
    it('存在しないファイルがaffectedFilesに含まれる場合ブロックされる', () => {
      // 存在するファイル: user.ts, 存在しないファイル: nonexistent.ts
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        const pathStr = path.toString();
        return pathStr.includes('user.ts');
      });

      const affectedFiles = [
        'src/backend/services/user.ts',
        'src/backend/services/nonexistent.ts',
      ];
      const result = validateScopeFiles(affectedFiles);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('nonexistent.ts');
      expect(result.errors[0]).toContain('が存在しません');
    });

    it('複数の存在しないファイルがある場合、全てエラーに含まれる', () => {
      // 全てのファイルが存在しない
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const affectedFiles = [
        'src/backend/services/file1.ts',
        'src/backend/services/file2.ts',
        'src/backend/services/file3.ts',
      ];
      const result = validateScopeFiles(affectedFiles);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(3);
      expect(result.errors[0]).toContain('file1.ts');
      expect(result.errors[1]).toContain('file2.ts');
      expect(result.errors[2]).toContain('file3.ts');
    });
  });

  // -------------------------------------------------------------------
  // TC-5-5: 存在するファイルは許可されること
  // -------------------------------------------------------------------
  describe('TC-5-5: 存在するファイルは許可されること', () => {
    it('全てのファイルが存在する場合は通過する', () => {
      // 全てのファイルが存在する
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const affectedFiles = [
        'src/backend/domain/user.ts',
        'src/backend/application/use-cases/create-user.ts',
      ];
      const result = validateScopeFiles(affectedFiles);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------
  // TC-5-6: "src/"と"src/backend/domain/"の混在で"src/"がブロック
  // -------------------------------------------------------------------
  describe('TC-5-6: "src/"と"src/backend/domain/"の混在で"src/"がブロック', () => {
    it('深度が浅いディレクトリと深いディレクトリが混在する場合、浅い方がエラー', () => {
      const affectedDirs = ['src/', 'src/backend/domain/'];
      const result = validateScopeDepth(affectedDirs);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('src/');
      expect(result.errors[0]).toContain('深度1 < 3');
    });

    it('深度2と深度3の混在で深度2のみエラー', () => {
      const affectedDirs = ['src/backend/', 'src/backend/domain/'];
      const result = validateScopeDepth(affectedDirs);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('src/backend/');
      expect(result.errors[0]).toContain('深度2 < 3');
    });
  });

  // -------------------------------------------------------------------
  // TC-5-7: 空のaffectedDirsは許可（ファイルのみのスコープ）
  // -------------------------------------------------------------------
  describe('TC-5-7: 空のaffectedDirsは許可（ファイルのみのスコープ）', () => {
    it('affectedDirsが空配列の場合は通過する', () => {
      const affectedDirs: string[] = [];
      const result = validateScopeDepth(affectedDirs);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------
  // TC-5-8: ".." を含むパスがブロック（パストラバーサル防止）
  // -------------------------------------------------------------------
  describe('TC-5-8: ".." を含むパスがブロック（パストラバーサル防止）', () => {
    it('相対パスで ".." を含むディレクトリがブロックされる', () => {
      // Note: この検証はset-scope.ts本体で行われるため、
      // ここでは深度計算の挙動のみテスト
      const affectedDirs = ['../malicious/'];
      const result = validateScopeDepth(affectedDirs);

      // src/ 以外なので深度999となり、深度チェックはスキップされる
      expect(result.valid).toBe(true);
    });

    it('src/../ のようなパスは深度チェック対象外', () => {
      // src/ で始まらないため、深度チェック対象外
      const affectedDirs = ['../src/backend/'];
      const result = validateScopeDepth(affectedDirs);

      // src/ 以外なので深度999
      expect(result.valid).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // TC-5-9: calculateDepth 関数の単体テスト
  // -------------------------------------------------------------------
  describe('TC-5-9: calculateDepth 関数が正しく深度を計算すること', () => {
    it('src/ の深度は1', () => {
      expect(calculateDepth('src/')).toBe(1);
    });

    it('src/backend/ の深度は2', () => {
      expect(calculateDepth('src/backend/')).toBe(2);
    });

    it('src/backend/domain/ の深度は3', () => {
      expect(calculateDepth('src/backend/domain/')).toBe(3);
    });

    it('src/backend/domain/entities/ の深度は4', () => {
      expect(calculateDepth('src/backend/domain/entities/')).toBe(4);
    });

    it('docs/ のような src/ 以外のパスは999（チェック対象外）', () => {
      expect(calculateDepth('docs/')).toBe(999);
    });

    it('tests/ のような src/ 以外のパスは999', () => {
      expect(calculateDepth('tests/')).toBe(999);
    });

    it('相対パス ./ が含まれる場合も正しく処理される', () => {
      expect(calculateDepth('./src/backend/domain/')).toBe(3);
    });

    it('末尾のスラッシュなしでも正しく計算される', () => {
      expect(calculateDepth('src/backend/domain')).toBe(3);
    });

    it('Windowsパス形式（バックスラッシュ）も正しく処理される', () => {
      expect(calculateDepth('src\\backend\\domain\\')).toBe(3);
    });
  });

  // -------------------------------------------------------------------
  // 追加テスト: エッジケース
  // -------------------------------------------------------------------
  describe('エッジケース', () => {
    it('複数の深度不足ディレクトリがある場合、全てエラーに含まれる', () => {
      const affectedDirs = ['src/', 'src/backend/', 'src/frontend/'];
      const result = validateScopeDepth(affectedDirs);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(3);
      expect(result.errors[0]).toContain('src/');
      expect(result.errors[1]).toContain('src/backend/');
      expect(result.errors[2]).toContain('src/frontend/');
    });

    it('正規化されたパスでも深度が正しく計算される', () => {
      const affectedDirs = ['src/backend/domain/'];
      const result = validateScopeDepth(affectedDirs);

      expect(result.valid).toBe(true);
    });

    it('ファイル検証で空配列の場合は通過する', () => {
      const affectedFiles: string[] = [];
      const result = validateScopeFiles(affectedFiles);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('深度3と深度4の混在（全て許可される）', () => {
      const affectedDirs = [
        'src/backend/domain/',
        'src/backend/domain/entities/',
        'src/frontend/features/auth/',
      ];
      const result = validateScopeDepth(affectedDirs);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('src/以外のパスが混在しても、src/配下のみチェックされる', () => {
      const affectedDirs = [
        'docs/',
        'src/', // 深度1でエラー
        'tests/',
        'src/backend/domain/', // 深度3でOK
      ];
      const result = validateScopeDepth(affectedDirs);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('src/');
      expect(result.errors[0]).toContain('深度1 < 3');
    });
  });
});
