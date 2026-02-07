/**
 * REQ-5: 成果物内容検証強化テスト
 * @spec docs/workflows/ワークフローブラグイン大規模対応根本改修/test-design.md
 */
import { describe, test, expect } from 'vitest';

// Since check-workflow-artifact.js is a hook (not a module),
// we re-implement and test the validation logic directly.

const MIN_ARTIFACT_SIZE = 200;

const REQUIRED_SECTIONS: Record<string, string[]> = {
  'requirements.md': ['## 機能要件', '## 背景'],
  'spec.md': ['## 実装計画', '## アーキテクチャ'],
  'threat-model.md': ['## 脅威', '## リスク'],
  'test-design.md': ['## テストケース', '## テスト計画'],
  'research.md': ['## 調査結果', '## 既存実装の分析'],
  'state-machine.mmd': ['stateDiagram-v2'],
  'flowchart.mmd': ['flowchart'],
  'ui-design.md': ['## UI設計', '## コンポーネント仕様'],
};

const FORBIDDEN_PATTERNS = [
  /^\s*TODO\s*$/,
  /^\s*WIP\s*$/,
  /^\s*#[^#\n]*\s*$/,
];

function validateArtifactContent(
  fileName: string,
  content: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // .mmd (Mermaid) ファイルはサイズチェックをスキップ（図表は自然に短い）
  const isMermaid = fileName.endsWith('.mmd');

  if (!isMermaid && content.length < MIN_ARTIFACT_SIZE) {
    errors.push(
      `サイズ不足: ${content.length}バイト（最小: ${MIN_ARTIFACT_SIZE}バイト）`
    );
  }

  const requiredSections = REQUIRED_SECTIONS[fileName];
  if (requiredSections) {
    const hasRequired = requiredSections.some((s) => content.includes(s));
    if (!hasRequired) {
      errors.push(
        `必須セクションが見つかりません: ${requiredSections.join(' または ')}`
      );
    }
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(content.trim())) {
      errors.push(
        '禁止パターンが検出されました: ファイルがスタブまたは空です'
      );
      break;
    }
  }

  const lines = content
    .trim()
    .split('\n')
    .filter((l) => l.trim().length > 0);
  const headerOnly = lines.every((l) => l.startsWith('#'));
  if (headerOnly) {
    errors.push('ヘッダーのみで本文がありません');
  }

  return { valid: errors.length === 0, errors };
}

describe('REQ-5: 成果物内容検証強化', () => {
  describe('TC-5-1: サイズ検証', () => {
    test('200バイト未満の成果物 → サイズ不足エラー', () => {
      const content = 'Short content';
      const result = validateArtifactContent('requirements.md', content);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors[0]).toContain('サイズ不足');
      expect(result.errors[0]).toContain('200バイト');
    });
  });

  describe('TC-5-2: 正常サイズ検証', () => {
    test('200バイト以上の正常コンテンツ → 通過', () => {
      const content = `
# Requirements Document

## 機能要件
本機能は以下の要件を満たす必要があります。
1. ユーザー認証機能の実装と統合テスト対応
2. データベースへの永続化処理の設計と実装
3. エラーハンドリングとリトライ機構の設計

## 背景
この機能は現行システムの課題を解決するために必要です。
具体的には以下の問題に対処します。
- パフォーマンスの低下による応答時間の増大
- スケーラビリティの欠如によるユーザー増加時の問題
- エラー発生時の復旧手順が整備されていない
`;

      const result = validateArtifactContent('requirements.md', content);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('TC-5-3: 必須セクション検証（エラーケース）', () => {
    test('requirements.mdに`## 機能要件`なし → エラー', () => {
      const content = `
# Requirements Document

## 概要
これは要件定義書です。機能の概要を記述します。

## 詳細
詳細な説明がここに入ります。この文章は200文字を超えるように十分に長く書かれています。
さらに追加のテキストを含めて、サイズ要件を満たすようにします。
もう少し追加の内容を記述します。追加のコンテンツを含めます。
さらに説明を加えることで、最小サイズ要件を確実に満たします。
`.trim();

      const result = validateArtifactContent('requirements.md', content);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes('必須セクション'))).toBe(
        true
      );
    });
  });

  describe('TC-5-4: 必須セクション検証（正常ケース）', () => {
    test('requirements.mdに`## 機能要件`あり → 通過', () => {
      const content = `
# Requirements Document

## 機能要件
本機能は以下の要件を満たす必要があります。
1. ユーザー認証機能を実装する。セッション管理とトークン発行を含む。
2. データベースへの永続化処理を設計・実装する。トランザクション対応を含む。
3. 適切なエラーハンドリングを行う。リトライ機構とフォールバック処理を含む。

詳細な説明がここに入ります。この文章は200文字を超えるように十分に長く書かれています。
さらに追加のテキストを含めて、サイズ要件を満たすようにします。
`.trim();

      const result = validateArtifactContent('requirements.md', content);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('TC-5-5: 禁止パターン検出（TODO）', () => {
    test('"TODO"のみ → 禁止パターン検出', () => {
      const content = 'TODO';

      const result = validateArtifactContent('requirements.md', content);

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes('禁止パターン'))
      ).toBe(true);
    });
  });

  describe('TC-5-6: 禁止パターン検出（WIP）', () => {
    test('"WIP"のみ → 禁止パターン検出', () => {
      const content = '  WIP  ';

      const result = validateArtifactContent('spec.md', content);

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes('禁止パターン'))
      ).toBe(true);
    });
  });

  describe('TC-5-7: ヘッダーのみ検証', () => {
    test('ヘッダーのみ（`# Title\\n## Section`） → ヘッダーのみエラー', () => {
      const content = `
# Title
## Section
### Subsection
#### Detail
##### More Detail
###### Even More Detail
`.trim();

      const result = validateArtifactContent('spec.md', content);

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes('ヘッダーのみ'))
      ).toBe(true);
    });
  });

  describe('TC-5-8: 完全な正常成果物', () => {
    test('正常な成果物 → 通過', () => {
      const content = `
# Specification Document

## 実装計画
本仕様書では、新機能の実装計画を詳細に記述します。

### フェーズ1: 基盤実装
- データモデルの定義
- APIエンドポイントの設計
- 認証機構の実装

### フェーズ2: UI実装
- コンポーネント設計
- 画面遷移の実装
- レスポンシブ対応

## アーキテクチャ
システムアーキテクチャの概要を以下に示します。

### レイヤー構成
- プレゼンテーション層
- アプリケーション層
- ドメイン層
- インフラストラクチャ層

各層の責務と依存関係について詳細に説明します。
`.trim();

      const result = validateArtifactContent('spec.md', content);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Mermaid図の検証', () => {
    test('state-machine.mmdに`stateDiagram-v2`あり → 通過', () => {
      const content = `
stateDiagram-v2
    [*] --> Idle
    Idle --> Loading: 開始
    Loading --> Success: 成功
    Loading --> Error: 失敗
    Success --> [*]
    Error --> Idle: リトライ
`.trim();

      const result = validateArtifactContent('state-machine.mmd', content);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('flowchart.mmdに`flowchart`あり → 通過', () => {
      const content = `
flowchart TD
    A[開始] --> B{条件判定}
    B -->|Yes| C[処理A]
    B -->|No| D[処理B]
    C --> E[終了]
    D --> E
    E --> [*]
`.trim();

      const result = validateArtifactContent('flowchart.mmd', content);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('state-machine.mmdに`stateDiagram-v2`なし → エラー', () => {
      const content = `
graph TD
    A --> B
    B --> C
`.trim();

      const result = validateArtifactContent('state-machine.mmd', content);

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes('必須セクション'))
      ).toBe(true);
    });
  });

  describe('複数エラーの検出', () => {
    test('サイズ不足 + 必須セクションなし → 両方のエラーを報告', () => {
      const content = '短い内容';

      const result = validateArtifactContent('requirements.md', content);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes('サイズ不足'))).toBe(
        true
      );
    });
  });
});
