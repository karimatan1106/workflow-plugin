/**
 * 設計-実装整合性検証クラス
 * @spec docs/spec/features/design-validator.md
 *
 * FR-6対応: TypeScript Compiler APIによるAST解析統合
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import * as crypto from 'crypto';
import type {
  ValidationResult,
  MissingItem,
  SpecItems,
  StateMachineItems,
  FlowchartItems,
} from './types.js';
import { parseSpec } from './parsers/spec-parser.js';
import { parseStateMachine, parseFlowchart } from './parsers/mermaid-parser.js';
import { analyzeTypeScriptFile, type ASTAnalysisResult, type FunctionSignature } from './ast-analyzer.js';

/**
 * AST解析結果キャッシュエントリ (REQ-FIX-3)
 */
interface ASTCacheEntry {
  hash: string;
  result: ASTAnalysisResult;
  timestamp: number;
}

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
  private fileCache: Map<string, { content: string; cleanContent: string }> = new Map();
  private astCache: Map<string, ASTCacheEntry> = new Map();
  private readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  private cacheHits = 0;
  private cacheMisses = 0;
  private totalTimeMs = 0;

  /**
   * コンストラクタ
   *
   * @param workflowDir ワークフロー成果物ディレクトリ（`docs/workflows/{taskName}/`）
   * @param projectRoot プロジェクトルート（デフォルト: `process.cwd()`）
   */
  constructor(workflowDir: string, projectRoot?: string) {
    this.workflowDir = workflowDir;
    this.projectRoot = projectRoot || process.cwd();
    this.loadPersistedCache();
    this.evictExpiredCache();
  }

  /**
   * ファイルのMD5ハッシュを計算（REQ-FIX-3）
   */
  private hashFile(fullPath: string): string {
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      return crypto.createHash('md5').update(content).digest('hex');
    } catch {
      return '';
    }
  }

  /**
   * キャッシュ付きAST解析（REQ-FIX-3）
   */
  private analyzeWithCache(fullPath: string): ASTAnalysisResult | null {
    const startTime = Date.now();
    const currentHash = this.hashFile(fullPath);
    const cached = this.astCache.get(fullPath);

    if (cached && cached.hash === currentHash) {
      this.cacheHits++;
      return cached.result;
    }

    this.cacheMisses++;
    const result = analyzeTypeScriptFile(fullPath);
    const elapsed = Date.now() - startTime;
    this.totalTimeMs += elapsed;

    if (result) {
      this.astCache.set(fullPath, {
        hash: currentHash,
        result,
        timestamp: Date.now(),
      });
    }

    if (elapsed > 50) {
      console.warn(`[Design Validator] AST analysis took ${elapsed}ms for ${path.relative(this.projectRoot, fullPath)}`);
    }

    return result;
  }

  /**
   * 永続化されたキャッシュを読み込む（REQ-FIX-3）
   */
  private loadPersistedCache(): void {
    const cachePath = path.join(this.projectRoot, '.claude/cache/ast-analysis.json');
    if (!fs.existsSync(cachePath)) {
      return;
    }

    try {
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      for (const [filePath, entry] of Object.entries(data)) {
        this.astCache.set(filePath, entry as ASTCacheEntry);
      }
      console.log(`[Design Validator] Loaded ${this.astCache.size} cached AST entries`);
    } catch (err) {
      console.warn(`[Design Validator] Failed to load persisted cache: ${err}`);
    }
  }

  /**
   * キャッシュを永続化する（REQ-FIX-3）
   */
  private persistCache(): void {
    const cachePath = path.join(this.projectRoot, '.claude/cache/ast-analysis.json');
    const data = Object.fromEntries(this.astCache);

    try {
      fs.mkdirSync(path.dirname(cachePath), { recursive: true });
      fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
      console.log(`[Design Validator] Persisted ${this.astCache.size} AST entries to cache`);
    } catch (err) {
      console.warn(`[Design Validator] Failed to persist cache: ${err}`);
    }
  }

  /**
   * 期限切れキャッシュエントリを削除（REQ-FIX-3）
   */
  private evictExpiredCache(): void {
    const now = Date.now();
    let evictedCount = 0;

    for (const [filePath, entry] of this.astCache.entries()) {
      if (now - entry.timestamp > this.CACHE_TTL_MS) {
        this.astCache.delete(filePath);
        evictedCount++;
      }
    }

    if (evictedCount > 0) {
      console.log(`[Design Validator] Evicted ${evictedCount} expired cache entries`);
    }
  }

  /**
   * キャッシュメトリクスを取得（REQ-FIX-3）
   */
  public getMetrics(): { hitRate: number; avgTimeMs: number; hits: number; misses: number } {
    const total = this.cacheHits + this.cacheMisses;
    const hitRate = total > 0 ? this.cacheHits / total : 0;
    const avgTimeMs = this.cacheMisses > 0 ? this.totalTimeMs / this.cacheMisses : 0;

    return {
      hitRate,
      avgTimeMs,
      hits: this.cacheHits,
      misses: this.cacheMisses,
    };
  }

  /**
   * ファイルをキャッシュ付きで読み込む（REQ-3）
   *
   * @param fullPath 読み込むファイルの絶対パス
   * @returns ファイル内容とクリーンな内容、またはnull（存在しない/ディレクトリの場合）
   */
  private readFileWithCache(fullPath: string): { content: string; cleanContent: string } | null {
    if (this.fileCache.has(fullPath)) {
      return this.fileCache.get(fullPath)!;
    }
    if (!fs.existsSync(fullPath)) return null;
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) return null;
    const content = fs.readFileSync(fullPath, 'utf-8');
    const cleanContent = this.removeCommentsAndStrings(content);
    const entry = { content, cleanContent };
    this.fileCache.set(fullPath, entry);
    return entry;
  }

  /**
   * キャッシュをクリア（REQ-3）
   */
  public clearCache(): void {
    this.fileCache.clear();
  }

  /**
   * スコープファイル内でスタブを検出（REQ-6）
   *
   * FR-6対応: AST解析を追加して、正規表現で検出できないスタブも検出する
   * - 正規表現ベースの検出は後方互換性のため維持
   * - AST解析による追加検出を実施（TypeScript Compiler API使用）
   */
  private findStubsInContent(content: string): Array<{name: string; reason: string}> {
    const stubs: Array<{name: string; reason: string}> = [];
    let match;

    // 正規表現ベースの検出（後方互換性のため維持）
    // Empty methods
    const emptyMethod = /\b(\w+)\s*\([^)]*\)\s*\{\s*\}/g;
    while ((match = emptyMethod.exec(content)) !== null) {
      stubs.push({ name: match[1], reason: `空メソッド: ${match[1]}()` });
    }

    // TODO/FIXME in methods
    const todoMethod = /\b(\w+)\s*\([^)]*\)\s*\{[^}]*(TODO|FIXME|NotImplemented)[^}]*\}/g;
    while ((match = todoMethod.exec(content)) !== null) {
      stubs.push({ name: match[1], reason: `スタブ: ${match[1]}() - ${match[2]}` });
    }

    // Empty classes
    const emptyClass = /\bclass\s+(\w+)[^{]*\{\s*\}/g;
    while ((match = emptyClass.exec(content)) !== null) {
      stubs.push({ name: match[1], reason: `空クラス: class ${match[1]}` });
    }

    // AST解析による追加スタブ検出
    try {
      const sourceFile = ts.createSourceFile(
        'temp.ts',
        content,
        ts.ScriptTarget.Latest,
        true
      );

      const visitNode = (node: ts.Node): void => {
        // メソッド宣言・関数宣言でbodyが空またはthrowのみのものを検出
        if (
          (ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node)) &&
          node.name
        ) {
          const name = node.name.getText(sourceFile);

          if (node.body) {
            const statements = node.body.statements;

            if (statements.length === 0) {
              // 空のメソッドbody（正規表現でも検出されるが念のため）
              if (!stubs.some(s => s.name === name)) {
                stubs.push({ name, reason: 'AST解析: メソッドbodyが空です' });
              }
            } else if (statements.length === 1) {
              const stmt = statements[0];
              // throwのみのメソッド（NotImplementedError等）
              if (ts.isThrowStatement(stmt)) {
                if (!stubs.some(s => s.name === name)) {
                  stubs.push({ name, reason: 'AST解析: NotImplementedError のみのスタブメソッドです' });
                }
              }
              // return null; のみ
              if (ts.isReturnStatement(stmt) && stmt.expression) {
                const returnText = stmt.expression.getText(sourceFile);
                if (returnText === 'null') {
                  if (!stubs.some(s => s.name === name)) {
                    stubs.push({ name, reason: 'AST解析: return null のみのスタブメソッドです' });
                  }
                }
                // return undefined; のみ
                if (returnText === 'undefined') {
                  if (!stubs.some(s => s.name === name)) {
                    stubs.push({ name, reason: 'AST解析: return undefined のみのスタブメソッドです' });
                  }
                }
              }
              // bare return; のみ
              if (ts.isReturnStatement(stmt) && !stmt.expression) {
                if (!stubs.some(s => s.name === name)) {
                  stubs.push({ name, reason: 'AST解析: 空のreturnのみのスタブメソッドです' });
                }
              }
            } else if (statements.length <= 3) {
              // 3行以下のメソッドは疑わしいスタブとして警告
              if (!stubs.some(s => s.name === name)) {
                stubs.push({ name, reason: `AST解析: メソッドbodyが${statements.length}行のみです（スタブの可能性）` });
              }
            }
          }
          // bodyがない場合（抽象メソッド等）はスタブではないのでスキップ
        }

        ts.forEachChild(node, visitNode);
      };

      visitNode(sourceFile);
    } catch (err) {
      // AST解析失敗時は正規表現の結果のみ使用（フォールバック）
      // エラーログは出力しない（サイレントフォールバック）
    }

    return stubs;
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

    // REQ-6: スコープファイル内のスタブ検出
    if (fs.existsSync(specPath)) {
      const specContent = fs.readFileSync(specPath, 'utf-8');
      const specItems = parseSpec(specContent);

      for (const filePath of specItems.filePaths) {
        const fullPath = path.join(this.projectRoot, filePath);
        const cached = this.readFileWithCache(fullPath);
        if (cached) {
          const stubs = this.findStubsInContent(cached.content);

          for (const stub of stubs) {
            result.missingItems.push({
              type: 'stub',
              source: filePath,
              name: stub.name,
              expectedPath: fullPath,
            });
            result.warnings.push(`${stub.reason} in ${filePath}`);
          }
        }
      }
    }

    // サマリー計算
    result.summary.missing = result.missingItems.length;
    result.summary.implemented = result.summary.total - result.summary.missing;
    result.passed = result.missingItems.length === 0;

    // キャッシュクリア（REQ-3）
    this.clearCache();

    // REQ-FIX-3: AST解析キャッシュの永続化
    this.persistCache();

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
      // ブロックコメント除去 (/* ... */) - 空文字で置換
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // 行コメント除去 (// ...) - 空文字で置換
      .replace(/\/\/.*/g, '')
      // ダブルクォート文字列 - エスケープ対応
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      // シングルクォート文字列 - エスケープ対応
      .replace(/'(?:[^'\\]|\\.)*'/g, "''")
      // テンプレートリテラル - エスケープ対応
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
   * FR-6対応: TypeScript/JavaScriptファイルの場合、AST解析を優先して使用
   *
   * コメント・文字列を除去した上で正規表現マッチを行う。
   *
   * @param patterns マッチさせる正規表現の配列（いずれかにマッチすればtrue）
   * @param filePaths 検索対象のファイルパス配列
   * @param identifierName AST検索時に直接マッチする識別子名（オプション）
   * @returns いずれかのパターンが見つかった場合は true
   */
  private searchInFiles(patterns: RegExp[], filePaths: string[], identifierName?: string): boolean {
    for (const filePath of filePaths) {
      const fullPath = path.join(this.projectRoot, filePath);

      // FR-6: TypeScript/JavaScriptファイルの場合、AST解析を試行
      if (/\.(ts|tsx|js|jsx)$/.test(fullPath) && identifierName) {
        // REQ-FIX-3: キャッシュ付きAST解析に変更
        const astResult = this.analyzeWithCache(fullPath);

        if (astResult) {
          // AST解析成功: 識別子が抽出リストに含まれているかチェック
          const allIdentifiers = [
            ...astResult.classes,
            ...astResult.functions,
            ...astResult.variables,
            ...astResult.exports,
          ];

          if (allIdentifiers.includes(identifierName)) {
            return true;
          }
          // AST解析で見つからなかった場合も、フォールバックを試す
        }
        // AST解析失敗: フォールバックして正規表現ベースで続行
      }

      // 正規表現ベースの検索（フォールバック）
      const cached = this.readFileWithCache(fullPath);
      if (cached && patterns.some((p) => p.test(cached.cleanContent))) {
        return true;
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
          `\\b(?:export\\s+)?(?:default\\s+)?(?:abstract\\s+)?(?:class|interface|type)\\s+${escapedName}\\s*(?:[{<(=]|extends|implements)`
        ),
      ],
      filePaths,
      className  // AST検索用の識別子名
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
      filePaths,
      methodName  // AST検索用の識別子名
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
      filePaths,
      interfaceName  // AST検索用の識別子名
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
      filePaths,
      typeName  // AST検索用の識別子名
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
      filePaths,
      enumName  // AST検索用の識別子名
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
