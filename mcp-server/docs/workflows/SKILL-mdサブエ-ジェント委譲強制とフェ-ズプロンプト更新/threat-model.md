# 脅威モデル - SKILL.mdサブエージェント委譲強制とフェーズプロンプト更新

## サマリー

本タスクはSKILL.md・README.mdのドキュメント変更のみであり、MCPサーバーコードには変更がない。主要な脅威は以下:

1. **SKILL.md読み込み失敗**: Claude Codeがドキュメント変更を正しく認識できず、メインClaudeがsubagent委譲指示を無視して直接実行する可能性
2. **文言の曖昧性**: subagent委譲のルールが曖昧で、メインClaudeの判断で例外扱いする可能性
3. **CLAUDE.mdとの矛盾**: SKILL.mdに記載する内容とCLAUDE.mdの既存内容に不整合がある場合、どちらに従うべきか不明確になる
4. **フェーズ順序の不一致**: README.mdのフェーズ順序が古く、definitions.tsと異なることで、実装との混乱を招く可能性
5. **既存タスクへの影響**: フェーズ順序の変更（regression_test追加）が既に進行中のワークフロータスクに影響する可能性

次フェーズ: planning（インパクト分析、整合性検証）
- CLAUDE.mdとSKILL.mdの内容一致確認
- definitions.tsのフェーズ順序との検証
- バージョン管理戦略の立案

## 脅威

## 脅威1: SKILL.md読み込み失敗によるsubagent委譲の無視

**リスク度: 高** / 発生確度: 中 / 影響度: 高

Claude Codeが`/workflow start`コマンド実行時にSKILL.mdを正しく読み込めない、またはドキュメント変更が反映されないため、メインClaudeがsubagent委譲指示を見落として全フェーズを直接実行する可能性がある。

想定される発生シナリオとしては、SKILL.mdに「Orchestratorパターン」セクション追加後、Claude Codeのskill読み込み処理が古いバージョンをキャッシュし、メインClaudeが「各フェーズはTask toolで委譲」という指示を見ないまま、research以降を直接順次実行してしまう流れである。コンテキスト肥大化（12,000行以上）からcompacting発生に至る。

影響としては、メインClaudeのコンテキストが急速に増加し、compacting時に調査結果（research.md）の詳細が削除される。planning, test_design等の後続フェーズが不完全な入力で実行され、ユーザー体験が悪化する。

対策として、SKILL.mdの「subagent委譲の強制ルール」セクションに全21フェーズを明記し、SKILL.md更新後に実際の`workflow start`でSKILL.mdが正しく読み込まれることをテスト検証する。問題発生時のrollback計画としてgitでバージョン管理を行う。

## 脅威2: subagent委譲ルールの曖昧性

**リスク度: 中** / 発生確度: 中 / 影響度: 中

「subagent委譲を強制する」という指示が曖昧で、メインClaudeが「regression_testは追加されたばかりなので省略してよい」「parallelフェーズは複数Task呼び出しが面倒なので直接実行する」「build_checkは単なるコマンド実行だからTask不要」などの例外判断をする可能性がある。

直接実行フェーズが増えるとコンテキスト肥大化が部分的に再発し、parallel_*フェーズが順序実行に変更されると開発期間が延長する。subagent型の不適切な選択（design_reviewを「sonnet」ではなく「haiku」で実行するなど）により品質低下も懸念される。

対策として、例外規定を厳密化する。commit、push、ci_verification、deployの4フェーズのみメインClaudeでインライン実行可能とし、それ以外は全てTask tool委譲を必須とする。判断基準はファイル読み書きが不要、外部コマンド実行のみ、成果物ドキュメント作成が不要の3条件全てを満たすことである。フェーズ別subagent設定テーブルで各フェーズのsubagent_typeとmodelを明記し、メインClaudeが型を誤選択できない仕様とする。

## 脅威3: CLAUDE.mdとSKILL.mdの内容矛盾

**リスク度: 中** / 発生確度: 中 / 影響度: 中

本タスクでSKILL.mdに追加する内容とCLAUDE.mdの既存内容に矛盾がある場合、メインClaudeやユーザーがどちらに従うべきか不明確になる。特にdocs_update時にCLAUDE.mdが更新されるがSKILL.mdは古いバージョンのままの場合、フェーズ別subagent設定テーブルの値が異なる問題が生じうる。

対策として、コンテンツ重複排除を行い参照方式を採用する。SKILL.mdに「詳細はCLAUDE.mdの『subagentによるフェーズ実行』セクションを参照」と記載し、コンテンツ全文をコピーしない。ただし、MCPサーバーのプロンプト配信時に必要な情報はインラインで記載する。フェーズ別subagent設定テーブルの一元化として、CLAUDE.mdをソース真実とし、SKILL.mdで参照する。

## 脅威4: フェーズ順序の不一致（regression_test関連）

**リスク度: 中** / 発生確度: 高 / 影響度: 低

SKILL.mdのフェーズ順序を18から19に更新（regression_test追加）する際に、definitions.ts（既に19フェーズ対応済み）と.claude/workflow-phases/README.md（古いバージョンでarchitecture_review含む）の間に不一致が発生する可能性がある。

対策として、planningフェーズでdefinitions.tsのフェーズ順序を確認し、README.mdのフェーズ順序と一致させる。SKILL.md更新と同時にREADME.mdを19フェーズに更新し、architecture_reviewを削除、regression_testをtestingとparallel_verificationの間に追加する。

## 脅威5: 既存タスクへのフェーズ構成変更の波及

**リスク度: 中** / 発生確度: 低 / 影響度: 中

ワークフロー全体のフェーズ構成を変更（regression_test追加）することで、既に進行中のワークフロータスクが影響を受ける可能性がある。既存タスクが「testing」フェーズを完了し次フェーズへ進もうとする時、MCPサーバーが「次フェーズはregression_test」と指示し、タスクは元々regression_testを予定していなかったため混乱が生じるシナリオが考えられる。

対策として、新規タスクは新フェーズで実行し、definitions.tsの変更は不要（既に19フェーズ対応済み）であるため、ドキュメント更新のみで既存タスクのJSON状態は影響を受けない。ドキュメントにSKILL.md更新日時を明記する。

## 脅威6: サマリーセクション必須化の実装漏れ

**リスク度: 低** / 発生確度: 低 / 影響度: 中

SKILL.mdの「subagent起動テンプレート」にサマリーセクション必須化（REQ-4）が記載されるが、メインClaudeがプロンプトテンプレートを正確に使用しない場合、生成されたドキュメントにサマリーセクションがない可能性がある。サマリーがないと次フェーズのsubagentが効率的にコンテキストを引き継げず、compactingが再発する懸念がある。

対策として、test_designフェーズで実際のsubagent呼び出しによるサマリーセクション生成を検証する。SKILL.mdのsubagent起動テンプレートに「★重要★ サマリーセクション必須化」を明記し、「50行以内で要点を記述」の形式を指定する。

## 脅威7: README.md更新漏れ

**リスク度: 中** / 発生確度: 中 / 影響度: 低

requirements.mdに「.claude/workflow-phases/README.mdを更新」と記載されているが、implementationフェーズでSKILL.mdは更新するがREADME.md更新を忘れる可能性がある。README.mdが古いフェーズ順序（18フェーズ、architecture_review含む）を示すとユーザーが混乱する。

対策として、受け入れ基準（AC-5）に「.claude/workflow-phases/README.mdが更新されている」を含め、implementationフェーズでこのチェックリストを確認する。grepによる検証（regression_testの存在確認、architecture_reviewの不在確認）も実施する。

## リスク

## リスクマトリックス

| 脅威番号 | 脅威名 | リスク度 | 発生確度 | 影響度 | 主要対策 |
|---------|--------|---------|---------|--------|---------|
| T-1 | SKILL.md読み込み失敗 | 高 | 中 | 高 | ドキュメント明確化とテスト検証 |
| T-2 | subagent委譲ルール曖昧性 | 中 | 中 | 中 | 例外規定厳密化と設定テーブル |
| T-3 | CLAUDE.mdとの矛盾 | 中 | 中 | 中 | コンテンツ重複排除と参照方式 |
| T-4 | フェーズ順序不一致 | 中 | 高 | 低 | 整合性チェックと同時更新 |
| T-5 | 既存タスクへの影響 | 中 | 低 | 中 | 段階的導入と下位互換性維持 |
| T-6 | サマリー実装漏れ | 低 | 低 | 中 | テスト検証とプロンプト明確化 |
| T-7 | README.md更新漏れ | 中 | 中 | 低 | チェックリスト化と自動検証 |

## 実装フェーズ向けチェックリスト

- SKILL.md「subagent委譲の強制ルール」セクションが明確か
- 例外規定（commit, push, ci_verification, deploy）が明確化されているか
- フェーズ別subagent設定テーブルにdesign_reviewの型情報が正確か
- SKILL.mdとCLAUDE.mdの内容矛盾がないか
- README.mdが19フェーズに更新されているか（architecture_review削除済み）
- アクティブなタスクへの影響が明記されているか
- サマリーセクション必須化のプロンプト指示が明確か
- チェックリストにREADME.md更新が含まれているか

## 次フェーズ（planning）で実施する事項

CLAUDE.mdの「subagentによるフェーズ実行」セクションを読み込み、「Orchestratorパターン」図がCLAUDE.mdに存在することを確認する。SKILL.mdに追加予定の内容との矛盾がないことを確認し、フェーズ別subagent設定テーブルの値がCLAUDE.mdと一致することを検証する。

definitions.tsを確認し、フェーズ順序が19フェーズであること、regression_testフェーズがtestingとparallel_verificationの間に配置されていることを確認する。

.claude/workflow-phases/README.mdの現在の内容を確認し、architecture_reviewが含まれていないか、regression_testが含まれているかを検証する。

本タスク開始時点でのアクティブなワークフロータスクを確認し、各タスクが現在どのフェーズにいるか確認し、regression_testフェーズの追加が既存タスクに影響するか分析する。

## 関連ドキュメント

- requirements.md - 要件定義
- CLAUDE.md - 参照元（Orchestratorパターン、フェーズ別設定）
- SKILL.md - 更新対象
- README.md（.claude/workflow-phases/） - 更新対象
- definitions.ts - 参照（フェーズ順序確認用）
