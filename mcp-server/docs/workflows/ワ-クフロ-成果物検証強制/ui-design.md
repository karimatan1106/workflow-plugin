# UI設計: ワークフロー成果物検証強制

## 該当なし

本タスクはバックエンドのMCPサーバーツール（`workflow_next`, `workflow_complete_sub`）および
設計検証ロジック（`design-validator.ts`）、フック（`phase-edit-guard.js`）の修正であり、
UIコンポーネントの変更は含まれません。

## 影響するCLIメッセージ

以下のエラーメッセージが新規追加または改善されます:

### 1. フェーズ遷移時の成果物欠落エラー

**形式:**
```
{phase}フェーズの必須成果物が未作成です: {files}
出力先: {docsDir}/
```

**例:**
```
researchフェーズの必須成果物が未作成です: research.md
出力先: docs/workflows/タスク名/
```

このメッセージは `/workflow next` コマンド実行時に、現在のフェーズの必須成果物（`.md`ファイル）が見つからない場合に表示されます。

### 2. サブフェーズ完了時の成果物欠落エラー

**形式:**
```
{subPhase}の必須成果物が未作成です: {files}
出力先: {docsDir}/
```

**例:**
```
threat_modelingの必須成果物が未作成です: threat-model.md
出力先: docs/workflows/タスク名/
```

このメッセージは `/workflow complete-sub` コマンド実行時に、サブフェーズの必須成果物（`.md`ファイル）が見つからない場合に表示されます。

### 3. 設計検証ブロックエラー（`design-validator.ts`改修）

**workflowDir不存在時:**
```
エラー: ワークフロー状態ディレクトリが見つかりません
パス: {workflowDirPath}
```

**設計書全欠落時:**
```
エラー: 設計フェーズの必須成果物が見つかりません
以下のファイルが必要です:
  - spec.md
  - state-machine.mmd
  - flowchart.mmd
  - ui-design.md
  - test-design.md
出力先: {docsDir}/
```

## 技術的影響

### CLI層（ユーザー対面）
- **workflow_next, workflow_complete_sub**: フェーズ遷移前に成果物を検証し、不足時は明確なエラーメッセージを表示
- 出力先パスを含めることで、ユーザーは即座に必要なドキュメント作成場所を特定可能

### バックエンド層（内部処理）
- **design-validator.ts**: MCPリクエスト時に設計書の存在と整合性を再確認
- **phase-edit-guard.js**: フェーズごとの編集可能ファイルルールを強制

### ユーザー体験
1. `research` フェーズ完了 → `research.md` がないと `/workflow next` でブロック
2. `parallel_design` の `threat_modeling` 完了 → `threat-model.md` がないと `/workflow complete-sub threat_modeling` でブロック
3. `implementation` フェーズ開始時 → 設計書（spec.md等）の整合性を検証、問題あれば明示

## 成果物チェックリスト

このタスクにおけるUI設計の納品物:

- [x] 本ファイル（ui-design.md）: 成果物なしを明記
- [x] CLIメッセージ仕様の定義
- [x] 技術的影響の文書化
