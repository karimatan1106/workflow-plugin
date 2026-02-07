/**
 * 依存関係解析モジュールのテスト（TDD Red Phase）
 *
 * @spec docs/workflows/ワ-クフロ-1000万行対応強化/test-design.md
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import os from 'os';
import {
  analyzeImports,
  validateScopeExists,
  validateScopeDependencies,
} from '../dependency-analyzer.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(os.tmpdir(), 'scope-test-'));
});

afterEach(() => {
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('validateScopeExists', () => {
  it('TC-3.1: 存在しないファイルパスを含むスコープ → nonExistentFilesに含まれる', () => {
    const files = [
      join(tmpDir, 'nonexistent.ts'),
      join(tmpDir, 'fake.ts'),
    ];
    const dirs: string[] = [];

    const result = validateScopeExists(files, dirs);

    expect(result.nonExistentFiles).toHaveLength(2);
    expect(result.nonExistentFiles).toContain(join(tmpDir, 'nonexistent.ts'));
    expect(result.nonExistentFiles).toContain(join(tmpDir, 'fake.ts'));
  });

  it('TC-3.2: 存在しないディレクトリ → nonExistentDirsに含まれる', () => {
    const files: string[] = [];
    const dirs = [
      join(tmpDir, 'fake-dir'),
      join(tmpDir, 'non-exist'),
    ];

    const result = validateScopeExists(files, dirs);

    expect(result.nonExistentDirs).toHaveLength(2);
    expect(result.nonExistentDirs).toContain(join(tmpDir, 'fake-dir'));
    expect(result.nonExistentDirs).toContain(join(tmpDir, 'non-exist'));
  });

  it('TC-3.3: 存在するパスのみ → 空配列', () => {
    // 実ファイル・ディレクトリを作成
    const testFile = join(tmpDir, 'exists.ts');
    const testDir = join(tmpDir, 'exists-dir');
    writeFileSync(testFile, 'export const foo = 1;', 'utf-8');
    mkdirSync(testDir, { recursive: true });

    const files = [testFile];
    const dirs = [testDir];

    const result = validateScopeExists(files, dirs);

    expect(result.nonExistentFiles).toHaveLength(0);
    expect(result.nonExistentDirs).toHaveLength(0);
  });
});

describe('analyzeImports', () => {
  it('TC-3.4: import文解析 - ES6 import', () => {
    const testFile = join(tmpDir, 'test-imports.ts');
    const utilsFile = join(tmpDir, 'utils.ts');
    const helpersFile = join(tmpDir, 'helpers.ts');

    // 依存先ファイルを作成
    writeFileSync(utilsFile, 'export const util = 1;', 'utf-8');
    mkdirSync(join(tmpDir, 'subdir'), { recursive: true });
    writeFileSync(helpersFile, 'export const helper = 1;', 'utf-8');

    // import文を含むファイル
    writeFileSync(
      testFile,
      `import { foo } from './utils';
import * as bar from './helpers';
import type { User } from './types';
`,
      'utf-8'
    );

    const imports = analyzeImports(testFile, testFile);

    expect(imports).toHaveLength(3);
    expect(imports[0].from).toBe('./utils');
    expect(imports[1].from).toBe('./helpers');
    expect(imports[2].from).toBe('./types');
  });

  it('TC-3.5: require解析 - CommonJS require', () => {
    const testFile = join(tmpDir, 'test-require.js');
    const utilsFile = join(tmpDir, 'utils.js');
    const helpersFile = join(tmpDir, 'helpers.js');

    writeFileSync(utilsFile, 'module.exports = {};', 'utf-8');
    writeFileSync(helpersFile, 'module.exports = {};', 'utf-8');

    writeFileSync(
      testFile,
      `const foo = require('./utils');
const bar = require('./helpers');
`,
      'utf-8'
    );

    const imports = analyzeImports(testFile, testFile);

    expect(imports).toHaveLength(2);
    expect(imports[0].from).toBe('./utils');
    expect(imports[1].from).toBe('./helpers');
  });
});

describe('validateScopeDependencies', () => {
  it('TC-3.6: スコープ外依存がある → outOfScopeDependenciesに含まれる', () => {
    // ファイル構成:
    // - feature.ts → import { validate } from './utils'
    // - utils.ts → 存在する

    const featureFile = join(tmpDir, 'feature.ts');
    const utilsFile = join(tmpDir, 'utils.ts');

    writeFileSync(utilsFile, 'export const validate = () => {};', 'utf-8');
    writeFileSync(
      featureFile,
      `import { validate } from './utils';`,
      'utf-8'
    );

    // スコープにはfeature.tsのみ含める（utils.tsは含めない）
    const scopeFiles = [featureFile];

    const result = validateScopeDependencies(scopeFiles, tmpDir);

    expect(result.valid).toBe(true); // 警告のみ
    expect(result.outOfScopeDependencies.length).toBeGreaterThan(0);
    expect(result.outOfScopeDependencies[0].dependency).toContain('utils');
    expect(result.suggestedAdditions.length).toBeGreaterThan(0);
  });

  it('TC-3.7: 全依存がスコープ内 → outOfScopeDependenciesが空', () => {
    const featureFile = join(tmpDir, 'feature.ts');
    const utilsFile = join(tmpDir, 'utils.ts');

    writeFileSync(utilsFile, 'export const validate = () => {};', 'utf-8');
    writeFileSync(
      featureFile,
      `import { validate } from './utils';`,
      'utf-8'
    );

    // スコープにfeature.tsとutils.tsの両方を含める
    const scopeFiles = [featureFile, utilsFile];

    const result = validateScopeDependencies(scopeFiles, tmpDir);

    expect(result.valid).toBe(true);
    expect(result.outOfScopeDependencies).toHaveLength(0);
  });
});
