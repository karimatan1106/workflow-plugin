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

    // タスク状態を更新
    taskState.phase = phase;
    // 並列フェーズの場合、サブフェーズを初期化
    taskState.subPhases = this.initializeSubPhases(phase);
    this.writeTaskState(taskState.workflowDir, taskState);
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
