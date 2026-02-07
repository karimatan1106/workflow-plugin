/**
 * Mermaid パーサー（StateMachine / Flowchart）
 * @spec docs/spec/features/mermaid-parser.md
 */

import type {
  StateMachineItems,
  FlowchartItems,
  Transition,
  ProcessItem,
  DecisionItem,
} from '../types.js';

/**
 * state-machine.mmd から状態遷移を抽出
 *
 * Mermaid のステートマシン図から以下を抽出する：
 * - 状態一覧（`[*]` は開始/終了として扱う）
 * - 遷移（`StateA --> StateB: trigger` パターン）
 *
 * @param mermaid state-machine.mmd の内容
 * @returns 抽出された状態と遷移
 */
export function parseStateMachine(mermaid: string): StateMachineItems {
  const result: StateMachineItems = {
    states: [],
    transitions: [],
    hasStart: false,
    hasEnd: false,
  };

  if (!mermaid) {
    return result;
  }

  const lines = mermaid.split('\n');

  for (const line of lines) {
    // 遷移抽出: StateA --> StateB: trigger
    const match = line.match(/(\[\*\]|\w+)\s*-->\s*(\[\*\]|\w+)(?:\s*:\s*(.+))?/);
    if (match) {
      const from = match[1].trim();
      const to = match[2].trim();
      const trigger = match[3]?.trim() || '';

      // 状態を追加
      if (from === '[*]') {
        result.hasStart = true;
      } else if (!result.states.includes(from)) {
        result.states.push(from);
      }

      if (to === '[*]') {
        result.hasEnd = true;
      } else if (!result.states.includes(to)) {
        result.states.push(to);
      }

      // 遷移を追加
      result.transitions.push({ from, to, trigger });
    }
  }

  return result;
}

/**
 * flowchart.mmd からフロー要素を抽出
 *
 * Mermaid のフローチャートから以下を抽出する：
 * - プロセスノード（`ID[Label]` パターン）
 * - 決定ノード（`ID{Label}` パターン）
 * - サブグラフ（`subgraph Name` パターン）
 *
 * @param mermaid flowchart.mmd の内容
 * @returns 抽出されたノードとサブグラフ
 */
export function parseFlowchart(mermaid: string): FlowchartItems {
  const result: FlowchartItems = {
    processes: [],
    decisions: [],
    subgraphs: [],
  };

  if (!mermaid) {
    return result;
  }

  // プロセスノード抽出: ID[Label]
  const processMatches = mermaid.matchAll(/(\w+)\[([^\]]+)\]/g);
  for (const match of processMatches) {
    const item: ProcessItem = {
      id: match[1],
      label: match[2],
    };
    if (!result.processes.some(p => p.id === item.id)) {
      result.processes.push(item);
    }
  }

  // 決定ノード抽出: ID{Label}
  const decisionMatches = mermaid.matchAll(/(\w+)\{([^}]+)\}/g);
  for (const match of decisionMatches) {
    const item: DecisionItem = {
      id: match[1],
      label: match[2],
    };
    if (!result.decisions.some(d => d.id === item.id)) {
      result.decisions.push(item);
    }
  }

  // サブグラフ抽出: subgraph Name
  const subgraphMatches = mermaid.matchAll(/subgraph\s+(\w+)/g);
  for (const match of subgraphMatches) {
    if (!result.subgraphs.includes(match[1])) {
      result.subgraphs.push(match[1]);
    }
  }

  return result;
}
