# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.7.0] - 2026-02-23

### Added

- **FR-1: スコープ段階的必須化**: ワークフロータスク開始時のスコープ設定段階的警告機構
  - `research` フェーズ完了時に情報レベルの推奨メッセージを表示
  - `requirements` フェーズ完了時に警告レベルのスコープ未設定警告を追加
  - `parallel_analysis` フェーズ移行時にスコープ未設定をブロック（既存動作維持）
  - `workflow_set_scope` コマンド指示をメッセージに含める

- **FR-2: ドキュメント階層化**: モジュール単位のドキュメント分離機構
  - `types.ts` の `scope` インターフェースに `moduleName?: string` フィールド追加
  - `set-scope.ts` で `dirs` パラメータから `moduleName` を自動推定（先頭ディレクトリのbasename）
  - `definitions.ts` に `{moduleDir}` プレースホルダー追加（`{docsDir}/modules/{moduleName}` に展開）
  - `moduleName` が未設定の場合、`{moduleDir}` は `{docsDir}` にフォールバック（後方互換性確保）

- **FR-3: コンテキスト絞り込み**: スコープ指定時のドキュメント入力範囲制限ガイダンス
  - CLAUDE.md のサブエージェント起動テンプレートにスコープ制約文言追記
  - `definitions.ts` の inputFiles セクションに、スコープ設定時は対象ファイルのみ参照することを明記

- **バグ修正: artifact-validator.ts の Mermaid ファイル誤検出**
  - `.mmd` 拡張子ファイルの角括弧プレースホルダーチェックをスキップ
  - `stateDiagram-v2` の `[*]` 記法や `flowchart` の `["text"]` 記法が正当に記述可能に

- **セマンティックチェック改善: semantic-checker.ts**
  - `validateKeywordTraceability` をLLMベースのセマンティック継承度検証に置換
  - 新規関数 `validateLLMSemanticTraceability()`: Claude Haiku で前フェーズから後続フェーズへの情報伝搬を意味的に評価（0.0〜1.0スコア）
  - 新規関数 `extractSummarySection()`: ドキュメントの `## サマリー` セクション抽出ヘルパー
  - API失敗時は非ブロッキング（フォールバック）で処理継続

### Changed

- **CLAUDE.md**: スコープ設定ガイダンスセクション拡充
  - `moduleName` 自動推定の仕組みを説明
  - `{moduleDir}` プレースホルダーの使用方法とフォールバック動作を明記
  - サブエージェント起動テンプレートにスコープ制約文言を追加

- **フェーズ間コンテキスト引き継ぎ**: モジュール階層化に対応
  - `resolvePhaseGuide()` 関数シグネチャに `moduleName?: string` 引数追加
  - フェーズ定義内の `outputFile`・`inputFiles`・`requiredArtifacts` で `{moduleDir}` 使用可能に
  - `next.ts` からの呼び出しで `taskState.scope?.moduleName` を自動渡し

### Benefits

- **早期問題検出**: スコープ未設定が `requirements` フェーズで警告される（`parallel_analysis` ブロック前）
- **モジュール単位の成果物管理**: `moduleName` ベースの階層化で複数並行タスクの干渉を防止
- **後方互換性**: `moduleName` はオプショナル、未設定時は既存の `{docsDir}` 展開と同一
- **セマンティック検証精度向上**: キーワード頻度から意味的継承度へ（偽陽性削減）
- **パフォーマンス**: スコープチェック追加処理はメモリアクセスのみ（10ms要件達成）

### Documentation

- CLAUDE.md: スコープ設定ガイダンスの詳細説明（moduleName自動推定、{moduleDir}展開説明）
- CLAUDE.md: サブエージェント起動テンプレートにスコープ制約セクション追加
- CLAUDE.md: {moduleDir}プレースホルダーの説明と使用例を追加

### Tests

- `next.test.ts` に4件の追加テスト（requirements フェーズのスコープ警告検証）
- `definitions.test.ts` に4件の追加テスト（{moduleDir}プレースホルダー置換検証）
- `semantic-checker.test.ts` に3件の追加テスト（LLMセマンティック検証、サマリー抽出検証）
- `artifact-validator.test.ts` に1件の追加テスト（.mmd ファイルスキップ検証）

---

## [1.6.0] - 2026-02-17

### Added

- **REQ-B1: subagentプロンプト自動生成**: PhaseGuideデータからワークフロープロンプトを動的生成
  - `buildPrompt()` 関数: 9セクション構成のsubagentプロンプトを自動生成
  - `buildRetryPrompt()` 関数: バリデーション失敗時に11種のエラーを認識してリトライプロンプトを生成
  - `exportGlobalRules()` 関数: artifact-validator.tsの品質ルール定数を構造化して公開
  - `getBashWhitelist()` 関数: bash-whitelist.jsの4カテゴリコマンドリストを展開

- **REQ-B2: 型定義拡張**: ワークフロー状態管理の構造化
  - `GlobalRules` 型: 成果物品質ルール（16フィールド）を構造化
  - `BashWhitelist` 型: カテゴリ別コマンドリストと展開機能を提供
  - `ValidationResult` 型: artifact-validatorのエラー情報を構造化
  - `PhaseGuide.checklist` フィールド: フェーズ固有のチェックリスト（string array）

- **REQ-B3: PhaseGuide統合**: 品質ルールとホワイトリストの一元管理
  - PHASE_ARTIFACT_REQUIREMENTSの削除: requiredSectionsをPHASE_GUIDESに統合
  - resolvePhaseGuide関数の更新: buildPrompt呼び出しでsubagentTemplateを自動設定
  - 後方互換性の確保: 既存の呼び出し元への変更なし

### Changed

- **品質ルール伝達の強化**: artifact-validatorの全ルール（禁止パターン、重複検出、密度要件等）がsubagentプロンプトに自動反映
- **コマンドホワイトリスト展開**: bash-whitelist.jsのカテゴリ別commandsがsubagentプロンプトに自動展開
- **リトライ機構の標準化**: buildRetryPrompt()により、バリデーション失敗時の修正指示が自動生成される

### Benefits

- **保守負担削減**: 品質ルール変更時にartifact-validator.tsのみ更新すればsubagentプロンプトに自動反映
- **テスタビリティ向上**: buildPrompt/buildRetryPromptがfunctionなため、ユニットテストで検証可能
- **ルール不整合解決**: PhaseGuideとartifact-validatorの品質ルール同期が自動化される
- **エラー対応の効率化**: buildRetryPromptがエラー種別を自動認識して具体的な修正指示を生成

### Documentation

- CLAUDE.md: subagent起動テンプレート更新（サマリーセクション、Bashコマンド制限、成果物品質要件を明記）
- CLAUDE.md: Orchestratorの制約事項を追加（成果物ファイル直接編集禁止、バリデーション修正もsubagent委譲）

---

## [1.5.0] - 2026-02-07

### Added

- **REQ-1: FAIL_OPEN環境変数の除去**: エラー時のfail-closed原則を強制
  - `FAIL_OPEN` 環境変数のサポートを削除
  - エラー発生時は必ず例外をスロー（fail-closed）
  - セキュリティ監査対応

- **REQ-2: 状態ファイルのHMAC署名**: workflow-state.json の改竄検出
  - `workflow-state.json` に対する HMAC-SHA256 署名を実装
  - ファイル変更時の署名検証でレジスタリー攻撃を防止
  - 署名キーはマスターパスワードから派生

- **REQ-3: スコープサイズ制限**: ファイル数・ディレクトリ数に上限を設定
  - `WORKFLOW_MAX_FILES`: 単一ワークフロー内の最大ファイル数（デフォルト: 1000）
  - `WORKFLOW_MAX_DIRS`: 単一ワークフロー内の最大ディレクトリ数（デフォルト: 500）
  - ファイルシステム DoS 攻撃を防止

- **REQ-4: Bash解析強化**: コマンド連結パターンの検出改善
  - `&&`, `||`, `;` を含むコマンド連結の解析を強化
  - 複数コマンドの依存関係を正確に追跡
  - パイプライン（`|`）内の危険なコマンド検出

- **REQ-5: 成果物検証強化**: 成果物の内容品質検証
  - ワークフロー成果物ファイルの形式検証
  - 必須セクション（## サマリー）の存在チェック
  - ファイルサイズ上限チェック（デフォルト: 10MB）

- **REQ-6: 設計検証必須化**: SKIP_DESIGN_VALIDATION 環境変数を削除
  - `SKIP_DESIGN_VALIDATION` 環境変数のサポートを削除
  - 設計-実装整合性検証を必須化
  - 設計書と実装の同期を厳格に検証

### Changed

- **エラーハンドリング**: fail-closed 原則に統一
  - 不明なエラーは安全側（失敗）に倒す
  - ログに詳細な診断情報を記録

- **設計検証**: より厳格な検証ロジックに統一
  - 設計書の全項目が実装に反映されているか確認
  - 設計書にない実装（勝手な追加機能）を検出

### Security

- **改竄検出**: HMAC 署名による状態ファイル保護
- **DoS 対策**: ファイルシステムリソース制限
- **エラー処理**: fail-closed 原則による安全性向上

### Documentation

- CLAUDE.md: REQ-6 の設計検証必須化を明記
- REQ-3 のスコープサイズ限度を環境変数テーブルに追加

---

## [1.4.0] - 2026-01-18

### Added

- **subagentによるフェーズ実行**: 各ワークフローフェーズをTask toolでsubagentとして実行する機能
  - Orchestratorパターンでメインのクラウドがフェーズを統括
  - フェーズ別のsubagent_type、model設定表を追加
  - 並列フェーズ（parallel_*）での複数Task同時起動をサポート
- **プロンプトテンプレート**: `skills/workflow/phases/` に各フェーズ用テンプレートを追加
  - research.md, requirements.md, planning.md, threat-modeling.md
  - test-design.md, implementation.md, index.md
- **ワークフロー使用判断ガイドライン**: レビュー・分析タスクと実装タスクの判断基準を追加

### Changed

- **CLAUDE.md**: subagent実行ルールセクションを追加
- **コンテキスト管理**: ファイル経由でのフェーズ間引き継ぎを明文化

### Benefits

- コンテキスト肥大化の防止（各フェーズが独立したコンテキスト）
- parallel_*フェーズでの実際の並列実行が可能に
- フェーズごとのモデル最適化（haiku/sonnet選択）でコスト削減

---

## [1.3.0] - 2026-01-17

### Changed

- **architecture_review を design_review に統合**: AIレビュー + ユーザー承認を1フェーズで実施
- **Large タスク**: 19フェーズ → 18フェーズに削減

### Removed

- **architecture_review フェーズ**: design_review に統合されたため削除
- `workflow-phases/architecture_review.md` を削除

### Documentation

- `workflow-phases/design_review.md` を更新（AIレビュー機能を統合）

---

## [1.2.0] - 2026-01-17

### Added

- **e2e_test サブフェーズ**: parallel_verification に E2E テストを追加

### Changed

- **Medium タスク**: 12フェーズ → 13フェーズに拡張（docs_update を追加）
- **parallel_verification**: 4サブフェーズに拡張（manual_test + security_scan + performance_test + e2e_test）

### Documentation

- workflow-phases/ に新規フェーズプロンプト追加
  - `e2e_test.md`

---

## [1.1.0] - 2026-01-17

### Added

- **docs_update フェーズ**: 実装完了後のドキュメント更新を強制するフェーズ
- **ci_verification フェーズ**: push後のCI/CDパイプライン確認フェーズ
- **performance_test サブフェーズ**: parallel_verification に追加

### Changed

- **フェーズ順序の改善**: architecture_review を parallel_design の後に移動
- **Large タスク**: 17フェーズ → 19フェーズに拡張
- **parallel_verification**: manual_test + security_scan + performance_test の3サブフェーズに

### Documentation

- README.md / README.en.md を新フェーズ構成に更新
- CLAUDE.md を新フェーズ構成に更新
- workflow-phases/ に新規フェーズプロンプト追加
  - `docs_update.md`
  - `ci_verification.md`
  - `performance_test.md`

---

## [1.0.0] - 2026-01-17

### Added

#### コア機能

- **ワークフロー管理システム**: TDD（テスト駆動開発）強化方式の最大21フェーズワークフローを実装
- **タスクサイズ対応**: Small（5フェーズ）、Medium（12フェーズ）、Large（21フェーズ）の3段階でフェーズ数を調整可能
- **仕様駆動開発（SDD）サポート**: コード編集前に仕様書更新を強制するガード機構

#### MCPサーバー

- `workflow_start`: タスク開始ツール（サイズ指定オプション付き）
- `workflow_next`: 次フェーズ遷移ツール
- `workflow_status`: 現在の状態取得ツール
- `workflow_approve`: 設計レビュー承認ツール
- `workflow_reset`: research フェーズへのリセットツール
- `workflow_list`: アクティブタスク一覧取得ツール
- `workflow_switch`: タスク切替ツール
- `workflow_complete_sub`: 並列フェーズのサブフェーズ完了ツール

#### フック（PreToolUse）

- `enforce-workflow.js`: タスク未開始時のファイル編集をブロック
- `phase-edit-guard.js`: フェーズに応じたファイルタイプの編集制限
- `spec-first-guard.js`: 仕様書更新前のコード編集をブロック
- `loop-detector.js`: 同一ファイルの繰り返し編集を検出（5回以上/5分）
- `check-spec.js`: 新規ファイル作成時の仕様書存在チェック
- `check-test-first.js`: TDD フェーズでのテストファースト強制

#### フック（PostToolUse）

- `check-workflow-artifact.js`: フェーズ遷移時の成果物反映チェック
- `spec-guard-reset.js`: 仕様ガード状態のリセット
- `check-spec-sync.js`: コードと仕様書の同期チェック

#### スキル

- `/workflow` スキル: ワークフロー管理コマンドを Claude Code から呼び出し可能

#### フェーズプロンプト

- 21種類のフェーズ別プロンプトファイル（`workflow-phases/` 配下）:
  - `research.md`: 調査フェーズ
  - `requirements.md`: 要件定義フェーズ
  - `threat_modeling.md`: 脅威モデリングフェーズ
  - `planning.md`: 計画フェーズ
  - `architecture_review.md`: アーキテクチャレビューフェーズ
  - `state_machine.md`: ステートマシン設計フェーズ
  - `flowchart.md`: フローチャート設計フェーズ
  - `ui_design.md`: UI設計フェーズ
  - `design_review.md`: 設計レビューフェーズ
  - `test_design.md`: テスト設計フェーズ
  - `test_impl.md`: テスト実装フェーズ
  - `implementation.md`: 実装フェーズ
  - `refactoring.md`: リファクタリングフェーズ
  - `build_check.md`: ビルドチェックフェーズ
  - `code_review.md`: コードレビューフェーズ
  - `testing.md`: テスト実行フェーズ
  - `manual_test.md`: 手動テストフェーズ
  - `security_scan.md`: セキュリティスキャンフェーズ
  - `commit.md`: コミットフェーズ
  - `push.md`: プッシュフェーズ
  - `deploy.md`: デプロイフェーズ

#### 並列フェーズ

- `parallel_analysis`: threat_modeling + planning
- `parallel_design`: state_machine + flowchart + ui_design
- `parallel_quality`: build_check + code_review
- `parallel_verification`: manual_test + security_scan

#### インストール

- 自動インストールスクリプト（`install.js`）
- プラグインマニフェスト（`.claude-plugin/manifest.json`）
- 設定マージ機能（`settings.json`）

#### 環境変数

- `WORKFLOW_STATE_FILE`: グローバル状態ファイルのパス設定
- `WORKFLOW_DIR`: ワークフローディレクトリのパス設定
- `SPEC_DIR`: 仕様書ディレクトリのパス設定
- `CODE_DIRS`: コードディレクトリの設定
- `SKIP_PHASE_GUARD`: フェーズ編集制限の無効化オプション
- `SKIP_SPEC_GUARD`: 仕様ファーストチェックの無効化オプション
- `SKIP_LOOP_DETECTION`: 無限ループ検出の無効化オプション
- `SKIP_ARTIFACT_CHECK`: 成果物反映チェックの無効化オプション
- `DEBUG_PHASE_GUARD`: デバッグログ出力オプション

#### ドキュメント

- `README.md`: プラグインの概要、インストール方法、使用方法
- `CLAUDE.md`: ワークフロー強制ルールの説明

[1.0.0]: https://github.com/yourname/workflow-plugin/releases/tag/v1.0.0
