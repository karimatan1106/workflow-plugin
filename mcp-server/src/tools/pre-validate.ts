/**
 * P0-3: workflow_pre_validate ツール - 成果物の事前検証
 *
 * フェーズ遷移前に成果物の品質を検証する。
 * validateArtifactQuality を使用して、必須セクション・行数・重複行などを検査する。
 *
 * @spec docs/spec/features/pre-validate.md
 */

import * as fs from 'fs';
import type { PreValidateResult, PhaseName } from '../state/types.js';
import { getTaskByIdOrError, validateRequiredString, safeExecute } from './helpers.js';
import { validateArtifactQuality, PHASE_ARTIFACT_REQUIREMENTS } from '../validation/artifact-validator.js';
import { resolvePhaseGuide } from '../phases/definitions.js';

// Note: fs.existsSync and fs.readFileSync are used for sync file operations
// in the safeExecute context to provide immediate validation results

/**
 * 事前検証ツール定義
 */
export const preValidateToolDefinition = {
  name: 'workflow_pre_validate',
  description: '成果物の事前検証を実行します。フェーズ遷移前に成果物の品質を確認できます。',
  inputSchema: {
    type: 'object' as const,
    properties: {
      taskId: { type: 'string', description: 'タスクID' },
      targetPhase: { type: 'string', description: '検証対象のフェーズ名' },
      filePath: { type: 'string', description: '検証対象のファイルパス' },
      sessionToken: { type: 'string', description: 'セッショントークン' },
    },
    required: ['targetPhase', 'filePath'],
  },
};

/**
 * 成果物の事前検証を実行
 *
 * @param taskId タスクID（省略可）
 * @param targetPhase 検証対象フェーズ
 * @param filePath 検証対象ファイルパス
 * @param sessionToken セッショントークン（省略可）
 * @returns 検証結果
 */
export function workflowPreValidate(
  taskId?: string,
  targetPhase?: string,
  filePath?: string,
  _sessionToken?: string,
): PreValidateResult {
  return safeExecute('pre_validate', () => {
    // パラメータ検証
    const phaseCheck = validateRequiredString(targetPhase, 'targetPhaseは必須です');
    if ('error' in phaseCheck) return phaseCheck.error as PreValidateResult;

    const fileCheck = validateRequiredString(filePath, 'filePathは必須です');
    if ('error' in fileCheck) return fileCheck.error as PreValidateResult;

    const phase = phaseCheck.value as PhaseName;
    const file = fileCheck.value;

    // ファイル存在確認
    if (!fs.existsSync(file)) {
      return {
        success: true,
        passed: false,
        errors: [`ファイルが見つかりません: ${file}`],
        warnings: [],
        checkedRules: ['file_exists'],
      };
    }

    // PhaseGuide から要件を取得
    let docsDir = '';
    if (taskId) {
      const taskResult = getTaskByIdOrError(taskId);
      if ('error' in taskResult) return taskResult.error as PreValidateResult;
      docsDir = taskResult.taskState.docsDir || '';
    }

    // PHASE_ARTIFACT_REQUIREMENTS を使用して検証
    const requirements = PHASE_ARTIFACT_REQUIREMENTS[phase];
    if (!requirements) {
      // PhaseGuide からの要件でフォールバック
      const guide = resolvePhaseGuide(phase, docsDir);
      const errors: string[] = [];
      const checkedRules: string[] = [];

      if (guide && guide.requiredSections && guide.requiredSections.length > 0) {
        checkedRules.push('required_sections');
        const content = fs.readFileSync(file, 'utf-8');
        for (const section of guide.requiredSections) {
          if (!content.includes(section)) {
            errors.push(`必須セクション「${section}」が見つかりません`);
          }
        }
      }

      return {
        success: true,
        passed: errors.length === 0,
        errors,
        warnings: [],
        checkedRules,
      };
    }

    // artifact-validator による検証
    const result = validateArtifactQuality(file, requirements);
    const errors = result.errors || [];
    const checkedRules = [
      'required_sections',
      'min_lines',
      'forbidden_patterns',
      'duplicate_lines',
      'section_density',
    ];

    return {
      success: true,
      passed: result.passed,
      errors,
      warnings: [],
      checkedRules,
    };
  }) as PreValidateResult;
}
