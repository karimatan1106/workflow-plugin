# 脅威モデル: ワークフロー成果物検証強制機能

## 概要

ワークフロープラグインの「成果物検証強制機能」に関する脅威モデル分析。

本機能は以下の変更対象を含む：
- `next.ts`: フェーズ遷移時の成果物存在チェック追加
- `complete-sub.ts`: サブフェーズ完了時の成果物検証追加
- `design-validator.ts`: スキップ→ブロックに変更
- `phase-edit-guard.js`: build_checkルール修正

---

## 脅威分析

### 脅威1: 環境変数によるスキップバイパス

**脅威シナリオ**
- AIが `SKIP_ARTIFACT_CHECK=true` を設定してチェックをスキップ
- 設計書がない状態でコードを実装
- フェーズ遷移制限を回避可能

**影響度**: 高（実装品質の低下、設計-実装の乖離）

**現在のコード**:
```typescript
// next.ts: 30-32行
if (process.env.SKIP_ARTIFACT_CHECK) {
  return null;
}
```

**脅威根拠**:
- `SKIP_ARTIFACT_CHECK` は単純な環境変数チェック
- AIエージェントは `process.env` 操作が可能
- チェック機構がない

---

### 脅威2: docsDirの操作による検証回避

**脅威シナリオ**
- 存在しないディレクトリパスを `docsDir` に設定
- ファイル存在チェックが失敗し、警告で通過
- コード品質チェックなし

**影響度**: 中（設計-実装整合性の喪失）

**現在のコード**:
```typescript
// design-validator.ts: 70-98行
if (!fs.existsSync(this.workflowDir)) {
  result.warnings.push('ワークフローディレクトリが見つかりません - 検証をスキップ');
  result.passed = true; // ✗ スキップ扱いで通過
  return result;
}
```

**脅威根拠**:
- ディレクトリ存在チェックが寛容（スキップで OK にしている）
- 警告モードでも実装に進める可能性
- `VALIDATE_DESIGN_STRICT=false` で警告レベルにダウングレード可能

---

### 脅威3: 空ファイルによる検証回避

**脅威シナリオ**
- 空の `spec.md`, `state-machine.mmd` などを作成
- ファイル存在チェックは通る
- 内容チェックなし

**影響度**: 中（虚偽の成果物）

**現在のコード**:
```typescript
// design-validator.ts: 101-105行
if (fs.existsSync(specPath)) {
  const specContent = fs.readFileSync(specPath, 'utf-8');
  const specItems = parseSpec(specContent);
  this.validateSpecItems(specItems, result);
}
```

**脅威根拠**:
- `parseSpec()` は空文字列でも動作（item 抽出結果が空配列）
- 空ファイルの場合、`result.summary.total` が 0 のままで `passed = true`
- ファイルサイズチェックなし

---

### 脅威4: build_checkフェーズの権限拡大による不正編集

**脅威シナリオ**
- `build_check` は「ビルド修正用」として全ファイル編集許可
- AIがコード編集を偽装（ビルドエラーのせい）
- 承認なしに実装フェーズのコード変更

**影響度**: 高（タスク範囲外の編集）

**現在のコード**:
```javascript
// phase-edit-guard.js: 189-195行
build_check: {
  allowed: [],
  blocked: ['code', 'test', 'spec', 'diagram', 'config', 'env', 'other'],
  description: 'ビルドチェック中。ファイル編集は禁止です。',
  japaneseName: 'ビルドチェック',
  readOnly: true,
},
```

**脅威根拠**:
- `allowed: []` で読み取り専用が保証されている（現在は安全）
- しかし、将来の変更で `allowed: ['code']` に変更される可能性
- CLAUDEMD では「build_check で全て（ビルド修正用）」との記述

---

### 脅威5: ファイル名パターン類似による検証回避

**脅威シナリオ**
- `research-notes.md` を `spec.md` として誤認
- `state-machine-backup.mmd` を `state-machine.mmd` として誤認
- パス一致チェックの曖昧性

**影響度**: 低（ファイル存在チェックは正確）

**現在のコード**:
```typescript
// design-validator.ts: 78-80行
const specPath = path.join(this.workflowDir, 'spec.md');
const stateMachinePath = path.join(this.workflowDir, 'state-machine.mmd');
const flowchartPath = path.join(this.workflowDir, 'flowchart.mmd');
```

**脅威根拠**:
- `path.join()` で正確なパスが生成される
- AIが意図的にファイル名を変更する可能性（低い）

---

## 対策

### 対策1: SKIP_ARTIFACT_CHECK環境変数の禁止化

**目的**: 環境変数によるスキップをブロック

**実装方法**:
1. `next.ts` で `SKIP_ARTIFACT_CHECK=true` を検出したら **エラー** を返す
2. ログに警告を記録
3. AIに「このフラグは使用禁止」という明確なメッセージを表示

**コード例**:
```typescript
function performDesignValidation(docsDir: string): NextResult | null {
  // ★ 新規: スキップフラグの禁止化
  if (process.env.SKIP_ARTIFACT_CHECK) {
    return {
      success: false,
      message: '設計-実装整合性検証はスキップできません（禁止）。' +
               '設計書が見つからない場合は、/workflow reset で戻ってください。',
    };
  }

  // ... 既存のコード
}
```

**監査ログ**: `Skip artifact check attempted (BLOCKED)` として記録

---

### 対策2: docsDirの存在と内容チェック強制

**目的**: 存在しないディレクトリやスキップ許可を厳格化

**実装方法**:
1. ディレクトリが存在しない場合は **警告ではなくエラー**
2. ファイル存在チェックで見つからない場合も **エラー**
3. `VALIDATE_DESIGN_STRICT=false` でも内容チェックは実行

**コード例**:
```typescript
validateAll(): ValidationResult {
  // ... 既存のコード

  // ワークフローディレクトリの存在チェック
  if (!fs.existsSync(this.workflowDir)) {
    // ★ 変更: 警告ではなくエラーにする
    return {
      passed: false,
      phase: 'validation',
      timestamp: new Date().toISOString(),
      summary: { total: 0, implemented: 0, missing: 0 },
      missingItems: [
        {
          type: 'directory',
          source: 'design-validator',
          name: 'workflow-dir',
          expectedPath: this.workflowDir,
        }
      ],
      warnings: [],
    };
  }

  // 設計書ファイルの存在チェック（見つからない場合はエラー扱い）
  const missingFiles = [];
  if (!fs.existsSync(specPath)) {
    missingFiles.push({ type: 'file', name: 'spec.md', path: specPath });
  }
  if (!fs.existsSync(stateMachinePath)) {
    missingFiles.push({ type: 'file', name: 'state-machine.mmd', path: stateMachinePath });
  }
  if (!fs.existsSync(flowchartPath)) {
    missingFiles.push({ type: 'file', name: 'flowchart.mmd', path: flowchartPath });
  }

  // 全て見つからない場合は エラー（スキップ不可）
  if (missingFiles.length === 3) {
    return {
      passed: false,
      phase: 'validation',
      timestamp: new Date().toISOString(),
      summary: { total: 0, implemented: 0, missing: 0 },
      missingItems: missingFiles,
      warnings: ['設計書ファイルが3つとも見つかりません'],
    };
  }

  // ... 既存のコード
}
```

---

### 対策3: ファイルサイズと内容チェック

**目的**: 空ファイルや虚偽の成果物を検出

**実装方法**:
1. ファイルサイズ最小値チェック（0バイトは禁止）
2. 内容の最小要件チェック（見出し、セクション数など）
3. Markdown 構文検証

**コード例**:
```typescript
private validateSpecItems(items: SpecItems, result: ValidationResult): void {
  // ★ 新規: ファイルサイズチェック
  const specPath = path.join(this.workflowDir, 'spec.md');
  if (fs.existsSync(specPath)) {
    const stat = fs.statSync(specPath);
    if (stat.size === 0) {
      result.missingItems.push({
        type: 'file',
        source: 'spec.md',
        name: 'empty-file',
        expectedPath: specPath,
      });
      result.passed = false;
      return;
    }

    // ★ 新規: 最小要件チェック（見出しが存在するか）
    const content = fs.readFileSync(specPath, 'utf-8');
    const hasHeadings = /^#+\s+/m.test(content); // Markdown見出しチェック
    if (!hasHeadings) {
      result.missingItems.push({
        type: 'file',
        source: 'spec.md',
        name: 'invalid-format',
        expectedPath: specPath,
      });
      result.passed = false;
      return;
    }
  }

  // ... 既存のコード
}
```

---

### 対策4: build_checkフェーズの編集権限明確化

**目的**: ビルド修正名目での不正編集を防止

**実装方法**:
1. `build_check` フェーズを完全読み取り専用に保つ
2. ビルドエラー修正が必要な場合は implementation フェーズに戻す
3. ドキュメントに明記

**コード例**:
```javascript
// phase-edit-guard.js: 189-195行
build_check: {
  allowed: [],  // ★ 絶対に空のまま（変更禁止）
  blocked: ['code', 'test', 'spec', 'diagram', 'config', 'env', 'other'],
  description: '★ ビルドエラーは implementation フェーズに戻して修正してください。' +
               'build_check では修正できません。',
  japaneseName: 'ビルドチェック',
  readOnly: true,  // ★ 厳格フラグ（変更禁止）
},
```

**メッセージの改善**:
```
フェーズ: build_check（ビルドチェック）
ファイル: src/example.ts
ファイルタイプ: ソースコード

理由: ビルドチェックフェーズではコード編集は禁止です。

対処方法:
  1. /workflow back で implementation フェーズに戻す
  2. コードを修正する
  3. /workflow next で refactoring フェーズへ進む
  4. 再度テストして build_check フェーズに進む

注意: ビルド修正は implementation フェーズでのみ行えます。
```

---

### 対策5: ファイル名検証と正規化

**目的**: ファイル名パターン類似による誤認を防止

**実装方法**:
1. ファイル名を正規化（lowercase, 特殊文字処理）
2. ワイルドカード検索ではなく完全一致チェック
3. バックアップファイル（`.backup`, `.bak`）を明示的に除外

**コード例**:
```typescript
validateAll(): ValidationResult {
  // ... 既存のコード

  // ★ 新規: ファイル名チェック（厳格）
  const expectedFiles = {
    'spec.md': path.join(this.workflowDir, 'spec.md'),
    'state-machine.mmd': path.join(this.workflowDir, 'state-machine.mmd'),
    'flowchart.mmd': path.join(this.workflowDir, 'flowchart.mmd'),
  };

  for (const [name, filePath] of Object.entries(expectedFiles)) {
    if (!fs.existsSync(filePath)) {
      // バックアップファイルが存在していないか確認（詐欺検出）
      const backupPattern = `${filePath}.backup`;
      if (fs.existsSync(backupPattern)) {
        result.warnings.push(
          `警告: ${backupPattern} が見つかりました（${name} ではありません）`
        );
      }
      // ファイル不足はエラー
      result.missingItems.push({
        type: 'file',
        source: 'workflow',
        name,
        expectedPath: filePath,
      });
    }
  }

  // ... 既存のコード
}
```

---

## 監査ログ

すべての脅威検出を監査ログに記録：

```json
{
  "timestamp": "2026-02-07T12:00:00Z",
  "eventType": "ARTIFACT_VALIDATION",
  "phase": "test_impl",
  "severity": "HIGH",
  "threat": "SKIP_ARTIFACT_CHECK_ATTEMPTED",
  "status": "BLOCKED",
  "details": {
    "environmentVariable": "SKIP_ARTIFACT_CHECK=true",
    "expectedBehavior": "Validation must not be skipped",
    "action": "Prevented phase transition"
  }
}
```

---

## 関連ファイルと実装方針

| 脅威 | 対象ファイル | 変更方針 | 優先度 |
|------|-----------|--------|--------|
| 脅威1 | next.ts | SKIP_ARTIFACT_CHECK を禁止化 | 高 |
| 脅威2 | design-validator.ts | ディレクトリ/ファイル不在はエラー化 | 高 |
| 脅威3 | design-validator.ts | ファイルサイズ/内容チェック追加 | 中 |
| 脅威4 | phase-edit-guard.js | build_check のドキュメント強化 | 中 |
| 脅威5 | design-validator.ts | ファイル名正規化と完全一致チェック | 低 |

---

## まとめ

成果物検証強制機能は、ワークフロー品質を守るために以下の脅威に対抗する：

1. **環境変数バイパス**: スキップフラグ禁止化により完全に阻止
2. **docsDirの操作**: ディレクトリ/ファイル不在をエラー化で検出
3. **空ファイル詐欺**: ファイルサイズと内容チェックで検出
4. **権限拡大攻撃**: build_check を読み取り専用に厳格化
5. **ファイル名偽装**: 正規化と完全一致チェックで検出

すべて「Fail Closed」原則に従い、疑わしい場合はエラー（ブロック）で対応する。

