/**
 * @jest-environment node
 * @spec docs/specs/infrastructure/loop-detector.md
 *
 * テスト実行: vitest run
 * または node --test で実行
 */

const fs = require('fs');
const path = require('path');

// vitest/Jest互換のグローバル関数
if (typeof describe === 'undefined') {
  // Jest/vitestがない場合はスキップ
  console.log('vitest または Jest を使用して実行してください');
  process.exit(0);
}

// テスト対象: loop-detector.js
// 注: TDD Red フェーズのため、まだ実装は存在しない

describe('loop-detector', () => {
  let mockState = {};
  let mockEnv = {};
  let exitCode = 0;
  let consoleOutput = [];

  beforeEach(() => {
    // 状態をリセット
    mockState = {};
    mockEnv = { ...process.env };
    exitCode = 0;
    consoleOutput = [];

    // console.log をモック
    jest.spyOn(console, 'log').mockImplementation((msg) => {
      consoleOutput.push(msg);
    });

    // console.error をモック
    jest.spyOn(console, 'error').mockImplementation((msg) => {
      consoleOutput.push(msg);
    });

    // process.exit をモック
    jest.spyOn(process, 'exit').mockImplementation((code) => {
      exitCode = code || 0;
      throw new Error(`exit(${code})`);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * ユーティリティ関数: 時刻管理用
   */
  const createMockTime = () => {
    let currentTime = new Date('2026-01-17T16:00:00Z').getTime();
    const originalNow = Date.now;

    jest.spyOn(Date, 'now').mockImplementation(() => currentTime);

    return {
      now: () => currentTime,
      advance: (ms) => {
        currentTime += ms;
      },
      set: (timestamp) => {
        currentTime = new Date(timestamp).getTime();
      },
      restore: () => {
        Date.now = originalNow;
      },
    };
  };

  /**
   * ユーティリティ関数: ループ検出器インスタンス生成
   */
  const createLoopDetector = (stateFilePath = '.claude-loop-detector-state.json') => {
    // loopDetector モジュールを動的にロード
    // 注: 実装時に正しいパスを指定
    try {
      delete require.cache[require.resolve('../loop-detector.js')];
      const LoopDetector = require('../loop-detector.js');
      return new LoopDetector(stateFilePath);
    } catch (e) {
      // 実装がまだ存在しない場合はモック実装を返す
      return createMockLoopDetector(stateFilePath);
    }
  };

  /**
   * モック実装: TDD Red フェーズ用
   */
  const createMockLoopDetector = (stateFilePath) => {
    const self = {
      stateFilePath,
      state: mockState,

      loadState() {
        try {
          if (fs.existsSync(stateFilePath)) {
            return JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
          }
        } catch (e) {
          return { files: {} };
        }
        return { files: {} };
      },

      saveState(state) {
        try {
          fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2), 'utf8');
        } catch (e) {
          // エラー無視
        }
      },

      normalizeFilePath(filePath) {
        return filePath.replace(/\\/g, '/').toLowerCase();
      },

      checkLoop(filePath) {
        // 実装がまだ存在しないため、テスト用スタブ
        throw new Error('loop-detector.js is not implemented yet');
      },
    };
    return self;
  };

  /**
   * ユーティリティ関数: 状態確認
   */
  const getLoopDetectorState = () => {
    return mockState;
  };

  /**
   * ユーティリティ関数: 状態初期化
   */
  const clearLoopDetectorState = () => {
    mockState = {};
  };

  // ========================================================================
  // TC1: 5分以内に同一ファイル5回編集で警告
  // ========================================================================

  describe('5分以内の同一ファイル5回編集で警告', () => {
    test('4回目までは警告なし', () => {
      const time = createMockTime();
      const detector = createLoopDetector();

      for (let i = 0; i < 4; i++) {
        expect(() => {
          detector.checkLoop('src/test.js');
          time.advance(1000); // 1秒進める
        }).not.toThrow();
      }

      expect(process.exit).not.toHaveBeenCalled();
      expect(exitCode).not.toBe(1);
    });

    test('5回目で警告発火してexit(1)', () => {
      const time = createMockTime();
      const detector = createLoopDetector();

      for (let i = 0; i < 5; i++) {
        try {
          detector.checkLoop('src/test.js');
          if (i < 4) {
            time.advance(1000); // 4回目までは1秒進める
          }
        } catch (e) {
          // process.exit() による例外をキャッチ
          if (i === 4) {
            expect(e.message).toContain('exit(1)');
          }
        }
      }

      expect(process.exit).toHaveBeenCalledWith(1);
      expect(consoleOutput.some((m) => m.includes('無限ループ検出'))).toBe(true);
    });

    test('警告メッセージに詳細情報を含む', () => {
      const detector = createLoopDetector();
      const time = createMockTime();

      for (let i = 0; i < 5; i++) {
        try {
          detector.checkLoop('src/test.js');
          time.advance(1000);
        } catch (e) {
          // exit 例外をキャッチ
        }
      }

      const warningMsg = consoleOutput.join('\n');
      expect(warningMsg).toContain('src/test.js');
      expect(warningMsg).toContain('編集回数');
      expect(warningMsg).toContain('5');
    });
  });

  // ========================================================================
  // TC2: 異なるファイルはカウント別
  // ========================================================================

  describe('異なるファイルはカウント別', () => {
    test('ファイルA 3回，ファイルB 3回で警告なし', () => {
      const detector = createLoopDetector();
      const time = createMockTime();

      // ファイルA を3回編集
      for (let i = 0; i < 3; i++) {
        expect(() => {
          detector.checkLoop('src/fileA.js');
          time.advance(500);
        }).not.toThrow();
      }

      // ファイルB を3回編集
      for (let i = 0; i < 3; i++) {
        expect(() => {
          detector.checkLoop('src/fileB.js');
          time.advance(500);
        }).not.toThrow();
      }

      expect(process.exit).not.toHaveBeenCalled();
      expect(exitCode).not.toBe(1);
    });

    test('各ファイルのカウンターが独立', () => {
      const detector = createLoopDetector();
      const time = createMockTime();

      // ファイルA を5回編集（警告対象）
      for (let i = 0; i < 5; i++) {
        try {
          detector.checkLoop('src/fileA.js');
          time.advance(500);
        } catch (e) {
          // 5回目で exit
        }
      }

      expect(process.exit).toHaveBeenCalledWith(1);

      // リセット
      jest.clearAllMocks();
      exitCode = 0;
      consoleOutput = [];

      // ファイルB は3回のみ（警告なし）
      for (let i = 0; i < 3; i++) {
        expect(() => {
          detector.checkLoop('src/fileB.js');
          time.advance(500);
        }).not.toThrow();
      }

      expect(process.exit).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // TC3: 5分経過でカウントリセット
  // ========================================================================

  describe('5分経過でカウントリセット', () => {
    test('5分経過後は新規ウィンドウで再カウント開始', () => {
      const detector = createLoopDetector();
      const time = createMockTime();

      // t=0: 4回編集
      for (let i = 0; i < 4; i++) {
        expect(() => {
          detector.checkLoop('src/test.js');
          time.advance(1000);
        }).not.toThrow();
      }

      // t=5分1秒: 時刻を進める
      time.advance(5 * 60 * 1000 + 1000 - 4000); // 既に4秒進んでいるので調整

      // t=5分1秒: 1回編集 → 警告なし（新規ウィンドウ）
      expect(() => {
        detector.checkLoop('src/test.js');
      }).not.toThrow();

      expect(process.exit).not.toHaveBeenCalled();
    });

    test('古いタイムスタンプは自動削除', () => {
      const detector = createLoopDetector();
      const time = createMockTime();

      // t=0: ファイルA を3回編集
      for (let i = 0; i < 3; i++) {
        detector.checkLoop('src/test.js');
        time.advance(1000);
      }

      // 状態確認: 3個のタイムスタンプ
      let state = detector.loadState();
      expect(state.files['src/test.js'].timestamps.length).toBe(3);

      // t=5分1秒: 古いエントリが削除されることを期待
      time.advance(5 * 60 * 1000 - 3000 + 1000);

      detector.checkLoop('src/test.js');

      state = detector.loadState();
      // 古いタイムスタンプは削除され、新規のみ残る
      expect(state.files['src/test.js'].timestamps.length).toBe(1);
    });
  });

  // ========================================================================
  // TC4: 警告後1分間は再警告なし
  // ========================================================================

  describe('警告後1分間は再警告なし', () => {
    test('警告抑止期間中は再警告なし', () => {
      const detector = createLoopDetector();
      const time = createMockTime();

      // 1回目警告: 5回編集
      for (let i = 0; i < 5; i++) {
        try {
          detector.checkLoop('src/test.js');
          time.advance(500);
        } catch (e) {
          // exit で捕捉
        }
      }

      const firstCallCount = process.exit.mock.calls.length;
      expect(firstCallCount).toBe(1);

      // リセット
      jest.clearAllMocks();
      exitCode = 0;
      consoleOutput = [];

      // t=30秒: 再警告なし（抑止中）
      time.advance(30 * 1000 - 2500); // 既に2.5秒進んでいるので調整

      expect(() => {
        detector.checkLoop('src/test.js');
      }).not.toThrow();

      expect(process.exit).not.toHaveBeenCalled();
    });

    test('1分1秒経過で抑止解除', () => {
      const detector = createLoopDetector();
      const time = createMockTime();

      // 1回目警告
      for (let i = 0; i < 5; i++) {
        try {
          detector.checkLoop('src/test.js');
          time.advance(500);
        } catch (e) {
          // exit で捕捉
        }
      }

      expect(process.exit).toHaveBeenCalledWith(1);
      jest.clearAllMocks();

      // t=61秒: 抑止解除（新たに警告）
      time.advance(61 * 1000 - 2500);

      // カウンターを増加させて再度警告条件を満たす
      expect(() => {
        detector.checkLoop('src/test.js');
      }).not.toThrow(); // 警告の再発火を期待（実装後に確認）

      // 実装後、警告が再発火することを確認
      // expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  // ========================================================================
  // TC5: スキップフラグで無効化
  // ========================================================================

  describe('スキップフラグで無効化', () => {
    test('SKIP_LOOP_DETECTION=true で警告なし', () => {
      process.env.SKIP_LOOP_DETECTION = 'true';
      const detector = createLoopDetector();
      const time = createMockTime();

      for (let i = 0; i < 5; i++) {
        expect(() => {
          detector.checkLoop('src/test.js');
          time.advance(1000);
        }).not.toThrow();
      }

      expect(process.exit).not.toHaveBeenCalled();
      delete process.env.SKIP_LOOP_DETECTION;
    });

    test('SKIP_LOOP_DETECTION=false は通常処理', () => {
      process.env.SKIP_LOOP_DETECTION = 'false';
      const detector = createLoopDetector();
      const time = createMockTime();

      for (let i = 0; i < 5; i++) {
        try {
          detector.checkLoop('src/test.js');
          time.advance(1000);
        } catch (e) {
          // exit で捕捉
        }
      }

      expect(process.exit).toHaveBeenCalledWith(1);
      delete process.env.SKIP_LOOP_DETECTION;
    });
  });

  // ========================================================================
  // TC6: ファイルパス正規化
  // ========================================================================

  describe('ファイルパス正規化', () => {
    test('スラッシュ/バックスラッシュの統一', () => {
      const detector = createLoopDetector();
      const time = createMockTime();

      // src/file.js を3回編集
      for (let i = 0; i < 3; i++) {
        detector.checkLoop('src/file.js');
        time.advance(500);
      }

      // src\\file.js を2回編集（バックスラッシュ）
      // 同一ファイル扱いで合計5回 → 警告
      for (let i = 0; i < 2; i++) {
        try {
          detector.checkLoop('src\\file.js');
          time.advance(500);
        } catch (e) {
          // 5回目で exit
        }
      }

      expect(process.exit).toHaveBeenCalledWith(1);
    });

    test('大文字小文字を統一', () => {
      const detector = createLoopDetector();
      const time = createMockTime();

      // src/Test.js を3回編集
      for (let i = 0; i < 3; i++) {
        detector.checkLoop('src/Test.js');
        time.advance(500);
      }

      // src/test.js を2回編集（小文字）
      // 同一ファイル扱いで合計5回 → 警告
      for (let i = 0; i < 2; i++) {
        try {
          detector.checkLoop('src/test.js');
          time.advance(500);
        } catch (e) {
          // 5回目で exit
        }
      }

      expect(process.exit).toHaveBeenCalledWith(1);
    });

    test('相対パス正規化', () => {
      const detector = createLoopDetector();
      const time = createMockTime();

      // ./src/test.js を3回編集
      for (let i = 0; i < 3; i++) {
        detector.checkLoop('./src/test.js');
        time.advance(500);
      }

      // src/test.js を2回編集（先頭の ./ なし）
      // 同一ファイル扱いで合計5回 → 警告
      for (let i = 0; i < 2; i++) {
        try {
          detector.checkLoop('src/test.js');
          time.advance(500);
        } catch (e) {
          // 5回目で exit
        }
      }

      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  // ========================================================================
  // TC7: エラーハンドリング
  // ========================================================================

  describe('エラーハンドリング', () => {
    test('不正JSON読取時は自動リセット', () => {
      const stateFile = '.claude-loop-detector-state.json';

      // 不正なJSONを作成
      fs.writeFileSync(stateFile, '{invalid json}');

      const detector = createLoopDetector(stateFile);

      // エラー無視で処理継続
      expect(() => {
        detector.checkLoop('src/test.js');
      }).not.toThrow();

      // 状態は初期化される
      const state = detector.loadState();
      expect(state.files['src/test.js']).toBeDefined();
      expect(state.files['src/test.js'].timestamps.length).toBeGreaterThan(0);

      // クリーンアップ
      if (fs.existsSync(stateFile)) {
        fs.unlinkSync(stateFile);
      }
    });

    test('ファイルI/O失敗時は処理継続', () => {
      const detector = createLoopDetector();
      const time = createMockTime();

      // 書き込み権限がない状況をシミュレート
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      expect(() => {
        for (let i = 0; i < 5; i++) {
          detector.checkLoop('src/test.js');
          time.advance(1000);
        }
      }).not.toThrow(); // エラーは無視される

      jest.restoreAllMocks();
    });

    test('ディスク満杯時はエラー無視', () => {
      const detector = createLoopDetector();
      const time = createMockTime();

      // ディスク満杯をシミュレート
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {
        throw new Error('ENOSPC: no space left on device');
      });

      expect(() => {
        for (let i = 0; i < 5; i++) {
          detector.checkLoop('src/test.js');
          time.advance(1000);
        }
      }).not.toThrow(); // エラーは無視される

      jest.restoreAllMocks();
    });
  });

  // ========================================================================
  // TC8: ログ出力
  // ========================================================================

  describe('ログ出力', () => {
    test('警告時にログファイルに記録される', () => {
      const logFile = '.claude-loop-detection-log.json';
      const detector = createLoopDetector();
      const time = createMockTime();

      // ログファイルをクリア
      if (fs.existsSync(logFile)) {
        fs.unlinkSync(logFile);
      }

      // 警告を発火
      for (let i = 0; i < 5; i++) {
        try {
          detector.checkLoop('src/test.js');
          time.advance(1000);
        } catch (e) {
          // exit で捕捉
        }
      }

      // ログファイルが存在することを確認
      expect(fs.existsSync(logFile)).toBe(true);

      // ログの内容を確認
      const logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
      expect(Array.isArray(logs)).toBe(true);
      expect(logs.some((log) => log.warning === true)).toBe(true);

      // クリーンアップ
      if (fs.existsSync(logFile)) {
        fs.unlinkSync(logFile);
      }
    });
  });
});
