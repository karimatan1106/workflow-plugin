#!/usr/bin/env node
/**
 * タスク検出共通ロジック
 *
 * phase-edit-guard.js と enforce-workflow.js で使用する
 * タスク検出ロジックを共通化したモジュール。
 *
 * @spec docs/workflows/ワークフロー大規模対応改善/spec.md
 */

const fs = require('fs');
const path = require('path');

/** ワークフローディレクトリのパス */
const STATE_DIR = process.env.STATE_DIR || path.join(process.cwd(), '.claude', 'state');
const WORKFLOW_DIR = process.env.WORKFLOW_DIR || path.join(STATE_DIR, 'workflows');

/**
 * JSONファイルを安全に読み込む
 *
 * @param {string} filePath - ファイルパス
 * @returns {object|null} パースされたJSONオブジェクト、または null
 */
function safeReadJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    return null;
  }
}

/**
 * ディレクトリスキャンでアクティブタスクを発見
 *
 * .claude/state/workflows/ 配下のディレクトリをスキャンし、
 * 完了していないタスクの配列を返す。
 *
 * @returns {Array<{taskId: string, taskName: string, workflowDir: string, phase: string, docsDir?: string, scope?: object}>}
 */
function discoverTasks() {
  if (!fs.existsSync(WORKFLOW_DIR)) {
    return [];
  }

  try {
    const entries = fs.readdirSync(WORKFLOW_DIR);
    const tasks = [];

    for (const entry of entries) {
      const entryPath = path.join(WORKFLOW_DIR, entry);
      try {
        const stat = fs.statSync(entryPath);
        if (!stat.isDirectory()) {
          continue;
        }

        const stateFile = path.join(entryPath, 'workflow-state.json');
        const taskState = safeReadJsonFile(stateFile);
        if (taskState && taskState.phase !== 'completed') {
          tasks.push(taskState);
        }
      } catch {
        // 個別のエントリでエラーが発生した場合はスキップ
        continue;
      }
    }

    // B-1: taskId descending sort (newest first)
    // taskId is YYYYMMDD_HHMMSS format, string comparison preserves chronological order
    tasks.sort((a, b) => (b.taskId || '').localeCompare(a.taskId || ''));

    return tasks;
  } catch {
    return [];
  }
}

/**
 * ファイルパスからタスクを推論
 *
 * 指定されたファイルパスがどのタスクに属するかを推論する。
 * docsDirまたはworkflowDirのプレフィックスマッチで判定し、
 * 複数マッチする場合は最長一致のタスクを返す。
 *
 * @param {string} filePath 推論対象のファイルパス
 * @returns {{taskId: string, taskName: string, workflowDir: string, phase: string, scope?: object}|null}
 */
function findTaskByFilePath(filePath) {
  const tasks = discoverTasks();
  let bestMatch = null;
  let bestMatchLength = 0;

  // パスを正規化（バックスラッシュをスラッシュに統一）
  const normalizedFilePath = filePath.replace(/\\/g, '/');

  for (const task of tasks) {
    // docsDirチェック（最長一致）
    if (task.docsDir) {
      const normalizedDocsDir = task.docsDir.replace(/\\/g, '/');
      if (normalizedFilePath.startsWith(normalizedDocsDir)) {
        if (normalizedDocsDir.length > bestMatchLength) {
          bestMatch = task;
          bestMatchLength = normalizedDocsDir.length;
        }
      }
    }

    // workflowDirチェック（最長一致）
    const normalizedWorkflowDir = task.workflowDir.replace(/\\/g, '/');
    if (normalizedFilePath.startsWith(normalizedWorkflowDir)) {
      if (normalizedWorkflowDir.length > bestMatchLength) {
        bestMatch = task;
        bestMatchLength = normalizedWorkflowDir.length;
      }
    }
  }

  return bestMatch;
}

module.exports = {
  discoverTasks,
  findTaskByFilePath,
};
