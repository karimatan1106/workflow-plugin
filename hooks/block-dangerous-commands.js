#!/usr/bin/env node

/**
 * 危険なコマンドをブロックするフック
 * Claude Code自体や重要なプロセスを終了させるコマンドを禁止
 * 
 * @spec docs/workflows/危険コマンドブロックフック修正/spec.md
 */

const fs = require('fs');
const path = require('path');

// ログファイルパス
const LOG_FILE = path.join(__dirname, '.claude-hook-errors.log');

// タイムアウト設定（3秒）
const TIMEOUT_MS = 3000;

/**
 * エラーをログに記録（書き込み失敗時は無視）
 * @param {string} type - エラータイプ
 * @param {string} message - メッセージ
 * @param {string} [details] - 詳細情報
 */
function logError(type, message, details = '') {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [block-dangerous] ${type}: ${message} ${details}\n`;
  try {
    fs.appendFileSync(LOG_FILE, logEntry);
  } catch (e) {
    // ログ書き込み失敗は無視（本処理に影響しないため）
  }
}

// タイムアウト設定
const timeoutId = setTimeout(() => {
  logError('TIMEOUT', 'stdin読み込みタイムアウト');
  process.exit(0);
}, TIMEOUT_MS);

// 禁止パターン
const dangerousPatterns = [
  // PowerShell系
  /\bstop-process\b/i,
  /\bremove-item\b.*-force.*-recurse/i,
  /\bremove-item\b.*-recurse.*-force/i,
  /get-process.*\|\s*stop-process/i,
  /invoke-wmimethod.*terminate/i,
  
  // Windows taskkill系
  /\btaskkill\s+\/f\b/i,
  /\btaskkill\b.*\/pid\b/i,
  /\btaskkill\b.*\/fi\b/i,
  /\btaskkill\b.*\/im\s+\*/i,
  
  // WMI系
  /\bwmic\s+process\s+(delete|terminate)\b/i,
  /\bwmic\s+process\b.*\bdelete\b/i,
  /\bwmic\s+os\b.*\b(shutdown|reboot)\b/i,
  
  // Unix/Linux プロセス終了系
  /\bkill\s+-9\s+-1\b/,
  /\bkill\s+-KILL\s+-1\b/i,
  /\bkillall\s+-9\b/,
  /\bkillall\s+-KILL\b/i,
  /\bpkill\s+-9\b/,
  /\bpkill\s+-KILL\b/i,
  /\bpkill\b.*\bnode\b/i,
  /\bpkill\b.*\bclaude\b/i,
  /\bkillall\b.*\bnode\b/i,
  /\bkillall\b.*\bclaude\b/i,
  
  // システム終了系
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\binit\s+[06]\b/,
  /\bhalt\b/i,
  /\bpoweroff\b/i,
  
  // ファイル破壊系
  /\brm\s+-rf\s+\/(?!\w)/,
  /\bdel\s+\/s\s+\/q\s+c:/i,
  /\bformat\s+c:/i,
  /\brd\s+\/s\s+\/q\s+c:/i,
  
  // フォークボム
  /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;/,
  
  // バイパス対策
  /\bbash\s+-c\s+['"].*\bkill\b/i,
  /\bsh\s+-c\s+['"].*\bkill\b/i,
  /\bbash\s+-c\s+['"].*\bshutdown\b/i,
  /\bsh\s+-c\s+['"].*\bshutdown\b/i,
  /\bpowershell\b.*-command.*\bstop-process\b/i,
  /\bpowershell\b.*-c\s+.*\bstop-process\b/i,
  /\bcmd\s+\/c\b.*\btaskkill\b/i,
  /\beval\s+['"].*\bkill\b/i,
  /\beval\s+['"].*\btaskkill\b/i,
];

// 標準入力からツール入力を読み取る
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  clearTimeout(timeoutId);
  handleInput(input);
});

/**
 * 入力データを処理（コマンドチェック実行）
 * @param {string} inputData - JSON文字列
 */
function handleInput(inputData) {
  try {
    const data = JSON.parse(inputData);
    const command = data.tool_input?.command || data.command || '';

    if (!command) {
      process.exit(0);
    }

    // 危険なコマンドをチェック
    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        const errorMsg = {
          error: '危険なコマンドがブロックされました',
          blocked_pattern: pattern.toString(),
          command_preview: command.substring(0, 100)
        };
        console.error(JSON.stringify(errorMsg));
        logError('BLOCKED', pattern.toString(), command.substring(0, 100));
        process.exit(1);
      }
    }

    process.exit(0);
  } catch (e) {
    logError('PARSE_ERROR', e.message);
    // REQ-3: Fail Closed - エラー時はブロック（FAIL_OPEN=trueで回避可能）
    if (process.env.FAIL_OPEN === 'true') {
      console.error('[block-dangerous-commands] FAIL_OPEN: エラー時に許可');
      process.exit(0);
    }
    process.exit(2);
  }
}

process.stdin.on('error', (err) => {
  clearTimeout(timeoutId);
  logError('STDIN_ERROR', err.message);
  // REQ-3: Fail Closed
  if (process.env.FAIL_OPEN === 'true') {
    console.error('[block-dangerous-commands] FAIL_OPEN: stdin エラー時に許可');
    process.exit(0);
  }
  process.exit(2);
});

process.on('uncaughtException', (err) => {
  clearTimeout(timeoutId);
  logError('UNCAUGHT', err.message, err.stack);
  // REQ-3: Fail Closed
  if (process.env.FAIL_OPEN === 'true') {
    console.error('[block-dangerous-commands] FAIL_OPEN: 未捕捉エラー時に許可');
    process.exit(0);
  }
  process.exit(2);
});
