# Contributing to Workflow Plugin

Workflow Plugin への貢献をご検討いただきありがとうございます。このドキュメントでは、開発環境のセットアップから PR の提出までの手順を説明します。

## 目次

- [開発環境セットアップ](#開発環境セットアップ)
- [コーディング規約](#コーディング規約)
- [テスト要件](#テスト要件)
- [PR 手順](#pr-手順)
- [コミットメッセージ規約](#コミットメッセージ規約)

## 開発環境セットアップ

### 必要なツール

- **Node.js**: 18.0.0 以上
- **pnpm**: 8.0.0 以上（推奨）または npm
- **Git**: 2.30.0 以上

### セットアップ手順

1. **リポジトリをフォーク・クローン**

   ```bash
   git clone https://github.com/yourname/workflow-plugin.git
   cd workflow-plugin
   ```

2. **MCP サーバーの依存関係をインストール**

   ```bash
   cd mcp-server
   pnpm install
   ```

3. **MCP サーバーをビルド**

   ```bash
   pnpm build
   ```

4. **テストを実行して環境を確認**

   ```bash
   # MCP サーバーのテスト
   pnpm test

   # フックのテスト
   cd ../hooks
   node --test __tests__/*.test.js
   ```

### ディレクトリ構造

```
workflow-plugin/
├── hooks/                   # フックスクリプト（JavaScript）
│   ├── __tests__/           # フックのテスト
│   ├── enforce-workflow.js
│   ├── phase-edit-guard.js
│   └── ...
├── mcp-server/              # MCP サーバー（TypeScript）
│   ├── src/
│   │   ├── tools/           # ツール実装
│   │   ├── phases/          # フェーズ定義
│   │   ├── state/           # 状態管理
│   │   └── utils/           # ユーティリティ
│   └── package.json
├── workflow-phases/         # フェーズ別プロンプト
├── commands/                # コマンド定義
└── skills/                  # スキル定義
```

## コーディング規約

### 言語

- **ソースコード**: TypeScript（MCP サーバー）、JavaScript（フック）
- **コメント**: 日本語
- **ドキュメント**: 日本語

### TypeScript（MCP サーバー）

1. **strict モードを有効化**

   ```json
   // tsconfig.json
   {
     "compilerOptions": {
       "strict": true
     }
   }
   ```

2. **any 型の使用禁止**

   ```typescript
   // NG
   function process(data: any): any { ... }

   // OK
   function process(data: WorkflowState): ProcessResult { ... }
   ```

3. **型ガードを活用**

   ```typescript
   // 型ガードの例
   function isValidPhase(phase: string): phase is PhaseType {
     return VALID_PHASES.includes(phase as PhaseType);
   }
   ```

4. **エラーハンドリング**

   ```typescript
   // カスタムエラークラスを使用
   import { WorkflowError } from '../utils/errors';

   throw new WorkflowError('タスクが存在しません', 'TASK_NOT_FOUND');
   ```

### JavaScript（フック）

1. **ES Modules 形式を使用**

   ```javascript
   // ファイル先頭に type: module を想定
   import fs from 'node:fs';
   import path from 'node:path';
   ```

2. **標準入力からの読み取り**

   ```javascript
   // フックの入力は標準入力から JSON として受け取る
   const input = JSON.parse(await readStdin());
   ```

3. **終了コードの使用**

   ```javascript
   // 0: 成功（続行）
   // 2: ブロック（操作を中止）
   process.exit(shouldBlock ? 2 : 0);
   ```

### ファイル命名規約

| 種類 | 命名規約 | 例 |
|------|----------|-----|
| TypeScript ファイル | kebab-case | `phase-edit-guard.ts` |
| JavaScript ファイル | kebab-case | `enforce-workflow.js` |
| テストファイル | `*.test.ts` / `*.test.js` | `start.test.ts` |
| Markdown ファイル | kebab-case または UPPER_CASE | `README.md`, `threat_modeling.md` |

## テスト要件

### テストカバレッジ

すべての新機能・バグ修正にはテストが必要です。

#### MCP サーバー（TypeScript）

```bash
cd mcp-server
pnpm test
```

Vitest を使用。テストファイルは `src/**/__tests__/*.test.ts` に配置。

```typescript
// src/tools/__tests__/start.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { startTool } from '../start';

describe('startTool', () => {
  beforeEach(() => {
    // テストごとに状態をリセット
  });

  it('タスクを正常に開始できる', async () => {
    const result = await startTool({ taskName: 'テストタスク' });
    expect(result.phase).toBe('research');
  });

  it('タスク名が空の場合はエラー', async () => {
    await expect(startTool({ taskName: '' })).rejects.toThrow();
  });
});
```

#### フック（JavaScript）

```bash
cd hooks
node --test __tests__/*.test.js
```

Node.js 組み込みテストランナーを使用。

```javascript
// hooks/__tests__/loop-detector.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('loop-detector', () => {
  it('5回以上の編集でブロック', async () => {
    // テスト実装
  });
});
```

### テスト項目

必ず以下の観点でテストを作成してください:

1. **正常系**: 期待通りの入力で正しく動作するか
2. **異常系**: 不正な入力でエラーが発生するか
3. **境界値**: 空、null、最大値、最小値での動作
4. **エッジケース**: 競合状態、並行処理など

## PR 手順

### 1. ブランチを作成

```bash
git checkout -b feature/your-feature-name
# または
git checkout -b fix/your-bug-fix
```

ブランチ名の規約:

- `feature/xxx`: 新機能
- `fix/xxx`: バグ修正
- `docs/xxx`: ドキュメント更新
- `refactor/xxx`: リファクタリング
- `test/xxx`: テスト追加・修正

### 2. 変更を実装

1. コードを変更
2. テストを追加・更新
3. ドキュメントを更新（必要に応じて）

### 3. テストを実行

```bash
# MCP サーバー
cd mcp-server && pnpm test

# フック
cd hooks && node --test __tests__/*.test.js
```

### 4. ビルドを確認

```bash
cd mcp-server && pnpm build
```

### 5. コミット

コミットメッセージ規約に従ってコミット（次のセクション参照）。

### 6. プッシュ

```bash
git push origin feature/your-feature-name
```

### 7. PR を作成

GitHub で Pull Request を作成し、以下を記載:

```markdown
## 概要
<!-- 変更の目的と内容を簡潔に記載 -->

## 変更内容
- [ ] 機能追加: xxx
- [ ] バグ修正: xxx
- [ ] ドキュメント更新

## テスト
- [ ] 新規テスト追加
- [ ] 既存テストがパス
- [ ] 手動テスト実施

## チェックリスト
- [ ] コーディング規約に準拠
- [ ] any 型を使用していない
- [ ] 日本語コメントを追加
- [ ] CHANGELOG.md を更新（必要な場合）
```

## コミットメッセージ規約

[Conventional Commits](https://www.conventionalcommits.org/) に従います。

### フォーマット

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Type

| Type | 説明 |
|------|------|
| `feat` | 新機能 |
| `fix` | バグ修正 |
| `docs` | ドキュメントのみの変更 |
| `style` | コードの意味に影響しない変更（空白、フォーマット等） |
| `refactor` | バグ修正でも機能追加でもないコード変更 |
| `perf` | パフォーマンス改善 |
| `test` | テストの追加・修正 |
| `chore` | ビルドプロセスやツールの変更 |

### Scope

| Scope | 説明 |
|-------|------|
| `hooks` | フック関連 |
| `mcp` | MCP サーバー関連 |
| `phases` | フェーズ定義関連 |
| `tools` | ツール実装関連 |
| `state` | 状態管理関連 |
| `docs` | ドキュメント関連 |

### 例

```bash
# 新機能
feat(tools): 並列フェーズのサブフェーズ完了機能を追加

# バグ修正
fix(hooks): loop-detector の編集回数カウントを修正

# ドキュメント
docs: CONTRIBUTING.md を追加

# リファクタリング
refactor(state): 状態管理ロジックを整理

# テスト
test(tools): start ツールのエッジケーステストを追加
```

### 日本語でのコミットメッセージ

本プロジェクトでは日本語でのコミットメッセージも許可しています:

```bash
feat(tools): タスク切替機能を追加

複数タスクの並行管理を可能にするため、
workflow_switch ツールを実装しました。

Refs: #123
```

## 質問・サポート

質問がある場合は、GitHub Issues で質問してください。

---

ご貢献ありがとうございます！
