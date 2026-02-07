/**
 * AST解析モジュールのテスト（TDD Red Phase）
 *
 * @spec docs/workflows/ワ-クフロ-1000万行対応強化/test-design.md
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeTypeScriptStructure,
  analyzeStateMachine,
  analyzeFlowchart,
  type StructuralIssue,
} from '../ast-analyzer.js';

describe('analyzeTypeScriptStructure', () => {
  it('TC-2.1: 空のクラスを検出', () => {
    const code = `class Foo {}`;
    const issues = analyzeTypeScriptStructure(code);

    expect(issues).toContainEqual(
      expect.objectContaining({
        type: 'empty_class',
        name: 'Foo',
      })
    );
  });

  it('TC-2.2: ボディありクラスはパス', () => {
    const code = `class Foo {
      method() { return 1; }
    }`;
    const issues = analyzeTypeScriptStructure(code);

    expect(issues.filter(i => i.type === 'empty_class')).toHaveLength(0);
  });

  it('TC-2.3: 空のメソッドを検出', () => {
    const code = `class Foo {
      bar() {}
    }`;
    const issues = analyzeTypeScriptStructure(code);

    expect(issues).toContainEqual(
      expect.objectContaining({
        type: 'empty_method',
        name: 'bar',
      })
    );
  });

  it('TC-2.4: not implementedメソッドを検出', () => {
    const code = `class Foo {
      bar() { throw new Error('not implemented'); }
    }`;
    const issues = analyzeTypeScriptStructure(code);

    expect(issues).toContainEqual(
      expect.objectContaining({
        type: 'not_implemented',
        name: 'bar',
      })
    );
  });

  it('メソッドボディありクラスはパス', () => {
    const code = `class User {
      name: string;
      email: string;

      getUser() {
        return this.name;
      }
    }`;
    const issues = analyzeTypeScriptStructure(code);

    // 空クラス・空メソッドなし
    expect(issues.filter(i => i.type === 'empty_class')).toHaveLength(0);
    expect(issues.filter(i => i.type === 'empty_method')).toHaveLength(0);
  });
});

describe('analyzeStateMachine', () => {
  it('TC-2.5: ステートマシンにノードのみ（遷移なし）→ no_transitions検出', () => {
    const mermaidContent = `stateDiagram-v2
  StateA
  StateB
  StateC
`;
    const issues = analyzeStateMachine(mermaidContent);

    expect(issues).toContainEqual(
      expect.objectContaining({
        type: 'no_transitions',
      })
    );
  });

  it('TC-2.5 補足: 孤立ノード検出', () => {
    const mermaidContent = `stateDiagram-v2
  [*] --> StateA
  StateA --> StateB
  StateC
`;
    const issues = analyzeStateMachine(mermaidContent);

    expect(issues).toContainEqual(
      expect.objectContaining({
        type: 'isolated_node',
        name: 'StateC',
      })
    );
  });

  it('TC-2.7: 正常なステートマシン → 問題なし', () => {
    const mermaidContent = `stateDiagram-v2
  [*] --> Idle
  Idle --> Loading
  Loading --> Success
  Loading --> Error
  Success --> [*]
  Error --> [*]
`;
    const issues = analyzeStateMachine(mermaidContent);

    // 問題なし
    expect(issues.filter(i => i.type === 'no_transitions')).toHaveLength(0);
    expect(issues.filter(i => i.type === 'isolated_node')).toHaveLength(0);
  });
});

describe('analyzeFlowchart', () => {
  it('TC-2.6: フローチャートにノードのみ（接続なし）→ no_edges検出', () => {
    const mermaidContent = `flowchart TD
  A[Start]
  B[Process]
  C[End]
`;
    const issues = analyzeFlowchart(mermaidContent);

    expect(issues).toContainEqual(
      expect.objectContaining({
        type: 'no_edges',
      })
    );
  });

  it('TC-2.6 補足: 孤立ノード検出', () => {
    const mermaidContent = `flowchart TD
  A[Start] --> B[Process]
  C[End]
`;
    const issues = analyzeFlowchart(mermaidContent);

    expect(issues).toContainEqual(
      expect.objectContaining({
        type: 'isolated_node',
        name: 'C',
      })
    );
  });

  it('TC-2.8: 正常なフローチャート → 問題なし', () => {
    const mermaidContent = `flowchart TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Process A]
  B -->|No| D[Process B]
  C --> E[End]
  D --> E
`;
    const issues = analyzeFlowchart(mermaidContent);

    // 問題なし
    expect(issues.filter(i => i.type === 'no_edges')).toHaveLength(0);
    expect(issues.filter(i => i.type === 'isolated_node')).toHaveLength(0);
  });
});
