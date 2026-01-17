# Deploy フェーズ

## subagent実行

このフェーズは**subagentとして実行**される。

---

## 目的

変更を本番環境にデプロイする。

## 入力

- タスクディレクトリ: `{workflowDir}`
- プッシュ済みのコード

## デプロイ前チェックリスト

- [ ] 全テストがパスしている
- [ ] PRがマージされている
- [ ] 本番環境の設定が正しい
- [ ] ロールバック手順を確認した

## 実行手順（プロジェクトに応じてカスタマイズ）

### 1. デプロイ準備

```bash
# 本番ブランチに切り替え
git checkout main
git pull origin main
```

### 2. ビルド

```bash
pnpm run build
```

### 3. デプロイ実行

```bash
# 例: サーバーレスフレームワーク
serverless deploy --stage production

# 例: Docker
docker build -t app:latest .
docker push registry/app:latest

# 例: Vercel
vercel --prod
```

### 4. 動作確認

- [ ] アプリケーションが起動している
- [ ] 主要機能が動作する
- [ ] エラーログを確認

## ロールバック手順

問題が発生した場合：

```bash
# 前のバージョンに戻す
git revert HEAD
git push origin main

# または前のデプロイに戻す
serverless rollback --timestamp <timestamp>
```

## log.md への記録

```markdown
### DEPLOY（デプロイ）

- デプロイ先: [環境名]
- デプロイ日時: YYYY-MM-DD HH:MM
- デプロイ方法: [方法]
- 結果: 成功/失敗
- 動作確認:
  - アプリケーション起動: OK
  - 主要機能動作: OK
  - エラーログ: なし
```

## デプロイ後の確認

### 必須確認項目

- [ ] アプリケーションが正常に起動
- [ ] ヘルスチェックが通る
- [ ] 主要なAPIが動作する
- [ ] エラーレートが増加していない

### モニタリング

- エラーログを監視
- パフォーマンスメトリクスを確認
- アラートを確認

## 禁止事項

- テストなしでデプロイ
- 動作確認なしで完了
- 問題発生時のロールバック手順の省略

## 完了条件

- [ ] デプロイが成功した
- [ ] 動作確認が完了した
- [ ] log.md に記録した
- [ ] モニタリングを開始した
