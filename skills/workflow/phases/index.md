# ワークフローフェーズ プロンプトテンプレート

このディレクトリには、各ワークフローフェーズで使用するプロンプトテンプレートが格納されています。

## ファイル一覧

| ファイル | フェーズ | 説明 |
|---------|---------|------|
| research.md | research | 調査フェーズ |
| requirements.md | requirements | 要件定義フェーズ |
| threat-modeling.md | threat_modeling | 脅威モデリング（parallel_analysis内） |
| planning.md | planning | 設計・計画（parallel_analysis内） |
| test-design.md | test_design | テスト設計フェーズ |
| implementation.md | implementation | 実装フェーズ |

## 使用方法

Orchestrator（メインのClaude）は、各フェーズ開始時にこれらのテンプレートを参照し、subagentに渡すプロンプトを構築します。

```javascript
// 例: researchフェーズのsubagent起動
Task({
  prompt: `
    ${readFile('skills/workflow/phases/research.md')}

    ## タスク固有情報
    - タスク名: ${taskName}
    - 出力先: docs/workflows/${taskName}/
  `,
  subagent_type: 'Explore',
  model: 'haiku',
  description: 'research'
})
```

## テンプレートの構造

各テンプレートは以下の構造を持ちます：

1. **目的**: フェーズの目的
2. **入力**: 読み込むファイル
3. **タスク**: 実行する作業
4. **出力**: 生成するファイル
5. **品質基準**: 完了条件
