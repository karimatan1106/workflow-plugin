/**
 * 監査ログ記録モジュール（ESM）
 *
 * 環境変数バイパス（SKIP_*）の使用を.claude/state/audit-log.jsonlに記録する。
 * JSONL形式（JSON Lines）でログを追記し、ローテーションを実施する。
 *
 * @spec docs/workflows/ワ-クフロ-1000万行対応強化/spec.md
 */

import * as fs from 'fs';
import * as path from 'path';

/** ログファイルの最大サイズ（デフォルト: 10MB） */
const DEFAULT_MAX_LOG_SIZE = 10 * 1024 * 1024;

/** ログファイルの保持世代数（デフォルト: 5世代） */
const DEFAULT_MAX_GENERATIONS = 5;

/** バイパス使用回数の監視時間窓（デフォルト: 1時間） */
const DEFAULT_WINDOW_MS = 60 * 60 * 1000;

/** バイパス使用回数の警告閾値（デフォルト: 10回/時間） */
const DEFAULT_THRESHOLD = 10;

/**
 * 監査ログのイベント種別
 */
export type AuditEventType =
  | 'bypass_enabled'           // バイパス環境変数が有効
  | 'bypass_threshold_exceeded' // バイパス使用回数が閾値超過
  | 'hmac_auto_recover'        // HMAC自動復旧成功
  | 'hmac_recover_failed'      // HMAC復旧失敗
  | 'semantic_check_failed'    // 意味的整合性チェック失敗
  | 'scope_violation_early_warning'; // スコープ違反の早期警告

/**
 * 監査ログエントリ
 */
export interface AuditLogEntry {
  /** タイムスタンプ（ISO8601形式） */
  timestamp: string;
  /** イベント種別 */
  event: AuditEventType;
  /** 環境変数名（bypass_enabledの場合） */
  variable?: string;
  /** タスクID（存在する場合） */
  taskId?: string;
  /** フェーズ（存在する場合） */
  phase?: string;
  /** カウント（bypass_threshold_exceededの場合） */
  count?: number;
  /** 時間窓（bypass_threshold_exceededの場合） */
  window?: string;
  /** 不足している要件（semantic_check_failedの場合） */
  missingRequirements?: string[];
  /** 余分な実装（semantic_check_failedの場合） */
  extraImplementations?: string[];
  /** 厳格モード（semantic_check_failedの場合） */
  strictMode?: boolean;
  /** スコープ外ファイル（scope_violation_early_warningの場合） */
  outOfScopeFiles?: string[];
}

/**
 * 監査ログ記録クラス
 */
export class AuditLogger {
  private logFilePath: string;
  private maxLogSize: number;
  private maxGenerations: number;

  /**
   * コンストラクタ
   *
   * @param logDir - ログディレクトリ（デフォルト: .claude/state/）
   * @param maxLogSize - ローテーション閾値（バイト、デフォルト: 10MB）
   * @param maxGenerations - 保持する世代数（デフォルト: 5）
   */
  constructor(
    logDir: string = path.join(process.cwd(), '.claude', 'state'),
    maxLogSize: number = DEFAULT_MAX_LOG_SIZE,
    maxGenerations: number = DEFAULT_MAX_GENERATIONS
  ) {
    this.logFilePath = path.join(logDir, 'audit-log.jsonl');
    this.maxLogSize = maxLogSize;
    this.maxGenerations = maxGenerations;

    // ログディレクトリが存在しない場合は作成
    try {
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
    } catch (e) {
      console.error('[audit-logger] ログディレクトリ作成失敗:', e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * 監査ログを記録
   *
   * @param entry - ログエントリ
   */
  log(entry: Omit<AuditLogEntry, 'timestamp'>): void {
    const logEntry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      ...entry,
    };

    try {
      // JSONL形式で追記（各行が1つのJSONオブジェクト）
      const line = JSON.stringify(logEntry) + '\n';
      fs.appendFileSync(this.logFilePath, line, 'utf-8');

      // ローテーションチェック
      this.rotateIfNeeded();
    } catch (e) {
      // ログ書き込み失敗は標準エラー出力に出力して継続
      console.error('[audit-logger] ログ書き込み失敗:', e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * 指定時間内のバイパス使用回数をカウント
   *
   * @param windowMs - 時間窓（ミリ秒、デフォルト: 1時間）
   * @returns バイパス使用回数
   */
  countRecentBypasses(windowMs: number = DEFAULT_WINDOW_MS): number {
    if (!fs.existsSync(this.logFilePath)) {
      return 0;
    }

    try {
      const content = fs.readFileSync(this.logFilePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim().length > 0);

      const windowStart = new Date(Date.now() - windowMs);
      let count = 0;

      for (const line of lines) {
        try {
          const entry: AuditLogEntry = JSON.parse(line);
          if (entry.event === 'bypass_enabled') {
            const entryTime = new Date(entry.timestamp);
            if (entryTime >= windowStart) {
              count++;
            }
          }
        } catch {
          // JSON parse error は無視
        }
      }

      return count;
    } catch (e) {
      console.error('[audit-logger] ログ読み込み失敗:', e instanceof Error ? e.message : String(e));
      return 0;
    }
  }

  /**
   * バイパス使用回数が閾値を超えているかチェック
   *
   * @param threshold - 閾値（デフォルト: 10）
   * @param windowMs - 時間窓（ミリ秒、デフォルト: 1時間）
   * @returns 閾値超過の場合true
   */
  checkThreshold(threshold: number = DEFAULT_THRESHOLD, windowMs: number = DEFAULT_WINDOW_MS): boolean {
    const count = this.countRecentBypasses(windowMs);
    if (count > threshold) {
      console.warn(`[audit-logger] バイパス使用回数が閾値を超えました（${count} > ${threshold}）`);
      console.warn('[audit-logger] 詳細: .claude/state/audit-log.jsonl を確認してください');

      // 閾値超過イベントを記録
      this.log({
        event: 'bypass_threshold_exceeded',
        count,
        window: '1h',
      });

      return true;
    }
    return false;
  }

  /**
   * ログローテーション
   *
   * ログファイルがmaxLogSizeを超えた場合、.1, .2, ... .N とローテーションする。
   */
  private rotateIfNeeded(): void {
    if (!fs.existsSync(this.logFilePath)) {
      return;
    }

    try {
      const stats = fs.statSync(this.logFilePath);
      if (stats.size < this.maxLogSize) {
        return;
      }

      // 既存の世代をシフト（.4 → .5, .3 → .4, ...）
      for (let i = this.maxGenerations - 1; i >= 1; i--) {
        const oldPath = `${this.logFilePath}.${i}`;
        const newPath = `${this.logFilePath}.${i + 1}`;
        if (fs.existsSync(oldPath)) {
          if (i === this.maxGenerations - 1) {
            // 最古の世代は削除
            fs.unlinkSync(oldPath);
          } else {
            fs.renameSync(oldPath, newPath);
          }
        }
      }

      // 現在のログを .1 にリネーム
      fs.renameSync(this.logFilePath, `${this.logFilePath}.1`);
    } catch (e) {
      console.error('[audit-logger] ローテーション失敗:', e instanceof Error ? e.message : String(e));
    }
  }
}

/**
 * シングルトンインスタンス
 */
export const auditLogger = new AuditLogger();
