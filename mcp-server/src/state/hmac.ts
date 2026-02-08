/**
 * HMAC鍵管理モジュール（REQ-9: 鍵ローテーション対応）
 *
 * 複数世代の鍵を保持し、署名生成は最新鍵、検証は全有効鍵で実行する。
 * これにより鍵ローテーション後も古い署名のタスクが読み取り可能。
 *
 * @spec docs/spec/features/hmac-key-rotation.md
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// 型定義
// ============================================================================

/**
 * HMAC鍵エントリ
 */
export interface HmacKeyEntry {
  /** 鍵ID（UUID v4形式） */
  keyId: string;
  /** 鍵データ（hex文字列、32バイト） */
  key: string;
  /** 作成日時（ISO 8601） */
  createdAt: string;
  /** ローテーション日時（ISO 8601、未ローテーションの場合はnull） */
  rotatedAt: string | null;
}

/**
 * HMAC鍵ファイルの構造
 */
interface HmacKeyFile {
  version: number;
  keys: HmacKeyEntry[];
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
 * UUID v4を生成（crypto.randomUUID互換）
 */
function generateKeyId(): string {
  const bytes = crypto.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/**
 * 新しい鍵を生成
 */
export function generateKey(): HmacKeyEntry {
  return {
    keyId: generateKeyId(),
    key: crypto.randomBytes(32).toString('hex'),
    createdAt: new Date().toISOString(),
    rotatedAt: null,
  };
}

/**
 * 鍵ファイルから鍵配列を読み込む
 * ファイルが存在しない場合はレガシー鍵のマイグレーションまたは初期鍵の自動生成を行う
 */
export function loadKeys(): HmacKeyEntry[] {
  const keyFilePath = getKeyFilePath();

  // 新形式ファイルが存在する場合
  if (fs.existsSync(keyFilePath)) {
    try {
      const data: HmacKeyFile = JSON.parse(fs.readFileSync(keyFilePath, 'utf-8'));
      if (data.keys && data.keys.length > 0) {
        return data.keys;
      }
    } catch {
      // ファイル破損時はフォールスルーして再生成
    }
  }

  // レガシー鍵ファイルからのマイグレーション
  const legacyKeyPath = getLegacyKeyFilePath();
  if (fs.existsSync(legacyKeyPath)) {
    try {
      const legacyKey = fs.readFileSync(legacyKeyPath, 'utf-8').trim();
      if (legacyKey) {
        const entry: HmacKeyEntry = {
          keyId: generateKeyId(),
          key: legacyKey,
          createdAt: new Date().toISOString(),
          rotatedAt: null,
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
 */
function saveKeys(keys: HmacKeyEntry[]): void {
  const keyFilePath = getKeyFilePath();
  const dir = path.dirname(keyFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const data: HmacKeyFile = { version: 1, keys };
  fs.writeFileSync(keyFilePath, JSON.stringify(data, null, 2));
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
 * 新しい鍵を生成して配列の先頭に追加し、古い鍵のrotatedAtを設定
 */
export function rotateKey(): HmacKeyEntry {
  const keys = loadKeys();

  // 現行の鍵にローテーション日時を設定
  if (keys.length > 0) {
    keys[0].rotatedAt = new Date().toISOString();
  }

  // 新しい鍵を先頭に追加
  const newKey = generateKey();
  keys.unshift(newKey);

  // 保存
  saveKeys(keys);
  return newKey;
}

/**
 * データに対してHMACを生成（最新鍵を使用）
 */
export function signWithCurrentKey(data: string): string {
  const currentKey = getCurrentKey();
  return crypto
    .createHmac(HMAC_ALGORITHM, currentKey.key)
    .update(data)
    .digest('hex');
}

/**
 * データとHMACを検証（全有効鍵で試行）
 * いずれかの鍵で一致すれば成功
 */
export function verifyWithAnyKey(data: string, signature: string): boolean {
  const keys = loadKeys();

  for (const keyEntry of keys) {
    const expected = crypto
      .createHmac(HMAC_ALGORITHM, keyEntry.key)
      .update(data)
      .digest('hex');
    if (expected === signature) {
      return true;
    }
  }

  return false;
}
