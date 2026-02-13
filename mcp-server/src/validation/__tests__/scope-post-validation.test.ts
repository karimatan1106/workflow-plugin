import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { validateScopePostExecution } from '../scope-validator.js';

// child_processのモック
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

// fsのモック
vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

import * as fs from 'fs';

describe('REQ-5: スコープ事後検証', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('TC-5-1: スコープ内ファイルのみ → {valid: true}', () => {
    test('許可されたファイルのみの変更を承認する', () => {
      const scopeFiles: string[] = [];
      const scopeDirs = [
        'src/backend/domain',
        'src/backend/application',
      ];

      // .gitディレクトリ存在
      vi.mocked(fs.existsSync).mockReturnValue(true);

      // git diffの結果をモック（スコープ内のファイルのみ）
      vi.mocked(execSync).mockReturnValue(
        'src/backend/domain/entities/user.ts\nsrc/backend/application/use-cases/create-user.ts\n' as any
      );

      const result = validateScopePostExecution(scopeFiles, scopeDirs, '/test/repo');

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBe(0);
      expect(vi.mocked(execSync)).toHaveBeenCalledWith(
        'git -c core.quotePath=false diff --name-only --ignore-submodules HEAD',
        expect.objectContaining({
          cwd: '/test/repo',
          encoding: 'utf-8',
        })
      );
    });
  });

  describe('TC-5-2: スコープ外ファイル(デフォルト) → {valid: false, warnings あり}', () => {
    test('スコープ外の変更を検出する', () => {
      const scopeFiles: string[] = [];
      const scopeDirs = [
        'src/backend/domain',
        'src/backend/application',
      ];

      vi.mocked(fs.existsSync).mockReturnValue(true);

      // git diffの結果をモック（スコープ外のファイルを含む）
      vi.mocked(execSync).mockReturnValue(
        'src/backend/domain/entities/user.ts\nsrc/frontend/components/UserList.tsx\npackage.json\n' as any
      );

      const result = validateScopePostExecution(scopeFiles, scopeDirs, '/test/repo');

      expect(result.valid).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.outOfScopeFiles).toContain('src/frontend/components/UserList.tsx');
      // package.jsonは除外パターンなのでoutOfScopeFilesに含まれない
      expect(result.outOfScopeFiles).not.toContain('package.json');
    });

    test('複数のスコープ外ファイルを全て報告する', () => {
      const scopeFiles: string[] = [];
      const scopeDirs = ['src/backend/domain'];

      vi.mocked(fs.existsSync).mockReturnValue(true);

      vi.mocked(execSync).mockReturnValue(
        'src/backend/infrastructure/db.ts\nsrc/frontend/app.tsx\nREADME.md\n' as any
      );

      const result = validateScopePostExecution(scopeFiles, scopeDirs, '/test/repo');

      expect(result.valid).toBe(false);
      expect(result.outOfScopeFiles.length).toBeGreaterThanOrEqual(2);
      expect(result.outOfScopeFiles).toContain('src/backend/infrastructure/db.ts');
      expect(result.outOfScopeFiles).toContain('src/frontend/app.tsx');
      // README.mdは除外パターン
      expect(result.outOfScopeFiles).not.toContain('README.md');
    });
  });

  describe('TC-5-3: .md等除外パターン → 除外されてvalid: true', () => {
    test('除外パターンのファイルは検証対象外', () => {
      const scopeFiles: string[] = [];
      const scopeDirs = ['src/backend'];

      vi.mocked(fs.existsSync).mockReturnValue(true);

      // git diffの結果（除外パターンを含む）
      vi.mocked(execSync).mockReturnValue(
        'src/backend/domain/user.ts\nREADME.md\nsrc/backend/domain/user.test.ts\ndocs/workflows/test/spec.md\n' as any
      );

      const result = validateScopePostExecution(scopeFiles, scopeDirs, '/test/repo');

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBe(0);
      // .mdと docs/workflows/ は除外されている
    });

    test('除外パターンでもスコープ外は警告', () => {
      const scopeFiles: string[] = [];
      const scopeDirs = ['src/backend'];

      vi.mocked(fs.existsSync).mockReturnValue(true);

      vi.mocked(execSync).mockReturnValue(
        'src/backend/domain/user.ts\nsrc/frontend/app.tsx\nREADME.md\n' as any
      );

      const result = validateScopePostExecution(scopeFiles, scopeDirs, '/test/repo');

      expect(result.valid).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
      // README.mdは除外されるが、src/frontend/app.tsxは警告対象
      expect(result.outOfScopeFiles).toContain('src/frontend/app.tsx');
      expect(result.outOfScopeFiles).not.toContain('README.md');
    });
  });

  describe('TC-5-4: gitリポジトリなし → {valid: true}（スキップ）', () => {
    test('git操作失敗時は検証をスキップ', () => {
      const scopeFiles: string[] = [];
      const scopeDirs = ['src/backend'];

      // .gitディレクトリなし
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = validateScopePostExecution(scopeFiles, scopeDirs, '/test/non-repo');

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBe(0);
      // execSyncは呼ばれない
      expect(vi.mocked(execSync)).not.toHaveBeenCalled();
    });

    test('git diff空結果（変更なし）も成功', () => {
      const scopeFiles: string[] = [];
      const scopeDirs = ['src/backend'];

      vi.mocked(fs.existsSync).mockReturnValue(true);

      // git diffの結果が空（空文字列を返す）
      vi.mocked(execSync).mockReturnValue('');

      const result = validateScopePostExecution(scopeFiles, scopeDirs, '/test/repo');

      expect(result.valid).toBe(true);
      // 空結果なのでwarningsも0
      expect(result.outOfScopeFiles.length).toBe(0);
    });
  });

  describe('スコープ未指定時のデフォルト動作', () => {
    test('スコープ未指定時は除外パターン以外を警告', () => {
      const scopeFiles: string[] = [];
      const scopeDirs: string[] = [];

      vi.mocked(fs.existsSync).mockReturnValue(true);

      vi.mocked(execSync).mockReturnValue(
        'src/backend/domain/user.ts\n' as any
      );

      const result = validateScopePostExecution(scopeFiles, scopeDirs, '/test/repo');

      // スコープが空＝全て許可（除外パターン以外はスコープ外）
      // ただし、scopeFiles=[], scopeDirs=[]の場合、全てがスコープ外と判定される
      // 実装を確認すると、空のスコープでもinScopeDirsはfalseなので、スコープ外になる
      // しかし、テストは警告を期待している
      // 実装では空のスコープの場合、全てがスコープ外になるが、
      // 除外パターンに一致しないファイルのみがoutOfScopeFilesに追加される
      expect(result.valid).toBe(false);
      expect(result.outOfScopeFiles).toContain('src/backend/domain/user.ts');
    });

    test('空のスコープでも除外パターンは除外される', () => {
      const scopeFiles: string[] = [];
      const scopeDirs: string[] = [];

      vi.mocked(fs.existsSync).mockReturnValue(true);

      vi.mocked(execSync).mockReturnValue(
        'README.md\n' as any
      );

      const result = validateScopePostExecution(scopeFiles, scopeDirs, '/test/repo');

      // README.mdは除外パターンなのでvalid: true
      expect(result.valid).toBe(true);
      expect(result.outOfScopeFiles.length).toBe(0);
    });
  });

  describe('git diffコマンドの正しい呼び出し', () => {
    test('HEADとの差分を取得する', () => {
      const scopeFiles: string[] = [];
      const scopeDirs = ['src'];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(execSync).mockReturnValue('src/test.ts\n' as any);

      validateScopePostExecution(scopeFiles, scopeDirs, '/test/repo');

      expect(vi.mocked(execSync)).toHaveBeenCalledWith(
        'git -c core.quotePath=false diff --name-only --ignore-submodules HEAD',
        expect.objectContaining({
          cwd: '/test/repo',
          encoding: 'utf-8',
        })
      );
    });
  });
});
