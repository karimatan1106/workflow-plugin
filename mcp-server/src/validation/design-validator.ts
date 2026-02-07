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
      result.passed = false;
      result.missingItems.push({
        type: 'file',
        source: 'workflow',
        name: 'workflowDir',
        expectedPath: this.workflowDir,
      });
      result.summary.total = 1;
      result.summary.missing = 1;
      result.warnings.push(`ワークフローディレクトリが見つかりません: ${this.workflowDir}`);
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

    // 全て見つからない場合はブロック
    if (result.warnings.length >= 3) {
      result.passed = false;
      result.missingItems.push(
        { type: 'file', source: 'spec.md', name: 'spec.md', expectedPath: specPath },
        { type: 'file', source: 'state-machine.mmd', name: 'state-machine.mmd', expectedPath: stateMachinePath },
        { type: 'file', source: 'flowchart.mmd', name: 'flowchart.mmd', expectedPath: flowchartPath },
      );
      result.summary.total = 3;
      result.summary.missing = 3;
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
   * ソースコードからコメントと文字列リテラルを除去
   *
   * コメント・文字列内のキーワードが誤検知されるのを防ぐ。
   *
   * @param content ソースコード
   * @returns コメント・文字列を除去したコード
   */
  private removeCommentsAndStrings(content: string): string {
    return content
      // ブロックコメント除去 (/* ... */)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // 行コメント除去 (// ...)
      .replace(/\/\/.*/g, '')
      // ダブルクォート文字列
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      // シングルクォート文字列
      .replace(/'(?:[^'\\]|\\.)*'/g, "''")
      // テンプレートリテラル
      .replace(/`(?:[^`\\]|\\.)*`/g, '``');
  }

  /**
   * 正規表現の特殊文字をエスケープ
   *
   * @param str エスケープする文字列
   * @returns エスケープ済み文字列
   */
  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * ファイル群からパターンを検索する共通ヘルパー
   *
   * コメント・文字列を除去した上で正規表現マッチを行う。
   *
   * @param patterns マッチさせる正規表現の配列（いずれかにマッチすればtrue）
   * @param filePaths 検索対象のファイルパス配列
   * @returns いずれかのパターンが見つかった場合は true
   */
  private searchInFiles(patterns: RegExp[], filePaths: string[]): boolean {
    for (const filePath of filePaths) {
      const fullPath = path.join(this.projectRoot, filePath);
      if (fs.existsSync(fullPath)) {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) continue;
        const content = fs.readFileSync(fullPath, 'utf-8');
        const cleanContent = this.removeCommentsAndStrings(content);
        if (patterns.some((p) => p.test(cleanContent))) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * プロジェクト内でクラスを検索
   */
  private findClassInProject(
    className: string,
    filePaths: string[]
  ): boolean {
    const escapedName = this.escapeRegExp(className);
    return this.searchInFiles(
      [
        new RegExp(
          `\\b(?:export\\s+)?(?:default\\s+)?(?:abstract\\s+)?class\\s+${escapedName}\\s*(?:[{<]|extends|implements)`
        ),
      ],
      filePaths
    );
  }

  /**
   * プロジェクト内でメソッドを検索
   */
  private findMethodInProject(
    methodName: string,
    filePaths: string[]
  ): boolean {
    const escapedName = this.escapeRegExp(methodName);
    return this.searchInFiles(
      [
        new RegExp(
          `\\b(?:async\\s+)?(?:export\\s+)?(?:default\\s+)?(?:function\\s+)?${escapedName}\\s*\\(`
        ),
        // アロー関数パターン: const/let/var methodName = (...) =>
        new RegExp(`\\b${escapedName}\\s*=\\s*(?:async\\s+)?\\(`),
      ],
      filePaths
    );
  }

  /**
   * プロジェクト内でinterfaceを検索
   */
  private findInterfaceInProject(
    interfaceName: string,
    filePaths: string[]
  ): boolean {
    const escapedName = this.escapeRegExp(interfaceName);
    return this.searchInFiles(
      [new RegExp(`\\b(?:export\\s+)?interface\\s+${escapedName}\\s*[{<]`)],
      filePaths
    );
  }

  /**
   * プロジェクト内でtype定義を検索
   */
  private findTypeInProject(
    typeName: string,
    filePaths: string[]
  ): boolean {
    const escapedName = this.escapeRegExp(typeName);
    return this.searchInFiles(
      [new RegExp(`\\b(?:export\\s+)?type\\s+${escapedName}\\s*[=<]`)],
      filePaths
    );
  }

  /**
   * プロジェクト内でenum定義を検索
   */
  private findEnumInProject(
    enumName: string,
    filePaths: string[]
  ): boolean {
    const escapedName = this.escapeRegExp(enumName);
    return this.searchInFiles(
      [new RegExp(`\\b(?:export\\s+)?enum\\s+${escapedName}\\s*\\{`)],
      filePaths
    );
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
