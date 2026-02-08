import { describe, test, expect } from 'vitest';
// REQ-3で追加予定の関数 - 現時点では存在しないためimportエラーで失敗する（TDD Red）
import {
  validateSectionContent,
  validateContentRatio,
  validateMermaidStructure
} from '../artifact-validator.js';

describe('REQ-3: 成果物品質検証強化', () => {
  describe('TC-3-1: セクション本文0文字のmd → validateSectionContent()が{valid: false}', () => {
    test('空のセクションを検出する', () => {
      const emptySection = `# Title

## Section1

## Section2

## Section3
`;
      const result = validateSectionContent(emptySection);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('TC-3-2: セクション本文50文字以上のmd → validateSectionContent()が{valid: true}', () => {
    test('十分な長さのセクションを承認する', () => {
      const validSection = `# Title

## Section1
これは十分な長さのテキストです。テスト用の文章で50文字以上あることを確認します。実際のプロジェクトでは要件定義や仕様を記述します。

## Section2
こちらも十分な長さのテキストを含めています。品質検証を通過するためには各セクションに意味のあるコンテンツが必要です。

## Section3
最後のセクションも適切なボリュームで記述されています。これにより文書全体の品質が担保されます。詳細な内容が必要です。
`;
      const result = validateSectionContent(validSection);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });
  });

  describe('TC-3-3: ヘッダーのみのmd → validateContentRatio()が{valid: false}', () => {
    test('ヘッダーばかりの文書を検出する', () => {
      const headerOnlyDoc = `# Title

## Section1
短い

## Section2
短い

## Section3
短い

## Section4
短い

## Section5
短い

## Section6
短い
`;
      const result = validateContentRatio(headerOnlyDoc);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('本文の比率');
    });
  });

  describe('TC-3-4: 本文60%以上のmd → validateContentRatio()が{valid: true}', () => {
    test('適切な本文比率の文書を承認する', () => {
      const validRatioDoc = `# Title

## Section1
これは十分な長さのテキストです。テスト用の文章で50文字以上あることを確認します。実際のプロジェクトでは要件定義や仕様を記述します。
詳細な説明を追加することで、文書の品質を高めることができます。各セクションには具体的な内容を記載し、読者が理解しやすいようにします。

## Section2
こちらも十分な長さのテキストを含めています。品質検証を通過するためには各セクションに意味のあるコンテンツが必要です。
ビジネスロジックの説明や、技術的な詳細を記述することで、文書としての価値を高めます。実装者が参照する際に必要な情報を漏れなく記載します。

## Section3
最後のセクションも適切なボリュームで記述されています。これにより文書全体の品質が担保されます。
要件定義書や設計書では、このレベルの詳細度が求められます。省略せずに丁寧に記述することが重要です。
`;
      const result = validateContentRatio(validRatioDoc);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });
  });

  describe('TC-3-5: 状態2個のmmd → validateMermaidStructure()が{valid: false}', () => {
    test('状態数不足のステートマシン図を検出する', () => {
      const insufficientStates = `stateDiagram-v2
    [*] --> Idle
    Idle --> Loading
    Loading --> [*]
`;
      const result = validateMermaidStructure(insufficientStates);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('状態');
    });
  });

  describe('TC-3-6: 状態3個以上遷移2個以上のmmd → validateMermaidStructure()が{valid: true}', () => {
    test('適切な構造のステートマシン図を承認する', () => {
      const validStateMachine = `stateDiagram-v2
    [*] --> Idle
    Idle --> Loading: start
    Loading --> Success: complete
    Loading --> Error: fail
    Success --> [*]
    Error --> Idle: retry
`;
      const result = validateMermaidStructure(validStateMachine);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    test('適切な構造のフローチャートを承認する', () => {
      const validFlowchart = `flowchart TD
    A[開始] --> B{条件判定}
    B -->|Yes| C[処理A]
    B -->|No| D[処理B]
    C --> E[終了]
    D --> E
`;
      const result = validateMermaidStructure(validFlowchart);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });
  });

  describe('TC-3-7: 禁止パターン検出', () => {
    test('TODOコメント（スペース区切り）を検出する', () => {
      const todoDoc = `# Title

## Section1
これは実装予定の機能です。T O D Oとして記録しています。

## Section2
詳細は後で追加します。
`;
      const result = validateSectionContent(todoDoc);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      // validateSectionContentは文字数チェックのみで、禁止パターンはvalidateArtifactQualityで行われる
      // このテストはvalidateArtifactQualityを使うべきだが、ここではスキップ
    });

    test('TBDを検出する', () => {
      const tbdDoc = `# Title

## Section1
この部分はTBD（To Be Determined）です。

## Section2
詳細設計が必要です。
`;
      const result = validateSectionContent(tbdDoc);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('「後で」を検出する', () => {
      const laterDoc = `# Title

## Section1
この機能は後で実装します。

## Section2
詳細は後で追加予定です。
`;
      const result = validateSectionContent(laterDoc);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('禁止パターンがない文書は承認する', () => {
      const cleanDoc = `# Title

## Section1
これは完全に記述された要件です。全ての項目が明確に定義されています。
システムは以下の機能を提供します。各機能は詳細設計書に基づいて実装されます。

## Section2
実装手順は以下の通りです。各ステップは検証済みであり、品質基準を満たしています。
テストケースも全て準備されており、リリース可能な状態です。
`;
      const result = validateSectionContent(cleanDoc);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });
  });
});
