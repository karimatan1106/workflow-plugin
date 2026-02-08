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
] as const;

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
  workflow_start: { taskName: string; size?: string };
  /** 次フェーズ遷移（taskId必須） */
  workflow_next: { taskId?: string; sessionToken?: string };
  /** 承認（taskId必須） */
  workflow_approve: { taskId?: string; type: string; sessionToken?: string };
  /** リセット（taskId必須） */
  workflow_reset: { taskId?: string; reason?: string; sessionToken?: string };
  /** タスク一覧（引数なし） */
  workflow_list: Record<string, never>;
  /** サブフェーズ完了（taskId必須） */
  workflow_complete_sub: { taskId?: string; subPhase: string };
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
  workflow_set_scope: { taskId?: string; files?: string[]; dirs?: string[] };
  /** テスト結果記録 */
  workflow_record_test_result: { taskId?: string; exitCode?: number; summary?: string };
  /** 差し戻し */
  workflow_back: { taskId?: string; targetPhase?: string; reason?: string };
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
    const { taskName } = args as ToolArguments['workflow_start'];
    return workflowStart(taskName);
  },

  workflow_next: (args) => {
    const { taskId, sessionToken } = args as ToolArguments['workflow_next'];
    return workflowNext(taskId, sessionToken);
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
    const { taskId, subPhase } = args as ToolArguments['workflow_complete_sub'];
    return workflowCompleteSub(taskId, subPhase);
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
    const { taskId, files, dirs } = args as ToolArguments['workflow_set_scope'];
    return workflowSetScope(taskId, files, dirs);
  },

  workflow_record_test_result: (args) => {
    const { taskId, exitCode, summary } = args as ToolArguments['workflow_record_test_result'];
    return workflowRecordTestResult(taskId, exitCode, summary);
  },

  workflow_back: (args) => {
    const { taskId, targetPhase, reason } = args as ToolArguments['workflow_back'];
    return workflowBack(taskId, targetPhase, reason);
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
