/**
 * REQ-8: フェーズルールモジュール
 * 各フェーズで編集可能なファイルタイプの定義
 * @spec docs/spec/features/scope-validator.md
 */

/**
 * フェーズ別編集可能ファイルタイプ定義
 */
const PHASE_EDIT_RULES = {
  idle: [],
  research: ['markdown'],
  requirements: ['markdown'],
  parallel_analysis: ['markdown'],
  threat_modeling: ['markdown'],
  planning: ['markdown'],
  parallel_design: ['markdown', 'mermaid'],
  state_machine: ['markdown', 'mermaid'],
  flowchart: ['markdown', 'mermaid'],
  ui_design: ['markdown', 'mermaid'],
  design_review: ['markdown'],
  test_design: ['markdown', 'test'],
  test_impl: ['test', 'markdown'],
  implementation: ['source', 'style', 'config'],
  refactoring: ['source', 'test', 'style', 'config'],
  parallel_quality: ['source', 'test', 'style', 'config', 'markdown'],
  build_check: ['source', 'test', 'style', 'config', 'markdown', 'mermaid'],
  code_review: ['markdown'],
  testing: ['markdown', 'test'],
  regression_test: ['markdown', 'test'],
  parallel_verification: ['markdown'],
  manual_test: ['markdown'],
  security_scan: ['markdown'],
  performance_test: ['markdown'],
  e2e_test: ['markdown', 'test'],
  docs_update: ['markdown'],
  commit: [],
  push: [],
  ci_verification: ['markdown'],
  deploy: ['markdown'],
  completed: [],
};

/**
 * 指定フェーズでファイルタイプが編集可能かチェック
 * @param {string} fileType - ファイルタイプ
 * @param {string} phase - 現在のフェーズ
 * @returns {boolean} 編集可能ならtrue
 */
function isEditableInPhase(fileType, phase) {
  const allowed = PHASE_EDIT_RULES[phase];
  if (!allowed) return false;
  return allowed.includes(fileType);
}

module.exports = { isEditableInPhase, PHASE_EDIT_RULES };
