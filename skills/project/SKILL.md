---
name: project
description: プロジェクト構造を初期化し、セッション復元を支援するスキル。CLAUDE.md で定義されたエンタープライズ構成に従ってディレクトリを生成します。
---

# Project Skill

プロジェクトの初期化とセッション復元を支援するスキルです。

## 使用タイミング

以下のような場合にこのスキルを使用してください：

- 新しいプロジェクトを開始するとき
- エンタープライズレベルのディレクトリ構造を生成したいとき
- セッションを再開してワークフロー状態を確認したいとき

## コマンド

### プロジェクト初期化

```
/project init <プロジェクト名>
```

CLAUDE.md で定義されたエンタープライズ構成でプロジェクトを初期化します。

### セッション復元

```
/project resume
```

現在のワークフロー状態を表示し、次のアクションを提案します。

---

## /project init の動作

引数としてプロジェクト名を受け取り、以下の構造を生成してください。

### 生成するディレクトリ構造

```
{プロジェクト名}/
├── frontend/
│   ├── .storybook/
│   ├── src/
│   │   ├── app/
│   │   │   └── (routes)/
│   │   ├── features/
│   │   ├── components/
│   │   │   ├── ui/
│   │   │   └── layouts/
│   │   ├── hooks/
│   │   ├── lib/
│   │   │   └── utils/
│   │   ├── styles/
│   │   └── types/
│   └── e2e/
│
├── backend/
│   ├── src/
│   │   ├── domain/
│   │   │   ├── entities/
│   │   │   ├── value-objects/
│   │   │   ├── aggregates/
│   │   │   ├── events/
│   │   │   ├── repositories/
│   │   │   └── services/
│   │   ├── application/
│   │   │   ├── use-cases/
│   │   │   ├── commands/
│   │   │   ├── queries/
│   │   │   ├── dtos/
│   │   │   │   ├── request/
│   │   │   │   └── response/
│   │   │   └── ports/
│   │   │       ├── inbound/
│   │   │       └── outbound/
│   │   ├── infrastructure/
│   │   │   ├── database/
│   │   │   │   ├── prisma/
│   │   │   │   └── repositories/
│   │   │   ├── external/
│   │   │   ├── messaging/
│   │   │   ├── cache/
│   │   │   └── config/
│   │   ├── presentation/
│   │   │   ├── controllers/
│   │   │   ├── middleware/
│   │   │   ├── guards/
│   │   │   ├── interceptors/
│   │   │   └── filters/
│   │   ├── batch/
│   │   └── shared/
│   │       ├── constants/
│   │       ├── utils/
│   │       ├── exceptions/
│   │       └── decorators/
│   └── test/
│       ├── e2e/
│       └── fixtures/
│
├── docs/
│   ├── glossary.md
│   ├── guides/
│   ├── product/
│   │   ├── features/
│   │   ├── screens/
│   │   ├── api/
│   │   ├── events/
│   │   ├── database/
│   │   ├── components/
│   │   ├── design-system/
│   │   ├── user-stories/
│   │   ├── personas/
│   │   ├── journeys/
│   │   ├── interactions/
│   │   ├── responsive/
│   │   ├── accessibility/
│   │   ├── seo/
│   │   ├── i18n/
│   │   ├── messages/
│   │   ├── wireframes/
│   │   └── diagrams/
│   ├── architecture/
│   │   ├── overview.md
│   │   ├── decisions/
│   │   ├── modules/
│   │   ├── integrations/
│   │   ├── batch/
│   │   └── diagrams/
│   ├── security/
│   │   └── threat-models/
│   ├── testing/
│   │   ├── plans/
│   │   └── reports/
│   ├── operations/
│   │   ├── runbooks/
│   │   ├── deployment/
│   │   ├── environments/
│   │   └── monitoring/
│   └── workflows/
│
├── .claude/
├── docker-compose.yml
├── .gitignore
└── README.md
```

### 生成する基本ファイル

1. **README.md** - プロジェクト概要
2. **.gitignore** - Git 除外設定
3. **docker-compose.yml** - Docker 設定（空のテンプレート）
4. **docs/glossary.md** - 用語集（空のテンプレート）
5. **docs/architecture/overview.md** - 基本設計書（空のテンプレート）

### 動作手順

1. プロジェクト名が指定されていない場合はエラーを表示
2. 既存ディレクトリがある場合は警告を表示し、続行確認
3. ディレクトリ構造を mkdir -p で生成
4. 基本ファイルを生成
5. 完了メッセージと次のステップを案内

### 出力例

```markdown
## プロジェクト初期化

プロジェクト「{名前}」を初期化しています...

### 生成されたディレクトリ

- {名前}/frontend/
- {名前}/backend/
- {名前}/docs/
- {名前}/.claude/

### 生成されたファイル

- {名前}/README.md
- {名前}/.gitignore
- {名前}/docker-compose.yml

## 完了

プロジェクト「{名前}」の初期化が完了しました。

### 次のステップ

1. プロジェクトディレクトリに移動:
   cd {名前}

2. ワークフローを開始:
   /workflow start <タスク名>
```

---

## /project resume の動作

ワークフロー状態を取得して表示してください。

### 動作手順

1. mcp__workflow__workflow_status ツールを呼び出す
2. 結果を解析して表示

### タスクがある場合の出力

```markdown
## 現在のタスク

**タスク**: {タスク名}
**タスクID**: {タスクID}
**フェーズ**: {フェーズ}
**サイズ**: {サイズ}

### サブフェーズ状態（並列フェーズの場合）

| サブフェーズ | 状態 |
|------------|:----:|
| {サブフェーズ1} | 完了 / 未完了 |
| {サブフェーズ2} | 完了 / 未完了 |

### 次のアクション

1. {必要なアクション}
2. {次のステップ}
```

### タスクがない場合の出力

```markdown
## ワークフロー状態

アクティブなタスクはありません。

### 新しいタスクを開始

/workflow start <タスク名>

例:
  /workflow start ユーザー認証機能追加
```

---

## 注意事項

- プロジェクト名には英数字、ハイフン、アンダースコアのみ使用可能
- 既存ファイルは上書きしない
- ディレクトリ生成には mkdir -p を使用（Bash ツール経由）
