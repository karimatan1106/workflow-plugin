/**
 * spec-parser 強化機能のテスト
 *
 * REQ-7: spec-parserの強化
 * - interface/type/enum の抽出
 * - Reactコンポーネントの抽出
 * - コードブロック除外
 *
 * @spec docs/workflows/ワ-クフロ-大規模対応改善/test-design.md
 */

import { describe, test, expect } from 'vitest';
import { parseSpec } from '../spec-parser.js';

describe('parseSpec - REQ-7: Enhanced parsing', () => {
  // TC-7.1: interface抽出
  test('should extract interface definitions', () => {
    const markdown = `
## 型定義

interface User {
  id: string;
  name: string;
}

interface Product {
  id: number;
}
`;

    const result = parseSpec(markdown);

    expect(result.classes).toContain('User');
    expect(result.classes).toContain('Product');
  });

  // TC-7.2: type抽出
  test('should extract type definitions', () => {
    const markdown = `
## 型定義

type UserId = string;
type Status = 'active' | 'inactive';
`;

    const result = parseSpec(markdown);

    expect(result.classes).toContain('UserId');
    expect(result.classes).toContain('Status');
  });

  // TC-7.3: enum抽出
  test('should extract enum definitions', () => {
    const markdown = `
## 列挙型

enum Role {
  Admin = 'admin',
  User = 'user'
}

enum Status {
  Active,
  Inactive
}
`;

    const result = parseSpec(markdown);

    expect(result.classes).toContain('Role');
    expect(result.classes).toContain('Status');
  });

  // TC-7.4: Reactコンポーネント抽出
  test('should extract React function components', () => {
    const markdown = `
## コンポーネント

export function Button() {
  return <button>Click</button>;
}

function Modal() {
  return <div>Modal</div>;
}
`;

    const result = parseSpec(markdown);

    expect(result.methods).toContain('Button');
    expect(result.methods).toContain('Modal');
  });

  // TC-7.5: コードブロック内を除外
  test('should exclude code blocks from extraction', () => {
    const markdown = `
## 仕様

実際の定義:
interface User {
  id: string;
}

サンプルコード:
\`\`\`typescript
interface FakeUser {
  fake: boolean;
}
\`\`\`
`;

    const result = parseSpec(markdown);

    expect(result.classes).toContain('User');
    expect(result.classes).not.toContain('FakeUser');
  });

  // TC-7.6: 混在パターン
  test('should extract all types from mixed content', () => {
    const markdown = `
## 仕様

interface User {}
type UserId = string;
enum Role { Admin }
class UserService {}

export function UserProfile() {}
`;

    const result = parseSpec(markdown);

    expect(result.classes).toContain('User');
    expect(result.classes).toContain('UserId');
    expect(result.classes).toContain('Role');
    expect(result.classes).toContain('UserService');
    expect(result.methods).toContain('UserProfile');
  });

  // TC-7.7: 通常の関数とReactコンポーネントの区別
  test('should distinguish React components from regular functions', () => {
    const markdown = `
function processData() {} // 小文字開始
function Button() {} // 大文字開始（Reactコンポーネント）
`;

    const result = parseSpec(markdown);

    expect(result.methods).toContain('Button');
    expect(result.methods).toContain('processData');
  });

  // コードブロックが複数ある場合
  test('should exclude multiple code blocks', () => {
    const markdown = `
interface RealInterface {}

\`\`\`typescript
interface FakeInterface1 {}
\`\`\`

type RealType = string;

\`\`\`javascript
type FakeType = number;
\`\`\`
`;

    const result = parseSpec(markdown);

    expect(result.classes).toContain('RealInterface');
    expect(result.classes).toContain('RealType');
    expect(result.classes).not.toContain('FakeInterface1');
    expect(result.classes).not.toContain('FakeType');
  });

  // ネストしたコードブロック
  test('should handle nested structures', () => {
    const markdown = `
interface Parent {
  child: Child;
}

interface Child {
  value: string;
}
`;

    const result = parseSpec(markdown);

    expect(result.classes).toContain('Parent');
    expect(result.classes).toContain('Child');
  });

  // exportなしのReactコンポーネント
  test('should extract React components without export', () => {
    const markdown = `
function Header() {
  return <header />;
}

const Footer = () => <footer />;
`;

    const result = parseSpec(markdown);

    expect(result.methods).toContain('Header');
    // アロー関数は既存のパターンでは検出されない（仕様通り）
  });

  // interfaceとclassが同名の場合
  test('should not duplicate same names', () => {
    const markdown = `
interface User {}
class User {}
`;

    const result = parseSpec(markdown);

    // 重複は排除される
    const userCount = result.classes.filter(c => c === 'User').length;
    expect(userCount).toBe(1);
  });

  // 空のマークダウン
  test('should return empty arrays for empty markdown', () => {
    const result = parseSpec('');

    expect(result.classes).toEqual([]);
    expect(result.methods).toEqual([]);
    expect(result.filePaths).toEqual([]);
  });

  // コードブロックのみのマークダウン
  test('should return empty arrays when only code blocks exist', () => {
    const markdown = `
\`\`\`typescript
interface OnlyInCodeBlock {}
\`\`\`
`;

    const result = parseSpec(markdown);

    expect(result.classes).toEqual([]);
  });
});
