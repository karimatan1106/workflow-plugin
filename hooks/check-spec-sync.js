#!/usr/bin/env node
/**
 * 仕様書変更検知hook (PostToolUse)
 *
 * 仕様書が変更されたら関連コードを特定してClaudeに通知する。
 * Edit/Write完了後に実行され、関連ファイルの確認を促す。
 *
 * 設定可能な環境変数:
 * - SPEC_DIR: 仕様書ディレクトリのパターン（デフォルト: docs/specs）
 * - PROJECT_SUBDIR: プロジェクトのサブディレクトリ（デフォルト: 空 = カレントディレクトリ直下）
 * - SKIP_SPEC_SYNC_CHECK: "true" で一時的にスキップ
 */

const HOOK_NAME = 'check-spec-sync.js';
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

// 設定
const SPEC_DIR = process.env.SPEC_DIR || 'docs/specs';
const PROJECT_SUBDIR = process.env.PROJECT_SUBDIR || '';

/**
 * 仕様書パスかどうかを判定
 */
function isSpecPath(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.includes(SPEC_DIR) && normalized.endsWith('.md');
}

/**
 * プロジェクトのベースディレクトリを取得
 */
function getProjectBaseDir() {
  const baseDir = process.cwd();
  if (PROJECT_SUBDIR) {
    return path.join(baseDir, PROJECT_SUBDIR);
  }
  return baseDir;
}

/**
 * 関連ファイルセクションから関連ファイルを抽出
 */
function extractRelatedFiles(content) {
  const relatedFilesMatch = content.match(
    /<!-- @related-files -->([\s\S]*?)<!-- @end-related-files -->/
  );

  if (!relatedFilesMatch) {
    return null;
  }

  const relatedSection = relatedFilesMatch[1];
  const relatedFiles = [];
  const filePattern = /`([^`]+\.(ts|tsx|js|jsx|mjs|cjs))`/g;
  let match;

  while ((match = filePattern.exec(relatedSection)) !== null) {
    relatedFiles.push(match[1]);
  }

  return relatedFiles;
}

/**
 * 関連ファイルの存在をチェック
 */
function checkRelatedFiles(relatedFiles, projectBaseDir) {
  const existingFiles = [];
  const missingFiles = [];

  for (const file of relatedFiles) {
    const fullPath = path.join(projectBaseDir, file);
    if (fs.existsSync(fullPath)) {
      existingFiles.push(file);
    } else {
      missingFiles.push(file);
    }
  }

  return { existingFiles, missingFiles };
}

/**
 * @spec コメントのチェック
 */
function checkSpecComments(existingFiles, projectBaseDir, specFilePath) {
  const warnings = [];
  const specRef = path.relative(projectBaseDir, specFilePath).replace(/\\/g, '/');

  for (const file of existingFiles) {
    const fullPath = path.join(projectBaseDir, file);
    try {
      const fileContent = fs.readFileSync(fullPath, 'utf-8');

      // @spec コメントがあるかチェック
      if (!fileContent.includes('@spec') || !fileContent.includes(specRef)) {
        warnings.push({
          file,
          specRef,
        });
      }
    } catch (e) {
      // ファイル読み取りエラーは無視
    }
  }

  return warnings;
}

/**
 * 通知メッセージを出力
 */
function printNotification(specFilePath, existingFiles, missingFiles, specWarnings) {
  console.log('\n' + '='.repeat(70));
  console.log('[仕様書変更検知] 関連コードの確認が必要です');
  console.log('='.repeat(70));
  console.log(`\n変更された仕様書: ${path.basename(specFilePath)}`);

  if (existingFiles.length > 0) {
    console.log(`\n確認・修正が必要な関連ファイル:`);
    for (const file of existingFiles) {
      console.log(`   - ${file}`);
    }
  }

  if (missingFiles.length > 0) {
    console.log(`\n[警告] 存在しない関連ファイル（新規作成が必要）:`);
    for (const file of missingFiles) {
      console.log(`   - ${file}`);
    }
  }

  console.log(`\n仕様書の変更内容に合わせて、上記ファイルを確認・修正してください。`);
  console.log('='.repeat(70) + '\n');

  // @spec コメントの警告
  for (const warning of specWarnings) {
    console.log(`[WARNING] ${warning.file} に仕様書参照がありません。`);
    console.log(`  追加推奨: /** @spec ${warning.specRef} */\n`);
  }
}

/**
 * メイン処理
 */
function main(input) {
  try {
    // 入力の検証
    if (!input || typeof input !== 'object') {
      process.exit(0);
    }

    // スキップフラグのチェック
    if (process.env.SKIP_SPEC_SYNC_CHECK === 'true') {
      process.exit(0);
    }

    const filePath = input.tool_input?.file_path || '';

  // 仕様書の変更かチェック
  if (!isSpecPath(filePath)) {
    process.exit(0);
  }

  // 仕様書ファイルの存在確認
  if (!fs.existsSync(filePath)) {
    process.exit(0);
  }

  // 仕様書の内容を読み取り
  const content = fs.readFileSync(filePath, 'utf-8');

  // @related-files タグから関連ファイルを抽出
  const relatedFiles = extractRelatedFiles(content);

  if (relatedFiles === null) {
    console.log(`\n[INFO] 仕様書に関連ファイルが定義されていません: ${filePath}`);
    console.log(`\n<!-- @related-files --> タグを追加してください。\n`);
    process.exit(0);
  }

  if (relatedFiles.length === 0) {
    process.exit(0);
  }

  // プロジェクトベースディレクトリを取得
  const projectBaseDir = getProjectBaseDir();

  // 関連ファイルの存在チェック
  const { existingFiles, missingFiles } = checkRelatedFiles(relatedFiles, projectBaseDir);

  // @spec コメントのチェック
  const specWarnings = checkSpecComments(existingFiles, projectBaseDir, filePath);

    // 通知メッセージを出力
    printNotification(filePath, existingFiles, missingFiles, specWarnings);
  } catch (e) {
    // エラー時は許可（安全側に倒す）
  }

  process.exit(0);
}

// タイムアウト処理（3秒）
const timeout = setTimeout(() => {
  process.exit(0);
}, 3000);

// 非同期stdin読み取り
let inputData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (inputData += chunk));
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
    // エラーは無視
    process.exit(0);
  }
});
