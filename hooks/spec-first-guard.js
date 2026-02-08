#!/usr/bin/env node
/**
 * 仕様ファースト強制ガード (PreToolUse)
 *
 * Edit/Write ツール使用前に、仕様書が更新されているかチェックする。
 * 仕様書更新前にコードを編集しようとするとブロックする。
 *
 * 設定可能な環境変数:
 * - SPEC_DIR: 仕様書ディレクトリ（デフォルト: docs/spec/features）
 * - CODE_DIRS: コードディレクトリのカンマ区切りリスト（デフォルト: src）
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
const crypto = require('crypto');

// 設定
const SPEC_DIR = process.env.SPEC_DIR || 'docs/spec/features';
const CODE_DIRS = (process.env.CODE_DIRS || 'src').split(',').map((d) => d.trim());
const STATE_DIR = process.env.STATE_DIR || path.join(process.cwd(), '.claude', 'state');
const STATE_FILE = path.join(STATE_DIR, 'spec-guard-state.json');
const HMAC_KEY_PATH = path.join(STATE_DIR, 'hmac.key');

// 状態ディレクトリを作成
if (!fs.existsSync(STATE_DIR)) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

/**
 * HMAC鍵をロード、または生成（REQ-4）
 */
function loadOrGenerateHmacKey() {
  try {
    if (fs.existsSync(HMAC_KEY_PATH)) {
      return fs.readFileSync(HMAC_KEY_PATH, 'utf8').trim();
    }
    // 鍵を新規生成（256ビット = 32バイト = 64文字のhex）
    const key = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(HMAC_KEY_PATH, key, 'utf8');
    return key;
  } catch (e) {
    logError('HMAC鍵エラー', e.message, e.stack);
    process.exit(1);
  }
}

/**
 * 状態のHMAC署名を生成（REQ-4）
 */
function generateStateHmac(state) {
  const key = loadOrGenerateHmacKey();
  const hmac = crypto.createHmac('sha256', key);
  const data = JSON.stringify({
    specUpdated: state.specUpdated,
    updatedAt: state.updatedAt,
    files: state.files,
  });
  hmac.update(data);
  return hmac.digest('hex');
}

/**
 * 状態のHMAC署名を検証（REQ-4）
 */
function verifyStateHmac(state, expectedSignature) {
  const actualSignature = generateStateHmac(state);
  return actualSignature === expectedSignature;
}

/**
 * 状態を読み込む（REQ-4: HMAC署名検証付き）
 */
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));

      if (raw.signature) {
        // 署名検証
        if (!verifyStateHmac(raw, raw.signature)) {
          // fail-closed: 改ざん検知時は状態ファイルを削除して初期状態に
          logError('状態ファイル改ざん検知', 'HMAC署名が一致しません。ファイルを初期化します。', null);
          fs.unlinkSync(STATE_FILE);
          return { specUpdated: false, updatedAt: null, files: [] };
        }
        return raw;
      } else {
        // 署名なし旧形式: 署名を追加して保存
        const state = { specUpdated: raw.specUpdated, updatedAt: raw.updatedAt, files: raw.files };
        saveState(state);
        return state;
      }
    }
  } catch (e) {
    logError('状態読み込みエラー', e.message, e.stack);
    // fail-closed: エラー時は初期状態
    return { specUpdated: false, updatedAt: null, files: [] };
  }
  // fail-closed: ファイル不存在時は初期状態
  return { specUpdated: false, updatedAt: null, files: [] };
}

/**
 * 状態を保存（REQ-4: HMAC署名付き）
 */
function saveState(state) {
  try {
    const signature = generateStateHmac(state);
    const signedState = { ...state, signature };
    fs.writeFileSync(STATE_FILE, JSON.stringify(signedState, null, 2), 'utf8');
  } catch (e) {
    logError('状態保存エラー', e.message, e.stack);
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
