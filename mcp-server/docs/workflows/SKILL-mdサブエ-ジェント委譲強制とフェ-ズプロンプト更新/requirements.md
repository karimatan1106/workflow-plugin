# 要件定義

## サマリー

本要件定義では、ワークフロースキル（/workflow）実行時のsubagent委譲を強制し、メインClaudeのコンテキスト肥大化を防ぐための仕様を定める。現在、SKILL.mdにOrchestratorパターンの指示が欠如しているため、メインClaudeが全フェーズを直接実行してcompactingが頻発している。

主な目的:
- SKILL.mdにOrchestratorパターンを明記し、各フェーズでTask toolによるsubagent委譲を強制
- フェーズ構成を19フェーズに更新（regression_test追加）
- フェーズ別subagent設定（subagent_type, model）を含める
- .claude/workflow-phases/README.mdのフェーズ順序をdefinitions.tsと一致させる

対象ファイル:
- `.claude/skills/workflow/SKILL.md` - Orchestratorパターン追加、19フェーズ更新
- `.claude/workflow-phases/README.md` - フェーズ順序の整合性確保

次フェーズで必要な情報:
- CLAUDE.mdのOrchestratorパターンセクションの内容
- definitions.tsの19フェーズ順序
- CLAUDE.mdのフェーズ別subagent設定テーブル
- SKILL.mdの既存構造と追加位置

---

## 機能要件

### REQ-1: SKILL.mdへのOrchestratorパターンセクション追加

**目的**: メインClaudeが各フェーズをsubagentに委譲することを強制する

**追加内容**:
```markdown
## Orchestratorパターン

メインのClaudeはOrchestratorとして動作し、各フェーズをsubagentに委譲する：

┌─────────────────────────────────────────────────────────────┐
│                     Orchestrator (Main Claude)              │
├─────────────────────────────────────────────────────────────┤
│  1. workflow_startでタスク開始                              │
│  2. フェーズごとにTask toolでsubagentを起動                │
│  3. subagent完了を待機                                      │
│  4. workflow_nextで次フェーズへ                             │
│  5. 並列フェーズは複数Taskを同時起動                        │
└─────────────────────────────────────────────────────────────┘

### subagent委譲の強制ルール

**重要**: 以下のフェーズは必ずTask toolでsubagentに委譲すること。メインClaudeが直接実行してはいけない:

- research
- requirements
- threat_modeling
- planning
- state_machine
- flowchart
- ui_design
- design_review
- test_design
- test_impl
- implementation
- refactoring
- build_check
- code_review
- testing
- regression_test
- manual_test
- security_scan
- performance_test
- e2e_test
- docs_update

### 例外: 軽量フェーズのインライン実行

以下のフェーズのみ、メインClaudeがインラインで実行可能（Task不要）:

- commit（gitコマンド実行のみ）
- push（gitコマンド実行のみ）
- ci_verification（CIステータス確認のみ）
- deploy（デプロイコマンド実行のみ）

判断基準:
- ファイル読み書きが不要
- 外部コマンド実行のみ
- 成果物ドキュメント作成が不要
```

**配置場所**: 「フェーズ順序」セクションの直後

---

### REQ-2: フェーズ構成を19フェーズに更新

**目的**: regression_testフェーズを含む最新のフェーズ構成に更新

**現状（18フェーズ）**:
```
research → requirements → parallel_analysis（threat_modeling + planning）
→ parallel_design（state_machine + flowchart + ui_design）
→ design_review【AIレビュー + ユーザー承認】
→ test_design → test_impl → implementation → refactoring
→ parallel_quality（build_check + code_review）→ testing
→ parallel_verification（manual_test + security_scan + performance_test + e2e_test）
→ docs_update → commit → push → ci_verification → deploy → completed
```

**修正後（19フェーズ）**:
```
research → requirements → parallel_analysis（threat_modeling + planning）
→ parallel_design（state_machine + flowchart + ui_design）
→ design_review【AIレビュー + ユーザー承認】
→ test_design → test_impl → implementation → refactoring
→ parallel_quality（build_check + code_review）→ testing
→ regression_test【リグレッションテスト】
→ parallel_verification（manual_test + security_scan + performance_test + e2e_test）
→ docs_update → commit → push → ci_verification → deploy → completed
```

**変更点**:
- `testing` と `parallel_verification` の間に `regression_test` を追加
- 注釈を「注: small/mediumサイズは廃止されました。品質管理の一貫性を保つため、全てのタスクで完全なワークフローを実行します。」から「全てのタスクは以下の19フェーズで実行されます。」に変更

**配置場所**: 「フェーズ順序」セクション

---

### REQ-3: フェーズ別subagent設定テーブルの追加

**目的**: 各フェーズで使用するsubagent_typeとmodelを明示する

**追加内容**:
```markdown
### フェーズ別subagent設定

| フェーズ | subagent_type | model | 入力ファイル | 出力ファイル |
|---------|---------------|-------|-------------|-------------|
| research | Explore | haiku | - | research.md |
| requirements | general-purpose | sonnet | research.md | requirements.md |
| threat_modeling | general-purpose | sonnet | requirements.md | threat-model.md |
| planning | Plan | sonnet | requirements.md | spec.md |
| state_machine | general-purpose | haiku | spec.md | state-machine.mmd |
| flowchart | general-purpose | haiku | spec.md | flowchart.mmd |
| ui_design | general-purpose | sonnet | spec.md | ui-design.md |
| design_review | general-purpose | haiku | spec.md, *.mmd, ui-design.md | - |
| test_design | Plan | sonnet | spec.md, *.mmd | test-design.md |
| test_impl | general-purpose | sonnet | test-design.md | *.test.ts |
| implementation | general-purpose | sonnet | *.test.ts | *.ts |
| refactoring | general-purpose | haiku | *.ts | *.ts |
| build_check | Bash | haiku | - | - |
| code_review | general-purpose | sonnet | *.ts | code-review.md |
| testing | Bash | haiku | - | - |
| regression_test | general-purpose | haiku | - | regression-test.md |
| manual_test | general-purpose | haiku | - | manual-test.md |
| security_scan | Bash | haiku | - | security-scan.md |
| performance_test | Bash | haiku | - | performance-test.md |
| e2e_test | Bash | haiku | - | e2e-test.md |
| docs_update | general-purpose | haiku | 全成果物 | ドキュメント |
| commit | - | - | - | - |
| push | - | - | - | - |
| ci_verification | - | - | - | - |
| deploy | - | - | - | - |

注: commit, push, ci_verification, deployはsubagent不要（メインClaudeでインライン実行）
```

**配置場所**: 「Orchestratorパターン」セクション内、「subagent委譲の強制ルール」の直後

---

### REQ-4: subagent起動テンプレートの追加

**目的**: 各フェーズでsubagentを起動する際の標準的なコードテンプレートを提供

**追加内容**:
```markdown
### subagent起動テンプレート

各フェーズでsubagentを起動する際は以下の形式を使用：

\`\`\`
Task({
  prompt: `
    # {フェーズ名}フェーズ

    ## タスク情報
    - タスク名: {taskName}
    - 出力先: docs/workflows/{taskName}/

    ## 入力
    以下のファイルを読み込んでください:
    - {入力ファイルパス}

    ## 作業内容
    {フェーズの作業内容}

    ## 出力
    以下のファイルに成果物を保存してください:
    - {出力ファイルパス}

    ## ★重要★ サマリーセクション必須化
    成果物の先頭には必ず以下のセクションを配置してください:

    ## サマリー

    （50行以内で、このドキュメントの要点を記述）
    - 目的
    - 主要な決定事項
    - 次フェーズで必要な情報

    これにより、次フェーズのsubagentがサマリーのみを読み込むことで
    効率的にコンテキストを引き継ぐことができます。
  `,
  subagent_type: '{subagent_type}',
  model: '{model}',
  description: '{フェーズ名}'
})
\`\`\`

### 並列フェーズの実行

parallel_*フェーズでは複数のTask toolを**同時に起動**する：

\`\`\`javascript
// parallel_analysisの例
// 1つのメッセージで複数のTask呼び出しを行う
Task({ prompt: '...threat_modeling...', subagent_type: 'general-purpose', model: 'sonnet', description: 'threat modeling' })
Task({ prompt: '...planning...', subagent_type: 'Plan', model: 'sonnet', description: 'planning' })

// 両方完了後
workflow_complete_sub('threat_modeling')
workflow_complete_sub('planning')
workflow_next()
\`\`\`

### コンテキスト引き継ぎ

subagent間のコンテキスト引き継ぎはファイル経由で行う：

1. 前フェーズの成果物: `docs/workflows/{taskName}/` に保存
2. 次フェーズのsubagent: Readツールで前フェーズの成果物を読み込み
3. MCPサーバー: 状態管理のみ担当（成果物は管理しない）
```

**配置場所**: 「フェーズ別subagent設定」テーブルの直後

---

### REQ-5: .claude/workflow-phases/README.mdのフェーズ順序更新

**目的**: フェーズプロンプトディレクトリのREADMEをdefinitions.tsと一致させる

**現状の問題**:
- README.mdのフェーズ順序が古い
- architecture_review（廃止済み）が含まれている
- regression_testが欠如している

**修正内容**:
```markdown
# ワークフローフェーズプロンプト

各ワークフローフェーズのプロンプトテンプレートを格納するディレクトリです。

## フェーズ一覧（19フェーズ）

1. research.md - 調査フェーズ
2. requirements.md - 要件定義フェーズ
3. threat_modeling.md - 脅威モデリング（parallel_analysis）
4. planning.md - 計画（parallel_analysis）
5. state_machine.md - ステートマシン図作成（parallel_design）
6. flowchart.md - フローチャート作成（parallel_design）
7. ui_design.md - UI設計（parallel_design）
8. design_review.md - 設計レビュー
9. test_design.md - テスト設計
10. test_impl.md - テスト実装
11. implementation.md - 実装
12. refactoring.md - リファクタリング
13. build_check.md - ビルドチェック（parallel_quality）
14. code_review.md - コードレビュー（parallel_quality）
15. testing.md - テスト実行
16. regression_test.md - リグレッションテスト
17. manual_test.md - 手動テスト（parallel_verification）
18. security_scan.md - セキュリティスキャン（parallel_verification）
19. performance_test.md - パフォーマンステスト（parallel_verification）
20. e2e_test.md - E2Eテスト（parallel_verification）
21. docs_update.md - ドキュメント更新
22. commit.md - コミット（プロンプト参照用のみ）
23. push.md - プッシュ（プロンプト参照用のみ）
24. ci_verification.md - CI検証
25. deploy.md - デプロイ

注: commit, push, ci_verification, deployはsubagent不要（メインClaudeでインライン実行）
```

**配置場所**: `.claude/workflow-phases/README.md` 全体を置換

---

## 非機能要件

### NFR-1: CLAUDE.mdとの整合性維持

- SKILL.mdの変更はCLAUDE.mdの内容と矛盾しないこと
- Orchestratorパターンの説明はCLAUDE.mdと同一の図・文言を使用すること
- フェーズ別subagent設定テーブルはCLAUDE.mdと同一の値を使用すること

### NFR-2: MCPサーバーのコード変更不要

- 本要件はドキュメント変更のみで対応すること
- `definitions.ts` の変更は不要（既に19フェーズに対応済み）
- MCPツールの実装変更は不要

### NFR-3: 既存フェーズプロンプトファイルの利用

- `.claude/workflow-phases/*.md` の個別ファイル内容は変更不要
- README.mdのみ更新し、各フェーズプロンプトファイルはそのまま使用可能

### NFR-4: 下位互換性の維持

- 既存のワークフロータスクは影響を受けないこと
- 既に開始されているタスクは引き続き実行可能であること

---

## 対象外

以下は本要件の対象外とする：

### OUT-1: MCPサーバーのコード変更
- `definitions.ts` の変更（既に19フェーズ対応済み）
- `workflow-tools.ts` の変更
- `state-manager.ts` の変更

### OUT-2: フェーズプロンプトファイルの内容更新
- `.claude/workflow-phases/research.md` の内容
- `.claude/workflow-phases/requirements.md` の内容
- その他の個別フェーズプロンプトファイルの内容

### OUT-3: 新規フェーズの追加
- 19フェーズ以外の新規フェーズ追加は対象外
- フェーズの削除も対象外

### OUT-4: CLAUDE.mdの変更
- CLAUDE.mdは変更せず、参照のみ

---

## 受け入れ基準

### AC-1: SKILL.mdのOrchestratorパターン追加

- [ ] SKILL.mdに「Orchestratorパターン」セクションが追加されている
- [ ] 「subagent委譲の強制ルール」が明記されている
- [ ] 軽量フェーズ（commit, push, ci_verification, deploy）の例外規定が含まれている
- [ ] CLAUDE.mdの図・文言と一致している

### AC-2: フェーズ構成の更新

- [ ] SKILL.mdのフェーズ順序が19フェーズに更新されている
- [ ] regression_testが testing と parallel_verification の間に配置されている
- [ ] 注釈が「19フェーズ」を示している

### AC-3: フェーズ別subagent設定テーブル

- [ ] SKILL.mdに「フェーズ別subagent設定」テーブルが追加されている
- [ ] 全19フェーズ + 軽量フェーズのエントリが含まれている
- [ ] subagent_type, model, 入力ファイル, 出力ファイルが記載されている
- [ ] CLAUDE.mdのテーブルと値が一致している

### AC-4: subagent起動テンプレート

- [ ] SKILL.mdに「subagent起動テンプレート」が追加されている
- [ ] Task tool呼び出しの標準形式が示されている
- [ ] 並列フェーズの実行例が含まれている
- [ ] コンテキスト引き継ぎの説明が含まれている

### AC-5: README.mdのフェーズ順序

- [ ] `.claude/workflow-phases/README.md` が更新されている
- [ ] フェーズ順序がdefinitions.tsと一致している
- [ ] architecture_review が削除されている
- [ ] regression_test が追加されている

### AC-6: 整合性検証

- [ ] SKILL.mdとCLAUDE.mdの内容に矛盾がない
- [ ] SKILL.mdとdefinitions.tsのフェーズ順序が一致している
- [ ] README.mdとdefinitions.tsのフェーズ順序が一致している

### AC-7: 既存機能への影響なし

- [ ] ワークフロー開始時にSKILL.mdが正しく読み込まれる
- [ ] 既存のタスクが引き続き実行可能である
- [ ] MCPツールの動作に変更がない

---

## 補足: コンテキスト肥大化の根本原因

現在の問題:
```
/workflow start
  ↓
SKILL.md 読み込み
  ↓
「各フェーズを実行してください」← subagent委譲の指示がない
  ↓
メインClaudeが全フェーズを直接実行
  ↓
research: 調査結果を直接書く（5000行）
requirements: 仕様書を直接書く（3000行）
planning: 設計書を直接書く（4000行）
  ↓
コンテキストが肥大化（12000行）
  ↓
compacting発生
  ↓
前フェーズの詳細が消失
```

修正後のあるべき姿:
```
/workflow start
  ↓
SKILL.md 読み込み
  ↓
「各フェーズはTask toolでsubagentに委譲すること」← 明示的指示
  ↓
メインClaudeは各フェーズをsubagentに委譲
  ↓
Task(research) → subagent A が research.md を作成
Task(requirements) → subagent B が requirements.md を作成
Task(planning) → subagent C が spec.md を作成
  ↓
メインClaudeのコンテキストにはサマリーのみ（500行程度）
  ↓
compacting発生なし
```

---

## 関連ファイル

<!-- @related-files -->
- `.claude/skills/workflow/SKILL.md` - Orchestratorパターン追加対象
- `.claude/workflow-phases/README.md` - フェーズ順序更新対象
- `/mnt/c/ツール/Workflow/CLAUDE.md` - 参照元（変更不要）
- `workflow-plugin/mcp-server/src/definitions.ts` - フェーズ定義（変更不要）
<!-- @end-related-files -->
