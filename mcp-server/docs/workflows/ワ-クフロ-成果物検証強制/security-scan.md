# security_scanサブフェーズ - セキュリティ分析レポート

**作成日**: 2026-02-07
**対象**: ワークフロー成果物検証強制機能実装
**分析対象ファイル**: 3ファイル

---

## 実行サマリー

| 項目 | 評価 | 詳細 |
|------|------|------|
| パストラバーサル脆弱性 | ✅ 問題なし | 入力パスのサニタイズは適切 |
| 入力バリデーション | ⚠️ 注意 | 環境変数によるスキップは慎重な設計 |
| セキュアなエラーハンドリング | ✅ 問題なし | 詳細エラー情報は適切に制限 |
| 環境変数管理 | ⚠️ 注意 | `SKIP_ARTIFACT_CHECK` の実装に懸念あり |
| ファイル存在チェック信頼性 | ✅ 問題なし | 同期I/Oで安全に実装 |

**全体リスク評価**: **低～中**

---

## 詳細分析

### 1. `src/tools/next.ts` - フェーズ遷移ツール

#### 1.1 パストラバーサル脆弱性

**評価**: ✅ **問題なし**

```typescript
// Line 193-200: 成果物存在チェック
const artifactDocsDir = taskState.docsDir || taskState.workflowDir;
const missingArtifacts = checkPhaseArtifacts(currentPhase, artifactDocsDir);
if (missingArtifacts.length > 0) {
  return {
    success: false,
    message: `${currentPhase}フェーズの必須成果物が未作成です: ${missingArtifacts.join(', ')}\n出力先: ${artifactDocsDir}/`,
  };
}
```

**理由**:
- `docsDir` / `workflowDir` は `taskState` から直接取得（ユーザー入力ではない）
- `path.join()` で結合されており、パストトラバーサルシーケンス（`../`）も自動的に正規化される
- `fs.existsSync()` のチェック対象はシステムファイルなので、存在しないパスは単に `false` を返す

#### 1.2 入力バリデーション

**評価**: ⚠️ **注意あり**

```typescript
// Line 43-52: checkPhaseArtifacts 関数
function checkPhaseArtifacts(phase: PhaseName, docsDir: string): string[] {
  if (process.env.SKIP_ARTIFACT_CHECK === 'true') {
    return [];  // ← スキップフラグで全チェック無効化
  }
  const artifacts = PHASE_REQUIRED_ARTIFACTS[phase];
  if (!artifacts) {
    return [];
  }
  return artifacts.filter(f => !fs.existsSync(path.join(docsDir, f)));
}
```

**懸念点**:
1. **`SKIP_ARTIFACT_CHECK` フラグの動作**
   - 環境変数で成果物チェックを完全スキップ可能
   - ワークフロー品質管理の重要な検証ロジックがバイパス可能
   - 開発環境でのテスト目的には合理的だが、本番環境では危険

**改善提案**:
```typescript
// 監査ログを記録してからスキップ
if (process.env.SKIP_ARTIFACT_CHECK === 'true') {
  console.warn('[AUDIT] 成果物チェックがスキップされました');
  console.warn(`[AUDIT] フェーズ: ${phase}, ディレクトリ: ${docsDir}`);
  return [];
}
```

#### 1.3 設計-実装整合性チェック

**評価**: ✅ **設計は適切**

```typescript
// Line 60-84: performDesignValidation 関数
function performDesignValidation(docsDir: string): NextResult | null {
  if (process.env.SKIP_DESIGN_VALIDATION) {
    return null;
  }

  const validator = new DesignValidator(docsDir);
  const validationResult = validator.validateAll();

  if (!validationResult.passed) {
    const strict = process.env.VALIDATE_DESIGN_STRICT !== 'false';

    if (strict) {
      return {
        success: false,
        message: formatValidationError(validationResult),
      };
    } else {
      // 警告モード
      console.warn('[設計検証] 警告モード - 未実装項目があります');
      console.warn(formatValidationError(validationResult));
    }
  }

  return null;
}
```

**利点**:
- 厳格モード（デフォルト）と警告モードの2段階設計
- エラー時は詳細なメッセージを返す
- スキップ時でも他のフェーズ遷移ロジックは実行される（全スキップではない）

#### 1.4 エラーハンドリング

**評価**: ✅ **問題なし**

```typescript
// Line 94-97: タスク取得エラー処理
const result = getTaskByIdOrError(taskId);
if ('error' in result) {
  return result.error as NextResult;  // 即座に返す
}
```

**セキュリティ面での評価**:
- エラーメッセージに機密情報が露出していない
- スタックトレースも返さない
- ユーザーフレンドリーなメッセージ

---

### 2. `src/tools/complete-sub.ts` - サブフェーズ完了ツール

#### 2.1 パストラバーサル脆弱性

**評価**: ✅ **問題なし**

```typescript
// Line 43-52: checkSubPhaseArtifacts 関数
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

**理由**: `next.ts` と同じ理由で問題なし

#### 2.2 入力バリデーション

**評価**: ✅ **良好**

```typescript
// Line 68-72: サブフェーズ名の検証
const validation = validateRequiredString(subPhase, MISSING_PARAM_ERRORS.SUB_PHASE);
if ('error' in validation) {
  return validation.error as CompleteSubResult;
}

// Line 86-92: 有効なサブフェーズのチェック
const validSubPhases = PARALLEL_GROUPS[currentPhase] || [];
if (!validSubPhases.includes(validation.value as SubPhaseName)) {
  return {
    success: false,
    message: invalidValueError('サブフェーズ', validation.value, validSubPhases),
  };
}
```

**強み**:
1. **必須フィールド検証**: `validateRequiredString()` で `null/undefined` をチェック
2. **ホワイトリスト方式**: `PARALLEL_GROUPS` から有効な値を取得して比較
3. **型安全性**: TypeScript の `SubPhaseName` 型で文字列リテラルを制限

#### 2.3 依存関係チェック

**評価**: ✅ **設計が厳密**

```typescript
// Line 94-110: 依存関係の検証
const subPhaseName = validation.value as SubPhaseName;
const dependencies = getSubPhaseDependencies(currentPhase, subPhaseName);

if (dependencies.length > 0) {
  const currentSubPhases = taskState.subPhases || {};
  const incompleteDeps = dependencies.filter(
    dep => currentSubPhases[dep as SubPhaseName] !== 'completed'
  );

  if (incompleteDeps.length > 0) {
    return {
      success: false,
      message: `${subPhaseName}を完了するには、以下のサブフェーズが先に完了している必要があります: ${incompleteDeps.join(', ')}`,
    };
  }
}
```

**セキュリティ面での評価**:
- 依存関係の検証はビジネスロジックレベルで重要
- 状態管理を信頼して比較（同期的で原子性がある）

#### 2.4 成果物チェック

**評価**: ⚠️ **同じ懸念あり**

```typescript
// Line 112-120: 成果物チェック
const docsDir = taskState.docsDir || taskState.workflowDir;
const missingArtifacts = checkSubPhaseArtifacts(subPhaseName, docsDir);
if (missingArtifacts.length > 0) {
  return {
    success: false,
    message: `${subPhaseName}の必須成果物が未作成です: ${missingArtifacts.join(', ')}\n出力先: ${docsDir}/`,
  };
}
```

`SKIP_ARTIFACT_CHECK` による無効化が可能（`next.ts` と同じ懸念）

---

### 3. `src/validation/design-validator.ts` - 設計検証クラス

#### 3.1 パストトラバーサル脆弱性

**評価**: ⚠️ **中程度のリスク**

```typescript
// Line 41-44: コンストラクタ
constructor(workflowDir: string, projectRoot?: string) {
  this.workflowDir = workflowDir;
  this.projectRoot = projectRoot || process.cwd();  // ← projectRoot は外部指定可能
}

// Line 150: ファイルパスの結合
const fullPath = path.join(this.projectRoot, filePath);
if (!fs.existsSync(fullPath)) { ... }
```

**潜在的な脆弱性**:
```typescript
// 悪意のある呼び出し例
const validator = new DesignValidator(
  '/docs/',
  '/tmp'  // ← projectRoot に任意のディレクトリを指定
);
```

**ただし**:
1. `validateAll()` は呼び出し側が `docsDir` または `workflowDir` を指定
2. `spec.md` のパース結果から抽出した `filePaths` を使用
3. `filePaths` 自体がユーザー入力ではなく設計書由来

**改善提案**:
```typescript
constructor(workflowDir: string, projectRoot?: string) {
  // projectRoot は相対パスを許可しない
  if (projectRoot && !path.isAbsolute(projectRoot)) {
    throw new Error('projectRoot は絶対パスで指定してください');
  }
  this.workflowDir = workflowDir;
  this.projectRoot = projectRoot || process.cwd();
}
```

#### 3.2 ファイル読み込みの安全性

**評価**: ⚠️ **DOSリスク**

```typescript
// Line 115-119: spec.md の読み込み
if (fs.existsSync(specPath)) {
  const specContent = fs.readFileSync(specPath, 'utf-8');  // ← 同期読み込み
  const specItems = parseSpec(specContent);
  this.validateSpecItems(specItems, result);
}
```

**懸念点**:
1. **大容量ファイル対応**: `readFileSync()` で大きなファイルを読むとメモリ逼迫
2. **同期I/O**: ワークフロー処理を阻止する可能性
3. ファイルサイズチェックなし

**改善提案**:
```typescript
// ファイルサイズ制限を追加
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const stat = fs.statSync(specPath);
if (stat.size > MAX_FILE_SIZE) {
  throw new Error(`ファイルサイズが大きすぎます: ${specPath} (${stat.size} bytes)`);
}
```

#### 3.3 コメント・文字列除去の正規表現

**評価**: ✅ **実装は堅牢**

```typescript
// Line 231-243: removeCommentsAndStrings 関数
private removeCommentsAndStrings(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')      // ブロックコメント
    .replace(/\/\/.*/g, '')                 // 行コメント
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')   // ダブルクォート文字列
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")   // シングルクォート文字列
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');  // テンプレートリテラル
}
```

**セキュリティ評価**:
- 正規表現は一般的で安全なパターン
- バックスラッシュエスケープを正しく処理
- ReDoS（正規表現DoS）のリスクは低い

#### 3.4 正規表現エスケープ

**評価**: ✅ **適切**

```typescript
// Line 251-253: escapeRegExp 関数
private escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

**検証**:
- クラス名やメソッド名を正規表現に使用する前にエスケープ
- 特殊文字を含む識別子に対応

#### 3.5 ファイルアクセス制御

**評価**: ⚠️ **パーミッションチェックなし**

```typescript
// Line 264-278: searchInFiles 関数
private searchInFiles(patterns: RegExp[], filePaths: string[]): boolean {
  for (const filePath of filePaths) {
    const fullPath = path.join(this.projectRoot, filePath);
    if (fs.existsSync(fullPath)) {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) continue;
      const content = fs.readFileSync(fullPath, 'utf-8');  // ← パーミッション無視
      // ...
    }
  }
  return false;
}
```

**懸念点**:
- `.readFileSync()` はファイルの読み取り権限をチェックしない
- ただし、Node.js 実行ユーザーのパーミッションで制御される

**改善提案**:
```typescript
// 読み取り権限を事前確認
const stat = fs.statSync(fullPath);
const isReadable = (stat.mode & fs.constants.S_IRUSR) !== 0;
if (!isReadable) {
  console.warn(`[WARN] ファイルが読み取り不可: ${fullPath}`);
  continue;
}
const content = fs.readFileSync(fullPath, 'utf-8');
```

---

## 環境変数に関するセキュリティ分析

### `SKIP_ARTIFACT_CHECK`

**リスク レベル**: ⚠️ **中程度**

```typescript
// 複数の場所で使用されている
if (process.env.SKIP_ARTIFACT_CHECK === 'true') {
  return [];  // チェック完全スキップ
}
```

**懸念点**:
1. **品質検証の完全スキップ**: ワークフロー管理の中核ロジックが無視可能
2. **監査証跡なし**: いつ、だれが、なぜスキップしたか追跡不可
3. **デフォルト値の危険性**: `undefined` は `'true'` と比較して `false` になる（これは正しい）

**改善提案**:
```typescript
// スキップ時に監査ログを記録
function checkPhaseArtifacts(phase: PhaseName, docsDir: string): string[] {
  if (process.env.SKIP_ARTIFACT_CHECK === 'true') {
    const timestamp = new Date().toISOString();
    const skipLog = `[${timestamp}] SKIP_ARTIFACT_CHECK=${process.env.SKIP_ARTIFACT_CHECK} for phase=${phase}`;
    console.warn(`[AUDIT] ${skipLog}`);
    return [];
  }
  // ...
}
```

### `SKIP_DESIGN_VALIDATION`

**リスク レベル**: ⚠️ **中程度**

```typescript
if (process.env.SKIP_DESIGN_VALIDATION) {  // ← 'true' との比較がない
  return null;
}
```

**脆弱性**:
```typescript
// 危険: 任意の値で無効化されてしまう
process.env.SKIP_DESIGN_VALIDATION = 'false'  // → truthy → スキップ
process.env.SKIP_DESIGN_VALIDATION = '0'      // → truthy → スキップ
process.env.SKIP_DESIGN_VALIDATION = 'no'     // → truthy → スキップ
```

**改善提案**:
```typescript
const skipValidation = process.env.SKIP_DESIGN_VALIDATION === 'true';
if (skipValidation) {
  console.warn('[AUDIT] 設計-実装整合性検証がスキップされました');
  return null;
}
```

### `VALIDATE_DESIGN_STRICT`

**リスク レベル**: ✅ **低**

```typescript
const strict = process.env.VALIDATE_DESIGN_STRICT !== 'false';  // デフォルト: 厳格
```

**利点**:
- デフォルトは `true`（厳格モード）
- 明示的に `false` を指定しない限り有効
- 安全なデフォルト設定

---

## その他のセキュリティ考慮事項

### 1. エラーメッセージからの情報漏洩

**評価**: ✅ **問題なし**

```typescript
// サンプル
message: `${currentPhase}フェーズの必須成果物が未作成です: ${missingArtifacts.join(', ')}`
```

**なぜ問題ないか**:
- フェーズ名：公開情報（ワークフロー定義）
- ファイル名：ドキュメント相対パス（プロジェクト構造で予測可能）
- 絶対パスは明示していない

### 2. 外部ライブラリの依存性

```typescript
import * as fs from 'fs';      // Node.js 標準
import * as path from 'path';  // Node.js 標準
```

**評価**: ✅ **安全** - 標準ライブラリのみ使用

### 3. 型安全性

```typescript
type PhaseName = 'research' | 'requirements' | ... // 文字列リテラル型
type SubPhaseName = 'threat_modeling' | 'planning' | ...
```

**評価**: ✅ **優秀** - TypeScript 型チェックでランタイムエラーを事前防止

---

## まとめ

### 発見された脆弱性

| # | カテゴリ | ファイル | 重要度 | 改善内容 |
|---|---------|---------|--------|----------|
| 1 | 環境変数フラグ | next.ts, complete-sub.ts | 中 | `SKIP_ARTIFACT_CHECK` に監査ログを追加 |
| 2 | 環境変数フラグ | next.ts | 中 | `SKIP_DESIGN_VALIDATION` の比較値を 'true' に限定 |
| 3 | パストトラバーサル | design-validator.ts | 低 | projectRoot に絶対パス検証を追加 |
| 4 | ファイルサイズ | design-validator.ts | 低 | readFileSync() 前にサイズチェックを追加 |
| 5 | ファイルパーミッション | design-validator.ts | 低 | ファイルアクセス権を事前確認 |

### 全体的な評価

**セキュリティ方針**: ⭐ **良好**
**実装品質**: ⭐⭐⭐ **高**
**改善の余地**: ⭐ **低～中**

---

## 推奨事項

### 優先度高

1. **環境変数スキップ機能に監査ログを追加**
   ```typescript
   function logSkip(reason: string, details: object) {
     console.warn(`[AUDIT] ${reason}`, JSON.stringify(details));
   }
   ```

2. **`SKIP_DESIGN_VALIDATION` の比較を厳密に**
   ```typescript
   const skipValidation = process.env.SKIP_DESIGN_VALIDATION === 'true';
   ```

### 優先度中

3. **projectRoot の入力値検証**
   ```typescript
   if (projectRoot && !path.isAbsolute(projectRoot)) {
     throw new Error('projectRoot は絶対パスで指定してください');
   }
   ```

4. **ファイルサイズ上限の設定**
   - spec.md: 5MB
   - state-machine.mmd: 1MB
   - flowchart.mmd: 1MB

### 優先度低

5. **パーミッションチェックの追加**（オプション）
6. **非同期I/O への移行の検討**

---

## テスト推奨事項

```typescript
describe('Security Tests', () => {
  test('パストトラバーサル試行をブロック', () => {
    const validator = new DesignValidator('/docs/', '../../../etc');
    // 相対パスの projectRoot を拒否
    expect(() => validator.validateAll()).toThrow();
  });

  test('SKIP_ARTIFACT_CHECK フラグの監査ログを記録', () => {
    process.env.SKIP_ARTIFACT_CHECK = 'true';
    const result = checkPhaseArtifacts('requirements', '/docs/');
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[AUDIT]'));
  });

  test('SKIP_DESIGN_VALIDATION は "true" 時のみスキップ', () => {
    process.env.SKIP_DESIGN_VALIDATION = 'false';
    const result = performDesignValidation('/docs/');
    // スキップされない（null ではなく検証結果を返す）
    expect(result).not.toBeNull();
  });
});
```

---

## 監査ステータス

| 項目 | ステータス | 署名 |
|------|-----------|------|
| コード分析 | ✅ 完了 | Security Scan Agent |
| 脆弱性検出 | 5件発見（2件重要度中、3件低） | |
| 改善案提示 | ✅ 完了 | |
| 本番デプロイ許可 | ✅ 許可 | 推奨改善後 |

**本レポートは security_scan サブフェーズの成果物です。**
