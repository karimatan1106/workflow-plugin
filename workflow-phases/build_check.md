# Build Check フェーズ

## subagent実行

このフェーズは**subagentとして実行**される。
**並列フェーズ (parallel_quality)** の一部として実行される。

---

## 目的

ビルドが正常に完了することを確認する。

## 入力

- タスクディレクトリ: `{workflowDir}`
- 実装コード: 前フェーズで作成したコード

## 実行手順

1. **TypeScriptビルド**

   ```bash
   pnpm run build
   # または
   npm run build
   ```

2. **型チェック**

   ```bash
   pnpm run typecheck
   # または
   npx tsc --noEmit
   ```

3. **Lint**

   ```bash
   pnpm run lint
   # または
   npx eslint .
   ```

4. **エラー修正**
   - ビルドエラーがあれば修正
   - 型エラーがあれば修正
   - Lintエラーがあれば修正

## チェックリスト

### ビルド

- [ ] TypeScriptコンパイルが成功する
- [ ] バンドルが正常に生成される
- [ ] 依存関係のエラーがない

### 型チェック

- [ ] 型エラーがない
- [ ] any型を使用していない
- [ ] 未使用の変数がない

### Lint

- [ ] ESLintエラーがない
- [ ] 警告を確認した
- [ ] フォーマットが統一されている

## log.md への記録

```markdown
### BUILD_CHECK（ビルド確認）

- ビルド結果: OK / NG
- 型チェック: OK / NG
- Lint: OK / NG
- 修正した問題:
  - [問題1]: [対処]
  - [問題2]: [対処]
```

## エラー対応

### ビルドエラー

1. エラーメッセージを確認
2. 該当ファイルを特定
3. 問題を修正
4. 再ビルド

### 型エラー

```typescript
// NG: any型
const data: any = fetchData();

// OK: 適切な型定義
interface Data {
  id: string;
  value: number;
}
const data: Data = fetchData();
```

### Lintエラー

```bash
# 自動修正
pnpm run lint --fix
```

## 禁止事項

- ビルドエラーを無視して次に進む
- any型でエラーを回避する
- eslint-disable で警告を無効化する

## 完了条件

- [ ] ビルドが成功する
- [ ] 型チェックがパスする
- [ ] Lintエラーがない
- [ ] log.md に記録した
