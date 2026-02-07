# 要件定義書: ワークフロー成果物検証強制

## タスク概要

ワークフローの各フェーズ・サブフェーズで必要な成果物ファイルの存在を強制し、未作成のままフェーズ遷移できないようにする。

---

## REQ-1: フェーズ遷移時の成果物存在チェック

### 要件ID
REQ-1

### タイトル
フェーズ遷移時の必須成果物ファイル存在検証

### 現状の問題
- `workflow_next()` 実行時に、前フェーズで作成すべき成果物ファイルが存在しなくてもフェーズ遷移できてしまう
- 調査フェーズで research.md を作成せずに requirements フェーズに進める
- 要件定義フェーズで requirements.md を作成せずに parallel_analysis に進める
- 成果物なしで次フェーズに進むと、後続フェーズで必要な情報が欠落する

### 解決策

#### 実装内容
`src/backend/application/use-cases/workflow/commands/next.ts` の `workflowNext()` に以下のチェックを追加:

1. **フェーズごとの必須成果物マッピング**
   ```typescript
   const REQUIRED_ARTIFACTS: Record<string, string[]> = {
     'research': ['research.md'],
     'requirements': ['requirements.md'],
     'test_design': ['test-design.md'],
     // parallel_* は各サブフェーズ側で検証するためここではチェックなし
   };
   ```

2. **検証ロジック**
   ```typescript
   // 環境変数でスキップ可能
   if (process.env.SKIP_ARTIFACT_CHECK === 'true') {
     logger.warn('成果物検証をスキップしました（SKIP_ARTIFACT_CHECK=true）');
     // 監査ログに記録
     return; // スキップ
   }

   const requiredFiles = REQUIRED_ARTIFACTS[currentPhase];
   if (!requiredFiles) return; // このフェーズはチェック対象外

   const docsDir = path.join(workflowDir, '..', '..', 'workflows', taskName);
   const missingFiles: string[] = [];

   for (const file of requiredFiles) {
     const filePath = path.join(docsDir, file);
     if (!fs.existsSync(filePath)) {
       missingFiles.push(file);
     }
   }

   if (missingFiles.length > 0) {
     throw new Error(
       `${currentPhase}フェーズの必須成果物が作成されていません:\n` +
       missingFiles.map(f => `- ${f}`).join('\n') + '\n\n' +
       `成果物を作成してから /workflow next を実行してください。\n` +
       `出力先: ${docsDir}/`
     );
   }
   ```

3. **docsDir 解決**
   - `workflowDir` から相対パスで `docs/workflows/{taskName}/` を解決
   - 環境変数 `DOCS_DIR` が設定されている場合はそちらを優先

### 受け入れ基準（AC）

- [ ] research フェーズで research.md がない場合、`/workflow next` がエラーで中断する
- [ ] requirements フェーズで requirements.md がない場合、`/workflow next` がエラーで中断する
- [ ] test_design フェーズで test-design.md がない場合、`/workflow next` がエラーで中断する
- [ ] エラーメッセージに「どのファイルが必要か」「どこに配置すべきか」が明記される
- [ ] `SKIP_ARTIFACT_CHECK=true` を設定すると検証がスキップされ、警告ログが出力される
- [ ] スキップ時は監査証跡として記録される
- [ ] parallel_* フェーズは next.ts ではチェックせず、サブフェーズ完了時に検証する

### 影響ファイル
- `src/backend/application/use-cases/workflow/commands/next.ts`
- （テスト追加）`src/backend/tests/integration/workflow-artifact-check.test.ts`

---

## REQ-2: サブフェーズ完了時の成果物検証

### 要件ID
REQ-2

### タイトル
並列フェーズのサブフェーズ完了時の必須成果物検証

### 現状の問題
- `workflow_complete_sub()` 実行時に、サブフェーズで作成すべき成果物ファイルが存在しなくても完了できる
- threat_modeling で threat-model.md がなくても完了できる
- planning で spec.md がなくても完了できる
- state_machine で state-machine.mmd がなくても完了できる
- flowchart で flowchart.mmd がなくても完了できる
- ui_design で ui-design.md がなくても完了できる
- code_review で code-review.md がなくても完了できる

### 解決策

#### 実装内容
`src/backend/application/use-cases/workflow/commands/complete-sub.ts` の `workflowCompleteSub()` に以下のチェックを追加:

1. **サブフェーズごとの必須成果物マッピング**
   ```typescript
   const REQUIRED_SUB_ARTIFACTS: Record<string, string[]> = {
     'threat_modeling': ['threat-model.md'],
     'planning': ['spec.md'],
     'state_machine': ['state-machine.mmd'],
     'flowchart': ['flowchart.mmd'],
     'ui_design': ['ui-design.md'],
     'code_review': ['code-review.md'],
     // 以下は実行ベースのためファイル不要
     // 'build_check': [],
     // 'manual_test': [],
     // 'security_scan': [],
     // 'performance_test': [],
     // 'e2e_test': [],
   };
   ```

2. **検証ロジック**
   ```typescript
   // 環境変数でスキップ可能
   if (process.env.SKIP_ARTIFACT_CHECK === 'true') {
     logger.warn(`サブフェーズ ${subphase} の成果物検証をスキップしました（SKIP_ARTIFACT_CHECK=true）`);
     // 監査ログに記録
     return; // スキップ
   }

   const requiredFiles = REQUIRED_SUB_ARTIFACTS[subphase];
   if (!requiredFiles || requiredFiles.length === 0) {
     // このサブフェーズはファイルチェック不要（実行ベース）
     return;
   }

   const docsDir = path.join(workflowDir, '..', '..', 'workflows', taskName);
   const missingFiles: string[] = [];

   for (const file of requiredFiles) {
     const filePath = path.join(docsDir, file);
     if (!fs.existsSync(filePath)) {
       missingFiles.push(file);
     }
   }

   if (missingFiles.length > 0) {
     throw new Error(
       `${subphase} サブフェーズの必須成果物が作成されていません:\n` +
       missingFiles.map(f => `- ${f}`).join('\n') + '\n\n' +
       `成果物を作成してから /workflow complete-sub ${subphase} を実行してください。\n` +
       `出力先: ${docsDir}/`
     );
   }
   ```

3. **docsDir 解決**
   - REQ-1 と同じ方法で `docs/workflows/{taskName}/` を解決

### 受け入れ基準（AC）

- [ ] threat_modeling で threat-model.md がない場合、`/workflow complete-sub threat_modeling` がエラーで中断する
- [ ] planning で spec.md がない場合、`/workflow complete-sub planning` がエラーで中断する
- [ ] state_machine で state-machine.mmd がない場合、`/workflow complete-sub state_machine` がエラーで中断する
- [ ] flowchart で flowchart.mmd がない場合、`/workflow complete-sub flowchart` がエラーで中断する
- [ ] ui_design で ui-design.md がない場合、`/workflow complete-sub ui_design` がエラーで中断する
- [ ] code_review で code-review.md がない場合、`/workflow complete-sub code_review` がエラーで中断する
- [ ] build_check, manual_test, security_scan, performance_test, e2e_test は成果物チェックされない（実行ベース）
- [ ] エラーメッセージに「どのファイルが必要か」「どこに配置すべきか」が明記される
- [ ] `SKIP_ARTIFACT_CHECK=true` を設定すると検証がスキップされ、警告ログが出力される
- [ ] スキップ時は監査証跡として記録される

### 影響ファイル
- `src/backend/application/use-cases/workflow/commands/complete-sub.ts`
- （テスト追加）`src/backend/tests/integration/workflow-subphase-artifact-check.test.ts`

---

## REQ-3: design-validator.tsの「なければスキップ」を「なければブロック」に変更

### 要件ID
REQ-3

### タイトル
設計書未作成時に検証をスキップせずブロックする

### 現状の問題
- `design-validator.ts` L93-98 で設計書ファイルが存在しない場合、`passed: true` を返して検証をスキップしている
- これにより設計書なしで implementation フェーズに進める
- workflowDir が存在しない場合（L71-75）も同様に `passed: true` でスキップしている
- CLAUDE.md の方針「設計書を書く前に実装を始めてはいけない」に違反する可能性がある

### 解決策

#### 実装内容
`src/backend/infrastructure/validators/design-validator.ts` を以下のように修正:

1. **L71-75 の workflowDir 不存在チェック**
   ```typescript
   // 修正前
   if (!fs.existsSync(workflowDir)) {
     return {
       passed: true, // ← これを false に変更
       message: 'ワークフローディレクトリが存在しません - 検証をスキップします',
     };
   }

   // 修正後
   if (!fs.existsSync(workflowDir)) {
     return {
       passed: false, // ← ブロックする
       message: `ワークフローディレクトリが存在しません: ${workflowDir}\n` +
                'ワークフローを開始してから実装してください。',
       errors: ['ワークフローディレクトリ未作成'],
     };
   }
   ```

2. **L93-98 の設計書ファイル不存在チェック**
   ```typescript
   // 修正前
   for (const file of designFiles) {
     const filePath = path.join(docsDir, file);
     if (!fs.existsSync(filePath)) {
       return {
         passed: true, // ← これを false に変更
         message: `設計書がありません (${file}) - 検証をスキップします`,
       };
     }
   }

   // 修正後
   const missingFiles: string[] = [];
   for (const file of designFiles) {
     const filePath = path.join(docsDir, file);
     if (!fs.existsSync(filePath)) {
       missingFiles.push(file);
     }
   }

   if (missingFiles.length > 0) {
     return {
       passed: false, // ← ブロックする
       message: '以下の設計書が作成されていません:\n' +
                missingFiles.map(f => `- ${f}`).join('\n') + '\n\n' +
                '設計フェーズで成果物を作成してから実装してください。',
       errors: missingFiles,
     };
   }
   ```

3. **環境変数による緊急スキップ**
   - `SKIP_DESIGN_VALIDATION=true` の場合は従来通りスキップ
   - スキップ時は警告ログと監査証跡を出力

### 受け入れ基準（AC）

- [ ] workflowDir が存在しない場合、設計検証が `passed: false` でブロックする
- [ ] spec.md が存在しない場合、設計検証が `passed: false` でブロックする
- [ ] state-machine.mmd が存在しない場合、設計検証が `passed: false` でブロックする
- [ ] flowchart.mmd が存在しない場合、設計検証が `passed: false` でブロックする
- [ ] ui-design.md が存在しない場合、設計検証が `passed: false` でブロックする
- [ ] エラーメッセージに「どのファイルが足りないか」が明記される
- [ ] `SKIP_DESIGN_VALIDATION=true` を設定すると検証がスキップされる
- [ ] スキップ時は警告ログと監査証跡が出力される

### 影響ファイル
- `src/backend/infrastructure/validators/design-validator.ts`
- （テスト修正）`src/backend/tests/unit/design-validator.test.ts`

---

## REQ-4: build_checkのhookルール修正

### 要件ID
REQ-4

### タイトル
build_check フェーズでコード編集を許可する

### 現状の問題
- `.mcp/hooks/phase-edit-guard.js` の build_check ルールが以下の設定になっている:
  ```javascript
  build_check: { allowed: [], readOnly: true }
  ```
- これによりビルドエラー発生時に修正コードを編集できない
- CLAUDE.md では「build_check: 全て（ビルド修正用）」と記載されている
- 実際のワークフローではビルドエラー修正のためにコード編集が必要

### 解決策

#### 実装内容
`.mcp/hooks/phase-edit-guard.js` の build_check ルールを以下に変更:

```javascript
// 修正前
build_check: { allowed: [], readOnly: true },

// 修正後
build_check: { allowed: ['code', 'test', 'spec', 'config', 'env'] },
```

**変更内容:**
1. `allowed: []` → `allowed: ['code', 'test', 'spec', 'config', 'env']` に変更
2. `readOnly: true` を削除

**許可される編集:**
- `code`: ソースコード（.ts, .tsx, .js, .jsx 等）
- `test`: テストファイル（.test.ts, .spec.ts 等）
- `spec`: 仕様書（.md, .mmd 等）
- `config`: 設定ファイル（tsconfig.json, package.json 等）
- `env`: 環境変数ファイル（.env 等）

### 受け入れ基準（AC）

- [ ] build_check フェーズでソースコードを編集できる
- [ ] build_check フェーズでテストファイルを編集できる
- [ ] build_check フェーズで設定ファイルを編集できる
- [ ] build_check フェーズで仕様書を編集できる
- [ ] build_check フェーズで環境変数ファイルを編集できる
- [ ] CLAUDE.md の「build_check: 全て（ビルド修正用）」と一致する
- [ ] 既存のフェーズ編集制限（implementation でテスト編集禁止等）に影響しない

### 影響ファイル
- `.mcp/hooks/phase-edit-guard.js`

---

## 全体影響範囲

### 影響を受けるファイル一覧
1. `src/backend/application/use-cases/workflow/commands/next.ts` (REQ-1)
2. `src/backend/application/use-cases/workflow/commands/complete-sub.ts` (REQ-2)
3. `src/backend/infrastructure/validators/design-validator.ts` (REQ-3)
4. `.mcp/hooks/phase-edit-guard.js` (REQ-4)
5. （テスト追加）`src/backend/tests/integration/workflow-artifact-check.test.ts`
6. （テスト追加）`src/backend/tests/integration/workflow-subphase-artifact-check.test.ts`
7. （テスト修正）`src/backend/tests/unit/design-validator.test.ts`

### 依存関係
- REQ-1, REQ-2 は独立して実装可能
- REQ-3 は独立して実装可能（design-validator.ts のみ）
- REQ-4 は独立して実装可能（hooks のみ）
- 全ての要件が実装されて初めて「成果物なしでフェーズ遷移できない」体制が完成する

### 後方互換性
- 環境変数 `SKIP_ARTIFACT_CHECK=true` でチェックをスキップ可能（既存動作を維持）
- 環境変数 `SKIP_DESIGN_VALIDATION=true` で設計検証をスキップ可能
- スキップ時は監査証跡として記録されるため、後から追跡可能

---

## 非機能要件

### エラーメッセージの品質
- **具体性**: 「どのファイルが足りないか」を明記
- **行動可能性**: 「どこに配置すべきか」「次に何をすべきか」を明記
- **多言語対応**: 日本語メッセージ（CLAUDE.md に準拠）

### ログ出力
- スキップ時は必ず警告ログを出力
- 監査証跡として記録（タイムスタンプ、タスクID、スキップ理由）

### テストカバレッジ
- 統合テストで各エラーケースをカバー
- 環境変数スキップのテストも含める

---

## 受け入れテストシナリオ

### シナリオ1: research フェーズで成果物なし
1. `/workflow start test-task` でタスク開始
2. research.md を作成せずに `/workflow next` を実行
3. **期待結果**: エラーで中断、「research.md が必要」と表示される

### シナリオ2: threat_modeling サブフェーズで成果物なし
1. parallel_analysis フェーズに到達
2. threat-model.md を作成せずに `/workflow complete-sub threat_modeling` を実行
3. **期待結果**: エラーで中断、「threat-model.md が必要」と表示される

### シナリオ3: 設計書なしで implementation
1. design_review をスキップ（テスト環境）
2. 設計書を作成せずに implementation フェーズに到達
3. コード編集を試みる
4. **期待結果**: design-validator.ts がブロック、「設計書を作成してください」と表示される

### シナリオ4: build_check でビルドエラー修正
1. build_check フェーズに到達
2. ビルドエラーが検出される
3. ソースコードを編集してエラー修正
4. **期待結果**: コード編集が許可され、修正可能

### シナリオ5: 環境変数でスキップ
1. `SKIP_ARTIFACT_CHECK=true` を設定
2. 成果物なしで `/workflow next` を実行
3. **期待結果**: 警告ログが出力され、フェーズ遷移が許可される

---

## まとめ

本要件定義により、以下を実現する:

1. **成果物の強制**: 各フェーズで必須ファイルがない場合は次に進めない
2. **設計ファースト**: 設計書なしで実装フェーズに進めない
3. **ビルド修正の柔軟性**: build_check でコード編集を許可
4. **緊急スキップ**: 環境変数で検証をスキップ可能（監査証跡あり）

これにより、CLAUDE.md で定義されたワークフロー規律が技術的に強制され、品質の高い開発プロセスが保証される。
