/**
 * MermaidParser ユニットテスト
 * @spec docs/workflows/設計-実装整合性の自動検証機能/test-design.md
 */

import { describe, it, expect } from 'vitest';
import {
  parseStateMachine,
  parseFlowchart,
  type StateMachineItems,
  type FlowchartItems,
} from '../../src/validation/parsers/mermaid-parser.js';

describe('MermaidParser - StateMachine', () => {
  describe('UT-2.1: 状態抽出', () => {
    it('状態ノードを抽出できる', () => {
      const mermaid = `
stateDiagram-v2
    A --> B
    B --> C
`;
      const result = parseStateMachine(mermaid);
      expect(result.states).toContain('A');
      expect(result.states).toContain('B');
      expect(result.states).toContain('C');
    });
  });

  describe('UT-2.2: 遷移抽出', () => {
    it('遷移とトリガーを抽出できる', () => {
      const mermaid = `
stateDiagram-v2
    A --> B: trigger
`;
      const result = parseStateMachine(mermaid);
      expect(result.transitions).toContainEqual({
        from: 'A',
        to: 'B',
        trigger: 'trigger',
      });
    });
  });

  describe('UT-2.3: 開始状態', () => {
    it('開始状態を検出できる', () => {
      const mermaid = `
stateDiagram-v2
    [*] --> A
`;
      const result = parseStateMachine(mermaid);
      expect(result.hasStart).toBe(true);
    });
  });

  describe('UT-2.4: 終了状態', () => {
    it('終了状態を検出できる', () => {
      const mermaid = `
stateDiagram-v2
    A --> [*]
`;
      const result = parseStateMachine(mermaid);
      expect(result.hasEnd).toBe(true);
    });
  });
});

describe('MermaidParser - Flowchart', () => {
  describe('UT-3.1: プロセス抽出', () => {
    it('プロセスノードを抽出できる', () => {
      const mermaid = `
flowchart TD
    A[Process]
`;
      const result = parseFlowchart(mermaid);
      expect(result.processes).toContainEqual({
        id: 'A',
        label: 'Process',
      });
    });
  });

  describe('UT-3.2: 決定点抽出', () => {
    it('決定ノードを抽出できる', () => {
      const mermaid = `
flowchart TD
    B{Decision?}
`;
      const result = parseFlowchart(mermaid);
      expect(result.decisions).toContainEqual({
        id: 'B',
        label: 'Decision?',
      });
    });
  });

  describe('UT-3.3: サブグラフ抽出', () => {
    it('サブグラフ名を抽出できる', () => {
      const mermaid = `
flowchart TD
    subgraph ExternalSystem
        A[API]
    end
`;
      const result = parseFlowchart(mermaid);
      expect(result.subgraphs).toContain('ExternalSystem');
    });
  });
});
