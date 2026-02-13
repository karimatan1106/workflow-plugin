/**
 * HMAC鍵管理モジュール（REQ-9: 鍵ローテーション対応）
 *
 * 複数世代の鍵を保持し、署名生成は最新鍵、検証は全有効鍵で実行する。
 * これにより鍵ローテーション後も古い署名のタスクが読み取り可能。
 *
 * @spec docs/spec/features/hmac-key-rotation.md
 * @spec docs/workflows/ワ-クフロ-プラグインレビュ-指摘事項全件修正/spec.md
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// 型定義
// ============================================================================

/**
 * HMAC鍵エントリ
 * hooks側(hmac-verify.js)と同一形式: [{generation, key, createdAt}]
 */
export interface HmacKeyEntry {
  /** 鍵世代番号 */
  generation: number;
  /** 鍵データ（hex文字列、32バイト） */
  key: string;
  /** 作成日時（ISO 8601） */
  createdAt: string;
}

/**
 * レガシーHMAC鍵ファイルの構造（マイグレーション用）
 */
interface LegacyHmacKeyFile {
  version: number;
  keys: { keyId: string; key: string; createdAt: string; rotatedAt: string | null }[];
}

// ============================================================================
// 定数
// ============================================================================

const KEY_FILE_NAME = 'hmac-keys.json';
const LEGACY_KEY_FILE_NAME = 'hmac.key';
const HMAC_ALGORITHM = 'sha256';

// ============================================================================
// 鍵管理関数
// ============================================================================

/**
 * 鍵ファイルのパスを取得
 */
function getKeyFilePath(): string {
  const stateDir = process.env.STATE_DIR || path.join(process.cwd(), '.claude', 'state');
  return path.join(stateDir, KEY_FILE_NAME);
}

/**
 * レガシー鍵ファイルのパスを取得
 */
function getLegacyKeyFilePath(): string {
  const stateDir = process.env.STATE_DIR || path.join(process.cwd(), '.claude', 'state');
  return path.join(stateDir, LEGACY_KEY_FILE_NAME);
}

/**
 * 新しい鍵を生成
 */
export function generateKey(generation = 1): HmacKeyEntry {
  return {
    generation,
    key: crypto.randomBytes(32).toString('hex'),
    createdAt: new Date().toISOString(),
  };
}

/**
 * 鍵ファイルから鍵配列を読み込む
 * hooks側(hmac-verify.js)と同一の配列形式 [{generation, key, createdAt}] を使用。
 * レガシー形式（{version, keys}オブジェクト）からの自動マイグレーション対応。
 */
export function loadKeys(): HmacKeyEntry[] {
  const keyFilePath = getKeyFilePath();

  if (fs.existsSync(keyFilePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(keyFilePath, 'utf-8'));

      // hooks互換の配列形式
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }

      // レガシーオブジェクト形式 {version, keys} からのマイグレーション
      const legacy = parsed as LegacyHmacKeyFile;
      if (legacy.keys && legacy.keys.length > 0) {
        const migrated: HmacKeyEntry[] = legacy.keys.map((k, i) => ({
          generation: i + 1,
          key: k.key,
          createdAt: k.createdAt,
        }));
        saveKeys(migrated);
        return migrated;
      }
    } catch {
      // ファイル破損時はフォールスルーして再生成
    }
  }

  // レガシー単一鍵ファイル(hmac.key)からのマイグレーション
  const legacyKeyPath = getLegacyKeyFilePath();
  if (fs.existsSync(legacyKeyPath)) {
    try {
      const legacyKey = fs.readFileSync(legacyKeyPath, 'utf-8').trim();
      if (legacyKey) {
        const entry: HmacKeyEntry = {
          generation: 1,
          key: legacyKey,
          createdAt: new Date().toISOString(),
        };
        saveKeys([entry]);
        return [entry];
      }
    } catch {
      // マイグレーション失敗時はフォールスルー
    }
  }

  // 初期鍵の自動生成
  const initialKey = generateKey();
  saveKeys([initialKey]);
  return [initialKey];
}

/**
 * 鍵配列をファイルに保存
 * hooks側(hmac-verify.js)と互換性のある配列形式で保存する。
 */
function saveKeys(keys: HmacKeyEntry[]): void {
  const keyFilePath = getKeyFilePath();
  const dir = path.dirname(keyFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(keyFilePath, JSON.stringify(keys, null, 2));
}

/**
 * 最新（現行）の鍵を取得
 */
export function getCurrentKey(): HmacKeyEntry {
  const keys = loadKeys();
  return keys[0];
}

/**
 * 鍵ローテーションを実行
 * 新しい鍵を生成して配列の先頭に追加する。
 */
export function rotateKey(): HmacKeyEntry {
  const keys = loadKeys();
  const maxGeneration = keys.reduce((max, k) => Math.max(max, k.generation), 0);
  const newKey = generateKey(maxGeneration + 1);
  keys.unshift(newKey);
  saveKeys(keys);
  return newKey;
}

/**
 * データに対してHMACを生成（最新鍵を使用）
 * hooks側(hmac-verify.js)と同一アルゴリズム:
 * - 鍵: Buffer.from(hexKey, 'hex') でバイナリ変換
 * - ダイジェスト: base64エンコード
 */
export function signWithCurrentKey(data: string): string {
  const currentKey = getCurrentKey();
  return crypto
    .createHmac(HMAC_ALGORITHM, Buffer.from(currentKey.key, 'hex'))
    .update(data, 'utf8')
    .digest('base64');
}

/**
 * FR-3: データとHMACを検証（全有効鍵で試行、タイミング攻撃対策）
 *
 * hooks側(hmac-verify.js)と同一アルゴリズム:
 * - 鍵: Buffer.from(hexKey, 'hex') でバイナリ変換
 * - ダイジェスト: base64エンコード
 * - 比較: crypto.timingSafeEqual で定数時間比較
 *
 * いずれかの鍵で一致すれば成功
 */
export function verifyWithAnyKey(data: string, signature: string): boolean {
  const keys = loadKeys();

  for (const keyEntry of keys) {
    const expected = crypto
      .createHmac(HMAC_ALGORITHM, Buffer.from(keyEntry.key, 'hex'))
      .update(data, 'utf8')
      .digest('base64');

    // FR-3: 定数時間比較でタイミング攻撃を防止
    try {
      const expectedBuffer = Buffer.from(expected, 'base64');
      const signatureBuffer = Buffer.from(signature, 'base64');

      // Buffer長が異なる場合もダミー比較を実行してタイミング漏洩を防ぐ
      if (expectedBuffer.length !== signatureBuffer.length) {
        crypto.timingSafeEqual(expectedBuffer, Buffer.alloc(expectedBuffer.length));
        continue;
      }

      // 定数時間比較
      if (crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) {
        return true;
      }
    } catch {
      // Buffer変換エラーやtimingSafeEqualエラーはスキップして次の鍵で試行
      continue;
    }
  }

  return false;
}

/**
 * FR-13: HMAC自動復旧機能
 *
 * HMAC検証に失敗した場合、環境変数HMAC_AUTO_RECOVERがtrueの場合のみ
 * タスク状態から新しいHMAC署名を再生成して復旧を試みる。
 *
 * @param stateFilePath - workflow-state.jsonのパス
 * @returns 復旧成功時はtrue、失敗時はfalse
 */
export function attemptHmacRecovery(stateFilePath: string): boolean {
  // 環境変数チェック（デフォルト: false）
  if (process.env.HMAC_AUTO_RECOVER !== 'true') {
    return false;
  }

  try {
    console.log('[HMAC Recovery] 自動復旧を試みています...');

    // workflow-state.jsonを読み込み
    const content = fs.readFileSync(stateFilePath, 'utf-8');
    const state = JSON.parse(content);

    if (!state) {
      console.error('[HMAC Recovery] ファイル読み込み失敗');
      return false;
    }

    // 旧HMAC署名を保存
    const oldHmac = state.stateIntegrity;

    // stateIntegrityを除外してデータを作成
    const { stateIntegrity, ...stateWithoutSignature } = state;
    const data = JSON.stringify(stateWithoutSignature, Object.keys(stateWithoutSignature).sort());

    // 新しいHMAC署名を生成
    const newHmac = signWithCurrentKey(data);

    // 新しい署名を設定してファイルに書き戻し
    state.stateIntegrity = newHmac;
    fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2), 'utf-8');

    console.log('[HMAC Recovery] 自動復旧に成功しました');

    // 監査ログに記録（auditLoggerがあればの場合のみ）
    // NOTE: ここではconsoleログのみで、呼び出し元で監査ログを記録する

    return true;
  } catch (error) {
    console.error('[HMAC Recovery] 自動復旧に失敗しました:', error);
    return false;
  }
}
