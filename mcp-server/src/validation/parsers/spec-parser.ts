/**
 * Spec.md パーサー
 * @spec docs/spec/features/spec-parser.md
 */

import type { SpecItems } from '../types.js';

/**
 * spec.md からクラス・メソッド・ファイルパスを抽出
 *
 * マークダウンテキストから以下を抽出する：
 * - クラス定義（`class ClassName {` パターン）
 * - メソッド定義（`methodName()` パターン）
 * - ファイルパス（`` `src/...` `` パターン）
 *
 * @param markdown spec.md の内容
 * @returns 抽出された項目
 */
export function parseSpec(markdown: string): SpecItems {
  const result: SpecItems = {
    classes: [],
    methods: [],
    filePaths: [],
  };

  if (!markdown) {
    return result;
  }

  // クラス抽出: class ClassName または class ClassName {
  const classMatches = markdown.matchAll(/class\s+(\w+)\s*[:{]/g);
  for (const match of classMatches) {
    if (!result.classes.includes(match[1])) {
      result.classes.push(match[1]);
    }
  }

  // メソッド抽出: methodName(): または methodName( または def methodName(
  const methodMatches = markdown.matchAll(/(?:def\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*[{=]/g);
  for (const match of methodMatches) {
    const methodName = match[1];
    // constructorや予約語を除外
    if (
      methodName !== 'constructor' &&
      methodName !== 'if' &&
      methodName !== 'for' &&
      methodName !== 'while' &&
      methodName !== 'switch' &&
      !result.methods.includes(methodName)
    ) {
      result.methods.push(methodName);
    }
  }

  // ファイルパス抽出: src/... パターン
  const fileMatches = markdown.matchAll(/`(src\/[^\s`]+)`/g);
  for (const match of fileMatches) {
    if (!result.filePaths.includes(match[1])) {
      result.filePaths.push(match[1]);
    }
  }

  // **ファイル**: `path` パターン
  const fileMatches2 = markdown.matchAll(/\*\*ファイル\*\*:\s*`([^`]+)`/g);
  for (const match of fileMatches2) {
    if (!result.filePaths.includes(match[1])) {
      result.filePaths.push(match[1]);
    }
  }

  return result;
}
