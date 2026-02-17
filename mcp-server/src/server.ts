/**
 * MCP Server 定義
 *
 * ワークフロー管理用のMCPサーバーを定義する。
 * MCPプロトコルを通じてワークフローツールを公開する。
 *
 * @spec docs/spec/features/workflow-mcp-server.md
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import {
  workflowStatus,
  statusToolDefinition,
  workflowStart,
  startToolDefinition,
  workflowNext,
  nextToolDefinition,
  workflowApprove,
  approveToolDefinition,
  workflowReset,
  resetToolDefinition,
  workflowList,
  listToolDefinition,
  workflowCompleteSub,
  completeSubToolDefinition,
  workflowRecordTest,
  recordTestToolDefinition,
  workflowCaptureBaseline,
  captureBaselineToolDefinition,
  workflowGetTestInfo,
  getTestInfoToolDefinition,
  workflowRecordKnownBug,
  recordKnownBugToolDefinition,
  workflowGetKnownBugs,
  getKnownBugsToolDefinition,
  workflowSetScope,
  setScopeToolDefinition,
  workflowRecordTestResult,
  recordTestResultToolDefinition,
  workflowBack,
  backToolDefinition,
  workflowPreValidate,
  preValidateToolDefinition,
  workflowRecordFeedback,
  recordFeedbackToolDefinition,
  workflowCreateSubtask,
  createSubtaskToolDefinition,
  workflowLinkTasks,
  linkTasksToolDefinition,
} from './tools/index.js';

import type { ToolResult } from './state/types.js';

// ============================================================================
// 定数: ツール定義一覧
// ============================================================================

/**
 * MCPサーバーが公開する全ツール定義
 *
 * ListToolsリクエストで返されるツールスキーマのリスト。
 */
const TOOL_DEFINITIONS = [
  statusToolDefinition,
  startToolDefinition,
  nextToolDefinition,
  approveToolDefinition,
  resetToolDefinition,
  listToolDefinition,
  completeSubToolDefinition,
  recordTestToolDefinition,
  captureBaselineToolDefinition,
  getTestInfoToolDefinition,
  recordKnownBugToolDefinition,
  getKnownBugsToolDefinition,
  setScopeToolDefinition,
  recordTestResultToolDefinition,
  backToolDefinition,
  preValidateToolDefinition,
  recordFeedbackToolDefinition,
  createSubtaskToolDefinition,
  linkTasksToolDefinition,
] as const;

// ============================================================================
// REQ-7: ネイティブバリデーション（Zod不要）
/**
 * ツール引数の型検証
 * @param toolName ツール名
 * @param args 引数オブジェクト
 * @returns {{ valid: boolean; error?: string }}
 */
function validateToolArgs(toolName: string, args: Record<string, unknown>): { valid: boolean; error?: string } {
  // 必須パラメータチェック
  const requiredParams: Record<string, string[]> = {
    workflow_start: ['taskName'],
    workflow_next: [],
    workflow_approve: ['type'],
    workflow_reset: [],
    workflow_status: [],
    workflow_list: [],
    workflow_complete_sub: ['subPhase'],
    workflow_set_scope: [],
    workflow_record_test: ['taskId', 'testFile'],
    workflow_capture_baseline: ['taskId', 'totalTests', 'passedTests', 'failedTests'],
    workflow_get_test_info: ['taskId'],
    workflow_record_test_result: ['taskId', 'exitCode', 'output'],
    workflow_record_known_bug: ['taskId', 'testName', 'description', 'severity'],
    workflow_get_known_bugs: ['taskId'],
    workflow_back: ['targetPhase'],
    workflow_pre_validate: ['targetPhase', 'filePath'],
    workflow_record_feedback: ['feedback'],
    workflow_create_subtask: ['parentTaskId', 'subtaskName'],
    workflow_link_tasks: ['parentTaskId', 'childTaskId'],
  };

  const required = requiredParams[toolName];
  if (!required) {
    return { valid: true }; // 未知のツールは許可
  }

  for (const param of required) {
    if (args[param] === undefined || args[param] === null) {
      return { valid: false, error: `Missing required parameter: ${param}` };
    }
  }

  // 型チェック
  if (args.taskName !== undefined && typeof args.taskName !== 'string') {
    return { valid: false, error: 'taskName must be a string' };
  }
  if (args.type !== undefined && !['requirements', 'design', 'test_design', 'code_review'].includes(String(args.type))) {
    return { valid: false, error: 'type must be one of: requirements, design, test_design, code_review' };
  }
  if (args.severity !== undefined && !['low', 'medium', 'high', 'critical'].includes(String(args.severity))) {
    return { valid: false, error: 'severity must be one of: low, medium, high, critical' };
  }
  if (args.exitCode !== undefined && typeof args.exitCode !== 'number') {
    return { valid: false, error: 'exitCode must be a number' };
  }
  if (args.totalTests !== undefined && typeof args.totalTests !== 'number') {
    return { valid: false, error: 'totalTests must be a number' };
  }
  if (args.output !== undefined && typeof args.output !== 'string') {
    return { valid: false, error: 'output must be a string' };
  }

  return { valid: true };
}


// ============================================================================
// 型定義
// ============================================================================

/**
 * ツール呼び出しの引数型
 *
 * 各ツールに対応する引数の型を定義する。
 * RecordがneverなのでTypeScript型推論だけでの使用。
 */
interface ToolArguments {
  /** ステータス取得（taskIdオプション） */
  workflow_status: { taskId?: string };
  /** タスク開始 */
  workflow_start: { taskName: string; size?: string; skipPhases?: string };
  /** 次フェーズ遷移（taskId必須） */
  workflow_next: { taskId?: string; sessionToken?: string; forceTransition?: boolean };
  /** 承認（taskId必須） */
  workflow_approve: { taskId?: string; type: string; sessionToken?: string };
  /** リセット（taskId必須） */
  workflow_reset: { taskId?: string; reason?: string; sessionToken?: string };
  /** タスク一覧（引数なし） */
  workflow_list: Record<string, never>;
  /** サブフェーズ完了（taskId必須） */
  workflow_complete_sub: { taskId?: string; subPhase: string; sessionToken?: string };
  /** テストファイル記録 */
  workflow_record_test: { taskId: string; testFile: string };
  /** ベースライン記録 */
  workflow_capture_baseline: { taskId: string; totalTests: number; passedTests: number; failedTests: string[] };
  /** テスト情報取得 */
  workflow_get_test_info: { taskId: string };
  /** 既知バグ記録 */
  workflow_record_known_bug: { taskId: string; testName: string; description: string; severity: string; issueUrl?: string; targetPhase?: string };
  /** 既知バグ一覧取得 */
  workflow_get_known_bugs: { taskId: string };
  /** 影響範囲設定 */
  workflow_set_scope: { taskId?: string; files?: string[]; dirs?: string[]; sessionToken?: string };
  /** テスト結果記録 */
  workflow_record_test_result: { taskId?: string; exitCode?: number; summary?: string; output?: string; sessionToken?: string };
  /** 差し戻し */
  workflow_back: { taskId?: string; targetPhase?: string; reason?: string; sessionToken?: string };
  /** 事前検証 */
  workflow_pre_validate: { taskId?: string; targetPhase?: string; filePath?: string; sessionToken?: string };
  /** フィードバック記録 */
  workflow_record_feedback: { taskId?: string; feedback?: string; appendMode?: boolean; sessionToken?: string };
  /** サブタスク作成 */
  workflow_create_subtask: { parentTaskId?: string; subtaskName?: string; taskSize?: string; sessionToken?: string };
  /** タスクリンク */
  workflow_link_tasks: { parentTaskId?: string; childTaskId?: string; sessionToken?: string };
}

/** ツール名の型 */
type ToolName = keyof ToolArguments;

/**
 * ツール呼び出し結果のフォーマット
 *
 * MCPプロトコルのCallToolResult互換型。
 * contentには結果テキストを含み、isErrorはエラー時にtrueになる。
 */
interface ToolCallContent {
  type: 'text';
  text: string;
}

/**
 * MCPツール呼び出し結果型
 *
 * MCP SDKのCallToolResultと互換性を持つ型。
 * インデックスシグネチャは将来のプロトコル拡張に対応するため。
 */
interface ToolCallResult {
  content: ToolCallContent[];
  isError?: boolean;
  /** MCP SDKとの互換性のためのインデックスシグネチャ */
  [key: string]: unknown;
}

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * ツール結果をMCPレスポンス形式に変換
 *
 * @param result ツール結果
 * @returns MCPレスポンス形式
 */
function formatToolResult(result: ToolResult): ToolCallResult {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

/**
 * エラーレスポンスを生成
 *
 * @param message エラーメッセージ
 * @returns MCPエラーレスポンス形式
 */
function formatErrorResult(message: string): ToolCallResult {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ success: false, message }),
      },
    ],
    isError: true,
  };
}

// ============================================================================
// ツールハンドラーマップ
// ============================================================================

/**
 * ツールハンドラー型
 *
 * 引数を受け取りToolResultを返す関数の型。
 */
type ToolHandler = (args: Record<string, unknown>) => ToolResult;

/**
 * ツール名とハンドラーのマッピング
 *
 * 新しいツールを追加する場合は、このマップにエントリを追加する。
 * switchでは各ケースを追加する必要があったが、マップ方式では
 * 宣言的に管理できる。
 */
const TOOL_HANDLERS: Record<ToolName, ToolHandler> = {
  workflow_status: (args) => {
    const { taskId } = args as ToolArguments['workflow_status'];
    return workflowStatus(taskId);
  },

  workflow_start: (args) => {
    const { taskName, skipPhases } = args as ToolArguments['workflow_start'];
    return workflowStart(taskName, skipPhases);
  },

  workflow_next: (args) => {
    const { taskId, sessionToken, forceTransition } = args as ToolArguments['workflow_next'];
    return workflowNext(taskId, sessionToken, forceTransition);
  },

  workflow_approve: (args) => {
    const { taskId, type, sessionToken } = args as ToolArguments['workflow_approve'];
    return workflowApprove(taskId, type, sessionToken);
  },

  workflow_reset: (args) => {
    const { taskId, reason, sessionToken } = args as ToolArguments['workflow_reset'];
    return workflowReset(taskId, reason, sessionToken);
  },

  workflow_list: () => workflowList(),

  workflow_complete_sub: (args) => {
    const { taskId, subPhase, sessionToken } = args as ToolArguments['workflow_complete_sub'];
    return workflowCompleteSub(taskId, subPhase, sessionToken);
  },

  workflow_record_test: (args) => {
    const { taskId, testFile } = args as ToolArguments['workflow_record_test'];
    return workflowRecordTest(taskId, testFile);
  },

  workflow_capture_baseline: (args) => {
    const { taskId, totalTests, passedTests, failedTests } = args as ToolArguments['workflow_capture_baseline'];
    return workflowCaptureBaseline(taskId, totalTests, passedTests, failedTests);
  },

  workflow_get_test_info: (args) => {
    const { taskId } = args as ToolArguments['workflow_get_test_info'];
    return workflowGetTestInfo(taskId);
  },

  workflow_record_known_bug: (args) => {
    const { taskId, testName, description, severity, issueUrl, targetPhase } = args as ToolArguments['workflow_record_known_bug'];
    return workflowRecordKnownBug(taskId, testName, description, severity as 'low' | 'medium' | 'high' | 'critical', issueUrl, targetPhase as 'next_sprint' | 'backlog' | 'deferred' | undefined);
  },

  workflow_get_known_bugs: (args) => {
    const { taskId } = args as ToolArguments['workflow_get_known_bugs'];
    return workflowGetKnownBugs(taskId);
  },

  workflow_set_scope: (args) => {
    const { taskId, files, dirs, sessionToken } = args as ToolArguments['workflow_set_scope'];
    return workflowSetScope(taskId, files, dirs, sessionToken);
  },

  workflow_record_test_result: (args) => {
    const { taskId, exitCode, summary, output, sessionToken } = args as ToolArguments['workflow_record_test_result'];
    return workflowRecordTestResult(taskId, exitCode, summary, output, sessionToken);
  },

  workflow_back: (args) => {
    const { taskId, targetPhase, reason, sessionToken } = args as ToolArguments['workflow_back'];
    return workflowBack(taskId, targetPhase, reason, sessionToken);
  },

  workflow_pre_validate: (args) => {
    const { taskId, targetPhase, filePath, sessionToken } = args as ToolArguments['workflow_pre_validate'];
    return workflowPreValidate(taskId, targetPhase, filePath, sessionToken);
  },

  workflow_record_feedback: (args) => {
    const { taskId, feedback, appendMode, sessionToken } = args as ToolArguments['workflow_record_feedback'];
    return workflowRecordFeedback(taskId, feedback, appendMode, sessionToken);
  },

  workflow_create_subtask: (args) => {
    const { parentTaskId, subtaskName, taskSize, sessionToken } = args as ToolArguments['workflow_create_subtask'];
    return workflowCreateSubtask(parentTaskId, subtaskName, taskSize, sessionToken);
  },

  workflow_link_tasks: (args) => {
    const { parentTaskId, childTaskId, sessionToken } = args as ToolArguments['workflow_link_tasks'];
    return workflowLinkTasks(parentTaskId, childTaskId, sessionToken);
  },
};

/**
 * ツール呼び出しを実行
 *
 * ツール名に対応するハンドラーを検索し、引数を渡して実行する。
 * 存在しないツール名の場合はエラー結果を返す。
 *
 * @param name ツール名
 * @param args ツール引数
 * @returns ツール実行結果
 */
function executeToolCall(name: string, args: Record<string, unknown>): ToolResult {
  const handler = TOOL_HANDLERS[name as ToolName];
  if (!handler) {
    return { success: false, message: `不明なツール: ${name}` };
  }

  // REQ-7: ネイティブバリデーション
  const validation = validateToolArgs(name, args);
  if (!validation.valid) {
    return { success: false, message: `パラメータバリデーションエラー: ${validation.error}` };
  }

  return handler(args);
}

// ============================================================================
// サーバー作成・起動
// ============================================================================

/**
 * ワークフローMCPサーバーを作成
 *
 * @returns 設定済みのMCPサーバーインスタンス
 */
export function createWorkflowServer(): Server {
  const server = new Server(
    {
      name: 'workflow-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // ツール一覧を返すハンドラー
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [...TOOL_DEFINITIONS],
    };
  });

  // ツール呼び出しハンドラー
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const result = executeToolCall(name, (args ?? {}) as Record<string, unknown>);
      return formatToolResult(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return formatErrorResult(`エラー: ${errorMessage}`);
    }
  });

  return server;
}

/**
 * サーバーを起動
 *
 * 標準入出力を使用してMCPサーバーを起動する。
 */
export async function runServer(): Promise<void> {
  const server = createWorkflowServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('ワークフローMCPサーバーが起動しました');
}
