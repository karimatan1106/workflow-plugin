/**
 * 状態管理クラス
 *
 * ワークフローのタスク状態を管理する。
 * ファイルシステムを使用して状態を永続化する。
 *
 * 並列タスク対応: GlobalStateは廃止され、ディレクトリスキャンベースの管理に移行。
 *
 * @spec docs/workflows/ワ-クフロ-並列タスク対応/spec.md
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



import { getCurrentKey, verifyWithAnyKey, signWithCurrentKey } from './hmac.js';
/**
 * REQ-1: 同期的ファイルロック取得
 * acquireLockはasyncのため、同期APIに合わせた簡易ロック実装
 */
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
        // Busy-wait with small delay (sync context)
        const waitUntil = Date.now() + retryDelay;
        while (Date.now() < waitUntil) { /* spin */ }
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
// HMAC署名関連（REQ-2, REQ-3: 状態ファイルの改竄検出）
// ============================================================================

/** HMAC鍵ファイルのパス */
const HMAC_KEY_PATH = path.join(STATE_DIR, 'hmac.key');

/** キャッシュされたHMAC署名鍵（hexエンコード） */
let cachedSignatureKey: string | null = null;

/**
 * REQ-3: HMAC署名鍵を読み込み、または生成する
 *
 * ランダムな鍵を生成してファイルに保存し、次回以降は同じ鍵を使用する。
 * これにより、ホスト名・ユーザー名が変わっても署名が維持される。
 *
 * @returns 署名鍵（hexエンコード）
 */
export function loadOrGenerateSignatureKey(): string {
  // Return cached key if available
  if (cachedSignatureKey) {
    return cachedSignatureKey;
  }

  // Try to load existing key
  if (fs.existsSync(HMAC_KEY_PATH)) {
    try {
      const existingKey = fs.readFileSync(HMAC_KEY_PATH, 'utf-8').trim();
      if (existingKey && /^[0-9a-f]{64}$/.test(existingKey)) {
        cachedSignatureKey = existingKey;
        return cachedSignatureKey;
      }
    } catch (error) {
      console.error(`HMAC鍵読み込みエラー: ${error}`);
    }
  }

  // Generate new random key
  const keyBuffer = crypto.randomBytes(32);
  const keyHex = keyBuffer.toString('hex');

  // Save key with restricted permissions
  try {
    const keyDir = path.dirname(HMAC_KEY_PATH);
    if (!fs.existsSync(keyDir)) {
      fs.mkdirSync(keyDir, { recursive: true });
    }
    fs.writeFileSync(HMAC_KEY_PATH, keyHex, 'utf-8');
    fs.chmodSync(HMAC_KEY_PATH, 0o600);
  } catch (error) {
    console.error(`HMAC鍵保存エラー: ${error}`);
  }

  cachedSignatureKey = keyHex;
  return cachedSignatureKey;
}

/**
 * REQ-3: テスト用にキャッシュされた鍵をリセットする
 *
 * @internal テスト専用
 */
export function _resetSignatureKeyCache(): void {
  cachedSignatureKey = null;
}

/**
 * REQ-3: タスク状態のHMAC署名を生成する
 *
 * @param state タスク状態
 * @returns HMAC署名（base64エンコード）
 */
export function generateStateHmac(state: TaskState): string {
  const { stateIntegrity, ...stateWithoutSignature } = state;
  const data = JSON.stringify(stateWithoutSignature, Object.keys(stateWithoutSignature).sort());
  const keyHex = loadOrGenerateSignatureKey();
  const key = Buffer.from(keyHex, 'hex');
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(data, 'utf8');
  return hmac.digest('base64');
}

/**
 * REQ-3: タスク状態のHMAC署名を検証する
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
  try {
    const expectedBuffer = Buffer.from(expectedHmac, 'base64');
    const actualBuffer = Buffer.from(actualHmac, 'base64');

    if (expectedBuffer.length !== actualBuffer.length) {
      console.warn('[HMAC] 署名長さ不一致 - 拒否');
      return false;
    }

    const isValid = crypto.timingSafeEqual(expectedBuffer, actualBuffer);
    if (!isValid) {
      console.warn('[HMAC] 署名不一致 - 拒否');
      return false;
    }

    return true;
  } catch (error) {
    console.error('[HMAC] 検証エラー - 拒否:', error);
    return false;
  }
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

  /**
   * コンストラクタ
   *
   * @param workflowDir ワークフローディレクトリのパス（省略時はデフォルト）
   */
  constructor(workflowDir: string = WORKFLOW_DIR) {
    this.workflowDir = workflowDir;
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

    if (state.stateIntegrity) {
      if (!verifyStateHmac(state, state.stateIntegrity)) {
        console.error(`[WorkflowStateManager] 署名検証失敗: ${stateFile}`);
        console.error(`  タスク状態ファイルが改竄されている可能性があります。`);
        console.error(`  手動でファイルを編集した場合は、ファイルを削除して再度タスクを開始してください。`);
        return null;
      }
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
    const tasks = this.discoverTasks();
    return tasks.find(t => t.taskId === taskId) ?? null;
  }

  /**
   * ファイルパスからタスクを推論
   *
   * 指定されたファイルパスがどのタスクに属するかを推論する。
   * docsDirまたはworkflowDirのプレフィックスマッチで判定し、
   * 複数マッチする場合は最長一致のタスクを返す。
   *
   * @param filePath 推論対象のファイルパス
   * @returns マッチしたタスク、またはnull
   */
  findTaskByFilePath(filePath: string): TaskState | null {
    const tasks = this.discoverTasks();
    let bestMatch: TaskState | null = null;
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

}

// ============================================================================
// シングルトンインスタンス
// ============================================================================

/** デフォルトの状態マネージャーインスタンス */
export const stateManager = new WorkflowStateManager();
