# Planning フェーズ

## subagent実行

このフェーズは**subagentとして実行**される。
**並列フェーズ (parallel_analysis)** の一部として実行される。

---

## 目的

要件に基づいて仕様書を作成し、実装計画を立てる。

## 入力

- タスクディレクトリ: `{workflowDir}`
- 要件: `requirements.md`
- 調査結果: `research.md`

## 実行手順

1. **仕様書の作成**
   - 機能仕様を詳細化
   - インターフェース設計
   - データ構造設計

2. **実装計画**
   - 実装順序を決定
   - 依存関係を整理
   - 作業項目をリストアップ

3. **docs/specs/ への反映**
   - 仕様書を `docs/specs/domains/{domain}/` に作成

## 出力ファイル

### `docs/specs/domains/{domain}/{name}.md`

````markdown
# [機能名] 仕様書

## 概要

[機能の概要説明]

## 関連ファイル

<!-- @related-files -->

- `path/to/file1.ts`
- `path/to/file2.ts`
<!-- @end-related-files -->

## 機能仕様

### [機能1]

**入力**:

- [入力パラメータ]

**出力**:

- [出力形式]

**処理**:

1. [処理ステップ1]
2. [処理ステップ2]

### [機能2]

...

## インターフェース

### API

```typescript
interface ExampleRequest {
  // ...
}

interface ExampleResponse {
  // ...
}
```
````

### イベント

| イベント名  | ペイロード | トリガー |
| ----------- | ---------- | -------- |
| [イベント1] | [型]       | [条件]   |

## データ構造

```typescript
interface ExampleData {
  // ...
}
```

## エラーハンドリング

| エラー    | 原因   | 対応   |
| --------- | ------ | ------ |
| [エラー1] | [原因] | [対応] |

## 変更履歴

| 日付       | 内容     |
| ---------- | -------- |
| YYYY-MM-DD | 初版作成 |

````

### `{workflowDir}/log.md` への追記

```markdown
### PLANNING（設計）

- 仕様書: `docs/specs/domains/{domain}/{name}.md`
- 実装対象ファイル:
  - `path/to/file1.ts`
  - `path/to/file2.ts`
````

## 禁止事項

- コードの編集
- 実装の開始

## 完了条件

- [ ] 仕様書を docs/specs/ に作成した
- [ ] インターフェースを定義した
- [ ] データ構造を設計した
- [ ] エラーハンドリングを定義した
- [ ] log.md に実装対象ファイルを記録した
