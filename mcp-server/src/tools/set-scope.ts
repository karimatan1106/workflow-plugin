/**
 * workflow_set_scope ツール - 影響範囲を設定
 *
 * researchフェーズで変更対象ファイル/ディレクトリをTaskStateに記録する。
 *
 * @spec docs/workflows/ワークフロー大規模対応改善/spec.md
 */

import { stateManager } from '../state/manager.js';
import type { ToolResult } from '../state/types.js';
import { getTaskByIdOrError, safeExecute } from './helpers.js';

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

  // researchフェーズでのみ許可
  if (currentPhase !== 'research') {
    return {
      success: false,
      message: `影響範囲の設定はresearchフェーズでのみ可能です（現在: ${currentPhase}）`,
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
    };
  }) as ToolResult;
}

/**
 * ツール定義（MCP SDK用）
 */
export const setScopeToolDefinition = {
  name: 'workflow_set_scope',
  description: 'タスクの影響範囲（変更対象ファイル/ディレクトリ）を設定します。researchフェーズでのみ使用可能です。',
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
