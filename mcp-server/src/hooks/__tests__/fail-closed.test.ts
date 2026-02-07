/**
 * REQ-3: Fail Closed化テスト
 *
 * 3つの重要フックのFail Closed動作をテストする。
 * エラー時にexit 2（ブロック）を返し、FAIL_OPEN=trueで回避可能であることを検証。
 *
 * @spec docs/workflows/ワ-クフロ-大規模対応根本改修/test-design.md
 */

import { describe, test, expect } from 'vitest';
import { spawnSync } from 'child_process';
import path from 'path';

/**
 * フックスクリプトをsubprocessで実行
 *
 * hooks/package.json に {"type": "commonjs"} を設定済みのため、
 * 直接 node でフックを実行可能。
 * spawnSyncを使用してstdout/stderrを両方キャプチャする。
 *
 * @param hookFile フックファイル名
 * @param input stdin入力文字列
 * @param env 環境変数
 * @returns { exitCode, stdout, stderr }
 */
function runHook(
  hookFile: string,
  input: string,
  env: Record<string, string> = {},
): { exitCode: number; stdout: string; stderr: string } {
  const hooksDir = path.resolve(__dirname, '../../../../hooks');
  const hookPath = path.join(hooksDir, hookFile);

  const result = spawnSync('node', [hookPath], {
    input,
    env: { ...process.env, ...env, STATE_DIR: '/tmp/nonexistent-state' },
    cwd: hooksDir,
    timeout: 5000,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

describe('REQ-3: Fail Closed - phase-edit-guard.js', () => {
  // TC-3.1: 不正入力でエラー→exit 2
  test('TC-3.1: 不正入力でエラー→exit 2（Fail Closed）', () => {
    // 不正なJSON文字列（パースは成功するがmain()内部でエラーを起こす入力）
    // phase-edit-guard.jsのcatchブロックがFail Closedに変更されたことを検証
    const result = runHook('phase-edit-guard.js', 'THIS IS NOT JSON AT ALL');

    // Fail Closed化後: exit 2を期待
    expect(result.exitCode).toBe(2);
  });

  // TC-3.1b: SKIP_PHASE_GUARD=trueで正常→exit 0
  test('TC-3.1b: SKIP_PHASE_GUARD=trueで正常→exit 0', () => {
    const result = runHook(
      'phase-edit-guard.js',
      JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: '/tmp/test.md' } }),
      { SKIP_PHASE_GUARD: 'true' },
    );

    expect(result.exitCode).toBe(0);
  });

  // TC-3.4: FAIL_OPEN=trueでエラー→exit 0
  test('TC-3.4: FAIL_OPEN=true設定時→exit 0（警告付き許可）', () => {
    const result = runHook('phase-edit-guard.js', 'INVALID JSON', {
      FAIL_OPEN: 'true',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('FAIL_OPEN');
  });
});

describe('REQ-3: Fail Closed - enforce-workflow.js', () => {
  // TC-3.2: 不正JSON入力→exit 2
  test('TC-3.2: 不正JSON入力→exit 2（Fail Closed）', () => {
    const result = runHook('enforce-workflow.js', 'INVALID JSON');

    expect(result.exitCode).toBe(2);
  });

  // TC-3.2b: FAIL_OPEN=trueでエラー→exit 0
  test('TC-3.2b: FAIL_OPEN=true→exit 0', () => {
    const result = runHook('enforce-workflow.js', 'INVALID JSON', {
      FAIL_OPEN: 'true',
    });

    expect(result.exitCode).toBe(0);
  });
});

describe('REQ-3: Fail Closed - block-dangerous-commands.js', () => {
  // TC-3.3: 不正JSON入力→exit 2
  test('TC-3.3: 不正JSON入力→exit 2（Fail Closed）', () => {
    const result = runHook('block-dangerous-commands.js', 'INVALID JSON');

    expect(result.exitCode).toBe(2);
  });

  // TC-3.3b: FAIL_OPEN=trueでエラー→exit 0
  test('TC-3.3b: FAIL_OPEN=true→exit 0', () => {
    const result = runHook('block-dangerous-commands.js', 'INVALID JSON', {
      FAIL_OPEN: 'true',
    });

    expect(result.exitCode).toBe(0);
  });
});
