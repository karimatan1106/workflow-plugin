/**
 * AST解析モジュール（正規表現ベース）
 *
 * TypeScript Compiler APIを使わず、正規表現で構造を解析する。
 * 軽量かつ高速で、必要十分な精度を提供する。
 *
 * @spec docs/workflows/ワ-クフロ-1000万行対応強化/spec.md
 */

/**
 * 構造的問題の種別
 */
export interface StructuralIssue {
  type:
    | 'empty_class'
    | 'empty_method'
    | 'not_implemented'
    | 'isolated_node'
    | 'no_transitions'
    | 'no_edges';
  name: string;
  file?: string;
  line?: number;
  message: string;
}

/**
 * TypeScriptファイルの構造を解析
 *
 * @param code - TypeScriptコード
 * @param filePath - ファイルパス（オプショナル）
 * @returns 構造的問題の配列
 */
/** コード解析対象の最大行数 */
const MAX_CODE_LINES = 10000;

export function analyzeTypeScriptStructure(
  code: string,
  filePath?: string
): StructuralIssue[] {
  const issues: StructuralIssue[] = [];

  // ファイルサイズ制限: 10000行超はスキップ
  if (code.split('\n').length > MAX_CODE_LINES) {
    return issues;
  }

  // コメントと文字列を除去（クラス検出用）
  const cleanCode = removeCommentsAndStrings(code);

  // クラス定義を抽出して解析
  const classPattern =
    /\b(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?(?:\s+implements\s+[\w,\s]+)?\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/gs;

  let match: RegExpExecArray | null;
  while ((match = classPattern.exec(cleanCode)) !== null) {
    const className = match[1];
    const classBody = match[2];

    // クラスボディが空かチェック（プロパティ・メソッド・コメントがない）
    const hasMembers = /\w+\s*[:=(]/.test(classBody);
    if (!hasMembers) {
      issues.push({
        type: 'empty_class',
        name: className,
        file: filePath,
        message: `空のクラス: ${className}`,
      });
    }
  }

  // メソッド定義を抽出して解析（元のコードを使用）
  // 簡易的なメソッド抽出（クラスボディ内のメソッドを対象）
  const methodPattern =
    /\b(?:public|private|protected|static|async)?\s*(\w+)\s*\([^)]*\)\s*(?::\s*[\w<>[\]|&]+)?\s*\{/g;

  while ((match = methodPattern.exec(code)) !== null) {
    const methodName = match[1];
    const methodStartIndex = match.index + match[0].length;

    // constructorはスキップ
    if (methodName === 'constructor') {
      continue;
    }

    // メソッドボディを抽出（ネストした{}を考慮）
    // 元のコードから抽出（文字列が除去される前）
    const methodBody = extractMethodBody(code, methodStartIndex);

    // 空のメソッドかチェック
    if (methodBody.trim().length === 0) {
      issues.push({
        type: 'empty_method',
        name: methodName,
        file: filePath,
        message: `空のメソッド: ${methodName}`,
      });
      continue;
    }

    // "not implemented" パターンをチェック
    const notImplPattern =
      /throw\s+new\s+Error\s*\(\s*['"`].*not\s+implemented.*['"`]\s*\)/i;
    if (notImplPattern.test(methodBody)) {
      issues.push({
        type: 'not_implemented',
        name: methodName,
        file: filePath,
        message: `未実装メソッド: ${methodName}`,
      });
    }
  }

  return issues;
}

/**
 * Mermaidステートマシン図を解析
 *
 * @param mermaidContent - Mermaidファイルの内容
 * @returns 構造的問題の配列
 */
export function analyzeStateMachine(mermaidContent: string): StructuralIssue[] {
  const issues: StructuralIssue[] = [];
  const nodes = new Set<string>();
  const connectedNodes = new Set<string>();

  // 遷移パターン（A --> B）を検出
  const transitionPattern = /(\w+|\[\*\])\s*-->\s*(\w+|\[\*\])/g;
  let match: RegExpExecArray | null;
  let hasTransitions = false;

  while ((match = transitionPattern.exec(mermaidContent)) !== null) {
    hasTransitions = true;
    const from = match[1];
    const to = match[2];

    // [*] は特殊ノードなので無視
    if (from !== '[*]') {
      nodes.add(from);
      connectedNodes.add(from);
    }
    if (to !== '[*]') {
      nodes.add(to);
      connectedNodes.add(to);
    }
  }

  // 単独のノード定義を抽出（遷移に含まれていないノード）
  const nodePattern = /^\s*(\w+)\s*$/gm;
  while ((match = nodePattern.exec(mermaidContent)) !== null) {
    const nodeName = match[1];
    // stateDiagram-v2 などのキーワードはスキップ
    if (nodeName !== 'stateDiagram' && nodeName !== 'v2') {
      nodes.add(nodeName);
    }
  }

  // 遷移が1つもない場合
  if (!hasTransitions && nodes.size > 0) {
    issues.push({
      type: 'no_transitions',
      name: 'state machine',
      message: 'ステートマシンに遷移が定義されていません',
    });
  }

  // 孤立ノードを検出
  for (const node of nodes) {
    if (!connectedNodes.has(node)) {
      issues.push({
        type: 'isolated_node',
        name: node,
        message: `孤立した状態: ${node}`,
      });
    }
  }

  return issues;
}

/**
 * Mermaidフローチャートを解析
 *
 * @param mermaidContent - Mermaidファイルの内容
 * @returns 構造的問題の配列
 */
export function analyzeFlowchart(mermaidContent: string): StructuralIssue[] {
  const issues: StructuralIssue[] = [];
  const nodes = new Set<string>();
  const connectedNodes = new Set<string>();

  // ノード定義を抽出（A[Label]、B{Decision} など）
  const nodePattern = /(\w+)[\[\{][^\]\}]*[\]\}]/g;
  let match: RegExpExecArray | null;
  while ((match = nodePattern.exec(mermaidContent)) !== null) {
    nodes.add(match[1]);
  }

  // エッジパターン（A --> B、A -->|Yes| B、A -.-> B、A ==> B など）を検出
  // ノード定義（[]や{}）が含まれる場合も考慮: A[Start] --> B
  // ラベル付きエッジ: A -->|Yes| B
  const edgePattern =
    /(\w+)(?:[\[\{][^\]\}]*[\]\}])?\s*(?:-->|-.->|==>|---)\s*(?:\|[^|]*\|)?\s*(\w+)/g;
  let hasEdges = false;

  while ((match = edgePattern.exec(mermaidContent)) !== null) {
    hasEdges = true;
    const from = match[1];
    const to = match[2];

    nodes.add(from);
    nodes.add(to);
    connectedNodes.add(from);
    connectedNodes.add(to);
  }

  // エッジが1つもない場合
  if (!hasEdges && nodes.size > 0) {
    issues.push({
      type: 'no_edges',
      name: 'flowchart',
      message: 'フローチャートに接続が定義されていません',
    });
  }

  // 孤立ノードを検出
  for (const node of nodes) {
    if (!connectedNodes.has(node)) {
      issues.push({
        type: 'isolated_node',
        name: node,
        message: `孤立したノード: ${node}`,
      });
    }
  }

  return issues;
}

/**
 * コメントと文字列リテラルを除去
 */
function removeCommentsAndStrings(content: string): string {
  return (
    content
      // ブロックコメント除去 (/* ... */)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // 行コメント除去 (// ...)
      .replace(/\/\/.*/g, '')
      // ダブルクォート文字列
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      // シングルクォート文字列
      .replace(/'(?:[^'\\]|\\.)*'/g, "''")
      // テンプレートリテラル
      .replace(/`(?:[^`\\]|\\.)*`/g, '``')
  );
}

/**
 * メソッドボディを抽出（ネストした{}を考慮）
 *
 * @param code - コード全体
 * @param startIndex - メソッドボディの開始位置（{の直後）
 * @returns メソッドボディ
 */
function extractMethodBody(code: string, startIndex: number): string {
  let braceCount = 1;
  let endIndex = startIndex;

  while (endIndex < code.length && braceCount > 0) {
    const char = code[endIndex];
    if (char === '{') {
      braceCount++;
    } else if (char === '}') {
      braceCount--;
    }
    endIndex++;
  }

  return code.substring(startIndex, endIndex - 1);
}
