/**
 * REQ-8: ファイルタイプ検出モジュール
 * phase-edit-guard.jsから抽出したファイルタイプ判定ロジック
 * @spec docs/spec/features/scope-validator.md
 */

const path = require('path');

/**
 * ファイルパスからファイルタイプを判定
 * @param {string} filePath - 判定対象のファイルパス
 * @returns {string} ファイルタイプ ('source'|'test'|'markdown'|'config'|'mermaid'|'style'|'unknown')
 */
function getFileType(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  const ext = path.extname(normalized).toLowerCase();
  const basename = path.basename(normalized);

  // テストファイル判定（拡張子より優先）
  if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(basename)) {
    return 'test';
  }
  if (/\/tests?\//.test(normalized) || /\/__tests__\//.test(normalized)) {
    return 'test';
  }
  if (/\.stories\.(ts|tsx|js|jsx)$/.test(basename)) {
    return 'test'; // Storybookストーリーもテスト扱い
  }

  // Mermaid
  if (ext === '.mmd' || ext === '.mermaid') {
    return 'mermaid';
  }

  // Markdown
  if (ext === '.md' || ext === '.mdx') {
    return 'markdown';
  }

  // ソースコード
  if (['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte'].includes(ext)) {
    return 'source';
  }

  // スタイル
  if (['.css', '.scss', '.less', '.sass'].includes(ext)) {
    return 'style';
  }

  // 設定ファイル
  if (['.json', '.yaml', '.yml', '.toml', '.env'].includes(ext)) {
    return 'config';
  }
  if (basename.startsWith('.') || basename.includes('config') || basename.includes('rc')) {
    return 'config';
  }

  return 'unknown';
}

module.exports = { getFileType };
