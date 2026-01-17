# ブランチ戦略

## 概要

このドキュメントは、プロジェクトのブランチ戦略を定義します。

## ブランチの種類

### メインブランチ

| ブランチ  | 用途             | 保護             |
| --------- | ---------------- | ---------------- |
| `main`    | 本番環境コード   | 直接プッシュ禁止 |
| `develop` | 開発統合ブランチ | オプション       |

### 作業ブランチ

| プレフィックス | 用途             | 例                                |
| -------------- | ---------------- | --------------------------------- |
| `feature/`     | 新機能           | `feature/issue-123-user-auth`     |
| `bugfix/`      | バグ修正         | `bugfix/issue-456-login-error`    |
| `hotfix/`      | 緊急修正         | `hotfix/issue-789-security-patch` |
| `refactor/`    | リファクタリング | `refactor/cleanup-api-handlers`   |
| `docs/`        | ドキュメント     | `docs/update-readme`              |

## ブランチ命名規則

```
<type>/issue-<number>-<description>
```

### ルール

1. 全て小文字
2. 単語はハイフンで区切る
3. Issue番号を含める（ある場合）
4. 簡潔な説明を付ける

### 例

```
feature/issue-123-add-user-authentication
bugfix/issue-456-fix-null-pointer-exception
hotfix/issue-789-patch-sql-injection
refactor/cleanup-legacy-code
docs/update-api-documentation
```

## ワークフロー

### 1. ブランチ作成

```bash
# mainを最新化
git checkout main
git pull origin main

# 作業ブランチを作成
git checkout -b feature/issue-123-description
```

### 2. 作業とコミット

```bash
# 変更をステージング
git add .

# コミット
git commit -m "feat(scope): 説明"
```

### 3. プッシュ

```bash
git push -u origin feature/issue-123-description
```

### 4. プルリクエスト

- GitHub/GitLabでPRを作成
- レビューを依頼
- CIが通ることを確認

### 5. マージ

- レビュー承認後にマージ
- Squash merge を推奨
- マージ後にブランチを削除

## プルリクエストのルール

### タイトル

```
[type]: 簡潔な説明 (#issue番号)
```

### 説明

```markdown
## 概要

何を変更したか

## 変更内容

- 変更点1
- 変更点2

## テスト

- [ ] ユニットテスト
- [ ] 統合テスト

## 関連Issue

Closes #123
```

### レビュー

- 最低1人のレビュー承認が必要
- CI（ビルド、テスト）が通ること
- コンフリクトがないこと

## コンフリクト解消

```bash
# mainを最新化
git checkout main
git pull origin main

# 作業ブランチに戻る
git checkout feature/issue-123-description

# リベース
git rebase main

# コンフリクト解消後
git add .
git rebase --continue

# 強制プッシュ
git push -f origin feature/issue-123-description
```

## 禁止事項

- `main` への直接プッシュ
- 未レビューのマージ
- コンフリクトを含むマージ
- テストが失敗している状態でのマージ
