/**
 * 状態管理クラス
 *
 * ワークフローのタスク状態を管理する。
 * ファイルシステムを使用して状態を永続化する。
 *
 * 並列タスク対応: GlobalStateは廃止され、ディレクトリスキャンベースの管理に移行。
 *
 * @spec docs/workflows/ワ-クフロ-並列タスク対応/spec.md
 * @spec docs/workflows/ワ-クフロ-プラグインレビュ-指摘事項全件修正/spec.md
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import type {
  TaskState,
  PhaseName,
  SubPhaseName,
  SubPhaseStatus,
  SubPhases,
  TaskSize,
} from './types.js';
import { DEFAULT_TASK_SIZE } from './types.js';
import { PARALLEL_GROUPS } from '../phases/definitions.js';
import { taskNotFoundError } from '../utils/errors.js';
import { auditLogger } from '../audit/logger.js';
import { atomicWriteJson } from './lock-utils.js';
import { taskCache, isCacheEnabled } from './cache.js';



import { getCurrentKey, verifyWithAnyKey, signWithCurrentKey, loadKeys, attemptHmacRecovery } from './hmac.js';
import { normalizePath } from '../validation/scope-validator.js';

/**
 * セッショントークン生成
 *
 * 28バイトのランダムデータ + 8文字のタイムスタンプで64文字のトークンを生成する。
 *
 * @returns 64文字のセッショントークン
 */
export function generateSessionToken(): string {
  const random = crypto.randomBytes(28).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
  return random + timestamp;
}

/**
 * セッショントークンの検証
 *
 * トークンの形式、一致、有効期限（1時間）を確認する。
 *
 * @param token 検証するトークン
 * @param storedToken 保存されているトークン
 * @returns 有効ならtrue、無効ならfalse
 */
export function isSessionTokenValid(token: string, storedToken: string): boolean {
  if (!token || token.length !== 64) return false;
  // SEC-TIME-1修正: タイミング攻撃対策としてcrypto.timingSafeEqual()を使用
  const tokenBuf = Buffer.from(token, 'utf-8');
  const storedBuf = Buffer.from(storedToken, 'utf-8');
  if (tokenBuf.length !== storedBuf.length) return false;
  if (!crypto.timingSafeEqual(tokenBuf, storedBuf)) return false;
  const timestampHex = token.substring(56, 64);
  const tokenTime = parseInt(timestampHex, 16);
  const now = Math.floor(Date.now() / 1000);
  return (now - tokenTime) <= 3600;
}

/**
 * 監査ログの書き込み
 *
 * JSONLファイルに監査ログエントリを追記する。
 *
 * @param entry ログエントリ
 */
export function writeAuditLog(entry: Record<string, unknown>): void {
  try {
    const logPath = path.join(process.cwd(), '.claude', 'state', 'audit-log.jsonl');
    const logEntry = JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + '\n';
    fs.appendFileSync(logPath, logEntry);
  } catch {
    // Audit log write failure should not halt workflow
  }
}

/**
 * REQ-1: 同期的ファイルロック取得
 * acquireLockはasyncのため、同期APIに合わせた簡易ロック実装
 */
/**
 * FR-9: 同期スリープ（ビジーウェイト代替）
 * Atomics.wait()を使用してCPU使用率を100%から10%以下に削減
 * @spec docs/workflows/ワ-クフロ-プラグインレビュ-指摘事項全件修正/spec.md
 */
function sleepSync(ms: number): void {
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, ms);
}

function acquireLockSync(filePath: string, maxRetries = 10, retryDelay = 100): () => void {
  const lockFile = filePath + '.lock';
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const fd = fs.openSync(lockFile, 'wx');
      const lockData = JSON.stringify({ pid: process.pid, timestamp: Date.now() });
      fs.writeSync(fd, lockData);
      fs.closeSync(fd);
      return () => {
        try { fs.unlinkSync(lockFile); } catch { /* ignore */ }
      };
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'EEXIST') {
        // Check for stale lock (> 10s old)
        try {
          const stat = fs.statSync(lockFile);
          if (Date.now() - stat.mtimeMs > 10000) {
            fs.unlinkSync(lockFile);
            continue;
          }
        } catch { /* ignore */ }
        attempt++;
        // FR-9: Atomics.wait()による同期スリープ（ビジーウェイト削減）
        sleepSync(retryDelay);
        continue;
      }
      throw e;
    }
  }
  throw new Error(`ロック取得タイムアウト: ${filePath} (試行回数: ${maxRetries})`);
}
// ============================================================================
// 設定（環境変数でオーバーライド可能）
// ============================================================================

/** 状態ディレクトリのパス */
const STATE_DIR = process.env.STATE_DIR || path.join(process.cwd(), '.claude', 'state');

/** ワークフローディレクトリのパス */
const WORKFLOW_DIR = process.env.WORKFLOW_DIR || path.join(STATE_DIR, 'workflows');

/** ドキュメントディレクトリのパス（ワークフロー内部用） */
const DOCS_DIR = process.env.DOCS_DIR || path.join(process.cwd(), 'docs', 'workflows');

/** ドキュメントベースディレクトリのパス（エンタープライズ構成用） */
const DOCS_BASE = process.env.DOCS_BASE || path.join(process.cwd(), 'docs');

/** FR-1: タスクリストキャッシュファイルのパス */
const TASK_LIST_CACHE_PATH = path.join(STATE_DIR, 'task-list.json');

// 注: GlobalState と GLOBAL_STATE_FILE は廃止されました。
// 並列タスク対応により、ディレクトリスキャンベースの管理に移行しました。
// @see docs/workflows/ワ-クフロ-並列タスク対応/spec.md

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * 現在の日時をISO 8601形式で取得
 */
function getCurrentISOTimestamp(): string {
  return new Date().toISOString();
}

/**
 * 現在の日時をローカル形式で取得
 */
function getCurrentLocalTimestamp(): string {
  return new Date().toLocaleString('ja-JP');
}

/**
 * タスクIDを生成
 *
 * YYYYMMdd_HHmmss 形式のIDを生成する。
 *
 * @returns 生成されたタスクID
 */
function generateTaskId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}_${hour}${minute}${second}`;
}

/**
 * タスク名をサニタイズ
 *
 * ファイルシステムで使用可能な形式に変換する。
 * 英数字、ひらがな、カタカナ、漢字以外はハイフンに置換する。
 *
 * @param name 元のタスク名
 * @returns サニタイズされたタスク名
 */
function sanitizeTaskName(name: string): string {
  return name.replace(/[^a-zA-Z0-9ぁ-んァ-ヶ一-龠]/g, '-').replace(/-+/g, '-');
}

/**
 * JSONをファイルに書き込む
 *
 * @param filePath ファイルパス
 * @param data 書き込むデータ
 */
function writeJsonFile<T>(filePath: string, data: T): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * JSONファイルを読み込む
 *
 * @param filePath ファイルパス
 * @returns パースされたデータ、または読み込み失敗時はnull
 */
function readJsonFile<T>(filePath: string): T | null {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as T;
    }
  } catch (error) {
    console.error(`ファイル読み込みエラー: ${filePath}`, error);
  }
  return null;
}

// ============================================================================
// FR-3: HMAC署名関連（hmac.tsに統一、レガシー関数は削除）
// ============================================================================

/**
 * FR-3: タスク状態のHMAC署名を生成する（hmac.ts統一版）
 *
 * @param state タスク状態
 * @returns HMAC署名（hex文字列）
 */
export function generateStateHmac(state: TaskState): string {
  const { stateIntegrity, ...stateWithoutSignature } = state;
  const data = JSON.stringify(stateWithoutSignature, Object.keys(stateWithoutSignature).sort());
  return signWithCurrentKey(data);
}

/**
 * FR-3: タスク状態のHMAC署名を検証する（hmac.ts統一版）
 *
 * デフォルトで厳格モード: HMAC_STRICT=false の場合のみ緩和モード
 *
 * @param state タスク状態
 * @param expectedHmac 期待されるHMAC署名
 * @returns 検証結果
 */
export function verifyStateHmac(state: TaskState, expectedHmac: string): boolean {
  // 緩和モード（開発・移行時のみ）
  if (process.env.HMAC_STRICT === 'false') {
    auditLogger.log({
      event: 'bypass_enabled',
      variable: 'HMAC_STRICT',
      taskId: state.taskId,
      phase: state.phase,
    });
    return true;
  }

  // 厳格モード（デフォルト）
  if (!expectedHmac || expectedHmac.trim() === '') {
    console.warn('[HMAC] 署名なし - 拒否');
    return false;
  }

  const actualHmac = generateStateHmac(state);

  // FR-3: hmac.tsの定数時間比較関数を使用
  return verifyWithAnyKey(JSON.stringify({
    ...state,
    stateIntegrity: undefined
  }, Object.keys({...state, stateIntegrity: undefined}).sort()), expectedHmac);
}

/**
 * FR-3: 鍵キャッシュリセット（後方互換性スタブ）
 * hmac.ts統一後は鍵管理がhmac.ts側に移行したため、この関数はno-op
 */
export function _resetSignatureKeyCache(): void {
  // no-op: hmac.ts manages key caching internally
}

// ============================================================================
// WorkflowStateManager クラス
// ============================================================================

/**
 * ワークフロー状態マネージャー
 *
 * ワークフローの状態管理を担当するクラス。
 * 個別タスク状態（workflow-state.json）をディレクトリスキャンで管理する。
 *
 * 注: GlobalStateは廃止されました。並列タスク対応により、
 * activeTasks[0]を「現在のタスク」として使う設計から、
 * 明示的なtaskId指定ベースの設計に移行しました。
 */
export class WorkflowStateManager {
  /** ワークフローディレクトリのパス */
  private workflowDir: string;
  /** タスクインデックスファイルのパス(REQ-FIX-5) */
  private indexPath: string;

  /**
   * コンストラクタ
   *
   * @param workflowDir ワークフローディレクトリのパス（省略時はデフォルト）
   */
  constructor(workflowDir: string = WORKFLOW_DIR) {
    this.workflowDir = workflowDir;
    this.indexPath = path.join(STATE_DIR, 'task-index.json');
  }

  // ==========================================================================
  // タスク状態の読み書き
  // ==========================================================================

  /**
   * タスク状態を読み込む
   *
   * @param taskWorkflowDir タスクのワークフローディレクトリ
   * @returns タスク状態、またはnull
   */
  readTaskState(taskWorkflowDir: string): TaskState | null {
    const stateFile = path.join(taskWorkflowDir, 'workflow-state.json');
    const state = readJsonFile<TaskState>(stateFile);

    if (!state) {
      return null;
    }

    // Set userIntent to taskName if not already set
    if (!state.userIntent) {
      state.userIntent = state.taskName;
    }

    if (state.stateIntegrity) {
      if (!verifyStateHmac(state, state.stateIntegrity)) {
        // FR-13: HMAC自動復旧を試行
        const recovered = attemptHmacRecovery(stateFile);
        if (recovered) {
          // 復旧成功: 再度ファイルを読み込み
          const recoveredState = readJsonFile<TaskState>(stateFile);
          if (recoveredState && recoveredState.stateIntegrity && verifyStateHmac(recoveredState, recoveredState.stateIntegrity)) {
            auditLogger.log({
              event: 'hmac_auto_recover',
              taskId: recoveredState.taskId,
            });
            // FR-4: HMAC検証成功時に結果をキャッシュ
            recoveredState.validationResult = {
              verified: true,
              timestamp: Date.now(),
              keyIndex: 0,
            };
            return recoveredState;
          }
        }

        // 復旧失敗
        auditLogger.log({
          event: 'hmac_recover_failed',
          taskId: state.taskId,
        });

        console.error(`[WorkflowStateManager] 署名検証失敗: ${stateFile}`);
        console.error(`  タスク状態ファイルが改竄されている可能性があります。`);
        console.error(`  手動でファイルを編集した場合は、ファイルを削除して再度タスクを開始してください。`);
        console.error(`  自動復旧を試みる場合: HMAC_AUTO_RECOVER=true を設定してください。`);
        return null;
      }
      // FR-4: HMAC検証成功時に結果をキャッシュ
      state.validationResult = {
        verified: true,
        timestamp: Date.now(),
        keyIndex: 0, // verifyWithAnyKeyが成功した場合、どの鍵でもOK
      };
    } else {
      console.warn(`[WorkflowStateManager] 署名なしファイルを検出 - 署名を追加します: ${stateFile}`);
      this.writeTaskState(taskWorkflowDir, state);
    }

    return state;
  }

  /**
   * タスク状態を保存する（REQ-2: HMAC署名付き）
   *
   * @param taskWorkflowDir タスクのワークフローディレクトリ
   * @param state 保存するタスク状態
   */
  writeTaskState(taskWorkflowDir: string, state: TaskState): void {
    const stateFile = path.join(taskWorkflowDir, 'workflow-state.json');
    // REQ-1: ロックを取得してアトミックに書き込む
    const releaseLock = acquireLockSync(stateFile);
    try {
      const stateWithSignature = {
        ...state,
        stateIntegrity: generateStateHmac(state),
      };
      atomicWriteJson(stateFile, stateWithSignature);
    } finally {
      releaseLock();
    }

    // FR-11: キャッシュ無効化
    taskCache.invalidate('task-list');
  }

  // ==========================================================================
  // タスク発見（並列タスク対応）
  // ==========================================================================

  /**
   * task-index.jsonを読み込む(REQ-FIX-5)
   */
  private loadTaskIndex(): Record<string, string> {
    if (!fs.existsSync(this.indexPath)) {
      return {};
    }
    try {
      const data = fs.readFileSync(this.indexPath, 'utf-8');
      const parsed = JSON.parse(data);
      // Hook側スキーマ: { tasks: [...], updatedAt }
      if (parsed.tasks && Array.isArray(parsed.tasks)) {
        const index: Record<string, string> = {};
        for (const task of parsed.tasks) {
          if (task.taskId && task.workflowDir) {
            const relativePath = path.relative(
              path.dirname(this.indexPath),
              task.workflowDir
            );
            index[task.taskId] = relativePath;
          }
        }
        return index;
      }
      // レガシーマップ形式のフォールバック
      if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
      return {};
    } catch (err) {
      console.warn('[StateManager] Failed to load task index, rebuilding...', err);
      return this.rebuildTaskIndex();
    }
  }

  /**
   * task-index.jsonを保存(REQ-FIX-5)
   *
   * REQ-1修正: Hookスキーマ形式（v2）で書き込む。
   * tasks配列の各要素はworkflow-state.jsonの全フィールドを含める必要がある。
   * これはenforce-workflow.jsのHMAC検証がtask-index.jsonのタスクエントリに対して行われるため。
   */
  private saveTaskIndex(_index: Record<string, string>): void {
    try {
      const tasks = this.discoverTasks();
      const taskList = {
        schemaVersion: 2,
        tasks: tasks.map(task => ({
          ...task,  // 全フィールドを保持（HMAC検証のため）
        })),
        updatedAt: Date.now(),
      };
      const indexPath = path.join(STATE_DIR, 'task-index.json');

      // ロックを取得してアトミックに書き込む
      const releaseLock = acquireLockSync(indexPath);
      try {
        atomicWriteJson(indexPath, taskList);
      } finally {
        releaseLock();
      }
    } catch (err) {
      // 書き込み失敗は警告のみ（フック側がフォールバックスキャンで対応）
      console.error('[saveTaskIndex] Failed to write task-index.json:', err);
    }
  }

  /**
   * 単一タスクのフェーズをtask-index.jsonで直接更新する（軽量版）
   *
   * FIX-1: キャッシュ競合問題を解決
   * - saveTaskIndex()はdiscoverTasks()経由で全タスクをスキャンしてキャッシュを読む
   *   このため、フェーズ遷移時にstaleなキャッシュが返される可能性がある
   * - updateTaskIndexForSingleTask()は該当タスクのphaseフィールドのみを直接更新
   *   キャッシュスキャンを避け、高速かつ原因Aの競合を防止する
   *
   * @spec docs/workflows/task-index-jsonキャッシュ同期の根本原因修正/spec.md
   * @param taskId 更新対象のタスクID
   * @param phase 新しいフェーズ
   * @param taskState 更新後のタスク状態（HMAC付き）
   */
  private updateTaskIndexForSingleTask(
    taskId: string,
    phase: PhaseName,
    taskState: TaskState
  ): void {
    try {
      const indexPath = path.join(STATE_DIR, 'task-index.json');
      const releaseLock = acquireLockSync(indexPath);
      try {
        let taskList: { schemaVersion: number; tasks: any[]; updatedAt: number };
        if (fs.existsSync(indexPath)) {
          const content = fs.readFileSync(indexPath, 'utf8');
          taskList = JSON.parse(content);
        } else {
          taskList = { schemaVersion: 2, tasks: [], updatedAt: Date.now() };
        }

        // FIX-1: ロック内でIndex.jsonを読み込み・更新・書き込み（レースコンディション防止）
        if (phase === 'completed') {
          taskList.tasks = taskList.tasks.filter((t: any) => t.taskId !== taskId);
          console.log(`[StateManager] Removed completed task ${taskId} from index`);
        } else {
          const idx = taskList.tasks.findIndex((t: any) => t.taskId === taskId);
          const updatedEntry = { ...taskState, stateIntegrity: generateStateHmac(taskState) };
          if (idx >= 0) {
            taskList.tasks[idx] = updatedEntry;
          } else {
            taskList.tasks.push(updatedEntry);
          }
        }
        taskList.updatedAt = Date.now();

        atomicWriteJson(indexPath, taskList);
      } finally {
        releaseLock();
      }
    } catch (err) {
      // FIX-1: キャッシュ同期エラーはログするが、フェーズ遷移自体は成功した
      // workflow-state.jsonは正常に更新されているため、フック側がフォールバックスキャンで対応
      console.error('[updateTaskIndexForSingleTask] Failed to update index (non-critical):', err);
    }
  }

  /**
   * task-index.jsonを再構築(REQ-FIX-5)
   */
  private rebuildTaskIndex(): Record<string, string> {
    console.log('[StateManager] Rebuilding task index (in-memory only)...');
    const tasks = this.discoverTasks();
    const index: Record<string, string> = {};
    for (const task of tasks) {
      const taskDirName = `${task.taskId}_${task.taskName}`;
      const relativePath = path.join('workflows', taskDirName);
      index[task.taskId] = relativePath;
    }
    // REQ-1: ファイルには書き込まず、インメモリのみ
    console.log(`[StateManager] Rebuilt task index with ${tasks.length} entries (in-memory)`);
    return index;
  }

  /**
   * ディレクトリスキャンでアクティブタスクを発見
   *
   * .claude/state/workflows/ 配下のディレクトリをスキャンし、
   * 完了していないタスクの配列を返す。
   *
   * @returns 完了していないタスクの配列
   */
  discoverTasks(): TaskState[] {
    // FR-11: キャッシュチェック
    if (isCacheEnabled()) {
      const cached = taskCache.get<TaskState[]>('task-list');
      if (cached) {
        return cached;
      }
    }

    if (!fs.existsSync(this.workflowDir)) {
      return [];
    }

    try {
      const entries = fs.readdirSync(this.workflowDir);
      const tasks: TaskState[] = [];

      for (const entry of entries) {
        const entryPath = path.join(this.workflowDir, entry);
        try {
          const stat = fs.statSync(entryPath);
          if (!stat.isDirectory()) {
            continue;
          }

          const taskState = this.readTaskState(entryPath);
          if (taskState && taskState.phase !== 'completed') {
            tasks.push(taskState);
          }
        } catch {
          // 個別のエントリでエラーが発生した場合はスキップ
          continue;
        }
      }

      // FR-11: キャッシュに保存
      if (isCacheEnabled()) {
        taskCache.set('task-list', tasks);
      }

      return tasks;
    } catch {
      return [];
    }
  }

  /**
   * taskIdでタスクを取得
   *
   * ディレクトリスキャンで発見されたアクティブタスクから、
   * 指定されたtaskIdに一致するタスクを返す。
   *
   * @param taskId タスクID
   * @returns タスク状態、または存在しない場合はnull
   */
  getTaskById(taskId: string): TaskState | null {
    // REQ-FIX-5: インデックスから直接パスを取得
    const index = this.loadTaskIndex();
    const relativePath = index[taskId];

    if (relativePath) {
      const taskPath = path.join(STATE_DIR, relativePath);
      const stateFile = path.join(taskPath, 'workflow-state.json');

      if (fs.existsSync(stateFile)) {
        try {
          return this.readTaskState(taskPath);
        } catch (err) {
          console.warn(`[StateManager] Failed to read task ${taskId}, removing from index:`, err);
          delete index[taskId];
          this.saveTaskIndex(index);
        }
      } else {
        console.warn(`[StateManager] Task ${taskId} not found, removing from index`);
        delete index[taskId];
        this.saveTaskIndex(index);
      }
    }

    // フォールバック: インデックスにない場合は全スキャン
    console.warn(`[StateManager] Task ${taskId} not in index, falling back to full scan`);
    const tasks = this.discoverTasks();
    const task = tasks.find(t => t.taskId === taskId) ?? null;

    if (task) {
      const taskDirName = `${task.taskId}_${task.taskName}`;
      const newRelativePath = path.join('workflows', taskDirName);
      index[taskId] = newRelativePath;
      this.saveTaskIndex(index);
      console.log(`[StateManager] Added task ${taskId} to index`);
    }

    return task;
  }

  /**
   * ファイルパスからタスクを推論
   *
   * 指定されたファイルパスがどのタスクに属するかを推論する。
   * docsDirまたはworkflowDirのプレフィックスマッチで判定し、
   * 複数マッチする場合は最長一致のタスクを返す。
   *
   * REQ-D3: normalizePath関数を使用
   *
   * @param filePath 推論対象のファイルパス
   * @returns マッチしたタスク、またはnull
   */
  findTaskByFilePath(filePath: string): TaskState | null {
    const tasks = this.discoverTasks();
    let bestMatch: TaskState | null = null;
    let bestMatchLength = 0;

    // REQ-D3: パスを正規化
    const normalizedFilePath = normalizePath(filePath);

    for (const task of tasks) {
      // docsDirチェック（最長一致）
      if (task.docsDir) {
        const normalizedDocsDir = normalizePath(task.docsDir);
        if (normalizedFilePath.startsWith(normalizedDocsDir)) {
          if (normalizedDocsDir.length > bestMatchLength) {
            bestMatch = task;
            bestMatchLength = normalizedDocsDir.length;
          }
        }
      }

      // workflowDirチェック（最長一致）
      const normalizedWorkflowDir = normalizePath(task.workflowDir);
      if (normalizedFilePath.startsWith(normalizedWorkflowDir)) {
        if (normalizedWorkflowDir.length > bestMatchLength) {
          bestMatch = task;
          bestMatchLength = normalizedWorkflowDir.length;
        }
      }
    }

    return bestMatch;
  }

  // ==========================================================================
  // タスク作成
  // ==========================================================================

  /**
   * タスクIDを生成（公開メソッド）
   *
   * @returns 生成されたタスクID
   */
  generateTaskId(): string {
    return generateTaskId();
  }

  /**
   * タスク名をサニタイズ（公開メソッド）
   *
   * @param name 元のタスク名
   * @returns サニタイズされたタスク名
   */
  sanitizeName(name: string): string {
    return sanitizeTaskName(name);
  }

  /**
   * 新規タスクを作成
   *
   * タスクディレクトリ、状態ファイル、ログファイルを作成し、
   * グローバル状態に登録する。
   *
   * @param taskName タスク名
   * @param taskSize タスクサイズ
   * @returns 作成されたタスク状態
   */
  createTask(taskName: string, taskSize: TaskSize = DEFAULT_TASK_SIZE): TaskState {
    const taskId = generateTaskId();
    const safeName = sanitizeTaskName(taskName);
    const taskDir = path.join(this.workflowDir, `${taskId}_${safeName}`);
    const docsDir = path.join(DOCS_DIR, safeName);

    // ディレクトリ作成
    fs.mkdirSync(taskDir, { recursive: true });
    fs.mkdirSync(docsDir, { recursive: true });

    // タスク状態作成
    const taskState: TaskState = {
      phase: 'research',
      taskId,
      taskName,
      workflowDir: taskDir,
      docsDir,
      startedAt: getCurrentISOTimestamp(),
      checklist: {},
      history: [],
      subPhases: {},
      taskSize,
    };

    // タスク状態を保存
    this.writeTaskState(taskDir, taskState);

    // ログファイル作成
    this.createTaskLogFile(taskDir, taskName, taskId, taskSize, docsDir);

    // 成果物テンプレート作成
    this.createArtifactTemplates(docsDir);

    // REQ-FIX-5: インデックスに追加
    const index = this.loadTaskIndex();
    const relativePath = path.relative(STATE_DIR, taskDir);
    index[taskState.taskId] = relativePath;
    this.saveTaskIndex(index);

    // 注: GlobalStateへの登録は廃止されました。
    // タスクはディレクトリスキャンで発見されるため、
    // グローバル状態ファイルへの登録は不要です。

    return taskState;
  }

  /**
   * タスクログファイルを作成
   *
   * @param taskDir タスクディレクトリ
   * @param taskName タスク名
   * @param taskId タスクID
   * @param taskSize タスクサイズ
   * @param docsDir ドキュメントディレクトリ
   */
  private createTaskLogFile(
    taskDir: string,
    taskName: string,
    taskId: string,
    taskSize: TaskSize,
    docsDir: string,
  ): void {
    const logContent = `# ${taskName}

## 基本情報
- **タスクID**: ${taskId}
- **開始日時**: ${getCurrentLocalTimestamp()}
- **タスクサイズ**: ${taskSize}
- **ドキュメント配置先**: ${docsDir}
- **ステータス**: 進行中

---

## 作業ログ

`;
    fs.writeFileSync(path.join(taskDir, 'log.md'), logContent, 'utf-8');
  }

  // ==========================================================================
  // フェーズ更新
  // ==========================================================================

  /**
   * タスクのフェーズを更新
   *
   * 並列フェーズに遷移する場合はサブフェーズを初期化する。
   *
   * @param taskId タスクID
   * @param phase 新しいフェーズ
   * @throws タスクが見つからない場合
   */
  updateTaskPhase(taskId: string, phase: PhaseName): void {
    const taskState = this.getTaskById(taskId);
    if (!taskState) {
      throw new Error(taskNotFoundError(taskId));
    }

    // REQ-1: Read-Modify-Write全体でロック取得（writeTaskState内のロックと二重にならないよう直接書き込む）
    const stateFile = path.join(taskState.workflowDir, 'workflow-state.json');
    const releaseLock = acquireLockSync(stateFile);
    try {
      // タスク状態を更新
      taskState.phase = phase;
      // 並列フェーズの場合、サブフェーズを初期化
      taskState.subPhases = this.initializeSubPhases(phase);
      const stateWithSignature = {
        ...taskState,
        stateIntegrity: generateStateHmac(taskState),
      };
      atomicWriteJson(stateFile, stateWithSignature);
    } finally {
      releaseLock();
    }

    // FIX-1: フェーズ遷移時にtask-index.jsonを軽量更新
    // saveTaskIndex()はdiscoverTasks()経由で古いキャッシュを読む問題があるため、
    // 該当タスクのみを直接更新する軽量版を使用する
    this.updateTaskIndexForSingleTask(taskId, phase, taskState);

    // FR-11: キャッシュ無効化
    taskCache.invalidate('task-list');
  }

  /**
   * 並列フェーズのサブフェーズを初期化
   *
   * 指定されたフェーズが並列フェーズの場合、
   * そのフェーズに属する全てのサブフェーズを 'pending' 状態で初期化する。
   * 並列フェーズでない場合は空オブジェクトを返す。
   *
   * @param phase フェーズ名
   * @returns 初期化されたサブフェーズマップ
   */
  initializeSubPhases(phase: PhaseName): SubPhases {
    if (!(phase in PARALLEL_GROUPS)) {
      return {};
    }
    const subPhases: SubPhases = {};
    for (const sp of PARALLEL_GROUPS[phase]) {
      subPhases[sp] = 'pending';
    }
    return subPhases;
  }

  // ==========================================================================
  // サブフェーズ管理
  // ==========================================================================

  /**
   * サブフェーズの状態を更新
   *
   * @param taskId タスクID
   * @param subPhase サブフェーズ名
   * @param status 新しい状態
   * @throws タスクが見つからない場合、または無効なサブフェーズの場合
   */
  updateSubPhaseStatus(taskId: string, subPhase: SubPhaseName, status: SubPhaseStatus): void {
    const taskState = this.getTaskById(taskId);
    if (!taskState) {
      throw new Error(taskNotFoundError(taskId));
    }

    // サブフェーズの妥当性をチェック
    const validSubPhases = PARALLEL_GROUPS[taskState.phase] || [];
    if (!validSubPhases.includes(subPhase)) {
      throw new Error(`無効なサブフェーズ: ${subPhase}。有効: ${validSubPhases.join(', ')}`);
    }

    // サブフェーズ状態を初期化（必要な場合）
    if (!taskState.subPhases || Object.keys(taskState.subPhases).length === 0) {
      taskState.subPhases = {};
      for (const sp of validSubPhases) {
        taskState.subPhases[sp] = 'pending';
      }
    }

    // 状態を更新
    taskState.subPhases[subPhase] = status;
    this.writeTaskState(taskState.workflowDir, taskState);
  }

  /**
   * 未完了のサブフェーズを取得
   *
   * @param taskId タスクID
   * @returns 未完了サブフェーズの配列
   */
  getIncompleteSubPhases(taskId: string): SubPhaseName[] {
    const taskState = this.getTaskById(taskId);
    if (!taskState) {
      return [];
    }

    const validSubPhases = PARALLEL_GROUPS[taskState.phase] || [];
    const subPhases = taskState.subPhases || {};

    return validSubPhases.filter((sp) => subPhases[sp] !== 'completed');
  }

  // ==========================================================================
  // タスク操作
  // ==========================================================================

  // 注: switchTask は廃止されました。
  // 並列タスク対応により、明示的なtaskId指定ベースの設計に移行したため、
  // 「現在のタスク」を切り替える概念は不要になりました。

  /**
   * タスクを完了
   *
   * タスクを完了状態にする。
   *
   * @param taskId 完了するタスクID
   * @throws タスクが見つからない場合
   */
  completeTask(taskId: string): void {
    const taskState = this.getTaskById(taskId);
    if (!taskState) {
      throw new Error(taskNotFoundError(taskId));
    }

    // タスク状態を更新
    taskState.phase = 'completed';
    taskState.completedAt = getCurrentISOTimestamp();
    this.writeTaskState(taskState.workflowDir, taskState);
  }

  /**
   * タスクをリセット
   *
   * タスクをresearchフェーズに戻し、リセット履歴を記録する。
   *
   * @param taskId リセットするタスクID
   * @param reason リセット理由（オプション）
   * @throws タスクが見つからない場合
   */
  resetTask(taskId: string, reason?: string): void {
    const taskState = this.getTaskById(taskId);
    if (!taskState) {
      throw new Error(taskNotFoundError(taskId));
    }

    const fromPhase = taskState.phase;

    // リセット履歴を記録
    if (!taskState.resetHistory) {
      taskState.resetHistory = [];
    }
    taskState.resetHistory.push({
      fromPhase,
      reason: reason || '',
      timestamp: getCurrentISOTimestamp(),
    });

    // フェーズをリセット
    taskState.phase = 'research';
    taskState.subPhases = {};
    this.writeTaskState(taskState.workflowDir, taskState);
  }

  /**
   * ワークフロー成果物ディレクトリを作成
   *
   * タスク開始時に docs/workflows/{taskName}/ ディレクトリのみを作成する。
   * プロダクト仕様（docs/spec/）への配置は手動で行う。
   *
   * @param docsDir ドキュメントディレクトリ（ワークフロー成果物用）
   *
   */
  private createArtifactTemplates(docsDir: string): void {
    // ワークフロー成果物ディレクトリのみを作成
    // プロダクト仕様（docs/spec/）へのテンプレート生成は行わない
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }
  }

  // ==========================================================================
  // FR-1: タスクリストキャッシュの事前生成
  // ==========================================================================

  /**
   * FR-1: タスクリストキャッシュファイルを生成
   *
   * 全アクティブタスクの一覧をJSONファイルとして保存する。
   * フック側でこのファイルを読み込むことでディスク走査を回避し、
   * 4つのフック同時起動時のオーバーヘッドを96%削減する。
   *
   * @returns 生成成功時はtrue、失敗時はfalse
   */
  generateTaskListFile(): boolean {
    try {
      const tasks = this.discoverTasks();
      const taskList = {
        tasks: tasks.map(task => ({
          taskId: task.taskId,
          phase: task.phase,
          timestamp: Date.now(),
        })),
        generatedAt: Date.now(),
      };

      // STATE_DIRが存在しない場合は作成
      const stateDir = path.dirname(TASK_LIST_CACHE_PATH);
      if (!fs.existsSync(stateDir)) {
        fs.mkdirSync(stateDir, { recursive: true });
      }

      fs.writeFileSync(TASK_LIST_CACHE_PATH, JSON.stringify(taskList, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.warn(`[FR-1] Failed to generate task list cache: ${error}`);
      return false;
    }
  }

}

// ============================================================================
// シングルトンインスタンス
// ============================================================================

/** デフォルトの状態マネージャーインスタンス */
export const stateManager = new WorkflowStateManager();
