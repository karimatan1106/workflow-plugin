# ワークフローフェーズ一覧

## 全フェーズ入力/出力一覧（並列グループ情報付き）

<table>
<tr>
<th>並列グループ</th>
<th>フェーズ</th>
<th>入力</th>
<th>出力</th>
</tr>
<tr>
<td>単独</td>
<td>research</td>
<td><code>log.md</code></td>
<td><code>research.md</code>, <code>requirements.md</code></td>
</tr>
<tr>
<td rowspan="3">parallel_design</td>
<td>state_machine</td>
<td><code>research.md</code>, <code>requirements.md</code></td>
<td><code>docs/specs/{domain}/{name}.state-machine.mmd</code></td>
</tr>
<tr>
<td>flowchart</td>
<td><code>research.md</code>, <code>requirements.md</code>, <code>state-machine.mmd</code></td>
<td><code>docs/specs/{domain}/{name}.flowchart.mmd</code></td>
</tr>
<tr>
<td>ui_design</td>
<td><code>research.md</code>, <code>requirements.md</code></td>
<td><code>ui-design.md</code></td>
</tr>
<tr>
<td rowspan="2">parallel_analysis</td>
<td>planning</td>
<td><code>research.md</code>, <code>requirements.md</code>, <code>state-machine.mmd</code>, <code>flowchart.mmd</code></td>
<td><code>docs/specs/domains/{domain}/{name}.md</code>, <code>log.md</code>追記</td>
</tr>
<tr>
<td>threat_modeling</td>
<td><code>research.md</code>, <code>requirements.md</code></td>
<td><code>threat-model.md</code></td>
</tr>
<tr>
<td>単独</td>
<td>design_review</td>
<td>仕様書, <code>state-machine.mmd</code>, <code>flowchart.mmd</code>, <code>ui-design.md</code></td>
<td><code>design-review.md</code></td>
</tr>
<tr>
<td>単独</td>
<td>architecture_review</td>
<td>仕様書, <code>state-machine.mmd</code>, <code>flowchart.mmd</code></td>
<td><code>architecture-review.md</code></td>
</tr>
<tr>
<td>単独</td>
<td>test_design</td>
<td>仕様書, <code>state-machine.mmd</code>, <code>flowchart.mmd</code></td>
<td><code>test-cases.md</code>, <code>tests/regression/*.test.ts</code></td>
</tr>
<tr>
<td>単独</td>
<td>test_impl</td>
<td><code>test-cases.md</code>, 仕様書, <code>state-machine.mmd</code>, <code>flowchart.mmd</code></td>
<td><code>*.test.ts</code></td>
</tr>
<tr>
<td>単独</td>
<td>implementation</td>
<td>仕様書, <code>state-machine.mmd</code>, <code>flowchart.mmd</code>, <code>test-cases.md</code></td>
<td>ソースコード</td>
</tr>
<tr>
<td rowspan="2">parallel_quality</td>
<td>build_check</td>
<td>ソースコード</td>
<td><code>log.md</code>追記</td>
</tr>
<tr>
<td>code_review</td>
<td>ソースコード, テストコード, 仕様書, <code>state-machine.mmd</code>, <code>flowchart.mmd</code>, <code>test-cases.md</code></td>
<td><code>code-review.md</code></td>
</tr>
<tr>
<td>単独</td>
<td>testing</td>
<td><code>test-cases.md</code>, <code>*.test.ts</code></td>
<td><code>test-cases.md</code>更新, <code>log.md</code>追記</td>
</tr>
<tr>
<td rowspan="2">parallel_verification</td>
<td>manual_test</td>
<td>仕様書, <code>test-cases.md</code></td>
<td><code>log.md</code>追記</td>
</tr>
<tr>
<td>security_scan</td>
<td>ソースコード, <code>threat-model.md</code></td>
<td><code>security-scan-report.md</code></td>
</tr>
<tr>
<td>単独</td>
<td>commit</td>
<td><code>log.md</code>, 全変更ファイル</td>
<td>Gitコミット, PR</td>
</tr>
<tr>
<td>単独</td>
<td>push</td>
<td>コミット済みの変更</td>
<td>リモートリポジトリへのプッシュ</td>
</tr>
<tr>
<td>単独</td>
<td>deploy</td>
<td>コミット済みコード, <code>log.md</code></td>
<td><code>log.md</code>追記</td>
</tr>
</table>

---

## 並列グループ一覧

| グループ名              | 含まれるフェーズ                    |
| ----------------------- | ----------------------------------- |
| `parallel_design`       | state_machine, flowchart, ui_design |
| `parallel_analysis`     | planning, threat_modeling           |
| `parallel_quality`      | build_check, code_review            |
| `parallel_verification` | manual_test, security_scan          |

---

## フェーズ順序

```
research → parallel_design → parallel_analysis → design_review → architecture_review
→ test_design → test_impl → implementation → parallel_quality → testing
→ parallel_verification → commit → push → deploy → completed
```

---

## タスクディレクトリ構成

```
{workflowDir}/
├── log.md                    # タスクログ（全フェーズで更新）
├── research.md               # 調査結果
├── requirements.md           # 要件定義記録
├── state-machine.md          # ステートマシン図（ASCII、参考用）
├── flowchart.md              # フローチャート（ASCII、参考用）
├── ui-design.md              # UI設計
├── threat-model.md           # 脅威モデル
├── test-cases.md             # テストケース定義
├── code-review.md            # コードレビュー結果
├── design-review.md          # 設計レビュー結果
├── architecture-review.md    # アーキテクチャレビュー結果
├── security-scan-report.md   # セキュリティスキャン結果
└── workflow-state.json       # ワークフロー状態
```

**注意**: `.mmd` ファイル（Mermaid形式）は `docs/specs/` に直接作成する。

---

## 永続ドキュメント（docs/specs/）

| パス                           | 用途                              |
| ------------------------------ | --------------------------------- |
| `docs/specs/domains/{domain}/` | ドメイン別仕様書                  |
| `docs/specs/CODE_MAPPING.md`   | コード↔仕様書マッピング（人間用） |
| `docs/specs/INDEX.json`        | コード↔仕様書マッピング（機械用） |
