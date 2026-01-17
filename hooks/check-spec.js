#!/usr/bin/env node
/**
 * コード配下への新規ファイル作成時に仕様書の存在をチェック
 * 仕様書がない場合はブロック（終了コード2）
 *
 * 環境変数:
 *   WORKFLOW_CODE_DIRS - チェック対象のコードディレクトリ（カンマ区切り）
 *                        例: "src,lib,packages"
 *                        デフォルト: "src"
 *   WORKFLOW_SPEC_DIR  - 仕様書ディレクトリのパス（プロジェクトルートからの相対パス）
 *                        例: "docs/specs/features"
 *                        デフォルト: "docs/specs/features"
 */

const HOOK_NAME = 'check-spec.js';
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

// 環境変数からの設定（デフォルト値付き）
const CODE_DIRS = (process.env.WORKFLOW_CODE_DIRS || 'src').split(',').map(d => d.trim());
const SPEC_DIR = process.env.WORKFLOW_SPEC_DIR || 'docs/specs/features';

// タイムアウト処理（3秒）
const timeout = setTimeout(() => {
  process.exit(0);
}, 3000);

// 標準入力からツール情報を読み取り
let inputData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => inputData += chunk);
process.stdin.on('error', () => {
  clearTimeout(timeout);
  process.exit(0);
});
process.stdin.on('end', () => {
  clearTimeout(timeout);
  try {
    const data = JSON.parse(inputData);
    const filePath = data.tool_input?.file_path || '';

    // 対象ディレクトリかチェック
    const isTargetDir = CODE_DIRS.some(dir => {
      // Windowsパス区切りとUnixパス区切りの両方に対応
      const normalizedPath = filePath.replace(/\\/g, '/');
      return normalizedPath.includes(`/${dir}/`) || normalizedPath.includes(`\\${dir}\\`);
    });

    if (!isTargetDir) {
      process.exit(0); // 対象外
    }

    // 除外パターン
    const excludePatterns = [
      /\/docs\//,           // docs配下は除外
      /\/test\//,           // test配下は除外
      /\/tests\//,          // tests配下は除外
      /\/__tests__\//,      // __tests__配下は除外
      /\/node_modules\//,   // node_modules除外
      /\/dist\//,           // dist除外
      /\/build\//,          // build除外
      /package\.json$/,     // package.json除外
      /tsconfig.*\.json$/,  // tsconfig除外
      /\.d\.ts$/,           // 型定義除外
      /\.claude\//,         // .claude除外
      /\.test\.[jt]sx?$/,   // テストファイル除外
      /\.spec\.[jt]sx?$/,   // specファイル除外
    ];

    for (const pattern of excludePatterns) {
      if (pattern.test(filePath)) {
        process.exit(0); // 除外対象
      }
    }

    // 対象拡張子
    const targetExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];
    const ext = path.extname(filePath);
    if (!targetExtensions.includes(ext)) {
      process.exit(0); // 対象外の拡張子
    }

    // 既存ファイルの編集は許可
    if (fs.existsSync(filePath)) {
      process.exit(0); // 既存ファイルの編集は許可
    }

    // 仕様書ディレクトリのパスを解決
    const specsDir = path.join(process.cwd(), SPEC_DIR);

    if (!fs.existsSync(specsDir)) {
      console.error(`[BLOCKED] 仕様書ディレクトリが存在しません: ${specsDir}`);
      console.error(`新規ファイル作成の前に、仕様書を作成してください。`);
      process.exit(2);
    }

    // 仕様書があるかチェック（ファイル名から推測）
    const fileName = path.basename(filePath, ext);
    const specFiles = fs.readdirSync(specsDir);

    // 仕様書の命名規則: ファイル名に関連する.mdファイル
    const hasSpec = specFiles.some(spec => {
      const specName = spec.replace('.md', '').toLowerCase();
      return fileName.toLowerCase().includes(specName) ||
             specName.includes(fileName.toLowerCase());
    });

    if (!hasSpec) {
      console.error(`\n[BLOCKED] 仕様書なしでの新規ファイル作成は禁止されています`);
      console.error(`\n対象ファイル: ${filePath}`);
      console.error(`\n対応方法:`);
      console.error(`  1. ${SPEC_DIR}/ に仕様書を作成`);
      console.error(`  2. ユーザーの承認を得る`);
      console.error(`  3. その後で実装を開始\n`);
      process.exit(2); // ブロック
    }

    process.exit(0); // 許可
  } catch (e) {
    // エラー時はブロック（安全側に倒す）
    console.error('[check-spec] エラー:', e.message);
    process.exit(2);
  }
});
