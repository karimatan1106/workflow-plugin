/**
 * workflow_reset ツール - タスクをリセット
 *
 * 指定されたタスクをresearchフェーズにリセットする。
 * リセット履歴が記録される。
 *
 * @spec docs/workflows/ワ-クフロ-並列タスク対応/spec.md
 */

import { stateManager } from '../state/manager.js';
import type { ResetResult } from '../state/types.js';
import { getTaskByIdOrError, safeExecute, verifySessionToken } from './helpers.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 全成果物ファイルパターン定義
 */
const ARTIFACT_PATTERNS = [
  'research.md',
  'requirements.md',
  'spec.md',
  'threat-model.md',
  'state-machine.mmd',
  'flowchart.mmd',
  'ui-design.md',
  'test-design.md',
  'code-review.md',
  'manual-test.md',
  'security-scan.md',
  'performance-test.md',
  'e2e-test.md',
];

/**
 * REQ-C4: 全成果物をバックアップ（同期版）
 *
 * @param workflowDir ワークフローディレクトリ
 * @param taskId タスクID
 * @returns 移動した成果物ファイルのリスト
 */
function resetAllArtifactsSync(workflowDir: string, taskId: string): string[] {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(workflowDir, `backup_${taskId}_${timestamp}`);

  // バックアップディレクトリを作成
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const movedFiles: string[] = [];
  const taskName = path.basename(workflowDir).split('_').slice(1).join('_');
  const docsPath = path.join(workflowDir, '..', '..', 'docs', 'workflows', taskName);

  for (const pattern of ARTIFACT_PATTERNS) {
    const filePath = path.join(docsPath, pattern);
    if (fs.existsSync(filePath)) {
      const destPath = path.join(backupDir, pattern);
      fs.renameSync(filePath, destPath);
      movedFiles.push(pattern);
    }
  }

  return movedFiles;
}

/**
 * タスクをresearchフェーズにリセット
 *
 * @param taskId タスクID（必須）
 * @param reason リセット理由（オプション）
 * @param sessionToken セッショントークン（オプション、REQ-6）
 * @returns リセット結果
 */
export function workflowReset(taskId?: string, reason?: string, sessionToken?: string): ResetResult {
  // タスク状態を取得
  const result = getTaskByIdOrError(taskId);
  if ('error' in result) {
    return result.error as ResetResult;
  }

  const { taskState } = result;

  // REQ-6: セッショントークン検証
  const tokenError = verifySessionToken(taskState, sessionToken);
  if (tokenError) return tokenError as ResetResult;

  const fromPhase = taskState.phase;

  // リセット処理を実行
  try {
    // REQ-C4: 全成果物をバックアップ
    resetAllArtifactsSync(taskState.workflowDir, taskState.taskId);

    stateManager.resetTask(taskState.taskId, reason);

    return {
      success: true,
      taskId: taskState.taskId,
      fromPhase,
      toPhase: 'research',
      reason: reason || '',
      message: `${fromPhase} → research にリセットしました`,
    };
  } catch (error) {
    return {
      success: false,
      message: `リセット処理中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * ツール定義（MCP SDK用）
 *
 * MCPサーバーがクライアントに公開するツールのスキーマ定義。
 */
export const resetToolDefinition = {
  name: 'workflow_reset',
  description: '指定されたタスクをresearchフェーズにリセットします。リセット理由を記録できます。',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'タスクID（必須）',
      },
      reason: {
        type: 'string',
        description: 'リセット理由（オプション）',
      },
      sessionToken: {
        type: 'string',
        description: 'セッショントークン（REQ-6: Orchestrator認証用）',
      },
    },
    required: [],
  },
};
