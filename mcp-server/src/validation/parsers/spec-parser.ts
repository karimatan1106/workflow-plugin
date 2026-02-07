/**
 * Spec.md パーサー
 * @spec docs/spec/features/spec-parser.md
 */

import type { SpecItems } from '../types.js';

/**
 * Markdownコードブロックを除去
 *
 * ```で囲まれた部分を除去してから抽出を行う。
 * これにより、コードブロック内のサンプルコードが誤抽出されるのを防ぐ。
 *
 * @param markdown Markdown文字列
 * @returns コードブロックを除去したMarkdown文字列
 */
function removeCodeBlocks(markdown: string): string {
  // ```...``` のブロックを全て除去
  return markdown.replace(/```[\s\S]*?```/g, '');
}

/**
 * spec.md からクラス・メソッド・ファイルパスを抽出
 *
 * マークダウンテキストから以下を抽出する：
 * - クラス定義（`class ClassName {` パターン）
 * - interface定義（REQ-7）
 * - type定義（REQ-7）
 * - enum定義（REQ-7）
 * - メソッド定義（`methodName()` パターン）
 * - Reactコンポーネント（REQ-7）
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

  // ★★★ REQ-7: コードブロック除去 ★★★
  const cleanedMarkdown = removeCodeBlocks(markdown);

  // クラス抽出: class ClassName または class ClassName {
  const classMatches = cleanedMarkdown.matchAll(/class\s+(\w+)\s*[:{]/g);
  for (const match of classMatches) {
    if (!result.classes.includes(match[1])) {
      result.classes.push(match[1]);
    }
  }

  // ★★★ REQ-7: interface抽出 ★★★
  const interfaceMatches = cleanedMarkdown.matchAll(/interface\s+(\w+)/g);
  for (const match of interfaceMatches) {
    if (!result.classes.includes(match[1])) {
      result.classes.push(match[1]);
    }
  }

  // ★★★ REQ-7: type抽出 ★★★
  const typeMatches = cleanedMarkdown.matchAll(/type\s+(\w+)\s*=/g);
  for (const match of typeMatches) {
    if (!result.classes.includes(match[1])) {
      result.classes.push(match[1]);
    }
  }

  // ★★★ REQ-7: enum抽出 ★★★
  const enumMatches = cleanedMarkdown.matchAll(/enum\s+(\w+)/g);
  for (const match of enumMatches) {
    if (!result.classes.includes(match[1])) {
      result.classes.push(match[1]);
    }
  }

  // メソッド抽出: methodName(): または methodName( または def methodName(
  const methodMatches = cleanedMarkdown.matchAll(/(?:def\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*[{=]/g);
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

  // ★★★ REQ-7: React関数コンポーネント抽出 ★★★
  // export function ComponentName() または function ComponentName()
  // （先頭が大文字のものをReactコンポーネントとみなす）
  const reactComponentMatches = cleanedMarkdown.matchAll(/(?:export\s+)?function\s+([A-Z]\w+)/g);
  for (const match of reactComponentMatches) {
    if (!result.methods.includes(match[1])) {
      result.methods.push(match[1]);
    }
  }

  // ファイルパス抽出: src/... パターン（コードブロック除去済みテキストから抽出）
  const fileMatches = cleanedMarkdown.matchAll(/`(src\/[^\s`]+)`/g);
  for (const match of fileMatches) {
    if (!result.filePaths.includes(match[1])) {
      result.filePaths.push(match[1]);
    }
  }

  // **ファイル**: `path` パターン（コードブロック除去済みテキストから抽出）
  const fileMatches2 = cleanedMarkdown.matchAll(/\*\*ファイル\*\*:\s*`([^`]+)`/g);
  for (const match of fileMatches2) {
    if (!result.filePaths.includes(match[1])) {
      result.filePaths.push(match[1]);
    }
  }

  return result;
}
