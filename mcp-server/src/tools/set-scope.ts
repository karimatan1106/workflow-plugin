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
import { getTaskByIdOrError, safeExecute } from './helpers.js';
import {
  validateScopeExists,
  validateScopeDependencies,
} from '../validation/dependency-analyzer.js';
import {
  validateScopeDepth,
  validateScopeFiles,
} from '../validation/scope-validator.js';

/** スコープ設定が可能なフェーズ */
const ALLOWED_PHASES = ['research', 'requirements', 'planning'] as const;

/** スコープサイズ制限（REQ-3） */
const MAX_SCOPE_FILES = 200;
const MAX_SCOPE_DIRS = 20;

/**
 * 影響範囲を設定
 *
 * @param taskId タスクID（必須）
 * @param files 影響を受けるファイルの配列
 * @param dirs 影響を受けるディレクトリの配列
 * @returns 設定結果
 */
export function workflowSetScope(
  taskId?: string,
  files?: string[],
  dirs?: string[]
): ToolResult {
  // タスク状態を取得
  const result = getTaskByIdOrError(taskId);
  if ('error' in result) {
    return result.error as ToolResult;
  }

  const { taskState } = result;
  const currentPhase = taskState.phase;

  // research/requirements/planningフェーズでのみ許可
  if (!ALLOWED_PHASES.includes(currentPhase as typeof ALLOWED_PHASES[number])) {
    return {
      success: false,
      message: `影響範囲の設定はresearch/requirements/planningフェーズでのみ可能です（現在: ${currentPhase}）`,
    };
  }

  // 引数検証
  const affectedFiles = Array.isArray(files) ? files : [];
  const affectedDirs = Array.isArray(dirs) ? dirs : [];

  if (affectedFiles.length === 0 && affectedDirs.length === 0) {
    return {
      success: false,
      message: 'files または dirs の少なくとも1つを指定してください',
    };
  }

  // REQ-3: スコープサイズ制限チェック
  if (affectedFiles.length > MAX_SCOPE_FILES) {
    return {
      success: false,
      message: `スコープが大きすぎます（ファイル: ${affectedFiles.length}件、上限: ${MAX_SCOPE_FILES}件）。\nタスクを機能単位に分割してください。`,
    };
  }

  if (affectedDirs.length > MAX_SCOPE_DIRS) {
    return {
      success: false,
      message: `スコープが大きすぎます（ディレクトリ: ${affectedDirs.length}件、上限: ${MAX_SCOPE_DIRS}件）。\nタスクを機能単位に分割してください。`,
    };
  }

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
    },
    required: [],
  },
};
