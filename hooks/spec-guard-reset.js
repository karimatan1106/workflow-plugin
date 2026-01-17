#!/usr/bin/env node
/**
 * 仕様書ガード状態リセットフック (PostToolUse)
 *
 * git commit 完了後に仕様書更新フラグをリセット。
 * 次の変更サイクルでは再度仕様書の更新が必要になる。
 */

const fs = require('fs');
const path = require('path');

// 状態ファイルのパス
const STATE_FILE = path.join(process.cwd(), '.claude-spec-guard-state.json');

/**
 * 状態をリセット
 */
function resetState() {
  const state = {
    specUpdated: false,
    updatedAt: null,
    files: [],
    lastResetAt: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {
    // エラーは無視
  }
}

/**
 * メイン処理
 */
function main(input) {
  const toolName = input.tool_name;
  const toolInput = input.tool_input || {};

  // Bash ツールのみチェック
  if (toolName !== 'Bash') {
    process.exit(0);
  }

  const command = toolInput.command || '';

  // git commit コマンドの場合 → 状態をリセット
  if (command.includes('git commit')) {
    resetState();
    console.log('');
    console.log('仕様書ガード状態をリセットしました');
    console.log('   次の変更では再度仕様書の更新が必要です');
  }

  process.exit(0);
}

// 非同期stdin読み取り
let inputData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (inputData += chunk));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(inputData);
    main(input);
  } catch (e) {
    process.exit(0);
  }
});
