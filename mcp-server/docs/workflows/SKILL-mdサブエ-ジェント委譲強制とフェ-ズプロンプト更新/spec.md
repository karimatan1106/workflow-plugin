# 仕様書: SKILL.mdサブエージェント委譲強制とフェーズプロンプト更新

## サマリー

本仕様書は、ワークフロースキル（/workflow）実行時のsubagent委譲を強制し、メインClaudeのコンテキスト肥大化を防ぐための具体的な実装内容を定める。

主な変更: (1) SKILL.mdにOrchestratorパターンセクション追加、フェーズ構成を19フェーズに更新、subagent設定テーブル追加。(2) README.mdのフェーズ順序を19フェーズに更新、architecture_review削除、regression_test追加。

変更の根拠: 現在、SKILL.mdにsubagent委譲の明示的指示がないため、メインClaudeが全フェーズを直接実行してcompactingが頻発。Orchestratorパターンを明記することで、メインClaudeは各フェーズをTask toolでsubagentに委譲することを強制。コンテキストはサマリーのみ（500行程度）に抑制され、compacting発生を防止。

次フェーズで必要な情報: SKILL.mdとCLAUDE.mdの文言一致検証、definitions.tsとの整合性確認、既存ワークフロータスクへの影響確認。

## 概要

ワークフロースキル実行時にsubagent委譲を強制するため、SKILL.mdにOrchestratorパターンを追加し、フェーズプロンプトのREADME.mdを最新化する。

## 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `.claude/skills/workflow/SKILL.md` | Orchestratorパターン追加、19フェーズ更新、subagent設定テーブル追加 |
| `.claude/workflow-phases/README.md` | フェーズ順序を19フェーズに更新 |

## 実装計画

1. SKILL.mdのフェーズ構成を19フェーズに更新（regression_test追加）
2. SKILL.mdにOrchestratorパターンセクションを追加（フェーズ構成の直後）
3. SKILL.mdにフェーズ別subagent設定テーブルを追加
4. SKILL.mdにsubagent起動テンプレートと並列実行例を追加
5. README.mdを全文置換（19フェーズ対応）
6. 整合性検証

## 1. SKILL.mdの変更内容

### 1-1. Orchestratorパターンセクションの追加

配置場所は「フェーズ構成（19フェーズ）」セクションの直後とする。

追加するセクション「## Orchestratorパターン」には以下を含める:
- Orchestrator (Main Claude) の動作フロー図（workflow_start → Task tool委譲 → subagent完了待機 → workflow_next → 並列フェーズは複数Task同時起動）
- 「subagent委譲の強制ルール」サブセクション: 全21サブフェーズ・フェーズをリストアップし、Task tool委譲が必須であることを明記
- 「例外: 軽量フェーズのインライン実行」サブセクション: commit, push, ci_verification, deployの4フェーズのみメインClaudeでインライン実行可能とする（判断基準: ファイル読み書き不要、外部コマンド実行のみ、成果物ドキュメント作成不要）
- フェーズ別subagent設定テーブル（subagent_type, model, 入力/出力ファイルの25行テーブル）
- subagent起動テンプレート（Task tool呼び出しの標準形式。サマリーセクション必須化指示を含む）
- 並列フェーズの実行例（parallel_analysisの例）
- コンテキスト引き継ぎの説明（ファイル経由での受け渡し方式）

### 1-2. フェーズ構成の更新（18から19フェーズへ）

対象セクション: 「フェーズ構成（18フェーズ）」

変更点として、(1) タイトルを「19フェーズ」に変更、(2) testingとparallel_verificationの間に`regression_test【リグレッションテスト】`を追加、(3) 注釈を更新する。

更新後のフェーズ順序: research, requirements, parallel_analysis(threat_modeling + planning), parallel_design(state_machine + flowchart + ui_design), design_review, test_design, test_impl, implementation, refactoring, parallel_quality(build_check + code_review), testing, regression_test, parallel_verification(manual_test + security_scan + performance_test + e2e_test), docs_update, commit, push, ci_verification, deploy, completed

### 1-3. 禁止行為セクションの更新

既存の禁止行為リスト（8項目）に新規項目を追加: 「subagent委譲が必要なフェーズをメインClaudeが直接実行する」

### 1-4. 必須成果物テーブルの更新

現在の6行テーブルを拡張し、以下のエントリを追加: researchの成果物としてresearch.md、planningの成果物をspec.mdに変更（CLAUDE.mdと一致させる）、test_designの成果物としてtest-design.md、regression_testの成果物としてregression-test.md

## 2. README.mdの変更内容

ファイルパス: `.claude/workflow-phases/README.md`。変更方法: 全文置換。

新しいREADME.mdの内容:
- フェーズ一覧（19フェーズ + 4軽量フェーズ = 25項目のナンバリングリスト）
- architecture_reviewを削除済み、regression_testを16番目に配置
- 並列グループ一覧テーブル
- フェーズ順序図（regression_test含む）
- 各フェーズの責務テーブル（subagent_type, model含む）
- タスクディレクトリ構成（regression-test.md追加）
- 永続ドキュメント（docs/spec/）の参照テーブル

## 3. 変更の適用順序

ステップ1としてSKILL.mdを更新する。フェーズ構成セクションの更新（18から19へ）、Orchestratorパターンセクションの追加、禁止行為セクションへの項目追加、必須成果物テーブルの更新の順に行う。

ステップ2としてREADME.mdを全文置換する。

## 4. 検証項目

### SKILL.mdの検証

Orchestratorパターンセクションが追加されていること。フェーズ構成が19フェーズになっていること。regression_testが含まれていること。フェーズ別subagent設定テーブルが含まれていること。subagent起動テンプレートが含まれていること。並列フェーズの実行例が含まれていること。コンテキスト引き継ぎの説明が含まれていること。

### README.mdの検証

フェーズ一覧が19フェーズになっていること。architecture_reviewが削除されていること。regression_testが追加されていること。フェーズ順序にregression_testが含まれていること。各フェーズの責務テーブルが含まれていること。

### 整合性の検証

SKILL.mdのフェーズ順序とCLAUDE.mdが一致していること。README.mdのフェーズ順序とCLAUDE.mdが一致していること。フェーズ別subagent設定がCLAUDE.mdと一致していること。Orchestratorパターンの図・文言がCLAUDE.mdと一致していること。

### 機能的な検証

`/workflow start`でSKILL.mdが正しく読み込まれること。既存のワークフロータスクが影響を受けないこと。MCPツールの動作に変更がないこと。

## 5. 既存セクションとの統合

SKILL.mdの既存セクション構成は以下の通り: (1) 使用タイミング、(2) コマンド、(3) フェーズ構成（更新対象）、(4) Orchestratorパターン（新規追加）、(5) ワークフローの原則、(6) プロジェクト構造ガイダンス、(7) 成果物ルール、(8) 禁止行為（更新対象）、(9) 完了宣言ルール、(10) ワークフロー制御権限、(11) コンテキスト管理、(12) エラーハンドリング、(13) 使用例、(14) 参考資料

Orchestratorパターンセクションはフェーズ構成セクション(3)の直後に配置し、ワークフローの全体像を理解してから詳細な原則に進む自然な流れを作る。

## 6. CLAUDE.mdとの整合性確保

以下の内容はCLAUDE.mdと完全に一致させる: Orchestratorパターンの図（CLAUDE.md行140-150と同一）、フェーズ別subagent設定テーブル（CLAUDE.md行154-177と同一）、subagent起動テンプレート（CLAUDE.md行179-243と同一）、フェーズ順序（CLAUDE.md行100-109と一致）

## 7. 影響範囲

影響を受けるファイル: SKILL.md（高影響）、README.md（中影響）。影響を受けないファイル: definitions.ts（既に19フェーズ対応済み）、workflow-tools.ts、state-manager.ts、個別フェーズプロンプト（.claude/workflow-phases/*.md）、CLAUDE.md（参照のみ）。

既存ワークフローへの影響: 開始済みのタスクは影響なし（ワークフロー状態はJSON管理）。新規タスクはSKILL.md読み込み時に新しいOrchestratorパターンが適用される。MCPツールの動作変更なし。

## 8. コンテキスト肥大化問題の解決メカニズム

現状: /workflow start後、SKILL.mdが読み込まれるが「各フェーズを実行してください」とあるだけでsubagent委譲の指示がないため、メインClaudeが全フェーズを直接実行する。research調査結果（5000行）、requirements仕様書（3000行）、planning設計書（4000行）が蓄積し、コンテキストが12000行に肥大化してcompactingが発生、前フェーズの詳細が消失する。

修正後: SKILL.mdに「各フェーズはTask toolでsubagentに委譲すること」と明示的に指示。メインClaudeは各フェーズをsubagentに委譲する。Task(research)でsubagent Aがresearch.mdを作成、Task(requirements)でsubagent Bがrequirements.mdを作成。メインClaudeのコンテキストにはサマリーのみ（500行程度）が残り、compactingは発生しない。

サマリーセクション必須化（REQ-4）: subagent起動テンプレートに「成果物の先頭に## サマリーセクションを50行以内で配置」の指示を含め、次フェーズのsubagentがサマリーのみを読み込むことで効率的にコンテキストを引き継ぐ。

## 9. 受け入れ基準の詳細

AC-1: SKILL.mdにOrchestratorパターンセクションが存在し、図、強制ルール、21フェーズのリスト、例外規定、CLAUDE.mdとの一致を満たすこと。

AC-2: フェーズ構成タイトルが「19フェーズ」で、regression_testがtestingとparallel_verificationの間に配置されていること。

AC-3: フェーズ別subagent設定テーブルが25行（21フェーズ + 4軽量フェーズ）で、各行にsubagent_type, model, 入力/出力ファイルが記載されていること。

AC-4: subagent起動テンプレートにTask tool呼び出しの標準形式とサマリーセクション必須化指示が含まれること。

AC-5: README.mdのフェーズ一覧が19フェーズで、architecture_reviewが削除済み、regression_testが16番目に配置されていること。

AC-6: SKILL.md、README.md、CLAUDE.md、definitions.tsの間でフェーズ順序とsubagent設定が一致していること。

AC-7: /workflow startでSKILL.mdが正しく読み込まれ、既存ワークフロータスクが引き続き実行可能で、MCPツールの動作とワークフロー状態JSONの構造に変更がないこと。

## 10. 実装時の注意事項

マークダウンフォーマットとして、コードブロックは3つのバッククォートで囲み、テーブルはGitHub Flavored Markdown形式を使用、リストのインデントは2スペースとする。

CLAUDE.mdからのコピー時は行番号プレフィックスを除去し、インデントレベルとコードブロックの言語指定を維持する。

regression_testの配置は3箇所で一貫させる: SKILL.mdフェーズ順序図（testingとparallel_verificationの間）、SKILL.mdサブagent委譲リスト、README.mdフェーズ一覧（16番目）。

regression_testのsubagent設定は subagent_type: general-purpose、model: haiku、出力ファイル: regression-test.md で統一する。

## 関連ファイル

<!-- @related-files -->
- `.claude/skills/workflow/SKILL.md` - Orchestratorパターン追加、19フェーズ更新
- `.claude/workflow-phases/README.md` - フェーズ順序更新
- `/mnt/c/ツール/Workflow/CLAUDE.md` - 参照元（変更不要）
- `workflow-plugin/mcp-server/src/definitions.ts` - フェーズ定義（変更不要）
- `workflow-plugin/mcp-server/docs/workflows/SKILL-mdサブエ-ジェント委譲強制とフェ-ズプロンプト更新/requirements.md` - 要件定義
<!-- @end-related-files -->
