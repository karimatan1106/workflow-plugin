# UI設計: Clean Architecture ガイダンス

## 概要

本機能はCLIツール（Claude Code）のワークフロースキルへのドキュメント追加であり、UIコンポーネントは存在しない。

## 表示形式

### CLAUDE.mdでの表示

ユーザーがClaude Codeを使用する際、AIがCLAUDE.mdを参照し、必要に応じてClean Architectureガイダンスを提示する。

```
ユーザー: 新しいプロジェクトを作成して

AI: プロジェクト構造について確認させてください。
    このプロジェクトは以下のどれに該当しますか？

    1. 大規模/長期メンテナンス → Clean Architecture推奨
    2. 小規模/プロトタイプ → シンプル構造

    Clean Architectureを採用する場合、以下の構造を推奨します:

    src/
    ├── domain/       # ビジネスロジック
    ├── application/  # ユースケース
    ├── infrastructure/ # 外部依存
    └── presentation/ # UI/API
```

### SKILL.mdでの表示

`/workflow` コマンドのヘルプや、フェーズ別のガイダンスとして表示される。

## アクセシビリティ

テキストベースのCLI出力のため、特別なアクセシビリティ対応は不要。
