#!/usr/bin/env node
/**
 * ワークフロー成果物反映チェック (PostToolUse hook)
 *
 * workflow_next MCP 呼び出し後にトリガーされ、
 * ワークフローディレクトリの成果物が docs/specs/ に反映されているかチェックする。
 *
 * @spec docs/specs/features/workflow-artifact-check.md
 */

// テスト用に依存性を注入可能にする
let fs = require('fs');
let path = require('path');

// テスト用に依存性を設定する関数
function setDependencies(deps) {
  if (deps.fs) fs = deps.fs;
  if (deps.path) path = deps.path;
}

// =============================================================================
// 定数定義
// =============================================================================

/** ログファイルのパス */
const SKIP_LOG_FILE = path.join(process.cwd(), '.claude-artifact-check-log.json');

/** チェック対象のフェーズ */
const CHECK_TARGET_PHASES = ['design_review', 'commit', 'parallel_quality'];

/** スキップログの最大保持件数 */
const MAX_SKIP_LOG_ENTRIES = 100;

/** コンソール出力の区切り線 */
const SEPARATOR_LINE = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

/**
 * フェーズごとの必須成果物定義
 *
 * @typedef {Object} ArtifactDefinition
 * @property {string} pattern - ファイル名パターン（glob形式）
 * @property {string} description - 成果物の説明（エラーメッセージ用）
 * @property {boolean} [optional] - オプショナルな成果物かどうか（デフォルト: false）
 */
const REQUIRED_ARTIFACTS = {
  requirements: [
    { pattern: 'requirements.md', description: '要件定義書' },
  ],
  threat_modeling: [
    { pattern: 'threat-model.md', description: '脅威モデル' },
  ],
  planning: [
    { pattern: 'planning.md', description: '計画書' },
  ],
  state_machine: [
    { pattern: '*.state-machine.mmd', description: 'ステートマシン図' },
  ],
  flowchart: [
    { pattern: '*.flowchart.mmd', description: 'フローチャート' },
  ],
  ui_design: [
    { pattern: 'ui-design.md', description: 'UI設計書', optional: true },
  ],
  test_design: [
    { pattern: 'test-design.md', description: 'テスト設計書' },
  ],
};

/** 仕様書パス抽出用の正規表現パターン */
const SPEC_PATH_PATTERNS = [
  // パターン1: "## 仕様書" セクション内のパス
  /##\s*仕様書[\s\S]*?(docs\/specs\/[^\s\n]+\.md)/,
  // パターン2: "仕様書:" ラベル付きパス
  /仕様書:\s*(docs\/specs\/[^\s\n]+\.md)/,
  // パターン3: docs/specs/ で始まる任意のパス
  /(docs\/specs\/[^\s\n)]+\.md)/,
];

// =============================================================================
// スキップ判定関連
// =============================================================================

/**
 * 環境変数によるスキップ設定が有効かどうか判定
 * @returns {boolean} - スキップすべきかどうか
 */
function shouldSkipCheck() {
  const skipEnv = process.env.SKIP_ARTIFACT_CHECK;
  const shouldSkip = skipEnv === '1' || skipEnv === 'true';

  if (shouldSkip) {
    printSkipWarning();
    logSkipEvent();
  }

  return shouldSkip;
}

/**
 * スキップ時の警告メッセージを出力
 */
function printSkipWarning() {
  console.warn('');
  console.warn(SEPARATOR_LINE);
  console.warn('⚠️  成果物反映チェックがスキップされました');
  console.warn(SEPARATOR_LINE);
  console.warn('');
  console.warn('環境変数 SKIP_ARTIFACT_CHECK=1 が設定されています。');
  console.warn('成果物が docs/specs/ に反映されていない可能性があります。');
  console.warn('');
  console.warn('このスキップはログに記録されます。');
  console.warn('');
}

/**
 * スキップイベントをログファイルに記録（監査証跡）
 */
function logSkipEvent() {
  const logs = readSkipLogs();

  logs.push({
    timestamp: new Date().toISOString(),
    event: 'skip',
    reason: 'SKIP_ARTIFACT_CHECK environment variable',
  });

  // 最新N件のみ保持
  const trimmedLogs = logs.length > MAX_SKIP_LOG_ENTRIES
    ? logs.slice(-MAX_SKIP_LOG_ENTRIES)
    : logs;

  writeSkipLogs(trimmedLogs);
}

/**
 * スキップログファイルを読み取る
 * @returns {Array} - ログエントリの配列
 */
function readSkipLogs() {
  try {
    if (fs.existsSync(SKIP_LOG_FILE)) {
      return JSON.parse(fs.readFileSync(SKIP_LOG_FILE, 'utf8'));
    }
  } catch (e) {
    // 読み取りエラーは無視して空配列を返す
  }
  return [];
}

/**
 * スキップログファイルに書き込む
 * @param {Array} logs - ログエントリの配列
 */
function writeSkipLogs(logs) {
  try {
    fs.writeFileSync(SKIP_LOG_FILE, JSON.stringify(logs, null, 2), 'utf8');
  } catch (e) {
    console.warn('スキップログの書き込みに失敗:', e.message);
  }
}

// =============================================================================
// 仕様書パス抽出関連
// =============================================================================

/**
 * log.md から仕様書パスを抽出
 * @param {string} workflowDir - ワークフローディレクトリパス
 * @returns {string|null} - 仕様書パス または null
 */
function extractSpecPathFromLogMd(workflowDir) {
  const content = readLogMdContent(workflowDir);
  if (!content) return null;

  // 定義された優先順位で仕様書パスを検索
  for (const pattern of SPEC_PATH_PATTERNS) {
    const match = content.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * log.md ファイルの内容を読み取る
 * @param {string} workflowDir - ワークフローディレクトリパス
 * @returns {string|null} - ファイル内容 または null
 */
function readLogMdContent(workflowDir) {
  const logPath = path.join(workflowDir, 'log.md');

  try {
    if (!fs.existsSync(logPath)) return null;
    return fs.readFileSync(logPath, 'utf8');
  } catch (e) {
    return null;
  }
}

// =============================================================================
// ファイル検出関連
// =============================================================================

/**
 * ワークフローディレクトリ内の .mmd ファイルを検出
 * @param {string} workflowDir - ワークフローディレクトリパス
 * @returns {Array<{name: string, type: string}>} - ファイル情報リスト
 */
function listMmdFiles(workflowDir) {
  try {
    if (!fs.existsSync(workflowDir)) return [];

    return fs.readdirSync(workflowDir)
      .filter(f => f.endsWith('.mmd'))
      .map(f => ({
        name: f,
        // ファイル名からタイプを推測（例: state-machine.mmd → "state-machine"）
        type: f.replace('.mmd', ''),
      }));
  } catch (e) {
    return [];
  }
}

// =============================================================================
// パス推測・変換関連
// =============================================================================

/** ワークフローディレクトリ名の正規表現パターン（タイムスタンプ_タスク名） */
const WORKFLOW_DIR_PATTERN = /^\d{8}_\d{6}_(.+)$/;

/**
 * ワークフローディレクトリ名からタスク名を抽出
 * @param {string} workflowDir - ワークフローディレクトリパス
 * @returns {string|null} - タスク名 または null
 * @example
 * extractTaskNameFromDir('docs/workflows/20260115_212300_タスク名') // → 'タスク名'
 */
function extractTaskNameFromDir(workflowDir) {
  const dirName = path.basename(workflowDir);
  const match = dirName.match(WORKFLOW_DIR_PATTERN);
  return match ? match[1] : null;
}

/**
 * タスク名を kebab-case に変換
 * @param {string} str - 変換対象文字列
 * @returns {string} - kebab-case 文字列
 * @example
 * toKebabCase('FRDifferenceRanking') // → 'fr-difference-ranking'
 */
function toKebabCase(str) {
  return str
    // 連続する大文字 + 大文字小文字の間にハイフン挿入（例: XMLParser → XML-Parser）
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    // 小文字と大文字の間にハイフン挿入（例: myName → my-Name）
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
    // スペースとスラッシュをハイフンに変換
    .replace(/[\s\/]+/g, '-')
    // 英数字、ハイフン、日本語以外を除去
    .replace(/[^a-z0-9\-\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '');
}

/**
 * .mmd ファイル名からタイプ部分を抽出
 * @param {string} mmdFileName - .mmd ファイル名
 * @returns {string} - タイプ文字列
 */
function extractMmdType(mmdFileName) {
  return mmdFileName.replace('.mmd', '');
}

/**
 * パスのバックスラッシュをスラッシュに正規化
 * @param {string} filePath - ファイルパス
 * @returns {string} - 正規化されたパス
 */
function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/');
}

/**
 * .mmd ファイルの反映先パスを推測
 * @param {string} workflowDir - ワークフローディレクトリパス
 * @param {string} mmdFileName - .mmd ファイル名
 * @returns {string|null} - 推測された反映先パス
 */
function inferSpecMmdPath(workflowDir, mmdFileName) {
  const mmdType = extractMmdType(mmdFileName);

  // 1. log.md から仕様書パスを取得して、同じディレクトリに配置
  const specPath = extractSpecPathFromLogMd(workflowDir);
  if (specPath) {
    return buildMmdPathFromSpec(specPath, mmdType);
  }

  // 2. タスク名から推測（fallback）
  const taskName = extractTaskNameFromDir(workflowDir);
  if (taskName) {
    return buildMmdPathFromTaskName(taskName, mmdType);
  }

  return null;
}

/**
 * 仕様書パスから .mmd ファイルパスを構築
 * @param {string} specPath - 仕様書パス
 * @param {string} mmdType - .mmd ファイルのタイプ
 * @returns {string} - 構築された .mmd ファイルパス
 */
function buildMmdPathFromSpec(specPath, mmdType) {
  const specDir = path.dirname(specPath);
  const specBaseName = path.basename(specPath, '.md');
  return normalizePath(path.join(specDir, `${specBaseName}.${mmdType}.mmd`));
}

/**
 * タスク名から .mmd ファイルパスを構築
 * @param {string} taskName - タスク名
 * @param {string} mmdType - .mmd ファイルのタイプ
 * @returns {string} - 構築された .mmd ファイルパス
 */
function buildMmdPathFromTaskName(taskName, mmdType) {
  const kebabName = toKebabCase(taskName);
  return `docs/specs/features/${kebabName}.${mmdType}.mmd`;
}

// =============================================================================
// 必須成果物チェック関連
// =============================================================================

/**
 * パターンにマッチするファイルを検索
 *
 * @param {string} searchDir - 検索ディレクトリ
 * @param {string} pattern - ファイル名パターン（例: '*.mmd', 'requirements.md'）
 * @returns {string[]} - マッチしたファイル名の配列
 */
function matchArtifactPattern(searchDir, pattern) {
  try {
    if (!fs.existsSync(searchDir)) return [];

    const files = fs.readdirSync(searchDir);

    // ワイルドカードパターンの場合
    if (pattern.startsWith('*')) {
      const suffix = pattern.slice(1); // 例: '*.mmd' -> '.mmd'
      return files.filter(f => f.endsWith(suffix));
    }

    // 完全一致パターンの場合
    return files.filter(f => f === pattern);
  } catch (e) {
    return [];
  }
}

/**
 * 必須成果物欠落エラーを生成
 *
 * @param {ArtifactDefinition} artifact - 成果物定義
 * @param {string} searchDir - 検索したディレクトリ
 * @returns {Object} - エラーオブジェクト
 */
function createArtifactMissingError(artifact, searchDir) {
  return {
    type: 'required_artifact_missing',
    artifact: artifact.description,
    pattern: artifact.pattern,
    searchLocation: normalizePath(searchDir),
    action: `${artifact.description}を作成してください`,
  };
}

/**
 * オプショナル成果物欠落警告を生成
 *
 * @param {ArtifactDefinition} artifact - 成果物定義
 * @param {string} searchDir - 検索したディレクトリ
 * @returns {Object} - 警告オブジェクト
 */
function createArtifactMissingWarning(artifact, searchDir) {
  return {
    type: 'optional_artifact_missing',
    artifact: artifact.description,
    pattern: artifact.pattern,
    searchLocation: normalizePath(searchDir),
    suggestion: `${artifact.description}の作成を検討してください`,
  };
}

/**
 * 必須成果物の存在をチェック
 *
 * @param {string} workflowDir - ワークフローディレクトリパス
 * @param {string} currentPhase - 現在のフェーズ
 * @returns {{passed: boolean, errors: Array, warnings: Array}}
 */
function checkRequiredArtifacts(workflowDir, currentPhase) {
  const result = {
    passed: true,
    errors: [],
    warnings: [],
  };

  // 現在のフェーズの必須成果物定義を取得
  const requiredArtifacts = REQUIRED_ARTIFACTS[currentPhase];
  if (!requiredArtifacts || requiredArtifacts.length === 0) {
    return result;
  }

  // ワークフローディレクトリが存在しない場合は警告のみ
  if (!fs.existsSync(workflowDir)) {
    result.warnings.push('ワークフローディレクトリが存在しません');
    return result;
  }

  // 各成果物の存在をチェック
  for (const artifact of requiredArtifacts) {
    const matchedFiles = matchArtifactPattern(workflowDir, artifact.pattern);

    if (matchedFiles.length === 0) {
      if (artifact.optional) {
        // オプショナル成果物は警告
        result.warnings.push(createArtifactMissingWarning(artifact, workflowDir));
      } else {
        // 必須成果物はエラー
        result.errors.push(createArtifactMissingError(artifact, workflowDir));
        result.passed = false;
      }
    }
  }

  return result;
}

// =============================================================================
// チェック結果オブジェクト生成
// =============================================================================

/** エラータイプ定数 */
const ERROR_TYPES = {
  MMD_NOT_SYNCED: 'mmd_not_synced',
  SPEC_NOT_CREATED: 'spec_not_created',
  REQUIRED_ARTIFACT_MISSING: 'required_artifact_missing',
  OPTIONAL_ARTIFACT_MISSING: 'optional_artifact_missing',
};

/**
 * チェック結果の初期オブジェクトを生成
 * @returns {{passed: boolean, warnings: string[], errors: Array, actions: string[]}}
 */
function createCheckResult() {
  return {
    passed: true,
    warnings: [],
    errors: [],
    actions: [],
  };
}

/**
 * .mmd ファイル未反映エラーを生成
 * @param {string} sourcePath - ソースファイルパス
 * @param {string} expectedPath - 期待される反映先パス
 * @returns {Object} - エラーオブジェクト
 */
function createMmdNotSyncedError(sourcePath, expectedPath) {
  return {
    type: ERROR_TYPES.MMD_NOT_SYNCED,
    source: sourcePath,
    expected: expectedPath,
    action: `cp "${sourcePath}" "${expectedPath}"`,
  };
}

/**
 * 仕様書未作成エラーを生成
 * @param {string|null} specPath - 仕様書パス（見つかった場合）
 * @returns {Object} - エラーオブジェクト
 */
function createSpecNotCreatedError(specPath) {
  if (specPath) {
    return {
      type: ERROR_TYPES.SPEC_NOT_CREATED,
      message: '仕様書が docs/specs/ に作成されていません',
      expected: specPath,
      action: 'planning フェーズの完了条件を確認してください',
    };
  }
  return {
    type: ERROR_TYPES.SPEC_NOT_CREATED,
    message: '仕様書が docs/specs/ に作成されていません',
    action: 'log.md に仕様書パスを記載し、仕様書を作成してください',
  };
}

// =============================================================================
// メインチェックロジック
// =============================================================================

/**
 * 成果物反映チェック
 * @param {string} workflowDir - ワークフローディレクトリパス
 * @param {string} targetPhase - 遷移先フェーズ
 * @param {string} [currentPhase] - 現在のフェーズ（必須成果物チェック用）
 * @returns {{passed: boolean, warnings: string[], errors: Array, actions: string[]}}
 */
function checkArtifactSync(workflowDir, targetPhase, currentPhase) {
  const result = createCheckResult();

  // ワークフローディレクトリの存在チェック
  if (!isWorkflowDirAccessible(workflowDir, result)) {
    return result;
  }

  // 新規: 現在フェーズの必須成果物チェック
  if (currentPhase) {
    const artifactResult = checkRequiredArtifacts(workflowDir, currentPhase);
    if (!artifactResult.passed) {
      result.passed = false;
      result.errors.push(...artifactResult.errors);
    }
    // 警告はオブジェクト形式で追加
    for (const warning of artifactResult.warnings) {
      if (typeof warning === 'object') {
        result.warnings.push(warning);
      } else {
        result.warnings.push(warning);
      }
    }
  }

  // チェック対象外のフェーズは既存チェックをスキップ
  if (!CHECK_TARGET_PHASES.includes(targetPhase)) {
    return result;
  }

  // .mmd ファイルのチェック
  checkMmdFiles(workflowDir, result);

  // 仕様書のチェック（commit フェーズのみ）
  if (targetPhase === 'commit') {
    checkSpecFile(workflowDir, result);
  }

  return result;
}

/**
 * ワークフローディレクトリがアクセス可能かチェック
 * @param {string} workflowDir - ワークフローディレクトリパス
 * @param {Object} result - チェック結果オブジェクト（mutate）
 * @returns {boolean} - アクセス可能な場合 true
 */
function isWorkflowDirAccessible(workflowDir, result) {
  try {
    if (!fs.existsSync(workflowDir)) {
      result.warnings.push('状態ファイルまたはワークフローディレクトリが存在しません');
      return false;
    }
    return true;
  } catch (e) {
    result.warnings.push('状態ファイルの読み取りに失敗しました');
    return false;
  }
}

/**
 * .mmd ファイルの反映状態をチェック
 * @param {string} workflowDir - ワークフローディレクトリパス
 * @param {Object} result - チェック結果オブジェクト（mutate）
 */
function checkMmdFiles(workflowDir, result) {
  const mmdFiles = listMmdFiles(workflowDir);

  for (const mmdFile of mmdFiles) {
    const sourcePath = normalizePath(path.join(workflowDir, mmdFile.name));
    const expectedPath = inferSpecMmdPath(workflowDir, mmdFile.name);

    // 反映先パスが推測できない場合はプレースホルダーを使用
    const targetPath = expectedPath || `docs/specs/{domain}/{feature-name}.${mmdFile.type}.mmd`;

    // 反映先にファイルが存在するかチェック
    if (expectedPath) {
      const fullExpectedPath = normalizePath(path.join(process.cwd(), expectedPath));
      if (!fs.existsSync(fullExpectedPath)) {
        result.errors.push(createMmdNotSyncedError(sourcePath, expectedPath));
        result.passed = false;
      }
    } else {
      // 推測できない場合はエラーとして報告
      result.errors.push(createMmdNotSyncedError(sourcePath, targetPath));
      result.passed = false;
    }
  }
}

/**
 * 仕様書ファイルの存在をチェック
 * @param {string} workflowDir - ワークフローディレクトリパス
 * @param {Object} result - チェック結果オブジェクト（mutate）
 */
function checkSpecFile(workflowDir, result) {
  const specPath = extractSpecPathFromLogMd(workflowDir);

  if (specPath) {
    const fullSpecPath = normalizePath(path.join(process.cwd(), specPath));
    if (!fs.existsSync(fullSpecPath)) {
      result.errors.push(createSpecNotCreatedError(specPath));
      result.passed = false;
    }
  } else {
    result.errors.push(createSpecNotCreatedError(null));
    result.passed = false;
  }
}

// =============================================================================
// エラー出力関連
// =============================================================================

/**
 * エラーメッセージを整形して出力
 * @param {Object} result - checkArtifactSync の戻り値
 */
function printErrorMessage(result) {
  printErrorHeader();
  printRequiredArtifactErrors(result.errors);
  printMmdErrors(result.errors);
  printSpecErrors(result.errors);
  printOptionalArtifactWarnings(result.warnings);
  printErrorFooter();
}

/**
 * エラーメッセージのヘッダーを出力
 */
function printErrorHeader() {
  console.log('');
  console.log(SEPARATOR_LINE);
  console.log('🚫 成果物反映チェック失敗');
  console.log(SEPARATOR_LINE);
  console.log('');
  console.log('以下のファイルが docs/specs/ に反映されていません:');
  console.log('');
}

/**
 * .mmd ファイル関連のエラーを出力
 * @param {Array} errors - エラー配列
 */
function printMmdErrors(errors) {
  const mmdErrors = errors.filter(e => e.type === ERROR_TYPES.MMD_NOT_SYNCED);
  if (mmdErrors.length === 0) return;

  console.log('【未反映の図ファイル】');
  for (const error of mmdErrors) {
    console.log(`  ソース: ${error.source}`);
    console.log(`  反映先: ${error.expected}`);
    console.log('');
    console.log('  実行コマンド:');
    console.log(`  ${error.action}`);
    console.log('');
  }
}

/**
 * 仕様書関連のエラーを出力
 * @param {Array} errors - エラー配列
 */
function printSpecErrors(errors) {
  const specErrors = errors.filter(e => e.type === ERROR_TYPES.SPEC_NOT_CREATED);
  if (specErrors.length === 0) return;

  console.log('【仕様書の確認】');
  for (const error of specErrors) {
    console.log(`  ${error.message || 'エラー'}`);
    if (error.expected) {
      console.log(`  期待されるパス: ${error.expected}`);
    }
    console.log(`  ${error.action || ''}`);
    console.log('');
  }
}

/**
 * 必須成果物欠落エラーを出力
 * @param {Array} errors - エラー配列
 */
function printRequiredArtifactErrors(errors) {
  const artifactErrors = errors.filter(
    e => e.type === ERROR_TYPES.REQUIRED_ARTIFACT_MISSING
  );
  if (artifactErrors.length === 0) return;

  console.log('【必須成果物の欠落】');
  for (const error of artifactErrors) {
    console.log(`  ❌ ${error.artifact}`);
    console.log(`     検索場所: ${error.searchLocation}`);
    console.log(`     パターン: ${error.pattern}`);
    console.log('');
    console.log(`     対処方法: ${error.action}`);
    console.log('');
  }
}

/**
 * オプショナル成果物の警告を出力
 * @param {Array} warnings - 警告配列
 */
function printOptionalArtifactWarnings(warnings) {
  const artifactWarnings = warnings.filter(
    w => typeof w === 'object' && w.type === ERROR_TYPES.OPTIONAL_ARTIFACT_MISSING
  );
  if (artifactWarnings.length === 0) return;

  console.log('【警告（オプショナル成果物）】');
  for (const warning of artifactWarnings) {
    console.log(`  ⚠️ ${warning.artifact}`);
    console.log(`     検索場所: ${warning.searchLocation}`);
    console.log(`     パターン: ${warning.pattern}`);
    console.log('');
    console.log(`     推奨: ${warning.suggestion}`);
    console.log('');
  }
}

/**
 * エラーメッセージのフッターを出力
 */
function printErrorFooter() {
  console.log('対処方法:');
  console.log('  1. 上記コマンドを実行して図ファイルをコピー');
  console.log('  2. 仕様書を作成/更新');
  console.log('  3. 再度 /workflow next を実行');
  console.log('');
  console.log(SEPARATOR_LINE);
}

// =============================================================================
// メイン処理
// =============================================================================

/** プロセス終了コード */
const EXIT_CODES = {
  SUCCESS: 0,
  BLOCK: 2,
};

/**
 * 警告メッセージを出力
 * @param {string[]} warnings - 警告メッセージの配列
 */
function printWarnings(warnings) {
  if (warnings.length === 0) return;

  console.log('');
  console.log('⚠️  警告:');
  for (const warning of warnings) {
    console.log(`  - ${warning}`);
  }
  console.log('');
}

/**
 * メイン処理
 */
function main(input) {
  // 環境変数によるスキップチェック
  if (shouldSkipCheck()) {
    process.exit(EXIT_CODES.SUCCESS);
  }

  // ワークフローコンテキストを抽出
  const { workflowDir, phase: targetPhase, currentPhase } = input.workflow_context || {};
  if (!workflowDir || !targetPhase) {
    process.exit(EXIT_CODES.SUCCESS);
  }

  // 成果物チェック実行（現在のフェーズも渡す）
  const result = checkArtifactSync(workflowDir, targetPhase, currentPhase);

  // チェック失敗時はエラー出力してブロック
  if (!result.passed) {
    printErrorMessage(result);
    process.exit(EXIT_CODES.BLOCK);
  }

  // 警告があれば出力
  printWarnings(result.warnings);

  process.exit(EXIT_CODES.SUCCESS);
}

// エクスポート（テスト用）
module.exports = {
  checkArtifactSync,
  extractSpecPathFromLogMd,
  listMmdFiles,
  inferSpecMmdPath,
  shouldSkipCheck,
  toKebabCase,
  setDependencies,
  // 新規追加
  REQUIRED_ARTIFACTS,
  checkRequiredArtifacts,
  matchArtifactPattern,
};

// メイン処理実行（直接実行時のみ）
if (require.main === module) {
  // 非同期stdin読み取り
  let inputData = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => inputData += chunk);
  process.stdin.on('end', () => {
    try {
      const input = JSON.parse(inputData);
      main(input);
    } catch (e) {
      process.exit(0);
    }
  });
}
