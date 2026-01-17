# MCP Server 仕様書

## 概要

ワークフロープラグインのMCPサーバー仕様。

## タスクサイズ

- **large**: 18フェーズ（全ワークフロー）

注: small/mediumは廃止されました。

## フェーズ構成（Large）

```
research → requirements → parallel_analysis → parallel_design
→ design_review → test_design → test_impl → implementation
→ refactoring → parallel_quality → testing → parallel_verification
→ docs_update → commit → push → ci_verification → deploy → completed
```

## ディレクトリ構造

### ワークフロー状態（内部用）

```
.claude/state/workflows/{taskId}_{taskName}/
├── workflow-state.json   # タスク状態
└── log.md                # 作業ログ
```

### ドキュメント配置（成果物用）

```
docs/specs/domains/{taskName}/
├── spec.md               # 仕様書（要件・計画・脅威モデル統合）
├── test-design.md        # テスト設計
├── state-machine.mmd     # ステートマシン図
├── flowchart.mmd         # フローチャート
└── ui-design.md          # UI設計
```

環境変数 `DOCS_DIR` でオーバーライド可能。
デフォルト: `docs/specs/domains`

## TaskState

| プロパティ | 型 | 説明 |
|-----------|-----|------|
| phase | PhaseName | 現在のフェーズ |
| taskId | string | タスクID |
| taskName | string | タスク名 |
| workflowDir | string | ワークフロー状態ディレクトリ（内部用） |
| docsDir | string? | ドキュメントディレクトリ（成果物配置用） |
| startedAt | string | 開始日時 |
| taskSize | TaskSize? | タスクサイズ |

## 関連ファイル

<!-- @related-files -->
- `src/state/types.ts`
- `src/state/manager.ts`
- `src/phases/definitions.ts`
- `src/tools/start.ts`
- `src/tools/status.ts`
<!-- @end-related-files -->
