# Clean Architecture ガイダンス機能 仕様書

## 変更対象ファイル

1. `workflow-plugin/CLAUDE.md` - AIへの指示に推奨構造を追加
2. `workflow-plugin/skills/workflow/SKILL.md` - スキルドキュメントにガイダンス追加

## 変更内容

### 1. CLAUDE.md への追加

「推奨プロジェクト構造」セクションを追加:

```markdown
## 推奨プロジェクト構造（Clean Architecture + DDD）

大規模プロジェクトでは以下の構造を推奨:

### ディレクトリ構成

\`\`\`
src/
├── domain/               # ビジネスロジックの核心（依存なし）
│   ├── entities/         # エンティティ
│   ├── value-objects/    # 値オブジェクト
│   ├── aggregates/       # 集約
│   ├── events/           # ドメインイベント
│   └── repositories/     # リポジトリインターフェース
│
├── application/          # ユースケース（Domain層のみに依存）
│   ├── use-cases/        # ユースケース
│   ├── commands/         # コマンド（CQRS）
│   ├── queries/          # クエリ（CQRS）
│   └── ports/            # ポート定義
│
├── infrastructure/       # 外部依存の実装
│   ├── database/         # DB実装
│   ├── external-apis/    # 外部API
│   └── config/           # 設定
│
└── presentation/         # UI/API層
    ├── controllers/      # コントローラー
    ├── dtos/             # DTO
    └── middleware/       # ミドルウェア
\`\`\`

### 依存関係ルール

\`\`\`
Presentation → Application → Domain ← Infrastructure
               ↓
           Infrastructure
\`\`\`

- Domain層: 外部依存禁止（純粋なビジネスロジック）
- Application層: Domain層のみに依存
- Infrastructure層: Domain/Application層の抽象に依存（依存性逆転）
- Presentation層: Application層を通じてのみドメインにアクセス

### 適用判断

**推奨されるケース:**
- 複数チーム開発
- 長期メンテナンス
- 複雑なビジネスロジック
- 高いテスタビリティ要求

**不要なケース:**
- プロトタイプ/PoC
- 単純なCRUD
- スクリプト/ユーティリティ
```

### 2. SKILL.md への追加

「プロジェクト構造ガイダンス」セクションを追加:

```markdown
## プロジェクト構造ガイダンス

新規プロジェクト作成時、Clean Architecture + DDDに基づく構造を推奨。

### requirementsフェーズで考慮

- ドメイン境界の特定
- ユビキタス言語（用語集）の定義
- 集約単位の検討

### planningフェーズで考慮

- 層構成の決定
- モジュール分割
- 依存関係の設計

### test_designフェーズで考慮

- 層ごとのテスト戦略
  - Domain: 単体テスト
  - Application: 統合テスト（モック使用）
  - Infrastructure: 統合テスト（実環境）
  - Presentation: E2Eテスト
```

## 実装手順

1. CLAUDE.md の「## 成果物の配置先」セクションの前に「推奨プロジェクト構造」セクションを挿入
2. SKILL.md の「## 成果物ルール」セクションの前に「プロジェクト構造ガイダンス」セクションを挿入
3. 既存のsmall/medium参照を削除（廃止済みのため）
