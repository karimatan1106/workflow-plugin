/**
 * フェーズ定義共通モジュール（FR-8: Rule Definition Consolidation）
 *
 * phase-edit-guard.jsとenforce-workflow.jsで重複していたフェーズルール定義を統合
 * @spec docs/workflows/ワ-クフロ-プラグインレビュ-指摘事項全件修正/spec.md
 */

/**
 * フェーズ順序配列（19フェーズ）
 */
const PHASES = [
  'idle',
  'research',
  'requirements',
  'parallel_analysis',
  'threat_modeling',
  'planning',
  'parallel_design',
  'state_machine',
  'flowchart',
  'ui_design',
  'design_review',
  'test_design',
  'test_impl',
  'implementation',
  'refactoring',
  'parallel_quality',
  'build_check',
  'code_review',
  'testing',
  'regression_test',
  'parallel_verification',
  'manual_test',
  'security_scan',
  'performance_test',
  'e2e_test',
  'docs_update',
  'commit',
  'push',
  'ci_verification',
  'deploy',
  'completed',
];

/**
 * フェーズ別ルール定義
 * allowed: 許可されるファイルタイプ
 * blocked: 禁止されるファイルタイプ
 * description: フェーズの説明（日本語）
 */
const PHASE_RULES = {
  idle: {
    allowed: ['config', 'env'],
    blocked: ['code', 'test', 'spec', 'diagram'],
    description: 'idle フェーズではコード編集は許可されません。タスクを開始してください。',
    japaneseName: 'アイドル',
  },
  research: {
    allowed: ['spec'],
    blocked: ['code', 'test', 'diagram', 'config', 'env', 'other'],
    description: 'research フェーズでは調査結果（.md）のみ作成可能。コードは編集できません。',
    japaneseName: '調査',
  },
  requirements: {
    allowed: ['spec', 'config', 'env'],
    blocked: ['code', 'test', 'diagram'],
    description: '仕様書（.md）のみ編集可能。コードはまだ編集できません。',
    japaneseName: '要件定義',
  },
  threat_modeling: {
    allowed: ['spec', 'config', 'env'],
    blocked: ['code', 'test', 'diagram'],
    description: '脅威モデリング仕様（.md）のみ編集可能。コードは編集できません。',
    japaneseName: '脅威モデリング',
  },
  planning: {
    allowed: ['spec', 'config', 'env'],
    blocked: ['code', 'test', 'diagram'],
    description: '計画書（.md）のみ編集可能。コード編集はまだできません。',
    japaneseName: '計画',
  },
  architecture_review: {
    allowed: ['spec', 'config', 'env'],
    blocked: ['code', 'test', 'diagram'],
    description: 'アーキテクチャ設計書（.md）のみ編集可能。',
    japaneseName: 'アーキテクチャレビュー',
  },
  state_machine: {
    allowed: ['spec', 'diagram', 'config', 'env'],
    blocked: ['code', 'test'],
    description: '仕様書（.md）とステートマシン図（.mmd）のみ編集可能。',
    japaneseName: 'ステートマシン設計',
  },
  flowchart: {
    allowed: ['spec', 'diagram', 'config', 'env'],
    blocked: ['code', 'test'],
    description: '仕様書（.md）とフローチャート（.mmd）のみ編集可能。',
    japaneseName: 'フローチャート設計',
  },
  ui_design: {
    allowed: ['spec', 'diagram', 'config', 'env'],
    blocked: ['code', 'test'],
    description: 'UI設計書（.md）とUI図式（.mmd）のみ編集可能。',
    japaneseName: 'UI設計',
  },
  design_review: {
    allowed: ['spec', 'diagram', 'config', 'env'],
    blocked: ['code', 'test'],
    description: '設計レビュー段階。仕様書と図式の修正のみ可能。',
    japaneseName: '設計レビュー',
  },
  test_design: {
    allowed: ['spec', 'test', 'config', 'env'],
    blocked: ['code', 'diagram'],
    description: 'テスト設計フェーズ。テストコードと仕様書のみ編集可能。',
    japaneseName: 'テスト設計',
  },
  test_impl: {
    allowed: ['spec', 'test', 'config', 'env'],
    blocked: ['code', 'diagram'],
    description: 'テスト実装フェーズ（TDD Red）。テストコードのみ作成してください。',
    japaneseName: 'テスト実装（Red）',
    tddPhase: 'Red',
  },
  implementation: {
    allowed: ['code', 'spec', 'config', 'env'],
    blocked: ['test', 'diagram'],
    description: '実装フェーズ（TDD Green）。ソースコード編集可能。テストコードは編集不可。',
    japaneseName: '実装（Green）',
    tddPhase: 'Green',
  },
  refactoring: {
    allowed: ['code', 'spec', 'test', 'diagram', 'config', 'env', 'other'],
    blocked: [],
    description: 'リファクタリングフェーズ（TDD Refactor）。コード修正可能。',
    japaneseName: 'リファクタリング（Refactor）',
    tddPhase: 'Refactor',
  },
  build_check: {
    allowed: ['code', 'test', 'spec', 'config', 'env'],
    blocked: ['diagram'],
    description: 'ビルドチェック中。ビルドエラー修正のためのコード・テスト・仕様書・設定ファイルの編集が許可されます。',
    japaneseName: 'ビルドチェック',
  },
  code_review: {
    allowed: ['spec', 'config', 'env'],
    blocked: ['code', 'test', 'diagram'],
    description: 'コードレビュー中。仕様書の更新のみ可能。',
    japaneseName: 'コードレビュー',
  },
  testing: {
    readOnly: false,
    allowed: ['spec', 'test'],
    blocked: ['code', 'diagram', 'config', 'env', 'other'],
    description: 'テスト結果ドキュメントとテストファイルの編集が可能',
    japaneseName: 'テスト実行',
  },
  manual_test: {
    allowed: ['spec'],
    blocked: ['code', 'test', 'diagram', 'config', 'env', 'other'],
    description: '手動テスト中。仕様書（.md）のみ編集可能。',
    japaneseName: '手動テスト',
  },
  security_scan: {
    allowed: ['spec'],
    blocked: ['code', 'test', 'diagram', 'config', 'env', 'other'],
    description: 'セキュリティスキャン中。仕様書（.md）のみ編集可能。',
    japaneseName: 'セキュリティスキャン',
  },
  performance_test: {
    allowed: ['spec'],
    blocked: ['code', 'test', 'diagram', 'config', 'env', 'other'],
    description: 'パフォーマンステスト中。仕様書（.md）のみ編集可能。',
    japaneseName: 'パフォーマンステスト',
  },
  e2e_test: {
    allowed: ['spec', 'test'],
    blocked: ['code', 'diagram', 'config', 'env', 'other'],
    description: 'E2Eテスト中。仕様書とテストファイルの編集が可能。',
    japaneseName: 'E2Eテスト',
  },
  docs_update: {
    allowed: ['spec', 'config', 'env'],
    blocked: ['code', 'test', 'diagram'],
    description: 'ドキュメント更新フェーズ。仕様書のみ編集可能。',
    japaneseName: 'ドキュメント更新',
  },
  regression_test: {
    allowed: ['spec', 'test'],
    blocked: ['code', 'diagram', 'config', 'env', 'other'],
    description: 'リグレッションテスト中。テストファイルと仕様書の編集が可能。',
    japaneseName: 'リグレッションテスト',
  },
  ci_verification: {
    allowed: ['spec'],
    blocked: ['code', 'test', 'diagram', 'config', 'env', 'other'],
    description: 'CI検証中。仕様書のみ編集可能。',
    japaneseName: 'CI検証',
  },
  deploy: {
    allowed: ['spec'],
    blocked: ['code', 'test', 'diagram', 'config', 'env', 'other'],
    description: 'デプロイ中。仕様書のみ編集可能。',
    japaneseName: 'デプロイ',
  },
  commit: {
    allowed: [],
    blocked: ['code', 'test', 'spec', 'diagram', 'config', 'env', 'other'],
    description: 'コミット中。ファイル編集は禁止です。',
    japaneseName: 'コミット',
    readOnly: true,
  },
  push: {
    allowed: [],
    blocked: ['code', 'test', 'spec', 'diagram', 'config', 'env', 'other'],
    description: 'プッシュ中。ファイル編集は禁止です。',
    japaneseName: 'プッシュ',
    readOnly: true,
  },
  completed: {
    allowed: ['code', 'test', 'spec', 'diagram', 'config', 'env', 'other'],
    blocked: [],
    description: 'タスク完了。全ての編集が許可されます。',
    japaneseName: '完了',
  },
  // parallel_analysis, parallel_design, parallel_quality, parallel_verification are parent phases
  parallel_analysis: {
    allowed: ['spec', 'config', 'env'],
    blocked: ['code', 'test', 'diagram'],
    description: '並列分析フェーズ（threat_modeling + planning）',
    japaneseName: '並列分析',
  },
  parallel_design: {
    allowed: ['spec', 'diagram', 'config', 'env'],
    blocked: ['code', 'test'],
    description: '並列設計フェーズ（state_machine + flowchart + ui_design）',
    japaneseName: '並列設計',
  },
  parallel_quality: {
    allowed: ['code', 'spec', 'test', 'config', 'env'],
    blocked: [],
    description: '並列品質チェックフェーズ（build_check + code_review）',
    japaneseName: '並列品質',
  },
  parallel_verification: {
    allowed: ['spec', 'test'],
    blocked: ['code', 'diagram', 'config', 'env'],
    description: '並列検証フェーズ（manual_test + security_scan + performance_test + e2e_test）',
    japaneseName: '並列検証',
  },
};

/**
 * 並列フェーズとそのサブフェーズのマッピング
 */
const PARALLEL_PHASES = {
  parallel_design: ['state_machine', 'flowchart', 'ui_design'],
  parallel_analysis: ['threat_modeling', 'planning'],
  parallel_quality: ['build_check', 'code_review'],
  parallel_verification: ['manual_test', 'security_scan', 'performance_test', 'e2e_test'],
};

/**
 * フェーズごとの許可拡張子（enforce-workflow.js用）
 * N-4: JavaScript test extensions (.test.js, .spec.js, .test.jsx, .spec.jsx) added to support various test runners
 */
const TEST_EXTENSIONS = ['.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx', '.test.js', '.spec.js', '.test.jsx', '.spec.jsx'];

const PHASE_EXTENSIONS = {
  'research': ['.md', '.mdx', '.txt'],
  'requirements': ['.md', '.mdx', '.txt'],
  'parallel_analysis': ['.md', '.mdx', '.txt'],
  'threat_modeling': ['.md', '.mdx', '.txt'],
  'planning': ['.md', '.mdx', '.txt'],
  'parallel_design': ['.md', '.mdx', '.txt', '.mmd'],
  'state_machine': ['.md', '.mdx', '.txt', '.mmd'],
  'flowchart': ['.md', '.mdx', '.txt', '.mmd'],
  'ui_design': ['.md', '.mdx', '.txt', '.mmd'],
  'design_review': ['.md'],
  'test_design': ['.md', ...TEST_EXTENSIONS],
  'test_impl': [...TEST_EXTENSIONS, '.md'],
  'implementation': ['*'],
  'refactoring': ['*'],
  'parallel_quality': ['*'],
  'build_check': ['*'],
  'code_review': ['.md'],
  'testing': ['.md', ...TEST_EXTENSIONS],
  'regression_test': ['.md', ...TEST_EXTENSIONS],
  'parallel_verification': ['.md'],
  'manual_test': ['.md'],
  'security_scan': ['.md'],
  'performance_test': ['.md'],
  'e2e_test': ['.md', ...TEST_EXTENSIONS],
  'docs_update': ['.md', '.mdx'],
  'ci_verification': ['.md'],
  'commit': [],
  'push': [],
  'deploy': ['.md'],
  'completed': []
};

/**
 * フェーズ説明（enforce-workflow.js用）
 */
const PHASE_DESC = {
  'research': '調査フェーズ - 要件分析・既存コード調査',
  'requirements': '要件定義フェーズ',
  'parallel_analysis': '並列分析フェーズ',
  'threat_modeling': '脅威モデリングフェーズ',
  'planning': '設計フェーズ - 仕様書作成',
  'parallel_design': '並列設計フェーズ',
  'state_machine': 'ステートマシン図作成',
  'flowchart': 'フローチャート作成',
  'ui_design': 'UI設計フェーズ',
  'design_review': '設計レビューフェーズ',
  'test_design': 'テスト設計フェーズ',
  'test_impl': 'テスト実装フェーズ（TDD Red）',
  'implementation': '実装フェーズ（TDD Green）',
  'refactoring': 'リファクタリングフェーズ（TDD Refactor）',
  'parallel_quality': '並列品質チェックフェーズ',
  'build_check': 'ビルドチェックフェーズ',
  'code_review': 'コードレビューフェーズ',
  'testing': 'テスト実行フェーズ',
  'regression_test': 'リグレッションテストフェーズ',
  'parallel_verification': '並列検証フェーズ',
  'manual_test': '手動テストフェーズ',
  'security_scan': 'セキュリティスキャンフェーズ',
  'performance_test': 'パフォーマンステストフェーズ',
  'e2e_test': 'E2Eテストフェーズ',
  'docs_update': 'ドキュメント更新フェーズ',
  'commit': 'コミットフェーズ',
  'push': 'プッシュフェーズ',
  'ci_verification': 'CI検証フェーズ',
  'deploy': 'デプロイフェーズ',
  'completed': 'タスク完了'
};

module.exports = {
  PHASES,
  PHASE_RULES,
  PARALLEL_PHASES,
  PHASE_EXTENSIONS,
  PHASE_DESC,
  TEST_EXTENSIONS,
};
