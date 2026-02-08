/**
 * スコープ検証モジュール
 * @spec docs/workflows/ワ-クフロ-全問題完全解決/spec.md REQ-5
 *
 * FR-8対応:
 * - SCOPE_DEPTH_MODE環境変数（shallow/normal/deep）
 * - SCOPE_MAX_DEPTH環境変数（デフォルト: 5）
 * - 循環依存検出
 * - 動的import検出（import(), require()）
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

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
 *
 * @param dir ディレクトリパス
 * @returns 深度（src/ = 1, src/backend/ = 2, etc.）。src/以外は999（チェック対象外）
 */
export function calculateDepth(dir: string): number {
  // パスを正規化（バックスラッシュ→スラッシュ、先頭の./を除去）
  const normalized = dir.replace(/\\/g, '/').replace(/^\.\//, '');

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
 *
 * @param affectedDirs ディレクトリパスの配列
 * @returns 検証結果
 */
export function validateScopeDepth(affectedDirs: string[]): ScopeDepthResult {
  const MIN_DIRECTORY_DEPTH = getMinDepthFromMode();
  const errors: string[] = [];

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
  // Normalize path separators
  const normalized = resolved.replace(/\\/g, '/');

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
    const indexPath = path.join(normalized, `index${tryExt}`).replace(/\\/g, '/');
    if (fs.existsSync(indexPath)) {
      return indexPath;
    }
  }

  // デフォルトは .ts
  return normalized + '.ts';
}

/**
 * ファイルがスコープ内か判定
 */
function isFileInScope(filePath: string, affectedDirs: string[]): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return affectedDirs.some(dir => {
    const normalizedDir = dir.replace(/\\/g, '/');
    return normalized.startsWith(normalizedDir);
  });
}

/**
 * REQ-5 + FR-8: 依存関係を追跡
 *
 * FR-8拡張:
 * - SCOPE_MAX_DEPTH 環境変数サポート
 * - 循環依存検出
 * - 追跡サマリーログ出力
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
  const envMaxDepth = process.env.SCOPE_MAX_DEPTH ? parseInt(process.env.SCOPE_MAX_DEPTH, 10) : undefined;
  const maxDepth = options.maxDepth ?? envMaxDepth ?? 5;
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

    // FR-8: 循環依存検出
    if (visitStack.has(file)) {
      warnings.push(`Circular dependency detected: ${parent} -> ${file}`);
      continue;
    }

    if (visited.has(file)) continue;
    visited.add(file);

    if (depth >= maxDepth) continue;

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

    // git diff --name-only HEAD で変更ファイルを取得
    const diffOutput = execSync('git diff --name-only HEAD', {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    if (!diffOutput) {
      return { valid: true, outOfScopeFiles: [], warnings: [] };
    }

    const changedFiles = diffOutput.split('\n').map(f => f.trim()).filter(Boolean);

    // 除外パターン（ドキュメント・依存関係ファイル等）
    const EXCLUDE_PATTERNS = [
      /\.md$/,
      /package\.json$/,
      /package-lock\.json$/,
      /pnpm-lock\.yaml$/,
      /^\.claude\/state\//,
      /^docs\/workflows\//,
    ];

    for (const changedFile of changedFiles) {
      // 除外パターンに一致する場合はスキップ
      if (EXCLUDE_PATTERNS.some(p => p.test(changedFile))) continue;

      const absChanged = path.resolve(projectRoot, changedFile);

      // scopeFilesに含まれるか確認
      const inScopeFiles = scopeFiles.some(sf => {
        const absSf = path.isAbsolute(sf) ? sf : path.resolve(projectRoot, sf);
        return absChanged === absSf;
      });

      // scopeDirsに含まれるか確認
      const inScopeDirs = scopeDirs.some(sd => {
        const absSd = path.isAbsolute(sd) ? sd : path.resolve(projectRoot, sd);
        return absChanged.replace(/\\/g, '/').startsWith(absSd.replace(/\\/g, '/'));
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
