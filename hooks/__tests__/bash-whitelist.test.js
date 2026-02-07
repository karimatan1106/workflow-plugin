/**
 * REQ-2: Bashコマンドホワイトリスト化のテスト
 *
 * 本テストは、仕様書の REQ-2 に基づき、Bashコマンドのホワイトリスト方式を検証する。
 * ブラックリスト方式からホワイトリスト方式に転換することで、未知のバイパス手法を防止する。
 *
 * @spec /mnt/c/ツール/Workflow/docs/workflows/ワ-クフロ-全問題完全解決/spec.md REQ-2
 * @spec /mnt/c/ツール/Workflow/docs/workflows/ワ-クフロ-全問題完全解決/test-design.md TC-2-*
 */

const assert = require('assert');

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

  // ビルド修正（build_check）
  build_check: [
    // 全コマンド許可（フックでチェックしない）
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
  // インタプリタ（実行禁止）
  'python', 'python3', 'perl', 'ruby', 'php', 'lua',
  // シェル実行
  'bash -c', 'sh -c', 'zsh -c', 'eval',
  // ファイル書き込み系
  'dd', 'tee', '> ', '>> ', 'base64 -d >', 'printf >', 'echo >',
  // 危険なコマンド
  'rm -rf', 'sudo', 'su', 'chmod +x',
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
    return []; // build_checkは全コマンド許可（ホワイトリスト不要）
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
function checkBashWhitelist(command, phase) {
  const trimmed = command.trim();

  // 1. ブラックリストチェック（全フェーズ共通）
  for (const pattern of BASH_BLACKLIST) {
    if (trimmed.includes(pattern)) {
      return {
        allowed: false,
        reason: `禁止されたコマンド/パターン: ${pattern}`,
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

  // build_check フェーズは全コマンド許可
  if (phase === 'build_check') {
    return { allowed: true };
  }

  // ホワイトリストに含まれるかチェック
  for (const allowedCommand of whitelist) {
    if (trimmed.startsWith(allowedCommand)) {
      return { allowed: true };
    }
  }

  // ホワイトリストにない場合は拒否
  return {
    allowed: false,
    reason: `このコマンドは ${phase} フェーズで許可されていません`,
  };
}

// =============================================================================
// テストケース
// =============================================================================

describe('REQ-2: Bashコマンドホワイトリスト化', () => {
  describe('TC-2-1: 読み取りフェーズでls/cat/git statusが許可されること', () => {
    it('researchフェーズでlsが許可されること', () => {
      const result = checkBashWhitelist('ls src/', 'research');
      assert.strictEqual(result.allowed, true, 'ls コマンドが許可されるべき');
    });

    it('researchフェーズでcatが許可されること', () => {
      const result = checkBashWhitelist('cat README.md', 'research');
      assert.strictEqual(result.allowed, true, 'cat コマンドが許可されるべき');
    });

    it('researchフェーズでgit statusが許可されること', () => {
      const result = checkBashWhitelist('git status', 'research');
      assert.strictEqual(result.allowed, true, 'git status コマンドが許可されるべき');
    });

    it('researchフェーズでgit logが許可されること', () => {
      const result = checkBashWhitelist('git log --oneline -5', 'research');
      assert.strictEqual(result.allowed, true, 'git log コマンドが許可されるべき');
    });
  });

  describe('TC-2-2: 読み取りフェーズでpython3/perl/dd/base64がブロックされること', () => {
    it('researchフェーズでpython3による書き込みがブロックされること', () => {
      const result = checkBashWhitelist('python3 -c "open(\'src/main.ts\',\'w\').write(\'code\')"', 'research');
      assert.strictEqual(result.allowed, false, 'python3 コマンドがブロックされるべき');
      assert.ok(result.reason.includes('python'), 'エラー理由に python が含まれるべき');
    });

    it('researchフェーズでperl -eがブロックされること', () => {
      const result = checkBashWhitelist('perl -e \'open(F,">src/main.ts"); print F "code"\'', 'research');
      assert.strictEqual(result.allowed, false, 'perl コマンドがブロックされるべき');
      assert.ok(result.reason.includes('perl'), 'エラー理由に perl が含まれるべき');
    });

    it('researchフェーズでddコマンドがブロックされること', () => {
      const result = checkBashWhitelist('dd of=src/main.ts <<< \'code\'', 'research');
      assert.strictEqual(result.allowed, false, 'dd コマンドがブロックされるべき');
      assert.ok(result.reason.includes('dd'), 'エラー理由に dd が含まれるべき');
    });

    it('researchフェーズでbase64デコードがブロックされること', () => {
      const result = checkBashWhitelist('echo \'Y29kZQ==\' | base64 -d > src/main.ts', 'research');
      assert.strictEqual(result.allowed, false, 'base64 -d > コマンドがブロックされるべき');
      assert.ok(result.reason.includes('base64 -d >'), 'エラー理由に base64 -d > が含まれるべき');
    });
  });

  describe('TC-2-3: testingフェーズでnpx vitestが許可されること', () => {
    it('testingフェーズでnpx vitest runが許可されること', () => {
      const result = checkBashWhitelist('npx vitest run', 'testing');
      assert.strictEqual(result.allowed, true, 'npx vitest run コマンドが許可されるべき');
    });

    it('testingフェーズでnpm testが許可されること', () => {
      const result = checkBashWhitelist('npm test', 'testing');
      assert.strictEqual(result.allowed, true, 'npm test コマンドが許可されるべき');
    });

    it('testingフェーズでnpx tsc --noEmitが許可されること', () => {
      const result = checkBashWhitelist('npx tsc --noEmit', 'testing');
      assert.strictEqual(result.allowed, true, 'npx tsc --noEmit コマンドが許可されるべき');
    });
  });

  describe('TC-2-4: implementationフェーズでnpm installが許可されること', () => {
    it('implementationフェーズでnpm installが許可されること', () => {
      const result = checkBashWhitelist('npm install axios', 'implementation');
      assert.strictEqual(result.allowed, true, 'npm install コマンドが許可されるべき');
    });

    it('implementationフェーズでpnpm addが許可されること', () => {
      const result = checkBashWhitelist('pnpm add lodash', 'implementation');
      assert.strictEqual(result.allowed, true, 'pnpm add コマンドが許可されるべき');
    });

    it('implementationフェーズでmkdir -pが許可されること', () => {
      const result = checkBashWhitelist('mkdir -p src/utils', 'implementation');
      assert.strictEqual(result.allowed, true, 'mkdir -p コマンドが許可されるべき');
    });
  });

  describe('TC-2-5: commitフェーズでgit add/commitのみ許可されること', () => {
    it('commitフェーズでgit addが許可されること', () => {
      const result = checkBashWhitelist('git add src/', 'commit');
      assert.strictEqual(result.allowed, true, 'git add コマンドが許可されるべき');
    });

    it('commitフェーズでgit commitが許可されること', () => {
      const result = checkBashWhitelist('git commit -m "test"', 'commit');
      assert.strictEqual(result.allowed, true, 'git commit コマンドが許可されるべき');
    });
  });

  describe('TC-2-6: commitフェーズでnpm installがブロックされること', () => {
    it('commitフェーズでnpm installがブロックされること', () => {
      const result = checkBashWhitelist('npm install', 'commit');
      assert.strictEqual(result.allowed, false, 'npm install コマンドがブロックされるべき');
      assert.ok(result.reason.includes('commit フェーズで許可されていません'), 'エラー理由にフェーズ名が含まれるべき');
    });
  });

  describe('TC-2-7: リダイレクト付きコマンドがブロックされること', () => {
    it('echo > file.ts がブロックされること', () => {
      const result = checkBashWhitelist('echo \'code\' > src/main.ts', 'research');
      assert.strictEqual(result.allowed, false, 'echo > コマンドがブロックされるべき');
      assert.ok(result.reason.includes('> '), 'エラー理由に > が含まれるべき');
    });

    it('cat >> file.ts がブロックされること', () => {
      const result = checkBashWhitelist('cat template.ts >> src/main.ts', 'research');
      assert.strictEqual(result.allowed, false, 'cat >> コマンドがブロックされるべき');
      assert.ok(result.reason.includes('>> '), 'エラー理由に >> が含まれるべき');
    });

    it('printf > file.ts がブロックされること', () => {
      const result = checkBashWhitelist('printf \'code\' > src/main.ts', 'research');
      assert.strictEqual(result.allowed, false, 'printf > コマンドがブロックされるべき');
      assert.ok(result.reason.includes('printf >'), 'エラー理由に printf > が含まれるべき');
    });
  });

  describe('TC-2-8: bash -c "rm -rf /" がブロックされること', () => {
    it('bash -c での危険なコマンドがブロックされること', () => {
      const result = checkBashWhitelist('bash -c "rm -rf /"', 'research');
      assert.strictEqual(result.allowed, false, 'bash -c コマンドがブロックされるべき');
      assert.ok(result.reason.includes('bash -c'), 'エラー理由に bash -c が含まれるべき');
    });

    it('evalでの危険なコマンドがブロックされること', () => {
      const result = checkBashWhitelist('eval "rm -rf /"', 'research');
      assert.strictEqual(result.allowed, false, 'eval コマンドがブロックされるべき');
      assert.ok(result.reason.includes('eval'), 'エラー理由に eval が含まれるべき');
    });
  });

  describe('TC-2-9: python3 -c "open(...)" がブロックされること', () => {
    it('python3 -c でのファイル書き込みがブロックされること', () => {
      const result = checkBashWhitelist('python3 -c "open(\'file\',\'w\')"', 'research');
      assert.strictEqual(result.allowed, false, 'python3 -c コマンドがブロックされるべき');
      assert.ok(result.reason.includes('python'), 'エラー理由に python が含まれるべき');
    });
  });

  describe('TC-2-10: build_checkフェーズでは全コマンドが許可されること', () => {
    it('build_checkフェーズでnpm installが許可されること', () => {
      const result = checkBashWhitelist('npm install', 'build_check');
      assert.strictEqual(result.allowed, true, 'npm install コマンドが許可されるべき');
    });

    it('build_checkフェーズでnpx tscが許可されること', () => {
      const result = checkBashWhitelist('npx tsc', 'build_check');
      assert.strictEqual(result.allowed, true, 'npx tsc コマンドが許可されるべき');
    });

    it('build_checkフェーズでecho > が許可されること（ビルド修正のため）', () => {
      const result = checkBashWhitelist('echo \'fix\' > src/fix.ts', 'build_check');
      // build_check は全コマンド許可だが、ブラックリストは依然適用される
      // 仕様ではブラックリストチェックは全フェーズ共通なので、実際にはブロックされる
      // ただし、仕様書 TC-2-11 では「全コマンドが許可される」とあるため、
      // build_check では ブラックリストチェックをスキップする必要がある
      // → 実装時に checkBashWhitelist の先頭で build_check をチェックする必要がある

      // 現在の実装では、ブラックリストチェックが先に行われるため、
      // 仕様通りにするには実装を修正する必要がある
      // テストは仕様に従って記述する
      assert.strictEqual(result.allowed, true, 'build_check フェーズでは全コマンドが許可されるべき');
    });
  });

  describe('TC-2-11: node -e "require(\'fs\').writeFileSync(...)" がブロックされること', () => {
    it('node -e でfs.writeFileSyncがブロックされること', () => {
      const result = checkBashWhitelist('node -e "require(\'fs\').writeFileSync(\'src/main.ts\',\'code\')"', 'research');
      assert.strictEqual(result.allowed, false, 'node -e での書き込みがブロックされるべき');
      assert.ok(result.reason.includes('fs.writeFileSync'), 'エラー理由に fs.writeFileSync が含まれるべき');
    });

    it('node -e でfs.appendFileSyncがブロックされること', () => {
      const result = checkBashWhitelist('node -e "require(\'fs\').appendFileSync(\'src/main.ts\',\'code\')"', 'research');
      assert.strictEqual(result.allowed, false, 'node -e での追記がブロックされるべき');
      assert.ok(result.reason.includes('fs.appendFileSync'), 'エラー理由に fs.appendFileSync が含まれるべき');
    });

    it('node -e でfs.openがブロックされること', () => {
      const result = checkBashWhitelist('node -e "require(\'fs\').openSync(\'src/main.ts\',\'w\')"', 'research');
      assert.strictEqual(result.allowed, false, 'node -e でのファイルオープンがブロックされるべき');
      assert.ok(result.reason.includes('fs.openSync'), 'エラー理由に fs.openSync が含まれるべき');
    });
  });

  describe('フェーズ別ホワイトリスト取得', () => {
    it('researchフェーズで読み取り専用コマンドのみ返されること', () => {
      const whitelist = getWhitelistForPhase('research');
      assert.ok(whitelist.includes('ls'), 'ls が含まれるべき');
      assert.ok(whitelist.includes('cat'), 'cat が含まれるべき');
      assert.ok(!whitelist.includes('npm install'), 'npm install は含まれないべき');
      assert.ok(!whitelist.includes('git add'), 'git add は含まれないべき');
    });

    it('testingフェーズで読み取り+テストコマンドが返されること', () => {
      const whitelist = getWhitelistForPhase('testing');
      assert.ok(whitelist.includes('ls'), 'ls が含まれるべき');
      assert.ok(whitelist.includes('npx vitest'), 'npx vitest が含まれるべき');
      assert.ok(!whitelist.includes('git add'), 'git add は含まれないべき');
    });

    it('implementationフェーズで読み取り+テスト+実装コマンドが返されること', () => {
      const whitelist = getWhitelistForPhase('implementation');
      assert.ok(whitelist.includes('ls'), 'ls が含まれるべき');
      assert.ok(whitelist.includes('npx vitest'), 'npx vitest が含まれるべき');
      assert.ok(whitelist.includes('npm install'), 'npm install が含まれるべき');
      assert.ok(!whitelist.includes('git add'), 'git add は含まれないべき');
    });

    it('commitフェーズで読み取り+gitコマンドが返されること', () => {
      const whitelist = getWhitelistForPhase('commit');
      assert.ok(whitelist.includes('ls'), 'ls が含まれるべき');
      assert.ok(whitelist.includes('git add'), 'git add が含まれるべき');
      assert.ok(!whitelist.includes('npm install'), 'npm install は含まれないべき');
    });

    it('build_checkフェーズで空配列が返されること（全コマンド許可）', () => {
      const whitelist = getWhitelistForPhase('build_check');
      assert.deepStrictEqual(whitelist, [], 'build_check は空配列を返すべき');
    });
  });
});

// エクスポート（他のモジュールからテスト用に使用可能）
module.exports = {
  checkBashWhitelist,
  getWhitelistForPhase,
  BASH_WHITELIST,
  BASH_BLACKLIST,
  NODE_E_BLACKLIST,
};
