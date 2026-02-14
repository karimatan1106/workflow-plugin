/**
 * REQ-2: スコープ検証デフォルト厳格化テスト
 *
 * SCOPE_STRICT環境変数のデフォルト動作を検証する。
 * デフォルトで厳格モード（スコープ外変更をブロック）になることをテストする。
 *
 * @spec docs/workflows/ワ-クフロ-残存問題完全解決/test-design.md
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';

// child_processのモック
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

// fsのモック
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  statSync: vi.fn(() => ({ isDirectory: () => false })),
}));

import { execSync } from 'child_process';
import * as fs from 'fs';

// scope-validator.tsが実装されている場合
import { validateScopePostExecution } from '../../validation/scope-validator.js';

// 環境変数の元の値を保存
const originalEnv = { ...process.env };

// P-2: git diffキャッシュ（30秒TTL）を各テスト間で無効化するため時刻を進める
let fakeNow = 2000000;

describe('REQ-2: スコープ検証デフォルト厳格化', () => {
  beforeEach(() => {
    // 環境変数をリセット
    process.env = { ...originalEnv };
    delete process.env.SCOPE_STRICT;

    vi.clearAllMocks();
    // P-2: git diff結果キャッシュを各テスト間で確実に無効化
    fakeNow += 60000;
    vi.spyOn(Date, 'now').mockReturnValue(fakeNow);
  });

  afterEach(() => {
    // 環境変数を元に戻す
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('TC-2-1: SCOPE_STRICT未設定（デフォルト） → スコープ外変更をブロック', () => {
    test('スコープ外のファイル変更がvalidateResult.valid=falseを返す', () => {
      // SCOPE_STRICT未設定（デフォルト厳格）
      delete process.env.SCOPE_STRICT;

      const scopeFiles: string[] = [];
      const scopeDirs = ['src/backend/domain'];

      // git diffモック（スコープ外ファイルを含む）
      vi.mocked(execSync).mockReturnValue(
        'src/backend/infrastructure/db.ts\n' as any
      );
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = validateScopePostExecution(scopeFiles, scopeDirs, '/test/repo');

      expect(result.valid).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.outOfScopeFiles).toContain('src/backend/infrastructure/db.ts');
    });

    test('スコープ内のファイル変更のみ → valid=true', () => {
      delete process.env.SCOPE_STRICT;

      const scopeFiles: string[] = [];
      const scopeDirs = ['src/backend/domain'];

      vi.mocked(execSync).mockReturnValue(
        'src/backend/domain/entities/user.ts\n' as any
      );
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = validateScopePostExecution(scopeFiles, scopeDirs, '/test/repo');

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBe(0);
    });
  });

  describe('TC-2-2: SCOPE_STRICT=false → スコープ外変更を許可（互換モード）', () => {
    test('スコープ外変更があってもvalid=true（警告のみ）', () => {
      process.env.SCOPE_STRICT = 'false';

      const scopeFiles: string[] = [];
      const scopeDirs = ['src/backend/domain'];

      vi.mocked(execSync).mockReturnValue(
        'src/frontend/components/App.tsx\n' as any
      );
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = validateScopePostExecution(scopeFiles, scopeDirs, '/test/repo');

      // SCOPE_STRICT=false の場合は警告のみでvalid=true
      expect(result.valid).toBe(true);
      // ただし警告は出る
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('TC-2-3: SCOPE_STRICT=true → スコープ外変更をブロック（明示的厳格モード）', () => {
    test('スコープ外変更がvalid=falseを返す', () => {
      process.env.SCOPE_STRICT = 'true';

      const scopeFiles: string[] = [];
      const scopeDirs = ['src/backend'];

      vi.mocked(execSync).mockReturnValue(
        'src/frontend/app.tsx\n' as any
      );
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = validateScopePostExecution(scopeFiles, scopeDirs, '/test/repo');

      expect(result.valid).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.outOfScopeFiles).toContain('src/frontend/app.tsx');
    });
  });

  describe('TC-2-4: 除外パターンファイルはどのモードでもスコープチェック対象外', () => {
    test('README.mdやdocs/workflows/はスコープ外でもvalid=true', () => {
      delete process.env.SCOPE_STRICT;

      const scopeFiles: string[] = [];
      const scopeDirs = ['src/backend'];

      vi.mocked(execSync).mockReturnValue(
        'README.md\ndocs/workflows/task1/spec.md\nsrc/backend/domain/user.ts\n' as any
      );
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = validateScopePostExecution(scopeFiles, scopeDirs, '/test/repo');

      // README.mdとdocs/workflows/は除外されるのでvalid=true
      expect(result.valid).toBe(true);
      expect(result.outOfScopeFiles.length).toBe(0);
    });
  });

  describe('TC-2-5: git diff失敗時 → valid=true（フェイルオープン）', () => {
    test('gitリポジトリなし → 検証スキップ', () => {
      delete process.env.SCOPE_STRICT;

      const scopeFiles: string[] = [];
      const scopeDirs = ['src/backend'];

      vi.mocked(fs.existsSync).mockReturnValue(false); // .gitなし

      const result = validateScopePostExecution(scopeFiles, scopeDirs, '/test/non-repo');

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBe(0);
      expect(vi.mocked(execSync)).not.toHaveBeenCalled();
    });

    test('git diffエラー → 検証スキップ', () => {
      delete process.env.SCOPE_STRICT;

      const scopeFiles: string[] = [];
      const scopeDirs = ['src/backend'];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('git diff failed');
      });

      const result = validateScopePostExecution(scopeFiles, scopeDirs, '/test/repo');

      // エラー時はフェイルオープン
      expect(result.valid).toBe(true);
    });
  });
});
