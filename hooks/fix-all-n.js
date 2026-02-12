#!/usr/bin/env node
/**
 * fix-all-n.js - N-2とN-4のJavaScriptファイル一括修正スクリプト
 * @spec docs/workflows/ワ-クフロ-プロセス阻害要因完全解消/spec.md
 */

const fs = require('fs');
const path = require('path');

// プロジェクトルート検出
let currentDir = __dirname;
while (!fs.existsSync(path.join(currentDir, 'workflow-plugin', 'mcp-server', 'package.json'))) {
  const parentDir = path.dirname(currentDir);
  if (parentDir === currentDir) {
    console.error('ERROR: Could not find project root');
    process.exit(1);
  }
  currentDir = parentDir;
}
const PROJECT_ROOT = currentDir;

// ヘルパー関数
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyFix(filePath, searchStr, replaceStr, description) {
  const fullPath = path.join(PROJECT_ROOT, filePath);
  if (!fs.existsSync(fullPath)) {
    console.error(`SKIP ${description}: file not found at ${fullPath}`);
    return false;
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  const occurrences = (content.match(new RegExp(escapeRegex(searchStr), 'g')) || []).length;

  if (occurrences !== 1) {
    console.error(`SKIP ${description}: expected 1 occurrence, found ${occurrences}`);
    return false;
  }

  const newContent = content.replace(searchStr, replaceStr);
  fs.writeFileSync(fullPath, newContent, 'utf8');
  console.log(`APPLIED ${description}`);
  return true;
}

// =============================================================================
// N-2: phase-edit-guard.js stderr出力完全化（4箇所）
// =============================================================================

// N-2-1: Bashホワイトリスト違反のconsole.log → console.error
// 行1595付近: ホワイトリスト違反ブロックのconsole.logをconsole.errorに変更
applyFix(
  'workflow-plugin/hooks/phase-edit-guard.js',
  `      if (!whitelistResult.allowed) {
        const rule = getPhaseRule(phase, workflowState.workflowState);
        console.log('');
        console.log(SEPARATOR_LINE);
        console.log(' Bashコマンドがブロックされました（ホワイトリスト）');
        console.log(SEPARATOR_LINE);
        console.log('');
        console.log(\` フェーズ: \${phase}（\${rule?.japaneseName || phase}）\`);
        console.log(\` コマンド: \${command.substring(0, 100)}\${command.length > 100 ? '...' : ''}\`);
        console.log('');
        console.log(\` 理由: \${whitelistResult.reason}\`);
        console.log('');
        console.log(SEPARATOR_LINE);`,
  `      if (!whitelistResult.allowed) {
        const rule = getPhaseRule(phase, workflowState.workflowState);
        // N-2: Output error message to stderr for user visibility
        console.error('');
        console.error(SEPARATOR_LINE);
        console.error(' Bashコマンドがブロックされました（ホワイトリスト）');
        console.error(SEPARATOR_LINE);
        console.error('');
        console.error(\` フェーズ: \${phase}（\${rule?.japaneseName || phase}）\`);
        console.error(\` コマンド: \${command.substring(0, 100)}\${command.length > 100 ? '...' : ''}\`);
        console.error('');
        console.error(\` 理由: \${whitelistResult.reason}\`);
        console.error('');
        console.error(SEPARATOR_LINE);`,
  'N-2-1: Bash whitelist violation stderr output'
);

// N-2-2: Fail Closedのcatchブロックにメッセージ追加
applyFix(
  'workflow-plugin/hooks/phase-edit-guard.js',
  `  } catch (e) {
    // REQ-3: Fail Closed - エラー時はブロック
    debugLog('エラー発生:', e.message);
    process.exit(EXIT_CODES.BLOCK);
  }`,
  `  } catch (e) {
    // REQ-3: Fail Closed - エラー時はブロック
    debugLog('エラー発生:', e.message);
    // N-2: Output error message to stderr for user visibility
    console.error('Hook validation failed unexpectedly. Please check hook configuration.');
    process.exit(EXIT_CODES.BLOCK);
  }`,
  'N-2-2: Fail Closed catch block stderr output'
);

// N-2-3: stdinエラーにメッセージ追加
applyFix(
  'workflow-plugin/hooks/phase-edit-guard.js',
  `  process.stdin.on('error', (err) => {
    clearTimeout(timeout);
    debugLog('stdin エラー:', err.message);
    // REQ-3: Fail Closed - stdinエラー時はブロック
    process.exit(EXIT_CODES.BLOCK);
  });`,
  `  process.stdin.on('error', (err) => {
    clearTimeout(timeout);
    debugLog('stdin エラー:', err.message);
    // REQ-3: Fail Closed - stdinエラー時はブロック
    // N-2: Output error message to stderr for user visibility
    console.error('Failed to read input from stdin.');
    process.exit(EXIT_CODES.BLOCK);
  });`,
  'N-2-3: stdin error stderr output'
);

// N-2-4: JSONパースエラーにメッセージ追加
applyFix(
  'workflow-plugin/hooks/phase-edit-guard.js',
  `    } catch (e) {
      // REQ-3: Fail Closed - JSON パースエラー時もブロック
      debugLog('JSON パースエラー:', e.message);
      process.exit(EXIT_CODES.BLOCK);
    }`,
  `    } catch (e) {
      // REQ-3: Fail Closed - JSON パースエラー時もブロック
      debugLog('JSON パースエラー:', e.message);
      // N-2: Output error message to stderr for user visibility
      console.error('Invalid JSON input from stdin.');
      process.exit(EXIT_CODES.BLOCK);
    }`,
  'N-2-4: JSON parse error stderr output'
);

// =============================================================================
// N-4: enforce-workflow.js 拡張子追加（5フェーズ）
// =============================================================================

// N-4-1: test_design
applyFix(
  'workflow-plugin/hooks/enforce-workflow.js',
  `  'test_design': ['.md', '.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx'],`,
  `  // N-4: Added JavaScript test extensions (.test.js, .spec.js, .test.jsx, .spec.jsx)
  'test_design': ['.md', '.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx', '.test.js', '.spec.js', '.test.jsx', '.spec.jsx'],`,
  'N-4-1: test_design phase JavaScript extensions'
);

// N-4-2: test_impl
applyFix(
  'workflow-plugin/hooks/enforce-workflow.js',
  `  'test_impl': ['.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx', '.md'],`,
  `  // N-4: Added JavaScript test extensions (.test.js, .spec.js, .test.jsx, .spec.jsx)
  'test_impl': ['.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx', '.test.js', '.spec.js', '.test.jsx', '.spec.jsx', '.md'],`,
  'N-4-2: test_impl phase JavaScript extensions'
);

// N-4-3: testing
applyFix(
  'workflow-plugin/hooks/enforce-workflow.js',
  `  'testing': ['.md', '.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx'],`,
  `  // N-4: Added JavaScript test extensions (.test.js, .spec.js, .test.jsx, .spec.jsx)
  'testing': ['.md', '.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx', '.test.js', '.spec.js', '.test.jsx', '.spec.jsx'],`,
  'N-4-3: testing phase JavaScript extensions'
);

// N-4-4: regression_test
applyFix(
  'workflow-plugin/hooks/enforce-workflow.js',
  `  'regression_test': ['.md', '.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx'],`,
  `  // N-4: Added JavaScript test extensions (.test.js, .spec.js, .test.jsx, .spec.jsx)
  'regression_test': ['.md', '.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx', '.test.js', '.spec.js', '.test.jsx', '.spec.jsx'],`,
  'N-4-4: regression_test phase JavaScript extensions'
);

// N-4-5: e2e_test
applyFix(
  'workflow-plugin/hooks/enforce-workflow.js',
  `  'e2e_test': ['.md', '.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx'],`,
  `  // N-4: Added JavaScript test extensions (.test.js, .spec.js, .test.jsx, .spec.jsx)
  'e2e_test': ['.md', '.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx', '.test.js', '.spec.js', '.test.jsx', '.spec.jsx'],`,
  'N-4-5: e2e_test phase JavaScript extensions'
);

console.log('\n=== fix-all-n.js completed ===');
