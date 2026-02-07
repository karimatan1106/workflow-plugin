/**
 * SpecParser ユニットテスト
 * @spec docs/workflows/設計-実装整合性の自動検証機能/test-design.md
 */

import { describe, it, expect } from 'vitest';
import { parseSpec } from '../../src/validation/parsers/spec-parser.js';

describe('SpecParser', () => {
  describe('UT-1.1: クラス抽出', () => {
    it('クラス定義を抽出できる', () => {
      // コードブロック外のクラス定義を抽出
      const markdown = `
## クラス設計

### Foo

class Foo {
  bar(): void;
}
`;
      const result = parseSpec(markdown);
      expect(result.classes).toContain('Foo');
    });

    it('複数クラスを抽出できる', () => {
      const markdown = `
class Foo {}
class Bar {}
`;
      const result = parseSpec(markdown);
      expect(result.classes).toContain('Foo');
      expect(result.classes).toContain('Bar');
    });

    it('コードブロック内のクラスは抽出されない（REQ-7）', () => {
      const markdown = `
\`\`\`typescript
class InsideCodeBlock {}
\`\`\`
`;
      const result = parseSpec(markdown);
      expect(result.classes).not.toContain('InsideCodeBlock');
    });
  });

  describe('UT-1.2: メソッド抽出', () => {
    it('メソッド定義を抽出できる', () => {
      // コードブロック外のメソッド定義を抽出
      const markdown = `
bar(): void {}
baz(arg: string): number {}
`;
      const result = parseSpec(markdown);
      expect(result.methods).toContain('bar');
      expect(result.methods).toContain('baz');
    });
  });

  describe('UT-1.3: ファイルパス抽出', () => {
    it('ファイルパスを抽出できる', () => {
      const markdown = `
**ファイル**: \`src/validation/design-validator.ts\`
`;
      const result = parseSpec(markdown);
      expect(result.filePaths).toContain('src/validation/design-validator.ts');
    });

    it('src/で始まるパスを抽出できる', () => {
      const markdown = `
実装は \`src/foo/bar.ts\` に配置します。
`;
      const result = parseSpec(markdown);
      expect(result.filePaths.some(p => p.includes('src/foo/bar.ts'))).toBe(true);
    });
  });

  describe('UT-1.4: 空ファイル', () => {
    it('空文字列で空の結果を返す', () => {
      const result = parseSpec('');
      expect(result.classes).toEqual([]);
      expect(result.methods).toEqual([]);
      expect(result.filePaths).toEqual([]);
    });
  });
});
