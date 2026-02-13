#!/usr/bin/env node
/**
 * TTL付きメモリキャッシュ層
 *
 * hooks/配下の各モジュールがディスク走査結果をキャッシュするための共通層。
 * 7フック×プロセス起動で350-1400msオーバーヘッドを500ms以内に短縮。
 *
 * @spec docs/workflows/ワークフロープラグイン1000万行対応全面改修/spec.md
 */

/** TTL設定値（秒）のデフォルト値と範囲 */
const DEFAULT_TTL = parseInt(process.env.HOOK_CACHE_TTL || '300', 10);
const MIN_TTL = 60;
const MAX_TTL = 3600;

// TTL範囲チェック
if (DEFAULT_TTL < MIN_TTL || DEFAULT_TTL > MAX_TTL) {
  console.error(`ERROR: HOOK_CACHE_TTL must be between ${MIN_TTL} and ${MAX_TTL}, got ${DEFAULT_TTL}`);
  process.exit(1);
}

const cache = {};

/**
 * キャッシュ取得またはgenerator実行
 *
 * @param {string} key - キャッシュキー
 * @param {number} ttl - TTL（秒）、デフォルトは300秒
 * @param {Function} generator - キャッシュミス時に実行する関数
 * @returns {any} - キャッシュまたはgeneratorの戻り値
 */
function getCached(key, ttl, generator) {
  const now = Date.now();

  // キャッシュヒット判定
  if (cache[key] && cache[key].expires > now) {
    return cache[key].value;
  }

  // キャッシュミス: generator実行
  const value = generator();
  const ttlMs = (ttl || DEFAULT_TTL) * 1000;
  cache[key] = {
    value,
    expires: now + ttlMs,
  };

  return value;
}

/**
 * パターン一致するキャッシュ無効化
 *
 * @param {string|RegExp} pattern - 無効化パターン
 */
function invalidate(pattern) {
  const regex = typeof pattern === 'string'
    ? new RegExp(pattern.replace(/\*/g, '.*'))
    : pattern;

  for (const key of Object.keys(cache)) {
    if (regex.test(key)) {
      delete cache[key];
    }
  }
}

/**
 * 全キャッシュクリア（テスト用）
 */
function clearAll() {
  for (const key of Object.keys(cache)) {
    delete cache[key];
  }
}

module.exports = {
  getCached,
  invalidate,
  clearAll,
};
