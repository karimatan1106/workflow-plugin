/**
 * REQ-5: 構造要素の重複検出除外テスト
 *
 * artifact-validator.tsのisStructuralLine()機能をテストする。
 * 区切り線、コードフェンス、テーブル区切りが重複検出から除外されることを検証。
 *
 * @spec docs/workflows/ワークフロー残存問題完全解決/test-design.md
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { validateArtifactQuality } from '../artifact-validator.js';

describe('REQ-5: 構造要素の重複検出除外', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('TC-5-1: 区切り線(---)が3回以上あるドキュメントが品質チェックを通過する', () => {
    const content = [
      '# Test Document',
      '## セクション1',
      '本文テキスト1',
      '---',
      '## セクション2',
      '本文テキスト2',
      '---',
      '## セクション3',
      '本文テキスト3',
      '---',
      '## セクション4',
      '本文テキスト4',
    ].join('\n');
    const filePath = path.join(tmpDir, 'test.md');
    fs.writeFileSync(filePath, content);
    const result = validateArtifactQuality(filePath, { minLines: 5, requiredSections: [] });
    expect(result.passed).toBe(true);
  });

  it('TC-5-2: コードフェンスが3回以上あるドキュメントが品質チェックを通過する', () => {
    const content = [
      '# Test Doc',
      '## セクション1',
      '本文テキスト1つ目',
      '```',
      'code block 1',
      '```',
      '## セクション2',
      '本文テキスト2つ目',
      '```',
      'code block 2',
      '```',
      '## セクション3',
      '本文テキスト3つ目',
      '```',
      'code block 3',
      '```',
    ].join('\n');
    const filePath = path.join(tmpDir, 'test2.md');
    fs.writeFileSync(filePath, content);
    const result = validateArtifactQuality(filePath, { minLines: 5, requiredSections: [] });
    expect(result.passed).toBe(true);
  });

  it('TC-5-3: テーブル区切りが3回以上あるドキュメントが品質チェックを通過する', () => {
    const content = [
      '# Test Doc',
      '## テーブル1',
      '| Col1 | Col2 |',
      '|------|------|',
      '| Data | Data |',
      '## テーブル2',
      '| ColA | ColB |',
      '|------|------|',
      '| Info | Info |',
      '## テーブル3',
      '| ColX | ColY |',
      '|------|------|',
      '| Val  | Val  |',
      '本文テキストの追加',
    ].join('\n');
    const filePath = path.join(tmpDir, 'test3.md');
    fs.writeFileSync(filePath, content);
    const result = validateArtifactQuality(filePath, { minLines: 5, requiredSections: [] });
    expect(result.passed).toBe(true);
  });

  it('TC-5-4: 実際のダミーテキスト（同一文章繰り返し）は引き続き検出される', () => {
    const content = [
      '# Test Doc',
      '## セクション',
      'これはダミーテキストです',
      'これはダミーテキストです',
      'これはダミーテキストです',
      '追加テキスト',
      '別のテキスト',
      '最後のテキスト',
    ].join('\n');
    const filePath = path.join(tmpDir, 'test4.md');
    fs.writeFileSync(filePath, content);
    const result = validateArtifactQuality(filePath, { minLines: 5, requiredSections: [] });
    // TC-5-4は現行実装でも通るはず（ダミーテキスト検出は既存機能）
    // ただしTDD Redなので、REQ-5実装前は構造要素が重複扱いされて失敗する可能性あり
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.includes('ダミーテキスト') || e.includes('重複'))).toBe(true);
  });

  it('TC-5-5: 複数種類の構造要素が混在してもチェック通過する', () => {
    const content = [
      '# Test Document',
      '',
      '## セクション1',
      '本文テキストその1',
      '---',
      '',
      '## セクション2',
      '本文テキストその2',
      '```typescript',
      'const x = 1;',
      '```',
      '',
      '## セクション3',
      '| Header1 | Header2 |',
      '|---------|---------|',
      '| Cell1   | Cell2   |',
      '',
      '## セクション4',
      '本文テキストその3',
      '---',
    ].join('\n');
    const filePath = path.join(tmpDir, 'test5.md');
    fs.writeFileSync(filePath, content);
    const result = validateArtifactQuality(filePath, { minLines: 5, requiredSections: [] });
    expect(result.passed).toBe(true);
  });

  it('TC-5-6: 構造要素でない同一行が3回以上 → 重複検出される（TDD Red）', () => {
    const content = [
      '# Test Doc',
      '## セクション1',
      '通常のテキスト行',
      '通常のテキスト行',
      '通常のテキスト行',
      '別の内容',
      '最後の行',
    ].join('\n');
    const filePath = path.join(tmpDir, 'test6.md');
    fs.writeFileSync(filePath, content);
    const result = validateArtifactQuality(filePath, { minLines: 5, requiredSections: [] });
    // REQ-5実装前は構造要素判定なしで重複検出 → failed
    // REQ-5実装後も、「通常のテキスト行」は構造要素でないので重複検出 → failed
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.includes('重複') || e.includes('ダミー'))).toBe(true);
  });
});
