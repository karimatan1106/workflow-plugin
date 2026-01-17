# State Machine フェーズ

## subagent実行

このフェーズは**subagentとして実行**される。
**並列フェーズ (parallel_design)** の一部として実行される。

---

## 目的

機能の状態遷移を Mermaid ステートマシン図で可視化する。

## 入力

- タスクディレクトリ: `{workflowDir}`
- 要件: `requirements.md`
- 調査結果: `research.md`

## 実行手順

1. **状態の特定**
   - 初期状態
   - 中間状態
   - 終了状態
   - エラー状態

2. **イベント/トリガーの特定**
   - 状態を変化させるアクション
   - 条件分岐

3. **状態遷移の記述**
   - 各状態間の遷移を定義
   - ガード条件を記述

4. **Mermaid図の作成**
   - `stateDiagram-v2` 記法で記述
   - `docs/specs/domains/{domain}/` に保存

## 出力ファイル

### `docs/specs/domains/{domain}/{name}.state-machine.mmd`

```mermaid
stateDiagram-v2
    [*] --> Idle

    state Idle {
        [*] --> Waiting
        Waiting --> Waiting: 無効な入力
    }

    Idle --> Loading: 開始ボタン押下
    Loading --> Success: データ取得成功
    Loading --> Error: データ取得失敗

    state Error {
        [*] --> ShowError
        ShowError --> [*]: リトライ or 閉じる
    }

    Error --> Loading: リトライ
    Error --> Idle: 閉じる
    Success --> [*]

    note right of Loading
        ローディング中は
        ユーザー操作を無効化
    end note
```

## 記法ガイド

### 基本構文

```mermaid
stateDiagram-v2
    [*] --> State1          %% 初期状態
    State1 --> State2: event %% イベントによる遷移
    State2 --> [*]          %% 終了状態
```

### 複合状態

```mermaid
stateDiagram-v2
    state ParentState {
        [*] --> ChildState1
        ChildState1 --> ChildState2
        ChildState2 --> [*]
    }
```

### 並行状態

```mermaid
stateDiagram-v2
    state ParallelState {
        [*] --> State1
        --
        [*] --> State2
    }
```

### ノート

```mermaid
stateDiagram-v2
    State1 --> State2
    note right of State1: 説明文
```

## 禁止事項

- コードの編集
- 実装の開始
- ASCII図での作成（Mermaid必須）

## 完了条件

- [ ] 全ての状態を特定した
- [ ] 全てのイベント/トリガーを定義した
- [ ] エラー状態を網羅した
- [ ] Mermaid図を docs/specs/ に作成した
