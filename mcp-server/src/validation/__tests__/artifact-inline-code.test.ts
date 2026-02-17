/**
 * Artifact Validator - Inline Code and Code Fence Extraction Tests
 *
 * FR-B1: removeInlineCode関数のユニットテスト
 * FR-B2: extractNonCodeLines関数のユニットテスト
 * 回帰テスト: isStructuralLine, validateArtifactQualityの動作保証
 *
 * @spec docs/spec/features/artifact-validator-inline-code.md
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  removeInlineCode,
  extractNonCodeLines,
  isStructuralLine,
  validateArtifactQuality,
} from '../artifact-validator.js';

// ============================================================================
// FR-B1: removeInlineCode テスト
// ============================================================================

describe('FR-B1: removeInlineCode()', () => {
  it('TC-B1-1: バックティックなし行はそのまま返す', () => {
    const line = 'これは通常のテキスト行です';
    const result = removeInlineCode(line);
    expect(result).toBe('これは通常のテキスト行です');
  });

  it('TC-B1-2: 単一インラインコードを除去して残りのテキストを返す', () => {
    const line = 'ファイルは `config.ts` に配置する';
    const result = removeInlineCode(line);
    expect(result).toBe('ファイルは  に配置する');
  });

  it('TC-B1-3: 複数インラインコード区間を全て除去する', () => {
    const line = '`foo` と `bar` の両方を削除する';
    const result = removeInlineCode(line);
    expect(result).toBe(' と  の両方を削除する');
  });

  it('TC-B1-4: 奇数バックティック（閉じなし）は行をそのまま返す', () => {
    const line = 'バックティックが`1つだけある行';
    const result = removeInlineCode(line);
    expect(result).toBe('バックティックが`1つだけある行');
  });

  it('TC-B1-5: 空文字列入力で空文字列を返す', () => {
    const result = removeInlineCode('');
    expect(result).toBe('');
  });

  it('TC-B1-6: バックティックのみの行（``）はバックティック2個なので除去され空に近い文字列を返す', () => {
    const line = '``';
    const result = removeInlineCode(line);
    // `` は `[^`]*` にマッチし空文字列になる
    expect(result).toBe('');
  });

  it('TC-B1-7: コードに複数語が含まれる場合も正しく除去する', () => {
    const line = 'コマンド `npm run build` を実行してください';
    const result = removeInlineCode(line);
    expect(result).toBe('コマンド  を実行してください');
  });

  it('TC-B1-8: インラインコード除去後に残るテキストが重複検出に影響しない', () => {
    // インラインコードのみが異なる行でも、除去後が一致する場合は重複とみなされる可能性がある
    const line1 = removeInlineCode('関数 `foo()` を呼び出す');
    const line2 = removeInlineCode('関数 `bar()` を呼び出す');
    // 除去後は同じ文字列になることを確認
    expect(line1).toBe('関数  を呼び出す');
    expect(line2).toBe('関数  を呼び出す');
    expect(line1).toBe(line2);
  });
});

// ============================================================================
// FR-B2: extractNonCodeLines テスト
// ============================================================================

describe('FR-B2: extractNonCodeLines()', () => {
  it('TC-B2-1: バッククォート3つのコードフェンス内の行を除外する', () => {
    const content = [
      '通常のテキスト行です',
      '```typescript',
      'const x = 1;',
      'function hello() {}',
      '```',
      'フェンス後のテキスト行です',
    ].join('\n');

    const result = extractNonCodeLines(content);
    expect(result).toContain('通常のテキスト行です');
    expect(result).toContain('フェンス後のテキスト行です');
    expect(result.some(l => l.includes('const x = 1;'))).toBe(false);
    expect(result.some(l => l.includes('function hello() {}'))).toBe(false);
  });

  it('TC-B2-2: チルダ3つのコードフェンス内の行を除外する', () => {
    const content = [
      'チルダフェンス前のテキスト',
      '~~~python',
      'def hello():',
      '    pass',
      '~~~',
      'チルダフェンス後のテキスト',
    ].join('\n');

    const result = extractNonCodeLines(content);
    expect(result).toContain('チルダフェンス前のテキスト');
    expect(result).toContain('チルダフェンス後のテキスト');
    expect(result.some(l => l.includes('def hello():'))).toBe(false);
    expect(result.some(l => l.includes('    pass'))).toBe(false);
  });

  it('TC-B2-3: バッククォート4つの入れ子フェンスを正しく処理する', () => {
    // ````で始まるフェンスは````で閉じる（バッククォート3つでは閉じない）
    const content = [
      '外部テキスト',
      '````',
      '```inner fence not closing outer```',
      '````',
      '外部テキスト2',
    ].join('\n');

    const result = extractNonCodeLines(content);
    expect(result).toContain('外部テキスト');
    expect(result).toContain('外部テキスト2');
    // フェンス内の行は除外される
    expect(result.some(l => l.includes('inner fence'))).toBe(false);
  });

  it('TC-B2-4: 閉じられていないコードフェンスの行を全て除外する', () => {
    const content = [
      '閉じフェンスなしのドキュメント',
      '```javascript',
      'const unclosed = true;',
      'console.log("not closed");',
      // フェンスが閉じられていない
    ].join('\n');

    const result = extractNonCodeLines(content);
    expect(result).toContain('閉じフェンスなしのドキュメント');
    expect(result.some(l => l.includes('const unclosed = true;'))).toBe(false);
    expect(result.some(l => l.includes('console.log'))).toBe(false);
  });

  it('TC-B2-5: コードフェンス外の行のインラインコードを除去して返す（FR-B1+B2統合）', () => {
    const content = [
      '関数 `myFunction()` を使用してください',
      '```typescript',
      'function myFunction() { return `template`; }',
      '```',
      '変数 `count` の値を確認します',
    ].join('\n');

    const result = extractNonCodeLines(content);
    // インラインコードが除去されていることを確認
    expect(result.some(l => l.includes('関数  を使用してください'))).toBe(true);
    expect(result.some(l => l.includes('変数  の値を確認します'))).toBe(true);
    // フェンス内の行は除外される
    expect(result.some(l => l.includes('function myFunction'))).toBe(false);
  });

  it('TC-B2-6: コードフェンスが存在しない場合は全行を返す', () => {
    const content = [
      '第1行のテキスト',
      '第2行のテキスト',
      '第3行のテキスト',
    ].join('\n');

    const result = extractNonCodeLines(content);
    expect(result.length).toBe(3);
    expect(result[0]).toBe('第1行のテキスト');
    expect(result[1]).toBe('第2行のテキスト');
    expect(result[2]).toBe('第3行のテキスト');
  });

  it('TC-B2-7: 空のコードフェンス（内容なし）を正しく処理する', () => {
    const content = [
      'フェンス前',
      '```',
      '```',
      'フェンス後',
    ].join('\n');

    const result = extractNonCodeLines(content);
    expect(result).toContain('フェンス前');
    expect(result).toContain('フェンス後');
    expect(result.length).toBe(2);
  });

  it('TC-B2-8: 複数のコードフェンスブロックを正しく処理する', () => {
    const content = [
      '序文テキスト',
      '```bash',
      'npm install',
      '```',
      '中間テキスト',
      '```typescript',
      'import { foo } from "./bar";',
      '```',
      '末尾テキスト',
    ].join('\n');

    const result = extractNonCodeLines(content);
    expect(result).toContain('序文テキスト');
    expect(result).toContain('中間テキスト');
    expect(result).toContain('末尾テキスト');
    expect(result.some(l => l.includes('npm install'))).toBe(false);
    expect(result.some(l => l.includes('import { foo }'))).toBe(false);
  });
});

// ============================================================================
// 回帰テスト: isStructuralLine の動作が変わっていないことを確認
// ============================================================================

describe('回帰テスト: isStructuralLine()', () => {
  it('TC-REG-1: Markdownヘッダー行を構造要素として判定する', () => {
    expect(isStructuralLine('## セクション名')).toBe(true);
    expect(isStructuralLine('# タイトル')).toBe(true);
    expect(isStructuralLine('### サブセクション')).toBe(true);
  });

  it('TC-REG-2: 水平線を構造要素として判定する', () => {
    expect(isStructuralLine('---')).toBe(true);
    expect(isStructuralLine('***')).toBe(true);
    expect(isStructuralLine('___')).toBe(true);
  });

  it('TC-REG-3: コードフェンスを構造要素として判定する', () => {
    expect(isStructuralLine('```')).toBe(true);
    expect(isStructuralLine('```typescript')).toBe(true);
  });

  it('TC-REG-4: テーブルセパレータを構造要素として判定する', () => {
    expect(isStructuralLine('|---|---|')).toBe(true);
    expect(isStructuralLine('| --- | --- |')).toBe(true);
  });

  it('TC-REG-5: テーブルデータ行を構造要素として判定する（重複検出対象外）', () => {
    expect(isStructuralLine('| セル1 | セル2 | セル3 |')).toBe(true);
  });

  it('TC-REG-6: 太字ラベルのみの行を構造要素として判定する', () => {
    expect(isStructuralLine('**ラベル**:')).toBe(true);
    expect(isStructuralLine('- **ラベル**:')).toBe(true);
  });

  it('TC-REG-7: 通常のテキスト行は構造要素でないと判定する', () => {
    expect(isStructuralLine('通常のテキスト行です')).toBe(false);
    expect(isStructuralLine('これは実質的なコンテンツです')).toBe(false);
  });
});

// ============================================================================
// 回帰テスト: validateArtifactQualityでのremoveInlineCode統合動作確認
// ============================================================================

describe('回帰テスト: validateArtifactQuality でのインラインコード除去統合', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inline-code-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('TC-REG-8: インラインコード内の禁止パターンはエラーとして検出されない', () => {
    // コードフェンス外のインラインコード内のTODOは除去後に検出されない
    const content = [
      '# テストドキュメント',
      '',
      '## サマリー',
      'このドキュメントは統合テスト用です。バリデーションの動作を確認します。',
      'インラインコード内の禁止語は除去後に判定されます。詳細は仕様書を参照。',
      '',
      '## 調査結果',
      'システムは正常に動作しています。実装済みの機能一覧は以下の通りです。',
      '関数 `TODO_handler()` は既に実装済みです。バリデーション対象外です。',
      '変数 `WIP_flag` の値は常にfalseに設定されています。本番環境での動作確認済み。',
      '処理は `validate_TBD_value()` によって実行されます。期待通りの結果が出ます。',
      '',
      '## 既存実装の分析',
      '既存コードの品質は高く、保守性も良好です。テスト網羅率は80%以上です。',
      'コードレビューの結果、重大な問題は発見されませんでした。改善点は軽微です。',
      '依存関係の分析では循環参照は検出されませんでした。アーキテクチャは健全です。',
      '性能測定の結果、レスポンスタイムは基準値内に収まっています。',
      'セキュリティスキャンでも脆弱性は検出されませんでした。定期的な監査が必要です。',
    ].join('\n');

    const filePath = path.join(tmpDir, 'research.md');
    fs.writeFileSync(filePath, content);

    const result = validateArtifactQuality(filePath, {
      minLines: 10,
      requiredSections: [
        { ja: '## 調査結果', en: '## Investigation Results' },
        { ja: '## 既存実装の分析', en: '## Existing Implementation Analysis' },
      ],
    });

    // インラインコード内の禁止語はコードフェンス外だが除去されるので、
    // 許可される（この動作は現在の実装が意図的にそうなっている）
    // エラー配列に禁止パターン由来のエラーが含まれないことを確認
    const forbiddenErrors = result.errors.filter(e =>
      e.includes('TODO') || e.includes('TBD') || e.includes('WIP')
    );
    expect(forbiddenErrors.length).toBe(0);
  });

  it('TC-REG-9: コードフェンス外の裸の禁止パターンはエラーとして検出される', () => {
    const content = [
      '# テストドキュメント',
      '',
      '## サマリー',
      'このドキュメントは統合テスト用です。',
      '',
      '## 調査結果',
      'TODO: この部分は後で修正が必要です。現在は暫定の実装です。',
      '詳細は後日追加予定です。現状の実装は以下の通りです。',
      '機能Aは正常に動作しています。テスト済みの実装です。',
      '',
      '## 既存実装の分析',
      'コードの品質は標準的です。改善の余地があります。',
      '依存関係に問題はありません。保守性は良好です。',
      '全体的に良好な実装状態です。定期的なレビューが推奨されます。',
    ].join('\n');

    const filePath = path.join(tmpDir, 'research.md');
    fs.writeFileSync(filePath, content);

    const result = validateArtifactQuality(filePath, {
      minLines: 10,
      requiredSections: [
        { ja: '## 調査結果', en: '## Investigation Results' },
        { ja: '## 既存実装の分析', en: '## Existing Implementation Analysis' },
      ],
    });

    // 裸のTODOは検出される
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.includes('TODO'))).toBe(true);
  });
});
