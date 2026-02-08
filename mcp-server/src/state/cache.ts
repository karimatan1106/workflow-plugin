/**
 * タスクキャッシュ（FR-11: Task Cache）
 *
 * ディレクトリスキャン結果をキャッシュして、
 * 状態読み込みのパフォーマンスを向上させる。
 *
 * @spec docs/spec/features/cache.md
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/**
 * TTLベースのインメモリキャッシュ
 *
 * タスク一覧などの頻繁に読み込まれるデータをキャッシュし、
 * ディレクトリスキャンの負荷を軽減する。
 */
export class TaskCache {
  private cache = new Map<string, CacheEntry<any>>();
  private defaultTTL: number;
  private hits = 0;
  private misses = 0;

  /**
   * コンストラクタ
   *
   * @param defaultTTL デフォルトのTTL（ミリ秒）
   */
  constructor(defaultTTL = 5000) {
    this.defaultTTL = defaultTTL;
  }

  /**
   * キャッシュからデータを取得
   *
   * @param key キャッシュキー
   * @returns キャッシュされたデータ、またはnull（期限切れ・不在時）
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    // 期限切れチェック
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.data as T;
  }

  /**
   * キャッシュにデータを保存
   *
   * @param key キャッシュキー
   * @param data 保存するデータ
   * @param ttl TTL（ミリ秒、省略時はデフォルトTTL）
   */
  set<T>(key: string, data: T, ttl?: number): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + (ttl ?? this.defaultTTL),
    });
  }

  /**
   * キャッシュエントリを無効化
   *
   * @param key キャッシュキー
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * キャッシュ全体をクリア
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * キャッシュヒット率を取得
   *
   * @returns ヒット率（0.0 〜 1.0）
   */
  getHitRate(): number {
    const total = this.hits + this.misses;
    return total === 0 ? 0 : this.hits / total;
  }
}

/**
 * グローバルなタスクキャッシュインスタンス
 */
export const taskCache = new TaskCache();

/**
 * キャッシュが有効かどうかを確認
 *
 * 環境変数 DISABLE_TASK_CACHE=true でキャッシュを無効化できる。
 *
 * @returns キャッシュが有効な場合true
 */
export function isCacheEnabled(): boolean {
  return process.env.DISABLE_TASK_CACHE !== 'true';
}
