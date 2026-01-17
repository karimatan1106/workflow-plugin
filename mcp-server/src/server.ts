/**
 * MCP Server 定義
 *
 * ワークフロー管理用のMCPサーバーを定義する。
 * MCPプロトコルを通じてワークフローツールを公開する。
 *
 * @spec docs/specs/domains/workflow/mcp-server.md
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
  workflowSwitch,
  switchToolDefinition,
  workflowCompleteSub,
  completeSubToolDefinition,
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
  switchToolDefinition,
  completeSubToolDefinition,
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
  /** ステータス取得（引数なし） */
  workflow_status: Record<string, never>;
  /** タスク開始 */
  workflow_start: { taskName: string; size?: string };
  /** 次フェーズ遷移（引数なし） */
  workflow_next: Record<string, never>;
  /** 承認 */
  workflow_approve: { type: string };
  /** リセット */
  workflow_reset: { reason?: string };
  /** タスク一覧（引数なし） */
  workflow_list: Record<string, never>;
  /** タスク切り替え */
  workflow_switch: { taskId: string };
  /** サブフェーズ完了 */
  workflow_complete_sub: { subPhase: string };
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
  workflow_status: () => workflowStatus(),

  workflow_start: (args) => {
    const { taskName, size } = args as ToolArguments['workflow_start'];
    return workflowStart(taskName, size);
  },

  workflow_next: () => workflowNext(),

  workflow_approve: (args) => {
    const { type } = args as ToolArguments['workflow_approve'];
    return workflowApprove(type);
  },

  workflow_reset: (args) => {
    const { reason } = args as ToolArguments['workflow_reset'];
    return workflowReset(reason);
  },

  workflow_list: () => workflowList(),

  workflow_switch: (args) => {
    const { taskId } = args as ToolArguments['workflow_switch'];
    return workflowSwitch(taskId);
  },

  workflow_complete_sub: (args) => {
    const { subPhase } = args as ToolArguments['workflow_complete_sub'];
    return workflowCompleteSub(subPhase);
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
