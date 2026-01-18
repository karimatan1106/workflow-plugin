# Clean Architecture ガイダンス機能 要件定義

## 概要

ワークフロースキルを使用して作成されるプログラムが、Clean Architecture + DDD（ドメイン駆動設計）の原則に従ったディレクトリ構造で構築されるようにガイダンスを追加する。

## 背景

現在のワークフロースキルは開発フェーズの管理（TDD、設計レビュー等）に焦点を当てているが、プロジェクトの構造設計についてのガイダンスがない。エンタープライズレベルの大規模プロジェクトに対応するため、Clean Architecture + DDDに基づくプロジェクト構造のガイダンスを追加する。

## 機能要件

### FR-1: プロジェクト構造ガイダンスの追加

CLAUDE.md および SKILL.md に、推奨プロジェクト構造のガイダンスを追加する。

**推奨ディレクトリ構造:**

```
src/
├── domain/               # ドメイン層（ビジネスロジックの核心）
│   ├── entities/         # エンティティ（識別子を持つオブジェクト）
│   ├── value-objects/    # 値オブジェクト（不変オブジェクト）
│   ├── aggregates/       # 集約（整合性境界）
│   ├── events/           # ドメインイベント
│   └── repositories/     # リポジトリインターフェース（Ports）
│
├── application/          # アプリケーション層（ユースケース）
│   ├── use-cases/        # ユースケース実装
│   ├── commands/         # コマンド（CQRS Write）
│   ├── queries/          # クエリ（CQRS Read）
│   ├── ports/            # 入出力ポート定義
│   └── services/         # アプリケーションサービス
│
├── infrastructure/       # インフラストラクチャ層（外部依存）
│   ├── database/         # データベース接続・リポジトリ実装
│   ├── external-apis/    # 外部API連携
│   ├── messaging/        # メッセージング（キュー等）
│   └── config/           # 設定ファイル
│
└── presentation/         # プレゼンテーション層（UI/API）
    ├── controllers/      # コントローラー
    ├── dtos/             # データ転送オブジェクト
    ├── middleware/       # ミドルウェア
    └── views/            # ビュー（該当する場合）
```

### FR-2: 依存関係ルールの明示

各層の依存関係ルールを明示する:

1. **Domain層**: 外部依存なし（純粋なビジネスロジック）
2. **Application層**: Domain層のみに依存
3. **Infrastructure層**: Domain層、Application層に依存
4. **Presentation層**: Application層に依存（Domainへの直接依存禁止）

```
Presentation → Application → Domain ← Infrastructure
```

### FR-3: フェーズ別ガイダンスの追加

各ワークフローフェーズで考慮すべきClean Architectureの観点を追加:

| フェーズ | Clean Architecture観点 |
|---------|----------------------|
| requirements | ドメイン境界の特定、ユビキタス言語の定義 |
| planning | 層構成の決定、モジュール分割 |
| state_machine | ドメインエンティティの状態遷移 |
| flowchart | ユースケースフロー、レイヤー間通信 |
| test_design | 層ごとのテスト戦略（単体/統合/E2E） |
| implementation | 依存性逆転原則の適用 |

### FR-4: 適用判断ガイダンス

全てのプロジェクトにClean Architectureを強制するのではなく、適用が推奨されるケースを明示:

**適用推奨:**
- 複数チームでの開発
- 長期メンテナンスが予想されるプロジェクト
- ビジネスロジックが複雑なアプリケーション
- テスタビリティが重要なプロジェクト

**適用不要:**
- プロトタイプ/PoC
- 単純なCRUDアプリケーション
- スクリプト/ユーティリティ

## 非機能要件

### NFR-1: 既存機能との互換性

既存のワークフロー機能（フェーズ管理、TDD、レビュー等）に影響を与えない。

### NFR-2: オプション性

Clean Architectureガイダンスは推奨事項であり、強制ではない。

## 成果物

1. CLAUDE.md への「推奨プロジェクト構造」セクション追加
2. SKILL.md への「プロジェクト構造ガイダンス」セクション追加
3. （オプション）プロジェクト構造テンプレートファイル

## 受け入れ基準

- [ ] CLAUDE.md に推奨プロジェクト構造が記載されている
- [ ] SKILL.md にプロジェクト構造ガイダンスが記載されている
- [ ] 依存関係ルールが明確に説明されている
- [ ] フェーズ別のClean Architecture観点が記載されている
- [ ] 適用判断のガイダンスが含まれている
