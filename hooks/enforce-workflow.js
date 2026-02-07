#!/usr/bin/env node
/**
 * ワークフロー強制hook
 * 状態ファイルを直接参照してファイル操作をチェック
 * (workflow.sh への依存を排除)
 *
 * REQ-3: .claude-workflow-state.json への依存を廃止し、
 * ディレクトリスキャン方式に統一。
 */

const HOOK_NAME = 'enforce-workflow.js';
const ERROR_LOG = require('path').join(process.cwd(), '.claude-hook-errors.log');

// エラーをログファイルに書き出す
function logError(type, message, stack) {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] [${HOOK_NAME}] ${type}: ${message}\n${stack ? `  Stack: ${stack}\n` : ''}\n`;
  try {
    require('fs').appendFileSync(ERROR_LOG, entry);
  } catch (e) { /* ignore */ }
  console.error(`[${HOOK_NAME}] ${type}: ${message}`);
  if (stack) console.error(`  スタック: ${stack}`);
}

// グローバルエラーハンドラ
process.on('uncaughtException', (err) => {
  logError('未捕捉エラー', err.message, err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logError('未処理のPromise拒否', String(reason), null);
  process.exit(1);
});

const fs = require('fs');
const path = require('path');
const { discoverTasks, findTaskByFilePath } = require('./lib/discover-tasks');

// フェーズごとの許可拡張子
const PHASE_EXTENSIONS = {
  'research': ['.md', '.mdx', '.txt'],
  'requirements': ['.md', '.mdx', '.txt'],
  'parallel_analysis': ['.md', '.mdx', '.txt'],
  'threat_modeling': ['.md', '.mdx', '.txt'],
  'planning': ['.md', '.mdx', '.txt'],
  'architecture_review': ['.md'],
  'parallel_design': ['.md', '.mdx', '.txt', '.mmd'],
  'state_machine': ['.md', '.mdx', '.txt', '.mmd'],
  'flowchart': ['.md', '.mdx', '.txt', '.mmd'],
  'ui_design': ['.md', '.mdx', '.txt', '.mmd'],
  'design_review': ['.md'],
  'test_design': ['.md', '.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx'],
  'test_impl': ['.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx', '.md'],
  'implementation': ['*'],
  'refactoring': ['*'],
  'parallel_quality': ['*'],
  'build_check': ['*'],
  'code_review': ['.md'],
  'testing': ['.md', '.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx'],
  'regression_test': ['.md', '.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx'],
  'parallel_verification': ['.md'],
  'manual_test': ['.md'],
  'security_scan': ['.md'],
  'performance_test': ['.md'],
  'e2e_test': ['.md', '.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx'],
  'commit': [],
  'push': [],
  'deploy': ['.md'],
  'completed': []
};

// 並列フェーズグループ定義
const PARALLEL_GROUPS = {
  'parallel_analysis': ['threat_modeling', 'planning'],
  'parallel_design': ['state_machine', 'flowchart', 'ui_design'],
  'parallel_quality': ['build_check', 'code_review'],
  'parallel_verification': ['manual_test', 'security_scan', 'performance_test', 'e2e_test']
};

// フェーズ説明
const PHASE_DESC = {
  'research': '調査フェーズ - 要件分析・既存コード調査',
  'requirements': '要件定義フェーズ',
  'parallel_analysis': '並列分析フェーズ',
  'threat_modeling': '脅威モデリングフェーズ',
  'planning': '設計フェーズ - 仕様書作成',
  'architecture_review': 'アーキテクチャレビュー',
  'parallel_design': '並列設計フェーズ',
  'state_machine': 'ステートマシン図作成',
  'flowchart': 'フローチャート作成',
  'ui_design': 'UI設計フェーズ',
  'design_review': '設計レビュー - ユーザー承認待ち',
  'test_design': 'テスト設計フェーズ',
  'test_impl': 'テスト実装フェーズ（TDD Red）',
  'implementation': '実装フェーズ（TDD Green）',
  'refactoring': 'リファクタリングフェーズ',
  'parallel_quality': '並列品質チェックフェーズ',
  'build_check': 'ビルド確認フェーズ',
  'code_review': 'コードレビュー',
  'testing': 'テスト実行フェーズ',
  'regression_test': 'リグレッションテストフェーズ',
  'parallel_verification': '並列検証フェーズ',
  'manual_test': '手動確認フェーズ',
  'security_scan': 'セキュリティスキャンフェーズ',
  'performance_test': 'パフォーマンステストフェーズ',
  'e2e_test': 'E2Eテストフェーズ',
  'commit': 'コミットフェーズ',
  'push': 'プッシュフェーズ',
  'deploy': 'デプロイフェーズ',
  'completed': '完了'
};

/**
 * 並列フェーズかどうか
 */
function isParallelPhase(phase) {
  return phase in PARALLEL_GROUPS;
}

/**
 * フェーズの許可拡張子を取得（並列フェーズは合算）
 */
function getAllowedExtensions(phase) {
  if (isParallelPhase(phase)) {
    const subPhases = PARALLEL_GROUPS[phase];
    const allExt = new Set();
    for (const sp of subPhases) {
      const ext = PHASE_EXTENSIONS[sp] || [];
      if (ext.includes('*')) {
        return ['*'];
      }
      ext.forEach(e => allExt.add(e));
    }
    return Array.from(allExt);
  }
  return PHASE_EXTENSIONS[phase] || [];
}

/**
 * ファイル編集が許可されているかチェック
 */
function checkFileAllowed(filePath, phase) {
  const allowedExt = getAllowedExtensions(phase);

  // 全許可
  if (allowedExt.includes('*')) {
    return { allowed: true };
  }

  // 空の場合はブロック
  if (allowedExt.length === 0) {
    return {
      allowed: false,
      phase,
      allowed_extensions: 'なし',
      message: PHASE_DESC[phase] || 'このフェーズでは編集不可'
    };
  }

  // 拡張子チェック
  const fileName = path.basename(filePath);

  // 複合拡張子（.test.ts など）もチェック
  for (const ext of allowedExt) {
    if (fileName.endsWith(ext)) {
      return { allowed: true };
    }
  }

  return {
    allowed: false,
    phase,
    allowed_extensions: allowedExt.join(' '),
    message: PHASE_DESC[phase] || 'このフェーズではこの拡張子のファイルを編集できません'
  };
}

// タイムアウト処理（3秒）
const timeout = setTimeout(() => {
  process.exit(0);
}, 3000);

// 標準入力を読み取り
let inputData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => inputData += chunk);
process.stdin.on('error', () => {
  clearTimeout(timeout);
  process.exit(0);
});
process.stdin.on('end', () => {
  clearTimeout(timeout);
  try {
    const input = JSON.parse(inputData);
    main(input);
  } catch (e) {
    console.error('[enforce-workflow] JSON parse error:', e.message);
    process.exit(2);
  }
});

function main(input) {
  try {
    const filePath = input.tool_input?.file_path || '';

    // ファイルパスがない場合はスキップ
    if (!filePath) {
      process.exit(0);
    }

    // ★★★ REQ-3: discoverTasks()を使用してアクティブタスクを取得 ★★★
    const tasks = discoverTasks();

    // タスクがない場合、ブロック
    if (tasks.length === 0) {
      console.log('');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🚫 BLOCKED: タスクが開始されていません');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');
      console.log('ファイルを編集するには、まずタスクを開始してください。');
      console.log('');
      console.log('コマンド:');
      console.log('  /workflow start <タスク名>');
      console.log('');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');
      process.exit(2);
    }

    // ★★★ REQ-3: findTaskByFilePath()を使用してファイルに対応するタスクを検索 ★★★
    const currentTask = findTaskByFilePath(filePath);

    // ファイルがどのタスクにも属さない場合は、最初のアクティブタスクを使用
    const taskState = currentTask || tasks[0];
    const currentPhase = taskState.phase || 'idle';

    // idle状態ならブロック
    if (currentPhase === 'idle') {
      console.log('');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🚫 BLOCKED: タスクが開始されていません');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');
      process.exit(2);
    }

    // ファイル編集許可チェック
    const check = checkFileAllowed(filePath, currentPhase);

    if (!check.allowed) {
      console.log('');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🚫 BLOCKED: ワークフロー違反');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');
      console.log(`現在のフェーズ: ${check.phase}`);
      console.log(`説明: ${check.message}`);
      console.log('');
      console.log(`ブロックされたファイル: ${filePath}`);
      console.log(`許可される拡張子: ${check.allowed_extensions}`);
      console.log('');
      console.log('対処方法:');
      console.log('  1. 現在のフェーズを完了させる');
      console.log('  2. /workflow next で次のフェーズに進む');
      console.log('');
      console.log('ワークフロー状態確認:');
      console.log('  /workflow status');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');
      process.exit(2);
    }

    // 許可
    process.exit(0);

  } catch (e) {
    console.error('[enforce-workflow] Error:', e.message);
    // エラー時は許可（開発中の安全策）
    process.exit(0);
  }
}
