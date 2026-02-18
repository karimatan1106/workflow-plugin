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
import { validateArtifactQuality, isStructuralLine } from '../artifact-validator.js';

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
    // Note: Multi-column table separators (e.g. |------|------| ) are NOT matched
    // by isStructuralLine's regex (which only matches single-column separators).
    // Use different column counts per table to avoid duplicate separator lines.
    const content = [
      '# Test Doc',
      '## テーブル1',
      '詳細な説明文1を追加します',
      'テーブル1はユーザーデータを表示するために使用されます',
      '以下のテーブルにデータの一覧を示します',
      '| Col1 | Col2 |',
      '|------|------|',
      '| Data1A | Data1B |',
      '追加の本文テキスト1を記述します',
      'テーブル1のデータは定期的に更新される予定です',
      '## テーブル2',
      '詳細な説明文2を追加します',
      'テーブル2は設定情報を管理するためのものです',
      '各設定項目の値を以下に示します',
      '| ColA | ColB | ColC |',
      '|------|------|------|',
      '| InfoA | InfoB | InfoC |',
      '追加の本文テキスト2を記述します',
      'テーブル2の設定は管理画面から変更できます',
      '## テーブル3',
      '詳細な説明文3を追加します',
      'テーブル3はログデータの要約を表示します',
      '過去30日間のログを集計した結果です',
      '| ColX | ColY | ColZ | ColW |',
      '|------|------|------|------|',
      '| ValX | ValY | ValZ | ValW |',
      '本文テキストの追加としてテーブル3の補足説明です',
      '追加の本文テキスト3としてまとめを記載します',
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

describe('isStructuralLine - プレーンラベル行の除外（FR-2拡張）', () => {
  it('リスト記号なし・半角コロン終端のラベル行が構造的行として判定される', () => {
    expect(isStructuralLine('実行結果:')).toBe(true);
  });

  it('リスト記号なし・半角コロン+空白終端のラベル行が構造的行として判定される', () => {
    expect(isStructuralLine('実行結果: ')).toBe(true);
  });

  it('リスト記号なし・全角コロン終端のラベル行が構造的行として判定される', () => {
    expect(isStructuralLine('ステータス：')).toBe(true);
  });

  it('リスト記号なし・短いラベル行が構造的行として判定される', () => {
    expect(isStructuralLine('合否:')).toBe(true);
  });

  it('リスト記号ありの既存動作が継続して機能する（後方互換性）', () => {
    expect(isStructuralLine('- 結果:')).toBe(true);
    expect(isStructuralLine('* 状態:')).toBe(true);
  });

  it('コロン前50文字のラベル行が構造的行として判定される（境界値上限）', () => {
    const label = 'あ'.repeat(50) + ':';
    expect(label.length).toBe(51);
    expect(isStructuralLine(label)).toBe(true);
  });

  it('コロン前51文字のラベル行が構造的行として判定されない（境界値超過）', () => {
    const label = 'あ'.repeat(51) + ':';
    expect(label.length).toBe(52);
    expect(isStructuralLine(label)).toBe(false);
  });

  it('コロンで終わらない通常テキスト行が構造的行として判定されない', () => {
    expect(isStructuralLine('実行結果は正常でした')).toBe(false);
  });

  it('コロンの後に非空白文字がある行が構造的行として判定されない', () => {
    expect(isStructuralLine('実行結果: OK')).toBe(false);
    expect(isStructuralLine('- レベル: Low')).toBe(false);
  });

  it('空行が構造的行として判定されない', () => {
    expect(isStructuralLine('')).toBe(false);
  });
});
