/**
 * 設計-実装整合性検証の型定義
 * @spec docs/spec/features/validation-types.md
 */

/** 検証結果 */
export interface ValidationResult {
  passed: boolean;
  phase: string;
  timestamp: string;
  summary: {
    total: number;
    implemented: number;
    missing: number;
  };
  missingItems: MissingItem[];
  warnings: string[];
}

/** 未実装項目 */
export interface MissingItem {
  type: 'class' | 'method' | 'state' | 'process' | 'requirement' | 'file';
  source: string;
  name: string;
  expectedPath?: string;
}

/** Spec.md から抽出した項目 */
export interface SpecItems {
  classes: string[];
  methods: string[];
  filePaths: string[];
}

/** 状態遷移 */
export interface Transition {
  from: string;
  to: string;
  trigger: string;
}

/** State Machine から抽出した項目 */
export interface StateMachineItems {
  states: string[];
  transitions: Transition[];
  hasStart: boolean;
  hasEnd: boolean;
}

/** プロセス項目 */
export interface ProcessItem {
  id: string;
  label: string;
}

/** 決定点項目 */
export interface DecisionItem {
  id: string;
  label: string;
}

/** Flowchart から抽出した項目 */
export interface FlowchartItems {
  processes: ProcessItem[];
  decisions: DecisionItem[];
  subgraphs: string[];
}

/** 要件項目 */
export interface Requirement {
  id: string;
  description: string;
  priority?: string;
}

/** 受け入れ基準 */
export interface AcceptanceCriteria {
  text: string;
  checked: boolean;
}

/** Requirements.md から抽出した項目 */
export interface RequirementItems {
  functional: Requirement[];
  nonFunctional: Requirement[];
  acceptance: AcceptanceCriteria[];
}

/** 全設計項目 */
export interface DesignItems {
  spec: SpecItems;
  stateMachine: StateMachineItems;
  flowchart: FlowchartItems;
  requirements: RequirementItems;
}
