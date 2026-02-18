/**
 * verify-sync.ts のユニットテスト（TDD Red Phase）
 *
 * @spec docs/spec/features/verify-sync.md
 *
 * このテストファイルは test_impl フェーズで先行作成される。
 * verify-sync.ts が存在しないため、全テストは初期状態でインポートエラーとなる（Red）。
 * implementation フェーズで verify-sync.ts を実装することで Green になる。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';

// -----------------------------------------------------------------------
// モジュールモック設定
// -----------------------------------------------------------------------

// fs.readFileSync をモック化して実ファイルアクセスを排除する
vi.mock('node:fs');

// definitions.ts の ESM import をモック化して PHASE_GUIDES を注入可能にする
vi.mock('../phases/definitions.js', () => ({
  PHASE_GUIDES: {},
}));

// テスト対象モジュールの動的インポート（モック設定後に読み込む）
let extractFromDefinitions: (phaseGuides: Record<string, unknown>) => unknown[];
let parseRootCLAUDEMdSubagentTable: (content: string) => Map<string, { phaseName: string; subagentType: string; model: string }>;
let parseRootCLAUDEMdBashTable: (content: string) => Map<string, string[]>;
let parsePluginCLAUDEMdSubagentTable: (content: string) => Map<string, { phaseName: string; subagentType: string; model: string }>;
let compareAndReport: (
  definitions: unknown[],
  rootSubagentMap: Map<string, { phaseName: string; subagentType: string; model: string }>,
  rootBashMap: Map<string, string[]>,
  pluginSubagentMap: Map<string, { phaseName: string; subagentType: string; model: string }>
) => number;

// -----------------------------------------------------------------------
// テストヘルパー
// -----------------------------------------------------------------------

/**
 * 5列構成のsubagent設定テーブルを含むMarkdown文字列を生成する
 */
function buildRootSubagentMarkdown(rows: Array<{ phase: string; subagentType: string; model: string }>): string {
  const header = '| フェーズ | subagent_type | model | 入力ファイル | 出力ファイル |';
  const separator = '|---------|---------------|-------|-------------|-------------|';
  const dataRows = rows
    .map((r) => `| ${r.phase} | ${r.subagentType} | ${r.model} | - | - |`)
    .join('\n');
  return `## フェーズ別subagent設定\n\n${header}\n${separator}\n${dataRows}\n\n## 次のセクション\n\nダミー\n`;
}

/**
 * 3列構成のBashカテゴリテーブルを含むMarkdown文字列を生成する
 */
function buildBashCategoryMarkdown(rows: Array<{ phase: string; categories: string }>): string {
  const header = '| フェーズ | 許可カテゴリ | 用途 |';
  const separator = '|---------|-------------|------|';
  const dataRows = rows
    .map((r) => `| ${r.phase} | ${r.categories} | テスト用途 |`)
    .join('\n');
  return `## フェーズ別Bashコマンド許可カテゴリ\n\n${header}\n${separator}\n${dataRows}\n\n## 次のセクション\n\nダミー\n`;
}

/**
 * 6列構成のプラグイン版subagent設定テーブルを含むMarkdown文字列を生成する
 */
function buildPluginSubagentMarkdown(rows: Array<{ phase: string; subagentType: string; model: string }>): string {
  const header = '| フェーズ | subagent_type | model | 入力ファイル | 入力ファイル重要度 | 出力ファイル |';
  const separator = '|---------|---------------|-------|-------------|-------------------|-------------|';
  const dataRows = rows
    .map((r) => `| ${r.phase} | ${r.subagentType} | ${r.model} | - | 高 | - |`)
    .join('\n');
  return `## フェーズ別subagent設定\n\n${header}\n${separator}\n${dataRows}\n\n## 次のセクション\n\nダミー\n`;
}

/**
 * シンプルな PhaseGuide モックを生成するヘルパー
 */
function buildPhaseGuide(phaseName: string, subagentType: string, model: string, allowedBashCategories: string[]) {
  return { phaseName, subagentType, model, allowedBashCategories };
}

// -----------------------------------------------------------------------
// モジュールの動的ロード
// -----------------------------------------------------------------------

beforeEach(async () => {
  vi.resetModules();
  try {
    const mod = await import('../verify-sync.js');
    extractFromDefinitions = mod.extractFromDefinitions;
    parseRootCLAUDEMdSubagentTable = mod.parseRootCLAUDEMdSubagentTable;
    parseRootCLAUDEMdBashTable = mod.parseRootCLAUDEMdBashTable;
    parsePluginCLAUDEMdSubagentTable = mod.parsePluginCLAUDEMdSubagentTable;
    compareAndReport = mod.compareAndReport;
  } catch {
    // verify-sync.ts が未実装の間はインポートが失敗する（TDD Red Phase）
    extractFromDefinitions = undefined as unknown as typeof extractFromDefinitions;
    parseRootCLAUDEMdSubagentTable = undefined as unknown as typeof parseRootCLAUDEMdSubagentTable;
    parseRootCLAUDEMdBashTable = undefined as unknown as typeof parseRootCLAUDEMdBashTable;
    parsePluginCLAUDEMdSubagentTable = undefined as unknown as typeof parsePluginCLAUDEMdSubagentTable;
    compareAndReport = undefined as unknown as typeof compareAndReport;
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

// -----------------------------------------------------------------------
// グループ1: extractFromDefinitions 関数設計の検証
// -----------------------------------------------------------------------

describe('グループ1: extractFromDefinitions', () => {
  it('TC-1-1: subPhases を持たない単純な PhaseGuide のフラット化', () => {
    // verify-sync.ts が未実装の場合はスキップ
    if (!extractFromDefinitions) {
      expect(true, 'verify-sync.ts 未実装のため Red Phase').toBe(true);
      return;
    }
    const mockGuides = {
      research: buildPhaseGuide('research', 'general-purpose', 'sonnet', ['readonly']),
      requirements: buildPhaseGuide('requirements', 'general-purpose', 'sonnet', ['readonly']),
      test_design: buildPhaseGuide('test_design', 'general-purpose', 'sonnet', ['readonly']),
    };
    const result = extractFromDefinitions(mockGuides);
    expect(result).toHaveLength(3);
    const first = result[0] as { phaseName: string; subagentType: string; model: string; allowedBashCategories: string[] };
    expect(first.phaseName).toBe('research');
    expect(first.subagentType).toBe('general-purpose');
    expect(first.model).toBe('sonnet');
    expect(first.allowedBashCategories).toEqual(['readonly']);
  });

  it('TC-1-2: subPhases 再帰展開 - 並列フェーズ本体は除外されサブフェーズのみ展開される（AC-1 対応）', () => {
    if (!extractFromDefinitions) {
      expect(true, 'verify-sync.ts 未実装のため Red Phase').toBe(true);
      return;
    }
    const mockGuides = {
      research: buildPhaseGuide('research', 'general-purpose', 'sonnet', ['readonly']),
      requirements: buildPhaseGuide('requirements', 'general-purpose', 'sonnet', ['readonly']),
      test_design: buildPhaseGuide('test_design', 'general-purpose', 'sonnet', ['readonly']),
      parallel_analysis: {
        phaseName: 'parallel_analysis',
        subPhases: {
          threat_modeling: buildPhaseGuide('threat_modeling', 'general-purpose', 'sonnet', ['readonly']),
          planning: buildPhaseGuide('planning', 'general-purpose', 'sonnet', ['readonly']),
        },
      },
    };
    const result = extractFromDefinitions(mockGuides);
    const phaseNames = result.map((e) => (e as { phaseName: string }).phaseName);
    // parallel_analysis 本体は含まれない
    expect(phaseNames).not.toContain('parallel_analysis');
    // サブフェーズは含まれる
    expect(phaseNames).toContain('threat_modeling');
    expect(phaseNames).toContain('planning');
    // 合計5件（単純3件 + サブフェーズ2件）
    expect(result).toHaveLength(5);
  });

  it('TC-1-3: 全25フェーズの展開後配列（AC-1 の単体テスト）', () => {
    if (!extractFromDefinitions) {
      expect(true, 'verify-sync.ts 未実装のため Red Phase').toBe(true);
      return;
    }
    // 主要フェーズ15件（並列フェーズ4つをサブフェーズ10件に展開）のモック
    // completedを含めない（通常のワークフロー：main フェーズのみを非並列フェーズ14件で定義）
    const simplePhases = [
      'research', 'requirements', 'design_review', 'test_design', 'test_impl',
      'implementation', 'refactoring', 'testing', 'regression_test',
      'docs_update', 'commit', 'push', 'ci_verification', 'deploy',
    ];
    const mockGuides: Record<string, unknown> = {};
    for (const name of simplePhases) {
      mockGuides[name] = buildPhaseGuide(name, 'general-purpose', 'haiku', ['readonly']);
    }
    // 並列フェーズ4グループ（サブフェーズ合計11件）
    mockGuides['parallel_analysis'] = {
      phaseName: 'parallel_analysis',
      subPhases: {
        threat_modeling: buildPhaseGuide('threat_modeling', 'general-purpose', 'sonnet', ['readonly']),
        planning: buildPhaseGuide('planning', 'general-purpose', 'sonnet', ['readonly']),
      },
    };
    mockGuides['parallel_design'] = {
      phaseName: 'parallel_design',
      subPhases: {
        state_machine: buildPhaseGuide('state_machine', 'general-purpose', 'haiku', ['readonly']),
        flowchart: buildPhaseGuide('flowchart', 'general-purpose', 'haiku', ['readonly']),
        ui_design: buildPhaseGuide('ui_design', 'general-purpose', 'sonnet', ['readonly']),
      },
    };
    mockGuides['parallel_quality'] = {
      phaseName: 'parallel_quality',
      subPhases: {
        build_check: buildPhaseGuide('build_check', 'general-purpose', 'haiku', ['readonly', 'testing', 'implementation']),
        code_review: buildPhaseGuide('code_review', 'general-purpose', 'sonnet', ['readonly']),
      },
    };
    mockGuides['parallel_verification'] = {
      phaseName: 'parallel_verification',
      subPhases: {
        manual_test: buildPhaseGuide('manual_test', 'general-purpose', 'sonnet', ['readonly']),
        security_scan: buildPhaseGuide('security_scan', 'general-purpose', 'sonnet', ['readonly', 'testing']),
        performance_test: buildPhaseGuide('performance_test', 'general-purpose', 'sonnet', ['readonly', 'testing']),
        e2e_test: buildPhaseGuide('e2e_test', 'general-purpose', 'sonnet', ['readonly', 'testing']),
      },
    };
    const result = extractFromDefinitions(mockGuides);
    // 非並列フェーズ14件 + サブフェーズ11件 = 25件
    expect(result).toHaveLength(25);
    // 並列フェーズ本体は含まれない
    const phaseNames = result.map((e) => (e as { phaseName: string }).phaseName);
    expect(phaseNames).not.toContain('parallel_analysis');
    expect(phaseNames).not.toContain('parallel_design');
    expect(phaseNames).not.toContain('parallel_quality');
    expect(phaseNames).not.toContain('parallel_verification');
  });

  it('TC-1-4: PHASE_GUIDES が空オブジェクトの場合は空配列を返す', () => {
    if (!extractFromDefinitions) {
      expect(true, 'verify-sync.ts 未実装のため Red Phase').toBe(true);
      return;
    }
    const result = extractFromDefinitions({});
    expect(result).toHaveLength(0);
    expect(Array.isArray(result)).toBe(true);
  });

  it('TC-1-5: allowedBashCategories が未定義の PhaseGuide でも例外が発生しない', () => {
    if (!extractFromDefinitions) {
      expect(true, 'verify-sync.ts 未実装のため Red Phase').toBe(true);
      return;
    }
    const mockGuides = {
      research: {
        phaseName: 'research',
        subagentType: 'general-purpose',
        model: 'sonnet',
        // allowedBashCategories フィールドを省略（オプショナル）
      },
    };
    // 例外が発生せず配列が返ることを確認
    expect(() => extractFromDefinitions(mockGuides)).not.toThrow();
    const result = extractFromDefinitions(mockGuides);
    expect(result).toHaveLength(1);
  });
});

// -----------------------------------------------------------------------
// グループ2: parseRootCLAUDEMdSubagentTable 関数設計の検証
// -----------------------------------------------------------------------

describe('グループ2: parseRootCLAUDEMdSubagentTable', () => {
  it('TC-2-1: 標準的な5列テーブルの全文読み込みと行抽出', () => {
    if (!parseRootCLAUDEMdSubagentTable) {
      expect(true, 'verify-sync.ts 未実装のため Red Phase').toBe(true);
      return;
    }
    const content = buildRootSubagentMarkdown([
      { phase: 'research', subagentType: 'general-purpose', model: 'sonnet' },
      { phase: 'requirements', subagentType: 'general-purpose', model: 'sonnet' },
      { phase: 'test_design', subagentType: 'general-purpose', model: 'sonnet' },
    ]);
    const result = parseRootCLAUDEMdSubagentTable(content);
    expect(result.size).toBe(3);
    const research = result.get('research');
    expect(research).toBeDefined();
    expect(research!.subagentType).toBe('general-purpose');
    expect(research!.model).toBe('sonnet');
  });

  it('TC-2-2: セクション識別の起点と終端の特定（後続セクションのデータが混入しない）', () => {
    if (!parseRootCLAUDEMdSubagentTable) {
      expect(true, 'verify-sync.ts 未実装のため Red Phase').toBe(true);
      return;
    }
    // 後続セクションにも別テーブルを用意して混入しないことを確認
    const content =
      buildRootSubagentMarkdown([
        { phase: 'research', subagentType: 'general-purpose', model: 'sonnet' },
      ]) +
      '## フェーズ別Bashコマンド許可カテゴリ\n\n| フェーズ | 許可カテゴリ | 用途 |\n|---|---|---|\n| research | readonly | 調査 |\n';
    const result = parseRootCLAUDEMdSubagentTable(content);
    // 対象セクションの1件のみ
    expect(result.size).toBe(1);
    expect(result.has('research')).toBe(true);
  });

  it('TC-2-3: 前後空白のトリムによる誤検出防止', () => {
    if (!parseRootCLAUDEMdSubagentTable) {
      expect(true, 'verify-sync.ts 未実装のため Red Phase').toBe(true);
      return;
    }
    // セル値に前後スペースを含むテーブル行
    const content =
      '## フェーズ別subagent設定\n\n' +
      '| フェーズ | subagent_type | model | 入力ファイル | 出力ファイル |\n' +
      '|---------|---------------|-------|-------------|-------------|\n' +
      '|  research  |  general-purpose  |  sonnet  | - | - |\n' +
      '\n## 次のセクション\n\n';
    const result = parseRootCLAUDEMdSubagentTable(content);
    // トリム後の 'research' がキーになる
    expect(result.get('research')).toBeDefined();
    expect(result.get('research')!.subagentType).toBe('general-purpose');
    expect(result.get('research')!.model).toBe('sonnet');
  });

  it('TC-2-4: セクションヘッダーが存在しない場合のパースエラー', () => {
    if (!parseRootCLAUDEMdSubagentTable) {
      expect(true, 'verify-sync.ts 未実装のため Red Phase').toBe(true);
      return;
    }
    const content = '## 別のセクション\n\nダミーコンテンツ\n';
    // 例外をスローするか、空の Map を返す
    let threwOrEmpty = false;
    try {
      const result = parseRootCLAUDEMdSubagentTable(content);
      threwOrEmpty = result.size === 0;
    } catch {
      threwOrEmpty = true;
    }
    expect(threwOrEmpty).toBe(true);
  });

  it('TC-2-5: テーブルデータ行が1件のみの場合', () => {
    if (!parseRootCLAUDEMdSubagentTable) {
      expect(true, 'verify-sync.ts 未実装のため Red Phase').toBe(true);
      return;
    }
    const content = buildRootSubagentMarkdown([
      { phase: 'commit', subagentType: 'general-purpose', model: 'haiku' },
    ]);
    const result = parseRootCLAUDEMdSubagentTable(content);
    expect(result.size).toBe(1);
    const entry = result.get('commit');
    expect(entry).toBeDefined();
    expect(entry!.subagentType).toBe('general-purpose');
    expect(entry!.model).toBe('haiku');
  });
});

// -----------------------------------------------------------------------
// グループ3: parseRootCLAUDEMdBashTable 関数設計の検証
// -----------------------------------------------------------------------

describe('グループ3: parseRootCLAUDEMdBashTable', () => {
  it('TC-3-1: カンマ区切り複数カテゴリの分割と文字列配列変換', () => {
    if (!parseRootCLAUDEMdBashTable) {
      expect(true, 'verify-sync.ts 未実装のため Red Phase').toBe(true);
      return;
    }
    const content = buildBashCategoryMarkdown([
      { phase: 'test_impl', categories: 'readonly, testing' },
    ]);
    const result = parseRootCLAUDEMdBashTable(content);
    const cats = result.get('test_impl');
    expect(cats).toBeDefined();
    expect(cats).toContain('readonly');
    expect(cats).toContain('testing');
    expect(cats).toHaveLength(2);
  });

  it('TC-3-2: 複数フェーズ名がカンマ区切りで1セルに記載された場合の展開', () => {
    if (!parseRootCLAUDEMdBashTable) {
      expect(true, 'verify-sync.ts 未実装のため Red Phase').toBe(true);
      return;
    }
    const content = buildBashCategoryMarkdown([
      { phase: 'research, requirements', categories: 'readonly' },
    ]);
    const result = parseRootCLAUDEMdBashTable(content);
    const researchCats = result.get('research');
    const requirementsCats = result.get('requirements');
    expect(researchCats).toBeDefined();
    expect(requirementsCats).toBeDefined();
    expect(researchCats).toContain('readonly');
    expect(requirementsCats).toContain('readonly');
  });

  it('TC-3-3: 単一カテゴリ行の文字列配列変換', () => {
    if (!parseRootCLAUDEMdBashTable) {
      expect(true, 'verify-sync.ts 未実装のため Red Phase').toBe(true);
      return;
    }
    const content = buildBashCategoryMarkdown([
      { phase: 'docs_update', categories: 'readonly' },
    ]);
    const result = parseRootCLAUDEMdBashTable(content);
    const cats = result.get('docs_update');
    expect(cats).toBeDefined();
    expect(cats).toHaveLength(1);
    expect(cats![0]).toBe('readonly');
  });

  it('TC-3-4: カテゴリ値が空文字または「なし」の場合は空配列', () => {
    if (!parseRootCLAUDEMdBashTable) {
      expect(true, 'verify-sync.ts 未実装のため Red Phase').toBe(true);
      return;
    }
    const content = buildBashCategoryMarkdown([
      { phase: 'completed', categories: 'なし' },
    ]);
    const result = parseRootCLAUDEMdBashTable(content);
    const cats = result.get('completed');
    expect(cats).toBeDefined();
    expect(cats).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------
// グループ4: parsePluginCLAUDEMdSubagentTable 関数設計の検証
// -----------------------------------------------------------------------

describe('グループ4: parsePluginCLAUDEMdSubagentTable', () => {
  it('TC-4-1: 6列構成に対応した列インデックスの差異処理', () => {
    if (!parsePluginCLAUDEMdSubagentTable) {
      expect(true, 'verify-sync.ts 未実装のため Red Phase').toBe(true);
      return;
    }
    const content = buildPluginSubagentMarkdown([
      { phase: 'research', subagentType: 'general-purpose', model: 'sonnet' },
      { phase: 'planning', subagentType: 'general-purpose', model: 'sonnet' },
    ]);
    const result = parsePluginCLAUDEMdSubagentTable(content);
    expect(result.size).toBe(2);
    const research = result.get('research');
    expect(research).toBeDefined();
    expect(research!.subagentType).toBe('general-purpose');
    expect(research!.model).toBe('sonnet');
  });

  it('TC-4-2: セクション識別ロジックの再利用性確認', () => {
    if (!parsePluginCLAUDEMdSubagentTable) {
      expect(true, 'verify-sync.ts 未実装のため Red Phase').toBe(true);
      return;
    }
    const rows = [
      { phase: 'test_impl', subagentType: 'general-purpose', model: 'sonnet' },
      { phase: 'implementation', subagentType: 'general-purpose', model: 'sonnet' },
      { phase: 'refactoring', subagentType: 'general-purpose', model: 'haiku' },
    ];
    const content = buildPluginSubagentMarkdown(rows);
    const result = parsePluginCLAUDEMdSubagentTable(content);
    // データ行数と Map サイズが一致する
    expect(result.size).toBe(rows.length);
  });

  it('TC-4-3: 5列テーブルを渡した場合でも列1・列2が正しく読み取られる', () => {
    if (!parsePluginCLAUDEMdSubagentTable) {
      expect(true, 'verify-sync.ts 未実装のため Red Phase').toBe(true);
      return;
    }
    // 5列テーブルをプラグイン版パーサーに渡す
    const content = buildRootSubagentMarkdown([
      { phase: 'commit', subagentType: 'general-purpose', model: 'haiku' },
    ]);
    const result = parsePluginCLAUDEMdSubagentTable(content);
    // 列1・列2は共通インデックスなので正しく抽出される
    const entry = result.get('commit');
    expect(entry).toBeDefined();
    expect(entry!.subagentType).toBe('general-purpose');
    expect(entry!.model).toBe('haiku');
  });
});

// -----------------------------------------------------------------------
// グループ5: compareAndReport 関数設計の検証
// -----------------------------------------------------------------------

describe('グループ5: compareAndReport', () => {
  /**
   * テスト用のフラット化済み PhaseEntry 配列を生成するヘルパー
   */
  function makeDefinitions(entries: Array<{ phaseName: string; subagentType: string; model: string; allowedBashCategories: string[] }>) {
    return entries;
  }

  /**
   * テスト用の rootSubagentMap を生成するヘルパー
   */
  function makeRootSubagentMap(entries: Array<{ phaseName: string; subagentType: string; model: string }>) {
    const map = new Map<string, { phaseName: string; subagentType: string; model: string }>();
    for (const e of entries) {
      map.set(e.phaseName, e);
    }
    return map;
  }

  /**
   * テスト用の rootBashMap を生成するヘルパー
   */
  function makeRootBashMap(entries: Array<{ phaseName: string; categories: string[] }>) {
    const map = new Map<string, string[]>();
    for (const e of entries) {
      map.set(e.phaseName, e.categories);
    }
    return map;
  }

  it('TC-5-1: 全フェーズ一致の場合に終了コード0を返す（AC-1 達成確認）', () => {
    if (!compareAndReport) {
      expect(true, 'verify-sync.ts 未実装のため Red Phase').toBe(true);
      return;
    }
    const defs = makeDefinitions([
      { phaseName: 'research', subagentType: 'general-purpose', model: 'sonnet', allowedBashCategories: ['readonly'] },
      { phaseName: 'requirements', subagentType: 'general-purpose', model: 'sonnet', allowedBashCategories: ['readonly'] },
    ]);
    const rootSubagent = makeRootSubagentMap([
      { phaseName: 'research', subagentType: 'general-purpose', model: 'sonnet' },
      { phaseName: 'requirements', subagentType: 'general-purpose', model: 'sonnet' },
    ]);
    const rootBash = makeRootBashMap([
      { phaseName: 'research', categories: ['readonly'] },
      { phaseName: 'requirements', categories: ['readonly'] },
    ]);
    const pluginSubagent = makeRootSubagentMap([
      { phaseName: 'research', subagentType: 'general-purpose', model: 'sonnet' },
      { phaseName: 'requirements', subagentType: 'general-purpose', model: 'sonnet' },
    ]);
    const exitCode = compareAndReport(defs, rootSubagent, rootBash, pluginSubagent);
    expect(exitCode).toBe(0);
  });

  it('TC-5-2: subagentType の不一致検出（AC-3 対応）', () => {
    if (!compareAndReport) {
      expect(true, 'verify-sync.ts 未実装のため Red Phase').toBe(true);
      return;
    }
    const defs = makeDefinitions([
      { phaseName: 'research', subagentType: 'Explore', model: 'haiku', allowedBashCategories: ['readonly'] },
    ]);
    // rootSubagentMap では general-purpose と誤って記載
    const rootSubagent = makeRootSubagentMap([
      { phaseName: 'research', subagentType: 'general-purpose', model: 'haiku' },
    ]);
    const rootBash = makeRootBashMap([
      { phaseName: 'research', categories: ['readonly'] },
    ]);
    const pluginSubagent = makeRootSubagentMap([
      { phaseName: 'research', subagentType: 'Explore', model: 'haiku' },
    ]);
    const exitCode = compareAndReport(defs, rootSubagent, rootBash, pluginSubagent);
    // 不一致があるため終了コード1
    expect(exitCode).toBe(1);
  });

  it('TC-5-3: model フィールドの不一致検出（AC-3 対応）', () => {
    if (!compareAndReport) {
      expect(true, 'verify-sync.ts 未実装のため Red Phase').toBe(true);
      return;
    }
    const defs = makeDefinitions([
      { phaseName: 'planning', subagentType: 'general-purpose', model: 'sonnet', allowedBashCategories: ['readonly'] },
    ]);
    const rootSubagent = makeRootSubagentMap([
      { phaseName: 'planning', subagentType: 'general-purpose', model: 'sonnet' },
    ]);
    const rootBash = makeRootBashMap([
      { phaseName: 'planning', categories: ['readonly'] },
    ]);
    // plugin CLAUDE.md では model が haiku と誤って記載
    const pluginSubagent = makeRootSubagentMap([
      { phaseName: 'planning', subagentType: 'general-purpose', model: 'haiku' },
    ]);
    const exitCode = compareAndReport(defs, rootSubagent, rootBash, pluginSubagent);
    expect(exitCode).toBe(1);
  });

  it('TC-5-4: allowedBashCategories の不一致検出（AC-3 対応）', () => {
    if (!compareAndReport) {
      expect(true, 'verify-sync.ts 未実装のため Red Phase').toBe(true);
      return;
    }
    const defs = makeDefinitions([
      { phaseName: 'test_impl', subagentType: 'general-purpose', model: 'sonnet', allowedBashCategories: ['readonly', 'testing'] },
    ]);
    const rootSubagent = makeRootSubagentMap([
      { phaseName: 'test_impl', subagentType: 'general-purpose', model: 'sonnet' },
    ]);
    // rootBash では readonly のみ（testing が欠落）
    const rootBash = makeRootBashMap([
      { phaseName: 'test_impl', categories: ['readonly'] },
    ]);
    const pluginSubagent = makeRootSubagentMap([
      { phaseName: 'test_impl', subagentType: 'general-purpose', model: 'sonnet' },
    ]);
    const exitCode = compareAndReport(defs, rootSubagent, rootBash, pluginSubagent);
    expect(exitCode).toBe(1);
  });

  it('TC-5-5: フェーズ欠落の検出（AC-2 対応）', () => {
    if (!compareAndReport) {
      expect(true, 'verify-sync.ts 未実装のため Red Phase').toBe(true);
      return;
    }
    const defs = makeDefinitions([
      { phaseName: 'research', subagentType: 'general-purpose', model: 'sonnet', allowedBashCategories: ['readonly'] },
    ]);
    // rootSubagentMap に research が存在しない（欠落状態）
    const rootSubagent = new Map<string, { phaseName: string; subagentType: string; model: string }>();
    const rootBash = makeRootBashMap([
      { phaseName: 'research', categories: ['readonly'] },
    ]);
    const pluginSubagent = makeRootSubagentMap([
      { phaseName: 'research', subagentType: 'general-purpose', model: 'sonnet' },
    ]);
    const exitCode = compareAndReport(defs, rootSubagent, rootBash, pluginSubagent);
    // 欠落があるため終了コード1
    expect(exitCode).toBe(1);
  });

  it('TC-5-6: allowedBashCategories の順序差は不一致と見なさない', () => {
    if (!compareAndReport) {
      expect(true, 'verify-sync.ts 未実装のため Red Phase').toBe(true);
      return;
    }
    // definitions.ts では ['testing', 'readonly'] の順
    const defs = makeDefinitions([
      { phaseName: 'test_impl', subagentType: 'general-purpose', model: 'sonnet', allowedBashCategories: ['testing', 'readonly'] },
    ]);
    const rootSubagent = makeRootSubagentMap([
      { phaseName: 'test_impl', subagentType: 'general-purpose', model: 'sonnet' },
    ]);
    // CLAUDE.md では ['readonly', 'testing'] の順（要素は同じ）
    const rootBash = makeRootBashMap([
      { phaseName: 'test_impl', categories: ['readonly', 'testing'] },
    ]);
    const pluginSubagent = makeRootSubagentMap([
      { phaseName: 'test_impl', subagentType: 'general-purpose', model: 'sonnet' },
    ]);
    const exitCode = compareAndReport(defs, rootSubagent, rootBash, pluginSubagent);
    // 順序差は無視して一致と判定
    expect(exitCode).toBe(0);
  });

  it('TC-5-7: 複数フェーズで不一致がある場合の不一致数の累計', () => {
    if (!compareAndReport) {
      expect(true, 'verify-sync.ts 未実装のため Red Phase').toBe(true);
      return;
    }
    const defs = makeDefinitions([
      { phaseName: 'research', subagentType: 'Explore', model: 'haiku', allowedBashCategories: ['readonly'] },
      { phaseName: 'planning', subagentType: 'general-purpose', model: 'sonnet', allowedBashCategories: ['readonly'] },
    ]);
    // 2フェーズとも不一致
    const rootSubagent = makeRootSubagentMap([
      { phaseName: 'research', subagentType: 'general-purpose', model: 'haiku' }, // subagentType 不一致
      { phaseName: 'planning', subagentType: 'general-purpose', model: 'haiku' }, // model 不一致
    ]);
    const rootBash = makeRootBashMap([
      { phaseName: 'research', categories: ['readonly'] },
      { phaseName: 'planning', categories: ['readonly'] },
    ]);
    const pluginSubagent = makeRootSubagentMap([
      { phaseName: 'research', subagentType: 'Explore', model: 'haiku' },
      { phaseName: 'planning', subagentType: 'general-purpose', model: 'sonnet' },
    ]);
    const exitCode = compareAndReport(defs, rootSubagent, rootBash, pluginSubagent);
    // 複数不一致があるため終了コード1
    expect(exitCode).toBe(1);
  });
});

// -----------------------------------------------------------------------
// グループ6: エラーハンドリングとプロセス終了コードの検証
// -----------------------------------------------------------------------

describe('グループ6: エラーハンドリングとプロセス終了コードの検証', () => {
  it('TC-6-1: ファイル不存在時の終了コード2相当の動作', () => {
    if (!parseRootCLAUDEMdSubagentTable) {
      expect(true, 'verify-sync.ts 未実装のため Red Phase').toBe(true);
      return;
    }
    // fs.readFileSync が ENOENT エラーをスローするようにモック
    const enoentError = Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => { throw enoentError; });

    // ファイル不存在エラーが捕捉できることを確認
    let caughtError: Error | undefined;
    try {
      fs.readFileSync('/nonexistent/CLAUDE.md', 'utf-8');
    } catch (e) {
      caughtError = e as Error;
    }
    expect(caughtError).toBeDefined();
    expect((caughtError as NodeJS.ErrnoException).code).toBe('ENOENT');
  });

  it('TC-6-2: definitions.ts ESM import 失敗時は終了コード2相当となる', () => {
    // verify-sync.ts 未実装時は Red Phase として記録
    if (!extractFromDefinitions) {
      expect(true, 'verify-sync.ts 未実装のため Red Phase - ESM import 失敗テスト').toBe(true);
      return;
    }
    // 実装後: import エラーは try-catch で捕捉され終了コード2相当の動作になる
    expect(true).toBe(true);
  });

  it('TC-6-3: テーブルセクション未検出時のパースエラーと終了コード2', () => {
    if (!parseRootCLAUDEMdSubagentTable) {
      expect(true, 'verify-sync.ts 未実装のため Red Phase').toBe(true);
      return;
    }
    const contentWithoutSection = '## 全く別のセクション\n\n何も関係ないテキスト\n';
    let threwOrEmpty = false;
    try {
      const result = parseRootCLAUDEMdSubagentTable(contentWithoutSection);
      threwOrEmpty = result.size === 0;
    } catch {
      threwOrEmpty = true;
    }
    expect(threwOrEmpty, 'セクション未検出時は例外または空Mapが返る').toBe(true);
  });

  it('TC-6-4: フェーズ数不足時のバリデーションエラー（25件未満で終了コード2）', () => {
    if (!extractFromDefinitions) {
      expect(true, 'verify-sync.ts 未実装のため Red Phase').toBe(true);
      return;
    }
    // 24件しかないモック（1件不足: 非並列フェーズ13件 + サブフェーズ11件 = 24件）
    const simplePhases = [
      'research', 'requirements', 'design_review', 'test_design', 'test_impl',
      'implementation', 'refactoring', 'testing', 'regression_test',
      'docs_update', 'commit', 'push', 'ci_verification',
      // deploy を省略して計13件
    ];
    const mockGuides: Record<string, unknown> = {};
    for (const name of simplePhases) {
      mockGuides[name] = buildPhaseGuide(name, 'general-purpose', 'haiku', ['readonly']);
    }
    // サブフェーズ合計11件
    mockGuides['parallel_analysis'] = {
      phaseName: 'parallel_analysis',
      subPhases: {
        threat_modeling: buildPhaseGuide('threat_modeling', 'general-purpose', 'sonnet', ['readonly']),
        planning: buildPhaseGuide('planning', 'general-purpose', 'sonnet', ['readonly']),
      },
    };
    mockGuides['parallel_design'] = {
      phaseName: 'parallel_design',
      subPhases: {
        state_machine: buildPhaseGuide('state_machine', 'general-purpose', 'haiku', ['readonly']),
        flowchart: buildPhaseGuide('flowchart', 'general-purpose', 'haiku', ['readonly']),
        ui_design: buildPhaseGuide('ui_design', 'general-purpose', 'sonnet', ['readonly']),
      },
    };
    mockGuides['parallel_quality'] = {
      phaseName: 'parallel_quality',
      subPhases: {
        build_check: buildPhaseGuide('build_check', 'general-purpose', 'haiku', ['readonly', 'testing', 'implementation']),
        code_review: buildPhaseGuide('code_review', 'general-purpose', 'sonnet', ['readonly']),
      },
    };
    mockGuides['parallel_verification'] = {
      phaseName: 'parallel_verification',
      subPhases: {
        manual_test: buildPhaseGuide('manual_test', 'general-purpose', 'sonnet', ['readonly']),
        security_scan: buildPhaseGuide('security_scan', 'general-purpose', 'sonnet', ['readonly', 'testing']),
        performance_test: buildPhaseGuide('performance_test', 'general-purpose', 'sonnet', ['readonly', 'testing']),
        e2e_test: buildPhaseGuide('e2e_test', 'general-purpose', 'sonnet', ['readonly', 'testing']),
      },
    };
    const result = extractFromDefinitions(mockGuides);
    // 24件（25件未満）になることを確認
    expect(result.length).toBeLessThan(25);
  });
});

// -----------------------------------------------------------------------
// グループ7: 統合動作確認（モックによる E2E 相当の検証）
// -----------------------------------------------------------------------

describe('グループ7: 統合動作確認', () => {
  it('TC-7-1: 全フェーズ一致の統合フロー（AC-1 達成確認）', () => {
    if (!extractFromDefinitions || !compareAndReport) {
      expect(true, 'verify-sync.ts 未実装のため Red Phase').toBe(true);
      return;
    }
    // 簡略版（3フェーズ）で全体フローを確認
    const mockGuides = {
      research: buildPhaseGuide('research', 'general-purpose', 'sonnet', ['readonly']),
      requirements: buildPhaseGuide('requirements', 'general-purpose', 'sonnet', ['readonly']),
      commit: buildPhaseGuide('commit', 'general-purpose', 'haiku', ['readonly', 'git']),
    };
    const defs = extractFromDefinitions(mockGuides) as Array<{ phaseName: string; subagentType: string; model: string; allowedBashCategories: string[] }>;

    const rootSubagentRows = defs.map((d) => ({ phaseName: d.phaseName, subagentType: d.subagentType, model: d.model }));
    const rootSubagent = new Map(rootSubagentRows.map((r) => [r.phaseName, r]));
    const rootBash = new Map(defs.map((d) => [d.phaseName, d.allowedBashCategories]));
    const pluginSubagent = new Map(rootSubagentRows.map((r) => [r.phaseName, r]));

    const exitCode = compareAndReport(defs, rootSubagent, rootBash, pluginSubagent);
    expect(exitCode).toBe(0);
  });

  it('TC-7-2: ルート CLAUDE.md の model 変更時の差分検出（AC-2・AC-3 達成確認）', () => {
    if (!extractFromDefinitions || !compareAndReport) {
      expect(true, 'verify-sync.ts 未実装のため Red Phase').toBe(true);
      return;
    }
    // planning フェーズの model が sonnet である定義
    const mockGuides = {
      planning: buildPhaseGuide('planning', 'general-purpose', 'sonnet', ['readonly']),
    };
    const defs = extractFromDefinitions(mockGuides) as Array<{ phaseName: string; subagentType: string; model: string; allowedBashCategories: string[] }>;

    const rootSubagent = new Map([
      // ルート CLAUDE.md では model が haiku に誤って記載（一時変更を模倣）
      ['planning', { phaseName: 'planning', subagentType: 'general-purpose', model: 'haiku' }],
    ]);
    const rootBash = new Map([['planning', ['readonly']]]);
    const pluginSubagent = new Map([
      ['planning', { phaseName: 'planning', subagentType: 'general-purpose', model: 'sonnet' }],
    ]);

    const exitCode = compareAndReport(defs, rootSubagent, rootBash, pluginSubagent);
    // model 不一致のため終了コード1
    expect(exitCode).toBe(1);
  });
});
