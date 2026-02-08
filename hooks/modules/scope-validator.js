/**
 * REQ-8: スコープ検証モジュール
 * ファイルがタスクのスコープ内かチェック
 * @spec docs/spec/features/scope-validator.md
 */

/**
 * ファイルがスコープ内かチェック
 * @param {string} filePath - 検証対象のファイルパス
 * @param {object} scope - スコープ定義 { affectedFiles: string[], affectedDirs: string[] }
 * @returns {boolean} スコープ内ならtrue
 */
function isInScope(filePath, scope) {
  if (!scope) return true; // スコープ未設定なら全許可

  const normalized = filePath.replace(/\\/g, '/');
  const cwd = process.cwd().replace(/\\/g, '/');
  const cwdPrefix = cwd.endsWith('/') ? cwd : cwd + '/';
  const relative = normalized.startsWith(cwdPrefix)
    ? normalized.substring(cwdPrefix.length)
    : normalized;

  // affectedFilesの完全一致チェック
  if (scope.affectedFiles) {
    for (const af of scope.affectedFiles) {
      const normalizedAf = af.replace(/\\/g, '/');
      if (relative === normalizedAf || normalized.endsWith('/' + normalizedAf)) {
        return true;
      }
    }
  }

  // affectedDirsのプレフィックスチェック
  if (scope.affectedDirs) {
    for (const ad of scope.affectedDirs) {
      const normalizedAd = ad.replace(/\\/g, '/');
      const dirPrefix = normalizedAd.endsWith('/') ? normalizedAd : normalizedAd + '/';
      if (relative.startsWith(dirPrefix)) {
        return true;
      }
    }
  }

  return false;
}

module.exports = { isInScope };
