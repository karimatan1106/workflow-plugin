#!/usr/bin/env node
/**
 * フェーズ別編集制限フック (PreToolUse)
 *
 * Edit/Write ツール使用時に、現在のワークフローフェーズに基づき、
 * 編集可能なファイルタイプのみを許可する。
 *
 * 設定可能な環境変数:
 * - DEBUG_PHASE_GUARD: "true" でデバッグログ出力
 *
 * @spec docs/spec/features/phase-edit-guard.md
 */

const HOOK_NAME = 'phase-edit-guard.js';
const ERROR_LOG = require('path').join(process.cwd(), '.claude-hook-errors.log');

/**
 * エラーをログファイルに書き出す（書き込み失敗時は無視）
 * @param {string} type - エラータイプ
 * @param {string} message - メッセージ
 * @param {string|null} stack - スタックトレース
 */
function logError(type, message, stack) {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] [${HOOK_NAME}] ${type}: ${message}\n${stack ? `  Stack: ${stack}\n` : ''}\n`;
  try {
    require('fs').appendFileSync(ERROR_LOG, entry);
  } catch (e) {
    // ログ書き込み失敗は無視（本処理に影響しないため）
  }
  console.error(`[${HOOK_NAME}] ${type}: ${message}`);
  if (stack) console.error(`  スタック: ${stack}`);
}

// グローバルエラーハンドラ（REQ-3: Fail Closed）
process.on('uncaughtException', (err) => {
  logError('未捕捉エラー', err.message, err.stack);
  process.exit(2);
});

process.on('unhandledRejection', (reason) => {
  logError('未処理のPromise拒否', String(reason), null);
  process.exit(2);
});

const fs = require('fs');
const path = require('path');
const { checkBashWhitelist } = require('./bash-whitelist');
const { verifyHMAC } = require('./hmac-verify');


// REQ-5: タスク探索ロジック統一 - discover-tasks.jsのshared実装を使用
const { discoverTasks: sharedDiscoverTasks, findTaskByFilePath: sharedFindTaskByFilePath } = require('./lib/discover-tasks');

// =============================================================================
// 定数定義
// =============================================================================

/** ワークフローディレクトリのパス */
const STATE_DIR = process.env.STATE_DIR || path.join(process.cwd(), '.claude', 'state');
const WORKFLOW_DIR = process.env.WORKFLOW_DIR || path.join(STATE_DIR, 'workflows');

/** ドキュメントディレクトリのパス */
const DOCS_DIR = process.env.DOCS_DIR || path.join(process.cwd(), 'docs', 'workflows');

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
};

/**
 * 並列フェーズ定義
 */
const PARALLEL_PHASES = {
  parallel_design: ['state_machine', 'flowchart', 'ui_design'],
  parallel_analysis: ['threat_modeling', 'planning'],
  parallel_quality: ['build_check', 'code_review'],
  parallel_verification: ['manual_test', 'security_scan', 'performance_test', 'e2e_test'],
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
 * フェーズ順序定義（ファイルタイプが許可される最初のフェーズを見つけるため）
 */
const PHASE_ORDER = [
  'research',
  'requirements',
  'threat_modeling',
  'planning',
  'state_machine',
  'flowchart',
  'ui_design',
  'design_review',
  'test_design',
  'test_impl',
  'implementation',
  'refactoring',
  'build_check',
  'code_review',
  'testing',
  'manual_test',
  'security_scan',
  'docs_update',
  'commit',
  'completed',
];

/**
 * ファイルタイプごとに編集可能になる推奨フェーズ
 *
 * 各ファイルタイプが最初に編集可能になるフェーズを定義。
 * ブロック時に「このフェーズへ進むと編集できます」という案内に使用。
 */
const FILE_TYPE_TARGET_PHASES = {
  code: 'implementation',
  test: 'test_impl',
  spec: 'requirements',
  diagram: 'state_machine',
  config: 'requirements',
  env: 'requirements',
  other: 'refactoring',
};

/**
 * 現在のフェーズからファイルタイプが編集可能になる次のフェーズを見つける
 *
 * @param {string} currentPhase - 現在のフェーズ名
 * @param {string} fileType - ファイルタイプ (code, test, spec, diagram など)
 * @returns {object|null} { phase: フェーズ名, japaneseName: 日本語名 } または null
 */
function findNextPhaseForFileType(currentPhase, fileType) {
  const currentIndex = PHASE_ORDER.indexOf(currentPhase);
  if (currentIndex === -1) {
    // 不明なフェーズの場合は推奨フェーズを返す
    const targetPhase = FILE_TYPE_TARGET_PHASES[fileType];
    if (targetPhase && PHASE_RULES[targetPhase]) {
      return {
        phase: targetPhase,
        japaneseName: PHASE_RULES[targetPhase].japaneseName || targetPhase,
      };
    }
    return null;
  }

  // 現在のフェーズより後のフェーズを順番にチェック
  for (let i = currentIndex + 1; i < PHASE_ORDER.length; i++) {
    const phase = PHASE_ORDER[i];
    const rule = PHASE_RULES[phase];
    if (rule && rule.allowed && rule.allowed.includes(fileType)) {
      return {
        phase,
        japaneseName: rule.japaneseName || phase,
      };
    }
  }

  // 見つからない場合はファイルタイプの推奨フェーズを返す（現在のフェーズより後であれば）
  const targetPhase = FILE_TYPE_TARGET_PHASES[fileType];
  if (targetPhase) {
    const targetIndex = PHASE_ORDER.indexOf(targetPhase);
    if (targetIndex > currentIndex && PHASE_RULES[targetPhase]) {
      return {
        phase: targetPhase,
        japaneseName: PHASE_RULES[targetPhase].japaneseName || targetPhase,
      };
    }
  }

  return null;
}

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
 * @returns {string} 正規化されたパス
 *                   不正な入力（null/undefined/非文字列）の場合は空文字を返す
 */
function normalizePath(filePath) {
  if (typeof filePath !== 'string' || !filePath) {
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
 * エラーはdebugLogで出力し、本処理には影響しない。
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
    return null;  // エラーは無視し、呼び出し元は null 処理を用意
  }
}

/**
 * ディレクトリスキャンでアクティブタスクを発見
 *
 * .claude/state/workflows/ 配下のディレクトリをスキャンし、
 * 完了していないタスクの配列を返す。
 *
 * @returns {Array<{taskId: string, taskName: string, workflowDir: string, phase: string, docsDir?: string}>}
 */
/**
 * ディレクトリスキャンでアクティブタスクを発見
 *
 * 注意: このロジックは mcp-server/src/state/manager.ts の
 * WorkflowStateManager.discoverTasksUnified() と同期を保つ必要がある。
 */
// REQ-5: Shared実装にデリゲート（インライン実装はフォールバック用に保持）
function discoverTasksUnified() {
  try {
    return sharedDiscoverTasks();
  } catch (e) {
    // フォールバック: インライン実装を使用
    return discoverTasksInline();
  }
}

function discoverTasksInline() {
  if (!fs.existsSync(WORKFLOW_DIR)) {
    return [];
  }

  try {
    const entries = fs.readdirSync(WORKFLOW_DIR);
    const tasks = [];

    for (const entry of entries) {
      const entryPath = path.join(WORKFLOW_DIR, entry);
      try {
        const stat = fs.statSync(entryPath);
        if (!stat.isDirectory()) {
          continue;
        }

        const stateFile = path.join(entryPath, 'workflow-state.json');
        const taskState = safeReadJsonFile(stateFile, `タスク状態(${entry})`);
        if (taskState && taskState.phase !== 'completed') {
          // ★★★ FR-2: HMAC署名検証 ★★★
          if (!verifyHMAC(taskState)) {
            debugLog(`[HMAC] タスク ${taskState.taskId} の署名検証失敗 - スキップ`);
            continue;
          }
          tasks.push(taskState);
        }
      } catch {
        // 個別のエントリでエラーが発生した場合はスキップ
        continue;
      }
    }

    return tasks;
  } catch {
    return [];
  }
}

/**
 * ファイルパスからタスクを推論
 *
 * 指定されたファイルパスがどのタスクに属するかを推論する。
 *
 * 注意: このロジックは mcp-server/src/state/manager.ts の
 * WorkflowStateManager.findTaskByFilePathUnified() と同期を保つ必要がある。
 * docsDirまたはworkflowDirのプレフィックスマッチで判定し、
 * 複数マッチする場合は最長一致のタスクを返す。
 *
 * @param {string} filePath 推論対象のファイルパス
 * @returns {{taskId: string, taskName: string, workflowDir: string, phase: string}|null}
 */
// REQ-5: Shared実装にデリゲート
function findTaskByFilePathUnified(filePath) {
  try {
    return sharedFindTaskByFilePath(filePath);
  } catch (e) {
    return findTaskByFilePathInline(filePath);
  }
}

function findTaskByFilePathInline(filePath) {
  const tasks = discoverTasksUnified();
  let bestMatch = null;
  let bestMatchLength = 0;

  // パスを正規化（バックスラッシュをスラッシュに統一）
  const normalizedFilePath = filePath.replace(/\\/g, '/');

  // プロジェクトルートからの相対パスを取得
  const cwd = process.cwd().replace(/\\/g, '/');
  const cwdPrefix = cwd.endsWith('/') ? cwd : cwd + '/';
  const relativeFilePath = normalizedFilePath.startsWith(cwdPrefix)
    ? normalizedFilePath.substring(cwdPrefix.length)
    : normalizedFilePath;

  for (const task of tasks) {
    // docsDirチェック（最長一致）
    if (task.docsDir) {
      const normalizedDocsDir = task.docsDir.replace(/\\/g, '/');
      if (normalizedFilePath.startsWith(normalizedDocsDir)) {
        if (normalizedDocsDir.length > bestMatchLength) {
          bestMatch = task;
          bestMatchLength = normalizedDocsDir.length;
        }
      }
    }

    // workflowDirチェック（最長一致）
    const normalizedWorkflowDir = task.workflowDir.replace(/\\/g, '/');
    if (normalizedFilePath.startsWith(normalizedWorkflowDir)) {
      if (normalizedWorkflowDir.length > bestMatchLength) {
        bestMatch = task;
        bestMatchLength = normalizedWorkflowDir.length;
      }
    }

    // scopeチェック（影響範囲に基づくタスクマッチング）
    if (task.scope) {
      // affectedFilesの完全一致チェック
      if (task.scope.affectedFiles) {
        for (const af of task.scope.affectedFiles) {
          const normalizedAf = af.replace(/\\/g, '/');
          if (relativeFilePath === normalizedAf || normalizedFilePath.endsWith('/' + normalizedAf)) {
            return task; // 完全一致は最高優先度
          }
        }
      }
      // affectedDirsのプレフィックスチェック
      if (task.scope.affectedDirs) {
        for (const ad of task.scope.affectedDirs) {
          const normalizedAd = ad.replace(/\\/g, '/');
          const dirPrefix = normalizedAd.endsWith('/') ? normalizedAd : normalizedAd + '/';
          if (relativeFilePath.startsWith(dirPrefix) || normalizedFilePath.endsWith('/' + dirPrefix.slice(0, -1) + '/' + relativeFilePath.split('/').pop())) {
            if (dirPrefix.length > bestMatchLength) {
              bestMatch = task;
              bestMatchLength = dirPrefix.length;
            }
          }
        }
      }
    }
  }

  return bestMatch;
}

/**
 * アクティブなワークフロータスクを取得
 *
 * ファイルパスが指定されている場合は、そのファイルに関連するタスクを返す。
 * ファイルパスがタスクに関連付けられていない場合は、最初のアクティブタスクを返す。
 *
 * @param {string} [filePath] チェック対象のファイルパス（オプション）
 * @returns {{taskId: string, taskName: string, workflowDir: string, phase: string}|null}
 */
function findActiveWorkflowTask(filePath) {
  // ファイルパスが指定されている場合は、そのファイルに関連するタスクを推論
  if (filePath) {
    const matchedTask = findTaskByFilePathUnified(filePath);
    if (matchedTask) {
      return matchedTask;
    }
  }

  // ファイルパスからタスクを特定できない場合は、最初のアクティブタスクを返す
  const tasks = discoverTasksUnified();
  return tasks[0] || null;
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
 * 現在進行中のタスクのフェーズとワークフロー状態をまとめて返す。
 *
 * ファイルパスが指定されている場合は、そのファイルに関連するタスクを優先する。
 *
 * @param {string} [filePath] チェック対象のファイルパス（オプション）
 *
 * @returns {{phase: string, workflowState: object, taskInfo: object}|null}
 */
function findActiveWorkflowState(filePath) {
  const taskInfo = findActiveWorkflowTask(filePath);

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
 * 判定ロジック (REQ-1: fail-closed):
 * 1. フェーズが不明な場合はブロック（fail-closed）
 * 2. allowed に含まれていれば許可
 * 3. blocked に含まれていれば禁止
 * 4. どちらにも含まれない場合は許可（安全側）
 *
 * @param {string} phase - フェーズ名
 * @param {string} fileType - ファイルタイプ
 * @returns {boolean} 編集が許可される場合 true
 */
function canEditInPhase(phase, fileType) {
  // REQ-1: null/undefined/空文字フェーズはブロック（fail-closed）
  if (!phase) {
    return false;
  }

  // REQ-1: 未知のフェーズはブロック（fail-closed）
  const isKnownPhase = PHASE_RULES[phase] || PARALLEL_PHASES[phase];
  if (!isKnownPhase) {
    return false;
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
 * ブロックされたファイルタイプに基づいて、どのフェーズに進めば
 * 編集可能になるかを案内する。
 *
 * @param {object} rule - フェーズルール
 * @param {string} [phase] - 現在のフェーズ名
 * @param {string} [fileType] - ブロックされたファイルタイプ
 */
function displayNextSteps(rule, phase, fileType) {
  console.log(' 次のステップ:');

  // ブロックされたファイルタイプに基づいて移行先フェーズを案内
  if (phase && fileType) {
    const nextPhase = findNextPhaseForFileType(phase, fileType);
    if (nextPhase) {
      const fileTypeName = FILE_TYPE_NAMES[fileType] || fileType;
      console.log(`   → /workflow next で ${nextPhase.phase}（${nextPhase.japaneseName}）`);
      console.log(`     フェーズへ進むと${fileTypeName}の編集が可能になります`);
      console.log('');
      return;
    }
  }

  // フォールバック: 一般的な案内
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

  // 次のステップ（ブロックされたファイルタイプに基づいてフェーズ移行案内）
  displayNextSteps(rule, phase, fileType);

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
 * ログの読み込み失敗は本処理に影響しない。
 *
 * @returns {Array} ログエントリの配列（読み込み失敗時は空配列）
 */
function loadLogs() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    }
  } catch (e) {
    // ログ読み込みエラーは無視（本処理に影響しないため）
    // debugLog でログ失敗を通知しない（ログシステム自体のエラーのため）
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
      ? logs.slice(-MAX_LOG_ENTRIES)  // 最新のMAX_LOG_ENTRIES件を保持
      : logs;
    fs.writeFileSync(LOG_FILE, JSON.stringify(trimmedLogs, null, 2), 'utf8');
  } catch (e) {
    // ログ書き込みエラーは無視（本処理に影響しないため）
    // debugLog でログ失敗を通知しない（ログシステム自体のエラーのため）
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
 * Edit/Write/Bash ツールをチェック対象とする。
 *
 * @param {string} toolName - ツール名
 * @returns {boolean} チェック対象の場合 true
 */
function isTargetTool(toolName) {
  return toolName === 'Edit' || toolName === 'Write' || toolName === 'Bash';
}

/**
 * ファイル操作を行うBashコマンドパターン
 * これらのコマンドが含まれる場合、ファイル編集として扱う
 */
const FILE_MODIFYING_COMMANDS = [
  // ファイル作成・編集
  /\bsed\s+(-i|--in-place)/i,           // sed -i (in-place edit)
  /\bawk\b.*?\s+>\s+/i,                  // awk ... > file (REQ-4)
  /\bawk\s+.*>>/i,                       // awk with append
  /\becho\s+.*>/i,                       // echo redirection
  /\bcat\s+.*>/i,                        // cat redirection
  /\bprintf\s+.*>/i,                     // printf redirection
  /\btee\s+/i,                           // tee command
  /\btouch\s+/i,                         // touch (create file)
  /<<\s*['\"]?([A-Z_]+)['\"]?/i,         // heredoc pattern
  /\|\s*(tee|dd)/i,                      // pipe output pattern
  // ファイル削除・移動
  /\brm\s+(-[rf]*\s+)?[^|&;]+\.(ts|tsx|js|jsx|py|go|rs|md|mmd|json|yaml|yml)/i,  // rm with code files
  /\bmv\s+/i,                            // mv (rename/move)
  /\bcp\s+/i,                            // cp (copy)
  // ディレクトリ操作（コード関連）
  /\brmdir\s+/i,                         // rmdir
  /\bmkdir\s+.*\/(src|tests|features|components)\//i,  // mkdir in source dirs
  // ★★★ REQ-1: スクリプト言語のワンライナー実行 ★★★
  /\b(node|python3?|ruby|perl)\s+(--eval|-[ec])\s+/i,
  // ★★★ REQ-1: シェルコマンド実行 ★★★
  /\b(sh|bash)\s+-c\s+/i,
  /\beval\s+["']/i,
  // ★★★ REQ-1: パイプ経由のシェル実行 ★★★
  /\|\s*(sh|bash)\b/i,
  /&&\s*(sh|bash)\s+/i,
];

/**
 * 常に許可するBashコマンドパターン
 * これらのコマンドはフェーズに関係なく許可する
 */
const ALWAYS_ALLOWED_BASH_PATTERNS = [
  // 読み取り専用コマンド
  /^\s*(ls|dir|pwd|cat|head|tail|less|more|grep|rg|find|tree|wc|file|stat)\s/i,
  // プロセス情報（読み取りのみ）
  /^\s*(ps|top|htop)\s/i,
  // Git読み取り
  /\bgit\s+(status|log|diff|branch|show|remote)\b/i,
  // ネットワーク読み取り
  /^\s*(curl|wget|netstat|ping|nc|nslookup|dig)\s/i,
  // システム情報
  /^\s*(uname|hostname|whoami|id|env|printenv|which|where|type)\s/i,
  // スリープ・待機
  /^\s*(sleep|wait)\s/i,
];

/**
 * Bashコマンドからファイルパスを抽出
 *
 * リダイレクト、sed -i、tee、mv/cp/rm などからファイルパスを抽出する。
 *
 * @param {string} command - Bashコマンド
 * @returns {string|null} 抽出されたファイルパス、または null
 */
function extractFilePathFromCommand(command) {
  if (!command || typeof command !== 'string') {
    return null;
  }

  // 1. リダイレクト (>, >>) からファイルパス抽出
  const redirectMatch = command.match(/>\s*([^\s;&|]+)/);
  if (redirectMatch) {
    return redirectMatch[1].trim();
  }

  // 2. sed -i からファイルパス抽出
  const sedMatch = command.match(/\bsed\s+(?:-[a-z]*i[a-z]*\s+|--in-place\s+).*?\s+([^\s;&|]+\.(ts|tsx|js|jsx|py|go|rs|md|mmd|json|yaml|yml))/i);
  if (sedMatch) {
    return sedMatch[1].trim();
  }

  // 3. tee からファイルパス抽出 (パイプの後も考慮)
  const teeMatch = command.match(/\|\s*tee\s+(?:-a\s+)?([^\s;&|]+)/i);
  if (teeMatch) {
    return teeMatch[1].trim();
  }

  // tee が単独で使われる場合
  const teeStandaloneMatch = command.match(/^tee\s+(?:-a\s+)?([^\s;&|]+)/i);
  if (teeStandaloneMatch) {
    return teeStandaloneMatch[1].trim();
  }

  // 4. mv, cp, rm からファイルパス抽出
  const mvCpRmMatch = command.match(/\b(mv|cp|rm)\s+(?:-[a-z]+\s+)?([^\s;&|]+)/i);
  if (mvCpRmMatch) {
    return mvCpRmMatch[2].trim();
  }

  // 5. 一般的なファイル拡張子パターンでの抽出（フォールバック）
  const fileMatch = command.match(/[^\s]+\.(ts|tsx|js|jsx|py|go|rs|md|mmd|json|yaml|yml)(?:\s|$)/i);
  if (fileMatch) {
    return fileMatch[0].trim();
  }

  return null;
}

/**
 * 複合コマンドを分割する（REQ-4）
 */
function splitCompoundCommand(command) {
  return command.split(/\s*(?:&&|\|\||;|\|)\s+/).filter(part => part.trim().length > 0);
}

/**
 * BashコマンドがファイルMを修正するかどうか判定
 *
 * @param {string} command - Bashコマンド
 * @returns {{isModifying: boolean, filePath: string | null, isExplicitlyAllowed: boolean}} 修正の有無とファイルパス
 */
function analyzeBashCommand(command) {
  if (!command || typeof command !== 'string') {
    return { isModifying: false, filePath: null, isExplicitlyAllowed: false };
  }

  // B-2: git commitのHeredoc形式を誤検出から除外
  if (/^git\s+commit\s+.*\$\(\s*cat\s+<</.test(command)) {
    return { isModifying: false, filePath: null, isExplicitlyAllowed: true };
  }

  // REQ-8: ホワイトリストチェック（フェーズ不要な読み取り専用コマンド）
  // bash-whitelist.js の readonly リストと同等のチェック
  const readonlyPatterns = [
    /^\s*(ls|cat|head|tail|less|more|wc|file)\s/i,
    /^\s*(find|grep|rg|ag)\s/i,
    /^\s*git\s+(status|log|diff|show|branch|ls-files|ls-tree|rev-parse)\b/i,
    /^\s*(pwd|which|whereis|date|uname|whoami)\s/i,
    /^\s*node\s+-e\s+["']/i,  // node -e with quoted string
  ];

  for (const pattern of readonlyPatterns) {
    if (pattern.test(command)) {
      debugLog('REQ-8: 明示的に許可されたコマンド（ホワイトリスト）:', command.substring(0, 50));
      return { isModifying: false, filePath: null, isExplicitlyAllowed: true };
    }
  }

  // REQ-4: 複合コマンドを分割してチェック
  const commandParts = splitCompoundCommand(command);

  // 最初にファイル修正コマンドをチェック（優先度高）
  // これにより "cat file.txt | tee output.log" のようなケースを正しく検出
  for (const part of commandParts) {
    for (const pattern of FILE_MODIFYING_COMMANDS) {
      if (pattern.test(part)) {
        debugLog('ファイル修正Bashコマンド検出:', part.substring(0, 50));
        // extractFilePathFromCommand() を使用してファイルパスを抽出
        const filePath = extractFilePathFromCommand(part);
        return { isModifying: true, filePath, isExplicitlyAllowed: false };
      }
    }
  }

  // ファイル修正がない場合、常に許可するコマンドをチェック
  for (const pattern of ALWAYS_ALLOWED_BASH_PATTERNS) {
    if (pattern.test(command)) {
      debugLog('常に許可されるBashコマンド:', command.substring(0, 50));
      return { isModifying: false, filePath: null, isExplicitlyAllowed: true };
    }
  }

  // どちらにも該当しないコマンド（npm, taskkill等）は明示的に許可されていない
  return { isModifying: false, filePath: null, isExplicitlyAllowed: false };
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
 * スコープ違反チェック
 * @param {string} filePath - チェック対象ファイルパス
 * @param {object} workflowState - ワークフロー状態
 * @returns {{blocked: boolean, reason?: string, allowedFiles?: string[], allowedDirs?: string[]}}
 */
function checkScopeViolation(filePath, workflowState) {
  // workflowStateが存在しない、またはscopeが未設定の場合は許可
  if (!workflowState || !workflowState.scope) {
    return { blocked: false };
  }

  const { affectedFiles, affectedDirs } = workflowState.scope;

  // scopeが空（affectedFiles/affectedDirsともに空配列）の場合は許可
  if ((!affectedFiles || affectedFiles.length === 0) &&
      (!affectedDirs || affectedDirs.length === 0)) {
    return { blocked: false };
  }

  // docs/配下は常に許可（スコープチェック対象外）
  const normalizedPath = normalizePath(filePath);
  if (normalizedPath.startsWith('docs/')) {
    return { blocked: false };
  }

  // src/配下のみチェック
  if (!normalizedPath.startsWith('src/')) {
    return { blocked: false };
  }

  // affectedFilesに含まれているか確認
  if (affectedFiles && affectedFiles.length > 0) {
    for (const allowedFile of affectedFiles) {
      const normalizedAllowed = normalizePath(allowedFile);
      if (normalizedPath === normalizedAllowed) {
        return { blocked: false };
      }
    }
  }

  // affectedDirsに含まれているか確認
  if (affectedDirs && affectedDirs.length > 0) {
    for (const allowedDir of affectedDirs) {
      const normalizedDir = normalizePath(allowedDir);
      // ディレクトリプレフィックスマッチ（末尾にスラッシュを追加して正確にマッチ）
      const dirPrefix = normalizedDir.endsWith('/') ? normalizedDir : normalizedDir + '/';
      if (normalizedPath.startsWith(dirPrefix)) {
        return { blocked: false };
      }
    }
  }

  // どちらにも含まれない場合はブロック
  return {
    blocked: true,
    reason: 'このファイルは影響範囲に含まれていません',
    allowedFiles: affectedFiles || [],
    allowedDirs: affectedDirs || [],
  };
}

/**
 * スコープ違反メッセージを表示
 * @param {string} filePath - ファイルパス
 * @param {object} checkResult - checkScopeViolation()の戻り値
 */
function displayScopeViolationMessage(filePath, checkResult) {
  console.log('');
  console.log(SEPARATOR_LINE);
  console.log(' 影響範囲外の編集がブロックされました');
  console.log(SEPARATOR_LINE);
  console.log('');
  console.log(` ファイル: ${filePath}`);
  console.log(` 理由: ${checkResult.reason}`);
  console.log('');
  console.log(' このファイルはタスクの影響範囲に含まれていません。');
  console.log('');
  if (checkResult.allowedFiles && checkResult.allowedFiles.length > 0) {
    console.log(' 許可されたファイル:');
    for (const file of checkResult.allowedFiles) {
      console.log(`   - ${file}`);
    }
    console.log('');
  }
  if (checkResult.allowedDirs && checkResult.allowedDirs.length > 0) {
    console.log(' 許可されたディレクトリ:');
    for (const dir of checkResult.allowedDirs) {
      console.log(`   - ${dir}`);
    }
    console.log('');
  }
  console.log(' 対処方法:');
  console.log('   1. researchフェーズに戻り、影響範囲を再定義する');
  console.log('      → /workflow reset');
  console.log('   2. または、影響範囲外のファイル編集が必要な場合は');
  console.log('      別タスクとして実装する');
  console.log('');
  console.log(SEPARATOR_LINE);
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
    // 入力の検証（不正な入力は許可して処理を進める）
    if (!input || typeof input !== 'object') {
      process.exit(EXIT_CODES.SUCCESS);
    }

    const toolName = input.tool_name;
    const toolInput = input.tool_input || {};

  // 2. Edit/Write/Bash ツール以外は許可
  if (!isTargetTool(toolName)) {
    process.exit(EXIT_CODES.SUCCESS);
  }

  // 3. Bashツールの場合は特別な処理
  let filePath = '';
  if (toolName === 'Bash') {
    const command = toolInput.command || '';

    // ★★★ REQ-2: Bashコマンドホワイトリストチェック ★★★
    // ワークフロー状態を確認してフェーズを取得
    let whitelistPassed = false;
    const workflowState = findActiveWorkflowState(null);
    if (workflowState) {
      const phase = workflowState.phase;

      // ホワイトリストチェック実行
      const whitelistResult = checkBashWhitelist(command, phase);
      if (!whitelistResult.allowed) {
        const rule = getPhaseRule(phase, workflowState.workflowState);
        console.log('');
        console.log(SEPARATOR_LINE);
        console.log(' Bashコマンドがブロックされました（ホワイトリスト）');
        console.log(SEPARATOR_LINE);
        console.log('');
        console.log(` フェーズ: ${phase}（${rule?.japaneseName || phase}）`);
        console.log(` コマンド: ${command.substring(0, 100)}${command.length > 100 ? '...' : ''}`);
        console.log('');
        console.log(` 理由: ${whitelistResult.reason}`);
        console.log('');
        console.log(SEPARATOR_LINE);
        logCheck({
          blocked: true,
          phase,
          command: command.substring(0, 100),
          reason: 'Bash whitelist violation: ' + whitelistResult.reason,
        });
        process.exit(EXIT_CODES.BLOCK);
      } else {
        whitelistPassed = true;
      }
    }

    const analysis = analyzeBashCommand(command);

    // 明示的に許可されたコマンドは常に許可
    if (analysis.isExplicitlyAllowed) {
      debugLog('Bashコマンド（明示的許可）：許可');
      process.exit(EXIT_CODES.SUCCESS);
    }

    // B-3: ホワイトリストを通過したコマンドは無条件で許可
    // ファイル修正の有無に関わらず、ホワイトリスト通過済みなら許可
    if (whitelistPassed) {
      debugLog('Bashコマンド（ホワイトリスト通過）：許可');
      process.exit(EXIT_CODES.SUCCESS);
    }

    // ワークフロー状態を再確認（既に上で取得しているが、既存コードとの整合性のため）
    if (workflowState) {
      const phase = workflowState.phase;
      const rule = getPhaseRule(phase, workflowState.workflowState);

      // B-2: commit/pushフェーズでのgit操作ホワイトリスト
      if (phase === 'commit' || phase === 'push') {
        const lowerCmd = command.toLowerCase();
        if (phase === 'commit') {
          if (/\bgit\s+add\b/.test(lowerCmd)) {
            debugLog('B-2: git add allowed (commit phase)');
            process.exit(EXIT_CODES.SUCCESS);
          }
          if (/\bgit\s+commit\b/.test(lowerCmd)) {
            if (/--amend/.test(lowerCmd)) {
              console.log('');
              console.log(SEPARATOR_LINE);
              console.log(' git commit --amend is blocked by workflow');
              console.log(SEPARATOR_LINE);
              process.exit(EXIT_CODES.BLOCK);
            }
            if (/--no-verify/.test(lowerCmd)) {
              console.log('');
              console.log(SEPARATOR_LINE);
              console.log(' git commit --no-verify is blocked by workflow');
              console.log(SEPARATOR_LINE);
              process.exit(EXIT_CODES.BLOCK);
            }
            debugLog('B-2: git commit allowed (commit phase)');
            process.exit(EXIT_CODES.SUCCESS);
          }
          if (/\bgit\s+tag\b/.test(lowerCmd)) {
            debugLog('B-2: git tag allowed (commit phase)');
            process.exit(EXIT_CODES.SUCCESS);
          }
        }
        if (phase === 'push') {
          if (/\bgit\s+push\b/.test(lowerCmd)) {
            if (/--force/.test(lowerCmd) || /\s-f\b/.test(lowerCmd)) {
              console.log('');
              console.log(SEPARATOR_LINE);
              console.log(' git push --force/-f is blocked by workflow');
              console.log(SEPARATOR_LINE);
              process.exit(EXIT_CODES.BLOCK);
            }
            debugLog('B-2: git push allowed (push phase)');
            process.exit(EXIT_CODES.SUCCESS);
          }
        }
      }

      // 読み取り専用フェーズでは、明示的に許可されたコマンド以外はブロック
      if (rule && rule.readOnly) {
        console.log('');
        console.log(SEPARATOR_LINE);
        console.log(' Bashコマンドがブロックされました');
        console.log(SEPARATOR_LINE);
        console.log('');
        console.log(` フェーズ: ${phase}（${rule.japaneseName || phase}）`);
        console.log(` コマンド: ${command.substring(0, 100)}${command.length > 100 ? '...' : ''}`);
        console.log('');
        console.log(` 理由: ${rule.description}`);
        console.log('');
        console.log(' このフェーズでは読み取り専用コマンドのみ許可されます。');
        console.log(' 許可: ls, cat, grep, curl, git status/log/diff 等');
        console.log('');
        // フェーズ移行案内
        const nextWritePhase = findNextPhaseForFileType(phase, 'code');
        if (nextWritePhase) {
          console.log(' 次のステップ:');
          console.log(`   → /workflow next で ${nextWritePhase.phase}（${nextWritePhase.japaneseName}）`);
          console.log('     フェーズへ進むとファイル編集が可能になります');
          console.log('');
        }
        console.log(SEPARATOR_LINE);
        logCheck({
          blocked: true,
          phase,
          command: command.substring(0, 100),
          reason: 'Bash command in read-only phase',
        });
        process.exit(EXIT_CODES.BLOCK);
      }
    }

    // ファイル修正コマンドでない場合は許可
    if (!analysis.isModifying) {
      debugLog('Bashコマンド（ファイル修正なし）：許可');
      process.exit(EXIT_CODES.SUCCESS);
    }

    // ファイル修正コマンドの場合、抽出したファイルパスを使用
    filePath = analysis.filePath || '';
    debugLog('Bashファイル修正検出:', command.substring(0, 80));

    // ファイルパスが抽出できない場合でも、ファイル修正コマンドはブロック対象
    if (!filePath) {
      // ワークフロー状態を確認
      const workflowState = findActiveWorkflowState(null);
      if (workflowState) {
        const phase = workflowState.phase;
        const rule = getPhaseRule(phase, workflowState.workflowState);
        // B-7: allowedが定義されているフェーズではreadOnlyブロックを回避
        if (rule && rule.readOnly && (!rule.allowed || rule.allowed.length === 0)) {
          console.log('');
          console.log(SEPARATOR_LINE);
          console.log(' Bashによるファイル操作がブロックされました');
          console.log(SEPARATOR_LINE);
          console.log('');
          console.log(` フェーズ: ${phase}（${rule.japaneseName || phase}）`);
          console.log(` コマンド: ${command.substring(0, 100)}...`);
          console.log('');
          console.log(` 理由: ${rule.description}`);
          console.log('');
          console.log(' このフェーズではファイル操作は許可されていません。');
          console.log('');
          // フェーズ移行案内
          const nextWritePhase = findNextPhaseForFileType(phase, 'code');
          if (nextWritePhase) {
            console.log(' 次のステップ:');
            console.log(`   → /workflow next で ${nextWritePhase.phase}（${nextWritePhase.japaneseName}）`);
            console.log('     フェーズへ進むとファイル編集が可能になります');
            console.log('');
          }
          console.log(SEPARATOR_LINE);
          logCheck({
            blocked: true,
            phase,
            command: command.substring(0, 100),
            reason: 'Bash file operation in read-only phase',
          });
          process.exit(EXIT_CODES.BLOCK);
        }
      }
      // ワークフロー未開始またはファイルパス不明の場合は許可（安全側）
      process.exit(EXIT_CODES.SUCCESS);
    }

    // ファイルパスが抽出できた場合は、非読み取り専用フェーズでもファイルタイプチェックを実行
    // この後の通常のファイルチェック処理に進む (canEditInPhase でチェック)
  } else {
    filePath = toolInput.file_path || '';
  }

  // 4. ファイルパスがない場合は許可
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
  const workflowState = findActiveWorkflowState(filePath);

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

  // ★★★ REQ-1/REQ-3: implementation/refactoringフェーズでのスコープチェック ★★★
  if (phase === 'implementation' || phase === 'refactoring') {
    const scopeCheckResult = checkScopeViolation(filePath, workflowState.workflowState);
    if (scopeCheckResult.blocked) {
      displayScopeViolationMessage(filePath, scopeCheckResult);
      logCheck({
        blocked: true,
        phase,
        filePath,
        reason: 'scope_violation',
        details: scopeCheckResult,
      });
      process.exit(EXIT_CODES.BLOCK);
    }
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
    // REQ-3: Fail Closed - エラー時はブロック
    debugLog('エラー発生:', e.message);
    process.exit(EXIT_CODES.BLOCK);
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

  // 非同期stdin読み取り（3秒タイムアウト付き）
  let inputData = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => (inputData += chunk));
  process.stdin.on('error', (err) => {
    clearTimeout(timeout);
    debugLog('stdin エラー:', err.message);
    // REQ-3: Fail Closed - stdinエラー時はブロック
    process.exit(EXIT_CODES.BLOCK);
  });
  process.stdin.on('end', () => {
    clearTimeout(timeout);
    try {
      const input = JSON.parse(inputData);
      main(input);
    } catch (e) {
      // REQ-3: Fail Closed - JSON パースエラー時もブロック
      debugLog('JSON パースエラー:', e.message);
      process.exit(EXIT_CODES.BLOCK);
    }
  });
} else {
  // テストから使用される場合
  module.exports = {
    discoverTasks: discoverTasksUnified,
    findTaskByFilePath: findTaskByFilePathUnified,
    findActiveWorkflowTask,
    getFileType,
    isConfigFile,
    isAlwaysAllowed,
    canEditInPhase,
    handleParallelPhase,
    identifyActiveSubPhase,
    findActiveWorkflowState,
    displayBlockMessage,
    normalizePath,
    extractFilePathFromCommand,
    analyzeBashCommand,
    findNextPhaseForFileType,
    PHASE_RULES,
    PARALLEL_PHASES,
    FILE_TYPE_NAMES,
    FILE_TYPE_TARGET_PHASES,
    EXIT_CODES,
  };
}
