/**
 * スコープ検証モジュール
 * @spec docs/workflows/ワ-クフロ-全問題完全解決/spec.md REQ-5
 */

import * as fs from 'fs';

/**
 * スコープ深度検証結果
 */
export interface ScopeDepthResult {
  valid: boolean;
  errors: string[];
}

/**
 * スコープファイル存在検証結果
 */
export interface ScopeFileResult {
  valid: boolean;
  errors: string[];
}

/**
 * ディレクトリ深度を計算する関数
 *
 * REQ-5: src/ 配下のディレクトリ深度を計算し、浅すぎるスコープを防ぐ
 *
 * @param dir ディレクトリパス
 * @returns 深度（src/ = 1, src/backend/ = 2, etc.）。src/以外は999（チェック対象外）
 */
export function calculateDepth(dir: string): number {
  // パスを正規化（バックスラッシュ→スラッシュ、先頭の./を除去）
  const normalized = dir.replace(/\\/g, '/').replace(/^\.\//, '');

  // src/ 配下のみチェック
  if (!normalized.startsWith('src/')) {
    return 999; // src/ 以外は深度チェック対象外
  }

  // src を含めたパス全体をスラッシュで分割
  // "src/" → ["src", ""] → 1
  // "src/backend/" → ["src", "backend", ""] → 2
  // "src/backend/domain" → ["src", "backend", "domain"] → 3
  const parts = normalized.split('/').filter((s) => s.length > 0);
  return parts.length;
}

/**
 * ディレクトリ深度の検証
 *
 * REQ-5: affectedDirs の深度が最小深度（3）以上であることを検証
 *
 * @param affectedDirs ディレクトリパスの配列
 * @returns 検証結果
 */
export function validateScopeDepth(affectedDirs: string[]): ScopeDepthResult {
  const MIN_DIRECTORY_DEPTH = 3;
  const errors: string[] = [];

  for (const dir of affectedDirs) {
    const depth = calculateDepth(dir);
    if (depth !== 999 && depth < MIN_DIRECTORY_DEPTH) {
      errors.push(
        `${dir} は深度が浅すぎます（深度${depth} < ${MIN_DIRECTORY_DEPTH}）。より具体的なディレクトリを指定してください。`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * ファイル存在確認の検証
 *
 * REQ-5: affectedFiles の全ファイルが実際に存在することを検証
 *
 * @param affectedFiles ファイルパスの配列
 * @returns 検証結果
 */
export function validateScopeFiles(affectedFiles: string[]): ScopeFileResult {
  const errors: string[] = [];

  for (const file of affectedFiles) {
    if (!fs.existsSync(file)) {
      errors.push(`${file} が存在しません`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
