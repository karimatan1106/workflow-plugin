#!/usr/bin/env node
/**
 * 仕様ファースト強制ガード (PreToolUse)
 *
 * Edit/Write ツール使用前に、仕様書が更新されているかチェックする。
 * 仕様書更新前にコードを編集しようとするとブロックする。
 *
 * 設定可能な環境変数:
 * - SPEC_DIR: 仕様書ディレクトリ（デフォルト: docs/specs）
 * - CODE_DIRS: コードディレクトリのカンマ区切りリスト（デフォルト: src）
 * - SKIP_SPEC_GUARD: "true" で一時的にスキップ
 */

const HOOK_NAME = 'spec-first-guard.js';
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

// 設定
const SPEC_DIR = process.env.SPEC_DIR || 'docs/specs';
const CODE_DIRS = (process.env.CODE_DIRS || 'src').split(',').map((d) => d.trim());
const STATE_DIR = process.env.STATE_DIR || path.join(process.cwd(), '.claude', 'state');
const STATE_FILE = path.join(STATE_DIR, 'spec-guard-state.json');

// 状態ディレクトリを作成
if (!fs.existsSync(STATE_DIR)) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

/**
 * 状態を読み込む
 */
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (e) {
    // エラーは無視
  }
  return { specUpdated: false, updatedAt: null, files: [] };
}

/**
 * 状態を保存
 */
function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {
    // エラーは無視
  }
}

/**
 * 仕様書パスかどうかを判定
 */
function isSpecPath(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.includes(SPEC_DIR) && normalized.endsWith('.md');
}

/**
 * コードパスかどうかを判定
 */
function isCodePath(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  const codeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

  // テストファイルは除外
  if (normalized.includes('.test.') || normalized.includes('.spec.') || normalized.includes('__tests__')) {
    return false;
  }

  // コードディレクトリ内かチェック
  const isInCodeDir = CODE_DIRS.some((dir) => normalized.includes(`/${dir}/`) || normalized.includes(`\\${dir}\\`));

  // コード拡張子かチェック
  const hasCodeExtension = codeExtensions.some((ext) => normalized.endsWith(ext));

  return isInCodeDir && hasCodeExtension;
}

/**
 * メイン処理
 */
function main(input) {
  try {
    // 入力の検証
    if (!input || typeof input !== 'object') {
      process.exit(0);
    }

    // スキップフラグのチェック
    if (process.env.SKIP_SPEC_GUARD === 'true') {
      process.exit(0);
    }

    const toolName = input.tool_name;
    const toolInput = input.tool_input || {};

    // Edit/Write ツール以外は許可
    if (toolName !== 'Edit' && toolName !== 'Write') {
      process.exit(0);
    }

    const filePath = toolInput.file_path || '';

    // 仕様書ファイルの編集 → 状態を更新して許可
    if (isSpecPath(filePath)) {
      const state = loadState();
      state.specUpdated = true;
      state.updatedAt = new Date().toISOString();
      if (!state.files.includes(filePath)) {
        state.files.push(filePath);
      }
      saveState(state);
      process.exit(0);
    }

    // コードファイルの編集 → 仕様書更新済みかチェック
    if (isCodePath(filePath)) {
      const state = loadState();

      if (!state.specUpdated) {
        // ブロック
        console.log('');
        console.log('='.repeat(60));
        console.log(' 仕様ファースト違反');
        console.log('='.repeat(60));
        console.log('');
        console.log(' コードを編集する前に、仕様書を更新してください。');
        console.log('');
        console.log(' 手順:');
        console.log(`   1. ${SPEC_DIR}/ 内の該当仕様書を更新`);
        console.log('   2. 仕様書に変更内容を記載');
        console.log('   3. その後コードを編集');
        console.log('');
        console.log(' スキップ（緊急時のみ）:');
        console.log('   SKIP_SPEC_GUARD=true を設定');
        console.log('');
        console.log('='.repeat(60));
        process.exit(2); // ブロック
      }
    }
  } catch (e) {
    // エラー時は許可（安全側に倒す）
  }

  // それ以外は許可
  process.exit(0);
}

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
    process.exit(0);
  }
});
