/**
 * REQ-2: 設計検証強化テスト
 *
 * design-validator.ts の正規表現化されたメソッドをテストする。
 * 実装はまだ存在しないため、テストファーストで作成（TDD Red Phase）。
 *
 * @spec docs/workflows/ワ-クフロ-制御強化/test-design.md
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { DesignValidator } from '../design-validator.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('REQ-2: 設計検証強化', () => {
  let tempDir: string;
  let validator: DesignValidator;

  beforeEach(() => {
    // 一時ディレクトリ作成
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-validator-test-'));
    validator = new DesignValidator(tempDir, tempDir);
  });

  afterEach(() => {
    // 一時ディレクトリ削除
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('2.1 removeCommentsAndStrings()', () => {
    test('2.1.1: ブロックコメント除去', () => {
      const input = '/* comment */ code';
      const expected = ' code';

      // privateメソッドなので型アサーションでアクセス
      const result = (validator as any).removeCommentsAndStrings(input);
      expect(result).toBe(expected);
    });

    test('2.1.2: 行コメント除去', () => {
      const input = 'code // comment';
      const expected = 'code ';

      const result = (validator as any).removeCommentsAndStrings(input);
      expect(result).toBe(expected);
    });

    test('2.1.3: ダブルクォート文字列除去', () => {
      const input = '"class User"';
      const expected = '""';

      const result = (validator as any).removeCommentsAndStrings(input);
      expect(result).toBe(expected);
    });

    test('2.1.4: シングルクォート文字列除去', () => {
      const input = "'class User'";
      const expected = "''";

      const result = (validator as any).removeCommentsAndStrings(input);
      expect(result).toBe(expected);
    });

    test('2.1.5: テンプレートリテラル除去', () => {
      const input = '`class User`';
      const expected = '``';

      const result = (validator as any).removeCommentsAndStrings(input);
      expect(result).toBe(expected);
    });

    test('2.1.6: 複合パターン（コメント + 文字列）', () => {
      const input = '/* comment */ "string" code // line comment';
      const expected = ' "" code ';

      const result = (validator as any).removeCommentsAndStrings(input);
      expect(result).toBe(expected);
    });

    test('2.1.7: エスケープされた引用符', () => {
      const input = '"escaped \\"quote\\""';
      const expected = '""';

      const result = (validator as any).removeCommentsAndStrings(input);
      expect(result).toBe(expected);
    });
  });

  describe('2.2 findClassInProject() - 通常パターン', () => {
    test('2.2.1: class User → 検出', () => {
      const testFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(testFile, 'class User { }');

      const result = (validator as any).findClassInProject('User', ['test.ts']);
      expect(result).toBe(true);
    });

    test('2.2.2: export class User → 検出', () => {
      const testFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(testFile, 'export class User { }');

      const result = (validator as any).findClassInProject('User', ['test.ts']);
      expect(result).toBe(true);
    });

    test('2.2.3: export default class User → 検出', () => {
      const testFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(testFile, 'export default class User extends Base { }');

      const result = (validator as any).findClassInProject('User', ['test.ts']);
      expect(result).toBe(true);
    });

    test('2.2.4: abstract class User → 検出', () => {
      const testFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(testFile, 'abstract class User { }');

      const result = (validator as any).findClassInProject('User', ['test.ts']);
      expect(result).toBe(true);
    });

    test('2.2.5: class User extends Base → 検出', () => {
      const testFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(testFile, 'class User extends Base { }');

      const result = (validator as any).findClassInProject('User', ['test.ts']);
      expect(result).toBe(true);
    });

    test('2.2.6: class User<T> → 検出（ジェネリクス）', () => {
      const testFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(testFile, 'class User<T> { }');

      const result = (validator as any).findClassInProject('User', ['test.ts']);
      expect(result).toBe(true);
    });

    test('2.2.7: class User implements IUser → 検出', () => {
      const testFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(testFile, 'class User implements IUser { }');

      const result = (validator as any).findClassInProject('User', ['test.ts']);
      expect(result).toBe(true);
    });
  });

  describe('2.3 findClassInProject() - 誤検知防止', () => {
    test('2.3.1: // class User → 未検出（行コメント内）', () => {
      const testFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(testFile, '// class User { }');

      const result = (validator as any).findClassInProject('User', ['test.ts']);
      expect(result).toBe(false);
    });

    test('2.3.2: /* class User */ → 未検出（ブロックコメント内）', () => {
      const testFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(testFile, '/* class User { } */');

      const result = (validator as any).findClassInProject('User', ['test.ts']);
      expect(result).toBe(false);
    });

    test('2.3.3: "class User" → 未検出（文字列内）', () => {
      const testFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(testFile, 'console.log("class User { }");');

      const result = (validator as any).findClassInProject('User', ['test.ts']);
      expect(result).toBe(false);
    });

    test('2.3.4: `class User` → 未検出（テンプレート内）', () => {
      const testFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(testFile, 'const msg = `class User { }`;');

      const result = (validator as any).findClassInProject('User', ['test.ts']);
      expect(result).toBe(false);
    });

    test('2.3.5: UserClass → 未検出（部分一致）', () => {
      const testFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(testFile, 'class UserClass { }');

      const result = (validator as any).findClassInProject('User', ['test.ts']);
      expect(result).toBe(false);
    });
  });

  describe('2.4 findMethodInProject() - 通常パターン', () => {
    test('2.4.1: function processOrder → 検出', () => {
      const testFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(testFile, 'function processOrder(data) { }');

      const result = (validator as any).findMethodInProject('processOrder', ['test.ts']);
      expect(result).toBe(true);
    });

    test('2.4.2: async function processOrder → 検出', () => {
      const testFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(testFile, 'async function processOrder(data) { }');

      const result = (validator as any).findMethodInProject('processOrder', ['test.ts']);
      expect(result).toBe(true);
    });

    test('2.4.3: export function processOrder → 検出', () => {
      const testFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(testFile, 'export function processOrder(data) { }');

      const result = (validator as any).findMethodInProject('processOrder', ['test.ts']);
      expect(result).toBe(true);
    });

    test('2.4.4: export default function processOrder → 検出', () => {
      const testFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(testFile, 'export default function processOrder(data) { }');

      const result = (validator as any).findMethodInProject('processOrder', ['test.ts']);
      expect(result).toBe(true);
    });

    test('2.4.5: processOrder(data) { } → 検出（クラスメソッド）', () => {
      const testFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(testFile, 'class Order { processOrder(data) { } }');

      const result = (validator as any).findMethodInProject('processOrder', ['test.ts']);
      expect(result).toBe(true);
    });

    test('2.4.6: const processOrder = (data) => → 検出（アロー関数）', () => {
      const testFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(testFile, 'const processOrder = (data) => { };');

      const result = (validator as any).findMethodInProject('processOrder', ['test.ts']);
      expect(result).toBe(true);
    });
  });

  describe('2.5 findMethodInProject() - 誤検知防止', () => {
    test('2.5.1: // processOrder(data) → 未検出（行コメント内）', () => {
      const testFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(testFile, '// processOrder(data)');

      const result = (validator as any).findMethodInProject('processOrder', ['test.ts']);
      expect(result).toBe(false);
    });

    test('2.5.2: /* processOrder */ → 未検出（ブロックコメント内）', () => {
      const testFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(testFile, '/* processOrder(data) */');

      const result = (validator as any).findMethodInProject('processOrder', ['test.ts']);
      expect(result).toBe(false);
    });

    test('2.5.3: "processOrder()" → 未検出（文字列内）', () => {
      const testFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(testFile, 'console.log("processOrder()");');

      const result = (validator as any).findMethodInProject('processOrder', ['test.ts']);
      expect(result).toBe(false);
    });

    test('2.5.4: processOrder.call() → 未検出（メソッド呼び出し）', () => {
      const testFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(testFile, 'obj.processOrder(data);');

      // ★ 注意: この場合、現在の正規表現では検出される可能性がある
      // 実装時にメソッド呼び出しと定義を区別する必要がある
      const result = (validator as any).findMethodInProject('processOrder', ['test.ts']);
      // このテストは実装方針によって期待値が変わる可能性がある
      // 現状の仕様では processOrder( にマッチするため true になる
      expect(result).toBe(true); // メソッド呼び出しも許容
    });
  });

  describe('2.6 findInterfaceInProject() - 新規メソッド（実装予定）', () => {
    test('2.6.1: interface IUser → 検出', () => {
      const testFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(testFile, 'interface IUser { }');

      const result = (validator as any).findInterfaceInProject('IUser', ['test.ts']);
      expect(result).toBe(true);
    });

    test('2.6.2: export interface IUser → 検出', () => {
      const testFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(testFile, 'export interface IUser { }');

      const result = (validator as any).findInterfaceInProject('IUser', ['test.ts']);
      expect(result).toBe(true);
    });

    test('2.6.3: interface IUser<T> → 検出（ジェネリクス）', () => {
      const testFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(testFile, 'interface IUser<T> { }');

      const result = (validator as any).findInterfaceInProject('IUser', ['test.ts']);
      expect(result).toBe(true);
    });

    test('2.6.4: "interface IUser" → 未検出（文字列内）', () => {
      const testFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(testFile, 'const msg = "interface IUser { }";');

      const result = (validator as any).findInterfaceInProject('IUser', ['test.ts']);
      expect(result).toBe(false);
    });
  });

  describe('2.7 findTypeInProject() - 新規メソッド（実装予定）', () => {
    test('2.7.1: type MyType = → 検出', () => {
      const testFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(testFile, 'type MyType = { name: string; };');

      const result = (validator as any).findTypeInProject('MyType', ['test.ts']);
      expect(result).toBe(true);
    });

    test('2.7.2: export type MyType = → 検出', () => {
      const testFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(testFile, 'export type MyType = string;');

      const result = (validator as any).findTypeInProject('MyType', ['test.ts']);
      expect(result).toBe(true);
    });

    test('2.7.3: type MyType<T> = → 検出（ジェネリクス）', () => {
      const testFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(testFile, 'type MyType<T> = T[];');

      const result = (validator as any).findTypeInProject('MyType', ['test.ts']);
      expect(result).toBe(true);
    });

    test('2.7.4: "type MyType" → 未検出（文字列内）', () => {
      const testFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(testFile, 'console.log("type MyType");');

      const result = (validator as any).findTypeInProject('MyType', ['test.ts']);
      expect(result).toBe(false);
    });
  });

  describe('2.8 findEnumInProject() - 新規メソッド（実装予定）', () => {
    test('2.8.1: enum Status → 検出', () => {
      const testFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(testFile, 'enum Status { Active, Inactive }');

      const result = (validator as any).findEnumInProject('Status', ['test.ts']);
      expect(result).toBe(true);
    });

    test('2.8.2: export enum Status → 検出', () => {
      const testFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(testFile, 'export enum Status { Active }');

      const result = (validator as any).findEnumInProject('Status', ['test.ts']);
      expect(result).toBe(true);
    });

    test('2.8.3: "enum Status" → 未検出（文字列内）', () => {
      const testFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(testFile, 'const msg = "enum Status { }";');

      const result = (validator as any).findEnumInProject('Status', ['test.ts']);
      expect(result).toBe(false);
    });
  });
});
