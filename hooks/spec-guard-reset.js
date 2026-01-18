#!/usr/bin/env node
/**
 * 仕様書ガード状態リセットフック (PostToolUse)
 *
 * git commit 完了後に仕様書更新フラグをリセット。
 * 次の変更サイクルでは再度仕様書の更新が必要になる。
 */

const HOOK_NAME = 'spec-guard-reset.js';
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

// 状態ファイルのパス
const STATE_DIR = process.env.STATE_DIR || path.join(process.cwd(), '.claude', 'state');
const STATE_FILE = path.join(STATE_DIR, 'spec-guard-state.json');

// 状態ディレクトリを作成
if (!fs.existsSync(STATE_DIR)) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

/**
 * 状態をリセット
 */
function resetState() {
  const state = {
    specUpdated: false,
    updatedAt: null,
    files: [],
    lastResetAt: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {
    // エラーは無視
  }
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

    const toolName = input.tool_name;
    const toolInput = input.tool_input || {};

    // Bash ツールのみチェック
    if (toolName !== 'Bash') {
      process.exit(0);
    }

    const command = toolInput.command || '';

    // git commit コマンドの場合 → 状態をリセット
    if (command.includes('git commit')) {
      resetState();
      console.log('');
      console.log('仕様書ガード状態をリセットしました');
      console.log('   次の変更では再度仕様書の更新が必要です');
    }
  } catch (e) {
    // エラーは無視して正常終了
  }

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
process.stdin.on('end', () => {
  clearTimeout(timeout);
  try {
    const input = JSON.parse(inputData);
    main(input);
  } catch (e) {
    process.exit(0);
  }
});
process.stdin.on('error', () => {
  clearTimeout(timeout);
  process.exit(0);
});
