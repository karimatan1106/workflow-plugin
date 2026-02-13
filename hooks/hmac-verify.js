/**
 * HMAC署名検証モジュール (FR-2)
 *
 * ワークフロー状態ファイルの改竄検出のため、HMAC-SHA256署名を検証する。
 * アルゴリズムはMCPサーバー (mcp-server/src/state/manager.ts) と同一。
 *
 * @spec docs/workflows/ワークフロー全問題完全解決/spec.md FR-2
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// 環境変数または既定値
const STATE_DIR = process.env.STATE_DIR || path.join(process.cwd(), '.claude', 'state');
const HMAC_KEY_PATH = path.join(STATE_DIR, 'hmac.key');
const HMAC_KEYS_PATH = path.join(STATE_DIR, 'hmac-keys.json');

/**
 * REQ-D1: 複数世代のHMAC鍵を読み込む
 *
 * .claude/state/hmac-keys.json から複数世代の署名鍵を読み込む。
 * ファイルが存在しない場合は、既存の単一鍵ファイル（hmac.key）を読み込む。
 *
 * @returns {Array<{generation: number, key: string, createdAt: string}>} 鍵オブジェクト配列
 */
function loadHMACKeys() {
  try {
    // hmac-keys.json を優先
    if (fs.existsSync(HMAC_KEYS_PATH)) {
      const keysContent = fs.readFileSync(HMAC_KEYS_PATH, 'utf-8');
      const keys = JSON.parse(keysContent);

      // 配列形式の検証
      if (!Array.isArray(keys)) {
        console.error('[HMAC] hmac-keys.json の形式が不正です（配列でない）');
        return [];
      }

      // 各鍵オブジェクトの検証
      for (const keyObj of keys) {
        if (!keyObj.generation || !keyObj.key || !keyObj.createdAt) {
          console.error('[HMAC] 鍵オブジェクトに必須フィールドがありません:', keyObj);
          return [];
        }
        // 鍵の形式検証（hexエンコード、64文字）
        if (!/^[0-9a-f]{64}$/i.test(keyObj.key)) {
          console.error('[HMAC] 鍵の形式が不正です（generation:', keyObj.generation, ')');
          return [];
        }
      }

      console.log('[HMAC] hmac-keys.json から', keys.length, '世代の鍵を読み込みました');
      return keys;
    }

    // フォールバック: 既存の単一鍵ファイル（hmac.key）
    if (fs.existsSync(HMAC_KEY_PATH)) {
      const keyContent = fs.readFileSync(HMAC_KEY_PATH, 'utf-8').trim();

      // 鍵の形式を検証（hexエンコード、64文字）
      if (!/^[0-9a-f]{64}$/i.test(keyContent)) {
        console.warn('[HMAC] 鍵ファイルの形式が不正です');
        return [];
      }

      console.log('[HMAC] hmac.key から単一鍵を読み込みました（フォールバック）');
      return [{
        generation: 1,
        key: keyContent,
        createdAt: new Date().toISOString()
      }];
    }

    console.error('[HMAC] HMAC鍵ファイルが見つかりません');
    return [];
  } catch (error) {
    console.error('[HMAC] 鍵読み込みエラー:', error.message);
    return [];
  }
}

/**
 * HMAC署名鍵を読み込む（後方互換用）
 *
 * .claude/state/hmac.key から署名鍵を読み込む。
 * ファイルが存在しない場合は null を返す。
 *
 * @returns {string|null} 署名鍵（hexエンコード、64文字）または null
 */
function loadHMACKey() {
  const keys = loadHMACKeys();
  if (keys.length === 0) {
    return null;
  }
  // 最新世代の鍵を返す
  return keys[keys.length - 1].key;
}

/**
 * 署名対象のJSONデータを生成
 *
 * @param {Object} state - タスク状態オブジェクト
 * @returns {string} JSON文字列（キーソート済み）
 */
function generateSignatureData(state) {
  const { stateIntegrity, ...stateWithoutSignature } = state;
  const sortedKeys = Object.keys(stateWithoutSignature).sort();
  return JSON.stringify(stateWithoutSignature, sortedKeys);
}

/**
 * HMAC-SHA256を計算
 *
 * @param {Buffer} key - HMAC鍵（バイナリ）
 * @param {string} data - 署名対象データ
 * @returns {string} HMAC署名（base64エンコード）
 */
function computeHMACSHA256(key, data) {
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(data, 'utf8');
  return hmac.digest('base64');
}

/**
 * タスク状態のHMAC署名を計算する
 *
 * manager.ts の generateStateHmac() と同一のアルゴリズム:
 * 1. stateIntegrity フィールドを除外
 * 2. 残りのフィールドをキーでソート
 * 3. JSON.stringify
 * 4. HMAC-SHA256 でハッシュ化
 * 5. base64 エンコード
 *
 * @param {Object} state - タスク状態オブジェクト
 * @returns {string} HMAC署名（base64エンコード）
 */
function calculateHMAC(state) {
  const data = generateSignatureData(state);
  const keyHex = loadHMACKey();
  if (!keyHex) {
    throw new Error('HMAC鍵が見つかりません');
  }
  const key = Buffer.from(keyHex, 'hex');
  return computeHMACSHA256(key, data);
}

/**
 * 単一の鍵でHMAC署名を検証
 *
 * @param {string} data - 署名対象データ
 * @param {Buffer} keyBuffer - HMAC鍵（バイナリ）
 * @param {Buffer} expectedBuffer - 期待されるHMAC値（バイナリ）
 * @returns {boolean} 検証成功の場合 true
 */
function verifyWithKey(data, keyBuffer, expectedBuffer) {
  const actualDigest = computeHMACSHA256(keyBuffer, data);
  const actualBuffer = Buffer.from(actualDigest, 'base64');

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  // タイミング攻撃を防ぐため timingSafeEqual を使用
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

/**
 * REQ-D1: 複数世代の鍵でHMAC署名を検証（フォールバック）
 *
 * 最新世代鍵から順に検証を試行し、いずれかの鍵で検証成功した場合はtrueを返す。
 *
 * @param {Object} state - タスク状態オブジェクト
 * @param {string} signature - 検証対象のHMAC署名（base64エンコード）
 * @param {Array<{generation: number, key: string, createdAt: string}>} keys - 鍵オブジェクト配列
 * @returns {boolean} 検証成功の場合 true
 */
function verifyHMACWithMultipleKeys(state, signature, keys) {
  if (keys.length === 0) {
    console.error('[HMAC] 鍵が読み込まれていません');
    return false;
  }

  const data = generateSignatureData(state);
  const expectedBuffer = Buffer.from(signature, 'base64');

  // 最新世代鍵（配列末尾）から順に検証
  for (let i = keys.length - 1; i >= 0; i--) {
    const keyObj = keys[i];
    const keyBuffer = Buffer.from(keyObj.key, 'hex');

    try {
      if (verifyWithKey(data, keyBuffer, expectedBuffer)) {
        if (i < keys.length - 1) {
          console.log('[HMAC] 過去世代の鍵で検証成功（generation:', keyObj.generation, ')');
        }
        return true;
      }
    } catch (error) {
      console.error('[HMAC] 世代', keyObj.generation, 'の検証エラー:', error.message);
    }
  }

  console.warn('[HMAC] 全世代の鍵で検証失敗');
  return false;
}

/**
 * タスク状態のHMAC署名を検証する
 *
 * デフォルトで厳格モード。HMAC_STRICT=false の場合のみ緩和モード。
 *
 * @param {Object} state - タスク状態オブジェクト
 * @returns {boolean} 検証成功の場合 true
 */
function verifyHMAC(state) {
  // 緩和モード（開発・移行時のみ）
  // REQ-2: HMAC_STRICT bypass removed

  // 厳格モード（デフォルト）
  const expectedHmac = state.stateIntegrity;

  if (!expectedHmac || expectedHmac.trim() === '') {
    console.warn('[HMAC] 署名なし - 拒否');
    return false;
  }

  try {
    // REQ-D1: 複数世代鍵の読み込みと検証
    const keys = loadHMACKeys();
    if (keys.length === 0) {
      console.error('[HMAC] HMAC鍵が見つかりません - 拒否');
      return false;
    }

    const isValid = verifyHMACWithMultipleKeys(state, expectedHmac, keys);

    if (!isValid) {
      console.warn('[HMAC] 署名不一致 - 拒否');
      console.warn('[HMAC] 状態ファイルが改竄されている可能性があります');
      return false;
    }

    return true;
  } catch (error) {
    console.error('[HMAC] 検証エラー - 拒否:', error.message);
    return false;
  }
}

module.exports = {
  loadHMACKey,
  loadHMACKeys,  // REQ-D1: テスト用にエクスポート
  verifyHMACWithMultipleKeys,  // REQ-D1: テスト用にエクスポート
  calculateHMAC,
  verifyHMAC,
};
