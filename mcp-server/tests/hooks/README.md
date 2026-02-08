# Hooks Tests - REQ-1, REQ-2, REQ-8, REQ-9, REQ-10

## 概要

このディレクトリには、評価レポート全課題解決タスクのREQ-1, REQ-2, REQ-8, REQ-9, REQ-10に対応するテストファイルが含まれています。

## TDD Red Phase

これらのテストは**TDD Red Phase**で作成されており、現時点では**失敗することが期待されます**。

実装フェーズで以下の修正を行うことで、テストがパスするようになります：

## テストファイル一覧

### 1. req1-fail-closed.test.ts (REQ-1)

**対象**: `phase-edit-guard.js` の `canEditInPhase()` 関数

**テストケース**:
- TC-1-1: 未知フェーズでfalseを返す ❌ (現在はtrueを返す)
- TC-1-2: phaseがnullでfalseを返す ❌ (現在はtrueを返す)
- TC-1-3: phaseがundefinedでfalseを返す ❌ (現在はtrueを返す)
- TC-1-4: 既存フェーズは影響なく動作 ✅ (既存動作確認)
- TC-1-5: researchでmarkdown許可 ✅ (既存動作確認)

**必要な修正**:
```javascript
// phase-edit-guard.js の canEditInPhase() 関数
function canEditInPhase(phase, fileType) {
  // REQ-1: null/undefined/空文字フェーズは禁止（fail-closed）
  if (!phase) {
    return false; // 現在: return true
  }

  // 未知のフェーズは禁止（fail-closed）
  const isKnownPhase = PHASE_RULES[phase] || PARALLEL_PHASES[phase];
  if (!isKnownPhase) {
    return false; // 現在: return true
  }

  // ... 以降は既存ロジック
}
```

### 2. req2-build-check.test.ts (REQ-2)

**対象**: `bash-whitelist.js` の `checkBashWhitelist()` 関数

**テストケース**:
- TC-2-1: npm run build許可 ✅
- TC-2-2: rm -rfブロック ❌ (現在は許可される)
- TC-2-3: evalブロック ❌ (現在は許可される)
- TC-2-4: npx tsc許可 ✅
- TC-2-5: python3ブロック ❌ (現在は許可される)

**必要な修正**:
```javascript
// bash-whitelist.js の checkBashWhitelist() 関数
function checkBashWhitelist(command, phase) {
  const trimmed = command.trim();

  // build_check フェーズでもブラックリストチェック実行
  // （現在はスキップされている）
  // 以下の行を削除:
  // if (phase === 'build_check') {
  //   return { allowed: true };
  // }

  // 1. ブラックリストチェック（全フェーズ共通）
  for (const entry of BASH_BLACKLIST) {
    if (matchesBlacklistEntry(trimmed, entry)) {
      return {
        allowed: false,
        reason: `禁止されたコマンド/パターン: ${entry.pattern}`,
      };
    }
  }

  // 2. build_checkの場合、ブラックリストを通過したら許可
  if (phase === 'build_check') {
    return { allowed: true };
  }

  // ... 以降は既存ロジック
}
```

### 3. req8-hook-bypass.test.ts (REQ-8)

**対象**: `phase-edit-guard.js` の `analyzeBashCommand()` 関数

**テストケース**:
- TC-8-1: bash-whitelist許可でバイパス ❌ (isExplicitlyAllowedプロパティ未実装)
- TC-8-2: checkBashWhitelistがallowed=true ✅
- TC-8-3: FILE_MODIFYING_CHECKスキップ ✅

**必要な修正**:
```javascript
// phase-edit-guard.js の analyzeBashCommand() 関数
function analyzeBashCommand(command) {
  if (!command || typeof command !== 'string') {
    return { isModifying: false, filePath: null, isExplicitlyAllowed: false };
  }

  // REQ-8: bash-whitelistチェックを先に実行
  const workflowState = findActiveWorkflowState(null);
  if (workflowState) {
    const whitelistResult = checkBashWhitelist(command, workflowState.phase);
    if (whitelistResult.allowed) {
      // ホワイトリストで許可されたコマンドはバイパス
      return {
        isModifying: false,
        filePath: null,
        isExplicitlyAllowed: true
      };
    }
  }

  // REQ-4: 複合コマンドを分割してチェック
  const commandParts = splitCompoundCommand(command);

  // ... 既存のFILE_MODIFYING_CHECKロジック
}
```

### 4. req9-semicolon.test.ts (REQ-9)

**対象**: `bash-whitelist.js` の内部関数 `splitCompoundCommand()`

**テストケース**:
- TC-9-1: node -e内セミコロン1コマンド ❌ (現在は分割される)
- TC-9-2: node -e外セミコロン正常分割 ✅
- TC-9-3: python -c内セミコロン1コマンド ❌
- TC-9-4: 通常のセミコロン分割 ✅
- TC-9-5: シングルクォート正しく処理 ❌

**必要な修正**:
```javascript
// bash-whitelist.js に新規関数追加
function splitCompoundCommand(command) {
  // REQ-9: クォート内のセミコロンを保護
  const placeholders = [];
  let placeholderIndex = 0;

  // ダブルクォート内を保護
  let processed = command.replace(/"([^"]*)"/g, (match, content) => {
    const placeholder = `__PLACEHOLDER_${placeholderIndex}__`;
    placeholders.push({ placeholder, content: match });
    placeholderIndex++;
    return placeholder;
  });

  // シングルクォート内を保護
  processed = processed.replace(/'([^']*)'/g, (match, content) => {
    const placeholder = `__PLACEHOLDER_${placeholderIndex}__`;
    placeholders.push({ placeholder, content: match });
    placeholderIndex++;
    return placeholder;
  });

  // 分割
  const parts = processed.split(/\s*(?:&&|\|\||;|\|)\s+/).filter(p => p.trim().length > 0);

  // プレースホルダーを復元
  return parts.map(part => {
    let restored = part;
    for (const { placeholder, content } of placeholders) {
      restored = restored.replace(placeholder, content);
    }
    return restored;
  });
}
```

### 5. req10-config-exception.test.ts (REQ-10)

**対象**: `enforce-workflow.js` に新規追加する `isWorkflowConfigFile()` 関数

**テストケース**:
- TC-10-1: workflow-state.jsonでtrue ❌ (関数未実装)
- TC-10-2: .claude/state/workflows/配下でtrue ❌
- TC-10-3: .claude/settings.jsonでtrue ❌
- TC-10-4: package.jsonでfalse ❌
- TC-10-5: src/data.jsonでfalse ❌

**必要な修正**:
```javascript
// enforce-workflow.js に新規関数追加
/**
 * ワークフロー設定ファイルかどうか判定（REQ-10）
 */
function isWorkflowConfigFile(filePath) {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();

  // workflow-state.json
  if (normalized.includes('workflow-state.json')) {
    return true;
  }

  // .claude/配下の全てのファイル
  if (normalized.startsWith('.claude/') || normalized.includes('/.claude/')) {
    return true;
  }

  // .claude-*.json パターン
  if (/\.claude-.*\.json$/.test(normalized)) {
    return true;
  }

  return false;
}

// main()関数の先頭に追加
function main(input) {
  try {
    const filePath = input.tool_input?.file_path || '';

    if (!filePath) {
      process.exit(0);
    }

    // REQ-10: 設定ファイルは全フェーズで許可
    if (isWorkflowConfigFile(filePath)) {
      process.exit(0);
    }

    // ... 既存のロジック
  }
}

// モジュールエクスポート
module.exports = {
  isWorkflowConfigFile, // REQ-10
};
```

## テスト実行方法

### 全テスト実行
```bash
cd /mnt/c/ツール/Workflow/workflow-plugin/mcp-server
npx vitest run tests/hooks/
```

### 個別テスト実行
```bash
npx vitest run tests/hooks/req1-fail-closed.test.ts
npx vitest run tests/hooks/req2-build-check.test.ts
npx vitest run tests/hooks/req8-hook-bypass.test.ts
npx vitest run tests/hooks/req9-semicolon.test.ts
npx vitest run tests/hooks/req10-config-exception.test.ts
```

### カバレッジ測定
```bash
npx vitest run tests/hooks/ --coverage
```

## 期待される結果

### Red Phase (現在)
- 15個のテストケース中、約10個が失敗する（期待通り）
- 失敗するテストは上記の「❌」マークのもの

### Green Phase (実装後)
- 全15個のテストケースがパス
- カバレッジ: 行90%以上、ブランチ80%以上

## 関連ドキュメント

- 仕様書: `/mnt/c/ツール/Workflow/docs/workflows/評価レポート全課題解決/spec.md`
- テスト設計: `/mnt/c/ツール/Workflow/docs/workflows/評価レポート全課題解決/test-design.md`
