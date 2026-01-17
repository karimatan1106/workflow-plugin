# MCP Server 仕様書

## 概要

ワークフロープラグインのMCPサーバー仕様。

## タスクサイズ

- **large**: 18フェーズ（全ワークフロー）

注: small/mediumは廃止されました。

## フェーズ構成（Large）

```
research → requirements → parallel_analysis → parallel_design
→ design_review → test_design → test_impl → implementation
→ refactoring → parallel_quality → testing → parallel_verification
→ docs_update → commit → push → ci_verification → deploy → completed
```

## 関連ファイル

<!-- @related-files -->
- `src/state/types.ts`
- `src/phases/definitions.ts`
- `src/tools/start.ts`
<!-- @end-related-files -->
