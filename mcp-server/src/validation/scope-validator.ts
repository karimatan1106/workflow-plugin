/**
 * スコープ検証モジュール
 * @spec docs/workflows/ワ-クフロ-全問題完全解決/spec.md REQ-5
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
 * ディレクトリ深度の検証
 *
 * REQ-5: affectedDirs の深度が最小深度（3）以上であることを検証
 *
 * @param affectedDirs ディレクトリパスの配列
 * @returns 検証結果
 */
export function validateScopeDepth(affectedDirs: string[]): ScopeDepthResult {
  const MIN_DIRECTORY_DEPTH = 3;
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
 * REQ-5: ファイルからimport文を抽出
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
 * REQ-5: 依存関係を追跡
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
  const maxDepth = options.maxDepth ?? 3;
  const dirs = Array.isArray(affectedDirs) ? affectedDirs : [affectedDirs];

  const allFiles = new Set<string>(affectedFiles);
  const importedFiles: string[] = [];
  const warnings: string[] = [];
  const visited = new Set<string>();

  // BFS with depth tracking
  let queue: Array<{ file: string; depth: number }> = affectedFiles.map(f => ({ file: f, depth: 0 }));

  while (queue.length > 0) {
    const { file, depth } = queue.shift()!;

    if (visited.has(file)) continue;
    visited.add(file);

    if (depth >= maxDepth) continue;

    // Read file and extract imports
    try {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, 'utf-8');
      const imports = extractImports(content, file);

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
          queue.push({ file: resolved, depth: depth + 1 });
        }
      }
    } catch {
      // File read error - skip
    }
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
    }

    return { valid: outOfScopeFiles.length === 0, outOfScopeFiles, warnings };
  } catch (error) {
    // git diffでエラーが発生した場合（例: gitリポジトリでない）
    return { valid: true, outOfScopeFiles: [], warnings: [`git diff検証エラー: ${error}`] };
  }
}
