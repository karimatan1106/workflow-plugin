#!/usr/bin/env node
/**
 * workflow-plugin インストール/更新スクリプト
 *
 * 使用方法:
 *   node workflow-plugin/install.js
 *
 * 機能:
 *   - コマンドのハードリンク作成
 *   - workflow-phasesのジャンクション作成
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
const PROJECT_ROOT = PLUGIN_DIR; // プラグインディレクトリ自体にインストール
const CLAUDE_DIR = path.join(PROJECT_ROOT, '.claude');
const COMMANDS_DIR = path.join(CLAUDE_DIR, 'commands');
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
 * 1. コマンドのハードリンク作成
 */
function setupCommands() {
  log('コマンドをセットアップ中...', 'info');

  const srcCommand = path.join(PLUGIN_DIR, 'commands', 'workflow.md');
  const destCommand = path.join(COMMANDS_DIR, 'workflow.md');

  // ディレクトリ作成
  if (!fs.existsSync(COMMANDS_DIR)) {
    fs.mkdirSync(COMMANDS_DIR, { recursive: true });
  }

  // 既存ファイルの確認
  if (fs.existsSync(destCommand)) {
    const srcStat = fs.statSync(srcCommand);
    const destStat = fs.statSync(destCommand);

    // 同じinode（ハードリンク）かチェック
    if (srcStat.ino === destStat.ino) {
      log('コマンド: 既にリンク済み', 'success');
      return;
    }

    // 異なるファイルなら削除
    fs.unlinkSync(destCommand);
    log('古いworkflow.mdを削除', 'warn');
  }

  // ハードリンク作成
  fs.linkSync(srcCommand, destCommand);
  log('コマンド: ハードリンク作成完了', 'success');
}

/**
 * 2. workflow-phasesのジャンクション作成
 */
function setupPhases() {
  log('workflow-phasesをセットアップ中...', 'info');

  const srcPhases = path.join(PLUGIN_DIR, 'workflow-phases');

  // 既存のリンク/ディレクトリを確認
  if (fs.existsSync(PHASES_LINK)) {
    const stat = fs.lstatSync(PHASES_LINK);

    if (stat.isSymbolicLink() || stat.isDirectory()) {
      // ジャンクションかシンボリックリンクの場合
      try {
        const target = fs.realpathSync(PHASES_LINK);
        if (target === fs.realpathSync(srcPhases)) {
          log('workflow-phases: 既にリンク済み', 'success');
          return;
        }
      } catch (e) {
        // リンクが壊れている場合は削除
      }

      // 削除（ジャンクションはrmdirで削除）
      if (process.platform === 'win32') {
        fs.rmdirSync(PHASES_LINK);
      } else {
        fs.unlinkSync(PHASES_LINK);
      }
      log('古いworkflow-phasesを削除', 'warn');
    }
  }

  // ジャンクション作成（Windows）またはシンボリックリンク（Unix）
  if (process.platform === 'win32') {
    // Windowsではmklinkコマンドでジャンクション作成
    const relativeSrc = path.relative(CLAUDE_DIR, srcPhases);
    try {
      execSync(`mklink /J "${PHASES_LINK}" "${srcPhases}"`, {
        stdio: 'pipe',
        shell: true
      });
      log('workflow-phases: ジャンクション作成完了', 'success');
    } catch (e) {
      log(`ジャンクション作成失敗: ${e.message}`, 'error');
    }
  } else {
    // Unix系ではシンボリックリンク
    const relativeSrc = path.relative(CLAUDE_DIR, srcPhases);
    fs.symlinkSync(relativeSrc, PHASES_LINK);
    log('workflow-phases: シンボリックリンク作成完了', 'success');
  }
}

/**
 * 3. スキルのジャンクション作成
 */
function setupSkills() {
  log('スキルをセットアップ中...', 'info');

  const srcSkills = path.join(PLUGIN_DIR, 'skills', 'workflow');
  const destSkills = path.join(SKILLS_DIR, 'workflow');

  // skillsディレクトリ作成
  if (!fs.existsSync(SKILLS_DIR)) {
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
  }

  // 既存のリンク/ディレクトリを確認
  if (fs.existsSync(destSkills)) {
    const stat = fs.lstatSync(destSkills);

    if (stat.isSymbolicLink() || stat.isDirectory()) {
      try {
        const target = fs.realpathSync(destSkills);
        if (target === fs.realpathSync(srcSkills)) {
          log('スキル: 既にリンク済み', 'success');
          return;
        }
      } catch (e) {
        // リンクが壊れている場合は削除
      }

      // 削除（ジャンクションはrmdirで削除）
      if (process.platform === 'win32') {
        fs.rmdirSync(destSkills);
      } else {
        fs.unlinkSync(destSkills);
      }
      log('古いスキルリンクを削除', 'warn');
    }
  }

  // ジャンクション作成（Windows）またはシンボリックリンク（Unix）
  if (process.platform === 'win32') {
    try {
      execSync(`mklink /J "${destSkills}" "${srcSkills}"`, {
        stdio: 'pipe',
        shell: true
      });
      log('スキル: ジャンクション作成完了', 'success');
    } catch (e) {
      log(`ジャンクション作成失敗: ${e.message}`, 'error');
    }
  } else {
    const relativeSrc = path.relative(SKILLS_DIR, srcSkills);
    fs.symlinkSync(relativeSrc, destSkills);
    log('スキル: シンボリックリンク作成完了', 'success');
  }
}

/**
 * 4. .claude/settings.json へのフックマージ
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
 * 5. .mcp.json へのMCPサーバー設定追加
 */
function setupMcpServer() {
  log('MCPサーバー設定を更新中...', 'info');

  const mcpJsonPath = path.join(PROJECT_ROOT, '.mcp.json');
  let mcpConfig = { mcpServers: {} };

  if (fs.existsSync(mcpJsonPath)) {
    mcpConfig = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8'));
  }

  // プラグインディレクトリ名を取得（相対パス用）
  const pluginDirName = path.basename(PLUGIN_DIR);

  // 相対パスを使用（プロジェクトルートからの相対パス）
  const relativeServerPath = `${pluginDirName}/mcp-server/dist/index.js`;
  const relativeServerCwd = `${pluginDirName}/mcp-server`;

  mcpConfig.mcpServers.workflow = {
    command: 'node',
    args: [relativeServerPath],
    cwd: relativeServerCwd
  };

  fs.writeFileSync(
    mcpJsonPath,
    JSON.stringify(mcpConfig, null, 2) + '\n'
  );

  log('.mcp.json: 更新完了', 'success');
}

/**
 * 6. MCPサーバーのビルド
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
    setupCommands();
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
