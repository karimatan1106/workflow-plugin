#!/usr/bin/env node
/**
 * 無限ループ検出フック (PreToolUse)
 *
 * Edit/Write ツール使用時に無限ループ（同一ファイルの繰り返し編集）を検出する。
 * 5分以内に同一ファイルが5回以上編集された場合に警告を表示し、処理を中止する。
 *
 * 設定可能な環境変数:
 * - SKIP_LOOP_DETECTION: "true" で無効化
 *
 * @spec docs/specs/infrastructure/loop-detector.md
 */

const fs = require('fs');
const path = require('path');

// 設定
const STATE_FILE = path.join(process.cwd(), '.claude-loop-detector-state.json');
const LOG_FILE = path.join(process.cwd(), '.claude-loop-detection-log.json');
const EDIT_THRESHOLD = 5; // 警告閾値（5回以上）
const TIME_WINDOW = 5 * 60 * 1000; // 時間ウィンドウ（5分）
const WARNING_SUPPRESS_TIME = 60 * 1000; // 警告抑止期間（1分）

/**
 * ファイルパスを正規化
 * - スラッシュをスラッシュで統一
 * - 大文字を小文字に統一
 * - 先頭の ./ を削除
 *
 * @param {string} filePath - 正規化対象のファイルパス
 * @returns {string} 正規化されたファイルパス
 */
function normalizeFilePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return '';
  }

  return filePath
    .replace(/\\/g, '/') // バックスラッシュをスラッシュに
    .toLowerCase() // 小文字に統一
    .replace(/^\.\//, ''); // 先頭の ./ を削除
}

/**
 * 状態ファイルを読み込む
 */
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const content = fs.readFileSync(STATE_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (e) {
    // JSON解析エラーの場合は自動リセット
    logError('状態ファイル読み込みエラー（自動リセット）', e);
    return { files: {} };
  }
  return { files: {} };
}

/**
 * 状態ファイルを保存
 */
function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {
    // ファイル保存エラーは無視（DoS防止）
    logError('状態ファイル保存エラー（無視）', e);
  }
}

/**
 * ログファイルを読み込む
 * @returns {Array} ログエントリの配列
 */
function loadLogs() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      try {
        return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
      } catch (e) {
        // JSON解析エラーは無視
        return [];
      }
    }
  } catch (e) {
    // ファイル操作エラーは無視
  }
  return [];
}

/**
 * ログファイルを保存
 * @param {Array} logs - 保存するログエントリの配列
 */
function saveLogs(logs) {
  try {
    // 最新100件のみ保持
    const trimmedLogs = logs.length > 100 ? logs.slice(-100) : logs;
    fs.writeFileSync(LOG_FILE, JSON.stringify(trimmedLogs, null, 2), 'utf8');
  } catch (e) {
    // ファイル保存エラーは無視（DoS防止）
  }
}

/**
 * ログファイルにエラーを記録
 * @param {string} message - エラーメッセージ
 * @param {Error} error - エラーオブジェクト
 */
function logError(message, error) {
  const logs = loadLogs();
  logs.push({
    timestamp: new Date().toISOString(),
    type: 'error',
    message,
    error: error ? error.message : undefined,
  });
  saveLogs(logs);
}

/**
 * ログファイルに警告を記録
 * @param {string} filePath - 警告対象のファイルパス
 * @param {number} count - 編集回数
 */
function logWarning(filePath, count) {
  const logs = loadLogs();
  logs.push({
    timestamp: new Date().toISOString(),
    type: 'warning',
    filePath,
    count,
  });
  saveLogs(logs);
}

/**
 * 警告メッセージを表示
 * @param {string} filePath - 警告対象のファイルパス
 * @param {number} count - 編集回数
 */
function displayWarning(filePath, count) {
  console.log('');
  console.log('='.repeat(60));
  console.log(' 無限ループ検出: 編集回数が多すぎます');
  console.log('='.repeat(60));
  console.log('');
  console.log(` ファイル: ${filePath}`);
  console.log(` 編集回数: ${count}回（5分以内）`);
  console.log('');
  console.log(' 原因として考えられること:');
  console.log('   - 同じエラーを何度も繰り返し修正しようとしている');
  console.log('   - テストとコードの同期が取れていない');
  console.log('   - 修正内容が不完全で何度も編集を繰り返している');
  console.log('');
  console.log(' 対策:');
  console.log('   1. 一度立ち止まり、エラーの根本原因を分析する');
  console.log('   2. テスト結果を確認し、実装に反映できているか確認する');
  console.log('   3. 仕様書と実装の乖離がないか確認する');
  console.log('   4. ビルド/テスト結果を確認してから編集を再開する');
  console.log('');
  console.log(' 強制スキップ（非推奨）:');
  console.log('   SKIP_LOOP_DETECTION=true 環境変数を設定');
  console.log('');
  console.log('='.repeat(60));
}

/**
 * 古いタイムスタンプを削除
 * @param {Array<string>} timestamps - タイムスタンプの配列
 * @param {number} now - 現在時刻（ミリ秒）
 * @returns {Array<string>} フィルタリング後のタイムスタンプ配列
 */
function filterOldTimestamps(timestamps, now) {
  const cutoffTime = now - TIME_WINDOW;
  return timestamps.filter((ts) => {
    const timestamp = new Date(ts).getTime();
    return timestamp > cutoffTime;
  });
}

/**
 * 警告抑止期間中かどうかを判定
 * @param {string|null} lastWarning - 最後の警告時刻（ISO文字列）
 * @param {number} now - 現在時刻（ミリ秒）
 * @returns {boolean} 抑止中の場合はtrue
 */
function isWarningSuppressionActive(lastWarning, now) {
  if (!lastWarning) {
    return false;
  }
  const lastWarningTime = new Date(lastWarning).getTime();
  return now - lastWarningTime < WARNING_SUPPRESS_TIME;
}

/**
 * ファイルエントリを初期化
 * @param {object} state - 状態オブジェクト
 * @param {string} normalizedPath - 正規化されたファイルパス
 */
function initializeFileEntry(state, normalizedPath) {
  if (!state.files) {
    state.files = {};
  }
  if (!state.files[normalizedPath]) {
    state.files[normalizedPath] = {
      count: 0,
      timestamps: [],
      lastWarning: null,
      warningSuppress: false,
    };
  }
}

/**
 * ファイルの編集履歴をチェック
 * @param {string} filePath - チェック対象のファイルパス
 */
function checkLoop(filePath) {
  // パス正規化
  const normalizedPath = normalizeFilePath(filePath);
  if (!normalizedPath) {
    return; // 空パスは処理しない
  }

  // 状態を読み込む
  const state = loadState();
  const now = Date.now();

  // ファイルエントリを初期化
  initializeFileEntry(state, normalizedPath);
  const fileEntry = state.files[normalizedPath];

  // 古いタイムスタンプを削除
  fileEntry.timestamps = filterOldTimestamps(fileEntry.timestamps, now);

  // 新しいタイムスタンプを追加
  fileEntry.timestamps.push(new Date(now).toISOString());

  // 警告抑止期間をチェック
  const shouldSuppress = isWarningSuppressionActive(fileEntry.lastWarning, now);
  if (fileEntry.lastWarning && !shouldSuppress) {
    // 抑止期間が終了した
    fileEntry.lastWarning = null;
  }

  // 警告条件をチェック
  if (fileEntry.timestamps.length >= EDIT_THRESHOLD && !shouldSuppress) {
    // 警告を発火
    displayWarning(filePath, fileEntry.timestamps.length);

    // ログに記録
    logWarning(filePath, fileEntry.timestamps.length);

    // 警告時刻を記録（抑止用）
    fileEntry.lastWarning = new Date(now).toISOString();

    // 状態を保存
    saveState(state);

    // 処理を中止
    process.exit(1);
  }

  // 状態を保存
  saveState(state);
}

/**
 * メイン処理
 */
function main(input) {
  // スキップフラグのチェック
  if (process.env.SKIP_LOOP_DETECTION === 'true') {
    process.exit(0);
  }

  const toolName = input.tool_name;
  const toolInput = input.tool_input || {};

  // Edit/Write ツール以外は許可
  if (toolName !== 'Edit' && toolName !== 'Write') {
    process.exit(0);
  }

  const filePath = toolInput.file_path || '';

  // ファイルパスがない場合は許可
  if (!filePath) {
    process.exit(0);
  }

  // ループ検出
  checkLoop(filePath);

  // 正常終了
  process.exit(0);
}

// モジュール化対応（テスト用）
if (require.main === module) {
  // 非同期stdin読み取り
  let inputData = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => (inputData += chunk));
  process.stdin.on('end', () => {
    try {
      const input = JSON.parse(inputData);
      main(input);
    } catch (e) {
      // stdin からの入力がない場合は許可
      process.exit(0);
    }
  });
} else {
  // テストから使用される場合
  class LoopDetector {
    constructor(stateFilePath = STATE_FILE) {
      this.stateFilePath = stateFilePath;
    }

    checkLoop(filePath) {
      checkLoop(filePath);
    }

    loadState() {
      return loadState();
    }

    saveState(state) {
      saveState(state);
    }

    normalizeFilePath(filePath) {
      return normalizeFilePath(filePath);
    }
  }

  module.exports = LoopDetector;
}
