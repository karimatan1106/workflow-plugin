/**
 * CLAUDE.md フェーズ別セクションマッピング
 *
 * 各ワークフローフェーズに必要なCLAUDE.mdのセクション見出しパターンを定義する。
 * resolvePhaseGuideで使用され、フェーズに関連するセクションのみを抽出する。
 *
 * @spec docs/spec/features/claude-md-sections.md
 */

/**
 * フェーズ別セクション見出しパターン
 *
 * キー: フェーズ名またはサブフェーズ名
 * 値: マッチさせる見出しテキストの部分文字列配列
 *
 * 見出しマッチングロジック:
 * - 見出し行のテキスト部分に対して、部分文字列一致で検索する
 * - 大文字小文字は区別しない
 * - 複数パターンが指定された場合、いずれかに一致すればセクションを抽出する
 */
export const PHASE_SECTION_PATTERNS: Record<string, string[]> = {
  // --- メインフェーズ ---
  research: [
    'ワークフローを使うべきケース',
    'AIへの厳命',
    'スコープ設定',
    'テスト出力・一時ファイル',
  ],
  requirements: [
    '仕様駆動開発',
    'AIへの厳命',
    'スコープ設定',
    '要件定義フェーズ',
  ],
  parallel_analysis: [
    '並列フェーズ',
    'AIへの厳命',
  ],
  parallel_design: [
    '並列フェーズ',
    '図式設計',
    'AIへの厳命',
  ],
  design_review: [
    'AIへの厳命',
    '設計レビュー',
  ],
  test_design: [
    'TDDサイクル',
    'テスト設計',
    'AIへの厳命',
  ],
  test_impl: [
    'TDDサイクル',
    'テスト出力・一時ファイル',
    'AIへの厳命',
  ],
  implementation: [
    'TDDサイクル',
    'AIへの厳命',
    'パッケージインストール',
    '設計したものは全て実装',
    'implementationフェーズでの設計チェック',
  ],
  refactoring: [
    'TDDサイクル',
    'AIへの厳命',
  ],
  parallel_quality: [
    '並列フェーズ',
    'code_reviewフェーズでの設計-実装整合性',
    'AIへの厳命',
  ],
  testing: [
    'テスト出力・一時ファイル',
    'AIへの厳命',
    'リグレッションテスト',
  ],
  regression_test: [
    'リグレッションテスト',
    'AIへの厳命',
    'テスト出力・一時ファイル',
  ],
  parallel_verification: [
    '並列フェーズ',
    'AIへの厳命',
  ],
  docs_update: [
    'ドキュメント構成',
    'AIへの厳命',
  ],
  commit: [
    'AIへの厳命',
    '完了宣言ルール',
    'commitフェーズ',
  ],
  push: [
    'AIへの厳命',
  ],
  ci_verification: [
    'AIへの厳命',
  ],
  deploy: [
    'AIへの厳命',
  ],

  // --- サブフェーズ ---
  threat_modeling: [
    '脅威モデリング',
    'AIへの厳命',
  ],
  planning: [
    '仕様駆動開発',
    'AIへの厳命',
    '推奨プロジェクト構造',
  ],
  state_machine: [
    '図式設計',
    'ステートマシン',
  ],
  flowchart: [
    '図式設計',
    'フローチャート',
  ],
  ui_design: [
    'CDD',
    'AIへの厳命',
    'UI設計',
  ],
  build_check: [
    'AIへの厳命',
  ],
  code_review: [
    'code_reviewフェーズでの設計-実装整合性',
    'AIへの厳命',
  ],
  manual_test: [
    'AIへの厳命',
  ],
  security_scan: [
    'AIへの厳命',
  ],
  performance_test: [
    'AIへの厳命',
  ],
  e2e_test: [
    'AIへの厳命',
    'テスト出力・一時ファイル',
  ],
};

/**
 * フェーズに対応するセクションパターンを取得
 *
 * @param phaseName フェーズ名またはサブフェーズ名
 * @returns セクション見出しパターン配列（見つからない場合は空配列）
 */
export function getSectionPatternsForPhase(phaseName: string): string[] {
  const patterns = PHASE_SECTION_PATTERNS[phaseName];
  return patterns ?? [];
}
