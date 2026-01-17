#!/usr/bin/env node
/**
 * フェーズ別編集制限フック (PreToolUse)
 *
 * Edit/Write ツール使用時に、現在のワークフローフェーズに基づき、
 * 編集可能なファイルタイプのみを許可する。
 *
 * 設定可能な環境変数:
 * - SKIP_PHASE_GUARD: "true" でチェックを無効化
 * - DEBUG_PHASE_GUARD: "true" でデバッグログ出力
 *
 * @spec docs/specs/infrastructure/phase-edit-guard.md
 */

const HOOK_NAME = 'phase-edit-guard.js';
const ERROR_LOG = require('path').join(process.cwd(), '.claude-hook-errors.log');

// エラーをログファイルに書き出す
function logError(type, message, stack) {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] [${HOOK_NAME}] ${type}: ${message}\n${stack ? `  Stack: ${stack}\n` : ''}\n`;
  try {
    require('fs').appendFileSync(ERROR_LOG, entry);
  } catch (e) { /* ignore */ }
  console.error(`[${HOOK_NAME}] ${type}: ${message}`);
  if (stack) console.error(`  スタック: ${stack}`);
}

// グローバルエラーハンドラ
process.on('uncaughtException', (err) => {
  logError('未捕捉エラー', err.message, err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logError('未処理のPromise拒否', String(reason), null);
  process.exit(1);
});

const fs = require('fs');
const path = require('path');

// =============================================================================
// 定数定義
// =============================================================================

/** 状態ファイルのパス */
const GLOBAL_STATE_FILE = path.join(process.cwd(), '.claude-workflow-state.json');

/** ログファイルのパス */
const LOG_FILE = path.join(process.cwd(), '.claude-phase-guard-log.json');

/** 終了コード */
const EXIT_CODES = {
  SUCCESS: 0,    // 許可
  WARNING: 1,    // 警告（処理継続）
  BLOCK: 2,      // ブロック（処理中止）
};

/** 区切り線 */
const SEPARATOR_LINE = '='.repeat(60);

/** ソースコードの拡張子一覧 */
const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs'];

/** テストファイル判定パターン */
const TEST_FILE_PATTERNS = ['.test.', '.spec.', '__tests__', '/tests/'];

/** 環境変数ファイル判定の正規表現 */
const ENV_FILE_REGEX = /\.env(\.\w+)?$/;

// =============================================================================
// フェーズ別ルール定義
// =============================================================================

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
    allowed: [],
    blocked: ['code', 'test', 'spec', 'diagram', 'config', 'env', 'other'],
    description: 'research フェーズは読み取り専用です。ファイル編集はできません。',
    japaneseName: '調査',
    readOnly: true,
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
    allowed: [],
    blocked: ['code', 'test', 'spec', 'diagram', 'config', 'env', 'other'],
    description: 'ビルドチェック中。ファイル編集は禁止です。',
    japaneseName: 'ビルドチェック',
    readOnly: true,
  },
  code_review: {
    allowed: ['spec', 'config', 'env'],
    blocked: ['code', 'test', 'diagram'],
    description: 'コードレビュー中。仕様書の更新のみ可能。',
    japaneseName: 'コードレビュー',
  },
  testing: {
    allowed: [],
    blocked: ['code', 'test', 'spec', 'diagram', 'config', 'env', 'other'],
    description: 'テスト実行中。ファイル編集は禁止です。',
    japaneseName: 'テスト実行',
    readOnly: true,
  },
  manual_test: {
    allowed: [],
    blocked: ['code', 'test', 'spec', 'diagram', 'config', 'env', 'other'],
    description: '手動テスト中。ファイル編集は禁止です。',
    japaneseName: '手動テスト',
    readOnly: true,
  },
  security_scan: {
    allowed: [],
    blocked: ['code', 'test', 'spec', 'diagram', 'config', 'env', 'other'],
    description: 'セキュリティスキャン中。ファイル編集は禁止です。',
    japaneseName: 'セキュリティスキャン',
    readOnly: true,
  },
  docs_update: {
    allowed: ['spec', 'config', 'env'],
    blocked: ['code', 'test', 'diagram'],
    description: 'ドキュメント更新フェーズ。仕様書のみ編集可能。',
    japaneseName: 'ドキュメント更新',
  },
  commit: {
    allowed: [],
    blocked: ['code', 'test', 'spec', 'diagram', 'config', 'env', 'other'],
    description: 'コミット中。ファイル編集は禁止です。',
    japaneseName: 'コミット',
    readOnly: true,
  },
  completed: {
    allowed: ['code', 'test', 'spec', 'diagram', 'config', 'env', 'other'],
    blocked: [],
    description: 'タスク完了。全ての編集が許可されます。',
    japaneseName: '完了',
  },
};

/**
 * 並列フェーズ定義
 */
const PARALLEL_PHASES = {
  parallel_design: ['state_machine', 'flowchart', 'ui_design'],
  parallel_analysis: ['threat_modeling', 'planning'],
  parallel_quality: ['build_check', 'code_review'],
  parallel_verification: ['manual_test', 'security_scan'],
};

/**
 * ファイルタイプの日本語名
 */
const FILE_TYPE_NAMES = {
  code: 'ソースコード',
  test: 'テストコード',
  spec: '仕様書',
  diagram: '図式ファイル',
  config: '設定ファイル',
  env: '環境変数ファイル',
  other: 'その他',
};

/**
 * 常に編集を許可するファイルパターン
 */
const ALWAYS_ALLOWED_PATTERNS = [
  /workflow-state\.json$/i,
  /\.claude-workflow-state\.json$/i,
  /\.claude-.*\.json$/i, // Claude関連状態ファイル
];

/**
 * 設定ファイルパターン
 * ファイル名に含まれる文字列でマッチング
 */
const CONFIG_FILE_PATTERNS = [
  // パッケージマネージャ設定
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'pnpm-lock.yml',
  // TypeScript設定
  'tsconfig.json',
  'tsconfig.base.json',
  // Lint/Formatter設定
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.json',
  '.prettierrc',
  '.prettierrc.js',
  '.prettierrc.json',
  // ビルドツール設定
  'vite.config',
  'webpack.config',
  'jest.config',
  'vitest.config',
  // バージョン管理設定
  '.gitignore',
  '.gitattributes',
  // インフラ設定
  'serverless.yml',
  'docker-compose.yml',
  'Dockerfile',
];

/** 設定ファイルの拡張子（一般的な設定ファイル） */
const CONFIG_FILE_EXTENSIONS_REGEX = /\.(json|yaml|yml|toml)$/;

// =============================================================================
// ファイルタイプ判定
// =============================================================================

/**
 * ファイルパスを正規化（スラッシュ統一、小文字化）
 *
 * Windows/Unix 両方のパス形式に対応するため、
 * バックスラッシュをスラッシュに変換し、小文字に正規化する。
 *
 * @param {string} filePath - ファイルパス
 * @returns {string} 正規化されたパス（不正な入力の場合は空文字）
 */
function normalizePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return '';
  }
  return filePath.replace(/\\/g, '/').toLowerCase();
}

/**
 * ファイルがテストファイルかどうか判定
 *
 * 判定基準:
 * - ファイル名に .test. または .spec. を含む
 * - __tests__ ディレクトリ内のファイル
 * - tests/ ディレクトリ内のファイル
 *
 * @param {string} normalizedPath - 正規化済みファイルパス
 * @returns {boolean} テストファイルの場合 true
 */
function isTestFile(normalizedPath) {
  if (!normalizedPath) {
    return false;
  }
  return (
    TEST_FILE_PATTERNS.some((pattern) => normalizedPath.includes(pattern)) ||
    normalizedPath.startsWith('tests/')
  );
}

/**
 * ファイルが環境変数ファイルかどうか判定
 *
 * 判定基準:
 * - .env または .env.xxx 形式のファイル名
 *
 * @param {string} normalizedPath - 正規化済みファイルパス
 * @returns {boolean} 環境変数ファイルの場合 true
 */
function isEnvFile(normalizedPath) {
  if (!normalizedPath) {
    return false;
  }
  return ENV_FILE_REGEX.test(normalizedPath) || normalizedPath.endsWith('.env');
}

/**
 * ファイルが設定ファイルかどうか判定
 *
 * 判定基準:
 * - CONFIG_FILE_PATTERNS に含まれるファイル名
 * - .json/.yaml/.yml/.toml 拡張子（テストファイル除く）
 *
 * @param {string} filePath - ファイルパス
 * @returns {boolean} 設定ファイルの場合 true
 */
function isConfigFile(filePath) {
  const normalized = normalizePath(filePath);

  // 設定ファイルパターンにマッチ
  const isPatternMatch = CONFIG_FILE_PATTERNS.some((pattern) =>
    normalized.includes(pattern.toLowerCase())
  );
  if (isPatternMatch) {
    return true;
  }

  // 一般的な設定ファイル拡張子（テストファイルは除外）
  if (CONFIG_FILE_EXTENSIONS_REGEX.test(normalized)) {
    return !isTestFile(normalized);
  }

  return false;
}

/**
 * ファイルが常に許可されるファイルかどうか判定
 *
 * ワークフロー状態ファイルなど、フェーズに関係なく編集を許可するファイル
 *
 * @param {string} filePath - ファイルパス
 * @returns {boolean} 常に許可される場合 true
 */
function isAlwaysAllowed(filePath) {
  const normalized = normalizePath(filePath);
  return ALWAYS_ALLOWED_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * ファイルがソースコードかどうか判定
 *
 * @param {string} normalizedPath - 正規化済みファイルパス
 * @returns {boolean} ソースコードの場合 true
 */
function isSourceCodeFile(normalizedPath) {
  return CODE_EXTENSIONS.some((ext) => normalizedPath.endsWith(ext));
}

/**
 * ファイルタイプを判定
 *
 * 判定優先順位:
 * 1. テストファイル（最優先）
 * 2. 図式ファイル (.mmd)
 * 3. 仕様書 (.md)
 * 4. ソースコード（設定ファイルを除く）
 * 5. 設定ファイル
 * 6. 環境変数ファイル
 * 7. その他
 *
 * @param {string} filePath - ファイルパス
 * @returns {'code' | 'test' | 'spec' | 'diagram' | 'config' | 'env' | 'other'}
 */
function getFileType(filePath) {
  const normalized = normalizePath(filePath);

  // 空パスはその他として処理
  if (!normalized) {
    return 'other';
  }

  // 1. テストファイル判定（最優先）
  if (isTestFile(normalized)) {
    return 'test';
  }

  // 2. 図式ファイル
  if (normalized.endsWith('.mmd')) {
    return 'diagram';
  }

  // 3. 仕様書（Markdown）
  if (normalized.endsWith('.md')) {
    return 'spec';
  }

  // 4. ソースコード（設定ファイルは除外して config として返す）
  if (isSourceCodeFile(normalized)) {
    return isConfigFile(filePath) ? 'config' : 'code';
  }

  // 5. 設定ファイル
  if (isConfigFile(filePath)) {
    return 'config';
  }

  // 6. 環境変数ファイル
  if (isEnvFile(normalized)) {
    return 'env';
  }

  // 7. その他
  return 'other';
}

// =============================================================================
// ワークフロー状態取得
// =============================================================================

/**
 * JSONファイルを安全に読み込む
 *
 * ファイルが存在しない場合やパースエラー時は null を返す
 *
 * @param {string} filePath - ファイルパス
 * @param {string} logLabel - デバッグログ用のラベル
 * @returns {object|null} パースされたJSONオブジェクト、または null
 */
function safeReadJsonFile(filePath, logLabel) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    debugLog(`${logLabel} 読み込みエラー:`, e.message);
    return null;
  }
}

/**
 * グローバルワークフロー状態を読み込む
 *
 * .claude-workflow-state.json からワークフロー全体の状態を取得する
 *
 * @returns {object|null} グローバル状態オブジェクト、または null
 */
function loadGlobalState() {
  return safeReadJsonFile(GLOBAL_STATE_FILE, 'グローバル状態ファイル');
}

/**
 * アクティブなワークフロータスクを取得
 *
 * 複数のタスクがある場合、完了していない最新のタスクを返す
 *
 * @returns {{taskId: string, taskName: string, workflowDir: string, phase: string}|null}
 */
function findActiveWorkflowTask() {
  const globalState = loadGlobalState();

  // 状態ファイルが存在しない、またはタスクがない場合
  if (!globalState?.activeTasks?.length) {
    return null;
  }

  // 完了していないタスクをフィルタリング
  const activeTasks = globalState.activeTasks.filter((t) => t.phase !== 'completed');

  // 最新のアクティブタスクを返す（配列の先頭が最新）
  return activeTasks[0] || null;
}

/**
 * タスクのワークフロー状態を読み込む
 *
 * 各タスクディレクトリ内の workflow-state.json を読み込む
 *
 * @param {string} workflowDir - ワークフローディレクトリパス
 * @returns {object|null} タスク状態オブジェクト、または null
 */
function loadTaskWorkflowState(workflowDir) {
  const statePath = path.join(workflowDir, 'workflow-state.json');
  return safeReadJsonFile(statePath, 'タスク状態ファイル');
}

/**
 * アクティブなワークフロー状態を取得
 *
 * 現在進行中のタスクのフェーズとワークフロー状態をまとめて返す
 *
 * @returns {{phase: string, workflowState: object, taskInfo: object}|null}
 */
function findActiveWorkflowState() {
  const taskInfo = findActiveWorkflowTask();

  if (!taskInfo) {
    return null;
  }

  const workflowState = loadTaskWorkflowState(taskInfo.workflowDir);

  return {
    phase: taskInfo.phase,
    workflowState,
    taskInfo,
  };
}

// =============================================================================
// フェーズ別編集許可判定
// =============================================================================

/** 全ファイルタイプを許可するルール（未知のフェーズ用） */
const ALL_ALLOWED_RULE = {
  allowed: ['code', 'test', 'spec', 'diagram', 'config', 'env', 'other'],
  blocked: [],
};

/**
 * 並列フェーズのサブフェーズルールを合算
 *
 * 複数のサブフェーズのルールを統合し、より寛容なルールを生成する。
 * allowed に含まれるファイルタイプは blocked から除外される。
 *
 * @param {string[]} subPhases - サブフェーズ配列
 * @returns {object} 合算されたルール
 */
function combineSubPhaseRules(subPhases) {
  const combinedAllowed = new Set();
  const combinedBlocked = new Set();

  for (const subPhase of subPhases) {
    const rule = PHASE_RULES[subPhase];
    if (rule) {
      rule.allowed.forEach((t) => combinedAllowed.add(t));
      rule.blocked.forEach((t) => combinedBlocked.add(t));
    }
  }

  // allowed に含まれるものは blocked から除外（寛容側に倒す）
  combinedAllowed.forEach((t) => combinedBlocked.delete(t));

  return {
    allowed: [...combinedAllowed],
    blocked: [...combinedBlocked],
  };
}

/**
 * 並列フェーズを処理
 *
 * 並列フェーズ（parallel_design など）では、複数のサブフェーズが並行して実行される。
 * アクティブなサブフェーズが特定できれば、そのルールを適用する。
 * 特定できない場合は、全サブフェーズのルールを合算した寛容なルールを適用する。
 *
 * @param {string} parallelPhase - 並列フェーズ名
 * @param {object} workflowState - ワークフロー状態
 * @returns {object} フェーズルール
 */
function handleParallelPhase(parallelPhase, workflowState) {
  const subPhases = PARALLEL_PHASES[parallelPhase];

  // 未知の並列フェーズは全て許可（安全側）
  if (!subPhases) {
    return ALL_ALLOWED_RULE;
  }

  // アクティブなサブフェーズを特定
  const activeSubPhase = identifyActiveSubPhase(workflowState, subPhases);

  // サブフェーズが特定できればそのルールを適用
  if (activeSubPhase && PHASE_RULES[activeSubPhase]) {
    return PHASE_RULES[activeSubPhase];
  }

  // サブフェーズ不明の場合は合算ルールを適用
  const combinedRule = combineSubPhaseRules(subPhases);
  return {
    ...combinedRule,
    description: '並列フェーズ実行中。共通ルールを適用。',
    japaneseName: parallelPhase,
  };
}

/**
 * アクティブなサブフェーズを特定
 *
 * 以下の優先順位で判定:
 * 1. subPhaseUpdates から最後に更新されたサブフェーズ
 * 2. subPhases から in_progress のサブフェーズ
 *
 * @param {object} workflowState - ワークフロー状態
 * @param {string[]} subPhases - サブフェーズ配列
 * @returns {string|null} アクティブなサブフェーズ名、または null
 */
function identifyActiveSubPhase(workflowState, subPhases) {
  if (!workflowState) {
    return null;
  }

  // 1. subPhaseUpdates から最後に更新されたサブフェーズを取得
  if (workflowState.subPhaseUpdates) {
    const updates = Object.entries(workflowState.subPhaseUpdates)
      .filter(([phase]) => subPhases.includes(phase))
      .sort((a, b) => new Date(b[1]) - new Date(a[1]));

    if (updates.length > 0) {
      return updates[0][0];
    }
  }

  // 2. subPhases から in_progress のものを探す
  if (workflowState.subPhases) {
    const inProgressPhase = subPhases.find(
      (subPhase) => workflowState.subPhases[subPhase] === 'in_progress'
    );
    if (inProgressPhase) {
      return inProgressPhase;
    }
  }

  return null;
}

/**
 * 指定フェーズでファイルタイプの編集が許可されるか判定
 *
 * 判定ロジック:
 * 1. フェーズが不明な場合は許可（安全側）
 * 2. allowed に含まれていれば許可
 * 3. blocked に含まれていれば禁止
 * 4. どちらにも含まれない場合は許可（安全側）
 *
 * @param {string} phase - フェーズ名
 * @param {string} fileType - ファイルタイプ
 * @returns {boolean} 編集が許可される場合 true
 */
function canEditInPhase(phase, fileType) {
  // null/undefined/空文字フェーズは許可（安全側）
  if (!phase) {
    return true;
  }

  // 未知のフェーズは許可（安全側）
  const isKnownPhase = PHASE_RULES[phase] || PARALLEL_PHASES[phase];
  if (!isKnownPhase) {
    return true;
  }

  // フェーズルールを取得
  const rule = PARALLEL_PHASES[phase]
    ? handleParallelPhase(phase, null)
    : PHASE_RULES[phase];

  // allowed/blocked チェック
  if (rule.allowed.includes(fileType)) {
    return true;
  }
  if (rule.blocked.includes(fileType)) {
    return false;
  }

  // どちらにも含まれない場合は許可（安全側）
  return true;
}

// =============================================================================
// ブロックメッセージ表示
// =============================================================================

/** ファイルタイプごとの例示 */
const FILE_TYPE_EXAMPLES = {
  code: '*.ts, *.tsx, *.js, *.jsx',
  test: '*.test.ts, *.spec.ts, __tests__/',
  spec: '*.md',
  diagram: '*.mmd',
  config: 'package.json, tsconfig.json, *.yaml',
  env: '.env, .env.local, .env.*',
  other: 'その他のファイル',
};

/**
 * ファイルタイプの例を取得
 *
 * @param {string} fileType - ファイルタイプ
 * @returns {string} 例示文字列
 */
function getFileTypeExamples(fileType) {
  return FILE_TYPE_EXAMPLES[fileType] || fileType;
}

/**
 * TDD サイクルの説明を表示
 *
 * @param {string} currentTddPhase - 現在のTDDフェーズ（Red/Green/Refactor）
 */
function displayTddCycleInfo(currentTddPhase) {
  const tddPhases = [
    { phase: 'Red', name: 'test_impl', description: 'テストコードを書く' },
    { phase: 'Green', name: 'implementation', description: 'テストを通す実装を書く' },
    { phase: 'Refactor', name: 'refactoring', description: 'コード品質を改善' },
  ];

  console.log(' TDD サイクル:');
  tddPhases.forEach((item, index) => {
    const marker = item.phase === currentTddPhase ? ' ← 現在地' : '';
    console.log(`   ${index + 1}. ${item.phase} フェーズ（${item.name}）: ${item.description}${marker}`);
  });
  console.log('');
}

/**
 * 許可されるファイル一覧を表示
 *
 * @param {string[]} allowedTypes - 許可されるファイルタイプの配列
 */
function displayAllowedFiles(allowedTypes) {
  console.log(' 許可されるファイル:');
  if (allowedTypes.length === 0) {
    console.log('   - なし（読み取り専用）');
  } else {
    for (const type of allowedTypes) {
      const typeName = FILE_TYPE_NAMES[type] || type;
      const examples = getFileTypeExamples(type);
      console.log(`   - ${typeName}: ${examples}`);
    }
  }
  console.log('');
}

/**
 * 次のステップを表示
 *
 * @param {object} rule - フェーズルール
 */
function displayNextSteps(rule) {
  console.log(' 次のステップ:');

  if (rule.readOnly) {
    console.log('   1. このフェーズの作業を完了してください');
    console.log('   2. /workflow next で次フェーズへ進んでください');
  } else if (rule.tddPhase === 'Red') {
    console.log('   1. テストコード（.test.ts, .spec.ts）を作成してください');
    console.log('   2. テスト作成が完了したら /workflow next で次フェーズへ');
  } else if (rule.tddPhase === 'Green') {
    console.log('   1. ソースコードを実装してテストをパスさせてください');
    console.log('   2. 実装完了後 /workflow next で次フェーズへ');
  } else {
    console.log('   1. 許可されたファイルを編集してください');
    console.log('   2. 作業完了後 /workflow next で次フェーズへ');
  }
  console.log('');
}

/**
 * ブロックメッセージを表示
 *
 * フェーズ別編集制限違反時に、わかりやすいエラーメッセージを表示する。
 * TDDフェーズの場合はサイクルの説明も含める。
 *
 * @param {string} phase - フェーズ名
 * @param {string} filePath - ファイルパス
 * @param {string} fileType - ファイルタイプ
 * @param {object} rule - フェーズルール
 */
function displayBlockMessage(phase, filePath, fileType, rule) {
  // ヘッダー
  console.log('');
  console.log(SEPARATOR_LINE);
  console.log(' フェーズ別編集制限違反');
  console.log(SEPARATOR_LINE);
  console.log('');

  // 基本情報
  console.log(` フェーズ: ${phase}（${rule.japaneseName || phase}）`);
  console.log(` ファイル: ${filePath}`);
  console.log(` ファイルタイプ: ${fileType}（${FILE_TYPE_NAMES[fileType] || fileType}）`);
  console.log('');
  console.log(` 理由: ${rule.description}`);
  console.log('');

  // TDD サイクル説明（該当する場合）
  if (rule.tddPhase) {
    displayTddCycleInfo(rule.tddPhase);
  }

  // 読み取り専用フェーズの強調
  if (rule.readOnly) {
    console.log(' 注意: このフェーズは読み取り専用です。');
    console.log('');
  }

  // 許可されるファイル一覧
  displayAllowedFiles(rule.allowed);

  // 次のステップ
  displayNextSteps(rule);

  // スキップ方法
  console.log(' スキップ（緊急時のみ）:');
  console.log('   SKIP_PHASE_GUARD=true を設定');
  console.log('');
  console.log(SEPARATOR_LINE);
}

// =============================================================================
// ログ機能
// =============================================================================

/** ログファイルに保持するエントリ数の上限 */
const MAX_LOG_ENTRIES = 100;

/**
 * デバッグログ出力
 *
 * DEBUG_PHASE_GUARD=true の場合のみログを出力する。
 * デバッグ時の問題調査に使用。
 *
 * @param  {...any} args - ログ引数
 */
function debugLog(...args) {
  if (process.env.DEBUG_PHASE_GUARD === 'true') {
    console.log('[phase-edit-guard]', ...args);
  }
}

/**
 * ログファイルを読み込む
 *
 * ファイルが存在しない場合やエラー時は空配列を返す。
 *
 * @returns {Array} ログエントリの配列
 */
function loadLogs() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    }
  } catch {
    // ログ読み込みエラーは無視（本処理に影響しないため）
  }
  return [];
}

/**
 * ログファイルを保存
 *
 * ログエントリが上限を超える場合は古いものを削除する。
 * 書き込みエラーは無視する（本処理に影響しないため）。
 *
 * @param {Array} logs - ログエントリ配列
 */
function saveLogs(logs) {
  try {
    const trimmedLogs = logs.length > MAX_LOG_ENTRIES
      ? logs.slice(-MAX_LOG_ENTRIES)
      : logs;
    fs.writeFileSync(LOG_FILE, JSON.stringify(trimmedLogs, null, 2), 'utf8');
  } catch {
    // ログ書き込みエラーは無視（本処理に影響しないため）
  }
}

/**
 * チェック結果をログに記録
 *
 * 全てのチェック結果（許可・ブロック・スキップ）を記録し、
 * 後から問題を調査できるようにする。
 *
 * @param {object} entry - ログエントリ
 */
function logCheck(entry) {
  const logs = loadLogs();
  logs.push({
    timestamp: new Date().toISOString(),
    ...entry,
  });
  saveLogs(logs);
}

// =============================================================================
// メイン処理
// =============================================================================

/**
 * チェック対象のツールかどうか判定
 *
 * Edit/Write ツールのみチェック対象とする。
 *
 * @param {string} toolName - ツール名
 * @returns {boolean} チェック対象の場合 true
 */
function isTargetTool(toolName) {
  return toolName === 'Edit' || toolName === 'Write';
}

/**
 * 設定ファイル・環境変数ファイルかどうか判定
 *
 * これらは全フェーズで編集が許可される。
 *
 * @param {string} fileType - ファイルタイプ
 * @returns {boolean} 設定/環境変数ファイルの場合 true
 */
function isAlwaysEditableType(fileType) {
  return fileType === 'config' || fileType === 'env';
}

/**
 * 現在のフェーズのルールを取得
 *
 * @param {string} phase - フェーズ名
 * @param {object} workflowState - ワークフロー状態
 * @returns {object|null} フェーズルール、または null（未知のフェーズ）
 */
function getPhaseRule(phase, workflowState) {
  if (PARALLEL_PHASES[phase]) {
    return handleParallelPhase(phase, workflowState);
  }
  return PHASE_RULES[phase] || null;
}

/**
 * メイン処理
 *
 * PreToolUse フックとして呼び出され、Edit/Write ツールの使用を
 * ワークフローフェーズに基づいて許可またはブロックする。
 *
 * @param {object} input - 標準入力から受け取ったJSON
 */
function main(input) {
  try {
    // 入力の検証
    if (!input || typeof input !== 'object') {
      process.exit(EXIT_CODES.SUCCESS);
    }

    // 1. スキップフラグのチェック
    if (process.env.SKIP_PHASE_GUARD === 'true') {
      debugLog('SKIP_PHASE_GUARD=true によりスキップ');
      logCheck({ skipped: true, reason: 'SKIP_PHASE_GUARD=true' });
      process.exit(EXIT_CODES.SUCCESS);
    }

    const toolName = input.tool_name;
    const toolInput = input.tool_input || {};

  // 2. Edit/Write ツール以外は許可
  if (!isTargetTool(toolName)) {
    process.exit(EXIT_CODES.SUCCESS);
  }

  const filePath = toolInput.file_path || '';

  // 3. ファイルパスがない場合は許可
  if (!filePath) {
    process.exit(EXIT_CODES.SUCCESS);
  }

  debugLog('チェック対象:', filePath);

  // 4. 常に許可されるファイル（ワークフロー状態ファイルなど）
  if (isAlwaysAllowed(filePath)) {
    debugLog('常に許可されるファイル:', filePath);
    process.exit(EXIT_CODES.SUCCESS);
  }

  // 5. ワークフロー状態を取得
  const workflowState = findActiveWorkflowState();

  // ワークフロー未開始の場合は許可
  if (!workflowState) {
    debugLog('ワークフロー未開始：許可');
    process.exit(EXIT_CODES.SUCCESS);
  }

  const phase = workflowState.phase;
  debugLog('現在のフェーズ:', phase);

  // 6. ファイルタイプを判定
  const fileType = getFileType(filePath);
  debugLog('ファイルタイプ:', fileType);

  // 7. 設定ファイル・環境変数ファイルは全フェーズで許可
  if (isAlwaysEditableType(fileType)) {
    debugLog('設定ファイル/環境変数ファイル：許可');
    process.exit(EXIT_CODES.SUCCESS);
  }

  // 8. フェーズルールを取得
  const rule = getPhaseRule(phase, workflowState.workflowState);

  // 未知のフェーズは許可
  if (!rule) {
    debugLog('未知のフェーズ：許可');
    process.exit(EXIT_CODES.SUCCESS);
  }

  // 9. 編集許可チェック
  if (canEditInPhase(phase, fileType)) {
    debugLog('編集許可');
    logCheck({
      allowed: true,
      phase,
      filePath,
      fileType,
    });
    process.exit(EXIT_CODES.SUCCESS);
  }

    // 10. ブロック
    displayBlockMessage(phase, filePath, fileType, rule);
    logCheck({
      blocked: true,
      phase,
      filePath,
      fileType,
      reason: rule.description,
    });
    process.exit(EXIT_CODES.BLOCK);
  } catch (e) {
    // エラー時は許可（安全側に倒す）
    debugLog('エラー発生:', e.message);
    process.exit(EXIT_CODES.SUCCESS);
  }
}

// =============================================================================
// モジュールエクスポート（テスト用）
// =============================================================================

if (require.main === module) {
  // タイムアウト処理（3秒）
  const timeout = setTimeout(() => {
    process.exit(0);
  }, 3000);

  // 非同期stdin読み取り
  let inputData = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => (inputData += chunk));
  process.stdin.on('error', () => {
    clearTimeout(timeout);
    process.exit(0);
  });
  process.stdin.on('end', () => {
    clearTimeout(timeout);
    try {
      const input = JSON.parse(inputData);
      main(input);
    } catch (e) {
      // stdin からの入力エラー時は許可（安全側）
      debugLog('stdin読み込みエラー：許可');
      process.exit(EXIT_CODES.SUCCESS);
    }
  });
} else {
  // テストから使用される場合
  module.exports = {
    getFileType,
    isConfigFile,
    isAlwaysAllowed,
    canEditInPhase,
    handleParallelPhase,
    identifyActiveSubPhase,
    findActiveWorkflowState,
    displayBlockMessage,
    normalizePath,
    PHASE_RULES,
    PARALLEL_PHASES,
    FILE_TYPE_NAMES,
    EXIT_CODES,
  };
}
