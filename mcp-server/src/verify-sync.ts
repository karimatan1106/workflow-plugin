/**
 * 3ファイル間の同期検証スクリプト
 *
 * definitions.ts（ソースオブトゥルース）、ルートCLAUDE.md、
 * workflow-plugin/CLAUDE.md の3ファイル間で
 * フェーズ設定（subagentType、model、allowedBashCategories）の
 * 整合性を自動検証する。
 *
 * 検証項目:
 * - フェーズの存在確認（3つのソースが全て同じフェーズセットを持つ）
 * - subagentType の一致（大文字小文字は区別しない）
 * - model の一致（大文字小文字は区別しない）
 * - allowedBashCategories の一致（順序は無視）
 *
 * @spec docs/spec/features/verify-sync.md
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// ============================================================================
// 型定義
// ============================================================================

/**
 * definitions.ts から抽出した1フェーズ分のデータ
 */
export interface PhaseEntry {
  phaseName: string;
  subagentType: string;
  model: string;
  allowedBashCategories: string[];
}

/**
 * CLAUDE.md のsubagentテーブルから解析した1行分のデータ
 */
export interface TableEntry {
  phaseName: string;
  subagentType: string;
  model: string;
}

// ============================================================================
// ヘルパー: PhaseEntry生成関数
// ============================================================================

/**
 * オブジェクトからPhaseEntryを生成するヘルパー関数
 * @param obj 変換対象のオブジェクト
 * @returns PhaseEntry
 */
function createPhaseEntry(obj: Record<string, unknown>): PhaseEntry {
  return {
    phaseName: typeof obj.phaseName === 'string' ? obj.phaseName : '',
    subagentType: typeof obj.subagentType === 'string' ? obj.subagentType : '',
    model: typeof obj.model === 'string' ? obj.model : '',
    allowedBashCategories: Array.isArray(obj.allowedBashCategories)
      ? (obj.allowedBashCategories as string[])
      : [],
  };
}

// ============================================================================
// 関数: extractFromDefinitions
// ============================================================================

/**
 * PHASE_GUIDESオブジェクトからフラット配列を生成する。
 *
 * 並列フェーズ（subPhasesを持つエントリ）はサブフェーズのみを展開し、
 * 並列フェーズ本体自体は配列に含めない。
 *
 * @param phaseGuides PHASE_GUIDESオブジェクト（Record<string, unknown>）
 * @returns 全フェーズのPhaseEntryフラット配列
 */
export function extractFromDefinitions(phaseGuides: Record<string, unknown>): PhaseEntry[] {
  const result: PhaseEntry[] = [];

  for (const [, value] of Object.entries(phaseGuides)) {
    if (!value || typeof value !== 'object') continue;
    const guide = value as Record<string, unknown>;

    // subPhasesがある場合は並列フェーズ: 本体をスキップしてサブフェーズを展開
    if (guide.subPhases && typeof guide.subPhases === 'object') {
      const subPhases = guide.subPhases as Record<string, unknown>;
      for (const [, subValue] of Object.entries(subPhases)) {
        if (!subValue || typeof subValue !== 'object') continue;
        const sub = subValue as Record<string, unknown>;
        result.push(createPhaseEntry(sub));
      }
    } else {
      // 通常フェーズ: そのままエントリを追加
      result.push(createPhaseEntry(guide));
    }
  }

  return result;
}

// ============================================================================
// ヘルパー: Markdownテーブル解析
// ============================================================================

/**
 * Markdown文字列からセクション（見出しから次の見出しまで）の行配列を取得する。
 *
 * @param content Markdown全文
 * @param sectionHeader セクション識別用の見出し文字列（例: '## フェーズ別subagent設定'）
 * @returns セクション内の行配列（見出し行・次の見出し行を含まない）
 */
function extractSectionLines(content: string, sectionHeader: string): string[] {
  const lines = content.split('\n');
  let inSection = false;
  const sectionLines: string[] = [];

  for (const line of lines) {
    if (line.trim() === sectionHeader.trim()) {
      inSection = true;
      continue;
    }
    if (inSection) {
      // 次の ## 見出しが出現したらセクション終了
      if (/^##\s/.test(line)) {
        break;
      }
      sectionLines.push(line);
    }
  }

  return sectionLines;
}

/**
 * セクション行配列からMarkdownテーブルのデータ行を解析してMapを返す。
 *
 * ヘッダー行・セパレータ行をスキップし、各データ行の列0をキー、
 * 列1・列2などを値として抽出する。
 *
 * @param sectionLines セクション内の行配列
 * @returns Map<フェーズ名, TableEntry>
 */
function parseSubagentTableRows(sectionLines: string[]): Map<string, TableEntry> {
  const result = new Map<string, TableEntry>();
  let headerSkipped = false;
  let separatorSkipped = false;

  for (const line of sectionLines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;

    // ヘッダー行（最初の|行）をスキップ
    if (!headerSkipped) {
      headerSkipped = true;
      continue;
    }

    // セパレータ行（|---|形式）をスキップ
    if (!separatorSkipped) {
      if (/^\|[\s:-]+\|/.test(trimmed)) {
        separatorSkipped = true;
        continue;
      }
    }

    // データ行を解析: split('|')の先頭・末尾は空文字になるので、インデックス1以降が実データ列
    const cells = trimmed.split('|').map((c) => c.trim());
    const phaseName = cells[1] ?? '';
    // 列1(cells[2])がsubagentType、列2(cells[3])がmodel（5列・6列どちらも同じ）
    const subagentType = cells[2] ?? '';
    const model = cells[3] ?? '';

    if (phaseName) {
      result.set(phaseName, { phaseName, subagentType, model });
    }
  }

  return result;
}

// ============================================================================
// 関数: parseRootCLAUDEMdSubagentTable
// ============================================================================

/**
 * ルートCLAUDE.mdの「フェーズ別subagent設定」セクションから
 * 5列テーブルを解析してMapを返す。
 *
 * テーブル構造: | フェーズ | subagent_type | model | 入力ファイル | 出力ファイル |
 *
 * @param content CLAUDE.md全文
 * @returns Map<フェーズ名, TableEntry>
 */
export function parseRootCLAUDEMdSubagentTable(content: string): Map<string, TableEntry> {
  const sectionLines = extractSectionLines(content, '## フェーズ別subagent設定');
  return parseSubagentTableRows(sectionLines);
}

// ============================================================================
// 関数: parseRootCLAUDEMdBashTable
// ============================================================================

/**
 * ルートCLAUDE.mdの「フェーズ別Bashコマンド許可カテゴリ」セクションから
 * 3列テーブルを解析してMapを返す。
 *
 * テーブル構造: | フェーズ | 許可カテゴリ | 用途 |
 * - 1セルに複数フェーズがカンマ区切りで記載される場合、全フェーズに同じカテゴリを適用
 * - カテゴリ値はカンマ区切りで複数記載される場合、文字列配列として扱う
 * - 「なし」または空文字の場合は空配列
 *
 * @param content CLAUDE.md全文
 * @returns Map<フェーズ名, string[]>（許可カテゴリ配列）
 */
export function parseRootCLAUDEMdBashTable(content: string): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const sectionLines = extractSectionLines(content, '## フェーズ別Bashコマンド許可カテゴリ');

  let headerSkipped = false;
  let separatorSkipped = false;

  for (const line of sectionLines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;

    // ヘッダー行をスキップ
    if (!headerSkipped) {
      headerSkipped = true;
      continue;
    }

    // セパレータ行をスキップ
    if (!separatorSkipped) {
      if (/^\|[\s:-]+\|/.test(trimmed)) {
        separatorSkipped = true;
        continue;
      }
    }

    // データ行を解析
    const cells = trimmed.split('|').map((c) => c.trim());
    // cells[0]は空文字、cells[1]がフェーズ列、cells[2]がカテゴリ列
    const phaseCell = cells[1] ?? '';
    const categoryCell = cells[2] ?? '';

    if (!phaseCell) continue;

    // カテゴリ値の解析
    let categories: string[];
    if (!categoryCell || categoryCell === 'なし') {
      categories = [];
    } else {
      categories = categoryCell.split(',').map((c) => c.trim()).filter(Boolean);
    }

    // フェーズセルにカンマ区切りで複数フェーズが記載されている場合、各フェーズに展開
    const phases = phaseCell.split(',').map((p) => p.trim()).filter(Boolean);
    for (const phase of phases) {
      result.set(phase, categories);
    }
  }

  return result;
}

// ============================================================================
// 関数: parsePluginCLAUDEMdSubagentTable
// ============================================================================

/**
 * workflow-plugin/CLAUDE.mdの「フェーズ別subagent設定」セクションから
 * 6列テーブルを解析してMapを返す。
 *
 * テーブル構造: | フェーズ | subagent_type | model | 入力ファイル | 入力ファイル重要度 | 出力ファイル |
 * subagentTypeは列1、modelは列2（ルートCLAUDE.md版と同一インデックス）
 *
 * @param content workflow-plugin/CLAUDE.md全文
 * @returns Map<フェーズ名, TableEntry>
 */
export function parsePluginCLAUDEMdSubagentTable(content: string): Map<string, TableEntry> {
  const sectionLines = extractSectionLines(content, '## フェーズ別subagent設定');
  // 6列でも列1がsubagentType、列2がmodelで同一インデックスのため同じパーサーを使用
  return parseSubagentTableRows(sectionLines);
}

// ============================================================================
// 関数: compareAndReport
// ============================================================================

/**
 * definitions.tsの展開結果と3つのMapを突き合わせて差分検出を行い、
 * 標準出力に検証結果を報告する。
 *
 * 比較項目:
 * - subagentType: definitions.ts vs rootSubagentMap, pluginSubagentMap
 * - model: definitions.ts vs rootSubagentMap, pluginSubagentMap
 * - allowedBashCategories: definitions.ts vs rootBashMap（順序無視の集合比較）
 *
 * @param definitions extractFromDefinitionsの返却値
 * @param rootSubagentMap ルートCLAUDE.mdのsubagentテーブル解析結果
 * @param rootBashMap ルートCLAUDE.mdのBashカテゴリテーブル解析結果
 * @param pluginSubagentMap workflow-plugin/CLAUDE.mdのsubagentテーブル解析結果
 * @returns プロセス終了コード（0: 全一致、1: 差分あり）
 */
export function compareAndReport(
  definitions: PhaseEntry[],
  rootSubagentMap: Map<string, TableEntry>,
  rootBashMap: Map<string, string[]>,
  pluginSubagentMap: Map<string, TableEntry>
): number {
  let mismatchCount = 0;

  for (const entry of definitions) {
    const { phaseName, subagentType, model, allowedBashCategories } = entry;
    const mismatches: string[] = [];

    // rootSubagentMapの存在確認と比較
    const rootSubagent = rootSubagentMap.get(phaseName);
    if (!rootSubagent) {
      mismatches.push(`root-CLAUDE.md に ${phaseName} フェーズが存在しない（欠落）`);
    } else {
      // subagentType比較（大文字小文字区別なし、トリム後）
      if (subagentType.toLowerCase().trim() !== rootSubagent.subagentType.toLowerCase().trim()) {
        mismatches.push(
          `subagentType: definitions.ts=${subagentType}, root-CLAUDE.md=${rootSubagent.subagentType}`
        );
      }
      // model比較
      if (model.toLowerCase().trim() !== rootSubagent.model.toLowerCase().trim()) {
        mismatches.push(
          `model: definitions.ts=${model}, root-CLAUDE.md=${rootSubagent.model}`
        );
      }
    }

    // pluginSubagentMapの存在確認と比較
    const pluginSubagent = pluginSubagentMap.get(phaseName);
    if (!pluginSubagent) {
      mismatches.push(`plugin-CLAUDE.md に ${phaseName} フェーズが存在しない（欠落）`);
    } else {
      // subagentType比較
      if (subagentType.toLowerCase().trim() !== pluginSubagent.subagentType.toLowerCase().trim()) {
        mismatches.push(
          `subagentType: definitions.ts=${subagentType}, plugin-CLAUDE.md=${pluginSubagent.subagentType}`
        );
      }
      // model比較
      if (model.toLowerCase().trim() !== pluginSubagent.model.toLowerCase().trim()) {
        mismatches.push(
          `model: definitions.ts=${model}, plugin-CLAUDE.md=${pluginSubagent.model}`
        );
      }
    }

    // allowedBashCategoriesとrootBashMapの比較（順序無視の集合比較）
    const rootBashCategories = rootBashMap.get(phaseName);
    if (rootBashCategories !== undefined) {
      const defSet = new Set(allowedBashCategories);
      const rootSet = new Set(rootBashCategories);
      const isSame =
        defSet.size === rootSet.size &&
        [...defSet].every((c) => rootSet.has(c));
      if (!isSame) {
        const defStr = `{${[...defSet].sort().join(',')}}`;
        const rootStr = `{${[...rootSet].sort().join(',')}}`;
        mismatches.push(
          `allowedBashCategories: definitions.ts=${defStr}, root-CLAUDE.md=${rootStr}`
        );
      }
    }

    // 結果出力
    if (mismatches.length === 0) {
      console.log(`✓ ${phaseName} - 全フィールド一致`);
    } else {
      mismatches.forEach((msg, index) => {
        const prefix = index === 0 ? '✗' : ' ';
        console.log(`${prefix} ${phaseName} - ${msg}`);
      });
      mismatchCount++;
    }
  }

  // サマリー行出力
  const totalPhases = definitions.length;
  const passedPhases = totalPhases - mismatchCount;
  console.log('');
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`検証結果: ${passedPhases}/${totalPhases}フェーズが一致（${mismatchCount}件の不一致を検出）`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  return mismatchCount > 0 ? 1 : 0;
}

// ============================================================================
// メイン処理
// ============================================================================

/**
 * スクリプトのエントリーポイント。
 *
 * 1. PHASE_GUIDESをESM importで読み込む
 * 2. ルートCLAUDE.mdとworkflow-plugin/CLAUDE.mdをfs.readFileSyncで読み込む
 * 3. 各パーサー関数で解析する
 * 4. compareAndReportで差分検出・報告する
 * 5. 終了コードでプロセスを終了する
 */
export async function main(): Promise<void> {
  try {
    // スクリプトのディレクトリからルートへのパスを解決
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    // workflow-plugin/mcp-server/src/ から 3階層上がプロジェクトルート
    const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');

    // PHASE_GUIDESをESM importで読み込む
    const { PHASE_GUIDES } = await import('./phases/definitions.js');

    // definitions.tsからフラット配列を生成
    const definitions = extractFromDefinitions(PHASE_GUIDES as Record<string, unknown>);

    // フェーズ数チェック（25件未満の場合はエラー）
    const EXPECTED_PHASE_COUNT = 25;
    if (definitions.length < EXPECTED_PHASE_COUNT) {
      console.error(
        `エラー: フェーズ数不足 - ` +
        `期待値 ${EXPECTED_PHASE_COUNT}件、実際値 ${definitions.length}件\n` +
        `原因: PHASE_GUIDESのsubPhases展開が正しく行われていない可能性があります\n` +
        `確認事項:\n` +
        `  1. 非並列フェーズが14件含まれているか\n` +
        `  2. 並列フェーズのsubPhaseが全て展開されているか\n` +
        `  3. 並列フェーズ本体が結果から除外されているか`
      );
      process.exit(2);
    }

    // ルートCLAUDE.mdを読み込む
    const rootCLAUDEMdPath = path.join(projectRoot, 'CLAUDE.md');
    const rootContent = fs.readFileSync(rootCLAUDEMdPath, 'utf-8');

    // workflow-plugin/CLAUDE.mdを読み込む
    const pluginCLAUDEMdPath = path.join(projectRoot, 'workflow-plugin', 'CLAUDE.md');
    const pluginContent = fs.readFileSync(pluginCLAUDEMdPath, 'utf-8');

    // 各パーサーで解析
    const rootSubagentMap = parseRootCLAUDEMdSubagentTable(rootContent);
    const rootBashMap = parseRootCLAUDEMdBashTable(rootContent);
    const pluginSubagentMap = parsePluginCLAUDEMdSubagentTable(pluginContent);

    // 比較・報告
    const exitCode = compareAndReport(definitions, rootSubagentMap, rootBashMap, pluginSubagentMap);
    process.exit(exitCode);
  } catch (error) {
    console.error('検証スクリプトの実行に失敗しました:', error);
    process.exit(2);
  }
}

// ESMでのスクリプト直接実行判定
const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] === __filename ||
  process.argv[1]?.endsWith('verify-sync.ts') ||
  process.argv[1]?.endsWith('verify-sync.js');

if (isMainModule) {
  main();
}
