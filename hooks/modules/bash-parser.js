/**
 * REQ-8: Bashコマンド解析モジュール
 * Bashコマンドからファイル操作を抽出
 * @spec docs/spec/features/scope-validator.md
 */

/**
 * Bashコマンドから操作対象ファイルを抽出
 * @param {string} command - Bashコマンド文字列
 * @returns {string[]} 操作対象ファイルパスの配列
 */
function parseFilesFromBashCommand(command) {
  const files = [];

  // リダイレクト先: > file, >> file
  const redirectPattern = /(?:>>?|2>>?)\s*([^\s|&;>]+)/g;
  let match;
  while ((match = redirectPattern.exec(command)) !== null) {
    if (!match[1].startsWith('/dev/')) {
      files.push(match[1]);
    }
  }

  // cp/mv dest: cp src dest, mv src dest
  const cpMvPattern = /\b(?:cp|mv)\s+(?:-[\w]+\s+)*([^\s]+)\s+([^\s|&;]+)/g;
  while ((match = cpMvPattern.exec(command)) !== null) {
    files.push(match[2]);
  }

  // tee: | tee file
  const teePattern = /\btee\s+(?:-a\s+)?([^\s|&;]+)/g;
  while ((match = teePattern.exec(command)) !== null) {
    files.push(match[1]);
  }

  // touch: touch file
  const touchPattern = /\btouch\s+([^\s|&;]+)/g;
  while ((match = touchPattern.exec(command)) !== null) {
    files.push(match[1]);
  }

  // mkdir: mkdir [-p] dir
  const mkdirPattern = /\bmkdir\s+(?:-p\s+)?([^\s|&;]+)/g;
  while ((match = mkdirPattern.exec(command)) !== null) {
    files.push(match[1]);
  }

  return files;
}

module.exports = { parseFilesFromBashCommand };
