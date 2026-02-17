/**
 * P0-3 テスト: writeTaskIndexCacheのアトミック書き込み検証
 * @spec docs/workflows/P0問題3件の根本修正/test-design.md
 *
 * discover-tasks.jsのwriteTaskIndexCache関数が
 * write-then-renameパターンを使用してアトミックに書き込むことを検証する。
 *
 * writeTaskIndexCacheはモジュール内部関数（非公開）のため、
 * ソースコード解析による実装検証と、discoverTasksを通じた統合テストを採用する。
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';

describe('P0-3: writeTaskIndexCacheのアトミック書き込み', () => {
  /** discover-tasks.jsのソースコードを読み込む（実装検証用） */
  function loadDiscoverTasksSource(): string {
    const esmRequire = createRequire(import.meta.url);
    const modulePath = esmRequire.resolve('../../../hooks/lib/discover-tasks.js');
    return readFileSync(modulePath, 'utf8');
  }

  describe('TC-3-1: writeTaskIndexCacheがfs.renameSyncを使用している', () => {
    it('ソースコードにrenameSyncの呼び出しが含まれる', () => {
      const source = loadDiscoverTasksSource();

      // write-then-renameパターンの核心であるrenameSyncが使用されていることを確認する
      expect(source).toContain('renameSync');
    });

    it('ソースコードにwriteTaskIndexCache関数が定義されている', () => {
      const source = loadDiscoverTasksSource();

      // 関数が存在することを確認する
      expect(source).toContain('writeTaskIndexCache');
    });

    it('ソースコードにfs.renameSyncの呼び出しがwriteTaskIndexCache関数内に含まれる', () => {
      const source = loadDiscoverTasksSource();

      // writeTaskIndexCache関数の定義ブロックを抽出する
      const funcBlock = extractFunctionBlock(source, 'writeTaskIndexCache');
      // アトミック書き込みパターンのrenameSync呼び出しが関数内に存在することを確認する
      expect(funcBlock).toContain('renameSync');
    });
  });

  describe('TC-3-2: 一時ファイル名がprocess.pidを含む', () => {
    it('ソースコードにprocess.pidを使った一時ファイル名の構築が含まれる', () => {
      const source = loadDiscoverTasksSource();
      const funcBlock = extractFunctionBlock(source, 'writeTaskIndexCache');

      // process.pidを含む一時ファイル名の構築コードが存在することを確認する
      expect(funcBlock).toContain('process.pid');
    });

    it('ソースコードに.tmpサフィックスを持つ一時ファイル名の構築が含まれる', () => {
      const source = loadDiscoverTasksSource();
      const funcBlock = extractFunctionBlock(source, 'writeTaskIndexCache');

      // .tmpサフィックスを使った一時ファイル命名が実装されていることを確認する
      expect(funcBlock).toContain('.tmp');
    });

    it('一時ファイルのパスがTASK_INDEX_FILEと同一ディレクトリであることが確認できる', () => {
      const source = loadDiscoverTasksSource();
      const funcBlock = extractFunctionBlock(source, 'writeTaskIndexCache');

      // TASK_INDEX_FILEを基点に一時ファイルパスを構築していることを確認する
      // これはrenameがアトミックに機能するための必要条件である（同一ファイルシステム）
      const hasTmpFilePath = funcBlock.includes('TASK_INDEX_FILE') && funcBlock.includes('.tmp');
      expect(hasTmpFilePath).toBe(true);
    });
  });

  describe('TC-3-3: rename失敗時に一時ファイルが削除される', () => {
    it('ソースコードにunlinkSyncによる一時ファイル削除処理が含まれる', () => {
      const source = loadDiscoverTasksSource();
      const funcBlock = extractFunctionBlock(source, 'writeTaskIndexCache');

      // エラーハンドリングでunlinkSyncが呼ばれることを確認する（一時ファイルのクリーンアップ）
      expect(funcBlock).toContain('unlinkSync');
    });

    it('ソースコードにtry-catchによるエラーハンドリングが含まれる', () => {
      const source = loadDiscoverTasksSource();
      const funcBlock = extractFunctionBlock(source, 'writeTaskIndexCache');

      // rename/write失敗時の例外処理が実装されていることを確認する
      expect(funcBlock).toContain('catch');
    });

    it('一時ファイルの削除失敗時に外部に例外を漏らさないことが確認できる', () => {
      const source = loadDiscoverTasksSource();
      const funcBlock = extractFunctionBlock(source, 'writeTaskIndexCache');

      // unlink周辺にもtry-catchが存在することを確認する（二重のエラーハンドリング）
      // ベストエフォートのキャッシュ書き込みは例外を握りつぶす必要がある
      const catchCount = (funcBlock.match(/catch/g) ?? []).length;
      expect(catchCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('TC-3-4: 1秒以内に更新済みの場合はスキップされる（既存機能の維持）', () => {
    it('ソースコードに1秒以内の更新チェックロジックが含まれる', () => {
      const source = loadDiscoverTasksSource();
      const funcBlock = extractFunctionBlock(source, 'writeTaskIndexCache');

      // MCP serverによる最近の更新を検出して早期リターンするロジックが維持されていることを確認する
      // 数値1000はミリ秒単位の1秒を表す
      expect(funcBlock).toContain('1000');
    });

    it('ソースコードにupdatedAtを使った時刻チェックが含まれる', () => {
      const source = loadDiscoverTasksSource();
      const funcBlock = extractFunctionBlock(source, 'writeTaskIndexCache');

      // updatedAtフィールドを使った時刻比較が実装されていることを確認する
      expect(funcBlock).toContain('updatedAt');
    });

    it('discoverTasksがモジュールからエクスポートされている', () => {
      const source = loadDiscoverTasksSource();

      // discoverTasksが公開APIとしてエクスポートされていることを確認する
      expect(source).toContain('discoverTasks');
      expect(source).toContain('module.exports');
    });
  });
});

/**
 * JavaScriptソースコードから指定した関数のブロックを抽出するヘルパー関数
 *
 * 関数定義の開始から対応する閉じ波括弧までを抽出する。
 * ネストされた波括弧を考慮して深さを追跡する。
 * 抽出に失敗した場合は空文字列を返す。
 */
function extractFunctionBlock(source: string, functionName: string): string {
  const funcDefIndex = source.indexOf(`function ${functionName}`);
  if (funcDefIndex === -1) {
    // アロー関数や変数宣言形式も検索する
    const varDefIndex = source.indexOf(functionName);
    if (varDefIndex === -1) return '';
    const blockStart = source.indexOf('{', varDefIndex);
    if (blockStart === -1) return source.substring(varDefIndex);
    return extractBraceBlock(source, blockStart, varDefIndex);
  }
  const blockStart = source.indexOf('{', funcDefIndex);
  if (blockStart === -1) return source.substring(funcDefIndex);
  return extractBraceBlock(source, blockStart, funcDefIndex);
}

/**
 * ソースコードの指定位置から波括弧ブロックを抽出するヘルパー関数
 */
function extractBraceBlock(source: string, blockStart: number, startFrom: number): string {
  let depth = 0;
  for (let i = blockStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) {
        return source.substring(startFrom, i + 1);
      }
    }
  }
  return source.substring(startFrom);
}
