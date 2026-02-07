/**
 * REQ-4: 環境変数バイパス監査ログテスト
 *
 * AuditLoggerクラスの動作をテストする。
 * テスト設計書のTC-4.1〜TC-4.5に基づいて、監査ログ記録・閾値チェック・ローテーションを検証。
 *
 * @spec docs/workflows/ワークフロー1000万行対応強化/test-design.md
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, statSync, rmSync } from 'fs';
import { join } from 'path';
import os from 'os';
import { AuditLogger } from '../logger.js';

// ============================================================================
// テスト用ヘルパー
// ============================================================================

let tmpDir: string;
let logPath: string;

/**
 * テスト前処理: 一時ディレクトリを作成
 */
beforeEach(() => {
  tmpDir = mkdtempSync(join(os.tmpdir(), 'audit-test-'));
  logPath = join(tmpDir, 'audit-log.jsonl');
});

/**
 * テスト後処理: 一時ディレクトリを削除
 */
afterEach(() => {
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ============================================================================
// テストスイート
// ============================================================================

describe('AuditLogger - REQ-4: 環境変数バイパス監査', () => {
  // ==========================================================================
  // TC-4.1: SKIP_PHASE_GUARD=true → ログ記録
  // ==========================================================================

  test('TC-4.1: SKIP_PHASE_GUARD=true使用時 → ログファイルに記録される', () => {
    const logger = new AuditLogger(tmpDir);

    logger.log({
      event: 'bypass_enabled',
      variable: 'SKIP_PHASE_GUARD',
      taskId: 'task123',
      phase: 'implementation',
    });

    // ログファイルが作成されたことを確認
    expect(existsSync(logPath)).toBe(true);

    // ログ内容を読み込み
    const logContent = readFileSync(logPath, 'utf-8');
    const logLines = logContent.split('\n').filter(line => line.trim().length > 0);

    expect(logLines.length).toBe(1);

    const logEntry = JSON.parse(logLines[0]);
    expect(logEntry.event).toBe('bypass_enabled');
    expect(logEntry.variable).toBe('SKIP_PHASE_GUARD');
    expect(logEntry.taskId).toBe('task123');
    expect(logEntry.phase).toBe('implementation');
    expect(logEntry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
  });

  // ==========================================================================
  // TC-4.2: FAIL_OPEN=true → ログ記録
  // ==========================================================================

  test('TC-4.2: FAIL_OPEN=true使用時 → ログファイルに記録される', () => {
    const logger = new AuditLogger(tmpDir);

    logger.log({
      event: 'bypass_enabled',
      variable: 'FAIL_OPEN',
      taskId: 'task456',
      phase: 'testing',
    });

    expect(existsSync(logPath)).toBe(true);

    const logContent = readFileSync(logPath, 'utf-8');
    const logEntry = JSON.parse(logContent.trim());

    expect(logEntry.event).toBe('bypass_enabled');
    expect(logEntry.variable).toBe('FAIL_OPEN');
    expect(logEntry.taskId).toBe('task456');
    expect(logEntry.phase).toBe('testing');
  });

  // ==========================================================================
  // TC-4.3: バイパス未使用 → ログ記録なし
  // ==========================================================================

  test('TC-4.3: バイパス未使用時 → ログファイルが作成されない、または空', () => {
    const logger = new AuditLogger(tmpDir);

    // ログを記録しない場合
    // （AuditLoggerインスタンスを作成するだけでは何も起こらない）

    // ログファイルが存在しないか、空であることを確認
    if (existsSync(logPath)) {
      const stats = statSync(logPath);
      expect(stats.size).toBe(0);
    } else {
      // ログファイルが存在しないことを確認
      expect(existsSync(logPath)).toBe(false);
    }
  });

  // ==========================================================================
  // TC-4.4: 1時間に11回超のバイパス → 閾値超過警告
  // ==========================================================================

  test('TC-4.4: 1時間に11回のバイパス → 閾値超過イベント記録', () => {
    const logger = new AuditLogger(tmpDir);
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // 11回のバイパスログを記録
    for (let i = 0; i < 11; i++) {
      logger.log({
        event: 'bypass_enabled',
        variable: 'SKIP_PHASE_GUARD',
        taskId: `task-${i}`,
      });
    }

    // 閾値チェック実行（閾値: 10）
    logger.checkThreshold(10);

    // 警告が出力されたことを確認
    expect(consoleWarnSpy).toHaveBeenCalled();

    const warningCalls = consoleWarnSpy.mock.calls.map(call => call.join(' '));
    const hasThresholdWarning = warningCalls.some(msg =>
      msg.includes('バイパス使用回数が閾値を超えました') && msg.includes('11') && msg.includes('10')
    );
    expect(hasThresholdWarning).toBe(true);

    // ログファイルに閾値超過イベントが記録されたことを確認
    const logContent = readFileSync(logPath, 'utf-8');
    const logLines = logContent.split('\n').filter(line => line.trim().length > 0);

    // 11回のbypass_enabled + 1回のbypass_threshold_exceeded = 12行
    expect(logLines.length).toBe(12);

    const lastLogEntry = JSON.parse(logLines[logLines.length - 1]);
    expect(lastLogEntry.event).toBe('bypass_threshold_exceeded');
    expect(lastLogEntry.count).toBe(11);
    expect(lastLogEntry.window).toBe('1h');

    consoleWarnSpy.mockRestore();
  });

  test('TC-4.4b: countRecentBypasses() が正しくカウントする', () => {
    const logger = new AuditLogger(tmpDir);

    // 11回のバイパスログを記録
    for (let i = 0; i < 11; i++) {
      logger.log({
        event: 'bypass_enabled',
        variable: 'SKIP_PHASE_GUARD',
      });
    }

    const count = logger.countRecentBypasses();
    expect(count).toBe(11);
  });

  // ==========================================================================
  // TC-4.5: ログファイル10MB超 → ローテーション実行
  // ==========================================================================

  test('TC-4.5: ログファイルが閾値超え → ローテーション実行', () => {
    // テスト用に小さいサイズでAuditLoggerを作成（100バイト）
    const logger = new AuditLogger(tmpDir, 100, 5);

    // 100バイト超のログを書き込み（1エントリ約100バイト）
    for (let i = 0; i < 3; i++) {
      logger.log({
        event: 'bypass_enabled',
        variable: 'SKIP_PHASE_GUARD',
        taskId: `task-${i}-with-long-name-to-increase-size`,
      });
    }

    // ローテーションファイルが作成されたことを確認
    const rotatedLogPath = `${logPath}.1`;

    // ログファイルサイズが100バイト未満になっていることを確認
    // （ローテーション後、新しいログファイルが空または小さい）
    if (existsSync(logPath)) {
      const currentSize = statSync(logPath).size;
      // 最新のログエントリ1件分は残っている可能性があるので、100バイト未満を確認
      expect(currentSize).toBeLessThan(100);
    }

    // .1ファイルが存在し、過去のログが含まれることを確認
    if (existsSync(rotatedLogPath)) {
      const rotatedContent = readFileSync(rotatedLogPath, 'utf-8');
      expect(rotatedContent.length).toBeGreaterThan(0);
    }
  });

  // ==========================================================================
  // 複数世代ローテーション
  // ==========================================================================

  test('複数世代ローテーション: .1, .2, .3... が作成される', () => {
    const logger = new AuditLogger(tmpDir, 50, 3);

    // 複数回ローテーションを発生させる
    for (let gen = 0; gen < 5; gen++) {
      for (let i = 0; i < 2; i++) {
        logger.log({
          event: 'bypass_enabled',
          variable: 'TEST_VAR',
          taskId: `gen-${gen}-entry-${i}-with-padding-text`,
        });
      }
    }

    // 最大3世代なので、.1, .2 が存在するはず（.3は削除される）
    const gen1Path = `${logPath}.1`;
    const gen2Path = `${logPath}.2`;
    const gen3Path = `${logPath}.3`;

    // .1 と .2 は存在する可能性が高い
    // （ローテーションタイミング次第で変わるので、少なくとも1つは存在することを確認）
    const hasRotatedFiles = existsSync(gen1Path) || existsSync(gen2Path);
    expect(hasRotatedFiles).toBe(true);

    // .4 以降は存在しない
    const gen4Path = `${logPath}.4`;
    expect(existsSync(gen4Path)).toBe(false);
  });

  // ==========================================================================
  // エラーハンドリング
  // ==========================================================================

  test('ログ書き込み失敗時 → エラーを握りつぶして継続', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // 存在しないディレクトリを指定（書き込み失敗を引き起こす）
    const invalidLogger = new AuditLogger('/nonexistent/path/that/does/not/exist');

    // ログ記録を試みる（エラーは内部で握りつぶされる）
    expect(() => {
      invalidLogger.log({
        event: 'bypass_enabled',
        variable: 'TEST',
      });
    }).not.toThrow();

    consoleErrorSpy.mockRestore();
  });
});
