# Workflow Plugin for Claude Code

Claude Code 用のワークフロー管理プラグイン。TDD（テスト駆動開発）強化方式の19フェーズワークフローを提供し、仕様駆動開発（SDD）をサポートします。

## 概要

このプラグインは、開発タスクを体系的に管理し、品質の高い開発プロセスを強制します。

### 主な特徴

1. **フェーズ管理**: research から completed まで最大19フェーズの開発フローを強制
2. **TDDサイクル強制**: test_impl（Red）→ implementation（Green）→ refactoring（Refactor）
3. **仕様ファースト**: コード編集前に仕様書更新を強制
4. **成果物チェック**: ステートマシン図・フローチャートの反映確認
5. **無限ループ検出**: 同一ファイルの繰り返し編集を検出・警告
6. **タスクサイズ対応**: Small/Medium/Large の3段階でフェーズ数を調整

## 動作要件

- **Node.js**: 18.0.0 以上
- **パッケージマネージャー**: npm または pnpm
- **Claude Code**: MCP サポートが有効

## インストール

### 方法1: 自動インストール（推奨）

```bash
# 1. プラグインをプロジェクトにコピー/クローン
git clone https://github.com/yourname/workflow-plugin.git
# または
cp -r workflow-plugin /path/to/your/project/

# 2. インストールスクリプトを実行
node workflow-plugin/install.js
```

インストールスクリプトが自動的に以下を実行します：

- `.claude/commands/workflow.md` へのリンク作成
- `.claude/workflow-phases/` へのリンク作成
- `.claude/settings.json` へのフックマージ
- `.mcp.json` へのMCPサーバー設定追加
- MCPサーバーのビルド（必要な場合）

### 方法2: 手動インストール

#### 2-1. プラグインをプロジェクトにコピー

```bash
cp -r workflow-plugin /path/to/your/project/
```

#### 2-2. Claude Code 設定をマージ

`workflow-plugin/settings.json` の内容を `.claude/settings.json` にマージします。

#### 2-3. MCP サーバーをビルド

```bash
cd workflow-plugin/mcp-server
npm install  # または pnpm install
npm run build
```

#### 2-4. MCP サーバーを設定

`.mcp.json` に以下を追加：

```json
{
  "mcpServers": {
    "workflow": {
      "command": "node",
      "args": ["workflow-plugin/mcp-server/dist/index.js"],
      "cwd": "workflow-plugin/mcp-server"
    }
  }
}
```

#### 2-5. コマンドをリンク

```bash
# Unix/macOS
ln -s ../workflow-plugin/commands/workflow.md .claude/commands/workflow.md
ln -s ../workflow-plugin/workflow-phases .claude/workflow-phases

# Windows (管理者権限またはジャンクション)
mklink /H .claude\commands\workflow.md workflow-plugin\commands\workflow.md
mklink /J .claude\workflow-phases workflow-plugin\workflow-phases
```

## アップデート

プラグインを更新後、再度インストールスクリプトを実行：

```bash
node workflow-plugin/install.js
```

## 使い方

### 基本コマンド

| コマンド | 説明 |
|---------|------|
| `/workflow start <タスク名> [-s small\|medium\|large]` | タスクを開始 |
| `/workflow next` | 次のフェーズへ進む |
| `/workflow status` | 現在の状態を確認 |
| `/workflow approve design` | 設計レビューを承認 |
| `/workflow reset [理由]` | research フェーズにリセット |
| `/workflow list` | アクティブなタスク一覧 |
| `/workflow switch <task-id>` | 別のタスクに切り替え |
| `/workflow complete-sub <サブフェーズ>` | 並列フェーズのサブフェーズを完了 |

### 使用例

#### 新機能追加（Medium サイズ）

```
/workflow start ユーザー認証機能追加 -s medium
# research: 既存の認証コードを調査
/workflow next
# requirements: 要件を定義
/workflow next
# planning: 実装計画を作成
/workflow next
# design_review: 設計を確認（承認必要）
/workflow approve design
# 以降、TDD方式で実装...
```

#### バグ修正（Small サイズ）

```
/workflow start ログインバグ修正 -s small
/workflow next  # research → requirements
/workflow next  # requirements → implementation
/workflow next  # implementation → testing
/workflow next  # testing → commit
```

## タスクサイズ別フェーズ構成

### Small（5フェーズ）- 単純なバグ修正・小さな変更

```
research → requirements → implementation → testing → commit
```

### Medium（13フェーズ）- 機能追加・中規模変更

```
research → requirements → parallel_design → design_review【要承認】
→ test_design → test_impl → implementation → refactoring
→ parallel_quality → testing → docs_update → commit → completed
```

### Large（18フェーズ）- アーキテクチャ変更・大規模機能

```
research → requirements → parallel_analysis（threat_modeling + planning）
→ parallel_design（state_machine + flowchart + ui_design）
→ design_review【AIレビュー + ユーザー承認】
→ test_design → test_impl → implementation → refactoring
→ parallel_quality（build_check + code_review）→ testing
→ parallel_verification（manual_test + security_scan + performance_test + e2e_test）
→ docs_update → commit → push → ci_verification → deploy → completed
```

## フック一覧

### PreToolUse フック

| フック | 対象ツール | 説明 |
|--------|-----------|------|
| `enforce-workflow.js` | Edit, Write, NotebookEdit | タスク未開始時のファイル編集をブロック |
| `phase-edit-guard.js` | Edit, Write, NotebookEdit | フェーズに応じたファイルタイプの編集制限 |
| `spec-first-guard.js` | Edit, Write, NotebookEdit | 仕様書更新前のコード編集をブロック |
| `loop-detector.js` | Edit, Write, NotebookEdit | 同一ファイルの繰り返し編集を検出 |
| `check-spec.js` | Write | 新規ファイル作成時の仕様書存在チェック |
| `check-test-first.js` | Write | TDD フェーズでのテストファースト強制 |

### PostToolUse フック

| フック | 対象ツール | 説明 |
|--------|-----------|------|
| `check-workflow-artifact.js` | workflow_next | フェーズ遷移時の成果物反映チェック |
| `spec-guard-reset.js` | Bash | 仕様ガード状態のリセット |
| `check-spec-sync.js` | Write, Edit | コードと仕様書の同期チェック |

## フェーズ別編集ルール

| フェーズ | 編集可能 | 禁止 |
|---------|---------|------|
| research | なし（読み取りのみ） | 全てのファイル |
| requirements | .md | コード |
| parallel_analysis | .md | コード |
| parallel_design | .md, .mmd | コード |
| design_review | .md | コード |
| test_design | .md, テストファイル | ソースコード |
| test_impl | テストファイル | ソースコード |
| implementation | ソースコード | テストファイル |
| refactoring | コード全般 | - |
| parallel_quality | コード全般 | - |
| testing | なし（読み取りのみ） | 全て |
| parallel_verification | .md | コード |
| docs_update | .md, .mdx | コード |
| commit | なし | 全て |
| push | なし | 全て |
| ci_verification | .md | コード |
| deploy | .md | コード |

### サブフェーズの編集可能ファイル

| サブフェーズ | 編集可能 |
|-------------|---------|
| threat_modeling | .md |
| planning | .md |
| state_machine | .md, .mmd |
| flowchart | .md, .mmd |
| ui_design | .md, .mmd |
| build_check | 全て（ビルド修正用） |
| code_review | .md |
| manual_test | .md |
| security_scan | .md |
| performance_test | .md |
| e2e_test | .md, テストファイル |

## 環境変数

| 変数名 | デフォルト値 | 説明 |
|--------|-------------|------|
| `WORKFLOW_STATE_FILE` | `.claude-workflow-state.json` | グローバル状態ファイルのパス |
| `WORKFLOW_DIR` | `docs/workflows` | ワークフローディレクトリ |
| `SPEC_DIR` | `docs/specs` | 仕様書ディレクトリ |
| `CODE_DIRS` | `src` | コードディレクトリ（カンマ区切り） |
| `SKIP_PHASE_GUARD` | - | `true` でフェーズ編集制限を無効化 |
| `SKIP_SPEC_GUARD` | - | `true` で仕様ファーストチェックを無効化 |
| `SKIP_LOOP_DETECTION` | - | `true` で無限ループ検出を無効化 |
| `SKIP_ARTIFACT_CHECK` | - | `true` で成果物反映チェックを無効化 |
| `DEBUG_PHASE_GUARD` | - | `true` でデバッグログを出力 |

## ディレクトリ構造

```
workflow-plugin/
├── hooks/                          # フックスクリプト
│   ├── enforce-workflow.js         # ワークフロー強制
│   ├── phase-edit-guard.js         # フェーズ別編集制限
│   ├── spec-first-guard.js         # 仕様ファースト強制
│   ├── spec-guard-reset.js         # 仕様ガードリセット
│   ├── loop-detector.js            # 無限ループ検出
│   ├── check-spec.js               # 仕様書存在チェック
│   ├── check-spec-sync.js          # コード・仕様書同期チェック
│   ├── check-test-first.js         # テストファーストチェック
│   └── check-workflow-artifact.js  # 成果物反映チェック
├── mcp-server/                     # MCP サーバー
│   ├── src/
│   │   ├── index.ts                # エントリポイント
│   │   ├── server.ts               # サーバー実装
│   │   ├── tools/                  # ツール実装
│   │   │   ├── start.ts            # タスク開始
│   │   │   ├── next.ts             # 次フェーズ遷移
│   │   │   ├── status.ts           # 状態取得
│   │   │   ├── approve.ts          # 承認
│   │   │   ├── reset.ts            # リセット
│   │   │   ├── list.ts             # タスク一覧
│   │   │   ├── switch.ts           # タスク切替
│   │   │   └── complete-sub.ts     # サブフェーズ完了
│   │   ├── phases/
│   │   │   └── definitions.ts      # フェーズ定義
│   │   ├── state/
│   │   │   ├── types.ts            # 型定義
│   │   │   └── manager.ts          # 状態管理
│   │   └── utils/
│   │       ├── errors.ts           # エラー処理
│   │       └── retry.ts            # リトライ機構
│   ├── package.json
│   └── tsconfig.json
├── skills/                         # スキル定義
│   └── workflow/
│       └── SKILL.md                # ワークフロースキル
├── workflow-phases/                # フェーズ別プロンプト
│   ├── README.md                   # フェーズ一覧
│   ├── research.md
│   ├── requirements.md
│   ├── threat_modeling.md
│   ├── planning.md
│   ├── state_machine.md
│   ├── flowchart.md
│   ├── ui_design.md
│   ├── design_review.md
│   ├── test_design.md
│   ├── test_impl.md
│   ├── implementation.md
│   ├── refactoring.md
│   ├── build_check.md
│   ├── code_review.md
│   ├── testing.md
│   ├── manual_test.md
│   ├── security_scan.md
│   ├── performance_test.md
│   ├── e2e_test.md
│   ├── docs_update.md
│   ├── commit.md
│   ├── push.md
│   ├── ci_verification.md
│   └── deploy.md
├── commands/                       # コマンド定義
│   └── workflow.md
├── .claude-plugin/
│   └── manifest.json               # プラグインマニフェスト
├── settings.json                   # フック設定（マージ用）
└── README.md                       # このファイル
```

## 成果物の配置先

| フェーズ | 成果物 | 配置先 |
|---------|--------|--------|
| research | 調査結果 | `{workflowDir}/research.md` |
| requirements | 要件定義 | `{workflowDir}/requirements.md` |
| planning | 実装計画・仕様書 | `docs/specs/domains/{domain}/{name}.md` |
| threat_modeling | 脅威モデル | `{workflowDir}/threat-model.md` |
| state_machine | ステートマシン図 | `docs/specs/{domain}/{name}.state-machine.mmd` |
| flowchart | フローチャート | `docs/specs/{domain}/{name}.flowchart.mmd` |
| ui_design | UI設計 | `{workflowDir}/ui-design.md` |
| test_design | テストケース | `{workflowDir}/test-cases.md` |
| code_review | レビュー結果 | `{workflowDir}/code-review.md` |
| performance_test | パフォーマンステスト結果 | `{workflowDir}/performance-test.md` |
| e2e_test | E2Eテスト結果 | `{workflowDir}/e2e-test.md` |
| docs_update | ドキュメント更新 | `docs/specs/`, `README.md` |
| ci_verification | CI結果記録 | `{workflowDir}/ci-result.md` |

## TDDサイクル

```
┌─────────────────────────────────────────────────────────────┐
│                      TDD サイクル                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   test_impl (Red)  →  implementation (Green)  →  refactoring│
│        ↓                      ↓                      ↓      │
│   テスト作成            テストを通す実装       コード品質改善 │
│    （失敗）                 （成功）           （テスト維持） │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 並列フェーズ

Large タスクでは、並列実行可能なフェーズがあります。

| グループ | サブフェーズ |
|---------|-------------|
| `parallel_analysis` | threat_modeling, planning |
| `parallel_design` | state_machine, flowchart, ui_design |
| `parallel_quality` | build_check, code_review |
| `parallel_verification` | manual_test, security_scan, performance_test, e2e_test |

サブフェーズの完了:

```
/workflow complete-sub threat_modeling
/workflow complete-sub planning
```

全サブフェーズ完了後に `/workflow next` で次フェーズへ進めます。

## 禁止行為

以下の行為はフックによって自動的にブロックされます：

| 行為 | 強制手段 |
|------|---------|
| タスク開始前のコード編集 | `enforce-workflow.js` |
| research フェーズでのファイル編集 | `phase-edit-guard.js` |
| 仕様書更新前のコード編集 | `spec-first-guard.js` |
| テスト作成前の実装コード編集（TDD違反） | `check-test-first.js` |
| 承認なしでの design_review 通過 | MCP サーバー |
| 成果物未反映でのコミット | `check-workflow-artifact.js` |
| 同一ファイルの繰り返し編集（5回以上/5分） | `loop-detector.js` |

## 新規フェーズ説明

### docs_update（ドキュメント更新フェーズ）

実装・テスト完了後にドキュメントを更新するフェーズ。

**目的:**
- 仕様書への実装内容の反映
- README・変更履歴の更新
- API ドキュメントの更新

**成果物:**
- 更新された仕様書（`docs/specs/`）
- 更新されたREADME（必要に応じて）
- 変更履歴（CHANGELOG.md など）

**編集可能ファイル:** `.md`, `.mdx`

### ci_verification（CI検証フェーズ）

push後にCI/CDパイプラインの成功を確認するフェーズ。

**目的:**
- CI/CDパイプラインの実行結果を確認
- ビルド・テスト・lint等の自動チェック結果を確認
- 失敗時は原因を特定し修正

**確認項目:**
- [ ] ビルドが成功しているか
- [ ] テストが全てパスしているか
- [ ] lint/静的解析が通っているか
- [ ] セキュリティスキャンに問題がないか

**編集可能ファイル:** `.md`（CI結果の記録のみ）

### performance_test（パフォーマンステスト）

parallel_verification のサブフェーズ。パフォーマンス要件の検証を行う。

**目的:**
- レスポンス時間の計測
- メモリ使用量の確認
- 負荷テストの実施（必要に応じて）

**成果物:**
- パフォーマンステスト結果（`{workflowDir}/performance-test.md`）

**編集可能ファイル:** `.md`

### e2e_test（E2Eテスト）

parallel_verification のサブフェーズ。エンドツーエンドテストを実行する。

**目的:**
- ユーザーシナリオの検証
- フロントエンド・バックエンド統合の確認
- クロスブラウザテスト（該当する場合）

**成果物:**
- E2Eテスト結果（`{workflowDir}/e2e-test.md`）

**編集可能ファイル:** `.md`, テストファイル（`.test.ts`, `.spec.ts` 等）

## トラブルシューティング

### フェーズ遷移ができない

1. 現在のフェーズの成果物が作成されているか確認
2. `/workflow status` で状態を確認
3. 設計レビューフェーズでは `/workflow approve design` が必要

### 無限ループ検出が発動した

1. 一度立ち止まり、エラーの根本原因を分析
2. テストと実装の同期を確認
3. 仕様書と実装の乖離を確認
4. 必要に応じて `SKIP_LOOP_DETECTION=true` でスキップ（非推奨）

### 仕様ファースト違反が発生した

1. まず `docs/specs/` 内の該当仕様書を更新
2. その後コードを編集
3. 緊急時は `SKIP_SPEC_GUARD=true` でスキップ

## ライセンス

MIT

## 参考資料

- [TDD（テスト駆動開発）](https://ja.wikipedia.org/wiki/%E3%83%86%E3%82%B9%E3%83%88%E9%A7%86%E5%8B%95%E9%96%8B%E7%99%BA)
- [STRIDE脅威モデリング](https://docs.microsoft.com/ja-jp/azure/security/develop/threat-modeling-tool-threats)
- [Mermaid記法](https://mermaid.js.org/)
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
