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

/**
 * エラーをログファイルに書き出す（書き込み失敗時は無視）
 * @param {string} type - エラータイプ
 * @param {string} message - メッセージ
 * @param {string|null} stack - スタックトレース
 */
function logError(type, message, stack) {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] [${HOOK_NAME}] ${type}: ${message}\n${stack ? `  Stack: ${stack}\n` : ''}\n`;
  try {
    require('fs').appendFileSync(ERROR_LOG, entry);
  } catch (e) {
    // ログ書き込み失敗は無視（本処理に影響しないため）
  }
  console.error(`[${HOOK_NAME}] ${type}: ${message}`);
  if (stack) console.error(`  スタック: ${stack}`);
}

// グローバルエラーハンドラ（REQ-3: Fail Closed）
process.on('uncaughtException', (err) => {
  logError('未捕捉エラー', err.message, err.stack);
  process.exit(2);
});

process.on('unhandledRejection', (reason) => {
  logError('未処理のPromise拒否', String(reason), null);
  process.exit(2);
});

const fs = require('fs');
const path = require('path');
const { discoverTasks, findTaskByFilePath } = require('./lib/discover-tasks');
const { verifyHMAC } = require('./hmac-verify');

// フェーズごとの許可拡張子
const PHASE_EXTENSIONS = {
  'research': ['.md', '.mdx', '.txt'],
  'requirements': ['.md', '.mdx', '.txt'],
  'parallel_analysis': ['.md', '.mdx', '.txt'],
  'threat_modeling': ['.md', '.mdx', '.txt'],
  'planning': ['.md', '.mdx', '.txt'],
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
  'docs_update': ['.md', '.mdx'],
  'ci_verification': ['.md'],
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
 *
 * 並列フェーズの場合、全サブフェーズの拡張子を合算する。
 * ワイルドカード（*）が見つかれば、全て許可して即座に終了。
 *
 * @param {string} phase - フェーズ名
 * @returns {string[]} 許可される拡張子の配列
 */
function getAllowedExtensions(phase) {
  if (!isParallelPhase(phase)) {
    return PHASE_EXTENSIONS[phase] || [];
  }

  const subPhases = PARALLEL_GROUPS[phase];
  const allExt = new Set();

  for (const sp of subPhases) {
    const ext = PHASE_EXTENSIONS[sp] || [];
    if (ext.includes('*')) {
      return ['*'];  // ワイルドカード見つけたら即座に返す
    }
    ext.forEach(e => allExt.add(e));
  }

  return Array.from(allExt);
}

/**
 * REQ-10: ワークフロー設定ファイル判定
 *
 * workflow-state.json, .claude/settings.json等の設定ファイルは
 * フェーズ制限をバイパスして全フェーズで編集可能にする。
 */
const WORKFLOW_CONFIG_PATTERNS = [
  /workflow-state\.json$/i,
  /\.claude[\/\\]settings\.json$/i,
  /\.claude[\/\\]state[\/\\].*\.json$/i,
  /\.claude-.*\.json$/i,
];

function isWorkflowConfigFile(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  return WORKFLOW_CONFIG_PATTERNS.some(pattern => pattern.test(normalized));
}

/**
 * ファイル編集が許可されているかチェック
 *
 * 判定順序:
 * 1. ワイルドカード（*）が許可拡張子にあれば許可
 * 2. 許可拡張子が空なら禁止（読み取り専用フェーズ）
 * 3. ファイルの拡張子が許可リストに含まれているかチェック
 *
 * @param {string} filePath - チェック対象ファイルパス
 * @param {string} phase - 現在のフェーズ
 * @returns {{allowed: boolean, phase?: string, allowed_extensions?: string, message?: string}}
 */
function checkFileAllowed(filePath, phase) {
  const allowedExt = getAllowedExtensions(phase);
  const phaseDesc = PHASE_DESC[phase] || 'このフェーズでは編集不可';

  // ワイルドカード許可
  if (allowedExt.includes('*')) {
    return { allowed: true };
  }

  // 許可拡張子がない場合はブロック（読み取り専用）
  if (allowedExt.length === 0) {
    return {
      allowed: false,
      phase,
      allowed_extensions: 'なし',
      message: phaseDesc
    };
  }

  // ファイル拡張子をチェック（複合拡張子.test.ts等に対応）
  const fileName = path.basename(filePath);
  const isAllowed = allowedExt.some(ext => fileName.endsWith(ext));

  if (isAllowed) {
    return { allowed: true };
  }

  return {
    allowed: false,
    phase,
    allowed_extensions: allowedExt.join(' '),
    message: phaseDesc
  };
}

function main(input) {
  try {
    const filePath = input.tool_input?.file_path || '';

    // ファイルパスがない場合はスキップ
    if (!filePath) {
      process.exit(0);
    }

    // REQ-10: ワークフロー設定ファイルはフェーズ制限をバイパス
    if (isWorkflowConfigFile(filePath)) {
      process.exit(0);
    }

    // ★★★ REQ-3: discoverTasks()を使用してアクティブタスクを取得 ★★★
    const tasks = discoverTasks();

    // ★★★ FR-2: HMAC検証 ★★★
    // 各タスク状態に対してHMAC署名を検証
    for (const task of tasks) {
      if (!verifyHMAC(task)) {
        console.log('');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🚫 BLOCKED: タスク状態の署名検証失敗');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');
        console.log(`タスクID: ${task.taskId}`);
        console.log(`タスク名: ${task.taskName}`);
        console.log('');
        console.log('タスク状態ファイルが改竄されている可能性があります。');
        console.log('');
        console.log('対処方法:');
        console.log('  1. ワークフローディレクトリを確認');
        console.log('  2. 手動編集した場合は、状態ファイルを削除して再度タスクを開始');
        console.log('');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');
        process.exit(2);
      }
    }

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
    // REQ-3: Fail Closed - エラー時はブロック
    process.exit(2);
  }
}

// スクリプトとして実行された場合のみstdin読み取り
if (require.main === module) {
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
    // REQ-3: Fail Closed
    process.exit(2);
  });
  process.stdin.on('end', () => {
    clearTimeout(timeout);
    try {
      const input = JSON.parse(inputData);
      main(input);
    } catch (e) {
      console.error('[enforce-workflow] JSON parse error:', e.message);
      // REQ-3: Fail Closed - JSONパースエラー時もブロック
      process.exit(2);
    }
  });
}

// エクスポート（テスト用）
module.exports = { isWorkflowConfigFile, checkFileAllowed };
