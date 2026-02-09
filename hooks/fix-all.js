#!/usr/bin/env node
/**
 * D-1～D-8 一括修正スクリプト
 * @spec docs/workflows/ワ-クフロ-プロセス阻害要因解消/spec.md
 *
 * 3つのフックファイルに8件の修正を文字列置換で適用する。
 * 各修正は一致箇所が厳密に1件であることを検証する安全機構付き。
 */

const fs = require('fs');
const path = require('path');

const HOOKS_DIR = __dirname;

// 修正対象ファイル
const FILES = {
  bashWhitelist: path.join(HOOKS_DIR, 'bash-whitelist.js'),
  phaseEditGuard: path.join(HOOKS_DIR, 'phase-edit-guard.js'),
  enforceWorkflow: path.join(HOOKS_DIR, 'enforce-workflow.js'),
};

let successCount = 0;
let failCount = 0;

/**
 * 修正を適用する汎用関数
 * @param {string} content - ファイル内容
 * @param {string} fixId - 修正ID (D-1等)
 * @param {string} oldStr - 検索文字列
 * @param {string} newStr - 置換文字列
 * @returns {string} 修正後の内容
 */
function applyFix(content, fixId, oldStr, newStr) {
  const count = content.split(oldStr).length - 1;
  if (count === 0) {
    console.error(`[FAIL] ${fixId}: 検索文字列が見つかりません`);
    failCount++;
    return content;
  }
  if (count > 1) {
    console.error(`[FAIL] ${fixId}: 検索文字列が${count}箇所にマッチ（1箇所のみ許可）`);
    failCount++;
    return content;
  }
  const result = content.replace(oldStr, newStr);
  console.log(`[OK] ${fixId}: 修正適用成功`);
  successCount++;
  return result;
}

// =====================================================================
// ファイル読み込み（CRLF正規化）
// =====================================================================

function readNormalized(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

let bashWhitelist = readNormalized(FILES.bashWhitelist);
let phaseEditGuard = readNormalized(FILES.phaseEditGuard);
let enforceWorkflow = readNormalized(FILES.enforceWorkflow);

console.log('=== D-1～D-8 一括修正開始 ===\n');

// =====================================================================
// D-1: ci_verificationをverificationPhasesに追加 (bash-whitelist.js)
// =====================================================================

bashWhitelist = applyFix(
  bashWhitelist,
  'D-1',
  "const verificationPhases = ['security_scan', 'performance_test', 'e2e_test'];",
  "const verificationPhases = ['security_scan', 'performance_test', 'e2e_test', 'ci_verification'];"
);

// =====================================================================
// D-2: deployPhasesグループ新設 (bash-whitelist.js)
// =====================================================================

// D-2a: deployPhases定義を追加
bashWhitelist = applyFix(
  bashWhitelist,
  'D-2a',
  "  const gitPhases = ['commit', 'push'];",
  "  const deployPhases = ['deploy'];\n  const gitPhases = ['commit', 'push'];"
);

// D-2b: getWhitelistForPhase内にdeployPhases条件を追加
bashWhitelist = applyFix(
  bashWhitelist,
  'D-2b',
  "  } else if (gitPhases.includes(phase)) {\n    return [...BASH_WHITELIST.readonly, ...BASH_WHITELIST.git];",
  "  } else if (deployPhases.includes(phase)) {\n    // D-2: deployフェーズはreadonly + implementation + deploy用コマンドを許可\n    return [...BASH_WHITELIST.readonly, ...BASH_WHITELIST.implementation, 'docker', 'kubectl', 'ssh', 'helm', 'gh'];\n  } else if (gitPhases.includes(phase)) {\n    return [...BASH_WHITELIST.readonly, ...BASH_WHITELIST.git];"
);

// =====================================================================
// D-3a: SHELL_BUILTINS定数を定義 (bash-whitelist.js)
// =====================================================================

bashWhitelist = applyFix(
  bashWhitelist,
  'D-3a',
  "const NODE_E_BLACKLIST = [",
  "/**\n * D-3: シェル組み込みコマンド定義\n * splitCompoundCommand分割後、これらはホワイトリスト検証をスキップする\n */\nconst SHELL_BUILTINS = new Set(['true', 'false', 'exit', 'set', 'unset', 'export', 'test', ':']);\n\nconst NODE_E_BLACKLIST = ["
);

// =====================================================================
// D-3b: checkCommand内でSHELL_BUILTINSスキップ追加 (bash-whitelist.js)
// =====================================================================

bashWhitelist = applyFix(
  bashWhitelist,
  'D-3b',
  "    // cd コマンドは全フェーズで許可（ディレクトリ移動のみ）\n    if (partTrimmed.startsWith('cd ') || partTrimmed === 'cd') {\n      continue;\n    }\n\n    // ホワイトリストに含まれるかチェック",
  "    // cd コマンドは全フェーズで許可（ディレクトリ移動のみ）\n    if (partTrimmed.startsWith('cd ') || partTrimmed === 'cd') {\n      continue;\n    }\n\n    // D-3: シェル組み込みコマンドはホワイトリスト検証をスキップ\n    const shellCmd = partTrimmed.split(/\\s+/)[0];\n    if (SHELL_BUILTINS.has(shellCmd)) {\n      continue;\n    }\n\n    // ホワイトリストに含まれるかチェック"
);

// =====================================================================
// D-4: nodeコマンドをtestingとcode_editリストに追加 (bash-whitelist.js)
// =====================================================================

bashWhitelist = applyFix(
  bashWhitelist,
  'D-4a',
  "    'npm run lint', 'npm run type-check',\n  ],\n\n  // 実装コマンド",
  "    'npm run lint', 'npm run type-check',\n    'node ',\n  ],\n\n  // 実装コマンド"
);

bashWhitelist = applyFix(
  bashWhitelist,
  'D-4b',
  "    'mkdir', 'mkdir -p',\n  ],",
  "    'mkdir', 'mkdir -p',\n    'node ',\n  ],"
);

// =====================================================================
// D-5: PHASE_ORDERに10件の欠落フェーズ追加 (phase-edit-guard.js)
// =====================================================================

phaseEditGuard = applyFix(
  phaseEditGuard,
  'D-5',
  `const PHASE_ORDER = [
  'research',
  'requirements',
  'threat_modeling',
  'planning',
  'state_machine',
  'flowchart',
  'ui_design',
  'design_review',
  'test_design',
  'test_impl',
  'implementation',
  'refactoring',
  'build_check',
  'code_review',
  'testing',
  'manual_test',
  'security_scan',
  'docs_update',
  'commit',
  'completed',
];`,
  `const PHASE_ORDER = [
  'research',
  'requirements',
  'parallel_analysis',
  'threat_modeling',
  'planning',
  'parallel_design',
  'state_machine',
  'flowchart',
  'ui_design',
  'design_review',
  'test_design',
  'test_impl',
  'implementation',
  'refactoring',
  'parallel_quality',
  'build_check',
  'code_review',
  'testing',
  'regression_test',
  'parallel_verification',
  'manual_test',
  'security_scan',
  'performance_test',
  'e2e_test',
  'docs_update',
  'commit',
  'push',
  'ci_verification',
  'deploy',
  'completed',
];`
);

// =====================================================================
// D-6: normalizeGitCommand関数追加とマッチング前呼び出し (bash-whitelist.js)
// =====================================================================

// D-6a: normalizeGitCommand関数を追加
bashWhitelist = applyFix(
  bashWhitelist,
  'D-6a',
  "function checkBashWhitelist(command, phase) {",
  `/**
 * D-6: git -C オプションを正規化
 * git -C /path/to/dir status → git status に変換
 * @param {string} cmd - コマンド文字列
 * @returns {string} 正規化されたコマンド
 */
function normalizeGitCommand(cmd) {
  if (!cmd.startsWith('git ')) return cmd;
  // -C <path> ペアを全て除去
  return cmd.replace(/\\s+-C\\s+\\S+/g, '').replace(/\\s+/g, ' ').trim();
}

function checkBashWhitelist(command, phase) {`
);

// D-6b: ホワイトリスト照合前にgitコマンドを正規化
bashWhitelist = applyFix(
  bashWhitelist,
  'D-6b',
  "    // ホワイトリストに含まれるかチェック\n    let partAllowed = false;\n    for (const allowedCommand of whitelist) {\n      if (partTrimmed.startsWith(allowedCommand)) {",
  "    // ホワイトリストに含まれるかチェック\n    // D-6: git -C オプションを正規化してからマッチング\n    const normalizedPart = normalizeGitCommand(partTrimmed);\n    let partAllowed = false;\n    for (const allowedCommand of whitelist) {\n      if (normalizedPart.startsWith(allowedCommand)) {"
);

// =====================================================================
// D-7: displayBlockMessageのconsole.logをconsole.errorに変更 (phase-edit-guard.js)
// =====================================================================

// D-7: displayBlockMessage関数内のconsole.logをconsole.errorに一括変更
// 対象範囲: displayTddCycleInfo, displayAllowedFiles, displayNextSteps, displayBlockMessage
// これらの関数は全てブロックメッセージ表示用で、stderrに出力すべき

const blockMsgStart = 'function displayTddCycleInfo(currentTddPhase) {';
const blockMsgEnd = '// =============================================================================\n// ログ機能';

const startIdx = phaseEditGuard.indexOf(blockMsgStart);
const endIdx = phaseEditGuard.indexOf(blockMsgEnd);

if (startIdx !== -1 && endIdx !== -1) {
  const before = phaseEditGuard.substring(0, startIdx);
  const blockSection = phaseEditGuard.substring(startIdx, endIdx);
  const after = phaseEditGuard.substring(endIdx);

  // ブロックメッセージ表示関数内のconsole.logをconsole.errorに置換
  const fixedSection = blockSection.replace(/console\.log\(/g, 'console.error(');

  phaseEditGuard = before + fixedSection + after;
  console.log('[OK] D-7: displayBlockMessage系関数のconsole.log→console.error変更完了');
  successCount++;
} else {
  console.error('[FAIL] D-7: displayBlockMessage関数の範囲を特定できません');
  failCount++;
}

// =====================================================================
// D-8a: PHASE_EXTENSIONSからarchitecture_review削除 (enforce-workflow.js)
// =====================================================================

enforceWorkflow = applyFix(
  enforceWorkflow,
  'D-8a',
  "  'architecture_review': ['.md'],\n",
  ""
);

// =====================================================================
// D-8b: PHASE_DESCからarchitecture_review削除 (enforce-workflow.js)
// =====================================================================

enforceWorkflow = applyFix(
  enforceWorkflow,
  'D-8b',
  "  'architecture_review': 'アーキテクチャレビュー',\n",
  ""
);

// =====================================================================
// ファイル書き込み
// =====================================================================

fs.writeFileSync(FILES.bashWhitelist, bashWhitelist, 'utf8');
fs.writeFileSync(FILES.phaseEditGuard, phaseEditGuard, 'utf8');
fs.writeFileSync(FILES.enforceWorkflow, enforceWorkflow, 'utf8');

// =====================================================================
// 結果表示
// =====================================================================

console.log(`\n=== 修正結果: 成功 ${successCount} / 失敗 ${failCount} ===`);

if (failCount > 0) {
  console.error('\n修正に失敗した項目があります。上記のエラーを確認してください。');
  process.exit(1);
} else {
  console.log('\n全修正が正常に適用されました。');
  process.exit(0);
}
