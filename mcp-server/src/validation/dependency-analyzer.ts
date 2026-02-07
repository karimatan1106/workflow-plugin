/**
 * 依存関係解析モジュール
 *
 * TypeScript/JavaScriptファイルのimport文を解析し、
 * スコープ外依存を検出する。
 *
 * @spec docs/workflows/ワ-クフロ-1000万行対応強化/spec.md
 */

import * as fs from 'fs';
import * as path from 'path';

/** ファイル拡張子の候補リスト */
const SUPPORTED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'] as const;

/** TypeScript/JavaScriptファイルの判定パターン */
const TS_JS_FILE_PATTERN = /\.(ts|tsx|js|jsx)$/;

/** スコープに設定可能なファイル数の上限 */
const MAX_SCOPE_FILES = 500;

/** 依存解析対象ファイルサイズ上限(1MB) */
const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024;

/**
 * import文の解析結果
 */
export interface ImportInfo {
  /** import元のパス（相対パス） */
  from: string;
  /** 解決後の絶対パス */
  resolvedPath?: string;
  /** ファイルが存在するかどうか */
  exists: boolean;
}

/**
 * スコープ存在チェック結果
 */
export interface ScopeExistsResult {
  nonExistentFiles: string[];
  nonExistentDirs: string[];
}

/**
 * 依存関係検証結果
 */
export interface DependencyValidationResult {
  valid: boolean;
  outOfScopeDependencies: Array<{ file: string; dependency: string }>;
  suggestedAdditions: string[];
}

/**
 * ファイルからimport文を抽出
 *
 * @param filePath - ファイルパス
 * @param fileContent - ファイル内容（省略時はファイルから読み込む）
 * @returns import文の配列
 */
export function analyzeImports(
  filePath: string,
  fileContent?: string
): ImportInfo[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  // ファイルサイズ制限チェック
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_FILE_SIZE_BYTES) {
      return [];
    }
  } catch {
    return [];
  }

  // fileContentがfilePathと同じ場合は無視（テストの誤用対策）
  const content =
    fileContent && fileContent !== filePath
      ? fileContent
      : fs.readFileSync(filePath, 'utf-8');
  const imports: ImportInfo[] = [];
  const fileDir = path.dirname(filePath);

  // ES6 import パターン（複数の形式に対応）
  // - import { foo } from './utils';
  // - import * as bar from '../helpers';
  // - import type { User } from './types';
  // - import './side-effect';
  const es6ImportPattern =
    /import\s+(?:[\w*{}\s,]+\s+from\s+)?['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;

  while ((match = es6ImportPattern.exec(content)) !== null) {
    const importPath = match[1];

    // 相対import（./ または ../）のみ対象
    if (!importPath.startsWith('.')) {
      continue;
    }

    const resolvedPath = resolveImportPath(importPath, fileDir);
    const exists = resolvedPath ? fs.existsSync(resolvedPath) : false;

    imports.push({
      from: importPath,
      resolvedPath,
      exists,
    });
  }

  // CommonJS require パターン
  // const foo = require('./utils');
  // require('./side-effect');
  const requirePattern = /require\s*\(['"]([^'"]+)['"]\)/g;

  while ((match = requirePattern.exec(content)) !== null) {
    const importPath = match[1];

    // 相対import（./ または ../）のみ対象
    if (!importPath.startsWith('.')) {
      continue;
    }

    const resolvedPath = resolveImportPath(importPath, fileDir);
    const exists = resolvedPath ? fs.existsSync(resolvedPath) : false;

    imports.push({
      from: importPath,
      resolvedPath,
      exists,
    });
  }

  return imports;
}

/**
 * スコープの存在チェック
 *
 * @param files - ファイルパスの配列
 * @param dirs - ディレクトリパスの配列
 * @returns 存在しないファイル・ディレクトリのリスト
 */
export function validateScopeExists(
  files: string[],
  dirs: string[]
): ScopeExistsResult {
  const nonExistentFiles: string[] = [];
  const nonExistentDirs: string[] = [];

  for (const file of files) {
    if (!fs.existsSync(file)) {
      nonExistentFiles.push(file);
    }
  }

  for (const dir of dirs) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      nonExistentDirs.push(dir);
    }
  }

  return { nonExistentFiles, nonExistentDirs };
}

/**
 * スコープの依存関係を検証
 *
 * @param scopeFiles - スコープに含まれるファイルの配列
 * @param projectRoot - プロジェクトルート
 * @returns 依存関係検証結果
 */
export function validateScopeDependencies(
  scopeFiles: string[],
  projectRoot: string
): DependencyValidationResult {
  // ファイル数上限チェック
  if (scopeFiles.length > MAX_SCOPE_FILES) {
    return {
      valid: true,
      outOfScopeDependencies: [],
      suggestedAdditions: [],
    };
  }

  const scopeSet = new Set(
    scopeFiles.map((f) => path.normalize(path.resolve(projectRoot, f)))
  );
  const outOfScopeDeps: Array<{ file: string; dependency: string }> = [];
  const suggestedAdditionsSet = new Set<string>();

  for (const file of scopeFiles) {
    const absoluteFile = path.resolve(projectRoot, file);

    // TypeScript/JavaScriptファイルのみ対象
    if (!TS_JS_FILE_PATTERN.test(absoluteFile)) {
      continue;
    }

    if (!fs.existsSync(absoluteFile)) {
      continue;
    }

    const imports = analyzeImports(absoluteFile);

    for (const imp of imports) {
      if (imp.resolvedPath && imp.exists) {
        const normalizedDep = path.normalize(imp.resolvedPath);
        if (!scopeSet.has(normalizedDep)) {
          outOfScopeDeps.push({
            file: path.relative(projectRoot, absoluteFile),
            dependency: path.relative(projectRoot, normalizedDep),
          });
          suggestedAdditionsSet.add(path.relative(projectRoot, normalizedDep));
        }
      }
    }
  }

  return {
    valid: true, // 警告のみ、エラーにはしない
    outOfScopeDependencies: outOfScopeDeps,
    suggestedAdditions: Array.from(suggestedAdditionsSet),
  };
}

/**
 * import文のパスを解決
 *
 * @param importPath - import文のパス
 * @param fromDir - importしているファイルのディレクトリ
 * @returns 解決された絶対パス（解決できない場合はundefined）
 */
function resolveImportPath(
  importPath: string,
  fromDir: string
): string | undefined {
  // 拡張子を試行（.ts, .tsx, .js, .jsx, /index.ts など）
  const candidates = [
    importPath,
    ...SUPPORTED_EXTENSIONS.map((ext) => `${importPath}${ext}`),
    ...SUPPORTED_EXTENSIONS.map((ext) => `${importPath}/index${ext}`),
  ];

  for (const candidate of candidates) {
    const resolvedPath = path.resolve(fromDir, candidate);
    if (fs.existsSync(resolvedPath)) {
      return resolvedPath;
    }
  }

  return undefined;
}
