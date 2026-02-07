# 調査結果: ワークフロー成果物検証強制

## 調査対象

ワークフローの各フェーズ遷移・サブフェーズ完了時における成果物ファイルの存在検証機構。

## 調査結果

### 1. next.ts（フェーズ遷移）

**ファイル**: `mcp-server/src/tools/next.ts` (232行)

現在のチェック項目:
- 完了済みチェック (L72)
- レビュー承認チェック (L80)
- 並列サブフェーズ完了チェック (L88)
- スコープ設定チェック (L99)
- テスト結果チェック (L110, L127)
- 設計-実装整合性チェック (L144, L153)

**欠陥**: 成果物ファイルの存在チェックが**一切ない**。research.md, requirements.md, test-design.md 等を作成せずに次フェーズに進める。

### 2. complete-sub.ts（サブフェーズ完了）

**ファイル**: `mcp-server/src/tools/complete-sub.ts` (128行)

現在のチェック項目:
- 並列フェーズ判定 (L40)
- サブフェーズ名の妥当性 (L48)
- 依存関係チェック (L56)

**欠陥**: 成果物ファイルの存在チェックが**一切ない**。threat-model.md, spec.md, state-machine.mmd, flowchart.mmd, ui-design.md 等を作成せずにサブフェーズを完了できる。

### 3. design-validator.ts（設計検証）

**ファイル**: `mcp-server/src/validation/design-validator.ts` (389行)

**欠陥**:
- L71-75: workflowDir不存在時に `passed: true` → 設計検証スキップ
- L93-98: 3つの設計書が全て存在しない場合に `passed: true` → 設計検証スキップ
- 「設計書なし = 問題なし」という逆の動作をしている

### 4. phase-edit-guard.js（フェーズ編集ガード）

**ファイル**: `hooks/phase-edit-guard.js` (1724行)

**欠陥**: build_check ルール (L189-194) が `readOnly: true` + 全タイプブロックになっている。CLAUDE.md「build_check: 全て（ビルド修正用）」と矛盾。

## 影響範囲

| ファイル | 行数 | 変更内容 |
|---------|------|---------|
| `mcp-server/src/tools/next.ts` | 232 | 成果物チェック追加 |
| `mcp-server/src/tools/complete-sub.ts` | 128 | 成果物チェック追加 |
| `mcp-server/src/validation/design-validator.ts` | 389 | passed:true→false変更 |
| `hooks/phase-edit-guard.js` | 1724 | build_checkルール修正 |
