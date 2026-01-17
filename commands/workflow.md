# ワークフロー制御コマンド

このコマンドは**MCP Server**とsubagentでワークフローを管理します。

## MCP ツール一覧

| ツール名                               | 説明             | 引数               |
| -------------------------------------- | ---------------- | ------------------ |
| `mcp__workflow__workflow_status`       | 状態確認         | なし               |
| `mcp__workflow__workflow_start`        | タスク開始       | `taskName: string` |
| `mcp__workflow__workflow_next`         | 次フェーズへ     | なし               |
| `mcp__workflow__workflow_approve`      | レビュー承認     | `type: string`     |
| `mcp__workflow__workflow_reset`        | リセット         | `reason?: string`  |
| `mcp__workflow__workflow_list`         | タスク一覧       | なし               |
| `mcp__workflow__workflow_switch`       | タスク切替       | `taskId: string`   |
| `mcp__workflow__workflow_complete_sub` | サブフェーズ完了 | `subPhase: string` |

## 実行手順

**このスキルが呼び出されたら、以下の手順で実行する。**

### 1. 現在の状態を確認

MCPツール `mcp__workflow__workflow_status` を呼び出す。

### 2. 状態に応じてAskUserQuestionで選択肢を提示

**重要: ユーザーへの質問は必ずAskUserQuestionツールを使用する（テキスト入力させない）**

#### タスクなし（status: "idle"）の場合

```
AskUserQuestion:
  question: "新しいタスクを開始しますか？"
  options:
    - label: "新規タスク開始"
      description: "タスク名を入力して開始"
    - label: "何もしない"
      description: "ワークフローを終了"
```

#### アクティブタスクがある場合

```
AskUserQuestion:
  question: "{taskName}（{phase}フェーズ）をどうしますか？"
  options:
    - label: "続行する"
      description: "現在のフェーズの作業を進める"
    - label: "リセットする"
      description: "researchフェーズからやり直す"
    - label: "新規タスク開始"
      description: "別のタスクを開始する"
    - label: "キャンセル"
      description: "このタスクを破棄する"
```

### 3. 「続行する」が選択された場合

**subagentを起動してフェーズ作業を委譲する。**

```
Task tool を使用:
- subagent_type: "general-purpose"
- prompt: |
    ## タスク
    workflow-phases/{phase}.md を読んで実行してください。
    タスクディレクトリ: {workflowDir}

    ## 【絶対禁止】ワークフロー制御
    以下のMCPツールは絶対に呼び出さないこと：
    - mcp__workflow__workflow_next
    - mcp__workflow__workflow_approve
    - mcp__workflow__workflow_start
    - mcp__workflow__workflow_reset
    - mcp__workflow__workflow_switch
    - mcp__workflow__workflow_complete_sub

    ワークフロー制御はメイン会話のみが行う。
    あなたの役割は指定されたフェーズの作業を実行し、結果を報告することのみ。

    ## 完了条件
    作業が完了したら結果を報告してください。
    フェーズ遷移は行わないこと。
```

### 4. subagentの結果を受けて判断

```
AskUserQuestion:
  question: "subagentの作業結果を確認しました。次のアクションは？"
  options:
    - label: "次フェーズへ進む"
      description: "問題なし、次のフェーズに進む"
    - label: "やり直す"
      description: "問題あり、再度subagentを起動"
    - label: "リセット"
      description: "researchフェーズからやり直す"
```

### 5. レビュー承認フェーズの場合

```
AskUserQuestion:
  question: "レビュー結果を承認しますか？"
  options:
    - label: "承認する"
      description: "次のフェーズに進む"
    - label: "修正が必要"
      description: "指摘事項を修正する"
```

承認された場合:

MCPツール `mcp__workflow__workflow_approve` を `type: "design"` で呼び出す。

---

## フェーズ一覧（TDD強化方式 21フェーズ + completed）

| #   | フェーズ            | 説明                                 | 指示ファイル                           |
| --- | ------------------- | ------------------------------------ | -------------------------------------- |
| 1   | research            | 調査・既存コード分析                 | workflow-phases/research.md            |
| 2   | requirements        | 要件定義・受け入れ基準               | workflow-phases/requirements.md        |
| 3   | threat_modeling     | セキュリティ脅威分析                 | workflow-phases/threat_modeling.md     |
| 4   | planning            | 仕様書作成                           | workflow-phases/planning.md            |
| 5   | architecture_review | AIアーキテクチャレビュー             | workflow-phases/architecture_review.md |
| 6   | state_machine       | ステートマシン図作成                 | workflow-phases/state_machine.md       |
| 7   | flowchart           | フローチャート作成                   | workflow-phases/flowchart.md           |
| 8   | ui_design           | UI設計（レイアウト・状態遷移）       | workflow-phases/ui_design.md           |
| 9   | design_review       | 設計レビュー【要承認】               | workflow-phases/design_review.md       |
| 10  | test_design         | テスト設計                           | workflow-phases/test_design.md         |
| 11  | test_impl           | テスト実装（TDD Red）                | workflow-phases/test_impl.md           |
| 12  | implementation      | 実装（TDD Green）                    | workflow-phases/implementation.md      |
| 13  | refactoring         | リファクタリング（TDD Refactor）     | workflow-phases/refactoring.md         |
| 14  | build_check         | ビルド確認                           | workflow-phases/build_check.md         |
| 15  | code_review         | AIコードレビュー                     | workflow-phases/code_review.md         |
| 16  | testing             | テスト実行                           | workflow-phases/testing.md             |
| 17  | manual_test         | 手動確認                             | workflow-phases/manual_test.md         |
| 18  | security_scan       | セキュリティスキャン（自動）         | workflow-phases/security_scan.md       |
| 19  | commit              | コミット（README/CHANGELOG更新含む） | workflow-phases/commit.md              |
| 20  | push                | リモートへのプッシュ                 | workflow-phases/push.md                |
| 21  | deploy              | デプロイ                             | workflow-phases/deploy.md              |
| -   | completed           | 完了                                 | （指示なし）                           |

### TDD サイクル

```
test_impl（Red）→ implementation（Green）→ refactoring（Refactor）
     ↓                    ↓                         ↓
 テスト作成          テストを通す実装          コード品質改善
   （失敗）              （成功）             （テスト維持）
```

---

## MCPツール詳細

| MCPツール               | 説明                       | 引数               |
| ----------------------- | -------------------------- | ------------------ |
| `workflow_status`       | 現在の状態をJSON出力       | なし               |
| `workflow_start`        | 新規タスク開始             | `taskName: string` |
| `workflow_next`         | 次フェーズへ遷移           | なし               |
| `workflow_approve`      | レビュー承認               | `type: "design"`   |
| `workflow_list`         | アクティブタスク一覧       | なし               |
| `workflow_switch`       | タスク切り替え             | `taskId: string`   |
| `workflow_complete_sub` | サブフェーズ完了           | `subPhase: string` |
| `workflow_reset`        | researchフェーズにリセット | `reason?: string`  |

### 承認が必要なフェーズ

| フェーズ      | MCPツール呼び出し                        |
| ------------- | ---------------------------------------- |
| design_review | `workflow_approve` with `type: "design"` |

---

## 重要なルール

1. **フェーズをスキップしない** - 必ず順番通りに進める
2. **各フェーズの作業は100% subagentに委譲** - コンテキスト節約のため
3. **レビューフェーズではユーザー承認を待つ** - AskUserQuestionで必ず確認
4. **subagentの結果を確認してから次へ進む**
5. **問題発生時は最初からやり直す**
6. **ワークフロー制御はメイン会話のみ** - subagentは制御ツールを呼び出さない

---

## 【最重要】subagentへの禁止事項

**subagentにワークフロー制御を許可してはいけない。**

### subagentが絶対に呼び出してはいけないツール

| ツール                                 | 理由                                   |
| -------------------------------------- | -------------------------------------- |
| `mcp__workflow__workflow_next`         | フェーズ遷移はメイン会話のみ           |
| `mcp__workflow__workflow_approve`      | 承認はユーザー確認後にメイン会話が実行 |
| `mcp__workflow__workflow_start`        | 新規タスク開始はメイン会話のみ         |
| `mcp__workflow__workflow_reset`        | リセットはメイン会話のみ               |
| `mcp__workflow__workflow_switch`       | タスク切替はメイン会話のみ             |
| `mcp__workflow__workflow_complete_sub` | サブフェーズ完了はメイン会話のみ       |

### なぜ禁止するのか

1. **プロセス制御の一元化** - 制御が分散すると予期しないフェーズ遷移が発生
2. **ユーザー確認の保証** - design_reviewでの承認をスキップされる恐れ
3. **状態の整合性** - 複数箇所から状態変更されると不整合が発生

### subagentに許可される操作

- ファイルの読み取り（Read, Grep, Glob）
- ファイルの作成・編集（Write, Edit）
- コマンド実行（Bash）
- 結果の報告（テキスト出力）

### 違反時の対処

subagentがワークフロー制御ツールを呼び出した場合：

1. そのsubagentの結果は無効とする
2. workflow_resetでresearchフェーズに戻る
3. 正しいプロンプトで再度subagentを起動する

---

## 絶対厳守: subagent委譲ルール

**メイン会話でフェーズ作業を直接実行することは禁止。全ての作業はsubagentに委譲すること。**

### メイン会話で許可される操作（これ以外は全て禁止）

| 操作                                    | 用途                   |
| --------------------------------------- | ---------------------- |
| MCPツール `workflow_status`             | 状態確認               |
| MCPツール `workflow_next/approve/reset` | フェーズ遷移           |
| `AskUserQuestion`                       | ユーザーに選択肢提示   |
| `Task` (subagent起動)                   | 作業の委譲             |
| テキスト出力                            | subagent結果の要約報告 |

### メイン会話で禁止される操作（違反するとCompacting発生）

| #   | 操作               | 理由                 |
| --- | ------------------ | -------------------- |
| 1   | Read               | コンテキスト消費     |
| 2   | Edit               | コンテキスト消費     |
| 3   | Write              | コンテキスト消費     |
| 4   | Grep               | コンテキスト消費     |
| 5   | Glob               | コンテキスト消費     |
| 6   | コードの調査・分析 | subagentに委譲すべき |
| 7   | 図の作成・編集     | subagentに委譲すべき |
| 8   | 仕様書の作成・編集 | subagentに委譲すべき |
| 9   | レビューの実施     | subagentに委譲すべき |

---

## 並列フェーズの実行方法【重要】

ワークフローには4つの並列フェーズがあり、**複数のsubagentを同時に起動**して効率化する。

### 並列フェーズ一覧

| フェーズ              | サブフェーズ                        | 説明                 |
| --------------------- | ----------------------------------- | -------------------- |
| parallel_analysis     | threat_modeling, planning           | 脅威分析と設計を並行 |
| parallel_design       | state_machine, flowchart, ui_design | 図式設計を並行       |
| parallel_quality      | build_check, code_review            | 品質チェックを並行   |
| parallel_verification | manual_test, security_scan          | 検証を並行           |

### 並列実行のルール【必須】

1. **複数のTask toolを1つのメッセージで同時に起動すること**

並列フェーズでは、サブフェーズごとに別々のsubagentを起動し、1つのメッセージ内で全て呼び出す：

例: parallel_design フェーズの場合

- Task tool #1: state_machine作成
- Task tool #2: flowchart作成
- Task tool #3: ui_design作成

これらを**1つのメッセージ内で同時に呼び出す**こと。順番に呼び出してはいけない。

2. **各subagentは独立して作業する**
   - 各subagentは該当フェーズの.mdファイルを読み取る
   - 出力は各フェーズのワークフローディレクトリに保存
   - 他のsubagentの結果に依存しない

3. **全subagent完了後にworkflow_complete_subを実行**
   - 各subagentの完了報告を受けたら、対応するworkflow_complete_subを実行
   - 全サブフェーズが完了したらworkflow_nextで次へ

### 禁止事項

- 並列フェーズで1つずつsubagentを起動する（順次実行）
- 1つのsubagentで複数のサブフェーズを処理する
- subagentの完了を待たずにcomplete-subを実行する

---

## 問題発生時のリセット

以下の場合は**researchフェーズに戻って最初からやり直す**：

- 仕様に間違いがあることに気付いた
- 実装にミスがあった
- 設計の根本的な問題が見つかった
- テストで重大なバグが発覚した

MCPツール `mcp__workflow__workflow_reset` を `reason: "理由を記載"` で呼び出す。

**リセット後は調査からやり直し、正しい仕様・設計で再実装する。**
