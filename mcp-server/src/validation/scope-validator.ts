/**
 * スコープ検証モジュール
 * @spec docs/workflows/ワ-クフロ-全問題完全解決/spec.md REQ-5
 * @spec docs/workflows/ワ-クフロ-プラグインレビュ-指摘事項全件修正/spec.md
 *
 * FR-8対応:
 * - SCOPE_DEPTH_MODE環境変数（shallow/normal/deep）
 * - SCOPE_MAX_DEPTH環境変数（デフォルト: 5）
 * - 循環依存検出
 * - 動的import検出（import(), require()）
 *
 * REQ-A2: BFS走査制限（1000万行プロジェクト対応）
 * - MAX_SCOPE_FILES: ファイル数上限（デフォルト: 1000）
 * - MAX_SCOPE_DIRS: ディレクトリ数上限（デフォルト: 100）
 * - MAX_DEPENDENCY_DEPTH: 依存深度上限（デフォルト: 10）
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

/** REQ-A2: スコープ内ファイル数の上限 */
const MAX_SCOPE_FILES_RAW = parseInt(process.env.MAX_SCOPE_FILES || '1000', 10);
const MIN_SCOPE_FILES = 1;
const MAX_SCOPE_FILES_LIMIT = 10000;

/** REQ-A2: スコープ内ディレクトリ数の上限 */
const MAX_SCOPE_DIRS_RAW = parseInt(process.env.MAX_SCOPE_DIRS || '100', 10);
const MIN_SCOPE_DIRS = 1;
const MAX_SCOPE_DIRS_LIMIT = 1000;

/** REQ-A2: 依存関係追跡の深度上限（REQ-R5: デフォルト20に引き上げ） */
const MAX_DEPENDENCY_DEPTH_RAW = parseInt(process.env.MAX_DEPENDENCY_DEPTH || '20', 10);
const MIN_DEPENDENCY_DEPTH = 1;
const MAX_DEPENDENCY_DEPTH_LIMIT = 50;

/**
 * FR-6: 環境変数の範囲をバリデート（process.exit除去、RangeErrorをthrow）
 *
 * @param value 検証値
 * @param varName 変数名
 * @param min 最小値
 * @param max 最大値
 * @throws RangeError 範囲外の場合
 */
function validateEnvRange(value: number, varName: string, min: number, max: number): void {
  if (value < min || value > max) {
    throw new RangeError(`${varName} must be between ${min} and ${max}, got ${value}`);
  }
}

// REQ-A2: 範囲バリデーション（グローバルスコープでの実行を削除）
// FR-6: エラーハンドリングは呼び出し元で実施
let MAX_SCOPE_FILES = MIN_SCOPE_FILES;
try {
  validateEnvRange(MAX_SCOPE_FILES_RAW, 'MAX_SCOPE_FILES', MIN_SCOPE_FILES, MAX_SCOPE_FILES_LIMIT);
  MAX_SCOPE_FILES = MAX_SCOPE_FILES_RAW;
} catch (error) {
  console.warn(`[scope-validator] ${error instanceof Error ? error.message : error}, using default ${MIN_SCOPE_FILES}`);
}

let MAX_SCOPE_DIRS = MIN_SCOPE_DIRS;
try {
  validateEnvRange(MAX_SCOPE_DIRS_RAW, 'MAX_SCOPE_DIRS', MIN_SCOPE_DIRS, MAX_SCOPE_DIRS_LIMIT);
  MAX_SCOPE_DIRS = MAX_SCOPE_DIRS_RAW;
} catch (error) {
  console.warn(`[scope-validator] ${error instanceof Error ? error.message : error}, using default ${MIN_SCOPE_DIRS}`);
}

let MAX_DEPENDENCY_DEPTH = MIN_DEPENDENCY_DEPTH;
try {
  validateEnvRange(MAX_DEPENDENCY_DEPTH_RAW, 'MAX_DEPENDENCY_DEPTH', MIN_DEPENDENCY_DEPTH, MAX_DEPENDENCY_DEPTH_LIMIT);
  MAX_DEPENDENCY_DEPTH = MAX_DEPENDENCY_DEPTH_RAW;
} catch (error) {
  console.warn(`[scope-validator] ${error instanceof Error ? error.message : error}, using default ${MIN_DEPENDENCY_DEPTH}`);
}

/**
 * REQ-D3: パス正規化関数
 *
 * バックスラッシュ統一とUTF-8正規化を実施する。
 * - バックスラッシュをスラッシュに統一
 * - UTF-8 NFC正規化
 *
 * @param filePath ファイルパス
 * @returns 正規化後のパス
 */
export function normalizePath(filePath: string): string {
  // バックスラッシュをスラッシュに統一
  const slashNormalized = filePath.replace(/\\/g, '/');

  // UTF-8 NFC正規化
  const nfcNormalized = slashNormalized.normalize('NFC');

  return nfcNormalized;
}

/**
 * FR-14: Globパターンを正規表現に変換
 *
 * シンプルなglob変換ルール:
 * - `**` → `.*` (0個以上の任意の文字、ディレクトリ区切り含む)
 * - `*` → `[^/]*` (ディレクトリ区切り以外の任意の文字)
 * - `?` → `.` (任意の1文字)
 * - `.` → `\\.` (リテラルドット)
 *
 * @param pattern グロブパターン
 * @returns 正規表現オブジェクト
 */
export function globToRegex(pattern: string): RegExp {
  // エスケープが必要な正規表現特殊文字（.*+?^${}()|[]\ 等）
  // ただし、グロブで使う *、?、. は後で置換するので先にエスケープ
  let regexPattern = pattern;

  // 1. ドット（.）をエスケープ（\\.）
  regexPattern = regexPattern.replace(/\./g, '\\.');

  // 2. ** を一時プレースホルダーに置換（* の処理と区別するため）
  regexPattern = regexPattern.replace(/\*\*/g, '__DOUBLE_STAR__');

  // 3. * を [^/]* に置換（ディレクトリ区切り以外）
  regexPattern = regexPattern.replace(/\*/g, '[^/]*');

  // 4. プレースホルダーを .* に置換（ディレクトリ区切り含む）
  regexPattern = regexPattern.replace(/__DOUBLE_STAR__/g, '.*');

  // 5. ? を . に置換（任意の1文字）
  regexPattern = regexPattern.replace(/\?/g, '.');

  // 6. 正規表現オブジェクトを作成（^と$で完全一致）
  return new RegExp(`^${regexPattern}$`);
}

/** FR-14: グロブ正規表現キャッシュ */
const globRegexCache = new Map<string, RegExp>();
const GLOB_CACHE_MAX_SIZE = 100;

/**
 * FR-14: キャッシュ付きglobToRegex
 *
 * @param pattern グロブパターン
 * @returns 正規表現オブジェクト
 */
export function globToRegexCached(pattern: string): RegExp {
  // キャッシュに存在する場合は再利用
  if (globRegexCache.has(pattern)) {
    return globRegexCache.get(pattern)!;
  }

  // 新規作成
  const regex = globToRegex(pattern);

  // キャッシュに保存（上限チェック）
  if (globRegexCache.size >= GLOB_CACHE_MAX_SIZE) {
    // 最も古いエントリを削除（FIFO）
    const firstKey = globRegexCache.keys().next().value as string;
    if (firstKey) globRegexCache.delete(firstKey);
  }

  globRegexCache.set(pattern, regex);
  return regex;
}

/**
 * スコープ深度検証結果
 */
export interface ScopeDepthResult {
  valid: boolean;
  errors: string[];
}

/**
 * スコープファイル存在検証結果
 */
export interface ScopeFileResult {
  valid: boolean;
  errors: string[];
}

/**
 * ディレクトリ深度を計算する関数
 *
 * REQ-5: src/ 配下のディレクトリ深度を計算し、浅すぎるスコープを防ぐ
 * REQ-D3: normalizePath関数を使用
 *
 * @param dir ディレクトリパス
 * @returns 深度（src/ = 1, src/backend/ = 2, etc.）。src/以外は999（チェック対象外）
 */
export function calculateDepth(dir: string): number {
  // REQ-D3: パスを正規化
  const normalized = normalizePath(dir).replace(/^\.\//, '');

  // src/ 配下のみチェック
  if (!normalized.startsWith('src/')) {
    return 999; // src/ 以外は深度チェック対象外
  }

  // src を含めたパス全体をスラッシュで分割
  // "src/" → ["src", ""] → 1
  // "src/backend/" → ["src", "backend", ""] → 2
  // "src/backend/domain" → ["src", "backend", "domain"] → 3
  const parts = normalized.split('/').filter((s) => s.length > 0);
  return parts.length;
}

/**
 * FR-8: 深度モードの取得
 *
 * 環境変数 SCOPE_DEPTH_MODE に基づいて最小深度を決定する。
 * - shallow: 2
 * - normal: 3 (デフォルト)
 * - deep: 5
 *
 * @returns 最小深度
 */
function getMinDepthFromMode(): number {
  const mode = process.env.SCOPE_DEPTH_MODE?.toLowerCase();
  switch (mode) {
    case 'shallow':
      return 2;
    case 'deep':
      return 5;
    case 'normal':
    default:
      return 3;
  }
}

/**
 * ディレクトリ深度の検証
 *
 * REQ-5: affectedDirs の深度が最小深度以上であることを検証
 * FR-8: SCOPE_DEPTH_MODE 環境変数に対応
 * REQ-A2: ディレクトリ数上限チェック追加
 *
 * @param affectedDirs ディレクトリパスの配列
 * @returns 検証結果
 */
export function validateScopeDepth(affectedDirs: string[]): ScopeDepthResult {
  const MIN_DIRECTORY_DEPTH = getMinDepthFromMode();
  const errors: string[] = [];

  // REQ-A2: ディレクトリ数上限チェック
  if (affectedDirs.length > MAX_SCOPE_DIRS) {
    errors.push(
      `スコープディレクトリ数が上限を超えています（${affectedDirs.length} > ${MAX_SCOPE_DIRS}）。より具体的なディレクトリに絞ってください。`
    );
    return { valid: false, errors };
  }

  for (const dir of affectedDirs) {
    const depth = calculateDepth(dir);
    if (depth !== 999 && depth < MIN_DIRECTORY_DEPTH) {
      errors.push(
        `${dir} は深度が浅すぎます（深度${depth} < ${MIN_DIRECTORY_DEPTH}）。より具体的なディレクトリを指定してください。`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * ファイル存在確認の検証
 *
 * REQ-5: affectedFiles の全ファイルが実際に存在することを検証
 *
 * @param affectedFiles ファイルパスの配列
 * @returns 検証結果
 */
export function validateScopeFiles(affectedFiles: string[]): ScopeFileResult {
  const errors: string[] = [];

  for (const file of affectedFiles) {
    if (!fs.existsSync(file)) {
      errors.push(`${file} が存在しません`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * REQ-5: 依存関係追跡結果
 */
export interface DependencyTrackingResult {
  allFiles: string[];
  importedFiles: string[];
  warnings: string[];
}

/**
 * REQ-5 + FR-8: ファイルからimport文を抽出
 *
 * FR-8拡張: 動的import（import(), require()）も検出
 *
 * @param content ファイル内容
 * @param filePath ファイルパス（外部パッケージ判定用）
 * @returns import先パスの配列（相対パスのみ、外部パッケージ除外）
 */
export function extractImports(content: string, filePath: string): string[] {
  const imports: string[] = [];

  // ES6 import: import ... from '...'
  const es6Pattern = /import\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = es6Pattern.exec(content)) !== null) {
    const importPath = match[1];
    // 外部パッケージ（相対パスでないもの）を除外
    if (importPath.startsWith('.') || importPath.startsWith('/')) {
      imports.push(importPath);
    }
  }

  // CommonJS require: require('...')
  const requirePattern = /require\(['"]([^'"]+)['"]\)/g;
  while ((match = requirePattern.exec(content)) !== null) {
    const importPath = match[1];
    if (importPath.startsWith('.') || importPath.startsWith('/')) {
      imports.push(importPath);
    }
  }

  // FR-8: 動的import: import('...')
  const dynamicImportPattern = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicImportPattern.exec(content)) !== null) {
    const importPath = match[1];
    if (importPath.startsWith('.') || importPath.startsWith('/')) {
      imports.push(importPath);
    }
  }

  return imports;
}

/**
 * REQ-5: 相対importパスを解決
 * REQ-D3: normalizePath関数を使用
 *
 * @param baseFile importを含むファイルのパス
 * @param importPath import文のパス
 * @returns 解決された絶対パス、またはnull
 */
export function resolveImportPath(baseFile: string, importPath: string): string | null {
  // 外部パッケージはスキップ
  if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
    return null;
  }

  const baseDir = path.dirname(baseFile);
  const resolved = path.join(baseDir, importPath);
  // REQ-D3: パスを正規化
  const normalized = normalizePath(resolved);

  // 拡張子がある場合、そのまま返す
  const ext = path.extname(importPath);
  if (ext) {
    return normalized;
  }

  // 拡張子なし: .ts, .tsx, .js, .jsx を順番に試す
  const extensions = ['.ts', '.tsx', '.js', '.jsx'];
  for (const tryExt of extensions) {
    const tryPath = normalized + tryExt;
    if (fs.existsSync(tryPath)) {
      return tryPath;
    }
  }

  // index.ts 等も試す
  for (const tryExt of extensions) {
    const indexPath = normalizePath(path.join(normalized, `index${tryExt}`));
    if (fs.existsSync(indexPath)) {
      return indexPath;
    }
  }

  // デフォルトは .ts
  return normalized + '.ts';
}

/**
 * ファイルがスコープ内か判定
 * REQ-D3: normalizePath関数を使用
 */
function isFileInScope(filePath: string, affectedDirs: string[]): boolean {
  const normalized = normalizePath(filePath);
  return affectedDirs.some(dir => {
    const normalizedDir = normalizePath(dir);
    return normalized.startsWith(normalizedDir);
  });
}

/**
 * REQ-5 + FR-8 + REQ-A2: 依存関係を追跡
 *
 * FR-8拡張:
 * - SCOPE_MAX_DEPTH 環境変数サポート
 * - 循環依存検出
 * - 追跡サマリーログ出力
 *
 * REQ-A2拡張:
 * - MAX_DEPENDENCY_DEPTH による深度制限（デフォルト: 10）
 * - MAX_SCOPE_FILES によるファイル数制限（デフォルト: 1000）
 * - 制限超過時の警告出力
 *
 * @param affectedFiles 変更対象ファイルの配列
 * @param affectedDirs スコープディレクトリ（文字列または配列）
 * @param options オプション（maxDepth等）
 * @returns 追跡結果
 */
export function trackDependencies(
  affectedFiles: string[],
  affectedDirs: string | string[],
  options: { maxDepth?: number } = {},
): DependencyTrackingResult {
  // FR-8: SCOPE_MAX_DEPTH 環境変数サポート
  // REQ-A2: MAX_DEPENDENCY_DEPTH をデフォルト上限として使用
  const envMaxDepth = process.env.SCOPE_MAX_DEPTH ? parseInt(process.env.SCOPE_MAX_DEPTH, 10) : undefined;
  const requestedMaxDepth = options.maxDepth ?? envMaxDepth ?? MAX_DEPENDENCY_DEPTH;
  const maxDepth = Math.min(requestedMaxDepth, MAX_DEPENDENCY_DEPTH);

  if (requestedMaxDepth > MAX_DEPENDENCY_DEPTH) {
    console.warn(`[Scope Tracking] Requested maxDepth ${requestedMaxDepth} exceeds MAX_DEPENDENCY_DEPTH ${MAX_DEPENDENCY_DEPTH}, capping at ${MAX_DEPENDENCY_DEPTH}`);
  }

  const dirs = Array.isArray(affectedDirs) ? affectedDirs : [affectedDirs];

  const allFiles = new Set<string>(affectedFiles);
  const importedFiles: string[] = [];
  const warnings: string[] = [];
  const visited = new Set<string>();
  const visitStack = new Set<string>(); // FR-8: 循環依存検出用

  // BFS with depth tracking
  let queue: Array<{ file: string; depth: number; parent?: string }> =
    affectedFiles.map(f => ({ file: f, depth: 0 }));

  while (queue.length > 0) {
    const { file, depth, parent } = queue.shift()!;

    // REQ-A2: ファイル数制限チェック
    if (allFiles.size >= MAX_SCOPE_FILES) {
      warnings.push(`File count limit reached (${MAX_SCOPE_FILES}). Dependency tracking stopped.`);
      break;
    }

    // FR-8: 循環依存検出
    if (visitStack.has(file)) {
      warnings.push(`Circular dependency detected: ${parent} -> ${file}`);
      continue;
    }

    if (visited.has(file)) continue;
    visited.add(file);

    if (depth >= maxDepth) {
      warnings.push(`Max dependency depth ${maxDepth} reached for ${file}. Stopping traversal.`);
      continue;
    }

    // Read file and extract imports
    try {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, 'utf-8');
      const imports = extractImports(content, file);

      visitStack.add(file);

      for (const imp of imports) {
        const resolved = resolveImportPath(file, imp);
        if (!resolved) continue;

        if (!allFiles.has(resolved)) {
          allFiles.add(resolved);
          importedFiles.push(resolved);

          // Check if in scope
          if (!isFileInScope(resolved, dirs)) {
            warnings.push(`${resolved} out of scope (imported from ${file})`);
          }
        }

        if (!visited.has(resolved)) {
          queue.push({ file: resolved, depth: depth + 1, parent: file });
        }
      }

      visitStack.delete(file);
    } catch {
      // File read error - skip
      visitStack.delete(file);
    }
  }

  // FR-8: 追跡サマリーログ
  console.log(`[Scope Tracking] Initial files: ${affectedFiles.length}, Discovered: ${importedFiles.length}, Total: ${allFiles.size}, Max depth: ${maxDepth}`);
  if (warnings.length > 0) {
    console.log(`[Scope Tracking] Warnings: ${warnings.length}`);
  }

  return {
    allFiles: Array.from(allFiles),
    importedFiles,
    warnings,
  };
}

/**
 * REQ-5: スコープ事後検証結果
 */
export interface ScopePostValidationResult {
  valid: boolean;
  outOfScopeFiles: string[];
  warnings: string[];
}

/**
 * スコープ検証から除外するパターン（FR-4）
 *
 * ドキュメント、設定ファイル、内部状態ファイルは除外
 */
const EXCLUDE_PATTERNS = [
  /\.md$/,                           // Markdownドキュメント
  /package\.json$/,                  // パッケージ定義
  /package-lock\.json$/,             // npm ロックファイル
  /pnpm-lock\.yaml$/,                // pnpm ロックファイル
  /^\.claude\/state\//,              // ワークフロー内部状態
  /^docs\/workflows\//,              // ワークフロー成果物
  /\.claude-phase-guard-log\.json$/, // フェーズガード ログ
  /\.claude-loop-detector-state\.json$/, // ループ検出 状態
  /\.claude-hook-errors\.log$/,      // フック エラーログ
];

/**
 * ファイルが除外パターンに一致するかチェック
 *
 * @param filePath ファイルパス
 * @returns 除外対象の場合 true
 */
function isExcludedFile(filePath: string): boolean {
  return EXCLUDE_PATTERNS.some(pattern => pattern.test(filePath));
}

/**
 * FR-5: gitサブモジュールのパスを取得
 *
 * @param projectRoot プロジェクトルート
 * @returns サブモジュールパスの配列
 */
export function getSubmodulePaths(projectRoot: string): string[] {
  const gitmodulesPath = path.join(projectRoot, '.gitmodules');

  // .gitmodulesが存在しない場合は空配列
  if (!fs.existsSync(gitmodulesPath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(gitmodulesPath, 'utf-8');
    const pathPattern = /^\s*path\s*=\s*(.+)$/gm;
    const paths: string[] = [];
    let match;

    while ((match = pathPattern.exec(content)) !== null) {
      const submodulePath = match[1].trim();

      // パストラバーサル対策: .. を含むパスを拒否
      if (submodulePath.includes('..')) {
        console.warn(`[scope-validator] Invalid submodule path (contains ..): ${submodulePath}`);
        continue;
      }

      paths.push(submodulePath);
    }

    return paths;
  } catch (error) {
    console.warn(`[scope-validator] Failed to read .gitmodules: ${error}`);
    return [];
  }
}

/**
 * ファイルがサブモジュール内か判定
 * REQ-D3: normalizePath関数を使用
 *
 * @param filePath ファイルパス
 * @param submodulePaths サブモジュールパスの配列
 * @returns サブモジュール内の場合 true
 */
function isInSubmodule(filePath: string, submodulePaths: string[]): boolean {
  const normalized = normalizePath(filePath);
  return submodulePaths.some(subPath => {
    const normalizedSubPath = normalizePath(subPath);
    return normalized.startsWith(normalizedSubPath + '/') || normalized === normalizedSubPath;
  });
}

/**
 * REQ-5: スコープ事後検証
 *
 * implementation/refactoringフェーズ完了後、実際に変更されたファイルが
 * スコープ内に収まっているか検証する。
 *
 * @param scopeFiles スコープファイルリスト
 * @param scopeDirs スコープディレクトリリスト
 * @param projectRoot プロジェクトルートディレクトリ（デフォルト: process.cwd()）
 * @returns 検証結果
 */
export function validateScopePostExecution(
  scopeFiles: string[],
  scopeDirs: string[],
  projectRoot: string = process.cwd()
): ScopePostValidationResult {
  const warnings: string[] = [];
  const outOfScopeFiles: string[] = [];

  try {
    // .gitディレクトリが存在しない場合はスキップ
    if (!fs.existsSync(path.join(projectRoot, '.git'))) {
      return { valid: true, outOfScopeFiles: [], warnings: [] };
    }

    // FR-5: gitサブモジュールのパスを取得
    const submodulePaths = getSubmodulePaths(projectRoot);

    // 変更ファイルを取得（FR-5: サブモジュール無視）
    // N-1: Add -c core.quotePath=false to prevent octal escaping of non-ASCII paths
    // This ensures Japanese task names in paths are returned as UTF-8 strings
    const diffOutput = execSync('git -c core.quotePath=false diff --name-only --ignore-submodules HEAD', {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    if (!diffOutput) {
      return { valid: true, outOfScopeFiles: [], warnings: [] };
    }

    const changedFiles = diffOutput.split('\n').map(f => f.trim()).filter(Boolean);

    for (const changedFile of changedFiles) {
      // 除外パターンに一致する場合はスキップ
      if (isExcludedFile(changedFile)) continue;

      // FR-5: gitサブモジュール内のファイルをスキップ
      if (isInSubmodule(changedFile, submodulePaths)) continue;

      const absChanged = path.resolve(projectRoot, changedFile);

      // REQ-D3: パスを正規化してから比較
      // scopeFilesに含まれるか確認
      const inScopeFiles = scopeFiles.some(sf => {
        const absSf = path.isAbsolute(sf) ? sf : path.resolve(projectRoot, sf);
        return normalizePath(absChanged) === normalizePath(absSf);
      });

      // scopeDirsに含まれるか確認
      const inScopeDirs = scopeDirs.some(sd => {
        const absSd = path.isAbsolute(sd) ? sd : path.resolve(projectRoot, sd);
        return normalizePath(absChanged).startsWith(normalizePath(absSd));
      });

      if (!inScopeFiles && !inScopeDirs) {
        outOfScopeFiles.push(changedFile);
      }
    }

    if (outOfScopeFiles.length > 0) {
      warnings.push(`スコープ外のファイルが変更されています: ${outOfScopeFiles.join(', ')}`);

      // REQ-2: SCOPE_STRICT=false の場合は警告のみ（互換モード）
      const isStrict = process.env.SCOPE_STRICT !== 'false';
      if (!isStrict) {
        return { valid: true, outOfScopeFiles, warnings };
      }
    }

    return { valid: outOfScopeFiles.length === 0, outOfScopeFiles, warnings };
  } catch (error) {
    // git diffでエラーが発生した場合（例: gitリポジトリでない）
    return { valid: true, outOfScopeFiles: [], warnings: [`git diff検証エラー: ${error}`] };
  }
}
