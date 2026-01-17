#!/usr/bin/env node
/**
 * テストファースト確認フック (PreToolUse)
 *
 * 新規ソースファイル作成時にテストファイルの存在を確認し、
 * テストファースト開発を推奨する警告を表示する。
 *
 * 設定可能な環境変数:
 * - CODE_EXTENSIONS: チェック対象の拡張子（カンマ区切り、デフォルト: .ts,.tsx）
 * - SKIP_TEST_FIRST_CHECK: "true" でチェックを無効化
 * - DEBUG_TEST_FIRST: "true" でデバッグログ出力
 *
 * @spec docs/specs/infrastructure/test-first-check.md
 */

const fs = require('fs');
const path = require('path');

// =============================================================================
// 設定
// =============================================================================

/**
 * チェック対象の拡張子（環境変数でカスタマイズ可能）
 * デフォルト: TypeScript ファイル (.ts, .tsx)
 */
const CODE_EXTENSIONS = (process.env.CODE_EXTENSIONS || '.ts,.tsx')
  .split(',')
  .map((ext) => ext.trim());

/**
 * テストファイル判定パターン
 */
const TEST_FILE_PATTERNS = ['.test.', '.spec.', '__tests__'];

/**
 * 除外ディレクトリパターン（型定義など）
 */
const EXCLUDED_DIR_PATTERNS = ['/types/', '\\types\\', '/d.ts', '.d.ts'];

// =============================================================================
// ユーティリティ関数
// =============================================================================

/**
 * デバッグログ出力
 *
 * @param {...any} args - ログ引数
 */
function debugLog(...args) {
  if (process.env.DEBUG_TEST_FIRST === 'true') {
    console.log('[check-test-first]', ...args);
  }
}

/**
 * ファイルパスを正規化（Windows/Unix 両対応）
 *
 * @param {string} filePath - ファイルパス
 * @returns {string} 正規化されたパス
 */
function normalizePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return '';
  }
  // バックスラッシュとスラッシュの両方に対応
  return filePath.replace(/\\/g, '/');
}

/**
 * ファイルが存在するか確認（Windows/Unix 両対応）
 *
 * @param {string} filePath - ファイルパス
 * @returns {boolean} ファイルが存在する場合 true
 */
function fileExists(filePath) {
  // スラッシュ形式とバックスラッシュ形式の両方を試す
  const normalizedSlash = filePath.replace(/\\/g, '/');
  const normalizedBackslash = filePath.replace(/\//g, '\\');

  return (
    fs.existsSync(filePath) ||
    fs.existsSync(normalizedSlash) ||
    fs.existsSync(normalizedBackslash)
  );
}

// =============================================================================
// 判定ロジック
// =============================================================================

/**
 * チェック対象のソースファイルかどうか判定
 *
 * 判定基準:
 * - src/ ディレクトリ内のファイル
 * - 設定された拡張子を持つファイル
 *
 * @param {string} filePath - ファイルパス
 * @returns {boolean} チェック対象の場合 true
 */
function isTargetSourceFile(filePath) {
  const normalized = normalizePath(filePath);

  // src/ ディレクトリ内のファイルかチェック
  if (!normalized.includes('/src/') && !normalized.includes('\\src\\')) {
    return false;
  }

  // 拡張子チェック
  return CODE_EXTENSIONS.some((ext) => normalized.endsWith(ext));
}

/**
 * テストファイルかどうか判定
 *
 * @param {string} filePath - ファイルパス
 * @returns {boolean} テストファイルの場合 true
 */
function isTestFile(filePath) {
  const normalized = normalizePath(filePath);
  return TEST_FILE_PATTERNS.some((pattern) => normalized.includes(pattern));
}

/**
 * 除外対象のファイルかどうか判定（型定義など）
 *
 * @param {string} filePath - ファイルパス
 * @returns {boolean} 除外対象の場合 true
 */
function isExcludedFile(filePath) {
  return EXCLUDED_DIR_PATTERNS.some((pattern) => filePath.includes(pattern));
}

/**
 * 対応するテストファイルのパス候補を生成
 *
 * @param {string} filePath - ソースファイルパス
 * @returns {string[]} テストファイルパスの候補配列
 */
function generateTestFilePaths(filePath) {
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);
  const dirName = path.dirname(filePath);

  return [
    // 同一ディレクトリに .test.ts
    path.join(dirName, `${baseName}.test${ext}`),
    // 同一ディレクトリに .spec.ts
    path.join(dirName, `${baseName}.spec${ext}`),
    // __tests__ ディレクトリに .test.ts
    path.join(dirName, '__tests__', `${baseName}.test${ext}`),
    // __tests__ ディレクトリに .spec.ts
    path.join(dirName, '__tests__', `${baseName}.spec${ext}`),
    // 単純な拡張子置換
    filePath.replace(new RegExp(`${ext}$`), `.test${ext}`),
  ];
}

/**
 * 対応するテストファイルが存在するか確認
 *
 * @param {string} filePath - ソースファイルパス
 * @returns {{exists: boolean, checkedPaths: string[]}} 結果
 */
function checkTestFileExists(filePath) {
  const testPaths = generateTestFilePaths(filePath);

  for (const testPath of testPaths) {
    if (fileExists(testPath)) {
      return { exists: true, checkedPaths: testPaths };
    }
  }

  return { exists: false, checkedPaths: testPaths };
}

// =============================================================================
// 警告表示
// =============================================================================

/**
 * テストファースト推奨の警告を表示
 *
 * @param {string} filePath - ソースファイルパス
 * @param {string[]} suggestedPaths - 推奨されるテストファイルパス
 */
function displayWarning(filePath, suggestedPaths) {
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);
  const dirName = path.dirname(filePath);

  console.log('');
  console.log('WARNING: 対応するテストファイルが見つかりません。');
  console.log('');
  console.log('テストファースト開発を推奨します:');
  console.log('  1. まずテストファイルを作成');
  console.log('  2. テストケースを定義');
  console.log('  3. 実装を行う');
  console.log('');
  console.log('テストファイルの配置例:');
  console.log(`  ${dirName}/__tests__/${baseName}.test${ext}`);
  console.log('');
}

// =============================================================================
// メイン処理
// =============================================================================

/**
 * メイン処理
 *
 * @param {object} input - 標準入力から受け取ったJSON
 */
function main(input) {
  // 1. スキップフラグのチェック
  if (process.env.SKIP_TEST_FIRST_CHECK === 'true') {
    debugLog('SKIP_TEST_FIRST_CHECK=true によりスキップ');
    process.exit(0);
  }

  const toolName = input.tool_name;
  const filePath = input.tool_input?.file_path || '';

  // 2. Write ツール以外は許可（新規作成のみチェック）
  if (toolName !== 'Write') {
    process.exit(0);
  }

  // 3. ファイルパスがない場合は許可
  if (!filePath) {
    process.exit(0);
  }

  debugLog('チェック対象:', filePath);

  // 4. 対象外のソースファイルはスキップ
  if (!isTargetSourceFile(filePath)) {
    debugLog('対象外（src外または対象拡張子外）:', filePath);
    process.exit(0);
  }

  // 5. テストファイル自体はスキップ
  if (isTestFile(filePath)) {
    debugLog('テストファイル:', filePath);
    process.exit(0);
  }

  // 6. 除外対象（型定義など）はスキップ
  if (isExcludedFile(filePath)) {
    debugLog('除外対象（型定義など）:', filePath);
    process.exit(0);
  }

  // 7. ファイルが既に存在する場合は新規作成ではないのでスキップ
  if (fileExists(filePath)) {
    debugLog('既存ファイル（新規作成ではない）:', filePath);
    process.exit(0);
  }

  // 8. 対応するテストファイルの存在を確認
  const { exists, checkedPaths } = checkTestFileExists(filePath);

  if (!exists) {
    displayWarning(filePath, checkedPaths);
  } else {
    debugLog('テストファイル存在確認OK');
  }

  // 警告のみで処理は継続（ブロックしない）
  process.exit(0);
}

// =============================================================================
// エントリーポイント
// =============================================================================

if (require.main === module) {
  // 標準入力を非同期で読み取り
  let inputData = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => (inputData += chunk));
  process.stdin.on('end', () => {
    try {
      const input = JSON.parse(inputData);
      main(input);
    } catch (e) {
      // エラー時は通過させる（安全側に倒す）
      debugLog('stdin読み込みエラー:', e.message);
      process.exit(0);
    }
  });
} else {
  // テストから使用される場合
  module.exports = {
    isTargetSourceFile,
    isTestFile,
    isExcludedFile,
    generateTestFilePaths,
    checkTestFileExists,
    normalizePath,
    fileExists,
  };
}
