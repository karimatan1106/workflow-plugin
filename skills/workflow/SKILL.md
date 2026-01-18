---
name: workflow
description: 開発タスクを体系的に管理するワークフロースキル。18フェーズの完全なワークフローを提供し、TDD方式での高品質な開発プロセスを支援します。フェーズスキップを防止し、設計レビューや承認プロセスを強制します。
---

# Workflow Skill

開発タスクを体系的に管理し、品質の高い開発プロセスを支援するスキルです。

## 使用タイミング

以下のような場合にこのスキルを使用してください：

- 新機能の実装を開始するとき
- バグ修正を行うとき
- リファクタリングを計画するとき
- 複数フェーズにわたる開発タスクを管理したいとき

## コマンド

### タスク開始

```
/workflow start <タスク名>
```

### 次フェーズへ進む

```
/workflow next
```

### 状態確認

```
/workflow status
```

### 設計レビュー承認

```
/workflow approve design
```

### リセット

```
/workflow reset [理由]
```

### タスク一覧

```
/workflow list
```

### タスク切替

```
/workflow switch <task-id>
```

## フェーズ構成（18フェーズ）

全てのタスクは以下の18フェーズで実行されます。

```
research → requirements → parallel_analysis（threat_modeling + planning）
→ parallel_design（state_machine + flowchart + ui_design）
→ design_review【AIレビュー + ユーザー承認】
→ test_design → test_impl → implementation → refactoring
→ parallel_quality（build_check + code_review）→ testing
→ parallel_verification（manual_test + security_scan + performance_test + e2e_test）
→ docs_update → commit → push → ci_verification → deploy → completed
```

注: small/mediumサイズは廃止されました。品質管理の一貫性を保つため、全てのタスクで完全なワークフローを実行します。

## ワークフローの原則

### 1. フェーズスキップ禁止

各フェーズには明確な目的があり、スキップは禁止されています。

| フェーズ       | 目的                           |
| -------------- | ------------------------------ |
| research       | 既存コードの調査・理解         |
| requirements   | 要件の明確化・仕様書作成       |
| planning       | 実装計画・設計                 |
| design_review  | 設計の承認（ユーザー確認必須） |
| test_design    | テストケース設計               |
| test_impl      | テストコード作成（TDD Red）    |
| implementation | 実装（TDD Green）              |
| refactoring    | コード品質改善（TDD Refactor） |
| testing        | テスト実行・品質確認           |
| commit         | コミット作成                   |

### 2. TDD方式の強制

```
test_impl（Red）→ implementation（Green）→ refactoring（Refactor）
```

テストを先に書き、実装でテストを通し、リファクタリングで品質を改善します。

### 3. 設計レビュー承認

`design_review` フェーズでは、ユーザーの明示的な承認が必要です：

```
/workflow approve design
```

承認なしに次のフェーズへ進むことはできません。

### 4. 並列フェーズ

並列実行可能なフェーズがあります：

- `parallel_analysis`: threat_modeling + planning を同時実行
- `parallel_design`: state_machine + flowchart + ui_design を同時実行
- `parallel_quality`: build_check + code_review を同時実行
- `parallel_verification`: manual_test + security_scan + performance_test + e2e_test を同時実行

サブフェーズの完了：

```
/workflow complete-sub threat_modeling
/workflow complete-sub planning
```

## プロジェクト構造ガイダンス

詳細は **CLAUDE.md「推奨プロジェクト構造」** を参照。

### 概要

```
project/
├── src/
│   ├── frontend/      # フロントエンド（React/Next.js + Storybook）
│   │   ├── features/  # 機能モジュール（Feature-First）
│   │   └── components/# 共通UIコンポーネント（CDD対応）
│   │
│   └── backend/       # バックエンド（Python/FastAPI - Clean Architecture）
│       ├── domain/    # ドメイン層
│       ├── application/# アプリケーション層
│       ├── infrastructure/# インフラ層
│       └── presentation/# プレゼンテーション層
│
└── docs/              # ドキュメント
```

### CDD + TDD サイクル

```
ui_design(ストーリー定義) → test_impl(Red) → implementation(Green) → refactoring
```

- **ui_design**: コンポーネント仕様にStorybookストーリー定義を含める
- **test_impl**: ストーリー実装（.stories.tsx）+ テスト実装 = Red Phase
- **implementation**: コンポーネント実装してストーリー・テストを通す = Green Phase

### ドキュメントとソースコードの対応

| ドキュメント | フロントエンド | バックエンド |
|-------------|---------------|-------------|
| `docs/product/features/` | `src/frontend/features/` | `src/backend/application/use_cases/` |
| `docs/product/components/` | `src/frontend/components/ui/` | - |
| `docs/product/api/` | `src/frontend/features/{機能}/api/` | `src/backend/presentation/routers/` |

詳細な対応表は **CLAUDE.md** を参照。

## 成果物ルール

### 各フェーズで編集可能なファイル

| フェーズ       | 編集可能             | 禁止           |
| -------------- | -------------------- | -------------- |
| research       | なし（読み取りのみ） | 全てのファイル |
| requirements   | .md                  | コード         |
| planning       | .md                  | コード         |
| test_design    | .md, テストファイル  | ソースコード   |
| test_impl      | テストファイル       | ソースコード   |
| implementation | ソースコード         | テストファイル |
| refactoring    | コード全般           | -              |

### 必須成果物

| フェーズ        | 成果物               |
| --------------- | -------------------- |
| requirements    | requirements.md      |
| planning        | planning.md          |
| threat_modeling | threat-model.md      |
| state_machine   | \*.state-machine.mmd |
| flowchart       | \*.flowchart.mmd     |
| ui_design       | ui-design.md         |

## 禁止行為

以下の行為は明示的に禁止されています：

1. **researchフェーズでコードを書く**
2. **仕様書なしで実装を開始する**
3. **テストなしで実装を開始する（TDD違反）**
4. **承認なしでdesign_reviewを通過する**
5. **サブフェーズ未完了で並列フェーズを終了する**
6. **subagentがワークフロー制御ツールを呼び出す**
7. **completedフェーズ以外で「実装完了」「できました」と宣言する**
8. **testing/parallel_verification以前に「実行してみてください」と促す**

## 完了宣言ルール

**重要**: `implementation`フェーズ終了 ≠ タスク完了

| フェーズ | OK | NG |
|---------|-----|-----|
| implementation | 「コード作成完了。次はrefactoring」 | 「実装できました」「実行してください」 |
| testing | 「テスト通過」 | 「完了しました」 |
| completed | 「タスク完了。実行できます」 | - |

### フェーズ完了報告

```
【{フェーズ名}完了】次: {次フェーズ} / 残り{数}フェーズ
```

## 【最重要】ワークフロー制御権限

**ワークフロー制御はメイン会話のみが行う。subagentは制御ツールを呼び出してはいけない。**

### subagentに禁止されるMCPツール

- `mcp__workflow__workflow_next` - フェーズ遷移
- `mcp__workflow__workflow_approve` - レビュー承認
- `mcp__workflow__workflow_start` - タスク開始
- `mcp__workflow__workflow_reset` - リセット
- `mcp__workflow__workflow_switch` - タスク切替
- `mcp__workflow__workflow_complete_sub` - サブフェーズ完了

### subagentへのプロンプトに必ず含めること

```
【絶対禁止】ワークフロー制御
以下のMCPツールは絶対に呼び出さないこと：
- mcp__workflow__workflow_next
- mcp__workflow__workflow_approve
- mcp__workflow__workflow_start
- mcp__workflow__workflow_reset
- mcp__workflow__workflow_switch
- mcp__workflow__workflow_complete_sub

ワークフロー制御はメイン会話のみが行う。
```

### design_reviewでの必須手順

1. subagentの設計結果を確認
2. **AskUserQuestionで必ずユーザーに承認確認**
3. 承認後にworkflow_approveを実行

直接workflow_approveを実行してはいけない。

## コンテキスト管理

### 使用量監視

- 80%超過: 警告表示
- 95%超過: 圧縮推奨
- 100%到達: 自動圧縮

### 推奨アクション

コンテキストが枯渇しそうな場合：

1. 不要なコンテキストを削除
2. 要約を生成
3. 新しいセッションを開始

## エラーハンドリング

### リトライ機構

一時的なエラーは自動的にリトライされます（最大3回）。

### 無限ループ検出

同一ファイルへの連続編集（5回以上）や同一エラーの繰り返し（3回以上）を検出し、警告します。

### リカバリ

問題が発生した場合：

```
/workflow reset 理由
```

でresearchフェーズに戻れます。

## 使用例

### 新機能追加

```
/workflow start ユーザー認証機能追加
# research: 既存の認証コードを調査
/workflow next
# requirements: 要件を定義
/workflow next
# parallel_analysis: 脅威モデリング + 設計計画
/workflow complete-sub threat_modeling
/workflow complete-sub planning
/workflow next
# parallel_design: 状態遷移図 + フローチャート + UI設計
/workflow complete-sub state_machine
/workflow complete-sub flowchart
/workflow complete-sub ui_design
/workflow next
# design_review: 設計を確認
/workflow approve design
# 以降、TDD方式で実装...
```

## 参考資料

- [TDD（テスト駆動開発）](https://ja.wikipedia.org/wiki/%E3%83%86%E3%82%B9%E3%83%88%E9%A7%86%E5%8B%95%E9%96%8B%E7%99%BA)
- [STRIDE脅威モデリング](https://docs.microsoft.com/ja-jp/azure/security/develop/threat-modeling-tool-threats)
- [Mermaid記法](https://mermaid.js.org/)
