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
const { getCached } = require('./task-cache');

/** ワークフローディレクトリのパス */
const STATE_DIR = process.env.STATE_DIR || path.join(process.cwd(), '.claude', 'state');
const WORKFLOW_DIR = process.env.WORKFLOW_DIR || path.join(STATE_DIR, 'workflows');

/** タスクインデックスキャッシュファイル（1時間TTL） */
const TASK_INDEX_FILE = path.join(STATE_DIR, 'task-index.json');
const TASK_INDEX_TTL = 60 * 60 * 1000; // 1 hour

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
 * タスクインデックスキャッシュを読み込む
 *
 * @returns {Array<object>|null} キャッシュされたタスク配列、または null（期限切れ/存在しない）
 */
function readTaskIndexCache() {
  try {
    const cache = safeReadJsonFile(TASK_INDEX_FILE);
    if (!cache || !cache.tasks || !cache.updatedAt) {
      return null;
    }

    const now = Date.now();
    const age = now - cache.updatedAt;

    // TTL（1時間）を超えている場合は無効
    if (age > TASK_INDEX_TTL) {
      return null;
    }

    return cache.tasks;
  } catch {
    return null;
  }
}

/**
 * タスクインデックスキャッシュに書き込む
 *
 * @param {Array<object>} tasks - タスク配列
 */
function writeTaskIndexCache(tasks) {
  try {
    const cache = {
      tasks: tasks,
      updatedAt: Date.now()
    };
    fs.writeFileSync(TASK_INDEX_FILE, JSON.stringify(cache, null, 2), 'utf8');
  } catch {
    // キャッシュ書き込みエラーは無視（パフォーマンス最適化であり必須ではない）
  }
}

/**
 * ディレクトリスキャンでアクティブタスクを発見
 *
 * .claude/state/workflows/ 配下のディレクトリをスキャンし、
 * 完了していないタスクの配列を返す。
 *
 * REQ-A1: TTL付きメモリキャッシュで高速化（300秒キャッシュ）
 * REQ-P1: ファイルベースのtask-index.jsonキャッシュ（1時間TTL）
 *
 * @returns {Array<{taskId: string, taskName: string, workflowDir: string, phase: string, docsDir?: string, scope?: object}>}
 */
function discoverTasks() {
  return getCached('discover-tasks', undefined, () => {
    // task-index.jsonキャッシュを試す
    const cachedTasks = readTaskIndexCache();
    if (cachedTasks !== null) {
      return cachedTasks;
    }

    // キャッシュミス：ファイルシステムスキャン
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

      // task-index.jsonキャッシュに書き込む
      writeTaskIndexCache(tasks);

      return tasks;
    } catch {
      return [];
    }
  });
}

/**
 * パス文字列を正規化（バックスラッシュをスラッシュに統一）
 *
 * Windows/Unix両対応のため、パス区切り文字を統一する。
 *
 * @param {string} filePath パス文字列
 * @returns {string} 正規化されたパス
 */
function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/');
}

/**
 * REQ-A3: パス境界チェック付きプレフィックスマッチ
 *
 * 誤マッチを防ぐため、プレフィックス一致後にパス境界（/ または終端）を確認する。
 *
 * 例:
 * - "docs/workflows/foo/" と "docs/workflows/foo-bar/" は別タスク
 * - "docs/workflows/foo" と "docs/workflows/foo/" は同一タスク
 *
 * @param {string} filePath ファイルパス
 * @param {string} dirPath ディレクトリパス
 * @returns {boolean} パス境界を考慮したマッチ判定
 */
function isPrefixMatchWithBoundary(filePath, dirPath) {
  if (!filePath.startsWith(dirPath)) {
    return false;
  }

  // ディレクトリパスの末尾がスラッシュの場合、既に境界が明確
  if (dirPath.endsWith('/')) {
    return true;
  }

  // ファイルパスがディレクトリパスと完全一致（dirPath自体がファイル）
  if (filePath === dirPath) {
    return true;
  }

  // ファイルパスの次の文字がスラッシュであることを確認（境界チェック）
  return filePath[dirPath.length] === '/';
}

/**
 * ファイルパスからタスクを推論
 *
 * 指定されたファイルパスがどのタスクに属するかを推論する。
 * docsDirまたはworkflowDirのプレフィックスマッチで判定し、
 * 複数マッチする場合は最長一致のタスクを返す。
 *
 * REQ-A3: パス境界チェックで誤マッチを防止
 *
 * @param {string} filePath 推論対象のファイルパス
 * @returns {{taskId: string, taskName: string, workflowDir: string, phase: string, scope?: object}|null}
 */
function findTaskByFilePath(filePath) {
  const tasks = discoverTasks();
  let bestMatch = null;
  let bestMatchLength = 0;

  // パスを正規化（バックスラッシュをスラッシュに統一）
  const normalizedFilePath = normalizePath(filePath);

  for (const task of tasks) {
    // docsDirチェック（最長一致 + パス境界）
    if (task.docsDir) {
      const normalizedDocsDir = normalizePath(task.docsDir);
      if (isPrefixMatchWithBoundary(normalizedFilePath, normalizedDocsDir)) {
        if (normalizedDocsDir.length > bestMatchLength) {
          bestMatch = task;
          bestMatchLength = normalizedDocsDir.length;
        }
      }
    }

    // workflowDirチェック（最長一致 + パス境界）
    const normalizedWorkflowDir = normalizePath(task.workflowDir);
    if (isPrefixMatchWithBoundary(normalizedFilePath, normalizedWorkflowDir)) {
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
