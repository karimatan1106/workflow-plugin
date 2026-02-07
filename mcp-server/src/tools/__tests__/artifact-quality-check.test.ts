/**
 * REQ-3: 成果物品質チェック強化のテスト
 *
 * @spec docs/workflows/ワークフロー全問題完全解決/spec.md (REQ-3)
 * @spec docs/workflows/ワークフロー全問題完全解決/test-design.md (TC-3-*)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// 成果物品質検証の型定義
// =============================================================================

interface ArtifactRequirement {
  minLines: number;
  requiredSections: string[];
}

interface ArtifactValidationResult {
  passed: boolean;
  errors: string[];
}

// =============================================================================
// 成果物品質検証関数（実装対象）
// =============================================================================

/**
 * 成果物の品質を検証する
 *
 * @param filePath 検証対象ファイルパス
 * @param requirements 品質要件
 * @returns 検証結果
 */
function validateArtifactQuality(
  filePath: string,
  requirements: ArtifactRequirement
): ArtifactValidationResult {
  const errors: string[] = [];

  // 1. ファイル存在チェック
  if (!fs.existsSync(filePath)) {
    errors.push(`${path.basename(filePath)} が存在しません`);
    return { passed: false, errors };
  }

  // 2. サイズチェック
  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    errors.push(`${path.basename(filePath)} が空ファイルです`);
    return { passed: false, errors };
  }

  // 3. ファイル読み込み
  const content = fs.readFileSync(filePath, 'utf-8');

  // 4. 行数チェック（空白行を除外）
  const lines = content.split('\n').filter(line => line.trim().length > 0);
  if (lines.length < requirements.minLines) {
    errors.push(
      `${path.basename(filePath)} の行数が不足しています（${lines.length}行 < ${requirements.minLines}行）`
    );
  }

  // 5. 必須セクションチェック
  const missingSections = requirements.requiredSections.filter(
    section => !content.includes(section)
  );
  if (missingSections.length > 0) {
    errors.push(
      `${path.basename(filePath)} に必須セクションがありません: ${missingSections.join(', ')}`
    );
  }

  // 6. 禁止パターンチェック（TODO, TBD, WIP, FIXME）
  const forbiddenPatterns = ['TODO', 'TBD', 'WIP', 'FIXME'];
  const foundForbidden = forbiddenPatterns.filter(pattern =>
    content.includes(pattern)
  );
  if (foundForbidden.length > 0) {
    errors.push(
      `${path.basename(filePath)} に禁止パターンが含まれています: ${foundForbidden.join(', ')}`
    );
  }

  // 7. ダミーテキスト検出（同一行の3回以上繰り返し）
  const lineCountMap = new Map<string, number>();
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      lineCountMap.set(trimmed, (lineCountMap.get(trimmed) || 0) + 1);
    }
  }

  const duplicates = Array.from(lineCountMap.entries()).filter(([_, count]) => count >= 3);
  if (duplicates.length > 0) {
    errors.push(
      `${path.basename(filePath)} にダミーテキストの疑いがあります（同一行の繰り返し）`
    );
  }

  // 8. ヘッダーのみチェック（Markdown形式の場合）
  if (filePath.endsWith('.md')) {
    const nonHeaderLines = lines.filter(line => !line.trim().startsWith('#'));
    if (nonHeaderLines.length < 5) {
      errors.push(
        `${path.basename(filePath)} はヘッダーのみで本文が不足しています`
      );
    }
  }

  // 9. Mermaid図の特殊チェック
  if (filePath.endsWith('.mmd')) {
    const hasStateDiagram = content.includes('stateDiagram');
    const hasFlowchart = content.includes('flowchart');
    if (!hasStateDiagram && !hasFlowchart) {
      errors.push(
        `${path.basename(filePath)} に stateDiagram または flowchart キーワードがありません`
      );
    }
  }

  return {
    passed: errors.length === 0,
    errors,
  };
}

// =============================================================================
// フェーズ別成果物要件定数（実装対象）
// =============================================================================

const PHASE_ARTIFACT_REQUIREMENTS: Record<string, ArtifactRequirement> = {
  'research.md': {
    minLines: 20,
    requiredSections: ['## 調査結果', '## 既存実装の分析'],
  },
  'requirements.md': {
    minLines: 30,
    requiredSections: ['## 背景', '## 機能要件', '## 受入条件'],
  },
  'spec.md': {
    minLines: 50,
    requiredSections: ['## 概要', '## 実装計画', '## 変更対象ファイル'],
  },
  'test-design.md': {
    minLines: 30,
    requiredSections: ['## テストケース', '## テスト計画'],
  },
  'threat-model.md': {
    minLines: 20,
    requiredSections: ['## 脅威', '## リスク'],
  },
  'state-machine.mmd': {
    minLines: 5,
    requiredSections: ['stateDiagram'],
  },
  'flowchart.mmd': {
    minLines: 5,
    requiredSections: ['flowchart'],
  },
};

// =============================================================================
// テストスイート
// =============================================================================

describe('REQ-3: 成果物品質チェック強化', () => {
  const TEST_DIR = '/tmp/artifact-quality-test';

  beforeEach(() => {
    // テスト用ディレクトリ作成
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // テスト用ディレクトリ削除
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  // ===========================================================================
  // TC-3-1: 最小行数未満でエラー
  // ===========================================================================

  describe('TC-3-1: 最小行数未満の成果物でエラー', () => {
    it('research.md が20行未満の場合エラーになること', () => {
      const filePath = path.join(TEST_DIR, 'research.md');
      const content = `# 調査結果

## 調査結果
項目1

## 既存実装の分析
分析1
`;
      fs.writeFileSync(filePath, content);

      const result = validateArtifactQuality(
        filePath,
        PHASE_ARTIFACT_REQUIREMENTS['research.md']
      );

      expect(result.passed).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.stringContaining('research.md の行数が不足しています'),
      ]));
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.stringContaining('< 20行'),
      ]));
    });
  });

  // ===========================================================================
  // TC-3-2: spec.md が50行未満でエラー
  // ===========================================================================

  describe('TC-3-2: 最小行数未満のspec.mdでエラー', () => {
    it('spec.md が50行未満の場合エラーになること', () => {
      const filePath = path.join(TEST_DIR, 'spec.md');
      const content = `# 仕様書

## 概要
概要です

## 実装計画
計画です

## 変更対象ファイル
- src/main.ts
`;
      fs.writeFileSync(filePath, content);

      const result = validateArtifactQuality(
        filePath,
        PHASE_ARTIFACT_REQUIREMENTS['spec.md']
      );

      expect(result.passed).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.stringContaining('spec.md の行数が不足しています'),
      ]));
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.stringContaining('< 50行'),
      ]));
    });
  });

  // ===========================================================================
  // TC-3-3: TODO/TBD/WIPを含むとエラー
  // ===========================================================================

  describe('TC-3-3: TODO/TBD/WIPを含む成果物でエラー', () => {
    it('requirements.md に TODO を含む場合エラーになること', () => {
      const filePath = path.join(TEST_DIR, 'requirements.md');
      const content = `# 要件定義書

## 背景
背景です

## 機能要件
機能要件です
TODO: 詳細を後で追記

## 受入条件
受入条件です
` + '\n'.repeat(25); // 最小行数を満たすために空行追加

      fs.writeFileSync(filePath, content);

      const result = validateArtifactQuality(
        filePath,
        PHASE_ARTIFACT_REQUIREMENTS['requirements.md']
      );

      expect(result.passed).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.stringContaining('禁止パターンが含まれています: TODO'),
      ]));
    });

    it('TBD を含む場合エラーになること', () => {
      const filePath = path.join(TEST_DIR, 'requirements.md');
      const content = `# 要件定義書

## 背景
背景です

## 機能要件
機能要件です
TBD: 未定

## 受入条件
受入条件です
` + '\n'.repeat(25);

      fs.writeFileSync(filePath, content);

      const result = validateArtifactQuality(
        filePath,
        PHASE_ARTIFACT_REQUIREMENTS['requirements.md']
      );

      expect(result.passed).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.stringContaining('TBD'),
      ]));
    });

    it('WIP を含む場合エラーになること', () => {
      const filePath = path.join(TEST_DIR, 'requirements.md');
      const content = `# 要件定義書

## 背景
背景です

## 機能要件
機能要件です
WIP: 作業中

## 受入条件
受入条件です
` + '\n'.repeat(25);

      fs.writeFileSync(filePath, content);

      const result = validateArtifactQuality(
        filePath,
        PHASE_ARTIFACT_REQUIREMENTS['requirements.md']
      );

      expect(result.passed).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.stringContaining('WIP'),
      ]));
    });
  });

  // ===========================================================================
  // TC-3-4: 必須セクションがないとエラー
  // ===========================================================================

  describe('TC-3-4: 必須セクションがない成果物でエラー', () => {
    it('requirements.md に「## 背景」がない場合エラーになること', () => {
      const filePath = path.join(TEST_DIR, 'requirements.md');
      const content = `# 要件定義書

## 機能要件
機能要件です

## 受入条件
受入条件です
` + '\n'.repeat(30);

      fs.writeFileSync(filePath, content);

      const result = validateArtifactQuality(
        filePath,
        PHASE_ARTIFACT_REQUIREMENTS['requirements.md']
      );

      expect(result.passed).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.stringContaining('## 背景'),
      ]));
    });

    it('複数のセクションが欠けている場合、全て報告されること', () => {
      const filePath = path.join(TEST_DIR, 'requirements.md');
      const content = `# 要件定義書

## その他
その他の内容
` + '\n'.repeat(30);

      fs.writeFileSync(filePath, content);

      const result = validateArtifactQuality(
        filePath,
        PHASE_ARTIFACT_REQUIREMENTS['requirements.md']
      );

      expect(result.passed).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.stringContaining('## 背景'),
      ]));
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.stringContaining('## 機能要件'),
      ]));
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.stringContaining('## 受入条件'),
      ]));
    });
  });

  // ===========================================================================
  // TC-3-5: 同一行の繰り返しでエラー（ダミーテキスト検出）
  // ===========================================================================

  describe('TC-3-5: 同一行が3回以上繰り返されるダミーテキストでエラー', () => {
    it('同じ行が3回繰り返される場合エラーになること', () => {
      const filePath = path.join(TEST_DIR, 'research.md');
      const content = `# 調査結果

## 調査結果
調査項目1
調査項目1
調査項目1
調査項目2

## 既存実装の分析
分析内容
` + '\n'.repeat(15);

      fs.writeFileSync(filePath, content);

      const result = validateArtifactQuality(
        filePath,
        PHASE_ARTIFACT_REQUIREMENTS['research.md']
      );

      expect(result.passed).toBe(false);
      expect(result.errors).toContain(
        'research.md にダミーテキストの疑いがあります（同一行の繰り返し）'
      );
    });
  });

  // ===========================================================================
  // TC-3-6: ヘッダーのみで本文がない成果物でエラー
  // ===========================================================================

  describe('TC-3-6: ヘッダーのみで本文がない成果物でエラー', () => {
    it('Markdownファイルがヘッダーのみの場合エラーになること', () => {
      const filePath = path.join(TEST_DIR, 'research.md');
      const content = `# 調査結果
## 調査結果
## 既存実装の分析
## その他
## 結論
` + '\n'.repeat(20);

      fs.writeFileSync(filePath, content);

      const result = validateArtifactQuality(
        filePath,
        PHASE_ARTIFACT_REQUIREMENTS['research.md']
      );

      expect(result.passed).toBe(false);
      expect(result.errors).toContain(
        'research.md はヘッダーのみで本文が不足しています'
      );
    });
  });

  // ===========================================================================
  // TC-3-7: 正常な成果物で通過
  // ===========================================================================

  describe('TC-3-7: 正常な成果物で通過すること', () => {
    it('research.md が全ての品質基準を満たす場合通過すること', () => {
      const filePath = path.join(TEST_DIR, 'research.md');
      const content = `# 調査結果

## 調査結果

既存システムの調査を行いました。

調査項目1: データベース構造の確認
調査項目2: API仕様の確認
調査項目3: フロントエンドの実装確認
調査項目4: テストコードの確認
調査項目5: ドキュメントの確認
調査項目6: セキュリティ設定の確認
調査項目7: パフォーマンス要件の確認

## 既存実装の分析

以下の実装を分析しました：
- ユーザー認証機能
- データ永続化層
- API エンドポイント
- フロントエンドコンポーネント
- テストスイート
- CI/CDパイプライン

分析結果として、改善点が3つ見つかりました。
今後の実装では、これらの点に注意する必要があります。
セキュリティの観点からも改善が必要です。
`;

      fs.writeFileSync(filePath, content);

      const result = validateArtifactQuality(
        filePath,
        PHASE_ARTIFACT_REQUIREMENTS['research.md']
      );

      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('requirements.md が全ての品質基準を満たす場合通過すること', () => {
      const filePath = path.join(TEST_DIR, 'requirements.md');
      const content = `# 要件定義書

## 背景

本プロジェクトは、ワークフロー管理システムの改善を目的としています。
現状のシステムには以下の課題があります：
- 成果物の品質チェックが不十分
- フェーズ遷移時の検証が甘い
- ドキュメントが不足している
- セキュリティバイパスが可能
- テスト結果の信頼性が低い

## 機能要件

### FR-1: 成果物品質チェック
- 最小行数の検証
- 必須セクションの検証
- 禁止パターンの検出
- ダミーテキストの検出

### FR-2: フェーズ遷移制御
- 前提条件の確認
- 成果物の存在確認
- 承認フローの実装
- 品質基準の強制

### FR-3: ドキュメント管理
- 自動生成機能
- テンプレート提供
- バージョン管理
- 整合性チェック

## 受入条件

- AC-1: 成果物チェックが全フェーズで動作すること
- AC-2: 不正なフェーズ遷移がブロックされること
- AC-3: ドキュメントが自動生成されること
- AC-4: テストカバレッジが90%以上であること
- AC-5: セキュリティバイパスが不可能であること
`;

      fs.writeFileSync(filePath, content);

      const result = validateArtifactQuality(
        filePath,
        PHASE_ARTIFACT_REQUIREMENTS['requirements.md']
      );

      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('spec.md が全ての品質基準を満たす場合通過すること', () => {
      const filePath = path.join(TEST_DIR, 'spec.md');
      const content = `# 仕様書

## 概要

ワークフロー管理システムの成果物品質チェック機能を実装します。
この機能により、AI駆動開発の品質を担保します。
本仕様書では、成果物品質チェックの詳細な設計を記述します。

主要な機能：
1. 最小行数チェック
2. 必須セクションチェック
3. 禁止パターン検出
4. ダミーテキスト検出
5. ヘッダーのみ検出
6. Mermaid図キーワードチェック

## 実装計画

### フェーズ1: 品質チェック関数の実装
- validateArtifactQuality 関数の作成
- PHASE_ARTIFACT_REQUIREMENTS 定数の定義
- テストケースの作成
- 品質基準の定義

### フェーズ2: next.ts への統合
- checkPhaseArtifacts 関数の拡張
- エラーメッセージの改善
- ログ出力の追加
- 検証結果の返却

### フェーズ3: complete-sub.ts への統合
- checkSubPhaseArtifacts 関数の拡張
- 並列フェーズ対応
- エラーハンドリング強化
- サブフェーズ別検証

### フェーズ4: テストとドキュメント
- 単体テストの実装
- 統合テストの実装
- ドキュメントの更新
- カバレッジ確認

## 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| mcp-server/src/tools/next.ts | checkPhaseArtifacts 関数の拡張 |
| mcp-server/src/tools/complete-sub.ts | checkSubPhaseArtifacts 関数の拡張 |
| mcp-server/src/validation/artifact-validator.ts | 新規作成 |
| mcp-server/src/tools/record-test-result.ts | テスト真正性統合 |
| mcp-server/src/tools/set-scope.ts | スコープ検証統合 |

## 技術仕様

### 検証項目
1. ファイル存在チェック
2. サイズチェック（0バイト検出）
3. 最小行数チェック
4. 必須セクションチェック
5. 禁止パターン検出
6. ダミーテキスト検出
7. ヘッダーのみ検出
8. Mermaid図キーワードチェック

### エラーメッセージ形式
検証失敗時は以下の形式でエラーを返す：
- ファイル名（basename）
- エラー理由（日本語）
- 期待値と実際の値
- 修正のための提案
`;

      fs.writeFileSync(filePath, content);

      const result = validateArtifactQuality(
        filePath,
        PHASE_ARTIFACT_REQUIREMENTS['spec.md']
      );

      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  // ===========================================================================
  // TC-3-8: .mmd ファイルのキーワードチェック
  // ===========================================================================

  describe('TC-3-8: Mermaid図のstateDiagram/flowchartキーワードチェック', () => {
    it('state-machine.mmd に stateDiagram がない場合エラーになること', () => {
      const filePath = path.join(TEST_DIR, 'state-machine.mmd');
      const content = `# ステートマシン図
graph TD
A --> B
B --> C
`;

      fs.writeFileSync(filePath, content);

      const result = validateArtifactQuality(
        filePath,
        PHASE_ARTIFACT_REQUIREMENTS['state-machine.mmd']
      );

      expect(result.passed).toBe(false);
      expect(result.errors).toContain(
        'state-machine.mmd に stateDiagram または flowchart キーワードがありません'
      );
    });

    it('flowchart.mmd に flowchart がない場合エラーになること', () => {
      const filePath = path.join(TEST_DIR, 'flowchart.mmd');
      const content = `# フローチャート
graph TD
A --> B
`;

      fs.writeFileSync(filePath, content);

      const result = validateArtifactQuality(
        filePath,
        PHASE_ARTIFACT_REQUIREMENTS['flowchart.mmd']
      );

      expect(result.passed).toBe(false);
      expect(result.errors).toContain(
        'flowchart.mmd に stateDiagram または flowchart キーワードがありません'
      );
    });

    it('state-machine.mmd が正しい形式の場合通過すること', () => {
      const filePath = path.join(TEST_DIR, 'state-machine.mmd');
      const content = `stateDiagram-v2
    [*] --> Idle
    Idle --> Processing: 開始
    Processing --> Success: 成功
    Processing --> Error: 失敗
    Success --> [*]
    Error --> Idle: リトライ
`;

      fs.writeFileSync(filePath, content);

      const result = validateArtifactQuality(
        filePath,
        PHASE_ARTIFACT_REQUIREMENTS['state-machine.mmd']
      );

      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('flowchart.mmd が正しい形式の場合通過すること', () => {
      const filePath = path.join(TEST_DIR, 'flowchart.mmd');
      const content = `flowchart TD
    A[開始] --> B{条件判定}
    B -->|Yes| C[処理A]
    B -->|No| D[処理B]
    C --> E[終了]
    D --> E
`;

      fs.writeFileSync(filePath, content);

      const result = validateArtifactQuality(
        filePath,
        PHASE_ARTIFACT_REQUIREMENTS['flowchart.mmd']
      );

      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  // ===========================================================================
  // TC-3-9: PHASE_ARTIFACT_REQUIREMENTS定数が全フェーズをカバー
  // ===========================================================================

  describe('TC-3-9: PHASE_ARTIFACT_REQUIREMENTS定数が全フェーズをカバーしていること', () => {
    it('主要なフェーズの成果物が定義されていること', () => {
      const requiredArtifacts = [
        'research.md',
        'requirements.md',
        'spec.md',
        'test-design.md',
        'threat-model.md',
        'state-machine.mmd',
        'flowchart.mmd',
      ];

      for (const artifact of requiredArtifacts) {
        expect(PHASE_ARTIFACT_REQUIREMENTS).toHaveProperty(artifact);
        expect(PHASE_ARTIFACT_REQUIREMENTS[artifact]).toHaveProperty('minLines');
        expect(PHASE_ARTIFACT_REQUIREMENTS[artifact]).toHaveProperty('requiredSections');
        expect(PHASE_ARTIFACT_REQUIREMENTS[artifact].minLines).toBeGreaterThan(0);
        expect(PHASE_ARTIFACT_REQUIREMENTS[artifact].requiredSections.length).toBeGreaterThan(0);
      }
    });

    it('各成果物の最小行数が適切に設定されていること', () => {
      expect(PHASE_ARTIFACT_REQUIREMENTS['research.md'].minLines).toBe(20);
      expect(PHASE_ARTIFACT_REQUIREMENTS['requirements.md'].minLines).toBe(30);
      expect(PHASE_ARTIFACT_REQUIREMENTS['spec.md'].minLines).toBe(50);
      expect(PHASE_ARTIFACT_REQUIREMENTS['test-design.md'].minLines).toBe(30);
      expect(PHASE_ARTIFACT_REQUIREMENTS['threat-model.md'].minLines).toBe(20);
      expect(PHASE_ARTIFACT_REQUIREMENTS['state-machine.mmd'].minLines).toBe(5);
      expect(PHASE_ARTIFACT_REQUIREMENTS['flowchart.mmd'].minLines).toBe(5);
    });
  });

  // ===========================================================================
  // エッジケース: 空ファイル
  // ===========================================================================

  describe('エッジケース: 空ファイル', () => {
    it('0バイトのファイルでエラーになること', () => {
      const filePath = path.join(TEST_DIR, 'research.md');
      fs.writeFileSync(filePath, '');

      const result = validateArtifactQuality(
        filePath,
        PHASE_ARTIFACT_REQUIREMENTS['research.md']
      );

      expect(result.passed).toBe(false);
      expect(result.errors).toContain('research.md が空ファイルです');
    });
  });

  // ===========================================================================
  // エッジケース: ファイル不存在
  // ===========================================================================

  describe('エッジケース: ファイル不存在', () => {
    it('存在しないファイルでエラーになること', () => {
      const filePath = path.join(TEST_DIR, 'nonexistent.md');

      const result = validateArtifactQuality(
        filePath,
        PHASE_ARTIFACT_REQUIREMENTS['research.md']
      );

      expect(result.passed).toBe(false);
      expect(result.errors).toContain('nonexistent.md が存在しません');
    });
  });

  // ===========================================================================
  // 複合エラー: 複数の問題が同時に存在する場合
  // ===========================================================================

  describe('複合エラー: 複数の問題が同時に存在する場合', () => {
    it('行数不足 + 禁止パターン + ダミーテキストで全てエラーになること', () => {
      const filePath = path.join(TEST_DIR, 'research.md');
      const content = `# 調査結果

## 調査結果
TODO: 後で記述
同じ内容
同じ内容
同じ内容

## 既存実装の分析
分析内容
`;

      fs.writeFileSync(filePath, content);

      const result = validateArtifactQuality(
        filePath,
        PHASE_ARTIFACT_REQUIREMENTS['research.md']
      );

      expect(result.passed).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.stringContaining('行数が不足しています'),
      ]));
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.stringContaining('禁止パターンが含まれています'),
      ]));
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.stringContaining('ダミーテキストの疑いがあります'),
      ]));
    });
  });
});
