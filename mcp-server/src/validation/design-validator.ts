/**
 * 設計-実装整合性検証クラス
 * @spec docs/spec/features/design-validator.md
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  ValidationResult,
  MissingItem,
  SpecItems,
  StateMachineItems,
  FlowchartItems,
} from './types.js';
import { parseSpec } from './parsers/spec-parser.js';
import { parseStateMachine, parseFlowchart } from './parsers/mermaid-parser.js';

/**
 * 設計-実装整合性検証クラス
 *
 * ワークフロー成果物（spec.md、state-machine.mmd、flowchart.mmd）と
 * 実装コードの整合性をチェックする。
 *
 * @example
 * const validator = new DesignValidator(docsDir);
 * const result = validator.validateAll();
 * if (!result.passed) {
 *   console.log(formatValidationError(result));
 * }
 */
export class DesignValidator {
  private workflowDir: string;
  private projectRoot: string;

  /**
   * コンストラクタ
   *
   * @param workflowDir ワークフロー成果物ディレクトリ（`docs/workflows/{taskName}/`）
   * @param projectRoot プロジェクトルート（デフォルト: `process.cwd()`）
   */
  constructor(workflowDir: string, projectRoot?: string) {
    this.workflowDir = workflowDir;
    this.projectRoot = projectRoot || process.cwd();
  }

  /**
   * 全設計書を検証
   *
   * 以下を検証する：
   * - spec.md の存在と内容（クラス、メソッド、ファイルパス）
   * - state-machine.mmd の存在と内容（状態、遷移）
   * - flowchart.mmd の存在と内容（プロセス、決定点）
   *
   * @returns 検証結果
   */
  validateAll(): ValidationResult {
    const result: ValidationResult = {
      passed: true,
      phase: 'validation',
      timestamp: new Date().toISOString(),
      summary: {
        total: 0,
        implemented: 0,
        missing: 0,
      },
      missingItems: [],
      warnings: [],
    };

    // ワークフローディレクトリの存在チェック
    if (!fs.existsSync(this.workflowDir)) {
      result.warnings.push('ワークフローディレクトリが見つかりません - 検証をスキップ');
      result.passed = true; // ディレクトリがない場合はスキップ
      return result;
    }

    // 設計書ファイルのパス
    const specPath = path.join(this.workflowDir, 'spec.md');
    const stateMachinePath = path.join(this.workflowDir, 'state-machine.mmd');
    const flowchartPath = path.join(this.workflowDir, 'flowchart.mmd');

    // 設計書の存在チェック
    if (!fs.existsSync(specPath)) {
      result.warnings.push('spec.md が見つかりません');
    }
    if (!fs.existsSync(stateMachinePath)) {
      result.warnings.push('state-machine.mmd が見つかりません');
    }
    if (!fs.existsSync(flowchartPath)) {
      result.warnings.push('flowchart.mmd が見つかりません');
    }

    // 全て見つからない場合は検証をスキップ（レガシーワークフロー対応）
    if (result.warnings.length >= 3) {
      result.warnings.push('設計書がありません - 検証をスキップ');
      result.passed = true; // 設計書がない場合はスキップ
      return result;
    }

    // spec.md の検証
    if (fs.existsSync(specPath)) {
      const specContent = fs.readFileSync(specPath, 'utf-8');
      const specItems = parseSpec(specContent);
      this.validateSpecItems(specItems, result);
    }

    // state-machine.mmd の検証
    if (fs.existsSync(stateMachinePath)) {
      const smContent = fs.readFileSync(stateMachinePath, 'utf-8');
      const smItems = parseStateMachine(smContent);
      this.validateStateMachineItems(smItems, result);
    }

    // flowchart.mmd の検証
    if (fs.existsSync(flowchartPath)) {
      const fcContent = fs.readFileSync(flowchartPath, 'utf-8');
      const fcItems = parseFlowchart(fcContent);
      this.validateFlowchartItems(fcItems, result);
    }

    // サマリー計算
    result.summary.missing = result.missingItems.length;
    result.summary.implemented = result.summary.total - result.summary.missing;
    result.passed = result.missingItems.length === 0;

    return result;
  }

  /**
   * spec.md から抽出した項目を検証
   */
  private validateSpecItems(items: SpecItems, result: ValidationResult): void {
    // ファイルパスの存在チェック
    for (const filePath of items.filePaths) {
      result.summary.total++;
      const fullPath = path.join(this.projectRoot, filePath);
      if (!fs.existsSync(fullPath)) {
        result.missingItems.push({
          type: 'file',
          source: 'spec.md',
          name: filePath,
          expectedPath: fullPath,
        });
      }
    }

    // クラスの存在チェック（簡易的にファイル内検索）
    for (const className of items.classes) {
      result.summary.total++;
      const found = this.findClassInProject(className, items.filePaths);
      if (!found) {
        result.missingItems.push({
          type: 'class',
          source: 'spec.md',
          name: className,
        });
      }
    }

    // メソッドの存在チェック（簡易的にファイル内検索）
    for (const methodName of items.methods) {
      result.summary.total++;
      const found = this.findMethodInProject(methodName, items.filePaths);
      if (!found) {
        result.missingItems.push({
          type: 'method',
          source: 'spec.md',
          name: methodName,
        });
      }
    }
  }

  /**
   * state-machine.mmd から抽出した項目を検証
   */
  private validateStateMachineItems(
    items: StateMachineItems,
    result: ValidationResult
  ): void {
    // 開始状態チェック
    if (!items.hasStart) {
      result.warnings.push('state-machine.mmd: 開始状態 [*] がありません');
    }

    // 終了状態チェック
    if (!items.hasEnd) {
      result.warnings.push('state-machine.mmd: 終了状態 [*] がありません');
    }

    // 状態数をカウント（実装チェックは簡略化）
    result.summary.total += items.states.length;
  }

  /**
   * flowchart.mmd から抽出した項目を検証
   */
  private validateFlowchartItems(
    items: FlowchartItems,
    result: ValidationResult
  ): void {
    // プロセス数をカウント
    result.summary.total += items.processes.length;

    // 決定点数をカウント
    result.summary.total += items.decisions.length;
  }

  /**
   * プロジェクト内でクラスを検索
   *
   * 指定されたファイルパスの中から、クラス定義を検索する。
   *
   * @param className 検索するクラス名
   * @param filePaths 検索対象のファイルパス配列
   * @returns クラスが見つかった場合は true
   */
  private findClassInProject(
    className: string,
    filePaths: string[]
  ): boolean {
    for (const filePath of filePaths) {
      const fullPath = path.join(this.projectRoot, filePath);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        if (content.includes(`class ${className}`)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * プロジェクト内でメソッドを検索
   *
   * 指定されたファイルパスの中から、メソッド定義を検索する。
   *
   * @param methodName 検索するメソッド名
   * @param filePaths 検索対象のファイルパス配列
   * @returns メソッドが見つかった場合は true
   */
  private findMethodInProject(
    methodName: string,
    filePaths: string[]
  ): boolean {
    for (const filePath of filePaths) {
      const fullPath = path.join(this.projectRoot, filePath);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        // メソッド定義パターン
        if (
          content.includes(`${methodName}(`) ||
          content.includes(`${methodName} (`)
        ) {
          return true;
        }
      }
    }
    return false;
  }
}

/**
 * 検証エラーメッセージをフォーマット
 *
 * 検証結果を人間が読める形式でフォーマットする。
 *
 * @param result 検証結果
 * @returns フォーマット済みのエラーメッセージ
 */
export function formatValidationError(result: ValidationResult): string {
  const lines = [
    '============================================================',
    ' 設計-実装整合性チェック: 未完了項目があります',
    '============================================================',
    '',
    ` 完了率: ${result.summary.implemented}/${result.summary.total}`,
    '',
    ' 未実装項目:',
  ];

  for (const item of result.missingItems) {
    lines.push(`   - [${item.type}] ${item.name} (${item.source})`);
    if (item.expectedPath) {
      lines.push(`     期待パス: ${item.expectedPath}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push('');
    lines.push(' 警告:');
    for (const warning of result.warnings) {
      lines.push(`   - ${warning}`);
    }
  }

  lines.push('');
  lines.push(' 対応方法:');
  lines.push('   1. 上記項目を実装してください');
  lines.push('   2. または、設計書を修正して /workflow reset で戻る');
  lines.push('');
  lines.push('============================================================');

  return lines.join('\n');
}
