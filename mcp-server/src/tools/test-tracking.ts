/**
 * テスト追跡ツール
 *
 * テストファイルの記録とベースライン管理を行うMCPツール。
 *
 * @spec docs/spec/features/test-tracking.md
 */

import { stateManager } from '../state/manager.js';
import type { ToolResult, TestBaseline, KnownBug, BugSeverity, BugTargetPhase } from '../state/types.js';
import { getTaskByIdOrError, safeExecute } from './helpers.js';

// ============================================================================
// workflow_record_test - テストファイル記録
// ============================================================================

/**
 * テストファイル記録結果
 */
export interface RecordTestResult extends ToolResult {
  /** 記録されたテストファイル */
  testFile?: string;
  /** 現在の登録済みテストファイル一覧 */
  testFiles?: string[];
}

/**
 * テストファイルを記録
 *
 * test_implフェーズで作成したテストファイルをタスク状態に記録する。
 *
 * @param taskId タスクID
 * @param testFile テストファイルパス
 * @returns 記録結果
 */
export function workflowRecordTest(taskId: string, testFile: string): RecordTestResult {
  // タスク状態を取得
  const result = getTaskByIdOrError(taskId);
  if ('error' in result) {
    return result.error as RecordTestResult;
  }

  const { taskState } = result;

  // test_implフェーズ以外ではエラー
  if (taskState.phase !== 'test_impl') {
    return {
      success: false,
      message: `テストファイルの記録はtest_implフェーズでのみ可能です。現在: ${taskState.phase}`,
    };
  }

  // テストファイルパスの検証
  if (!testFile || typeof testFile !== 'string') {
    return {
      success: false,
      message: 'テストファイルパスが必要です',
    };
  }

  // テストファイルパターンの検証
  const isTestFile = testFile.includes('.test.') ||
                     testFile.includes('.spec.') ||
                     testFile.includes('__tests__');
  if (!isTestFile) {
    return {
      success: false,
      message: 'テストファイルは .test. または .spec. を含むか、__tests__ ディレクトリ内である必要があります',
    };
  }

  return safeExecute('テストファイル記録', () => {
    // 既存のテストファイル配列を取得または初期化
    const testFiles = taskState.testFiles || [];

    // 重複チェック
    if (testFiles.includes(testFile)) {
      return {
        success: true,
        testFile,
        testFiles,
        message: `テストファイルは既に記録済みです: ${testFile}`,
      };
    }

    // テストファイルを追加
    testFiles.push(testFile);
    taskState.testFiles = testFiles;

    // 状態を保存
    stateManager.writeTaskState(taskState.workflowDir, taskState);

    return {
      success: true,
      testFile,
      testFiles,
      message: `テストファイルを記録しました: ${testFile}（合計: ${testFiles.length}件）`,
    };
  }) as RecordTestResult;
}

/**
 * workflow_record_test ツール定義
 */
export const recordTestToolDefinition = {
  name: 'workflow_record_test',
  description: 'test_implフェーズで作成したテストファイルを記録します。testingフェーズで実行すべきテストの一覧管理に使用します。',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'タスクID（必須）',
      },
      testFile: {
        type: 'string',
        description: 'テストファイルのパス（例: src/tests/foo.test.ts）',
      },
    },
    required: ['taskId', 'testFile'],
  },
};

// ============================================================================
// workflow_capture_baseline - テストベースライン記録
// ============================================================================

/**
 * ベースライン記録結果
 */
export interface CaptureBaselineResult extends ToolResult {
  /** 記録されたベースライン */
  baseline?: TestBaseline;
}

/**
 * テストベースラインを記録
 *
 * researchフェーズで既存テストの状態を記録する。
 * regression_testフェーズでの比較に使用する。
 *
 * @param taskId タスクID
 * @param totalTests テスト総数
 * @param passedTests 成功したテスト数
 * @param failedTests 失敗したテスト名の配列
 * @returns 記録結果
 */
export function workflowCaptureBaseline(
  taskId: string,
  totalTests: number,
  passedTests: number,
  failedTests: string[]
): CaptureBaselineResult {
  // タスク状態を取得
  const result = getTaskByIdOrError(taskId);
  if ('error' in result) {
    return result.error as CaptureBaselineResult;
  }

  const { taskState } = result;

  // B-3: research and testing phases allowed (testing = deferred baseline)
  const baselineAllowedPhases = ['research', 'testing'];
  if (!baselineAllowedPhases.includes(taskState.phase)) {
    return {
      success: false,
      message: `ベースライン記録はresearch/testingフェーズでのみ可能です。現在: ${taskState.phase}`,
    };
  }

  // Warning log for testing phase baseline recording
  if (taskState.phase === 'testing') {
    console.warn(`[warning] Testing phase baseline recording (deferred baseline) task: ${taskId}`);
    console.warn(`Recommendation: record baseline during research phase in the future`);
  }

  // パラメータ検証
  if (typeof totalTests !== 'number' || totalTests < 0) {
    return {
      success: false,
      message: 'totalTestsは0以上の数値である必要があります',
    };
  }

  if (typeof passedTests !== 'number' || passedTests < 0) {
    return {
      success: false,
      message: 'passedTestsは0以上の数値である必要があります',
    };
  }

  if (!Array.isArray(failedTests)) {
    return {
      success: false,
      message: 'failedTestsは配列である必要があります',
    };
  }

  return safeExecute('ベースライン記録', () => {
    const baseline: TestBaseline = {
      capturedAt: new Date().toISOString(),
      totalTests,
      passedTests,
      failedTests,
    };

    taskState.testBaseline = baseline;

    // 状態を保存
    stateManager.writeTaskState(taskState.workflowDir, taskState);

    return {
      success: true,
      baseline,
      message: `テストベースラインを記録しました。総数: ${totalTests}、成功: ${passedTests}、失敗: ${failedTests.length}`,
    };
  }) as CaptureBaselineResult;
}

/**
 * workflow_capture_baseline ツール定義
 */
export const captureBaselineToolDefinition = {
  name: 'workflow_capture_baseline',
  description: 'researchフェーズで既存テストの状態をベースラインとして記録します。regression_testフェーズでの比較に使用します。',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'タスクID（必須）',
      },
      totalTests: {
        type: 'number',
        description: 'テスト総数',
      },
      passedTests: {
        type: 'number',
        description: '成功したテスト数',
      },
      failedTests: {
        type: 'array',
        items: { type: 'string' },
        description: '失敗したテスト名の配列',
      },
    },
    required: ['taskId', 'totalTests', 'passedTests', 'failedTests'],
  },
};

// ============================================================================
// workflow_get_test_info - テスト情報取得
// ============================================================================

/**
 * テスト情報取得結果
 */
export interface GetTestInfoResult extends ToolResult {
  /** 登録済みテストファイル */
  testFiles?: string[];
  /** テストベースライン */
  baseline?: TestBaseline;
}

/**
 * テスト情報を取得
 *
 * タスクに登録されているテストファイルとベースラインを取得する。
 *
 * @param taskId タスクID
 * @returns テスト情報
 */
export function workflowGetTestInfo(taskId: string): GetTestInfoResult {
  // タスク状態を取得
  const result = getTaskByIdOrError(taskId);
  if ('error' in result) {
    return result.error as GetTestInfoResult;
  }

  const { taskState } = result;

  return {
    success: true,
    testFiles: taskState.testFiles || [],
    baseline: taskState.testBaseline,
    message: `テストファイル: ${(taskState.testFiles || []).length}件、ベースライン: ${taskState.testBaseline ? '記録済み' : '未記録'}`,
  };
}

/**
 * workflow_get_test_info ツール定義
 */
export const getTestInfoToolDefinition = {
  name: 'workflow_get_test_info',
  description: 'タスクに登録されているテストファイルとベースライン情報を取得します。',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'タスクID（必須）',
      },
    },
    required: ['taskId'],
  },
};

// ============================================================================
// workflow_record_known_bug - 既知バグ記録
// ============================================================================

/**
 * 既知バグ記録結果
 */
export interface RecordKnownBugResult extends ToolResult {
  /** 生成されたバグID */
  bugId?: string;
  /** 現在の既知バグ一覧 */
  knownBugs?: KnownBug[];
}

/**
 * バグIDを生成
 *
 * @param existingBugs 既存のバグ一覧
 * @returns 新しいバグID（BUG-001形式）
 */
function generateBugId(existingBugs: KnownBug[]): string {
  const maxId = existingBugs.reduce((max, bug) => {
    const num = parseInt(bug.bugId.replace('BUG-', ''), 10);
    return Math.max(max, isNaN(num) ? 0 : num);
  }, 0);
  return `BUG-${String(maxId + 1).padStart(3, '0')}`;
}

/**
 * 既知バグを記録
 *
 * regression_testフェーズで既存バグを記録する。
 * テスト削除ではなく、バグを適切に追跡するために使用する。
 *
 * @param taskId タスクID
 * @param testName 失敗するテスト名
 * @param description バグの説明
 * @param severity 深刻度
 * @param issueUrl 関連Issue URL（オプション）
 * @param targetPhase 対応予定（デフォルト: backlog）
 * @returns 記録結果
 */
export function workflowRecordKnownBug(
  taskId: string,
  testName: string,
  description: string,
  severity: BugSeverity,
  issueUrl?: string,
  targetPhase: BugTargetPhase = 'backlog'
): RecordKnownBugResult {
  // タスク状態を取得
  const result = getTaskByIdOrError(taskId);
  if ('error' in result) {
    return result.error as RecordKnownBugResult;
  }

  const { taskState } = result;

  // regression_testフェーズ以外ではエラー
  if (taskState.phase !== 'regression_test') {
    return {
      success: false,
      message: `既知バグの記録はregression_testフェーズでのみ可能です。現在: ${taskState.phase}`,
    };
  }

  // パラメータ検証
  if (!testName || typeof testName !== 'string') {
    return {
      success: false,
      message: 'testNameは必須です',
    };
  }

  if (!description || typeof description !== 'string') {
    return {
      success: false,
      message: 'descriptionは必須です',
    };
  }

  const validSeverities: BugSeverity[] = ['low', 'medium', 'high', 'critical'];
  if (!validSeverities.includes(severity)) {
    return {
      success: false,
      message: `severityは ${validSeverities.join(', ')} のいずれかである必要があります`,
    };
  }

  return safeExecute('既知バグ記録', () => {
    // 既存のバグ配列を取得または初期化
    const knownBugs = taskState.knownBugs || [];

    // 重複チェック
    if (knownBugs.some(bug => bug.testName === testName)) {
      return {
        success: false,
        message: `このテストは既に記録されています: ${testName}`,
      };
    }

    // バグIDを生成
    const bugId = generateBugId(knownBugs);

    // 新しいバグを作成
    const newBug: KnownBug = {
      bugId,
      testName,
      description,
      severity,
      issueUrl,
      targetPhase,
      recordedAt: new Date().toISOString(),
    };

    // バグを追加
    knownBugs.push(newBug);
    taskState.knownBugs = knownBugs;

    // 状態を保存
    stateManager.writeTaskState(taskState.workflowDir, taskState);

    return {
      success: true,
      bugId,
      knownBugs,
      message: `既知バグを記録しました: ${bugId} - ${testName}（深刻度: ${severity}）`,
    };
  }) as RecordKnownBugResult;
}

/**
 * workflow_record_known_bug ツール定義
 */
export const recordKnownBugToolDefinition = {
  name: 'workflow_record_known_bug',
  description: 'regression_testフェーズで既知バグを記録します。テスト削除ではなく、バグを追跡するために使用します。',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'タスクID（必須）',
      },
      testName: {
        type: 'string',
        description: '失敗するテスト名',
      },
      description: {
        type: 'string',
        description: 'バグの説明',
      },
      severity: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'critical'],
        description: '深刻度',
      },
      issueUrl: {
        type: 'string',
        description: '関連Issue URL（オプション）',
      },
      targetPhase: {
        type: 'string',
        enum: ['next_sprint', 'backlog', 'deferred'],
        description: '対応予定（デフォルト: backlog）',
      },
    },
    required: ['taskId', 'testName', 'description', 'severity'],
  },
};

// ============================================================================
// workflow_get_known_bugs - 既知バグ一覧取得
// ============================================================================

/**
 * 既知バグ一覧取得結果
 */
export interface GetKnownBugsResult extends ToolResult {
  /** 既知バグ一覧 */
  knownBugs?: KnownBug[];
  /** バグ数 */
  count?: number;
}

/**
 * 既知バグ一覧を取得
 *
 * タスクに記録されている既知バグの一覧を取得する。
 *
 * @param taskId タスクID
 * @returns 既知バグ一覧
 */
export function workflowGetKnownBugs(taskId: string): GetKnownBugsResult {
  // タスク状態を取得
  const result = getTaskByIdOrError(taskId);
  if ('error' in result) {
    return result.error as GetKnownBugsResult;
  }

  const { taskState } = result;
  const knownBugs = taskState.knownBugs || [];

  return {
    success: true,
    knownBugs,
    count: knownBugs.length,
    message: `既知バグ: ${knownBugs.length}件`,
  };
}

/**
 * workflow_get_known_bugs ツール定義
 */
export const getKnownBugsToolDefinition = {
  name: 'workflow_get_known_bugs',
  description: 'タスクに記録されている既知バグの一覧を取得します。',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'タスクID（必須）',
      },
    },
    required: ['taskId'],
  },
};
