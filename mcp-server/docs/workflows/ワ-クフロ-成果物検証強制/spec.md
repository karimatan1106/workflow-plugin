# 仕様書: ワークフロー成果物検証強制

## 概要

ワークフローのフェーズ遷移・サブフェーズ完了時に必須成果物ファイルの存在を検証し、未作成のまま進行できないようにする。

---

## REQ-1: フェーズ遷移時の成果物存在チェック

### 対象ファイル
`mcp-server/src/tools/next.ts`

### 実装仕様

#### 1. フェーズごとの必須成果物マッピング

```typescript
import * as fs from 'fs';
import * as path from 'path';
import type { PhaseName } from '../state/types.js';

const PHASE_REQUIRED_ARTIFACTS: Partial<Record<PhaseName, string[]>> = {
  research: ['research.md'],
  requirements: ['requirements.md'],
  test_design: ['test-design.md'],
};
```

#### 2. 検証関数

```typescript
function checkPhaseArtifacts(phase: PhaseName, docsDir: string): string[] {
  if (process.env.SKIP_ARTIFACT_CHECK === 'true') {
    return [];
  }
  const artifacts = PHASE_REQUIRED_ARTIFACTS[phase];
  if (!artifacts) {
    return [];
  }
  return artifacts.filter(f => !fs.existsSync(path.join(docsDir, f)));
}
```

#### 3. workflowNext()への組み込み

既存チェック（完了済み、承認、サブフェーズ）の**後**、getNextPhase()の**前**に追加:

```typescript
// 成果物存在チェック
const docsDir = taskState.docsDir || taskState.workflowDir;
const missingArtifacts = checkPhaseArtifacts(currentPhase, docsDir);
if (missingArtifacts.length > 0) {
  return {
    success: false,
    message: `${currentPhase}フェーズの必須成果物が未作成です: ${missingArtifacts.join(', ')}\n` +
             `出力先: ${docsDir}/`,
  };
}
```

### 挿入位置

`workflowNext()` 関数内、設計検証チェック（L153-159）の**後**、タスクサイズ取得（L162）の**前**。

---

## REQ-2: サブフェーズ完了時の成果物検証

### 対象ファイル
`mcp-server/src/tools/complete-sub.ts`

### 実装仕様

#### 1. サブフェーズごとの必須成果物マッピング

```typescript
import * as fs from 'fs';
import * as path from 'path';
import type { SubPhaseName } from '../state/types.js';

const SUB_PHASE_REQUIRED_ARTIFACTS: Partial<Record<SubPhaseName, string[]>> = {
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

#### 2. 検証関数

```typescript
function checkSubPhaseArtifacts(subPhase: SubPhaseName, docsDir: string): string[] {
  if (process.env.SKIP_ARTIFACT_CHECK === 'true') {
    return [];
  }
  const artifacts = SUB_PHASE_REQUIRED_ARTIFACTS[subPhase];
  if (!artifacts) {
    return [];
  }
  return artifacts.filter(f => !fs.existsSync(path.join(docsDir, f)));
}
```

#### 3. workflowCompleteSub()への組み込み

依存関係チェック（L56-72）の**後**、safeExecute()の**前**に追加:

```typescript
// 成果物存在チェック
const docsDir = taskState.docsDir || taskState.workflowDir;
const missingArtifacts = checkSubPhaseArtifacts(subPhaseName, docsDir);
if (missingArtifacts.length > 0) {
  return {
    success: false,
    message: `${subPhaseName}の必須成果物が未作成です: ${missingArtifacts.join(', ')}\n` +
             `出力先: ${docsDir}/`,
  };
}
```

---

## REQ-3: design-validator.tsの「なければスキップ」→「なければブロック」

### 対象ファイル
`mcp-server/src/validation/design-validator.ts`

### 実装仕様

#### 変更1: workflowDir不存在時（L71-75）

**変更前**:
```typescript
if (!fs.existsSync(this.workflowDir)) {
  result.warnings.push('ワークフローディレクトリが見つかりません - 検証をスキップ');
  result.passed = true;
  return result;
}
```

**変更後**:
```typescript
if (!fs.existsSync(this.workflowDir)) {
  result.passed = false;
  result.missingItems.push({
    type: 'file',
    source: 'workflow',
    name: 'workflowDir',
    expectedPath: this.workflowDir,
  });
  result.summary.total = 1;
  result.summary.missing = 1;
  result.warnings.push(`ワークフローディレクトリが見つかりません: ${this.workflowDir}`);
  return result;
}
```

#### 変更2: 設計書全欠落時（L93-98）

**変更前**:
```typescript
if (result.warnings.length >= 3) {
  result.warnings.push('設計書がありません - 検証をスキップ');
  result.passed = true;
  return result;
}
```

**変更後**:
```typescript
if (result.warnings.length >= 3) {
  result.passed = false;
  result.missingItems.push(
    { type: 'file', source: 'spec.md', name: 'spec.md', expectedPath: specPath },
    { type: 'file', source: 'state-machine.mmd', name: 'state-machine.mmd', expectedPath: stateMachinePath },
    { type: 'file', source: 'flowchart.mmd', name: 'flowchart.mmd', expectedPath: flowchartPath },
  );
  result.summary.total = 3;
  result.summary.missing = 3;
  return result;
}
```

---

## REQ-4: build_checkのhookルール修正

### 対象ファイル
`hooks/phase-edit-guard.js`

### 実装仕様

#### 変更（L189-194）

**変更前**:
```javascript
build_check: {
  allowed: [],
  blocked: ['code', 'test', 'spec', 'diagram', 'config', 'env', 'other'],
  description: 'ビルドチェック中。ファイル編集は禁止です。',
  japaneseName: 'ビルドチェック',
  readOnly: true,
},
```

**変更後**:
```javascript
build_check: {
  allowed: ['code', 'test', 'spec', 'config', 'env'],
  blocked: ['diagram'],
  description: 'ビルドチェック中。ビルドエラー修正のためのコード・テスト・仕様書・設定ファイルの編集が許可されます。',
  japaneseName: 'ビルドチェック',
},
```

---

## テスト仕様

### REQ-1テスト

1. research.md がない状態で workflow_next → エラー
2. research.md がある状態で workflow_next → 成功
3. requirements.md がない状態で workflow_next → エラー
4. test-design.md がない状態で workflow_next → エラー
5. SKIP_ARTIFACT_CHECK=true で成果物なしでも workflow_next → 成功
6. チェック対象外フェーズ（implementation等）→ チェックなしで通過

### REQ-2テスト

1. threat-model.md がない状態で complete_sub threat_modeling → エラー
2. threat-model.md がある状態で complete_sub threat_modeling → 成功
3. spec.md がない状態で complete_sub planning → エラー
4. state-machine.mmd がない状態で complete_sub state_machine → エラー
5. flowchart.mmd がない状態で complete_sub flowchart → エラー
6. ui-design.md がない状態で complete_sub ui_design → エラー
7. code-review.md がない状態で complete_sub code_review → エラー
8. build_check（成果物チェックなし）→ 直接完了可能
9. SKIP_ARTIFACT_CHECK=true でスキップ可能

### REQ-3テスト

1. workflowDir 不存在 → passed: false
2. 3つの設計書が全て不存在 → passed: false
3. spec.md のみ存在 → 部分検証実行
4. 全設計書存在 → 通常の検証実行

### REQ-4テスト

1. build_check フェーズで .ts ファイル編集 → 許可
2. build_check フェーズで .test.ts ファイル編集 → 許可
3. build_check フェーズで .mmd ファイル編集 → ブロック

---

## 影響ファイル一覧

| ファイル | REQ | 変更内容 |
|---------|-----|---------|
| `mcp-server/src/tools/next.ts` | REQ-1 | checkPhaseArtifacts追加 |
| `mcp-server/src/tools/complete-sub.ts` | REQ-2 | checkSubPhaseArtifacts追加 |
| `mcp-server/src/validation/design-validator.ts` | REQ-3 | passed:true→false |
| `hooks/phase-edit-guard.js` | REQ-4 | build_checkルール修正 |
