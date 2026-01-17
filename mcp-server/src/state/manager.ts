/**
 * 状態管理クラス
 *
 * ワークフローのグローバル状態とタスク状態を管理する。
 * ファイルシステムを使用して状態を永続化する。
 *
 * @spec docs/specs/domains/workflow/mcp-server.md
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  GlobalState,
  TaskState,
  ActiveTask,
  PhaseName,
  SubPhaseName,
  SubPhaseStatus,
  SubPhases,
  TaskSize,
} from './types.js';
import { DEFAULT_TASK_SIZE } from './types.js';
import { PARALLEL_GROUPS } from '../phases/definitions.js';
import { taskNotFoundError } from '../utils/errors.js';

// ============================================================================
// 設定（環境変数でオーバーライド可能）
// ============================================================================

/** 状態ディレクトリのパス */
const STATE_DIR = process.env.STATE_DIR || path.join(process.cwd(), '.claude', 'state');

/** ワークフローディレクトリのパス */
const WORKFLOW_DIR = process.env.WORKFLOW_DIR || path.join(STATE_DIR, 'workflows');

/** ドキュメントディレクトリのパス（成果物配置用） */
const DOCS_DIR = process.env.DOCS_DIR || path.join(process.cwd(), 'docs', 'specs', 'domains');

/** グローバル状態ファイルのパス */
const GLOBAL_STATE_FILE = process.env.GLOBAL_STATE_FILE || path.join(STATE_DIR, 'workflow-state.json');

/** 初期グローバル状態 */
const INITIAL_GLOBAL_STATE: GlobalState = {
  phase: 'idle',
  activeTasks: [],
  history: [],
  checklist: {},
};

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
// WorkflowStateManager クラス
// ============================================================================

/**
 * ワークフロー状態マネージャー
 *
 * ワークフローの状態管理を担当するクラス。
 * グローバル状態（.claude/state/workflow-state.json）と
 * 個別タスク状態（workflow-state.json）の両方を管理する。
 */
export class WorkflowStateManager {
  /** グローバル状態ファイルのパス */
  private globalStatePath: string;
  /** ワークフローディレクトリのパス */
  private workflowDir: string;

  /**
   * コンストラクタ
   *
   * @param globalStatePath グローバル状態ファイルのパス（省略時はデフォルト）
   * @param workflowDir ワークフローディレクトリのパス（省略時はデフォルト）
   */
  constructor(
    globalStatePath: string = GLOBAL_STATE_FILE,
    workflowDir: string = WORKFLOW_DIR,
  ) {
    this.globalStatePath = globalStatePath;
    this.workflowDir = workflowDir;
  }

  // ==========================================================================
  // グローバル状態の読み書き
  // ==========================================================================

  /**
   * グローバル状態を読み込む
   *
   * ファイルが存在しない場合は初期状態を返す。
   *
   * @returns グローバル状態
   */
  readGlobalState(): GlobalState {
    const state = readJsonFile<GlobalState>(this.globalStatePath);
    return state ?? { ...INITIAL_GLOBAL_STATE };
  }

  /**
   * グローバル状態を保存する
   *
   * @param state 保存するグローバル状態
   */
  writeGlobalState(state: GlobalState): void {
    // 状態ディレクトリを確保
    const dir = path.dirname(this.globalStatePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    writeJsonFile(this.globalStatePath, state);
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
    return readJsonFile<TaskState>(stateFile);
  }

  /**
   * タスク状態を保存する
   *
   * @param taskWorkflowDir タスクのワークフローディレクトリ
   * @param state 保存するタスク状態
   */
  writeTaskState(taskWorkflowDir: string, state: TaskState): void {
    const stateFile = path.join(taskWorkflowDir, 'workflow-state.json');
    writeJsonFile(stateFile, state);
  }

  // ==========================================================================
  // タスク取得
  // ==========================================================================

  /**
   * 現在のアクティブタスクを取得
   *
   * アクティブタスクリストの先頭のタスクを返す。
   *
   * @returns 現在のアクティブタスク、またはnull
   */
  getCurrentTask(): ActiveTask | null {
    const globalState = this.readGlobalState();
    if (globalState.activeTasks.length === 0) {
      return null;
    }
    return globalState.activeTasks[0];
  }

  /**
   * タスクIDからアクティブタスクを検索
   *
   * @param taskId 検索するタスクID
   * @returns 見つかったアクティブタスクとそのインデックス、またはnull
   */
  private findActiveTaskById(taskId: string): { task: ActiveTask; index: number; globalState: GlobalState } | null {
    const globalState = this.readGlobalState();
    const index = globalState.activeTasks.findIndex((t) => t.taskId === taskId);
    if (index === -1) {
      return null;
    }
    return { task: globalState.activeTasks[index], index, globalState };
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

    // グローバル状態更新
    this.addTaskToGlobalState(taskId, taskName, taskDir, taskSize);

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

  /**
   * タスクをグローバル状態に追加
   *
   * @param taskId タスクID
   * @param taskName タスク名
   * @param taskDir タスクディレクトリ
   * @param taskSize タスクサイズ
   */
  private addTaskToGlobalState(
    taskId: string,
    taskName: string,
    taskDir: string,
    taskSize: TaskSize,
  ): void {
    const globalState = this.readGlobalState();
    globalState.activeTasks.unshift({
      taskId,
      taskName,
      workflowDir: taskDir,
      phase: 'research',
      taskSize,
    });
    this.writeGlobalState(globalState);
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
    const found = this.findActiveTaskById(taskId);
    if (!found) {
      throw new Error(taskNotFoundError(taskId));
    }

    const { task, globalState } = found;

    // グローバル状態更新
    task.phase = phase;
    this.writeGlobalState(globalState);

    // タスク状態更新
    const taskState = this.readTaskState(task.workflowDir);
    if (taskState) {
      taskState.phase = phase;
      // 並列フェーズの場合、サブフェーズを初期化
      taskState.subPhases = this.initializeSubPhases(phase);
      this.writeTaskState(task.workflowDir, taskState);
    }
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
    const found = this.findActiveTaskById(taskId);
    if (!found) {
      throw new Error(taskNotFoundError(taskId));
    }

    const taskState = this.readTaskState(found.task.workflowDir);
    if (!taskState) {
      throw new Error(`タスク状態が見つかりません: ${taskId}`);
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
    this.writeTaskState(found.task.workflowDir, taskState);
  }

  /**
   * 未完了のサブフェーズを取得
   *
   * @param taskId タスクID
   * @returns 未完了サブフェーズの配列
   */
  getIncompleteSubPhases(taskId: string): SubPhaseName[] {
    const found = this.findActiveTaskById(taskId);
    if (!found) {
      return [];
    }

    const taskState = this.readTaskState(found.task.workflowDir);
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

  /**
   * タスクを切り替え
   *
   * 指定されたタスクをアクティブタスクリストの先頭に移動する。
   *
   * @param taskId 切り替え先のタスクID
   * @returns 切り替えたタスク、または見つからない場合はnull
   */
  switchTask(taskId: string): ActiveTask | null {
    const globalState = this.readGlobalState();
    const taskIndex = globalState.activeTasks.findIndex((t) => t.taskId === taskId);
    if (taskIndex === -1) {
      return null;
    }

    // タスクを配列から取り出し、先頭に追加
    const [task] = globalState.activeTasks.splice(taskIndex, 1);
    globalState.activeTasks.unshift(task);
    this.writeGlobalState(globalState);

    return task;
  }

  /**
   * タスクを完了
   *
   * タスクを完了状態にし、グローバル状態から削除する。
   *
   * @param taskId 完了するタスクID
   * @throws タスクが見つからない場合
   */
  completeTask(taskId: string): void {
    const found = this.findActiveTaskById(taskId);
    if (!found) {
      throw new Error(taskNotFoundError(taskId));
    }

    const { task, index, globalState } = found;

    // タスク状態を更新
    const taskState = this.readTaskState(task.workflowDir);
    if (taskState) {
      taskState.phase = 'completed';
      taskState.completedAt = getCurrentISOTimestamp();
      taskState.history = globalState.history;
      taskState.checklist = globalState.checklist;
      this.writeTaskState(task.workflowDir, taskState);
    }

    // グローバル状態からタスクを削除
    globalState.activeTasks.splice(index, 1);

    // アクティブタスクがなくなった場合はクリーンアップ
    if (globalState.activeTasks.length === 0) {
      globalState.history = [];
      globalState.checklist = {};
      globalState.phase = 'idle';
    }

    this.writeGlobalState(globalState);
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
    const found = this.findActiveTaskById(taskId);
    if (!found) {
      throw new Error(taskNotFoundError(taskId));
    }

    const { task, globalState } = found;

    const taskState = this.readTaskState(task.workflowDir);
    if (!taskState) {
      throw new Error(`タスク状態が見つかりません: ${taskId}`);
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
    this.writeTaskState(task.workflowDir, taskState);

    // グローバル状態も更新
    task.phase = 'research';
    this.writeGlobalState(globalState);
  }
}

// ============================================================================
// シングルトンインスタンス
// ============================================================================

/** デフォルトの状態マネージャーインスタンス */
export const stateManager = new WorkflowStateManager();
