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

/**
 * SEC-3: コマンド正規化関数
 * クォート・エスケープ・空白を正規化し、難読化されたコマンドを検出可能にする
 * @param {string} cmd - 正規化対象のコマンド文字列
 * @returns {string} 正規化されたコマンド文字列
 */
function normalizeCommand(cmd) {
  try {
    let normalized = cmd;
    // 1. クォート除去（シングル・ダブル）
    normalized = normalized.replace(/['"]/g, '');
    // 2. エスケープシーケンス解決
    normalized = normalized.replace(/\\(.)/g, '$1');
    // 3. 空白正規化
    normalized = normalized.replace(/\s+/g, ' ').trim();
    // 4. 小文字化
    normalized = normalized.toLowerCase();
    return normalized;
  } catch (e) {
    // 正規化エラー時は元のコマンドを返す（fail-closed）
    logError('NORMALIZE_ERROR', e.message, cmd.substring(0, 100));
    return cmd;
  }
}

/**
 * SEC-3: 正規化ログ記録
 * 元のコマンドと正規化後のコマンドが異なる場合にログに記録
 * @param {string} original - 元のコマンド
 * @param {string} normalized - 正規化後のコマンド
 */
function logNormalization(original, normalized) {
  if (original !== normalized) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [block-dangerous] NORMALIZATION:\n  Original: ${original.substring(0, 200)}\n  Normalized: ${normalized.substring(0, 200)}\n`;
    try {
      fs.appendFileSync(LOG_FILE, logEntry);
    } catch (e) {
      // ログ書き込み失敗は無視
    }
  }
}

// タイムアウト設定
const timeoutId = setTimeout(() => {
  logError('TIMEOUT', 'stdin読み込みタイムアウト');
  process.exit(0);
}, TIMEOUT_MS);

// 禁止パターン（SEC-3: 単語境界チェック強化）
const dangerousPatterns = [
  // PowerShell系
  /\bstop-process\b/i,
  /\bremove-item\b.*-force.*-recurse/i,
  /\bremove-item\b.*-recurse.*-force/i,
  /\bget-process\b.*\|\s*\bstop-process\b/i,
  /\binvoke-wmimethod\b.*\bterminate\b/i,

  // Windows taskkill系
  /\btaskkill\b\s+\/f\b/i,
  /\btaskkill\b.*\/pid\b/i,
  /\btaskkill\b.*\/fi\b/i,
  /\btaskkill\b.*\/im\s+\*/i,

  // WMI系
  /\bwmic\b\s+\bprocess\b\s+(\bdelete\b|\bterminate\b)/i,
  /\bwmic\b\s+\bprocess\b.*\bdelete\b/i,
  /\bwmic\b\s+\bos\b.*\b(shutdown|reboot)\b/i,

  // Unix/Linux プロセス終了系
  /\bkill\b\s+-9\s+-1\b/,
  /\bkill\b\s+-KILL\s+-1\b/i,
  /\bkillall\b\s+-9\b/,
  /\bkillall\b\s+-KILL\b/i,
  /\bpkill\b\s+-9\b/,
  /\bpkill\b\s+-KILL\b/i,
  /\bpkill\b.*\bnode\b/i,
  /\bpkill\b.*\bclaude\b/i,
  /\bkillall\b.*\bnode\b/i,
  /\bkillall\b.*\bclaude\b/i,

  // システム終了系
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\binit\b\s+[06]\b/,
  /\bhalt\b/i,
  /\bpoweroff\b/i,

  // ファイル破壊系
  /\brm\b\s+-rf\s+\/(?!\w)/,
  /\bdel\b\s+\/s\s+\/q\s+c:/i,
  /\bformat\b\s+c:/i,
  /\brd\b\s+\/s\s+\/q\s+c:/i,

  // フォークボム
  /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;/,

  // バイパス対策
  /\bbash\b\s+-c\s+['"].*\bkill\b/i,
  /\bsh\b\s+-c\s+['"].*\bkill\b/i,
  /\bbash\b\s+-c\s+['"].*\bshutdown\b/i,
  /\bsh\b\s+-c\s+['"].*\bshutdown\b/i,
  /\bpowershell\b.*-command.*\bstop-process\b/i,
  /\bpowershell\b.*-c\s+.*\bstop-process\b/i,
  /\bcmd\b\s+\/c\b.*\btaskkill\b/i,
  /\beval\b\s+['"].*\bkill\b/i,
  /\beval\b\s+['"].*\btaskkill\b/i,
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

    // SEC-3: コマンド正規化
    const normalizedCommand = normalizeCommand(command);
    logNormalization(command, normalizedCommand);

    // 危険なコマンドをチェック（元のコマンドと正規化後の両方）
    for (const pattern of dangerousPatterns) {
      if (pattern.test(command) || pattern.test(normalizedCommand)) {
        const errorMsg = {
          error: '危険なコマンドがブロックされました',
          blocked_pattern: pattern.toString(),
          command_preview: command.substring(0, 100)
        };
        console.error(JSON.stringify(errorMsg));
        logError('BLOCKED', pattern.toString(), command.substring(0, 100));
        // REQ-C4: fail-closed principle - exit code 2 for security violations
        process.exit(2);
      }
    }

    process.exit(0);
  } catch (e) {
    logError('PARSE_ERROR', e.message);
    // REQ-3: Fail Closed - エラー時はブロック
    process.exit(2);
  }
}

process.stdin.on('error', (err) => {
  clearTimeout(timeoutId);
  logError('STDIN_ERROR', err.message);
  // REQ-3: Fail Closed
  process.exit(2);
});

process.on('uncaughtException', (err) => {
  clearTimeout(timeoutId);
  logError('UNCAUGHT', err.message, err.stack);
  // REQ-3: Fail Closed
  process.exit(2);
});
