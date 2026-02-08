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

/**
 * HMAC署名鍵を読み込む
 *
 * .claude/state/hmac.key から署名鍵を読み込む。
 * ファイルが存在しない場合は null を返す。
 *
 * @returns {string|null} 署名鍵（hexエンコード、64文字）または null
 */
function loadHMACKey() {
  try {
    if (!fs.existsSync(HMAC_KEY_PATH)) {
      return null;
    }

    const keyContent = fs.readFileSync(HMAC_KEY_PATH, 'utf-8').trim();

    // 鍵の形式を検証（hexエンコード、64文字）
    if (!/^[0-9a-f]{64}$/i.test(keyContent)) {
      console.warn('[HMAC] 鍵ファイルの形式が不正です');
      return null;
    }

    return keyContent;
  } catch (error) {
    console.error('[HMAC] 鍵読み込みエラー:', error.message);
    return null;
  }
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
  // stateIntegrity を除外
  const { stateIntegrity, ...stateWithoutSignature } = state;

  // キーをソート
  const sortedKeys = Object.keys(stateWithoutSignature).sort();

  // ソート順でJSON文字列を生成
  const data = JSON.stringify(stateWithoutSignature, sortedKeys);

  // HMAC鍵を取得
  const keyHex = loadHMACKey();
  if (!keyHex) {
    throw new Error('HMAC鍵が見つかりません');
  }

  // HEXからBufferに変換
  const key = Buffer.from(keyHex, 'hex');

  // HMAC-SHA256 計算
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(data, 'utf8');

  // base64 エンコード
  return hmac.digest('base64');
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
  if (process.env.HMAC_STRICT === 'false') {
    console.warn('[HMAC] 緩和モード: 署名検証をスキップします（HMAC_STRICT=false）');
    return true;
  }

  // 厳格モード（デフォルト）
  const expectedHmac = state.stateIntegrity;

  if (!expectedHmac || expectedHmac.trim() === '') {
    console.warn('[HMAC] 署名なし - 拒否');
    return false;
  }

  try {
    const actualHmac = calculateHMAC(state);

    const expectedBuffer = Buffer.from(expectedHmac, 'base64');
    const actualBuffer = Buffer.from(actualHmac, 'base64');

    if (expectedBuffer.length !== actualBuffer.length) {
      console.warn('[HMAC] 署名長さ不一致 - 拒否');
      return false;
    }

    // タイミング攻撃を防ぐため timingSafeEqual を使用
    const isValid = crypto.timingSafeEqual(expectedBuffer, actualBuffer);

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
  calculateHMAC,
  verifyHMAC,
};
