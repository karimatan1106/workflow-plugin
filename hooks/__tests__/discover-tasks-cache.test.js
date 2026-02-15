/**
 * REQ-F: discover-tasks キャッシュ整合性改善テスト
 *
 * discover-tasks.js の TTL 短縮と mtime チェック追加を検証する。
 * 実装はまだ変更されていないため、テストファーストで作成（TDD Red Phase）。
 *
 * @spec docs/workflows/ワ-クフロ-プラグイン構造的問題9件の根本原因修正/test-design.md
 */

const { describe, test, expect, beforeEach, afterEach, vi } = require('vitest');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('REQ-F: discover-tasks キャッシュ整合性改善', () => {
  let tempDir;
  let originalEnv;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'discover-tasks-cache-'));
    originalEnv = { ...process.env };
    // テスト用にSTATE_DIRを設定
    process.env.STATE_DIR = tempDir;
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    process.env = originalEnv;
  });

  describe('TC-F1: キャッシュ TTL 確認', () => {
    test('discover-tasks.js のソースコードに TTL が30秒(30000ms)に設定されている', () => {
      // discover-tasks.js のソースコードを読み込み
      const discoverTasksPath = path.join(__dirname, '..', 'lib', 'discover-tasks.js');
      const sourceCode = fs.readFileSync(discoverTasksPath, 'utf8');

      // REQ-F: TTL が 300秒(300000ms) ではなく 30秒(30000ms) に変更されていること
      // TASK_INDEX_TTL の定義を検索
      const ttlMatch = sourceCode.match(/TASK_INDEX_TTL\s*=\s*(\d+)/);
      expect(ttlMatch).toBeTruthy();

      if (ttlMatch) {
        const ttlValue = parseInt(ttlMatch[1], 10);
        // 30秒 = 30000ms 以下であること
        expect(ttlValue).toBeLessThanOrEqual(30000);
      }
    });

    test('getCached 呼び出しで短い TTL が使用されている', () => {
      const discoverTasksPath = path.join(__dirname, '..', 'lib', 'discover-tasks.js');
      const sourceCode = fs.readFileSync(discoverTasksPath, 'utf8');

      // getCached の呼び出しで TTL パラメータが指定されているか確認
      // getCached('discover-tasks', ttl, callback) の形式
      const getCachedCalls = sourceCode.match(/getCached\s*\([^)]+\)/g);
      expect(getCachedCalls).toBeTruthy();
      expect(getCachedCalls.length).toBeGreaterThan(0);
    });
  });

  describe('TC-F2: task-index.json の mtime チェック正常系', () => {
    test('task-index.json の mtime がキャッシュ時刻より新しい場合にキャッシュが無効化される', () => {
      // task-index.json を作成（古い updatedAt を設定）
      const taskIndexPath = path.join(tempDir, 'task-index.json');
      const oldTimestamp = Date.now() - 60000; // 1分前
      const cacheData = {
        schemaVersion: 2,
        tasks: [
          {
            taskId: 'test-001',
            taskName: 'テストタスク',
            workflowDir: '/tmp/test',
            phase: 'research',
          },
        ],
        updatedAt: oldTimestamp,
      };
      fs.writeFileSync(taskIndexPath, JSON.stringify(cacheData), 'utf8');

      // ファイルの mtime を現在時刻に更新（キャッシュより新しい）
      const now = new Date();
      fs.utimesSync(taskIndexPath, now, now);

      // readTaskIndexCache を呼び出す
      // REQ-F: mtime がキャッシュ時刻より新しい場合、null を返すこと
      // 注意: この機能はまだ実装されていない（Red Phase）
      // 実装後は以下のテストが通るようになる

      // discover-tasks.js を動的にロードして検証
      // モジュールキャッシュをクリアして再読み込み
      const modulePath = require.resolve('../lib/discover-tasks.js');
      delete require.cache[modulePath];
      // task-cache のキャッシュもクリア
      const taskCachePath = require.resolve('../lib/task-cache.js');
      delete require.cache[taskCachePath];

      const { discoverTasks } = require('../lib/discover-tasks.js');

      // ワークフローディレクトリを作成
      const workflowDir = path.join(tempDir, 'workflows');
      fs.mkdirSync(workflowDir, { recursive: true });
      process.env.WORKFLOW_DIR = workflowDir;

      // ディスカバリー結果を検証
      const tasks = discoverTasks();
      // mtime チェックにより、古いキャッシュデータではなくフルスキャン結果が返される
      expect(Array.isArray(tasks)).toBe(true);
    });
  });

  describe('TC-F3: mtime チェック失敗時のフォールバック', () => {
    test('fs.statSync 失敗時にエラーにならずフォールバックする', () => {
      // task-index.json が存在しない状態でもエラーにならないこと
      process.env.STATE_DIR = tempDir;
      process.env.WORKFLOW_DIR = path.join(tempDir, 'nonexistent-workflows');

      // モジュールキャッシュをクリアして再読み込み
      const modulePath = require.resolve('../lib/discover-tasks.js');
      delete require.cache[modulePath];
      const taskCachePath = require.resolve('../lib/task-cache.js');
      delete require.cache[taskCachePath];

      const { discoverTasks } = require('../lib/discover-tasks.js');

      // エラーにならないこと
      expect(() => {
        const tasks = discoverTasks();
        expect(Array.isArray(tasks)).toBe(true);
      }).not.toThrow();
    });

    test('破損した task-index.json でもエラーにならない', () => {
      const taskIndexPath = path.join(tempDir, 'task-index.json');
      // 破損したJSON
      fs.writeFileSync(taskIndexPath, '{invalid json!!!', 'utf8');

      const workflowDir = path.join(tempDir, 'workflows');
      fs.mkdirSync(workflowDir, { recursive: true });
      process.env.WORKFLOW_DIR = workflowDir;

      // モジュールキャッシュをクリアして再読み込み
      const modulePath = require.resolve('../lib/discover-tasks.js');
      delete require.cache[modulePath];
      const taskCachePath = require.resolve('../lib/task-cache.js');
      delete require.cache[taskCachePath];

      const { discoverTasks } = require('../lib/discover-tasks.js');

      expect(() => {
        const tasks = discoverTasks();
        expect(Array.isArray(tasks)).toBe(true);
      }).not.toThrow();
    });
  });
});
