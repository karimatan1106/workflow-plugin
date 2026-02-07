/**
 * REQ-1: FAIL_OPEN環境変数除去テスト
 * @spec docs/workflows/ワークフロープラグイン大規模対応根本改修/test-design.md
 */
import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const HOOKS_DIR = path.resolve(__dirname, '../../../../hooks');

describe('REQ-1: FAIL_OPEN環境変数の完全除去', () => {
  const hookFiles = [
    'enforce-workflow.js',
    'phase-edit-guard.js',
    'block-dangerous-commands.js',
  ];

  for (const file of hookFiles) {
    test(`TC-1-${hookFiles.indexOf(file) + 1}: ${file}にFAIL_OPENが存在しない`, () => {
      const filePath = path.join(HOOKS_DIR, file);
      const content = fs.readFileSync(filePath, 'utf-8');

      // FAIL_OPEN環境変数の参照がないことを確認
      expect(content).not.toContain('FAIL_OPEN');
      expect(content).not.toContain('process.env.FAIL_OPEN');
    });
  }

  test('TC-1-4: 全hookファイルのエラーハンドラがexit(2)のみを使用', () => {
    for (const file of hookFiles) {
      const filePath = path.join(HOOKS_DIR, file);
      const content = fs.readFileSync(filePath, 'utf-8');

      // process.exit(0)がエラーハンドラ内に存在しないことを確認
      // ただし正常終了のexit(0)は許可
      const errorHandlerPattern = /catch\s*\([^)]*\)\s*\{[^}]*process\.exit\(0\)/gs;
      expect(content.match(errorHandlerPattern)).toBeNull();
    }
  });

  test('TC-1-5: エラーハンドラにはprocess.exit(2)が存在する', () => {
    for (const file of hookFiles) {
      const filePath = path.join(HOOKS_DIR, file);
      const content = fs.readFileSync(filePath, 'utf-8');

      // process.exit(2)が存在することを確認
      expect(content).toContain('process.exit(2)');
    }
  });

  test('TC-1-6: enforce-workflow.jsに"fail open"コメントが存在しない', () => {
    const filePath = path.join(HOOKS_DIR, 'enforce-workflow.js');
    const content = fs.readFileSync(filePath, 'utf-8');

    // "fail open"関連のコメントがないことを確認
    expect(content.toLowerCase()).not.toContain('fail open');
    expect(content.toLowerCase()).not.toContain('failopen');
  });

  test('TC-1-7: phase-edit-guard.jsにFAIL_OPEN関連コードが存在しない', () => {
    const filePath = path.join(HOOKS_DIR, 'phase-edit-guard.js');
    const content = fs.readFileSync(filePath, 'utf-8');

    // FAIL_OPEN環境変数チェックが削除されていることを確認
    expect(content).not.toMatch(/if\s*\(\s*process\.env\.FAIL_OPEN/);
    expect(content).not.toMatch(/process\.env\.FAIL_OPEN\s*===?\s*['"]true['"]/);
  });

  test('TC-1-8: block-dangerous-commands.jsにFAIL_OPEN関連コードが存在しない', () => {
    const filePath = path.join(HOOKS_DIR, 'block-dangerous-commands.js');
    const content = fs.readFileSync(filePath, 'utf-8');

    // FAIL_OPEN環境変数チェックが削除されていることを確認
    expect(content).not.toMatch(/if\s*\(\s*process\.env\.FAIL_OPEN/);
    expect(content).not.toMatch(/process\.env\.FAIL_OPEN\s*===?\s*['"]true['"]/);
  });

  test('TC-1-9: 全hookファイルに適切なエラーハンドリングが存在', () => {
    for (const file of hookFiles) {
      const filePath = path.join(HOOKS_DIR, file);
      const content = fs.readFileSync(filePath, 'utf-8');

      // try-catchブロックが存在することを確認
      expect(content).toMatch(/try\s*\{/);
      expect(content).toMatch(/catch\s*\(/);

      // エラーメッセージが出力されることを確認
      // console.error直接 または logError ヘルパー関数経由のいずれかを許可
      const hasCatchWithErrorOutput = /catch\s*\([^)]*\)\s*\{[\s\S]*?(?:console\.error|logError)\s*\(/m.test(content);
      expect(hasCatchWithErrorOutput).toBe(true);
    }
  });
});
