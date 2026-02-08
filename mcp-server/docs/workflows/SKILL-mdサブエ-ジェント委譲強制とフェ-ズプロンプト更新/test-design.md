# テスト設計: SKILL.mdサブエージェント委譲強制とフェーズプロンプト更新

## サマリー

本テスト設計は、SKILL.mdとREADME.mdのドキュメント変更に対する検証手法を定義する。主な検証項目は以下の通り。

目的:
- Orchestratorパターンセクションが正しく追加されていることの確認
- フェーズ構成が19フェーズに更新されていることの確認
- フェーズ別subagent設定テーブルの存在と内容の確認
- CLAUDE.mdとの整合性検証
- 既存ワークフローへの影響がないことの確認

主要な決定事項:
- テスト方法はgrepコマンドによるキーワード検証とファイル内容の照合を採用
- 手動検証項目（ワークフロー開始時の動作）も含める
- 各要件（REQ-1からREQ-5）に対応するテストケースを作成

次フェーズで必要な情報:
- test_implフェーズで実行するBashスクリプトのコマンド詳細
- 既存ワークフロータスクでの動作確認手順

---

## テストケース

### TC-1: SKILL.mdフェーズ構成更新の検証

**対応要件**: REQ-2

**目的**: フェーズ構成が18フェーズから19フェーズに正しく更新されていることを確認する

**検証項目**:
1. セクションタイトルが「フェーズ構成（19フェーズ）」になっていること
2. regression_testがtestingとparallel_verificationの間に配置されていること
3. 旧「18フェーズ」が残っていないこと
4. 注釈が「全てのタスクは以下の19フェーズで実行されます。」となっていること

**テスト手順**:
```bash
# セクションタイトルの確認
grep -n "フェーズ構成（19フェーズ）" .claude/skills/workflow/SKILL.md

# regression_testの配置確認
grep -A 5 "testing" .claude/skills/workflow/SKILL.md | grep "regression_test"

# 旧バージョンの残留確認（ヒットしないことを期待）
grep -n "18フェーズ" .claude/skills/workflow/SKILL.md
```

**期待結果**:
- 「フェーズ構成（19フェーズ）」が1回出現
- regression_testがtestingの次の行に配置
- 「18フェーズ」が0回ヒット

---

### TC-2: Orchestratorパターンセクションの検証

**対応要件**: REQ-1

**目的**: SKILL.mdにOrchestratorパターンセクションが正しく追加されていることを確認する

**検証項目**:
1. 「## Orchestratorパターン」セクションが存在すること
2. 「subagent委譲の強制ルール」サブセクションが含まれること
3. 21フェーズ（research〜docs_update）がリストアップされていること
4. 例外規定（commit, push, ci_verification, deploy）が含まれること
5. 図（ボックスフォーマット）が含まれること

**テスト手順**:
```bash
# セクションの存在確認
grep -n "## Orchestratorパターン" .claude/skills/workflow/SKILL.md

# subagent委譲の強制ルールの確認
grep -n "### subagent委譲の強制ルール" .claude/skills/workflow/SKILL.md

# 21フェーズのリスト確認（research, requirements, threat_modeling, ...）
grep -c "^- research$" .claude/skills/workflow/SKILL.md
grep -c "^- requirements$" .claude/skills/workflow/SKILL.md
grep -c "^- docs_update$" .claude/skills/workflow/SKILL.md

# 例外フェーズの確認
grep -n "### 例外: 軽量フェーズのインライン実行" .claude/skills/workflow/SKILL.md
grep -c "^- commit" .claude/skills/workflow/SKILL.md
grep -c "^- push" .claude/skills/workflow/SKILL.md
```

**期待結果**:
- 「## Orchestratorパターン」が1回出現
- 「### subagent委譲の強制ルール」が1回出現
- 各フェーズ名が少なくとも1回ずつ出現
- 例外セクションが存在し、4つの軽量フェーズがリスト化されている

---

### TC-3: フェーズ別subagent設定テーブルの検証

**対応要件**: REQ-3

**目的**: フェーズ別subagent設定テーブルが正しく追加され、CLAUDE.mdと一致することを確認する

**検証項目**:
1. 「### フェーズ別subagent設定」セクションが存在すること
2. テーブルヘッダー（フェーズ | subagent_type | model | 入力ファイル | 出力ファイル）が含まれること
3. regression_testのエントリが含まれること（general-purpose, haiku）
4. 全25行（21フェーズ + 4軽量フェーズ）のエントリが存在すること
5. CLAUDE.mdのテーブルと値が一致すること

**テスト手順**:
```bash
# セクションの存在確認
grep -n "### フェーズ別subagent設定" .claude/skills/workflow/SKILL.md

# テーブルヘッダーの確認
grep -n "| フェーズ | subagent_type | model | 入力ファイル | 出力ファイル |" .claude/skills/workflow/SKILL.md

# regression_testエントリの確認
grep "| regression_test |" .claude/skills/workflow/SKILL.md

# テーブル行数のカウント（ヘッダー + 区切り線 + 25エントリ = 27行）
grep "^|" .claude/skills/workflow/SKILL.md | wc -l
```

**期待結果**:
- セクションが存在
- テーブルヘッダーが1回出現
- regression_testエントリが「| regression_test | general-purpose | haiku | - | regression-test.md |」として存在
- テーブルが適切な行数を持つ

---

### TC-4: subagent起動テンプレートの検証

**対応要件**: REQ-4

**目的**: subagent起動テンプレートとサマリーセクション必須化指示が含まれることを確認する

**検証項目**:
1. 「### subagent起動テンプレート」セクションが存在すること
2. Task tool呼び出しの標準形式が含まれること
3. サマリーセクション必須化の指示が含まれること
4. 並列フェーズの実行例が含まれること
5. コンテキスト引き継ぎの説明が含まれること

**テスト手順**:
```bash
# セクションの存在確認
grep -n "### subagent起動テンプレート" .claude/skills/workflow/SKILL.md

# Task呼び出しテンプレートの確認
grep -n "Task({" .claude/skills/workflow/SKILL.md

# サマリーセクション必須化の確認
grep -n "## サマリー" .claude/skills/workflow/SKILL.md | head -2

# 並列フェーズ実行例の確認
grep -n "### 並列フェーズの実行" .claude/skills/workflow/SKILL.md

# コンテキスト引き継ぎの確認
grep -n "### コンテキスト引き継ぎ" .claude/skills/workflow/SKILL.md
```

**期待結果**:
- 各セクションが存在
- Task({の記述が複数回出現（テンプレート + 並列実行例）
- サマリーセクション必須化の説明が含まれる
- 並列フェーズの実行例が含まれる

---

### TC-5: 禁止行為セクションの検証

**対応要件**: REQ-1

**目的**: 禁止行為セクションに新規項目が追加されていることを確認する

**検証項目**:
1. 「## 禁止行為」セクションが存在すること
2. 「subagent委譲が必要なフェーズをメインClaudeが直接実行する」が含まれること

**テスト手順**:
```bash
# セクションの存在確認
grep -n "## 禁止行為" .claude/skills/workflow/SKILL.md

# 新規項目の確認
grep -n "subagent委譲が必要なフェーズをメインClaudeが直接実行" .claude/skills/workflow/SKILL.md
```

**期待結果**:
- 禁止行為セクションが存在
- 新規項目が1回出現

---

### TC-6: README.mdの検証

**対応要件**: REQ-5

**目的**: .claude/workflow-phases/README.mdのフェーズ順序が19フェーズに更新されていることを確認する

**検証項目**:
1. 「## フェーズ一覧（19フェーズ）」が含まれること
2. architecture_reviewが存在しないこと（廃止済み）
3. regression_testが16番目に配置されていること
4. フェーズ順序にregression_testが含まれること
5. 全25項目（19フェーズ + 4軽量フェーズ + 2参照用）がリスト化されていること

**テスト手順**:
```bash
# フェーズ一覧の確認
grep -n "## フェーズ一覧（19フェーズ）" .claude/workflow-phases/README.md

# architecture_reviewの削除確認（ヒットしないことを期待）
grep -n "architecture_review" .claude/workflow-phases/README.md

# regression_testの配置確認（16番目）
grep -n "^16\. regression_test\.md" .claude/workflow-phases/README.md

# フェーズ数のカウント
grep "^[0-9]\+\." .claude/workflow-phases/README.md | wc -l
```

**期待結果**:
- 「## フェーズ一覧（19フェーズ）」が1回出現
- architecture_reviewが0回ヒット
- regression_testが16番目に配置
- リストが25項目存在

---

### TC-7: 整合性の検証

**対応要件**: NFR-1

**目的**: SKILL.md、README.md、CLAUDE.mdの間でフェーズ順序とsubagent設定が一致していることを確認する

**検証項目**:
1. SKILL.mdのフェーズ順序とCLAUDE.mdが一致
2. README.mdのフェーズ順序とCLAUDE.mdが一致
3. フェーズ別subagent設定（subagent_type, model）がCLAUDE.mdと一致

**テスト手順**:
```bash
# SKILL.mdとCLAUDE.mdのフェーズ順序比較
# フェーズ順序図を抽出して比較
diff <(grep -A 10 "フェーズ構成（19フェーズ）" .claude/skills/workflow/SKILL.md) \
     <(grep -A 10 "フェーズ構成（19フェーズ）" /mnt/c/ツール/Workflow/CLAUDE.md)

# README.mdとCLAUDE.mdのフェーズ順序比較
# フェーズ一覧を抽出して比較
diff <(grep "^[0-9]\+\." .claude/workflow-phases/README.md | head -19) \
     <(grep "^[0-9]\+\." /mnt/c/ツール/Workflow/CLAUDE.md | head -19)

# subagent設定テーブルの比較（regression_testのエントリ）
diff <(grep "| regression_test |" .claude/skills/workflow/SKILL.md) \
     <(grep "| regression_test |" /mnt/c/ツール/Workflow/CLAUDE.md)
```

**期待結果**:
- diffコマンドが差分なし（出力が空）
- 各ファイル間でフェーズ順序とsubagent設定が一致

---

### TC-8: 機能的な検証（手動テスト）

**対応要件**: AC-7

**目的**: ワークフロー開始時にSKILL.mdが正しく読み込まれ、既存タスクに影響がないことを確認する

**検証項目**:
1. `/workflow start`でSKILL.mdが正しく読み込まれること
2. 新規タスクがOrchestratorパターンに従って動作すること
3. 既存のワークフロータスクが引き続き実行可能であること
4. MCPツールの動作に変更がないこと
5. ワークフロー状態JSONの構造に変更がないこと

**テスト手順**:
1. 新規テストタスクを開始: `/workflow start テストタスク名`
2. タスク状態を確認: `/workflow status`
3. SKILL.mdの読み込み確認（コンソール出力から）
4. 既存タスク（開始済み）に切り替え: `/workflow switch <existing-task-id>`
5. 既存タスクの状態確認: `/workflow status`
6. MCPツールの動作確認（workflow_next, workflow_approveなど）

**期待結果**:
- 新規タスクが正常に開始される
- SKILL.mdがエラーなく読み込まれる
- Orchestratorパターンのメッセージが表示される
- 既存タスクが正常に切り替え可能
- MCPツールが正常に動作

**注意**: この検証は手動で実施する必要がある

---

## テスト計画

### テスト実施順序

1. **静的検証（自動化可能）**: TC-1〜TC-7をBashスクリプトで実行
2. **手動検証**: TC-8をインタラクティブに実施

### テスト環境

- 作業ディレクトリ: `/mnt/c/ツール/Workflow/workflow-plugin/mcp-server/`
- 対象ファイル:
  - `.claude/skills/workflow/SKILL.md`
  - `.claude/workflow-phases/README.md`
  - `/mnt/c/ツール/Workflow/CLAUDE.md`（参照のみ）

### 自動化スクリプト（案）

test_implフェーズで以下のスクリプトを作成する:

```bash
#!/bin/bash
# test_design_validation.sh

echo "=== TC-1: SKILL.mdフェーズ構成更新の検証 ==="
grep -q "フェーズ構成（19フェーズ）" .claude/skills/workflow/SKILL.md && echo "✓ セクションタイトル確認" || echo "✗ セクションタイトル確認失敗"
grep -A 5 "testing" .claude/skills/workflow/SKILL.md | grep -q "regression_test" && echo "✓ regression_test配置確認" || echo "✗ regression_test配置確認失敗"
! grep -q "18フェーズ" .claude/skills/workflow/SKILL.md && echo "✓ 旧バージョン削除確認" || echo "✗ 旧バージョンが残存"

echo -e "\n=== TC-2: Orchestratorパターンセクションの検証 ==="
grep -q "## Orchestratorパターン" .claude/skills/workflow/SKILL.md && echo "✓ セクション存在確認" || echo "✗ セクション存在確認失敗"
grep -q "### subagent委譲の強制ルール" .claude/skills/workflow/SKILL.md && echo "✓ サブセクション確認" || echo "✗ サブセクション確認失敗"

echo -e "\n=== TC-3: フェーズ別subagent設定テーブルの検証 ==="
grep -q "### フェーズ別subagent設定" .claude/skills/workflow/SKILL.md && echo "✓ テーブルセクション確認" || echo "✗ テーブルセクション確認失敗"
grep -q "| regression_test |" .claude/skills/workflow/SKILL.md && echo "✓ regression_testエントリ確認" || echo "✗ regression_testエントリ確認失敗"

echo -e "\n=== TC-4: subagent起動テンプレートの検証 ==="
grep -q "### subagent起動テンプレート" .claude/skills/workflow/SKILL.md && echo "✓ テンプレートセクション確認" || echo "✗ テンプレートセクション確認失敗"
grep -q "Task({" .claude/skills/workflow/SKILL.md && echo "✓ Task呼び出し形式確認" || echo "✗ Task呼び出し形式確認失敗"

echo -e "\n=== TC-5: 禁止行為セクションの検証 ==="
grep -q "subagent委譲が必要なフェーズをメインClaudeが直接実行" .claude/skills/workflow/SKILL.md && echo "✓ 新規禁止項目確認" || echo "✗ 新規禁止項目確認失敗"

echo -e "\n=== TC-6: README.mdの検証 ==="
grep -q "## フェーズ一覧（19フェーズ）" .claude/workflow-phases/README.md && echo "✓ フェーズ一覧タイトル確認" || echo "✗ フェーズ一覧タイトル確認失敗"
! grep -q "architecture_review" .claude/workflow-phases/README.md && echo "✓ architecture_review削除確認" || echo "✗ architecture_reviewが残存"
grep -q "^16\. regression_test\.md" .claude/workflow-phases/README.md && echo "✓ regression_test配置確認" || echo "✗ regression_test配置確認失敗"

echo -e "\n=== TC-7: 整合性の検証 ==="
echo "（手動で差分確認が必要）"
```

### 成功基準

- TC-1〜TC-7: 全ての検証項目がパス（✓）
- TC-8: 手動テストで全ての動作が正常

### テスト成果物

- `docs/workflows/{taskName}/test-design.md`: 本ドキュメント
- `src/backend/tests/integration/test_design_validation.sh`: 自動化スクリプト（test_implフェーズで作成）
- `docs/testing/reports/skill-md-update-{日付}.md`: テスト結果レポート（testingフェーズで作成）

### 制約事項

- 本タスクはドキュメント変更のみであり、MCPサーバーのコード変更は含まない（NFR-2）
- definitions.tsは既に19フェーズ対応済みのため変更不要（NFR-2）
- 既存のワークフロータスクへの下位互換性を維持する必要がある（NFR-4）

### リスク項目

| リスク | 影響度 | 対策 |
|--------|--------|------|
| SKILL.md読み込み失敗 | 高 | 構文エラーのチェック（markdownlint） |
| CLAUDE.mdとの不整合 | 中 | TC-7で差分検証を徹底 |
| 既存タスクへの影響 | 高 | TC-8で下位互換性を確認 |

---

## 関連要件マッピング

| テストケース | 対応要件 | 受け入れ基準 |
|-------------|---------|------------|
| TC-1 | REQ-2 | AC-2 |
| TC-2 | REQ-1 | AC-1 |
| TC-3 | REQ-3 | AC-3 |
| TC-4 | REQ-4 | AC-4 |
| TC-5 | REQ-1 | AC-1 |
| TC-6 | REQ-5 | AC-5 |
| TC-7 | NFR-1 | AC-6 |
| TC-8 | NFR-4 | AC-7 |

---

## 次フェーズへの引き継ぎ事項

test_implフェーズでは以下を実装する:

1. 自動化スクリプト `test_design_validation.sh` の作成
2. 各テストケースの実装（grep, diff, wcコマンドを使用）
3. テスト実行と結果の記録

implementationフェーズでは以下を実施する:

1. SKILL.mdの更新（Orchestratorパターン追加、フェーズ構成更新）
2. README.mdの全文置換（19フェーズ対応）
3. マークダウンフォーマットの整合性確認

testingフェーズでは以下を実施する:

1. 自動化スクリプトの実行
2. 手動テスト（TC-8）の実施
3. テスト結果レポートの作成
