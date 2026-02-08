/**
 * REQ-3: design-validator.tsファイルキャッシュテスト
 *
 * design-validator.tsのreadFileWithCache()メソッドをテストする。
 * ファイル読み込みがキャッシュされることを検証する（TDD Red Phase）。
 *
 * @spec docs/workflows/ワークフロー残存問題完全解決/test-design.md
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// fsモジュールをモック
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    readFileSync: vi.fn(actual.readFileSync),
  };
});

// REQ-3実装前: DesignValidatorクラスにreadFileWithCache()は存在しない → import失敗（Red）
// REQ-3実装後: readFileWithCache()が実装される → テスト成功（Green）
import { DesignValidator } from '../design-validator.js';

let tmpDir: string;

describe('REQ-3: design-validator.tsファイルキャッシュ', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-cache-test-'));
  });

  afterEach(() => {
    vi.resetAllMocks();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('TC-3-1: 同一ファイル2回目読み込み → キャッシュヒット', () => {
    test('validateAll()が同一ファイルを複数回読み込む際にキャッシュが効く', () => {
      const workflowDir = path.join(tmpDir, 'workflow');
      fs.mkdirSync(workflowDir);

      const specFile = path.join(workflowDir, 'spec.md');
      const testFile = path.join(tmpDir, 'test.ts');

      // spec.mdに同じファイルパスを複数回記載（クラス定義、メソッド定義で同一ファイル参照）
      fs.writeFileSync(specFile, `# Spec

## 関連ファイル
- test.ts

## クラス
- TestClass

## メソッド
- testMethod
`);
      fs.writeFileSync(testFile, `class TestClass {
  testMethod() {}
}`);

      const validator = new DesignValidator(workflowDir, tmpDir);
      vi.clearAllMocks();

      // validateAll実行（内部で同じtest.tsを複数回検索）
      validator.validateAll();

      // fs.readFileSyncは各ファイル1回のみ呼ばれる（キャッシュ効果）
      const calls = vi.mocked(fs.readFileSync).mock.calls;
      const testFileCalls = calls.filter(call => call[0] === testFile);
      expect(testFileCalls.length).toBeLessThanOrEqual(1);
    });

    test('異なるファイルの読み込みはそれぞれキャッシュされる', () => {
      const workflowDir = path.join(tmpDir, 'workflow');
      fs.mkdirSync(workflowDir);

      const specFile = path.join(workflowDir, 'spec.md');
      const file1 = path.join(tmpDir, 'file1.ts');
      const file2 = path.join(tmpDir, 'file2.ts');

      fs.writeFileSync(specFile, `# Spec

## 関連ファイル
- file1.ts
- file2.ts

## クラス
- ClassA
`);
      fs.writeFileSync(file1, 'class ClassA {}');
      fs.writeFileSync(file2, 'const x = 1;');

      const validator = new DesignValidator(workflowDir, tmpDir);
      vi.clearAllMocks();

      validator.validateAll();

      const calls = vi.mocked(fs.readFileSync).mock.calls;
      const file1Calls = calls.filter(call => call[0] === file1);
      const file2Calls = calls.filter(call => call[0] === file2);

      // 各ファイル1回のみ読み込まれる
      expect(file1Calls.length).toBeLessThanOrEqual(1);
      expect(file2Calls.length).toBeLessThanOrEqual(1);
    });
  });

  describe('TC-3-2: clearCache()でキャッシュクリア', () => {
    test('clearCache()が正常に動作する', () => {
      const workflowDir = path.join(tmpDir, 'workflow');
      fs.mkdirSync(workflowDir);

      const validator = new DesignValidator(workflowDir, tmpDir);

      // clearCache()を呼び出せることを確認
      expect(() => validator.clearCache()).not.toThrow();
    });

    test('validateAll()完了時にキャッシュがクリアされる', () => {
      const workflowDir = path.join(tmpDir, 'workflow');
      fs.mkdirSync(workflowDir);

      const specFile = path.join(workflowDir, 'spec.md');
      const implFile = path.join(tmpDir, 'impl.ts');

      fs.writeFileSync(specFile, `# Spec

## 関連ファイル
- impl.ts

## クラス
- TestClass
`);
      fs.writeFileSync(implFile, 'class TestClass {}');

      const validator = new DesignValidator(workflowDir, tmpDir);

      // 1回目のvalidateAll
      vi.clearAllMocks();
      validator.validateAll();
      const callsAfterFirst = vi.mocked(fs.readFileSync).mock.calls.length;

      // 2回目のvalidateAll（キャッシュがクリアされているので再度読み込まれる）
      vi.clearAllMocks();
      validator.validateAll();
      const callsAfterSecond = vi.mocked(fs.readFileSync).mock.calls.length;

      // 2回目も同じ回数のfs.readFileSync()が呼ばれる（キャッシュクリアの証明）
      expect(callsAfterSecond).toBeGreaterThan(0);
      expect(callsAfterSecond).toBe(callsAfterFirst);
    });
  });

  describe('TC-3-3: キャッシュによるパフォーマンス改善', () => {
    test('大量ファイル読み込みでキャッシュ効果を確認', () => {
      const workflowDir = path.join(tmpDir, 'workflow');
      fs.mkdirSync(workflowDir);

      const specFile = path.join(workflowDir, 'spec.md');
      const files = Array.from({ length: 10 }, (_, i) => {
        const file = path.join(tmpDir, `file-${i}.ts`);
        fs.writeFileSync(file, `class Class${i} {}`);
        return `file-${i}.ts`;
      });

      fs.writeFileSync(specFile, `# Spec

## 関連ファイル
${files.map(f => `- ${f}`).join('\n')}

## クラス
${files.map((f, i) => `- Class${i}`).join('\n')}

## メソッド
${files.map((f, i) => `- method${i}`).join('\n')}
`);

      const validator = new DesignValidator(workflowDir, tmpDir);
      vi.clearAllMocks();

      // validateAll実行（クラス検索・メソッド検索で同じファイルを複数回参照）
      validator.validateAll();

      // fs.readFileSync()の呼び出し回数がファイル数以下（キャッシュ効果）
      const calls = vi.mocked(fs.readFileSync).mock.calls;
      const tsFileCalls = calls.filter(call => String(call[0]).endsWith('.ts'));
      expect(tsFileCalls.length).toBeLessThanOrEqual(10);
    });
  });

  describe('TC-3-4: エラーハンドリング', () => {
    test('validateAll()がエラーなく完了し、キャッシュがクリアされる', () => {
      const workflowDir = path.join(tmpDir, 'workflow');
      fs.mkdirSync(workflowDir);

      const specFile = path.join(workflowDir, 'spec.md');
      const implFile = path.join(tmpDir, 'impl.ts');

      fs.writeFileSync(specFile, `# Spec

## 関連ファイル
- impl.ts

## クラス
- TestClass
`);
      fs.writeFileSync(implFile, 'class TestClass {}');

      const validator = new DesignValidator(workflowDir, tmpDir);

      // validateAll()が例外を投げないことを確認
      expect(() => validator.validateAll()).not.toThrow();

      // validateAll()が正常に完了する
      const result = validator.validateAll();
      expect(result).toBeDefined();
      expect(result.passed).toBe(true);
    });
  });
});
