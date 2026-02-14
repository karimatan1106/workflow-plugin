#!/usr/bin/env node
/**
 * ワークフロー強制hook
 * 状態ファイルを直接参照してファイル操作をチェック
 * (workflow.sh への依存を排除)
 *
 * REQ-3: .claude-workflow-state.json への依存を廃止し、
 * ディレクトリスキャン方式に統一。
 *
 * @spec docs/workflows/ワ-クフロ-プラグインレビュ-指摘事項全件修正/spec.md
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
const crypto = require('crypto');
const { discoverTasks, findTaskByFilePath } = require('./lib/discover-tasks');
const { verifyHMAC } = require('./hmac-verify');

// FR-8: ルール定義共通化 - phase-definitions.jsモジュールを使用
const { PHASE_EXTENSIONS, PARALLEL_PHASES, PHASE_DESC } = require('./lib/phase-definitions');

// PHASE_EXTENSIONS, PARALLEL_PHASES, PHASE_DESC は phase-definitions.js から取得
// 重複定義を削除（FR-8）

/**
 * 並列フェーズかどうか
 */
function isParallelPhase(phase) {
  return phase in PARALLEL_PHASES;
}

/**
 * HIGH-3: HMAC整合性検証（sessionToken有無で判断）
 *
 * workflow-state.json の内容から HMAC 署名を検証する
 * @param {object} content - パースされた JSON コンテンツ
 * @returns {boolean} HMAC が有効なら true
 */
function verifyHmacIntegrity(content) {
  try {
    const storedHmac = content.stateIntegrity;
    if (!storedHmac) {
      return false; // HMAC署名がない
    }

    // stateIntegrity を除いた内容で HMAC を計算
    const { stateIntegrity, ...contentWithoutHmac } = content;
    const canonicalContent = JSON.stringify(contentWithoutHmac, null, 2);

    // HMAC キーを読み込み
    const hmacKeysPath = path.join(process.cwd(), '.claude', 'state', 'hmac-keys.json');
    if (!fs.existsSync(hmacKeysPath)) {
      return false; // HMAC キーファイルがない
    }

    const hmacKeys = JSON.parse(fs.readFileSync(hmacKeysPath, 'utf8'));
    const key = hmacKeys.current;
    if (!key) {
      return false; // 現在のキーがない
    }

    // HMAC を計算
    const computedHmac = crypto.createHmac('sha256', key).update(canonicalContent).digest('hex');

    return computedHmac === storedHmac;
  } catch (e) {
    logError('HMAC検証エラー', e.message, e.stack);
    return false;
  }
}

/**
 * HIGH-3: 外部編集検出のログ記録
 *
 * workflow-state.json への外部編集を audit-log.jsonl に記録
 * @param {string} filePath - 編集されたファイルパス
 * @param {boolean} hmacValid - HMAC検証結果
 */
function logExternalEdit(filePath, hmacValid) {
  const auditLogPath = path.join(process.cwd(), '.claude', 'state', 'audit-log.jsonl');
  const entry = {
    timestamp: new Date().toISOString(),
    type: 'external_edit',
    details: {
      filePath,
      hmacValid,
      action: hmacValid ? 'allowed' : 'blocked'
    },
    caller: process.pid.toString()
  };

  try {
    // audit-log.jsonl に追記
    fs.appendFileSync(auditLogPath, JSON.stringify(entry) + '\n');
  } catch (e) {
    logError('監査ログ書き込みエラー', e.message, e.stack);
  }
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

  const subPhases = PARALLEL_PHASES[phase];
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
  // BUG-3修正: ワークフロー成果物ディレクトリの操作を全フェーズで許可
  /docs[\/\\]workflows[\/\\]/i,
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
    const newContent = input.tool_input?.content || '';

    // ファイルパスがない場合はスキップ
    if (!filePath) {
      process.exit(0);
    }

    // HIGH-3: workflow-state.json への書き込みは sessionToken チェック
    if (filePath.includes('workflow-state.json') && newContent) {
      try {
        const parsedContent = JSON.parse(newContent);

        // sessionToken が含まれている場合は MCP サーバーからの更新
        if (parsedContent.sessionToken) {
          // MCP サーバー更新なので許可（HMAC チェックをバイパス）
          process.exit(0);
        }

        // sessionToken がない場合は外部編集 → HMAC 検証
        const hmacValid = verifyHmacIntegrity(parsedContent);
        logExternalEdit(filePath, hmacValid);

        if (!hmacValid) {
          console.log('');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('🚫 BLOCKED: ワークフロー状態ファイルの不正な編集');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('');
          console.log(`ファイル: ${filePath}`);
          console.log('HMAC 署名検証に失敗しました。');
          console.log('');
          console.log('対処方法:');
          console.log('  1. MCP サーバー経由でワークフロー状態を更新してください');
          console.log('  2. 手動編集が必要な場合は、ワークフロー状態をリセットしてください');
          console.log('');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('');
          process.exit(2);
        }
      } catch (e) {
        // JSON パースエラーは外部編集とみなす
        logError('workflow-state.json パースエラー', e.message, e.stack);
        logExternalEdit(filePath, false);
        process.exit(2);
      }
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

    // REQ-C3: HMAC integrity verified before phase access
    // Verification order (see: docs/security/threat-models/workflow-plugin.md#hmac-verification):
    // 1. verifyHMAC(task) -> checks HMAC-SHA256 signature (lines 242-263)
    // 2. if verification fails -> exit(2) (fail-closed)
    // 3. taskState.phase -> safe access (integrity guaranteed by HMAC)
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
  // FR-2: Timeout fail-closed化（CRITICAL）
  // タイムアウト発生時は exit code 2 でフック検証失敗として終了
  // CLAUDE.md REQ-3 Fail Closed準拠
  const timeout = setTimeout(() => {
    console.error('[enforce-workflow.js] Hook timeout - failing closed for security');
    process.exit(2);
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
