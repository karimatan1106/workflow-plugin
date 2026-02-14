/**
 * workflow_set_scope ツール - 影響範囲を設定
 *
 * research/requirements/planningフェーズで変更対象ファイル/ディレクトリをTaskStateに記録する。
 *
 * @spec docs/workflows/ワークフロー大規模対応改善/spec.md
 * @spec docs/workflows/ワ-クフロ-1000万行対応強化/spec.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { stateManager } from '../state/manager.js';
import type { ToolResult } from '../state/types.js';
import { getTaskByIdOrError, safeExecute, verifySessionToken } from './helpers.js';
import {
  validateScopeExists,
  validateScopeDependencies,
} from '../validation/dependency-analyzer.js';
import {
  validateScopeDepth,
  validateScopeFiles,
} from '../validation/scope-validator.js';

/** FR-6: スコープ設定が可能なフェーズ（拡張対応） */
// N-5: Added docs_update and regression_test to allow scope changes in later phases
const ALLOWED_PHASES = [
  'research',
  'requirements',
  'planning',
  'implementation',
  'refactoring',
  'testing',
  'docs_update',     // N-5: Allow scope changes for documentation updates
  'regression_test', // N-5: Allow scope changes for regression test creation
] as const;

/** スコープサイズ制限（REQ-3, REQ-R4: 環境変数対応） */
const MAX_SCOPE_FILES = Math.min(
  Math.max(parseInt(process.env.MAX_SCOPE_FILES || '1000', 10) || 1000, 10),
  10000
);
const MAX_SCOPE_DIRS = Math.min(
  Math.max(parseInt(process.env.MAX_SCOPE_DIRS || '100', 10) || 100, 5),
  1000
);

/**
 * フェーズの許可確認
 *
 * @param phase 対象フェーズ
 * @returns エラーオブジェクト、または null（許可の場合）
 */
function validatePhasePermission(phase: string): ToolResult | null {
  if (!ALLOWED_PHASES.includes(phase as typeof ALLOWED_PHASES[number])) {
    return {
      success: false,
      message: `影響範囲の設定は${ALLOWED_PHASES.join('/')}フェーズでのみ可能です（現在: ${phase}）`,
    };
  }
  return null;
}

/**
 * スコープサイズの検証
 *
 * @param files ファイルリスト
 * @param dirs ディレクトリリスト
 * @param maxFiles 最大ファイル数
 * @param maxDirs 最大ディレクトリ数
 * @returns エラーオブジェクト、または null（OK の場合）
 */
function validateScopeSize(files: string[], dirs: string[], maxFiles: number, maxDirs: number): ToolResult | null {
  if (files.length > maxFiles) {
    return {
      success: false,
      message: `スコープが大きすぎます（ファイル: ${files.length}件、上限: ${maxFiles}件）。\nタスクを機能単位に分割してください。`,
    };
  }

  if (dirs.length > maxDirs) {
    return {
      success: false,
      message: `スコープが大きすぎます（ディレクトリ: ${dirs.length}件、上限: ${maxDirs}件）。\nタスクを機能単位に分割してください。`,
    };
  }

  return null;
}

/**
 * 影響範囲を設定
 *
 * @param taskId タスクID（必須）
 * @param files 影響を受けるファイルの配列
 * @param dirs 影響を受けるディレクトリの配列
 * @param sessionToken セッショントークン（オプション、REQ-6）
 * @param glob globパターン（オプション）
 * @param addMode 追加モード（オプション、デフォルト: false）
 * @returns 設定結果
 */
export function workflowSetScope(
  taskId?: string,
  files?: string[],
  dirs?: string[],
  sessionToken?: string,
  glob?: string,
  addMode?: boolean
): ToolResult {
  // スコープサイズ制限を環境変数から読み取り
  const MAX_SCOPE_FILES_LOCAL = Math.min(
    Math.max(parseInt(process.env.SCOPE_MAX_FILES || '10000', 10) || 10000, 10),
    100000
  );
  const MAX_SCOPE_DIRS_LOCAL = Math.min(
    Math.max(parseInt(process.env.SCOPE_MAX_DIRS || '1000', 10) || 1000, 5),
    10000
  );

  // タスク状態を取得
  const result = getTaskByIdOrError(taskId);
  if ('error' in result) {
    return result.error as ToolResult;
  }

  const { taskState } = result;

  // REQ-6: セッショントークン検証
  const tokenError = verifySessionToken(taskState, sessionToken);
  if (tokenError) return tokenError as ToolResult;

  // 引数検証
  let affectedFiles = Array.isArray(files) ? files : [];
  let affectedDirs = Array.isArray(dirs) ? dirs : [];

  // globパターンの展開
  if (glob) {
    try {
      // Node.jsのfsモジュールを使用してシンプルなglob展開を実装
      const expandGlob = (pattern: string, basePath: string): string[] => {
        const results: string[] = [];
        const traverse = (dir: string): void => {
          try {
            const entries = fs.readdirSync(dir);
            for (const entry of entries) {
              const fullPath = path.join(dir, entry);
              const stat = fs.statSync(fullPath);
              if (stat.isDirectory()) {
                traverse(fullPath);
              } else if (stat.isFile()) {
                // シンプルなパターンマッチング（* と ** をサポート）
                const relativePath = path.relative(basePath, fullPath);
                const regex = new RegExp(
                  '^' + pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$'
                );
                if (regex.test(relativePath.replace(/\\/g, '/'))) {
                  results.push(fullPath);
                }
              }
            }
          } catch {
            // ディレクトリ読み取りエラーはスキップ
          }
        };
        traverse(basePath);
        return results;
      };

      const projectRoot = process.cwd();
      const expandedFiles = expandGlob(glob, projectRoot);

      if (addMode) {
        // 追加モード: 既存スコープとマージ
        const existingFiles = taskState.scope?.affectedFiles || [];
        affectedFiles = [...new Set([...existingFiles, ...expandedFiles, ...affectedFiles])];
      } else {
        // 置き換えモード
        affectedFiles = [...new Set([...expandedFiles, ...affectedFiles])];
      }
    } catch (error) {
      return {
        success: false,
        message: `glob展開エラー: ${error}`,
      };
    }
  } else if (addMode && taskState.scope) {
    // globなしでaddMode=trueの場合、既存スコープとマージ
    const existingFiles = taskState.scope.affectedFiles || [];
    const existingDirs = taskState.scope.affectedDirs || [];
    affectedFiles = [...new Set([...existingFiles, ...affectedFiles])];
    affectedDirs = [...new Set([...existingDirs, ...affectedDirs])];
  }

  if (affectedFiles.length === 0 && affectedDirs.length === 0) {
    return {
      success: false,
      message: 'files または dirs の少なくとも1つを指定してください',
    };
  }

  // FR-6: フェーズ許可確認
  const phaseError = validatePhasePermission(taskState.phase);
  if (phaseError) return phaseError;

  // REQ-3: スコープサイズ制限チェック
  const sizeError = validateScopeSize(affectedFiles, affectedDirs, MAX_SCOPE_FILES_LOCAL, MAX_SCOPE_DIRS_LOCAL);
  if (sizeError) return sizeError;

  // REQ-5: ディレクトリ深度検証
  const depthResult = validateScopeDepth(affectedDirs);
  if (!depthResult.valid) {
    return {
      success: false,
      message: `スコープ深度検証エラー:\n${depthResult.errors.join('\n')}`,
    };
  }

  // REQ-5: ファイル存在確認（相対パスは絶対パスに変換してチェック）
  const projectRoot = process.cwd();
  const absoluteFiles = affectedFiles.map((f) =>
    path.isAbsolute(f) ? f : path.resolve(projectRoot, f)
  );
  const fileExistsResult = validateScopeFiles(absoluteFiles);
  if (!fileExistsResult.valid) {
    return {
      success: false,
      message: `ファイル存在確認エラー:\n${fileExistsResult.errors.join('\n')}`,
    };
  }

  // ★★★ ディレクトリ存在チェック ★★★
  const absoluteDirs = affectedDirs.map((d) =>
    path.isAbsolute(d) ? d : path.resolve(projectRoot, d)
  );

  // パストラバーサル対策: 相対パスがプロジェクトルート外に解決される場合を拒否
  // 絶対パスはユーザーが意図的に指定しているため許可
  const normalizedRoot = path.normalize(projectRoot) + path.sep;
  const relativePaths = [
    ...affectedFiles.filter((f) => !path.isAbsolute(f)),
    ...affectedDirs.filter((d) => !path.isAbsolute(d)),
  ];
  const outsidePaths = relativePaths.filter(
    (p) => !path.normalize(path.resolve(projectRoot, p)).startsWith(normalizedRoot.slice(0, -1))
  );
  if (outsidePaths.length > 0) {
    return {
      success: false,
      message: `プロジェクトルート外のパスは指定できません: ${outsidePaths.join(', ')}`,
    };
  }

  const existsResult = validateScopeExists(absoluteFiles, absoluteDirs);

  // 存在しないファイル/ディレクトリがあればエラー
  if (
    existsResult.nonExistentFiles.length > 0 ||
    existsResult.nonExistentDirs.length > 0
  ) {
    const errors: string[] = [];
    if (existsResult.nonExistentFiles.length > 0) {
      const relativeFiles = existsResult.nonExistentFiles.map((f) =>
        path.relative(projectRoot, f)
      );
      errors.push(`存在しないファイル: ${relativeFiles.join(', ')}`);
    }
    if (existsResult.nonExistentDirs.length > 0) {
      const relativeDirs = existsResult.nonExistentDirs.map((d) =>
        path.relative(projectRoot, d)
      );
      errors.push(`存在しないディレクトリ: ${relativeDirs.join(', ')}`);
    }
    return {
      success: false,
      message: errors.join('\n'),
    };
  }

  // ★★★ 新規追加: 依存関係解析 ★★★
  const depResult = validateScopeDependencies(affectedFiles, projectRoot);

  // スコープ外依存がある場合は警告（ブロックはしない）
  const warnings: string[] = [];
  if (depResult.outOfScopeDependencies.length > 0) {
    warnings.push(
      `スコープ外依存が${depResult.outOfScopeDependencies.length}件検出されました`
    );

    // コンソールに詳細を出力
    const sampleDeps = depResult.outOfScopeDependencies.slice(0, 5);
    console.warn('[set-scope] スコープ外依存が検出されました:');
    for (const dep of sampleDeps) {
      console.warn(`  ${dep.file} → ${dep.dependency}`);
    }
    if (depResult.outOfScopeDependencies.length > 5) {
      console.warn(
        `  ... 他 ${depResult.outOfScopeDependencies.length - 5} 件`
      );
    }

    if (depResult.suggestedAdditions.length > 0) {
      console.warn('');
      console.warn('推奨: 以下のファイルをスコープに追加してください:');
      const sampleSuggestions = depResult.suggestedAdditions.slice(0, 10);
      for (const suggestion of sampleSuggestions) {
        console.warn(`  - ${suggestion}`);
      }
      if (depResult.suggestedAdditions.length > 10) {
        console.warn(
          `  ... 他 ${depResult.suggestedAdditions.length - 10} 件`
        );
      }
    }
  }

  // スコープ設定を実行
  return safeExecute('影響範囲設定', () => {
    // TaskStateにスコープを記録
    const updatedState = {
      ...taskState,
      scope: {
        affectedFiles,
        affectedDirs,
      },
    };

    stateManager.writeTaskState(taskState.workflowDir, updatedState);

    return {
      success: true,
      taskId: taskState.taskId,
      scope: {
        affectedFiles,
        affectedDirs,
      },
      message: `影響範囲を設定しました（ファイル: ${affectedFiles.length}件, ディレクトリ: ${affectedDirs.length}件）`,
      ...(warnings.length > 0 && { warnings }),
    };
  }) as ToolResult;
}

/**
 * ツール定義（MCP SDK用）
 */
export const setScopeToolDefinition = {
  name: 'workflow_set_scope',
  description: 'タスクの影響範囲（変更対象ファイル/ディレクトリ）を設定します。research/requirements/planningフェーズで使用可能です。',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'タスクID（必須）',
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: '影響を受けるファイルのパスリスト',
      },
      dirs: {
        type: 'array',
        items: { type: 'string' },
        description: '影響を受けるディレクトリのパスリスト',
      },
      sessionToken: {
        type: 'string',
        description: 'セッショントークン（REQ-6: Orchestrator認証用）',
      },
      glob: {
        type: 'string',
        description: 'globパターン（オプション、例: "src/**/*.ts"）',
      },
      addMode: {
        type: 'boolean',
        description: '追加モード（true: 既存スコープとマージ、false: 置き換え、デフォルト: false）',
      },
    },
    required: [],
  },
};
