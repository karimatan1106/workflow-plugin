# テスト設計書: ワークフロー成果物検証強制

## 概要

ワークフローのフェーズ遷移・サブフェーズ完了時に必須成果物ファイルの存在を検証し、未作成のまま進行できないようにする機能のテスト設計。

**テスト対象:**
- `src/tools/next.ts` - フェーズ遷移時の成果物チェック
- `src/tools/complete-sub.ts` - サブフェーズ完了時の成果物チェック
- `src/validation/design-validator.ts` - 設計書検証の厳格化

**テストアプローチ:**
- ユニットテスト（Vitest）
- モック（fs.existsSync, stateManager）
- TDD Red Phase（テストファースト）

---

## テストファイル配置

| テストファイル | 対象 | 配置先 |
|---------------|------|--------|
| `next-artifact-check.test.ts` | REQ-1（next.ts） | `src/tools/__tests__/` |
| `complete-sub-artifact-check.test.ts` | REQ-2（complete-sub.ts） | `src/tools/__tests__/` |
| `design-validator-strict.test.ts` | REQ-3（design-validator.ts） | `src/validation/__tests__/` |

---

## REQ-1: next.ts の成果物チェック

### テストケース一覧

| テストID | テストケース | 事前条件 | 期待結果 |
|---------|------------|----------|---------|
| TC-1-1 | research フェーズで research.md なし → エラー | フェーズ: research, research.md 不存在 | `success: false`, メッセージに「research.md」含む |
| TC-1-2 | research フェーズで research.md あり → 遷移成功 | フェーズ: research, research.md 存在 | `success: true`, `from: 'research'`, `to: 'requirements'` |
| TC-1-3 | requirements フェーズで requirements.md なし → エラー | フェーズ: requirements, requirements.md 不存在 | `success: false`, メッセージに「requirements.md」含む |
| TC-1-4 | test_design フェーズで test-design.md なし → エラー | フェーズ: test_design, test-design.md 不存在 | `success: false`, メッセージに「test-design.md」含む |
| TC-1-5 | implementation フェーズ（チェック対象外）→ そのまま遷移 | フェーズ: implementation | `success: true`, `to: 'refactoring'` |
| TC-1-6 | SKIP_ARTIFACT_CHECK=true → 成果物なしでも遷移成功 | 環境変数 SKIP_ARTIFACT_CHECK=true, research.md 不存在 | `success: true`, `to: 'requirements'` |
| TC-1-7 | docsDir が undefined の場合は workflowDir を使用 | taskState.docsDir = undefined, workflowDir 配下に research.md | `success: true` |
| TC-1-8 | エラーメッセージに docsDir パスが含まれる | research.md 不存在 | メッセージに「出力先: {docsDir}/」含む |

### テスト実装詳細

#### TC-1-1: research.md なし → エラー

```typescript
describe('TC-1-1: research フェーズで research.md なし → エラー', () => {
  it('success: false, メッセージに research.md が含まれる', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(stateManager.getTaskById).mockReturnValue({
      taskId: 'task123',
      taskName: 'テスト',
      phase: 'research',
      docsDir: '/docs/workflows/test',
      workflowDir: '/workflow/test',
      startedAt: '2026-02-07T00:00:00.000Z',
      checklist: {},
      history: [],
      subPhases: {},
    });

    const result = workflowNext('task123');

    expect(result.success).toBe(false);
    expect(result.message).toContain('research.md');
    expect(result.message).toContain('必須成果物が未作成です');
    expect(result.message).toContain('/docs/workflows/test');
  });
});
```

#### TC-1-2: research.md あり → 遷移成功

```typescript
describe('TC-1-2: research フェーズで research.md あり → 遷移成功', () => {
  it('success: true, from: research, to: requirements', () => {
    vi.mocked(fs.existsSync).mockImplementation((path) => {
      return path.toString().endsWith('research.md');
    });
    vi.mocked(stateManager.getTaskById).mockReturnValue({
      taskId: 'task123',
      taskName: 'テスト',
      phase: 'research',
      docsDir: '/docs/workflows/test',
      workflowDir: '/workflow/test',
      startedAt: '2026-02-07T00:00:00.000Z',
      checklist: {},
      history: [],
      subPhases: {},
    });

    const result = workflowNext('task123');

    expect(result.success).toBe(true);
    expect(result.from).toBe('research');
    expect(result.to).toBe('requirements');
  });
});
```

#### TC-1-6: SKIP_ARTIFACT_CHECK=true → スキップ

```typescript
describe('TC-1-6: SKIP_ARTIFACT_CHECK=true → 成果物なしでも遷移成功', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.SKIP_ARTIFACT_CHECK;
    process.env.SKIP_ARTIFACT_CHECK = 'true';
  });

  afterEach(() => {
    process.env.SKIP_ARTIFACT_CHECK = originalEnv;
  });

  it('成果物なしでも遷移成功', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(stateManager.getTaskById).mockReturnValue({
      taskId: 'task123',
      taskName: 'テスト',
      phase: 'research',
      docsDir: '/docs/workflows/test',
      workflowDir: '/workflow/test',
      startedAt: '2026-02-07T00:00:00.000Z',
      checklist: {},
      history: [],
      subPhases: {},
    });

    const result = workflowNext('task123');

    expect(result.success).toBe(true);
    expect(result.to).toBe('requirements');
  });
});
```

### モック方針（REQ-1）

```typescript
// fs モジュールモック
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// stateManager モック
vi.mock('../../state/manager.js', () => ({
  stateManager: {
    getTaskById: vi.fn(),
    updateTaskPhase: vi.fn(),
    getIncompleteSubPhases: vi.fn().mockReturnValue([]),
  },
}));

// path.join のモック（必要に応じて）
import * as path from 'path';
// path.join は実際の実装を使用（モック不要）
```

---

## REQ-2: complete-sub.ts の成果物チェック

### テストケース一覧

| テストID | テストケース | 事前条件 | 期待結果 |
|---------|------------|----------|---------|
| TC-2-1 | threat_modeling で threat-model.md なし → エラー | サブフェーズ: threat_modeling, threat-model.md 不存在 | `success: false`, メッセージに「threat-model.md」含む |
| TC-2-2 | threat_modeling で threat-model.md あり → 完了成功 | サブフェーズ: threat_modeling, threat-model.md 存在 | `success: true`, `subPhase: 'threat_modeling'` |
| TC-2-3 | planning で spec.md なし → エラー | サブフェーズ: planning, spec.md 不存在 | `success: false`, メッセージに「spec.md」含む |
| TC-2-4 | state_machine で state-machine.mmd なし → エラー | サブフェーズ: state_machine, state-machine.mmd 不存在 | `success: false`, メッセージに「state-machine.mmd」含む |
| TC-2-5 | flowchart で flowchart.mmd なし → エラー | サブフェーズ: flowchart, flowchart.mmd 不存在 | `success: false`, メッセージに「flowchart.mmd」含む |
| TC-2-6 | ui_design で ui-design.md なし → エラー | サブフェーズ: ui_design, ui-design.md 不存在 | `success: false`, メッセージに「ui-design.md」含む |
| TC-2-7 | code_review で code-review.md なし → エラー | サブフェーズ: code_review, code-review.md 不存在 | `success: false`, メッセージに「code-review.md」含む |
| TC-2-8 | build_check（チェック対象外）→ 直接完了 | サブフェーズ: build_check | `success: true`, `subPhase: 'build_check'` |
| TC-2-9 | SKIP_ARTIFACT_CHECK=true → スキップ | 環境変数 SKIP_ARTIFACT_CHECK=true, threat-model.md 不存在 | `success: true` |
| TC-2-10 | manual_test で manual-test.md なし → エラー | サブフェーズ: manual_test, manual-test.md 不存在 | `success: false`, メッセージに「manual-test.md」含む |
| TC-2-11 | security_scan で security-scan.md なし → エラー | サブフェーズ: security_scan, security-scan.md 不存在 | `success: false`, メッセージに「security-scan.md」含む |
| TC-2-12 | performance_test で performance-test.md なし → エラー | サブフェーズ: performance_test, performance-test.md 不存在 | `success: false`, メッセージに「performance-test.md」含む |
| TC-2-13 | e2e_test で e2e-test.md なし → エラー | サブフェーズ: e2e_test, e2e-test.md 不存在 | `success: false`, メッセージに「e2e-test.md」含む |

### テスト実装詳細

#### TC-2-1: threat_modeling で threat-model.md なし → エラー

```typescript
describe('TC-2-1: threat_modeling で threat-model.md なし → エラー', () => {
  it('success: false, メッセージに threat-model.md が含まれる', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(stateManager.getTaskById).mockReturnValue({
      taskId: 'task123',
      taskName: 'テスト',
      phase: 'parallel_analysis',
      docsDir: '/docs/workflows/test',
      workflowDir: '/workflow/test',
      startedAt: '2026-02-07T00:00:00.000Z',
      checklist: {},
      history: [],
      subPhases: {},
    });

    const result = workflowCompleteSub('task123', 'threat_modeling');

    expect(result.success).toBe(false);
    expect(result.message).toContain('threat-model.md');
    expect(result.message).toContain('必須成果物が未作成です');
    expect(result.message).toContain('/docs/workflows/test');
  });
});
```

#### TC-2-2: threat_modeling で threat-model.md あり → 完了成功

```typescript
describe('TC-2-2: threat_modeling で threat-model.md あり → 完了成功', () => {
  it('success: true, subPhase: threat_modeling', () => {
    vi.mocked(fs.existsSync).mockImplementation((path) => {
      return path.toString().endsWith('threat-model.md');
    });
    vi.mocked(stateManager.getTaskById).mockReturnValue({
      taskId: 'task123',
      taskName: 'テスト',
      phase: 'parallel_analysis',
      docsDir: '/docs/workflows/test',
      workflowDir: '/workflow/test',
      startedAt: '2026-02-07T00:00:00.000Z',
      checklist: {},
      history: [],
      subPhases: {},
    });
    vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue(['planning']);

    const result = workflowCompleteSub('task123', 'threat_modeling');

    expect(result.success).toBe(true);
    expect(result.subPhase).toBe('threat_modeling');
  });
});
```

#### TC-2-8: build_check（チェック対象外）→ 直接完了

```typescript
describe('TC-2-8: build_check（チェック対象外）→ 直接完了', () => {
  it('成果物チェックなしで完了できる', () => {
    vi.mocked(stateManager.getTaskById).mockReturnValue({
      taskId: 'task123',
      taskName: 'テスト',
      phase: 'parallel_quality',
      docsDir: '/docs/workflows/test',
      workflowDir: '/workflow/test',
      startedAt: '2026-02-07T00:00:00.000Z',
      checklist: {},
      history: [],
      subPhases: {},
    });
    vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue(['code_review']);

    const result = workflowCompleteSub('task123', 'build_check');

    expect(result.success).toBe(true);
    expect(result.subPhase).toBe('build_check');
  });
});
```

### モック方針（REQ-2）

```typescript
// REQ-1と同様のモック構成
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('../../state/manager.js', () => ({
  stateManager: {
    getTaskById: vi.fn(),
    updateSubPhaseStatus: vi.fn(),
    getIncompleteSubPhases: vi.fn(),
  },
}));
```

---

## REQ-3: design-validator.ts の修正

### テストケース一覧

| テストID | テストケース | 事前条件 | 期待結果 |
|---------|------------|----------|---------|
| TC-3-1 | workflowDir 不存在 → passed: false | workflowDir ディレクトリが存在しない | `passed: false`, `missingItems` に workflowDir 含む |
| TC-3-2 | 3つの設計書が全欠落 → passed: false | spec.md, state-machine.mmd, flowchart.mmd すべて不存在 | `passed: false`, `missingItems` に3ファイル含む |
| TC-3-3 | spec.md のみ存在 → 部分検証実行 | spec.md 存在, 他2つ不存在 | `warnings` に2つの警告, 検証は実行される |
| TC-3-4 | SKIP_DESIGN_VALIDATION=true → 従来通りスキップ | 環境変数 SKIP_DESIGN_VALIDATION=true | 検証がスキップされる（従来動作） |
| TC-3-5 | 全設計書存在 → 通常の検証実行 | spec.md, state-machine.mmd, flowchart.mmd すべて存在 | 検証が実行され、`passed` は実装状況による |

### テスト実装詳細

#### TC-3-1: workflowDir 不存在 → passed: false

```typescript
describe('TC-3-1: workflowDir 不存在 → passed: false', () => {
  it('passed: false, missingItems に workflowDir が含まれる', () => {
    const tempDir = '/nonexistent/dir';
    const validator = new DesignValidator(tempDir, tempDir);

    const result = validator.validateAll();

    expect(result.passed).toBe(false);
    expect(result.missingItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'file',
          source: 'workflow',
          name: 'workflowDir',
          expectedPath: tempDir,
        }),
      ])
    );
    expect(result.summary.total).toBe(1);
    expect(result.summary.missing).toBe(1);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('ワークフローディレクトリが見つかりません'),
      ])
    );
  });
});
```

#### TC-3-2: 3つの設計書が全欠落 → passed: false

```typescript
describe('TC-3-2: 3つの設計書が全欠落 → passed: false', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-validator-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('passed: false, missingItems に3ファイル含まれる', () => {
    const validator = new DesignValidator(tempDir, tempDir);

    const result = validator.validateAll();

    expect(result.passed).toBe(false);
    expect(result.missingItems).toHaveLength(3);
    expect(result.missingItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'spec.md' }),
        expect.objectContaining({ name: 'state-machine.mmd' }),
        expect.objectContaining({ name: 'flowchart.mmd' }),
      ])
    );
    expect(result.summary.total).toBe(3);
    expect(result.summary.missing).toBe(3);
  });
});
```

#### TC-3-3: spec.md のみ存在 → 部分検証実行

```typescript
describe('TC-3-3: spec.md のみ存在 → 部分検証実行', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-validator-test-'));
    // spec.md のみ作成
    fs.writeFileSync(
      path.join(tempDir, 'spec.md'),
      '## クラス\n- User\n\n## ファイルパス\n- src/user.ts'
    );
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('warnings に2つの警告、検証は実行される', () => {
    const validator = new DesignValidator(tempDir, tempDir);

    const result = validator.validateAll();

    // spec.md の検証は実行される
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        'state-machine.mmd が見つかりません',
        'flowchart.mmd が見つかりません',
      ])
    );
    // 全欠落（3つ）ではないため、「検証をスキップ」警告は含まれない
    expect(result.warnings).not.toContain('設計書がありません - 検証をスキップ');
  });
});
```

#### TC-3-4: SKIP_DESIGN_VALIDATION=true → スキップ

```typescript
describe('TC-3-4: SKIP_DESIGN_VALIDATION=true → 従来通りスキップ', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.SKIP_DESIGN_VALIDATION;
    process.env.SKIP_DESIGN_VALIDATION = 'true';
  });

  afterEach(() => {
    process.env.SKIP_DESIGN_VALIDATION = originalEnv;
  });

  it('検証がスキップされる', () => {
    // next.ts の performDesignValidation() が null を返すことをテスト
    // 実際の実装では next.ts のテストで確認
    expect(process.env.SKIP_DESIGN_VALIDATION).toBe('true');
  });
});
```

### モック方針（REQ-3）

```typescript
// design-validator.ts は実ファイルシステムを使用するため、
// 一時ディレクトリを作成してテストする
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// 各テストケースで beforeEach / afterEach で一時ディレクトリを作成・削除
let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-validator-test-'));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});
```

---

## REQ-4: phase-edit-guard.js（hooks）

**注**: hooks のテストは JavaScript/Node.js環境で実行されるため、別途テストが必要。
本テスト設計書ではTypeScriptユニットテストに焦点を当てる。

### 検証項目

| テストID | テストケース | 期待結果 |
|---------|------------|---------|
| TC-4-1 | build_check で .ts 編集 → 許可 | allowed に 'code' が含まれる |
| TC-4-2 | build_check で .mmd 編集 → ブロック | blocked に 'diagram' が含まれる |

**注記**: hooks のテストは手動検証または統合テストで確認することを推奨。

---

## 統合テスト

### 統合テストシナリオ

| シナリオID | シナリオ | 手順 | 期待結果 |
|-----------|---------|------|---------|
| IT-1 | research → requirements 遷移（成果物チェック） | 1. research.md を作成<br>2. workflow_next 実行 | requirements に遷移成功 |
| IT-2 | research.md なしで遷移試行 → エラー | 1. research.md を削除<br>2. workflow_next 実行 | エラーメッセージ表示 |
| IT-3 | parallel_analysis のサブフェーズ完了 | 1. threat-model.md 作成<br>2. workflow_complete_sub threat_modeling<br>3. spec.md 作成<br>4. workflow_complete_sub planning | 両方完了成功 |
| IT-4 | SKIP_ARTIFACT_CHECK=true で全フェーズ遷移 | 1. 環境変数設定<br>2. 成果物なしで workflow_next を複数回実行 | すべて成功 |

---

## テスト実行

### テスト実行コマンド

```bash
# 全テスト実行
cd mcp-server
pnpm test

# 特定テストファイルのみ実行
pnpm test src/tools/__tests__/next-artifact-check.test.ts
pnpm test src/tools/__tests__/complete-sub-artifact-check.test.ts
pnpm test src/validation/__tests__/design-validator-strict.test.ts

# ウォッチモード
pnpm test --watch
```

### カバレッジ目標

| モジュール | 目標カバレッジ |
|-----------|---------------|
| next.ts（checkPhaseArtifacts） | 100% |
| complete-sub.ts（checkSubPhaseArtifacts） | 100% |
| design-validator.ts（validateAll） | 90%以上 |

---

## テストデータ

### モックタスク状態

```typescript
const mockTaskState = {
  taskId: 'test_task_123',
  taskName: 'テストタスク',
  phase: 'research',
  docsDir: '/path/to/docs/workflows/test',
  workflowDir: '/path/to/workflow/test',
  startedAt: '2026-02-07T00:00:00.000Z',
  checklist: {},
  history: [],
  subPhases: {},
  taskSize: 'large',
};
```

### 必須成果物マッピング（テスト用）

```typescript
// next.ts
const PHASE_REQUIRED_ARTIFACTS = {
  research: ['research.md'],
  requirements: ['requirements.md'],
  test_design: ['test-design.md'],
};

// complete-sub.ts
const SUB_PHASE_REQUIRED_ARTIFACTS = {
  threat_modeling: ['threat-model.md'],
  planning: ['spec.md'],
  state_machine: ['state-machine.mmd'],
  flowchart: ['flowchart.mmd'],
  ui_design: ['ui-design.md'],
  code_review: ['code-review.md'],
  manual_test: ['manual-test.md'],
  security_scan: ['security-scan.md'],
  performance_test: ['performance-test.md'],
  e2e_test: ['e2e-test.md'],
};
```

---

## テスト実装順序

### 推奨実装順序

1. **REQ-1のテスト実装** (`next-artifact-check.test.ts`)
   - TC-1-1, TC-1-2（基本動作）
   - TC-1-3, TC-1-4（他フェーズ）
   - TC-1-5（チェック対象外）
   - TC-1-6（スキップフラグ）
   - TC-1-7, TC-1-8（エッジケース）

2. **REQ-2のテスト実装** (`complete-sub-artifact-check.test.ts`)
   - TC-2-1, TC-2-2（threat_modeling）
   - TC-2-3〜TC-2-7（他サブフェーズ）
   - TC-2-8（チェック対象外）
   - TC-2-9（スキップフラグ）
   - TC-2-10〜TC-2-13（parallel_verification）

3. **REQ-3のテスト実装** (`design-validator-strict.test.ts`)
   - TC-3-1（workflowDir不存在）
   - TC-3-2（全欠落）
   - TC-3-3（部分検証）
   - TC-3-4（スキップフラグ）
   - TC-3-5（通常検証）

---

## テスト完了基準

### 完了条件

- [ ] 全テストケースが実装されている
- [ ] 全テストがパスする
- [ ] カバレッジ目標を達成
- [ ] モック動作が仕様通り
- [ ] エッジケースが網羅されている
- [ ] エラーメッセージが適切に検証されている
- [ ] 環境変数（SKIP_ARTIFACT_CHECK）の動作が確認されている

### 品質基準

- [ ] テストコードが可読性高い
- [ ] テストが独立している（相互依存なし）
- [ ] beforeEach / afterEach でクリーンアップされている
- [ ] モックが適切にリセットされている
- [ ] テストが高速に実行される（<500ms/ファイル）

---

## 付録: モックパターン

### fs.existsSync のモックパターン

```typescript
// パターン1: 常に false を返す
vi.mocked(fs.existsSync).mockReturnValue(false);

// パターン2: 特定ファイルのみ true を返す
vi.mocked(fs.existsSync).mockImplementation((path) => {
  return path.toString().endsWith('research.md');
});

// パターン3: パスに基づいて動的に返す
vi.mocked(fs.existsSync).mockImplementation((path) => {
  const pathStr = path.toString();
  if (pathStr.includes('research.md')) return true;
  if (pathStr.includes('spec.md')) return true;
  return false;
});
```

### stateManager のモックパターン

```typescript
// 基本パターン
vi.mocked(stateManager.getTaskById).mockReturnValue(mockTaskState);
vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue([]);

// サブフェーズ未完了がある場合
vi.mocked(stateManager.getIncompleteSubPhases).mockReturnValue(['planning']);

// タスクが見つからない場合
vi.mocked(stateManager.getTaskById).mockReturnValue(null);
```

---

## まとめ

本テスト設計書は、ワークフロー成果物検証強制機能の全テストケースを網羅している。

**テスト総数:**
- REQ-1: 8ケース
- REQ-2: 13ケース
- REQ-3: 5ケース
- **合計: 26ケース**

**推定テスト工数:**
- テスト実装: 4時間
- デバッグ・修正: 2時間
- レビュー: 1時間
- **合計: 7時間**
