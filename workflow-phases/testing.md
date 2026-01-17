# Testing フェーズ

## subagent実行

このフェーズは**subagentとして実行**される。

---

## 目的

全てのテストを実行し、品質を確認する。

## 入力

- タスクディレクトリ: `{workflowDir}`
- テストコード: `*.test.ts`
- テストケース設計: `test-cases.md`

## 実行手順

1. **テスト実行**

   ```bash
   pnpm test
   # または
   npm test
   ```

2. **カバレッジ確認**

   ```bash
   pnpm test --coverage
   ```

3. **結果の確認**
   - 全テストがパスすること
   - カバレッジが目標を達成していること

4. **test-cases.md の更新**
   - 実行結果を記録
   - 未実行のテストケースがあれば追加

## カバレッジ目標

| 項目       | 目標    |
| ---------- | ------- |
| Statements | 80%以上 |
| Branches   | 70%以上 |
| Functions  | 80%以上 |
| Lines      | 80%以上 |

## テスト結果の確認

### 全テストパス

```
 PASS  tests/unit/Feature.test.ts
 PASS  tests/integration/API.test.ts

Test Suites: 2 passed, 2 total
Tests:       15 passed, 15 total
```

### テスト失敗時

1. 失敗したテストを特定
2. エラーメッセージを確認
3. 実装またはテストを修正
4. 再実行

## log.md への記録

```markdown
### TESTING（テスト実行）

- テスト結果:
  - 合計: X件
  - パス: X件
  - 失敗: 0件
- カバレッジ:
  - Statements: XX%
  - Branches: XX%
  - Functions: XX%
  - Lines: XX%
- 修正した問題:
  - [問題1]: [対処]
```

## 禁止事項

- テストを削除して通す
- テストをスキップして通す
- カバレッジ目標未達で次に進む

## 完了条件

- [ ] 全テストがパスした
- [ ] カバレッジ目標を達成した
- [ ] test-cases.md を更新した
- [ ] log.md に記録した
