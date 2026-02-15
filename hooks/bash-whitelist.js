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

// NEW-SEC-1: ゼロ幅Unicode文字のサニタイズパターン
const ZERO_WIDTH_CHARS_PATTERN = /[\u200B\u200C\u200D\uFEFF]/g;

/**
 * NEW-SEC-1: ゼロ幅Unicode文字をサニタイズ
 * @param {string} str - サニタイズ対象の文字列
 * @returns {string} サニタイズ後の文字列
 */
function sanitizeZeroWidthChars(str) {
  return str.replace(ZERO_WIDTH_CHARS_PATTERN, '');
}

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
    // BUG-3: mkdir -p（ワークフロー成果物ディレクトリ作成用、validateMkdirTargetで制限）
    'mkdir -p',
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
    // BUG-1修正: 末尾スペースを除去（REQ-R6境界チェックで'nodejs'等を除外）
    'node',
  ],

  // 実装コマンド（implementation, refactoring）
  implementation: [
    // パッケージ管理
    'npm install', 'npm ci', 'pnpm install', 'pnpm add', 'yarn install',
    // ビルド
    'npm run build', 'npx tsc', 'npx webpack', 'npx vite build',
    // ディレクトリ作成
    'mkdir', 'mkdir -p',
    // BUG-1修正: 末尾スペースを除去（REQ-R6境界チェックで'nodejs'等を除外）
    'node',
  ],

  // ビルド修正（build_check）- REQ-2: ホワイトリスト + ブラックリスト適用
  // 他フェーズで許可されているコマンド + ビルド修正専用コマンド
  build_check: 'auto', // readonly + testing + implementation + 削除コマンド

  // コミット（commit, push）
  git: [
    'git add', 'git commit', 'git push', 'git pull', 'git fetch',
    'git checkout --', 'git restore',
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
  // FIX-5: git checkout/restore の危険パターン
  { pattern: 'git checkout -b', type: 'contains' },
  { pattern: 'git checkout .', type: 'contains' },
  { pattern: 'git restore .', type: 'contains' },
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
      identifiers.add('TEMPLATE_LITERAL_DETECTED');
    }

    // eval()パターン検出
    if (code.includes('eval(') || code.includes('eval (')) {
      const evalContentMatch = code.match(/eval\s*\(\s*(['"])(.*?)\1\s*\)/);
      if (evalContentMatch) {
        const evalContent = evalContentMatch[2];
        const innerIds = extractIdentifiersFromAST(evalContent);
        innerIds.forEach(id => identifiers.add(id));
      }
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

  const docsUpdatePhases = ['docs_update'];
  const verificationPhases = ['security_scan', 'performance_test', 'e2e_test', 'ci_verification'];
  const testingPhases = ['testing', 'regression_test'];
  const implementationPhases = ['test_impl', 'implementation', 'refactoring'];
  const deployPhases = ['deploy'];
  const gitPhases = ['commit', 'push'];

  if (readonlyPhases.includes(phase)) {
    return BASH_WHITELIST.readonly;
  } else if (docsUpdatePhases.includes(phase)) {
    return [...BASH_WHITELIST.readonly, 'gh'];
  } else if (verificationPhases.includes(phase)) {
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
    return [...BASH_WHITELIST.readonly, ...BASH_WHITELIST.implementation, 'docker', 'kubectl', 'ssh', 'helm', 'gh'];
  } else if (gitPhases.includes(phase)) {
    return [...BASH_WHITELIST.readonly, ...BASH_WHITELIST.git];
  } else if (phase === 'build_check' || phase === 'parallel_quality') {
    return [
      ...BASH_WHITELIST.readonly,
      ...BASH_WHITELIST.testing,
      ...BASH_WHITELIST.implementation,
      'rm -f',
    ];
  } else {
    return BASH_WHITELIST.readonly;
  }
}

/**
 * コマンド文字列を分割（複合コマンド対応）
 */
function splitCommandParts(command) {
  command = sanitizeZeroWidthChars(command);
  return command.split(/\s*(?:&&|\|\||;)\s*/).filter(p => p.trim().length > 0);
}

/**
 * コマンド部がリダイレクトを含むかチェック
 */
function hasRedirection(part) {
  return part.includes('>') || part.includes('>>');
}

/**
 * ブラックリストパターンにマッチするかチェック
 */
function matchesBlacklistEntry(command, entry) {
  const parts = splitCommandParts(command);

  switch (entry.type) {
    case 'prefix':
      return parts.some(part => part.trim().startsWith(entry.pattern));

    case 'awk-redirect':
      return parts.some(part => {
        const trimmed = part.trim();
        return trimmed.startsWith('awk') && hasRedirection(trimmed);
      });

    case 'xxd-redirect':
      return parts.some(part => {
        const trimmed = part.trim();
        return trimmed.startsWith('xxd') && hasRedirection(trimmed);
      });

    case 'regex':
      return entry.pattern.test(command);

    case 'contains':
      return command.includes(entry.pattern);

    default:
      return false;
  }
}

/**
 * HIGH-4: コマンドチェーン分割関数（クォート状態を追跡）
 */
function splitCommandChain(cmd) {
  const commands = [];
  let currentCommand = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let i = 0; i < cmd.length; i++) {
    const char = cmd[i];
    const nextChar = cmd[i + 1];
    const next2Chars = cmd.substring(i, i + 2);

    if (escaped) {
      currentCommand += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      currentCommand += char;
      escaped = true;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      currentCommand += char;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      currentCommand += char;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote) {
      if (next2Chars === '&&' || next2Chars === '||') {
        if (currentCommand.trim().length > 0) {
          commands.push(currentCommand.trim());
        }
        currentCommand = '';
        i++;
        continue;
      }

      if (char === ';') {
        if (currentCommand.trim().length > 0) {
          commands.push(currentCommand.trim());
        }
        currentCommand = '';
        continue;
      }
    }

    currentCommand += char;
  }

  if (currentCommand.trim().length > 0) {
    commands.push(currentCommand.trim());
  }

  return commands;
}

/**
 * REQ-9: 複合コマンドを分割（クォート内のセミコロンを保護）
 */
function splitCompoundCommand(command) {
  command = sanitizeZeroWidthChars(command);
  return splitCommandChain(command);
}

/**
 * base64エンコードされたコマンドをデコード
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
 */
function decodeHexSequences(hexStr) {
  return hexStr.replace(/\\x([0-9a-fA-F]{2})/g, (match, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
}

/**
 * 8進エスケープシーケンス（\NNN）をデコード
 */
function decodeOctalSequences(octStr) {
  return octStr.replace(/\\([0-7]{3})/g, (match, oct) => {
    return String.fromCharCode(parseInt(oct, 8));
  });
}

/**
 * REQ-C1: エンコードされたコマンドを検出してデコード
 */
function detectEncodedCommand(command, phase) {
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
      } else {
        return {
          allowed: false,
          reason: 'Base64 decoding failed - possibly malformed or malicious input'
        };
      }
    }
  }

  const printfMatch = command.match(/printf\s+["']([^"']*\\x[0-9a-fA-F]{2}[^"']*)["']/);
  if (printfMatch) {
    const decoded = decodeHexSequences(printfMatch[1]);
    if (decoded) {
      console.error('[bash-whitelist] printf 16進エンコード検出:', decoded);
      const result = checkBashWhitelist(decoded, phase);
      if (!result.allowed) {
        return {
          allowed: false,
          reason: `printf 16進エンコードされた危険コマンド: ${result.reason}`
        };
      }
    } else {
      return {
        allowed: false,
        reason: 'Printf hex decoding failed - possibly malformed or malicious input'
      };
    }
  }

  const echoMatch = command.match(/echo\s+-e\s+["']([^"']*\\[0-7]{3}[^"']*)["']/);
  if (echoMatch) {
    const decoded = decodeOctalSequences(echoMatch[1]);
    if (decoded) {
      console.error('[bash-whitelist] echo 8進エンコード検出:', decoded);
      const result = checkBashWhitelist(decoded, phase);
      if (!result.allowed) {
        return {
          allowed: false,
          reason: `echo 8進エンコードされた危険コマンド: ${result.reason}`
        };
      }
    } else {
      return {
        allowed: false,
        reason: 'Echo octal decoding failed - possibly malformed or malicious input'
      };
    }
  }

  return { allowed: true };
}

/**
 * クォート除去
 */
function removeQuotes(str) {
  return str.replace(/^["']|["']$/g, '');
}

/**
 * REQ-C1: 間接実行（eval/exec/sh -c）を検出
 */
function detectIndirectExecution(command, phase) {
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
 * REQ-4: コマンド置換・プロセス置換・変数展開の検出
 * バイパス対策として、これらのパターンを検出してブロックする
 */
function detectSubstitutionPatterns(command) {
  // プロセス置換パターン: <(...) または >(...)
  const processSubstitutionPattern = /[<>]\s*\(/;
  if (processSubstitutionPattern.test(command)) {
    return {
      allowed: false,
      reason: 'プロセス置換 (<(...) または >(...)) は禁止されています'
    };
  }

  // 変数展開内のコマンド置換: ${...$(...)...}
  const varExpansionCmdPattern = /\$\{[^}]*\$\(/;
  if (varExpansionCmdPattern.test(command)) {
    return {
      allowed: false,
      reason: '変数展開内のコマンド置換 (${var:-$(cmd)}) は禁止されています'
    };
  }

  // ネストしたコマンド置換の深さチェック
  // $( ... $( ... ) ... ) のような多重ネストを検出
  let depth = 0;
  let maxDepth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    const next = command[i + 1];

    // クォート状態の追跡
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    // シングルクォート内ではコマンド置換は展開されないのでスキップ
    if (inSingleQuote) continue;

    // $( の検出
    if (char === '$' && next === '(') {
      depth++;
      maxDepth = Math.max(maxDepth, depth);
      i++; // skip '('
    }
    // ) の検出（コマンド置換の終了）
    else if (char === ')' && depth > 0) {
      depth--;
    }
  }

  // ネストの深さが2以上（コマンド置換の中にさらにコマンド置換）は禁止
  if (maxDepth >= 2) {
    return {
      allowed: false,
      reason: 'ネストしたコマンド置換 ($(... $(... ) ...)) は禁止されています'
    };
  }

  return { allowed: true };
}

/**
 * D-6: git -C オプションを正規化
 */
function normalizeGitCommand(cmd) {
  if (!cmd.startsWith('git ')) return cmd;
  return cmd.replace(/\s+-C\s+\S+/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * BUG-3: mkdir -p のターゲットパスを検証
 * 読み取り専用フェーズでは、ワークフロー成果物ディレクトリと内部状態ディレクトリへのmkdirのみ許可
 * @param {string} command - mkdir コマンド文字列
 * @returns {{ allowed: boolean, reason?: string }}
 */
function validateMkdirTarget(command) {
  const match = command.match(/^mkdir\s+(?:-p\s+)?(.+)/);
  if (!match) return { allowed: false, reason: 'mkdir のパースに失敗しました' };

  const targetPath = match[1].trim().replace(/^['"]|['"]$/g, '');
  const normalized = targetPath.replace(/\\/g, '/');

  if (normalized.includes('..')) {
    return { allowed: false, reason: 'mkdir のパスに .. は使用できません' };
  }

  const allowedPrefixes = ['docs/workflows/', 'docs/security/', '.claude/state/'];
  const isAllowed = allowedPrefixes.some(prefix => normalized.startsWith(prefix));

  if (!isAllowed) {
    return {
      allowed: false,
      reason: `mkdir は許可されたディレクトリのみ作成可能です: ${allowedPrefixes.join(', ')}`,
    };
  }

  return { allowed: true };
}

/**
 * SEC-ENV-1: セキュリティ環境変数の設定をブロック
 * VAR=value command 形式、export/env/unset コマンドでの設定を検出
 * @param {string} commandPart - コマンドチェーンの一部
 * @returns {{ allowed: boolean, reason?: string }}
 */
function checkSecurityEnvVar(commandPart) {
  // インライン環境変数設定: VAR=value command
  for (const envVar of SECURITY_ENV_VARS) {
    const inlinePattern = new RegExp(`^${envVar}=\\S+\\s+`, 'i');
    if (inlinePattern.test(commandPart)) {
      return {
        allowed: false,
        reason: `セキュリティ環境変数のインライン設定がブロックされました: ${envVar}`,
      };
    }
  }

  // export コマンド: export VAR=value または export VAR
  if (/^export\s+/i.test(commandPart)) {
    for (const envVar of SECURITY_ENV_VARS) {
      const exportPattern = new RegExp(`^export\\s+(['"]?${envVar}['"]?)(\\s|=|$)`, 'i');
      if (exportPattern.test(commandPart)) {
        return {
          allowed: false,
          reason: `セキュリティ環境変数の変更がブロックされました: ${envVar}`,
        };
      }
    }
  }

  // env コマンド: env VAR=value
  if (/^env\s+/i.test(commandPart)) {
    for (const envVar of SECURITY_ENV_VARS) {
      const envPattern = new RegExp(`\\benv\\s+${envVar}=`, 'i');
      if (envPattern.test(commandPart)) {
        return {
          allowed: false,
          reason: `セキュリティ環境変数の変更がブロックされました: ${envVar}`,
        };
      }
    }
  }

  // unset コマンド: unset VAR
  if (/^unset\s+/i.test(commandPart)) {
    for (const envVar of SECURITY_ENV_VARS) {
      const unsetPattern = new RegExp(`^unset\\s+(['"]?${envVar}['"]?)($|\\s)`, 'i');
      if (unsetPattern.test(commandPart)) {
        return {
          allowed: false,
          reason: `セキュリティ環境変数の変更がブロックされました: ${envVar}`,
        };
      }
    }
  }

  return { allowed: true };
}

function checkBashWhitelist(command, phase) {
  const trimmed = command.trim();

  // FR-3: commitフェーズでのheredoc許可
  let commandToCheck = trimmed;
  const heredocReplacements = [];

  if (phase === 'commit' && /^git\s+commit\s+.*\$\(\s*cat\s+<</.test(trimmed)) {
    commandToCheck = trimmed.replace(/\$\(\s*cat\s+<<'?(\w+)'?\s*([\s\S]*?)\1\s*\)/g, (match, delimiter, content) => {
      const idx = heredocReplacements.length;
      heredocReplacements.push(match);
      return `__HEREDOC_PLACEHOLDER_${idx}__`;
    });

    const parts = commandToCheck.split(/\s*(?:&&|\|\||;)\s*/).filter(p => p.trim().length > 0);
    if (parts.length > 1) {
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

  // REQ-4: コマンド置換・プロセス置換・変数展開の検出
  const substitutionResult = detectSubstitutionPatterns(commandToCheck);
  if (!substitutionResult.allowed) {
    return substitutionResult;
  }

  // SEC-4 + SEC-ENV-1: セキュリティ環境変数保護（統一チェック）
  const chainParts = splitCommandChain(commandToCheck);
  for (const part of chainParts) {
    const envResult = checkSecurityEnvVar(part.trim());
    if (!envResult.allowed) {
      return envResult;
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

  // HIGH-4: コマンドチェーン分割（クォート状態追跡）
  const commandParts = splitCommandChain(commandToCheck);

  for (let index = 0; index < commandParts.length; index++) {
    const part = commandParts[index];
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

    // BUG-3: mkdir -p は追加のパス検証が必要
    if (partAllowed && partTrimmed.startsWith('mkdir')) {
      const mkdirResult = validateMkdirTarget(partTrimmed);
      if (!mkdirResult.allowed) {
        return mkdirResult;
      }
    }

    if (!partAllowed) {
      return {
        allowed: false,
        reason: `コマンドチェーン違反（インデックス ${index}）: ${partTrimmed.substring(0, 80)}`,
      };
    }
  }

  return { allowed: true };
}

// エクスポート
module.exports = {
  checkBashWhitelist,
  getWhitelistForPhase,
  splitCommandParts,     // NEW-SEC-1: テスト用にエクスポート
  splitCommandChain,     // HIGH-4: テスト用にエクスポート
  splitCompoundCommand,  // REQ-9: テスト用にエクスポート
  detectEncodedCommand,  // REQ-C1: テスト用にエクスポート
  detectIndirectExecution,  // REQ-C1: テスト用にエクスポート
  detectSubstitutionPatterns,  // REQ-4: テスト用にエクスポート
  validateMkdirTarget,     // BUG-3: テスト用にエクスポート
  checkSecurityEnvVar,     // SEC-ENV-1: テスト用にエクスポート
  BASH_WHITELIST,
  BASH_BLACKLIST,
  NODE_E_BLACKLIST,
};
