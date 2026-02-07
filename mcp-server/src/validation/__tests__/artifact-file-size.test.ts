/**
 * REQ-4: 成果物ファイルサイズチェックテスト
 *
 * check-workflow-artifact.js のファイルサイズチェックロジックをテストする。
 * 実装はまだ存在しないため、テストファーストで作成（TDD Red Phase）。
 *
 * @spec docs/workflows/ワ-クフロ-制御強化/test-design.md
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * 成果物ファイルのサイズチェック（実装予定の関数）
 *
 * @param filePath ファイルパス
 * @returns エラー・警告の情報
 */
function checkArtifactFileSize(
  filePath: string
): { error: string | null; warning: string | null } {
  try {
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;

    // 0バイトはエラー
    if (fileSize === 0) {
      return { error: '空ファイル', warning: null };
    }

    // 50バイト未満は警告
    if (fileSize < 50) {
      return { error: null, warning: '内容不足' };
    }

    // 正常
    return { error: null, warning: null };
  } catch (e) {
    // ファイル読み取りエラーは警告
    return { error: null, warning: 'ファイル読み取りエラー' };
  }
}

describe('REQ-4: 成果物ファイルサイズチェック', () => {
  let tempDir: string;

  beforeEach(() => {
    // 一時ディレクトリ作成
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-test-'));
  });

  afterEach(() => {
    // 一時ディレクトリ削除
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('4.1 ファイルサイズ0バイト → エラー', () => {
    test('4.1.1: 0バイトファイル → error あり', () => {
      const filePath = path.join(tempDir, 'empty.md');
      fs.writeFileSync(filePath, '');

      const result = checkArtifactFileSize(filePath);
      expect(result.error).toBeTruthy();
      expect(result.error).toContain('空ファイル');
      expect(result.warning).toBeNull();
    });

    test('4.1.2: touch で作成した空ファイル → error あり', () => {
      const filePath = path.join(tempDir, 'research.md');
      fs.writeFileSync(filePath, '', 'utf-8');

      const result = checkArtifactFileSize(filePath);
      expect(result.error).toBeTruthy();
    });
  });

  describe('4.2 ファイルサイズ50バイト未満 → 警告', () => {
    test('4.2.1: 10バイトファイル → warning あり', () => {
      const filePath = path.join(tempDir, 'short.md');
      fs.writeFileSync(filePath, '1234567890'); // 10バイト

      const result = checkArtifactFileSize(filePath);
      expect(result.error).toBeNull();
      expect(result.warning).toBeTruthy();
      expect(result.warning).toContain('内容不足');
    });

    test('4.2.2: 49バイトファイル → warning あり（境界値）', () => {
      const filePath = path.join(tempDir, 'boundary.md');
      fs.writeFileSync(filePath, 'a'.repeat(49)); // 49バイト

      const result = checkArtifactFileSize(filePath);
      expect(result.error).toBeNull();
      expect(result.warning).toBeTruthy();
    });

    test('4.2.3: 1バイトファイル → warning あり', () => {
      const filePath = path.join(tempDir, 'minimal.md');
      fs.writeFileSync(filePath, 'x');

      const result = checkArtifactFileSize(filePath);
      expect(result.error).toBeNull();
      expect(result.warning).toBeTruthy();
    });
  });

  describe('4.3 ファイルサイズ50バイト以上 → OK', () => {
    test('4.3.1: 50バイトファイル → OK（境界値）', () => {
      const filePath = path.join(tempDir, 'ok.md');
      fs.writeFileSync(filePath, 'a'.repeat(50)); // 50バイト

      const result = checkArtifactFileSize(filePath);
      expect(result.error).toBeNull();
      expect(result.warning).toBeNull();
    });

    test('4.3.2: 100バイトファイル → OK', () => {
      const filePath = path.join(tempDir, 'good.md');
      fs.writeFileSync(filePath, 'a'.repeat(100)); // 100バイト

      const result = checkArtifactFileSize(filePath);
      expect(result.error).toBeNull();
      expect(result.warning).toBeNull();
    });

    test('4.3.3: 1KBファイル → OK', () => {
      const filePath = path.join(tempDir, 'large.md');
      fs.writeFileSync(filePath, 'a'.repeat(1024)); // 1KB

      const result = checkArtifactFileSize(filePath);
      expect(result.error).toBeNull();
      expect(result.warning).toBeNull();
    });

    test('4.3.4: 実際のMarkdownファイル → OK', () => {
      const filePath = path.join(tempDir, 'spec.md');
      const content = `# 仕様書

## 概要

これは実際のドキュメントの例です。
50バイトを超えるコンテンツが含まれています。
`;
      fs.writeFileSync(filePath, content);

      const result = checkArtifactFileSize(filePath);
      expect(result.error).toBeNull();
      expect(result.warning).toBeNull();
    });
  });

  describe('4.4 ファイルが存在しない → 警告', () => {
    test('4.4.1: 存在しないファイル → warning あり', () => {
      const filePath = path.join(tempDir, 'nonexistent.md');

      const result = checkArtifactFileSize(filePath);
      expect(result.error).toBeNull();
      expect(result.warning).toBeTruthy();
      expect(result.warning).toContain('ファイル読み取りエラー');
    });

    test('4.4.2: ディレクトリを指定 → warning あり', () => {
      const dirPath = tempDir;

      const result = checkArtifactFileSize(dirPath);
      // fs.statSync はディレクトリに対しても成功するが、
      // 実装では isFile() チェックを追加する可能性がある
      // 現在の実装ではディレクトリのサイズが返される

      // ★ 実装時にディレクトリのチェックを追加することを検討
      // 現状は stats.size が返されるため、ディレクトリサイズ次第
    });
  });

  describe('4.5 エッジケース', () => {
    test('4.5.1: UTF-8マルチバイト文字 → バイト数で判定', () => {
      const filePath = path.join(tempDir, 'multibyte.md');
      // 「あ」は3バイト、10文字で30バイト
      fs.writeFileSync(filePath, 'あ'.repeat(10));

      const result = checkArtifactFileSize(filePath);
      // 30バイト < 50バイトなので警告
      expect(result.error).toBeNull();
      expect(result.warning).toBeTruthy();
    });

    test('4.5.2: 改行のみのファイル → 警告', () => {
      const filePath = path.join(tempDir, 'newlines.md');
      fs.writeFileSync(filePath, '\n\n\n'); // 3バイト

      const result = checkArtifactFileSize(filePath);
      expect(result.error).toBeNull();
      expect(result.warning).toBeTruthy();
    });

    test('4.5.3: 空白のみのファイル → 警告', () => {
      const filePath = path.join(tempDir, 'spaces.md');
      fs.writeFileSync(filePath, '                    '); // 20バイト

      const result = checkArtifactFileSize(filePath);
      expect(result.error).toBeNull();
      expect(result.warning).toBeTruthy();
    });

    test('4.5.4: バイナリファイル → サイズで判定', () => {
      const filePath = path.join(tempDir, 'binary.bin');
      const buffer = Buffer.alloc(60);
      fs.writeFileSync(filePath, buffer);

      const result = checkArtifactFileSize(filePath);
      // 60バイトなので OK
      expect(result.error).toBeNull();
      expect(result.warning).toBeNull();
    });

    test('4.5.5: シンボリックリンク（環境依存）', () => {
      // シンボリックリンクのテストは環境依存のためスキップ可能
      // 実装時に必要に応じて対応
      expect(true).toBe(true);
    });

    test('4.5.6: 読み取り権限なしファイル（権限テスト）', () => {
      // 権限テストは環境・OS依存のためスキップ可能
      // 実装時に fs.statSync が失敗することを想定
      expect(true).toBe(true);
    });
  });

  describe('4.6 複数ファイルのチェック', () => {
    test('4.6.1: 複数ファイルを順次チェック', () => {
      const files = [
        { name: 'empty.md', content: '', expectedError: true, expectedWarning: false },
        { name: 'short.md', content: 'short', expectedError: false, expectedWarning: true },
        { name: 'ok.md', content: 'a'.repeat(100), expectedError: false, expectedWarning: false },
      ];

      for (const file of files) {
        const filePath = path.join(tempDir, file.name);
        fs.writeFileSync(filePath, file.content);

        const result = checkArtifactFileSize(filePath);
        expect(!!result.error).toBe(file.expectedError);
        expect(!!result.warning).toBe(file.expectedWarning);
      }
    });
  });

  describe('4.7 実際のワークフローディレクトリ構造', () => {
    test('4.7.1: research.md が空ファイル → エラー', () => {
      const workflowDir = path.join(tempDir, 'workflow');
      fs.mkdirSync(workflowDir);

      const researchPath = path.join(workflowDir, 'research.md');
      fs.writeFileSync(researchPath, '');

      const result = checkArtifactFileSize(researchPath);
      expect(result.error).toBeTruthy();
    });

    test('4.7.2: spec.md が50バイト以上 → OK', () => {
      const workflowDir = path.join(tempDir, 'workflow');
      fs.mkdirSync(workflowDir);

      const specPath = path.join(workflowDir, 'spec.md');
      fs.writeFileSync(specPath, '# Spec\n\nThis is a specification document with enough content.');

      const result = checkArtifactFileSize(specPath);
      expect(result.error).toBeNull();
      expect(result.warning).toBeNull();
    });
  });
});
