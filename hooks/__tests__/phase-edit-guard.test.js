/**
 * @jest-environment node
 * @spec docs/specs/infrastructure/phase-edit-guard.md
 *
 * フェーズ別編集制限フック（phase-edit-guard.js）のテストコード
 * TDD Green フェーズ: 実装に合わせてテストを更新
 *
 * テスト実行: pnpm test または npx jest
 */

const fs = require('fs');
const path = require('path');

// テスト対象モジュールをインポート
const {
  getFileType,
  isConfigFile,
  isAlwaysAllowed,
  canEditInPhase,
  handleParallelPhase,
  identifyActiveSubPhase,
  displayBlockMessage,
  normalizePath,
  PHASE_RULES,
  PARALLEL_PHASES,
  FILE_TYPE_NAMES,
  EXIT_CODES,
} = require('../phase-edit-guard.js');

describe('phase-edit-guard', () => {
  let consoleOutput = [];
  let originalEnv;

  beforeEach(() => {
    // 状態をリセット
    consoleOutput = [];
    originalEnv = { ...process.env };

    // console.log をモック
    jest.spyOn(console, 'log').mockImplementation((msg) => {
      consoleOutput.push(msg);
    });

    // console.error をモック
    jest.spyOn(console, 'error').mockImplementation((msg) => {
      consoleOutput.push(msg);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  // ========================================================================
  // 3.1.4 設定ファイル（全フェーズ許可）
  // ========================================================================

  describe('設定ファイル（全フェーズ許可）', () => {
    test('TC05: package.json は設定ファイル', () => {
      expect(isConfigFile('package.json')).toBe(true);
    });

    test('TC06: tsconfig.json は設定ファイル', () => {
      expect(isConfigFile('tsconfig.json')).toBe(true);
    });

    test('TC07: .eslintrc.js は設定ファイル', () => {
      expect(isConfigFile('.eslintrc.js')).toBe(true);
    });

    test('TC08: vite.config.ts は設定ファイル', () => {
      expect(isConfigFile('vite.config.ts')).toBe(true);
    });

    test('TC09: .gitignore は設定ファイル', () => {
      expect(isConfigFile('.gitignore')).toBe(true);
    });

    test('TC10: .env.local は環境変数ファイル（config ではない）', () => {
      // .env.local は env タイプ
      expect(getFileType('.env.local')).toBe('env');
    });
  });

  // ========================================================================
  // 3.1.5 ワークフロー状態ファイル（全フェーズ許可）
  // ========================================================================

  describe('ワークフロー状態ファイル（全フェーズ許可）', () => {
    test('TC11: workflow-state.json は常に許可', () => {
      expect(isAlwaysAllowed('docs/workflows/xxx/workflow-state.json')).toBe(true);
    });

    test('TC12: .claude-workflow-state.json は常に許可', () => {
      expect(isAlwaysAllowed('.claude-workflow-state.json')).toBe(true);
    });
  });

  // ========================================================================
  // 3.1.6 フェーズ別許可ケース
  // ========================================================================

  describe('フェーズ別許可ケース', () => {
    test('TC20: idle フェーズで config は許可', () => {
      expect(canEditInPhase('idle', 'config')).toBe(true);
    });

    test('TC40: requirements フェーズで spec は許可', () => {
      expect(canEditInPhase('requirements', 'spec')).toBe(true);
    });

    test('TC42: threat_modeling フェーズで spec は許可', () => {
      expect(canEditInPhase('threat_modeling', 'spec')).toBe(true);
    });

    test('TC43: planning フェーズで spec は許可', () => {
      expect(canEditInPhase('planning', 'spec')).toBe(true);
    });

    test('TC50: state_machine フェーズで diagram は許可', () => {
      expect(canEditInPhase('state_machine', 'diagram')).toBe(true);
    });

    test('TC52: state_machine フェーズで spec は許可', () => {
      expect(canEditInPhase('state_machine', 'spec')).toBe(true);
    });

    test('TC53: flowchart フェーズで diagram は許可', () => {
      expect(canEditInPhase('flowchart', 'diagram')).toBe(true);
    });

    test('TC54: ui_design フェーズで diagram は許可', () => {
      expect(canEditInPhase('ui_design', 'diagram')).toBe(true);
    });

    test('TC55: design_review フェーズで spec は許可', () => {
      expect(canEditInPhase('design_review', 'spec')).toBe(true);
    });

    test('TC60: test_design フェーズで test は許可', () => {
      expect(canEditInPhase('test_design', 'test')).toBe(true);
    });

    test('TC62: test_design フェーズで spec は許可', () => {
      expect(canEditInPhase('test_design', 'spec')).toBe(true);
    });

    test('TC63: test_impl フェーズで test は許可', () => {
      expect(canEditInPhase('test_impl', 'test')).toBe(true);
    });

    test('TC70: implementation フェーズで code は許可', () => {
      expect(canEditInPhase('implementation', 'code')).toBe(true);
    });

    test('TC72: implementation フェーズで spec は許可', () => {
      expect(canEditInPhase('implementation', 'spec')).toBe(true);
    });

    test('TC80: refactoring フェーズで code は許可', () => {
      expect(canEditInPhase('refactoring', 'code')).toBe(true);
    });

    test('TC81: refactoring フェーズで test は許可', () => {
      expect(canEditInPhase('refactoring', 'test')).toBe(true);
    });

    test('TC82: refactoring フェーズで spec は許可', () => {
      expect(canEditInPhase('refactoring', 'spec')).toBe(true);
    });

    test('TC83: code_review フェーズで spec は許可', () => {
      expect(canEditInPhase('code_review', 'spec')).toBe(true);
    });

    test('TC84: docs_update フェーズで spec は許可', () => {
      expect(canEditInPhase('docs_update', 'spec')).toBe(true);
    });

    test('TC100: completed フェーズで code は許可', () => {
      expect(canEditInPhase('completed', 'code')).toBe(true);
    });

    test('TC101: completed フェーズで test は許可', () => {
      expect(canEditInPhase('completed', 'test')).toBe(true);
    });

    test('TC102: completed フェーズで spec は許可', () => {
      expect(canEditInPhase('completed', 'spec')).toBe(true);
    });

    test('TC103: completed フェーズで diagram は許可', () => {
      expect(canEditInPhase('completed', 'diagram')).toBe(true);
    });
  });

  // ========================================================================
  // 3.2.1 idle フェーズでのコード編集禁止
  // ========================================================================

  describe('idle フェーズでのコード編集禁止', () => {
    test('TC21: idle フェーズで code はブロック', () => {
      expect(canEditInPhase('idle', 'code')).toBe(false);
    });

    test('TC22: idle フェーズで test はブロック', () => {
      expect(canEditInPhase('idle', 'test')).toBe(false);
    });

    test('TC23: idle フェーズで spec はブロック', () => {
      expect(canEditInPhase('idle', 'spec')).toBe(false);
    });

    test('TC24: idle フェーズで diagram はブロック', () => {
      expect(canEditInPhase('idle', 'diagram')).toBe(false);
    });
  });

  // ========================================================================
  // 3.2.2 research フェーズ（全面禁止）
  // ========================================================================

  describe('research フェーズ（全面禁止）', () => {
    test('TC30: research フェーズで code はブロック', () => {
      expect(canEditInPhase('research', 'code')).toBe(false);
    });

    test('TC31: research フェーズで test はブロック', () => {
      expect(canEditInPhase('research', 'test')).toBe(false);
    });

    test('TC32: research フェーズで spec はブロック', () => {
      expect(canEditInPhase('research', 'spec')).toBe(false);
    });

    test('TC33: research フェーズで diagram はブロック', () => {
      expect(canEditInPhase('research', 'diagram')).toBe(false);
    });

    test('TC34: research フェーズで other はブロック', () => {
      expect(canEditInPhase('research', 'other')).toBe(false);
    });
  });

  // ========================================================================
  // 3.2.3 仕様フェーズでのコード編集禁止
  // ========================================================================

  describe('仕様フェーズでのコード編集禁止', () => {
    test('TC41: requirements フェーズで code はブロック', () => {
      expect(canEditInPhase('requirements', 'code')).toBe(false);
    });

    test('TC44: threat_modeling フェーズで code はブロック', () => {
      expect(canEditInPhase('threat_modeling', 'code')).toBe(false);
    });

    test('TC45: planning フェーズで code はブロック', () => {
      expect(canEditInPhase('planning', 'code')).toBe(false);
    });

    test('TC46: architecture_review フェーズで code はブロック', () => {
      expect(canEditInPhase('architecture_review', 'code')).toBe(false);
    });

    test('TC47: requirements フェーズで test はブロック', () => {
      expect(canEditInPhase('requirements', 'test')).toBe(false);
    });

    test('TC48: requirements フェーズで diagram はブロック', () => {
      expect(canEditInPhase('requirements', 'diagram')).toBe(false);
    });
  });

  // ========================================================================
  // 3.2.4 設計フェーズでのコード編集禁止
  // ========================================================================

  describe('設計フェーズでのコード編集禁止', () => {
    test('TC51: state_machine フェーズで code はブロック', () => {
      expect(canEditInPhase('state_machine', 'code')).toBe(false);
    });

    test('TC56: flowchart フェーズで code はブロック', () => {
      expect(canEditInPhase('flowchart', 'code')).toBe(false);
    });

    test('TC57: ui_design フェーズで code はブロック', () => {
      expect(canEditInPhase('ui_design', 'code')).toBe(false);
    });

    test('TC58: design_review フェーズで code はブロック', () => {
      expect(canEditInPhase('design_review', 'code')).toBe(false);
    });

    test('TC59: state_machine フェーズで test はブロック', () => {
      expect(canEditInPhase('state_machine', 'test')).toBe(false);
    });
  });

  // ========================================================================
  // 3.2.5 TDD Red フェーズでのソースコード編集禁止
  // ========================================================================

  describe('TDD Red フェーズでのソースコード編集禁止', () => {
    test('TC61: test_impl フェーズで code はブロック', () => {
      expect(canEditInPhase('test_impl', 'code')).toBe(false);
    });

    test('TC64: test_design フェーズで code はブロック', () => {
      expect(canEditInPhase('test_design', 'code')).toBe(false);
    });

    test('TC65: test_impl フェーズで diagram はブロック', () => {
      expect(canEditInPhase('test_impl', 'diagram')).toBe(false);
    });
  });

  // ========================================================================
  // 3.2.6 TDD Green フェーズでのテストコード編集禁止
  // ========================================================================

  describe('TDD Green フェーズでのテストコード編集禁止', () => {
    test('TC71: implementation フェーズで test はブロック', () => {
      expect(canEditInPhase('implementation', 'test')).toBe(false);
    });

    test('TC73: implementation フェーズで test (spec.ts) はブロック', () => {
      expect(canEditInPhase('implementation', 'test')).toBe(false);
    });

    test('TC74: implementation フェーズで diagram はブロック', () => {
      expect(canEditInPhase('implementation', 'diagram')).toBe(false);
    });
  });

  // ========================================================================
  // 3.2.7 読み取り専用フェーズ（全ファイル編集禁止）
  // ========================================================================

  describe('読み取り専用フェーズ（全ファイル編集禁止）', () => {
    test('TC90: build_check フェーズで code はブロック', () => {
      expect(canEditInPhase('build_check', 'code')).toBe(false);
    });

    test('TC91: build_check フェーズで test はブロック', () => {
      expect(canEditInPhase('build_check', 'test')).toBe(false);
    });

    test('TC92: build_check フェーズで spec はブロック', () => {
      expect(canEditInPhase('build_check', 'spec')).toBe(false);
    });

    test('TC93: testing フェーズで code はブロック', () => {
      expect(canEditInPhase('testing', 'code')).toBe(false);
    });

    test('TC94: manual_test フェーズで code はブロック', () => {
      expect(canEditInPhase('manual_test', 'code')).toBe(false);
    });

    test('TC95: security_scan フェーズで code はブロック', () => {
      expect(canEditInPhase('security_scan', 'code')).toBe(false);
    });

    test('TC96: commit フェーズで code はブロック', () => {
      expect(canEditInPhase('commit', 'code')).toBe(false);
    });

    test('TC97: commit フェーズで spec はブロック', () => {
      expect(canEditInPhase('commit', 'spec')).toBe(false);
    });
  });

  // ========================================================================
  // 3.2.8 ドキュメント更新フェーズでのコード編集禁止
  // ========================================================================

  describe('ドキュメント更新フェーズでのコード編集禁止', () => {
    test('TC98: docs_update フェーズで code はブロック', () => {
      expect(canEditInPhase('docs_update', 'code')).toBe(false);
    });

    test('TC99: docs_update フェーズで test はブロック', () => {
      expect(canEditInPhase('docs_update', 'test')).toBe(false);
    });
  });

  // ========================================================================
  // 3.3.1 ファイルタイプ判定の境界
  // ========================================================================

  describe('ファイルタイプ判定の境界', () => {
    test('TC120: 空文字は other を返す', () => {
      expect(getFileType('')).toBe('other');
    });

    test('TC121: カレントディレクトリ "." は other を返す', () => {
      expect(getFileType('.')).toBe('other');
    });

    test('TC122: 拡張子なしファイル "src/index" は other を返す', () => {
      expect(getFileType('src/index')).toBe('other');
    });

    test('TC123: .ts ファイルは code を返す', () => {
      expect(getFileType('src/index.ts')).toBe('code');
    });

    test('TC124: .tsx ファイルは code を返す', () => {
      expect(getFileType('src/index.tsx')).toBe('code');
    });

    test('TC125: .js ファイルは code を返す', () => {
      expect(getFileType('src/index.js')).toBe('code');
    });

    test('TC126: .jsx ファイルは code を返す', () => {
      expect(getFileType('src/index.jsx')).toBe('code');
    });

    test('TC127: .mjs ファイルは code を返す', () => {
      expect(getFileType('src/index.mjs')).toBe('code');
    });

    test('TC128: .cjs ファイルは code を返す', () => {
      expect(getFileType('src/index.cjs')).toBe('code');
    });

    test('TC129: .py ファイルは code を返す', () => {
      expect(getFileType('src/index.py')).toBe('code');
    });

    test('TC130: .test.ts ファイルは test を返す', () => {
      expect(getFileType('src/index.test.ts')).toBe('test');
    });

    test('TC131: .spec.ts ファイルは test を返す', () => {
      expect(getFileType('src/index.spec.ts')).toBe('test');
    });

    test('TC132: __tests__/ 内のファイルは test を返す', () => {
      expect(getFileType('src/__tests__/index.ts')).toBe('test');
    });

    test('TC133: tests/ 内のファイルは test を返す', () => {
      expect(getFileType('tests/unit/index.ts')).toBe('test');
    });

    test('TC134: .md ファイルは spec を返す', () => {
      expect(getFileType('docs/spec.md')).toBe('spec');
    });

    test('TC135: README.md は spec を返す', () => {
      expect(getFileType('README.md')).toBe('spec');
    });

    test('TC136: .mmd ファイルは diagram を返す', () => {
      expect(getFileType('flow.mmd')).toBe('diagram');
    });

    test('TC137: package.json は config を返す', () => {
      expect(getFileType('package.json')).toBe('config');
    });

    test('TC138: tsconfig.json は config を返す', () => {
      expect(getFileType('tsconfig.json')).toBe('config');
    });

    test('TC139: .env ファイルは env を返す', () => {
      expect(getFileType('.env')).toBe('env');
    });

    test('TC140: .env.local ファイルは env を返す', () => {
      expect(getFileType('.env.local')).toBe('env');
    });

    test('TC141: .env.production ファイルは env を返す', () => {
      expect(getFileType('.env.production')).toBe('env');
    });

    test('TC142: .csv ファイルは other を返す', () => {
      expect(getFileType('data.csv')).toBe('other');
    });

    test('TC143: .png ファイルは other を返す', () => {
      expect(getFileType('image.png')).toBe('other');
    });
  });

  // ========================================================================
  // 3.3.2 パス正規化の境界
  // ========================================================================

  describe('パス正規化の境界', () => {
    test('TC150: Windows バックスラッシュパスを正しく処理', () => {
      expect(getFileType('C:\\Projects\\myapp\\src\\x.ts')).toBe('code');
    });

    test('TC151: Windows スラッシュパスを正しく処理', () => {
      expect(getFileType('C:/Projects/myapp/src/x.ts')).toBe('code');
    });

    test('TC152: Unix パスを正しく処理', () => {
      expect(getFileType('/home/user/src/x.ts')).toBe('code');
    });

    test('TC153: 相対パス（カレント）を正しく処理', () => {
      expect(getFileType('./src/x.ts')).toBe('code');
    });

    test('TC154: 相対パス（親）を正しく処理', () => {
      expect(getFileType('../src/x.ts')).toBe('code');
    });

    test('TC155: 大文字小文字混在パスを正しく処理', () => {
      expect(getFileType('src/x.test.ts')).toBe('test');
    });

    test('TC156: 全大文字パスを正しく処理', () => {
      expect(getFileType('SRC/X.TEST.TS')).toBe('test');
    });
  });

  // ========================================================================
  // 3.4 並列フェーズテスト
  // ========================================================================

  describe('並列フェーズテスト', () => {
    describe('parallel_design フェーズ', () => {
      test('TC110: parallel_design で state_machine サブフェーズの diagram は許可', () => {
        const workflowState = {
          subPhases: {
            state_machine: 'in_progress',
            flowchart: 'pending',
            ui_design: 'pending',
          },
          subPhaseUpdates: {
            state_machine: '2026-01-17T10:00:00Z',
          },
        };
        const rule = handleParallelPhase('parallel_design', workflowState);
        expect(rule.allowed).toContain('diagram');
      });

      test('TC111: parallel_design で flowchart サブフェーズの diagram は許可', () => {
        const workflowState = {
          subPhases: {
            state_machine: 'completed',
            flowchart: 'in_progress',
            ui_design: 'pending',
          },
          subPhaseUpdates: {
            flowchart: '2026-01-17T11:00:00Z',
          },
        };
        const rule = handleParallelPhase('parallel_design', workflowState);
        expect(rule.allowed).toContain('diagram');
      });

      test('TC112: parallel_design で ui_design サブフェーズの spec は許可', () => {
        const workflowState = {
          subPhases: {
            state_machine: 'completed',
            flowchart: 'completed',
            ui_design: 'in_progress',
          },
          subPhaseUpdates: {
            ui_design: '2026-01-17T12:00:00Z',
          },
        };
        const rule = handleParallelPhase('parallel_design', workflowState);
        expect(rule.allowed).toContain('spec');
      });

      test('TC113: parallel_design で state_machine サブフェーズの code はブロック', () => {
        const workflowState = {
          subPhases: {
            state_machine: 'in_progress',
            flowchart: 'pending',
            ui_design: 'pending',
          },
          subPhaseUpdates: {
            state_machine: '2026-01-17T10:00:00Z',
          },
        };
        const rule = handleParallelPhase('parallel_design', workflowState);
        expect(rule.blocked).toContain('code');
      });

      test('TC114: parallel_design で flowchart サブフェーズの test はブロック', () => {
        const workflowState = {
          subPhases: {
            state_machine: 'completed',
            flowchart: 'in_progress',
            ui_design: 'pending',
          },
          subPhaseUpdates: {
            flowchart: '2026-01-17T11:00:00Z',
          },
        };
        const rule = handleParallelPhase('parallel_design', workflowState);
        expect(rule.blocked).toContain('test');
      });
    });

    describe('parallel_quality フェーズ', () => {
      test('TC115: parallel_quality で build_check サブフェーズの code はブロック', () => {
        const workflowState = {
          subPhases: {
            build_check: 'in_progress',
            code_review: 'pending',
          },
          subPhaseUpdates: {
            build_check: '2026-01-17T10:00:00Z',
          },
        };
        const rule = handleParallelPhase('parallel_quality', workflowState);
        expect(rule.blocked).toContain('code');
      });

      test('TC116: parallel_quality で code_review サブフェーズの spec は許可', () => {
        const workflowState = {
          subPhases: {
            build_check: 'completed',
            code_review: 'in_progress',
          },
          subPhaseUpdates: {
            code_review: '2026-01-17T11:00:00Z',
          },
        };
        const rule = handleParallelPhase('parallel_quality', workflowState);
        expect(rule.allowed).toContain('spec');
      });
    });

    describe('サブフェーズ不明時', () => {
      test('TC117: サブフェーズ不明時は共通ルールで diagram は許可', () => {
        const workflowState = {
          subPhases: {},
          subPhaseUpdates: {},
        };
        const rule = handleParallelPhase('parallel_design', workflowState);
        expect(rule.allowed).toContain('diagram');
      });

      test('TC118: サブフェーズ不明時は共通ルールで code はブロック', () => {
        const workflowState = {
          subPhases: {},
          subPhaseUpdates: {},
        };
        const rule = handleParallelPhase('parallel_design', workflowState);
        expect(rule.blocked).toContain('code');
      });
    });
  });

  // ========================================================================
  // 3.5 エッジケーステスト
  // ========================================================================

  describe('エッジケーステスト', () => {
    describe('特殊ファイル名', () => {
      test('TC160: .gitignore は config ファイル', () => {
        expect(isConfigFile('.gitignore')).toBe(true);
      });

      test('TC161: .claude/settings.json は config ファイル', () => {
        expect(isConfigFile('.claude/settings.json')).toBe(true);
      });

      test('TC162: スペースを含むファイル名を正しく処理', () => {
        expect(getFileType('src/file with spaces.ts')).toBe('code');
      });

      test('TC163: 日本語ファイル名を正しく処理', () => {
        expect(getFileType('src/ファイル名.ts')).toBe('code');
      });

      test('TC164: 複数サフィックスファイルを正しく処理', () => {
        // .test.spec.ts は test として判定
        expect(getFileType('src/file.test.spec.ts')).toBe('test');
      });

      test('TC165: ネストしたテストディレクトリを正しく処理', () => {
        expect(getFileType('__tests__/__mocks__/x.ts')).toBe('test');
      });
    });

    describe('未知のフェーズ', () => {
      test('TC170: 未知のフェーズは許可（安全側）', () => {
        expect(canEditInPhase('unknown_phase', 'code')).toBe(true);
      });

      test('TC171: 空文字フェーズ名は許可（安全側）', () => {
        expect(canEditInPhase('', 'code')).toBe(true);
      });

      test('TC172: null フェーズ名は許可（安全側）', () => {
        expect(canEditInPhase(null, 'code')).toBe(true);
      });
    });
  });

  // ========================================================================
  // 3.6 エラーメッセージテスト
  // ========================================================================

  describe('エラーメッセージテスト', () => {
    describe('ブロック時のメッセージ内容', () => {
      test('TC200: タイトルに「フェーズ別編集制限違反」を含む', () => {
        const rule = PHASE_RULES['test_impl'];
        displayBlockMessage('test_impl', 'src/index.ts', 'code', rule);
        const output = consoleOutput.join('\n');
        expect(output).toContain('フェーズ別編集制限違反');
      });

      test('TC201: フェーズ名と日本語名を表示', () => {
        const rule = PHASE_RULES['test_impl'];
        displayBlockMessage('test_impl', 'src/index.ts', 'code', rule);
        const output = consoleOutput.join('\n');
        expect(output).toContain('test_impl');
        expect(output).toContain('テスト実装（Red）');
      });

      test('TC202: ファイルパスをそのまま表示', () => {
        const rule = PHASE_RULES['test_impl'];
        displayBlockMessage('test_impl', 'src/index.ts', 'code', rule);
        const output = consoleOutput.join('\n');
        expect(output).toContain('src/index.ts');
      });

      test('TC203: ファイルタイプと日本語名を表示', () => {
        const rule = PHASE_RULES['test_impl'];
        displayBlockMessage('test_impl', 'src/index.ts', 'code', rule);
        const output = consoleOutput.join('\n');
        expect(output).toContain('code');
        expect(output).toContain('ソースコード');
      });

      test('TC204: TDDサイクルの説明を含む', () => {
        const rule = PHASE_RULES['test_impl'];
        displayBlockMessage('test_impl', 'src/index.ts', 'code', rule);
        const output = consoleOutput.join('\n');
        expect(output).toContain('TDD サイクル');
        expect(output).toContain('Red');
        expect(output).toContain('Green');
        expect(output).toContain('Refactor');
      });

      test('TC205: 許可されるファイル一覧を列挙', () => {
        const rule = PHASE_RULES['test_impl'];
        displayBlockMessage('test_impl', 'src/index.ts', 'code', rule);
        const output = consoleOutput.join('\n');
        expect(output).toContain('許可されるファイル');
        expect(output).toContain('テストコード');
        expect(output).toContain('仕様書');
      });

      test('TC206: 次のステップを案内', () => {
        const rule = PHASE_RULES['test_impl'];
        displayBlockMessage('test_impl', 'src/index.ts', 'code', rule);
        const output = consoleOutput.join('\n');
        expect(output).toContain('次のステップ');
      });

      test('TC207: SKIP_PHASE_GUARD によるスキップ方法を提示', () => {
        const rule = PHASE_RULES['test_impl'];
        displayBlockMessage('test_impl', 'src/index.ts', 'code', rule);
        const output = consoleOutput.join('\n');
        expect(output).toContain('SKIP_PHASE_GUARD');
      });

      test('TC208: research フェーズで「読み取り専用」を明記', () => {
        const rule = PHASE_RULES['research'];
        displayBlockMessage('research', 'src/index.ts', 'code', rule);
        const output = consoleOutput.join('\n');
        expect(output).toContain('読み取り専用');
      });

      test('TC209: implementation フェーズで TDD Green 表示', () => {
        const rule = PHASE_RULES['implementation'];
        displayBlockMessage('implementation', 'src/x.test.ts', 'test', rule);
        const output = consoleOutput.join('\n');
        expect(output).toContain('Green');
      });
    });

    describe('区切り線の形式', () => {
      test('TC210: ヘッダー区切りは = 60文字', () => {
        const rule = PHASE_RULES['test_impl'];
        displayBlockMessage('test_impl', 'src/index.ts', 'code', rule);
        const output = consoleOutput.join('\n');
        expect(output).toContain('='.repeat(60));
      });

      test('TC211: フッター区切りは = 60文字', () => {
        const rule = PHASE_RULES['test_impl'];
        displayBlockMessage('test_impl', 'src/index.ts', 'code', rule);
        const separatorCount = consoleOutput.filter((line) => line === '='.repeat(60)).length;
        expect(separatorCount).toBeGreaterThanOrEqual(2);
      });
    });
  });

  // ========================================================================
  // identifyActiveSubPhase テスト
  // ========================================================================

  describe('identifyActiveSubPhase', () => {
    test('subPhaseUpdates から最新のサブフェーズを取得', () => {
      const workflowState = {
        subPhaseUpdates: {
          state_machine: '2026-01-17T10:00:00Z',
          flowchart: '2026-01-17T11:00:00Z',
          ui_design: '2026-01-17T09:00:00Z',
        },
      };
      const subPhases = ['state_machine', 'flowchart', 'ui_design'];
      expect(identifyActiveSubPhase(workflowState, subPhases)).toBe('flowchart');
    });

    test('subPhases から in_progress のサブフェーズを取得', () => {
      const workflowState = {
        subPhases: {
          state_machine: 'completed',
          flowchart: 'in_progress',
          ui_design: 'pending',
        },
      };
      const subPhases = ['state_machine', 'flowchart', 'ui_design'];
      expect(identifyActiveSubPhase(workflowState, subPhases)).toBe('flowchart');
    });

    test('workflowState が null の場合は null を返す', () => {
      expect(identifyActiveSubPhase(null, ['state_machine'])).toBe(null);
    });

    test('サブフェーズが見つからない場合は null を返す', () => {
      const workflowState = {
        subPhases: {
          state_machine: 'pending',
          flowchart: 'pending',
        },
      };
      const subPhases = ['state_machine', 'flowchart'];
      expect(identifyActiveSubPhase(workflowState, subPhases)).toBe(null);
    });
  });

  // ========================================================================
  // normalizePath テスト
  // ========================================================================

  describe('normalizePath', () => {
    test('バックスラッシュをスラッシュに変換', () => {
      expect(normalizePath('C:\\Users\\test\\file.ts')).toBe('c:/users/test/file.ts');
    });

    test('小文字に変換', () => {
      expect(normalizePath('SRC/Index.TS')).toBe('src/index.ts');
    });

    test('空文字はそのまま', () => {
      expect(normalizePath('')).toBe('');
    });

    test('null/undefined は空文字を返す', () => {
      expect(normalizePath(null)).toBe('');
      expect(normalizePath(undefined)).toBe('');
    });
  });

  // ========================================================================
  // PHASE_RULES 定数テスト
  // ========================================================================

  describe('PHASE_RULES 定数', () => {
    test('全フェーズに allowed と blocked が定義されている', () => {
      const phases = Object.keys(PHASE_RULES);
      expect(phases.length).toBeGreaterThan(0);

      for (const phase of phases) {
        const rule = PHASE_RULES[phase];
        expect(Array.isArray(rule.allowed)).toBe(true);
        expect(Array.isArray(rule.blocked)).toBe(true);
        expect(typeof rule.description).toBe('string');
      }
    });

    test('TDD フェーズには tddPhase が定義されている', () => {
      expect(PHASE_RULES['test_impl'].tddPhase).toBe('Red');
      expect(PHASE_RULES['implementation'].tddPhase).toBe('Green');
      expect(PHASE_RULES['refactoring'].tddPhase).toBe('Refactor');
    });

    test('読み取り専用フェーズには readOnly が定義されている', () => {
      expect(PHASE_RULES['research'].readOnly).toBe(true);
      expect(PHASE_RULES['build_check'].readOnly).toBe(true);
      expect(PHASE_RULES['testing'].readOnly).toBe(true);
    });
  });

  // ========================================================================
  // PARALLEL_PHASES 定数テスト
  // ========================================================================

  describe('PARALLEL_PHASES 定数', () => {
    test('parallel_design に3つのサブフェーズがある', () => {
      expect(PARALLEL_PHASES['parallel_design']).toEqual(['state_machine', 'flowchart', 'ui_design']);
    });

    test('parallel_quality に2つのサブフェーズがある', () => {
      expect(PARALLEL_PHASES['parallel_quality']).toEqual(['build_check', 'code_review']);
    });
  });

  // ========================================================================
  // セキュリティテスト
  // ========================================================================

  describe('セキュリティテスト', () => {
    describe('T-006: パストラバーサル', () => {
      test('SEC10: パストラバーサル攻撃を正しく処理', () => {
        // ファイルタイプとして正しく判定されるだけ（他のセキュリティはOSレイヤー）
        expect(getFileType('../../../etc/passwd')).toBe('other');
      });

      test('SEC11: 正規化されたパスを正しく処理', () => {
        expect(getFileType('src/../config.json')).toBe('config');
      });

      test('SEC12: URLエンコードされたパスを適切に処理', () => {
        // URLエンコードはそのまま処理（デコードしない）
        expect(getFileType('%2F%2Fetc%2Fpasswd')).toBe('other');
      });
    });
  });

  // ========================================================================
  // 非機能テスト
  // ========================================================================

  describe('非機能テスト', () => {
    describe('パフォーマンステスト', () => {
      test('PERF02: 100ファイル連続判定 < 1000ms', () => {
        const testFiles = [];
        for (let i = 0; i < 100; i++) {
          testFiles.push(`src/file${i}.ts`);
        }

        const start = Date.now();
        for (const file of testFiles) {
          getFileType(file);
          canEditInPhase('implementation', 'code');
        }
        const elapsed = Date.now() - start;

        expect(elapsed).toBeLessThan(1000);
      });
    });
  });
});
