#!/usr/bin/env node
/**
 * workflow-plugin インストール/更新スクリプト
 *
 * 使用方法:
 *   node workflow-plugin/install.js
 *
 * 機能:
 *   - workflow-phasesのハードリンク作成
 *   - スキルのハードリンク作成
 *   - .claude/settings.json へのフックマージ
 *   - .mcp.json へのMCPサーバー設定追加
 *   - MCPサーバーのビルド（必要時）
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// パス定義
const PLUGIN_DIR = __dirname;
// 親ディレクトリにインストール（git clone後に実行される想定）
const PROJECT_ROOT = path.dirname(PLUGIN_DIR);
const CLAUDE_DIR = path.join(PROJECT_ROOT, '.claude');
const SKILLS_DIR = path.join(CLAUDE_DIR, 'skills');
const PHASES_LINK = path.join(CLAUDE_DIR, 'workflow-phases');

// 色付き出力
const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
};

function log(message, type = 'info') {
  const prefix = {
    info: colors.cyan('ℹ'),
    success: colors.green('✓'),
    warn: colors.yellow('⚠'),
    error: colors.red('✗'),
  };
  console.log(`${prefix[type] || prefix.info} ${message}`);
}

/**
 * 1. workflow-phasesのハードリンク作成
 */
function setupPhases() {
  log('workflow-phasesをセットアップ中...', 'info');

  const srcDir = path.join(PLUGIN_DIR, 'workflow-phases');
  const destDir = PHASES_LINK;

  // ディレクトリ作成
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  // 既存のジャンクション/シンボリックリンクを削除
  try {
    const stat = fs.lstatSync(destDir);
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(destDir);
      fs.mkdirSync(destDir, { recursive: true });
      log('古いジャンクションを削除', 'warn');
    }
  } catch (e) {
    // 存在しない場合は無視
  }

  // ソースディレクトリ内の全ファイルをハードリンク
  const files = fs.readdirSync(srcDir);
  let created = 0;
  let skipped = 0;

  for (const file of files) {
    const srcFile = path.join(srcDir, file);
    const destFile = path.join(destDir, file);

    // ディレクトリはスキップ
    if (fs.statSync(srcFile).isDirectory()) continue;

    if (fs.existsSync(destFile)) {
      const srcStat = fs.statSync(srcFile);
      const destStat = fs.statSync(destFile);

      // 同じinode（ハードリンク）かチェック
      if (srcStat.ino === destStat.ino) {
        skipped++;
        continue;
      }

      // 異なるファイルなら削除
      fs.unlinkSync(destFile);
    }

    fs.linkSync(srcFile, destFile);
    created++;
  }

  if (created > 0) {
    log(`workflow-phases: ${created}ファイルをハードリンク作成`, 'success');
  }
  if (skipped > 0) {
    log(`workflow-phases: ${skipped}ファイルは既にリンク済み`, 'success');
  }
}

/**
 * 2. スキルのハードリンク作成
 */
function setupSkills() {
  log('スキルをセットアップ中...', 'info');

  const srcSkill = path.join(PLUGIN_DIR, 'skills', 'workflow', 'SKILL.md');
  const destSkillDir = path.join(SKILLS_DIR, 'workflow');
  const destSkill = path.join(destSkillDir, 'SKILL.md');

  // ディレクトリ作成
  if (!fs.existsSync(destSkillDir)) {
    fs.mkdirSync(destSkillDir, { recursive: true });
  }

  // 既存ファイルの確認
  if (fs.existsSync(destSkill)) {
    const srcStat = fs.statSync(srcSkill);
    const destStat = fs.statSync(destSkill);

    // 同じinode（ハードリンク）かチェック
    if (srcStat.ino === destStat.ino) {
      log('スキル: 既にリンク済み', 'success');
      return;
    }

    // 異なるファイルなら削除
    fs.unlinkSync(destSkill);
    log('古いSKILL.mdを削除', 'warn');
  }

  // ハードリンク作成
  fs.linkSync(srcSkill, destSkill);
  log('スキル: ハードリンク作成完了', 'success');
}

/**
 * 3. .claude/settings.json へのフックマージ
 */
function mergeSettings() {
  log('settings.jsonをマージ中...', 'info');

  const pluginSettings = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_DIR, 'settings.json'), 'utf-8')
  );

  const claudeSettingsPath = path.join(CLAUDE_DIR, 'settings.json');
  let claudeSettings = {};

  if (fs.existsSync(claudeSettingsPath)) {
    claudeSettings = JSON.parse(fs.readFileSync(claudeSettingsPath, 'utf-8'));
  }

  // フックのマージ
  if (!claudeSettings.hooks) {
    claudeSettings.hooks = {};
  }

  // PreToolUse フックのマージ
  mergeHooks(claudeSettings, pluginSettings, 'PreToolUse');

  // PostToolUse フックのマージ
  mergeHooks(claudeSettings, pluginSettings, 'PostToolUse');

  // 保存
  fs.writeFileSync(
    claudeSettingsPath,
    JSON.stringify(claudeSettings, null, 2) + '\n'
  );

  log('settings.json: マージ完了', 'success');
}

/**
 * フックをマージするヘルパー関数
 */
function mergeHooks(target, source, hookType) {
  if (!source.hooks || !source.hooks[hookType]) return;

  if (!target.hooks[hookType]) {
    target.hooks[hookType] = [];
  }

  for (const sourceEntry of source.hooks[hookType]) {
    // 同じmatcherのエントリを探す
    let existingEntry = target.hooks[hookType].find(
      e => e.matcher === sourceEntry.matcher
    );

    if (!existingEntry) {
      // 新しいmatcherの場合は追加
      target.hooks[hookType].push({ ...sourceEntry });
      continue;
    }

    // 既存のmatcherにフックを追加
    for (const hook of sourceEntry.hooks) {
      const hookExists = existingEntry.hooks.some(
        h => h.command === hook.command
      );

      if (!hookExists) {
        existingEntry.hooks.push(hook);
      }
    }
  }
}

/**
 * 4. .mcp.json へのMCPサーバー設定追加
 */
function setupMcpServer() {
  log('MCPサーバー設定を更新中...', 'info');

  const mcpJsonPath = path.join(PROJECT_ROOT, '.mcp.json');
  let mcpConfig = { mcpServers: {} };

  if (fs.existsSync(mcpJsonPath)) {
    mcpConfig = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8'));
  }

  // 絶対パスでMCPサーバーを参照
  // cwdはプロジェクトルート（process.cwd()が正しいパスを返すように）
  const absoluteServerPath = path.join(PLUGIN_DIR, 'mcp-server', 'dist', 'index.js');

  mcpConfig.mcpServers.workflow = {
    command: 'node',
    args: [absoluteServerPath],
    cwd: PROJECT_ROOT
  };

  fs.writeFileSync(
    mcpJsonPath,
    JSON.stringify(mcpConfig, null, 2) + '\n'
  );

  log('.mcp.json: 更新完了', 'success');
}

/**
 * 5. MCPサーバーのビルド
 */
function buildMcpServer() {
  log('MCPサーバーをビルド中...', 'info');

  const serverDir = path.join(PLUGIN_DIR, 'mcp-server');
  const distDir = path.join(serverDir, 'dist');

  // distが存在しない、またはsrcより古い場合にビルド
  const needsBuild = !fs.existsSync(distDir) || isOutdated(serverDir);

  if (!needsBuild) {
    log('MCPサーバー: ビルド済み（最新）', 'success');
    return;
  }

  try {
    // 依存関係インストール
    if (!fs.existsSync(path.join(serverDir, 'node_modules'))) {
      log('依存関係をインストール中...', 'info');
      execSync('pnpm install', { cwd: serverDir, stdio: 'pipe' });
    }

    // ビルド
    execSync('pnpm build', { cwd: serverDir, stdio: 'pipe' });
    log('MCPサーバー: ビルド完了', 'success');
  } catch (e) {
    log(`ビルド失敗: ${e.message}`, 'error');
  }
}

/**
 * srcディレクトリがdistより新しいかチェック
 */
function isOutdated(serverDir) {
  const srcDir = path.join(serverDir, 'src');
  const distDir = path.join(serverDir, 'dist');

  if (!fs.existsSync(distDir)) return true;

  const getLatestMtime = (dir) => {
    let latest = 0;
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
      const fullPath = path.join(dir, file.name);
      if (file.isDirectory()) {
        latest = Math.max(latest, getLatestMtime(fullPath));
      } else {
        latest = Math.max(latest, fs.statSync(fullPath).mtimeMs);
      }
    }
    return latest;
  };

  return getLatestMtime(srcDir) > getLatestMtime(distDir);
}

/**
 * メイン処理
 */
async function main() {
  console.log('\n' + colors.cyan('═══════════════════════════════════════'));
  console.log(colors.cyan('  workflow-plugin インストーラー'));
  console.log(colors.cyan('═══════════════════════════════════════') + '\n');

  try {
    setupPhases();
    setupSkills();
    mergeSettings();
    setupMcpServer();
    buildMcpServer();

    console.log('\n' + colors.green('═══════════════════════════════════════'));
    console.log(colors.green('  インストール完了！'));
    console.log(colors.green('═══════════════════════════════════════'));
    console.log('\n使用方法:');
    console.log('  /workflow start <タスク名>  - タスク開始');
    console.log('  /workflow status           - 状態確認');
    console.log('  /workflow next             - 次フェーズへ\n');

  } catch (e) {
    log(`インストール失敗: ${e.message}`, 'error');
    console.error(e);
    process.exit(1);
  }
}

main();
