/**
 * REQ-2: Bashコマンドホワイトリスト化
 *
 * フェーズ別許可コマンドホワイトリストによるBashコマンド検証。
 * ブラックリスト方式からホワイトリスト方式に転換することで、未知のバイパス手法を防止する。
 *
 * @spec /mnt/c/ツール/Workflow/docs/workflows/ワークフロー全問題完全解決/spec.md REQ-2
 */

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
    'git ls-files', 'git ls-tree', 'git rev-parse',
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
  ],

  // 実装コマンド（implementation, refactoring）
  implementation: [
    // パッケージ管理
    'npm install', 'npm ci', 'pnpm install', 'pnpm add', 'yarn install',
    // ビルド
    'npm run build', 'npx tsc', 'npx webpack', 'npx vite build',
    // ディレクトリ作成
    'mkdir', 'mkdir -p',
  ],

  // ビルド修正（build_check）- REQ-2: ホワイトリスト + ブラックリスト適用
  build_check: [
    // パッケージマネージャー
    'npm install', 'npm ci', 'npm run build', 'npm run',
    'pnpm install', 'pnpm add', 'pnpm run build', 'pnpm run',
    'yarn install', 'yarn add', 'yarn build', 'yarn run',
    // ビルドツール
    'npx tsc', 'npx webpack', 'npx vite build', 'npx vite',
    'npx esbuild', 'npx rollup',
    // 基本コマンド
    'mkdir', 'mkdir -p',
    'rm -f',
    'node',
    // 読み取り系（readonlyを継承）
    'ls', 'cat', 'head', 'tail', 'less', 'more', 'wc', 'file',
    'find', 'grep', 'rg', 'ag',
    'git status', 'git log', 'git diff', 'git show', 'git branch',
    'git ls-files', 'git ls-tree', 'git rev-parse',
    'pwd', 'which', 'whereis', 'date', 'uname', 'whoami',
    'node -e',
  ],

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
  // ファイル書き込み系（コマンドとして使われる場合のみ）
  { pattern: '> ', type: 'contains' },
  { pattern: '>> ', type: 'contains' },
  { pattern: 'base64 -d >', type: 'contains' },
  { pattern: 'printf >', type: 'contains' },
  { pattern: 'echo >', type: 'contains' },
  // 危険なコマンド
  { pattern: 'rm -rf', type: 'contains' },
  { pattern: 'chmod +x', type: 'contains' },
];

/**
 * node -e で禁止されるパターン
 */
const NODE_E_BLACKLIST = [
  'fs.writeFileSync', 'fs.writeSync', 'fs.appendFileSync',
  'fs.createWriteStream', 'fs.open', 'fs.openSync',
  '.write(', '.writeFile', '.appendFile',
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
    'design_review', 'code_review', 'manual_test', 'security_scan',
    'performance_test', 'e2e_test', 'docs_update',
  ];

  const testingPhases = ['testing', 'regression_test'];
  const implementationPhases = ['test_impl', 'implementation', 'refactoring'];
  const gitPhases = ['commit', 'push'];

  if (readonlyPhases.includes(phase)) {
    return BASH_WHITELIST.readonly;
  } else if (testingPhases.includes(phase)) {
    return [...BASH_WHITELIST.readonly, ...BASH_WHITELIST.testing];
  } else if (implementationPhases.includes(phase)) {
    return [
      ...BASH_WHITELIST.readonly,
      ...BASH_WHITELIST.testing,
      ...BASH_WHITELIST.implementation,
    ];
  } else if (gitPhases.includes(phase)) {
    return [...BASH_WHITELIST.readonly, ...BASH_WHITELIST.git];
  } else if (phase === 'build_check') {
    return BASH_WHITELIST.build_check;  // REQ-2: build_checkもホワイトリスト適用
  } else {
    return BASH_WHITELIST.readonly; // デフォルトは読み取りのみ
  }
}

/**
 * Bashコマンドを解析してホワイトリストに基づき許可/拒否を判定
 *
 * @param {string} command - 実行しようとしているコマンド
 * @param {string} phase - 現在のフェーズ
 * @returns {{allowed: boolean, reason?: string}}
 */
/**
 * ブラックリストパターンにマッチするかチェック
 *
 * @param {string} command - チェック対象のコマンド文字列
 * @param {{pattern: string, type: string}} entry - ブラックリストエントリ
 * @returns {boolean} マッチした場合 true
 */
function matchesBlacklistEntry(command, entry) {
  if (entry.type === 'prefix') {
    // コマンドの各パートの先頭にマッチ（単語境界を考慮）
    const parts = command.split(/\s*(?:&&|\|\||;)\s*/).filter(p => p.trim().length > 0);
    for (const part of parts) {
      const trimmedPart = part.trim();
      if (trimmedPart.startsWith(entry.pattern)) {
        return true;
      }
    }
    return false;
  }
  // type === 'contains' の場合は従来通りの部分一致
  return command.includes(entry.pattern);
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
  processed = processed.replace(/"([^"]*?)"/g, (match, content) => {
    const idx = placeholders.length;
    placeholders.push(match);
    return `__QUOTE_PLACEHOLDER_${idx}__`;
  });

  // シングルクォート内の内容を置換
  processed = processed.replace(/'([^']*?)'/g, (match, content) => {
    const idx = placeholders.length;
    placeholders.push(match);
    return `__QUOTE_PLACEHOLDER_${idx}__`;
  });

  // Step 2: プレースホルダー状態で分割
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

function checkBashWhitelist(command, phase) {
  const trimmed = command.trim();

  // REQ-2: build_checkでもブラックリストを適用（早期リターン削除）
  // 1. ブラックリストチェック（全フェーズ共通）
  for (const entry of BASH_BLACKLIST) {
    if (matchesBlacklistEntry(trimmed, entry)) {
      return {
        allowed: false,
        reason: `禁止されたコマンド/パターン: ${entry.pattern}`,
      };
    }
  }

  // 2. node -e の特別チェック
  if (trimmed.startsWith('node -e') || trimmed.includes('node -e')) {
    const scriptPart = trimmed.substring(trimmed.indexOf('-e') + 2).trim();
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
  const commandParts = splitCompoundCommand(trimmed);

  for (const part of commandParts) {
    const partTrimmed = part.trim();

    // cd コマンドは全フェーズで許可（ディレクトリ移動のみ）
    if (partTrimmed.startsWith('cd ') || partTrimmed === 'cd') {
      continue;
    }

    // ホワイトリストに含まれるかチェック
    let partAllowed = false;
    for (const allowedCommand of whitelist) {
      if (partTrimmed.startsWith(allowedCommand)) {
        partAllowed = true;
        break;
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
  BASH_WHITELIST,
  BASH_BLACKLIST,
  NODE_E_BLACKLIST,
};
