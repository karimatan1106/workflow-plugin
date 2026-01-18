# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
