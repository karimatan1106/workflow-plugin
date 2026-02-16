/**
 * CLAUDE.md フェーズ別パーサー
 *
 * CLAUDE.mdファイルをフェーズ別セクションに分割し、
 * 必要な部分のみを抽出する。パース結果はメモリキャッシュされる。
 *
 * @spec docs/spec/features/claude-md-parser.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { getSectionPatternsForPhase } from './claude-md-sections.js';

/** パース結果型 */
export interface ParseResult {
  /** 抽出されたMarkdownテキスト */
  content?: string;
  /** 含まれるセクション見出し名のリスト */
  sections: string[];
  /** パースエラーメッセージのリスト */
  errors: string[];
}

/** セクション構造 */
interface MarkdownSection {
  /** 見出しテキスト（#を除く） */
  heading: string;
  /** 見出しレベル（#の数） */
  level: number;
  /** セクション本文（見出し行含む） */
  content: string;
}

/** モジュールレベルキャッシュ: キーは `${claudeMdPath}::${phaseName}` */
const parseCache = new Map<string, ParseResult>();

/**
 * CLAUDE.mdをMarkdownセクションに分割する
 *
 * @param text CLAUDE.md全文
 * @returns セクション配列
 */
function splitIntoSections(text: string): MarkdownSection[] {
  const lines = text.split('\n');
  const sections: MarkdownSection[] = [];
  let currentHeading = '';
  let currentLevel = 0;
  let currentLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      // セクション区切り検出時に前のセクションを保存
      if (currentHeading || currentLines.length > 0) {
        sections.push({
          heading: currentHeading,
          level: currentLevel,
          content: currentLines.join('\n'),
        });
      }
      // 新しいセクションの開始
      currentHeading = headingMatch[2].trim();
      currentLevel = headingMatch[1].length;
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }

  // Save last section
  if (currentHeading || currentLines.length > 0) {
    sections.push({
      heading: currentHeading,
      level: currentLevel,
      content: currentLines.join('\n'),
    });
  }

  return sections;
}

/**
 * セクションがパターンに一致するかチェック
 *
 * @param heading セクション見出し
 * @param patterns パターン配列
 * @returns 一致した場合true
 */
function matchesPattern(heading: string, patterns: string[]): boolean {
  const lowerHeading = heading.toLowerCase();
  return patterns.some(pattern => lowerHeading.includes(pattern.toLowerCase()));
}

/**
 * CLAUDE.mdからフェーズに必要なセクションを抽出する
 *
 * @param claudeMdPath CLAUDE.mdファイルパス
 * @param phaseName フェーズ名
 * @returns パース結果
 */
export function parseCLAUDEMdByPhase(claudeMdPath: string, phaseName: string): ParseResult {
  // Check cache
  const cacheKey = `${claudeMdPath}::${phaseName}`;
  const cached = parseCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const errors: string[] = [];
  const matchedSections: string[] = [];
  const contentParts: string[] = [];

  // Read file
  if (!fs.existsSync(claudeMdPath)) {
    const result: ParseResult = {
      content: undefined,
      sections: [],
      errors: [`CLAUDE.mdファイルが見つかりません: ${claudeMdPath}`],
    };
    parseCache.set(cacheKey, result);
    return result;
  }

  let text: string;
  try {
    text = fs.readFileSync(claudeMdPath, 'utf-8');
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    const result: ParseResult = {
      content: undefined,
      sections: [],
      errors: [`CLAUDE.mdの読み込みに失敗しました: ${errorMessage}`],
    };
    parseCache.set(cacheKey, result);
    return result;
  }

  // Get section patterns for phase
  const patterns = getSectionPatternsForPhase(phaseName);
  if (patterns.length === 0) {
    const result: ParseResult = {
      content: undefined,
      sections: [],
      errors: [`フェーズ ${phaseName} のセクションパターンが定義されていません`],
    };
    parseCache.set(cacheKey, result);
    return result;
  }

  // Parse into sections
  const sections = splitIntoSections(text);

  // Match sections against patterns
  for (const section of sections) {
    if (section.heading && matchesPattern(section.heading, patterns)) {
      matchedSections.push(section.heading);
      contentParts.push(section.content);
    }
  }

  if (matchedSections.length === 0) {
    errors.push(`フェーズ ${phaseName} に該当するセクションが見つかりませんでした（パターン: ${patterns.join(', ')}）`);
  }

  const content = contentParts.length > 0 ? contentParts.join('\n\n') : undefined;

  const result: ParseResult = {
    content,
    sections: matchedSections,
    errors,
  };

  parseCache.set(cacheKey, result);
  return result;
}

/**
 * パースキャッシュをクリアする（テスト用）
 */
export function clearParseCache(): void {
  parseCache.clear();
}
