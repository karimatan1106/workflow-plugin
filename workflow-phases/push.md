# Push フェーズ

## subagent実行

このフェーズは**subagentとして実行**される。

---

## 目的

コミットをリモートリポジトリにプッシュする。

## 入力

- タスクディレクトリ: `{workflowDir}`
- コミット済みの変更

## 実行手順

1. **リモートの確認**

   ```bash
   git remote -v
   ```

2. **ブランチの確認**

   ```bash
   git branch -vv
   ```

3. **プッシュ**

   ```bash
   git push origin <branch-name>
   ```

4. **プッシュ結果の確認**
   - リモートに反映されているか確認

## プッシュ前チェックリスト

- [ ] ローカルのコミットが完了している
- [ ] プッシュ先のブランチが正しい
- [ ] force push が必要ないことを確認

## ブランチ戦略

### メインブランチ

- `main` または `master`: 本番環境
- `develop`: 開発環境

### 作業ブランチ

```
feature/issue-XXX-機能名
bugfix/issue-XXX-バグ名
hotfix/issue-XXX-緊急修正
```

## log.md への記録

```markdown
### PUSH（プッシュ）

- プッシュ先: origin/<branch-name>
- コミット数: X件
- 結果: 成功
```

## トラブルシューティング

### リジェクトされた場合

```bash
# リモートの変更を取り込む
git pull --rebase origin <branch-name>
# 再度プッシュ
git push origin <branch-name>
```

### コンフリクトが発生した場合

1. コンフリクトを解消
2. `git add .`
3. `git rebase --continue`
4. 再度プッシュ

## 禁止事項

- `main`/`master` への直接プッシュ（PRを使用）
- `--force` オプションの使用（特別な理由がない限り）

## 完了条件

- [ ] リモートにプッシュした
- [ ] log.md に記録した
