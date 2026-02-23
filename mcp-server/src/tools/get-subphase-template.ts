/**
 * workflow_get_subphase_template ツール
 * サブフェーズ名を指定して subagentTemplate を個別取得するMCPツール。
 * @spec docs/spec/features/get-subphase-template.md
 * @spec docs/spec/features/workflow-mcp-server.md
 */

import { resolvePhaseGuide } from '../phases/definitions.js';
import { stateManager } from '../state/manager.js';
import type { ToolResult } from '../state/types.js';

/**
 * 有効なサブフェーズ名の一覧（11種類）
 */
export const VALID_SUB_PHASE_NAMES = [
  'threat_modeling',
  'planning',
  'state_machine',
  'flowchart',
  'ui_design',
  'build_check',
  'code_review',
  'manual_test',
  'security_scan',
  'performance_test',
  'e2e_test',
] as const;

export type ValidSubPhaseName = typeof VALID_SUB_PHASE_NAMES[number];

/**
 * サブフェーズから親並列フェーズへのマッピング
 */
export const SUB_PHASE_TO_PARENT_PHASE: Record<ValidSubPhaseName, string> = {
  threat_modeling: 'parallel_analysis',
  planning: 'parallel_analysis',
  state_machine: 'parallel_design',
  flowchart: 'parallel_design',
  ui_design: 'parallel_design',
  build_check: 'parallel_quality',
  code_review: 'parallel_quality',
  manual_test: 'parallel_verification',
  security_scan: 'parallel_verification',
  performance_test: 'parallel_verification',
  e2e_test: 'parallel_verification',
};

export interface GetSubphaseTemplateArgs {
  subPhaseName: string;
  taskId?: string;
}

/**
 * workflow_get_subphase_template ツールのハンドラ
 *
 * サブフェーズ名を受け取り、resolvePhaseGuide() を使用して
 * 完全な subagentTemplate を含むフェーズガイドを返す。
 *
 * @param args ツール引数
 * @returns ToolResult（subagentTemplate を含む）
 */
export function workflowGetSubphaseTemplate(args: GetSubphaseTemplateArgs): ToolResult {
  const { subPhaseName, taskId } = args;

  // サブフェーズ名のバリデーション
  if (!VALID_SUB_PHASE_NAMES.includes(subPhaseName as ValidSubPhaseName)) {
    return {
      success: false,
      message: `無効なサブフェーズ名です: ${subPhaseName}。有効な値: ${VALID_SUB_PHASE_NAMES.join(', ')}`,
    };
  }

  const validSubPhaseName = subPhaseName as ValidSubPhaseName;
  const parentPhase = SUB_PHASE_TO_PARENT_PHASE[validSubPhaseName];

  // タスク情報を取得（resolvePhaseGuide のプレースホルダー置換に使用）
  let docsDir: string | undefined;
  let userIntent: string | undefined;
  let resolvedTaskId: string | undefined = taskId;

  if (resolvedTaskId) {
    // タスクIDが指定されている場合は対象タスクを取得
    const targetTask = stateManager.getTaskById(resolvedTaskId);
    if (!targetTask) {
      return {
        success: false,
        message: `タスクが見つかりません: ${resolvedTaskId}`,
      };
    }
    docsDir = targetTask.docsDir;
    userIntent = targetTask.userIntent;
  } else {
    // タスクIDが指定されていない場合はアクティブタスクを取得
    const activeTasks = stateManager.discoverTasks();
    if (activeTasks.length > 0) {
      // completed でないタスクを優先
      const activeTask = activeTasks.find(t => t.phase !== 'completed') ?? activeTasks[0];
      resolvedTaskId = activeTask.taskId;
      docsDir = activeTask.docsDir;
      userIntent = activeTask.userIntent;
    }
  }

  // 親フェーズガイドをプレースホルダー展開して取得
  // resolvePhaseGuide はサブフェーズの subagentTemplate も buildPrompt で生成する
  const resolvedParentGuide = resolvePhaseGuide(parentPhase, docsDir, userIntent);
  if (!resolvedParentGuide) {
    return {
      success: false,
      message: `親フェーズ ${parentPhase} が見つかりません`,
    };
  }

  // サブフェーズガイドを取得
  const subPhaseGuide = resolvedParentGuide.subPhases?.[validSubPhaseName];
  if (!subPhaseGuide) {
    return {
      success: false,
      message: `サブフェーズ ${validSubPhaseName} のガイドが見つかりません`,
    };
  }

  // subagentTemplate の存在確認
  if (!subPhaseGuide.subagentTemplate) {
    return {
      success: false,
      message: `サブフェーズ ${validSubPhaseName} の subagentTemplate が定義されていません`,
    };
  }

  return {
    success: true,
    subPhaseName: validSubPhaseName,
    parentPhase,
    subagentTemplate: subPhaseGuide.subagentTemplate,
    minLines: subPhaseGuide.minLines,
    requiredSections: subPhaseGuide.requiredSections,
    outputFile: subPhaseGuide.outputFile,
    taskId: resolvedTaskId,
    docsDir,
  };
}

/**
 * MCP ツール定義
 */
export const getSubphaseTemplateToolDefinition = {
  name: 'workflow_get_subphase_template',
  description:
    'サブフェーズ名を指定して subagentTemplate を取得します。Orchestrator が並列フェーズのサブエージェント起動テンプレートを取得する際に使用します。workflow_next は slimSubPhaseGuide を適用して subagentTemplate を除去するため、本ツールでテンプレートを個別取得します。',
  inputSchema: {
    type: 'object',
    properties: {
      subPhaseName: {
        type: 'string',
        description: `サブフェーズ名。有効な値: ${VALID_SUB_PHASE_NAMES.join(', ')}`,
        enum: [...VALID_SUB_PHASE_NAMES],
      },
      taskId: {
        type: 'string',
        description:
          'タスクID（省略時はアクティブなタスクを自動選択）。プレースホルダー置換に使用されます。',
      },
    },
    required: ['subPhaseName'],
  },
} as const;
