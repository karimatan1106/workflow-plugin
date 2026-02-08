# 調査結果

## サマリー

- SKILL.mdにsubagent委譲の強制指示がない。これがcompacting頻発の根本原因
- フェーズプロンプトファイル（.claude/workflow-phases/）は大部分存在するが一部古い
- README.mdのフェーズ順序がdefinitions.tsと不一致
- SKILL.mdは18フェーズ記載（実際は19フェーズ）
- 目的: SKILL.mdにOrchestratorパターンを明記し、フェーズプロンプトを最新化する
- 次フェーズで必要な情報: 修正対象ファイル一覧、各ファイルの具体的変更内容

## 調査結果

### SKILL.mdの現状
- subagent委譲に関する記述: 「subagentがワークフロー制御ツールを呼び出してはいけない」のみ
- **「各フェーズをsubagentに委譲すること」という指示が完全に欠如**
- 18フェーズ記載（regression_testなし）
- フェーズ順序にarchitecture_review（廃止）が残存

### フェーズプロンプトファイルの状態
- 存在するファイル: research, requirements, threat_modeling, planning, state_machine, flowchart, ui_design, design_review, test_design, test_impl, implementation, refactoring, build_check, code_review, testing, regression_test, manual_test, security_scan, performance_test, e2e_test, docs_update, commit, push, ci_verification, deploy
- 全サブフェーズファイルは存在している
- 多くのファイルに「subagent実行」セクションあり
- subagent_type/modelの指定はCLAUDE.mdにあるがプロンプトファイル内には未記載

### definitions.tsの19フェーズ
research → requirements → parallel_analysis → parallel_design → design_review → test_design → test_impl → implementation → refactoring → parallel_quality → testing → regression_test → parallel_verification → docs_update → commit → push → ci_verification → deploy → completed

## 既存実装の分析

### 現在のワークフロー実行フロー
1. ユーザーが `/workflow start` を実行
2. SKILL.mdが読み込まれる
3. メインClaudeがフェーズ作業を**直接実行**してしまう（subagent委譲指示がないため）
4. 全フェーズの読み書きがメインコンテキストに蓄積
5. compactingが頻発し、前フェーズの詳細が消失

### あるべき姿（CLAUDE.mdのOrchestratorパターン）
1. ユーザーが `/workflow start` を実行
2. SKILL.mdが読み込まれ、**Orchestratorパターンが指示される**
3. メインClaudeは各フェーズをTask toolでsubagentに委譲
4. メインコンテキストにはサマリーのみ残る
5. compacting発生なし

### ギャップ
- SKILL.mdにOrchestratorパターンの指示がない
- CLAUDE.mdに書いてあるが、スキル発動時はSKILL.mdが主な行動指針
- フェーズプロンプトファイルのREADME.mdが古い

## 修正対象ファイル

| ファイル | 修正内容 |
|---------|---------|
| `.claude/skills/workflow/SKILL.md` | Orchestratorパターン強制セクション追加、19フェーズ更新 |
| `.claude/workflow-phases/README.md` | フェーズ順序をdefinitions.tsと一致させる |

## 技術的な考慮事項

- SKILL.mdの変更だけで効果がある（MCPサーバー変更不要）
- フェーズプロンプトファイルは既に十分な内容がある
- README.mdの更新は整合性のため必要だが優先度は低い
