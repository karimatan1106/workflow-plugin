/**
 * REQ-2: Bashコマンドホワイトリスト化
 *
 * フェーズ別許可コマンドホワイトリストによるBashコマンド検証。
 * ブラックリスト方式からホワイトリスト方式に転換することで、未知のバイパス手法を防止する。
 *
 * @spec /mnt/c/ツール/Workflow/docs/workflows/ワークフロー全問題完全解決/spec.md REQ-2
 */

// REQ-R3: セキュリティ保護対象の環境変数
const SECURITY_ENV_VARS = [
  'HMAC_STRICT', 'SCOPE_STRICT', 'SESSION_TOKEN_REQUIRED',
  'HMAC_AUTO_RECOVER', 'SKIP_WORKFLOW', 'SKIP_LOOP_DETECTOR',
  'VALIDATE_DESIGN_STRICT', 'SPEC_FIRST_TTL_MS',
];

/**
 * フェーズ別許可コマンドホワイトリスト
 *
 * 各フェーズで許可されるBashコマンドのホワイトリスト。
 * ここに記載されていないコマンドは全てブロックされる。
 */
const BASH_WHITELIST = {
  // 読み取り専用コマンド（research, requirements, threat_modeling, planning等）
  readonly: [
    // ファイル操作（読み取りのみ）
    'ls', 'cat', 'head', 'tail', 'less', 'more', 'wc', 'file',
    // 検索
    'find', 'grep', 'rg', 'ag',
    // Git（読み取りのみ）
    'git status', 'git log', 'git diff', 'git show', 'git branch',
    'git ls-files', 'git ls-tree', 'git rev-parse', 'git remote',
    // その他
    'pwd', 'which', 'whereis', 'date', 'uname', 'whoami',
    // 出力（リダイレクトなしならOK - ブラックリストで > 検出）
    'echo',
    // node -e（読み取り系のみ - 後述の検証が必要）
    'node -e',
  ],

  // テスト実行コマンド（testing, regression_test）
  testing: [
    // テストランナー
    'npm test', 'npm run test', 'npx vitest', 'npx vitest run',
    'npx jest', 'npx mocha', 'npx ava',
    // 型チェック
    'npx tsc --noEmit',
    // Linter
    'npx eslint', 'npx prettier --check',
    // その他
    'npm run lint', 'npm run type-check',
    'node ',
  ],

  // 実装コマンド（implementation, refactoring）
  implementation: [
    // パッケージ管理
    'npm install', 'npm ci', 'pnpm install', 'pnpm add', 'yarn install',
    // ビルド
    'npm run build', 'npx tsc', 'npx webpack', 'npx vite build',
    // ディレクトリ作成
    'mkdir', 'mkdir -p',
    'node ',
  ],

  // ビルド修正（build_check）- REQ-2: ホワイトリスト + ブラックリスト適用
  // 他フェーズで許可されているコマンド + ビルド修正専用コマンド
  build_check: 'auto', // readonly + testing + implementation + 削除コマンド

  // コミット（commit, push）
  git: [
    'git add', 'git commit', 'git push', 'git pull', 'git fetch',
  ],
};

/**
 * 全フェーズで禁止されるコマンド・パターン
 *
 * インタプリタ実行やファイル書き込み系コマンドは全フェーズで禁止。
 */
const BASH_BLACKLIST = [
  // インタプリタ（実行禁止） - 正規表現パターンで単語境界を表現
  { pattern: 'python3', type: 'prefix' },
  { pattern: 'python', type: 'prefix' },
  { pattern: 'perl', type: 'prefix' },
  { pattern: 'ruby', type: 'prefix' },
  { pattern: 'php', type: 'prefix' },
  { pattern: 'lua', type: 'prefix' },
  // シェル実行
  { pattern: 'bash -c', type: 'contains' },
  { pattern: 'sh -c', type: 'contains' },
  { pattern: 'zsh -c', type: 'contains' },
  { pattern: 'eval ', type: 'contains' },
  // FR-5: パイプ経由のシェル実行
  { pattern: '| sh', type: 'contains' },
  { pattern: '| bash', type: 'contains' },
  { pattern: '| zsh', type: 'contains' },
  // ファイル書き込み系（コマンドとして使われる場合のみ）
  { pattern: /(?<!=)> /, type: 'regex' },
  { pattern: '>> ', type: 'contains' },
  { pattern: 'base64 -d >', type: 'contains' },
  { pattern: 'printf >', type: 'contains' },
  { pattern: 'echo >', type: 'contains' },
  // FR-5: awk + リダイレクト (prefix チェック後にリダイレクト検出)
  { pattern: 'awk', type: 'awk-redirect' },
  // FR-5: curl/wget with output
  { pattern: 'curl -o', type: 'contains' },
  { pattern: 'curl --output', type: 'contains' },
  { pattern: 'wget -O', type: 'contains' },
  { pattern: 'wget --output', type: 'contains' },
  // FR-5: ネットワークリスナー
  { pattern: 'nc -l', type: 'contains' },
  // FR-5: 低レベルディスク操作
  { pattern: 'dd ', type: 'prefix' },
  // FR-5: バイナリダンプ + リダイレクト
  { pattern: 'xxd', type: 'xxd-redirect' },
  // 危険なコマンド
  { pattern: 'rm -rf', type: 'contains' },
  { pattern: 'chmod +x', type: 'contains' },
];

/**
 * node -e で禁止されるパターン
 */

/**
 * REQ-3: AST解析による識別子抽出
 * 文字列連結（例: fs['write' + 'FileSync']）を解決して最終的な識別子を取得
 */
function extractIdentifiersFromAST(code) {
  try {
    // Use Function constructor to parse (lightweight, no external deps)
    const identifiers = new Set();

    // 文字列連結パターンを検出: obj['str1' + 'str2'] or obj["str1" + "str2"]
    const concatPattern = /\[\s*(['"])(\w+)\1\s*\+\s*(['"])(\w+)\3\s*\]/g;
    let match;
    while ((match = concatPattern.exec(code)) !== null) {
      identifiers.add(match[2] + match[4]);
    }

    // テンプレートリテラルパターン: `${prefix}FileSync`
    const templatePattern = /\`[^\x60]*\$\{([^}]+)\}[^\x60]*\`/g;
    while ((match = templatePattern.exec(code)) !== null) {
      // テンプレートリテラル使用自体を危険とみなす
      identifiers.add('TEMPLATE_LITERAL_DETECTED');
    }

    // eval()パターン検出
    if (code.includes('eval(') || code.includes('eval (')) {
      // eval内の文字列を展開して解析
      const evalContentMatch = code.match(/eval\s*\(\s*(['"])(.*?)\1\s*\)/);
      if (evalContentMatch) {
        const evalContent = evalContentMatch[2];
        const innerIds = extractIdentifiersFromAST(evalContent);
        innerIds.forEach(id => identifiers.add(id));
      }
      // eval + require + readFileSync パターン
      if (code.includes('require') && code.includes('readFileSync')) {
        identifiers.add('EVAL_FILE_EXECUTION');
      }
    }

    // Function constructorパターン
    if (code.includes('Function(') || code.includes('new Function')) {
      identifiers.add('FUNCTION_CONSTRUCTOR');
    }

    return identifiers;
  } catch (e) {
    return new Set();
  }
}

/**
 * D-3: シェル組み込みコマンド定義
 * splitCompoundCommand分割後、これらはホワイトリスト検証をスキップする
 */
const SHELL_BUILTINS = new Set(['true', 'false', 'exit', 'set', 'unset', 'export', 'test', ':']);

const NODE_E_BLACKLIST = [
  'fs.writeFileSync', 'fs.writeSync', 'fs.appendFileSync',
  'fs.createWriteStream', 'fs.open', 'fs.openSync',
  '.write(', '.writeFile', '.appendFile',
  // FR-5: child_process 実行
  'child_process', 'execSync', 'spawnSync',
];

/**
 * フェーズに応じたホワイトリストを取得
 *
 * @param {string} phase - フェーズ名
 * @returns {string[]} 許可コマンドリスト
 */
function getWhitelistForPhase(phase) {
  const readonlyPhases = [
    'research', 'requirements', 'threat_modeling', 'planning',
    'state_machine', 'flowchart', 'ui_design', 'test_design',
    'design_review', 'code_review', 'manual_test',
  ];

  // FR-1: docs_updateフェーズ（readonly + gh）
  const docsUpdatePhases = ['docs_update'];

  // FR-2: parallel_verificationサブフェーズ（readonly + testing + gh）
  const verificationPhases = ['security_scan', 'performance_test', 'e2e_test', 'ci_verification'];

  const testingPhases = ['testing', 'regression_test'];
  const implementationPhases = ['test_impl', 'implementation', 'refactoring'];
  const deployPhases = ['deploy'];
  const gitPhases = ['commit', 'push'];

  if (readonlyPhases.includes(phase)) {
    return BASH_WHITELIST.readonly;
  } else if (docsUpdatePhases.includes(phase)) {
    // FR-1: docs_updateはreadonlyコマンド + ghコマンドを許可
    return [...BASH_WHITELIST.readonly, 'gh'];
  } else if (verificationPhases.includes(phase)) {
    // FR-2: verification系サブフェーズはreadonly + testing + ghを許可
    return [...BASH_WHITELIST.readonly, ...BASH_WHITELIST.testing, 'gh'];
  } else if (testingPhases.includes(phase)) {
    return [...BASH_WHITELIST.readonly, ...BASH_WHITELIST.testing];
  } else if (implementationPhases.includes(phase)) {
    return [
      ...BASH_WHITELIST.readonly,
      ...BASH_WHITELIST.testing,
      ...BASH_WHITELIST.implementation,
    ];
  } else if (deployPhases.includes(phase)) {
    // D-2: deployフェーズはreadonly + implementation + deploy用コマンドを許可
    return [...BASH_WHITELIST.readonly, ...BASH_WHITELIST.implementation, 'docker', 'kubectl', 'ssh', 'helm', 'gh'];
  } else if (gitPhases.includes(phase)) {
    return [...BASH_WHITELIST.readonly, ...BASH_WHITELIST.git];
  } else if (phase === 'build_check' || phase === 'parallel_quality') {
    // REQ-2: build_checkはビルド修正に必要なコマンドを全て許可
    return [
      ...BASH_WHITELIST.readonly,
      ...BASH_WHITELIST.testing,
      ...BASH_WHITELIST.implementation,
      'rm -f', // 削除コマンド
    ];
  } else {
    return BASH_WHITELIST.readonly; // デフォルトは読み取りのみ
  }
}

/**
 * コマンド文字列を分割（複合コマンド対応）
 *
 * @param {string} command - コマンド文字列
 * @returns {string[]} 分割されたコマンド部
 */
function splitCommandParts(command) {
  return command.split(/\s*(?:&&|\|\||;)\s*/).filter(p => p.trim().length > 0);
}

/**
 * コマンド部がリダイレクトを含むかチェック
 *
 * @param {string} part - コマンド部
 * @returns {boolean}
 */
function hasRedirection(part) {
  return part.includes('>') || part.includes('>>');
}

/**
 * ブラックリストパターンにマッチするかチェック
 *
 * @param {string} command - チェック対象のコマンド文字列
 * @param {{pattern: string, type: string}} entry - ブラックリストエントリ
 * @returns {boolean} マッチした場合 true
 */
function matchesBlacklistEntry(command, entry) {
  const parts = splitCommandParts(command);

  switch (entry.type) {
    case 'prefix':
      // コマンドの各パートの先頭にマッチ
      return parts.some(part => part.trim().startsWith(entry.pattern));

    case 'awk-redirect':
      // awk + リダイレクト検出
      return parts.some(part => {
        const trimmed = part.trim();
        return trimmed.startsWith('awk') && hasRedirection(trimmed);
      });

    case 'xxd-redirect':
      // xxd + リダイレクト検出
      return parts.some(part => {
        const trimmed = part.trim();
        return trimmed.startsWith('xxd') && hasRedirection(trimmed);
      });

    case 'regex':
      return entry.pattern.test(command);

    case 'contains':
      // 部分一致（コマンド全体で検査）
      return command.includes(entry.pattern);

    default:
      return false;
  }
}

/**
 * REQ-9: 複合コマンドを分割（クォート内のセミコロンを保護）
 *
 * node -e "var a=1;console.log(a)" のクォート内セミコロンを
 * Bashのコマンド区切りとして誤解析しないよう保護する。
 */
function splitCompoundCommand(command) {
  // Step 1: クォート内容をプレースホルダーに置換
  const placeholders = [];
  let processed = command;

  // ダブルクォート内の内容を置換
  processed = processed.replace(/"([^"]*?)"/g, (match) => {
    const idx = placeholders.length;
    placeholders.push(match);
    return `__QUOTE_PLACEHOLDER_${idx}__`;
  });

  // シングルクォート内の内容を置換
  processed = processed.replace(/'([^']*?)'/g, (match) => {
    const idx = placeholders.length;
    placeholders.push(match);
    return `__QUOTE_PLACEHOLDER_${idx}__`;
  });

  // Step 2: プレースホルダー状態で分割（splitCommandParts と同じロジック）
  const parts = processed.split(/\s*(?:&&|\|\||;|\|)\s*/).filter(p => p.trim().length > 0);

  // Step 3: プレースホルダーを元に戻す
  return parts.map(part => {
    let restored = part;
    for (let i = 0; i < placeholders.length; i++) {
      restored = restored.replace(`__QUOTE_PLACEHOLDER_${i}__`, placeholders[i]);
    }
    return restored.trim();
  });
}

/**
 * base64エンコードされたコマンドをデコード
 *
 * @param {string} encodedStr - base64文字列
 * @returns {string|null} デコード後の文字列、またはnull
 */
function decodeBase64Safe(encodedStr) {
  try {
    return Buffer.from(encodedStr, 'base64').toString('utf8');
  } catch (e) {
    console.error('[bash-whitelist] base64デコードエラー:', e.message);
    return null;
  }
}

/**
 * 16進エスケープシーケンス（\xNN）をデコード
 *
 * @param {string} hexStr - 16進エスケープシーケンス含む文字列
 * @returns {string} デコード後の文字列
 */
function decodeHexSequences(hexStr) {
  return hexStr.replace(/\\x([0-9a-fA-F]{2})/g, (match, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
}

/**
 * 8進エスケープシーケンス（\NNN）をデコード
 *
 * @param {string} octStr - 8進エスケープシーケンス含む文字列
 * @returns {string} デコード後の文字列
 */
function decodeOctalSequences(octStr) {
  return octStr.replace(/\\([0-7]{3})/g, (match, oct) => {
    return String.fromCharCode(parseInt(oct, 8));
  });
}

/**
 * REQ-C1: エンコードされたコマンドを検出してデコード
 *
 * base64エンコード、printf/echo エスケープシーケンスを検出し、
 * デコードした結果をホワイトリスト照合にかける。
 *
 * @param {string} command - コマンド文字列
 * @param {string} phase - フェーズ名
 * @returns {{allowed: boolean, reason?: string}} 検証結果
 */
function detectEncodedCommand(command, phase) {
  // base64 -d / base64 --decode パターン検出
  if (/base64\s+(-d|--decode)/.test(command)) {
    const base64Match = command.match(/echo\s+["']?([A-Za-z0-9+/=]+)["']?\s*\|/);
    if (base64Match) {
      const decoded = decodeBase64Safe(base64Match[1]);
      if (decoded) {
        console.error('[bash-whitelist] base64デコード検出:', decoded);
        const result = checkBashWhitelist(decoded, phase);
        if (!result.allowed) {
          return {
            allowed: false,
            reason: `base64エンコードされた危険コマンド: ${result.reason}`
          };
        }
      }
    }
  }

  // printf \xNN パターン検出
  const printfMatch = command.match(/printf\s+["']([^"']*\\x[0-9a-fA-F]{2}[^"']*)["']/);
  if (printfMatch) {
    const decoded = decodeHexSequences(printfMatch[1]);
    console.error('[bash-whitelist] printf 16進エンコード検出:', decoded);
    const result = checkBashWhitelist(decoded, phase);
    if (!result.allowed) {
      return {
        allowed: false,
        reason: `printf 16進エンコードされた危険コマンド: ${result.reason}`
      };
    }
  }

  // echo -e \NNN パターン検出
  const echoMatch = command.match(/echo\s+-e\s+["']([^"']*\\[0-7]{3}[^"']*)["']/);
  if (echoMatch) {
    const decoded = decodeOctalSequences(echoMatch[1]);
    console.error('[bash-whitelist] echo 8進エンコード検出:', decoded);
    const result = checkBashWhitelist(decoded, phase);
    if (!result.allowed) {
      return {
        allowed: false,
        reason: `echo 8進エンコードされた危険コマンド: ${result.reason}`
      };
    }
  }

  return { allowed: true };
}

/**
 * クォート除去
 *
 * @param {string} str - 文字列
 * @returns {string} クォート除去後の文字列
 */
function removeQuotes(str) {
  return str.replace(/^["']|["']$/g, '');
}

/**
 * REQ-C1: 間接実行（eval/exec/sh -c）を検出
 *
 * eval, exec, sh -c, bash -c, パイプ経由のシェル実行を検出し、
 * 実行対象文字列をホワイトリスト照合にかける。
 *
 * @param {string} command - コマンド文字列
 * @param {string} phase - フェーズ名
 * @returns {{allowed: boolean, reason?: string}} 検証結果
 */
function detectIndirectExecution(command, phase) {
  // eval / exec パターン
  const evalMatch = command.match(/\b(eval|exec)\s+(.+)/);
  if (evalMatch) {
    const unquoted = removeQuotes(evalMatch[2].trim());
    console.error('[bash-whitelist] eval/exec 検出:', unquoted);
    const result = checkBashWhitelist(unquoted, phase);
    if (!result.allowed) {
      return {
        allowed: false,
        reason: `${evalMatch[1]} による間接実行: ${result.reason}`
      };
    }
  }

  // sh -c / bash -c パターン
  const shellMatch = command.match(/\b(sh|bash|zsh)\s+-c\s+(.+)/);
  if (shellMatch) {
    const unquoted = removeQuotes(shellMatch[2].trim());
    console.error('[bash-whitelist] sh/bash -c 検出:', unquoted);
    const result = checkBashWhitelist(unquoted, phase);
    if (!result.allowed) {
      return {
        allowed: false,
        reason: `${shellMatch[1]} -c による間接実行: ${result.reason}`
      };
    }
  }

  // パイプ経由のシェル実行（| sh / | bash）
  if (/\|\s*(sh|bash|zsh)\s*$/.test(command)) {
    const inputPart = command.split('|')[0].trim();
    console.error('[bash-whitelist] パイプ経由シェル実行検出:', inputPart);
    const result = checkBashWhitelist(inputPart, phase);
    if (!result.allowed) {
      return {
        allowed: false,
        reason: `パイプ経由シェル実行: ${result.reason}`
      };
    }
  }

  return { allowed: true };
}

/**
 * D-6: git -C オプションを正規化
 * git -C /path/to/dir status → git status に変換
 * @param {string} cmd - コマンド文字列
 * @returns {string} 正規化されたコマンド
 */
function normalizeGitCommand(cmd) {
  if (!cmd.startsWith('git ')) return cmd;
  // -C <path> ペアを全て除去
  return cmd.replace(/\s+-C\s+\S+/g, '').replace(/\s+/g, ' ').trim();
}

function checkBashWhitelist(command, phase) {
  const trimmed = command.trim();

  // FR-3: commitフェーズでのheredoc許可
  let commandToCheck = trimmed;
  const heredocReplacements = [];

  if (phase === 'commit' && /^git\s+commit\s+.*\$\(\s*cat\s+<</.test(trimmed)) {
    // heredocパターンを検出してプレースホルダに置換
    commandToCheck = trimmed.replace(/\$\(\s*cat\s+<<'?(\w+)'?\s*([\s\S]*?)\1\s*\)/g, (match, delimiter, content) => {
      const idx = heredocReplacements.length;
      heredocReplacements.push(match);
      return `__HEREDOC_PLACEHOLDER_${idx}__`;
    });

    // heredoc前後にコマンド連結がないことを確認
    const parts = commandToCheck.split(/\s*(?:&&|\|\||;)\s*/).filter(p => p.trim().length > 0);
    if (parts.length > 1) {
      // heredoc内のgit commitコマンド以外の部分にコマンド連結がある
      const hasExternalChaining = parts.some(part =>
        !part.includes('git commit') && part.trim().length > 0
      );
      if (hasExternalChaining) {
        return {
          allowed: false,
          reason: 'git commit heredoc前後にコマンド連結が検出されました',
        };
      }
    }
  }

  // REQ-C1: エンコードされたコマンド検出（base64/printf/echo）
  const encodedResult = detectEncodedCommand(commandToCheck, phase);
  if (!encodedResult.allowed) {
    return encodedResult;
  }

  // REQ-C1: 間接実行検出（eval/exec/sh -c）
  const indirectResult = detectIndirectExecution(commandToCheck, phase);
  if (!indirectResult.allowed) {
    return indirectResult;
  }

  // REQ-R3: セキュリティ環境変数の変更をブロック
  for (const envVar of SECURITY_ENV_VARS) {
    if (commandToCheck.includes(envVar)) {
      const exportPattern = new RegExp(`\\b(export|unset)\\s+(['"]?${envVar}['"]?)`, 'i');
      const envCmdPattern = new RegExp(`\\benv\\s+${envVar}=`, 'i');
      if (exportPattern.test(commandToCheck) || envCmdPattern.test(commandToCheck)) {
        return { allowed: false, reason: 'セキュリティ設定の変更は許可されていません' };
      }
    }
  }

  // REQ-2: build_checkでもブラックリストを適用（早期リターン削除）
  // 1. ブラックリストチェック（全フェーズ共通）
  for (const entry of BASH_BLACKLIST) {
    if (matchesBlacklistEntry(commandToCheck, entry)) {
      return {
        allowed: false,
        reason: `禁止されたコマンド/パターン: ${entry.pattern}`,
      };
    }
  }

  // 2. node -e の特別チェック
  if (commandToCheck.startsWith('node -e') || commandToCheck.includes('node -e')) {
    const scriptPart = commandToCheck.substring(commandToCheck.indexOf('-e') + 2).trim();
    for (const pattern of NODE_E_BLACKLIST) {
      if (scriptPart.includes(pattern)) {
        return {
          allowed: false,
          reason: `node -e でのファイル書き込みは禁止されています: ${pattern}`,
        };
      }
    }
  }

  // 3. フェーズ別ホワイトリストチェック
  const whitelist = getWhitelistForPhase(phase);

  // REQ-9: 複合コマンド（&&, ||, ;）を分割（クォート内保護）
  const commandParts = splitCompoundCommand(commandToCheck);

  for (const part of commandParts) {
    const partTrimmed = part.trim();

    // cd コマンドは全フェーズで許可（ディレクトリ移動のみ）
    if (partTrimmed.startsWith('cd ') || partTrimmed === 'cd') {
      continue;
    }

    // D-3: シェル組み込みコマンドはホワイトリスト検証をスキップ
    const shellCmd = partTrimmed.split(/\s+/)[0];
    if (SHELL_BUILTINS.has(shellCmd)) {
      continue;
    }

    // ホワイトリストに含まれるかチェック
    // D-6: git -C オプションを正規化してからマッチング
    const normalizedPart = normalizeGitCommand(partTrimmed);
    let partAllowed = false;
    for (const allowedCommand of whitelist) {
      // REQ-R6: 厳格なホワイトリストマッチ（単語境界チェック）
      if (normalizedPart.startsWith(allowedCommand)) {
        const nextChar = normalizedPart[allowedCommand.length];
        if (!nextChar || /\s/.test(nextChar) || /[;&|<>]/.test(nextChar)) {
          partAllowed = true;
          break;
        }
      }
    }

    if (!partAllowed) {
      return {
        allowed: false,
        reason: `このコマンドは ${phase} フェーズで許可されていません: ${partTrimmed.substring(0, 80)}`,
      };
    }
  }

  return { allowed: true };
}

// エクスポート
module.exports = {
  checkBashWhitelist,
  getWhitelistForPhase,
  splitCompoundCommand,  // REQ-9: テスト用にエクスポート
  detectEncodedCommand,  // REQ-C1: テスト用にエクスポート
  detectIndirectExecution,  // REQ-C1: テスト用にエクスポート
  BASH_WHITELIST,
  BASH_BLACKLIST,
  NODE_E_BLACKLIST,
};
