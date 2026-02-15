# MCPサーバー開発ガイド

このドキュメントでは、MCPサーバーの開発・運用において、コード変更を反映させるために必要な再起動手順とトラブルシューティング方法について説明します。

## 再起動が必要なケース

MCPサーバーは起動時に設定やモジュールを読み込むため、以下の変更後は**必ず再起動が必要**です。

### 1. `.mcp.json` 設定ファイル変更時

**理由**: MCPサーバーは起動時に設定ファイルを読み込み、ファイルシステムのクライアントやツール定義をキャッシュします。

**対応方法**:
- `.mcp.json` を編集したら、MCPサーバープロセスを停止して再起動する
- Claude Codeを再起動する（CLIから再接続）

**例**:
```json
{
  "mcpServers": {
    "workflow": {
      "command": "npx",
      "args": ["tsx", "src/server.ts"]
    }
  }
}
```

変更後:
```bash
# プロセスを停止
Stop-Process -Name node -Force

# Claude Codeを再起動
```

### 2. `dist/` ファイル変更時

**理由**: Node.jsはモジュールをメモリ上にキャッシュします。ビルド済みファイルの変更は、既に実行中のプロセスには反映されません。

**対応方法**:
- `dist/` ディレクトリを削除してから再起動する
- または、tsx直接実行を使用する（推奨）

```bash
# ビルドファイルをクリア
Remove-Item dist -Recurse -Force

# プロセスを停止して再起動
Stop-Process -Name node -Force
```

### 3. 依存パッケージ変更時

**理由**: `pnpm install` で新規パッケージがインストールされた場合、Node.jsのモジュール解決メカニズムがキャッシュを保持しているため、新しいパッケージの情報が反映されません。

**対応方法**:
```bash
# パッケージをインストール
pnpm install

# MCPサーバーを再起動
Stop-Process -Name node -Force
```

## tsx直接実行（推奨）

開発環境では、ビルドをスキップして TypeScript ファイルを直接実行する方式を推奨します。

### セットアップ

`.mcp.json` で以下のコマンドを指定:

```json
{
  "mcpServers": {
    "workflow": {
      "command": "npx",
      "args": ["tsx", "src/server.ts"]
    }
  }
}
```

### メリット

| メリット | 説明 |
|---------|------|
| **ビルド不要** | TypeScriptを直接実行するため、`npm run build` が不要 |
| **高速開発** | コード変更後、すぐにテストできる |
| **モジュールキャッシュの影響が少ない** | `tsx`は毎回新しいプロセスを起動するため、キャッシュの問題を回避 |
| **エラーの即座の検出** | TypeScriptのコンパイルエラーをリアルタイムで把握できる |

### 実行方法

```bash
# 手動実行（テスト用）
npx tsx src/server.ts

# または npm scripts として定義
pnpm dev
```

## MCPサーバープロセスの確認・停止方法

### Windows

**プロセス確認**:
```powershell
# MCPサーバーのプロセスを確認
Get-Process -Name node | Where-Object { $_.CommandLine -like '*mcp*' }

# または全node プロセスを確認
Get-Process -Name node

# より詳細に確認（PDと共にコマンドラインを表示）
Get-WmiObject Win32_Process -Filter "name='node.exe'" | Select-Object ProcessId, CommandLine
```

**プロセス停止**:
```powershell
# 特定の node プロセスを停止
Stop-Process -Id <PID> -Force

# または全 node プロセスを停止（注意: 他の node プロセスも停止されます）
Stop-Process -Name node -Force
```

### macOS / Linux

**プロセス確認**:
```bash
# MCPサーバーのプロセスを確認
ps aux | grep mcp

# または node プロセス全般を確認
ps aux | grep node

# より詳細に確認
lsof -i :3000  # ポート指定の場合
```

**プロセス停止**:
```bash
# 特定のプロセスを停止
kill -9 <PID>

# または名前で停止
pkill -f "mcp"
pkill -f "node.*server"
```

## トラブルシューティング

### 問題1: コード変更が反映されない

**症状**: ファイルを編集して保存したのに、変更内容がMCPサーバーに反映されない

**原因**:
- MCPサーバープロセスが古いモジュールをキャッシュしている
- `dist/` ファイルが古いままになっている

**解決手順**:

```bash
# 1. MCPサーバープロセスを停止
Stop-Process -Name node -Force

# 2. ビルドファイルをクリア（dist/を使用している場合）
Remove-Item dist -Recurse -Force -ErrorAction SilentlyContinue

# 3. node_modules キャッシュをクリア（オプション）
Remove-Item node_modules -Recurse -Force -ErrorAction SilentlyContinue
pnpm install

# 4. Claude Code を再起動
# CLI から再接続 / IDE から再起動
```

### 問題2: MCPサーバーがクラッシュする・エラーが出る

**症状**: 「接続できない」「モジュールが見つからない」などのエラー

**原因**:
- `.mcp.json` の構文エラー
- 必要なパッケージがインストールされていない
- TypeScript コンパイルエラー

**解決手順**:

```bash
# 1. .mcp.json の構文を確認（JSONバリデータを使用）
# VS Codeで開いて、エラーマークを確認

# 2. パッケージをインストール
pnpm install

# 3. TypeScriptコンパイルエラーを確認
npx tsc --noEmit

# 4. tsx で直接実行して、エラーメッセージを確認
npx tsx src/server.ts

# 5. node_modules を再インストール
Remove-Item node_modules -Recurse -Force
Remove-Item pnpm-lock.yaml
pnpm install
```

### 問題3: ポート競合・すでに別プロセスが使用している

**症状**: 「Address already in use」というエラーが出て起動できない

**原因**: 別の MCPサーバー or 同じポートを使用するアプリケーションが起動中

**解決手順**:

```bash
# Windows: 特定ポート（例: 3000）を使用しているプロセスを確認
netstat -ano | findstr :3000

# そのプロセスを停止
taskkill /PID <PID> /F

# または
Stop-Process -Id <PID> -Force

# macOS/Linux
lsof -i :3000
kill -9 <PID>
```

## 開発推奨フロー

### 開発時（推奨フロー）

```
1. コードを編集
   ↓
2. Claude Code を再起動（再接続）
   ↓
3. MCPサーバーが新しいプロセスで起動
   ↓
4. 変更を確認
   ↓
5. 問題があれば 1 に戻る
```

**コマンド例**:
```bash
# ターミナルで tsx を直接実行
npx tsx src/server.ts

# 別ターミナルでテスト実行
pnpm test

# 変更後、Claude Code で `/reload` または再起動
```

### 本番運用時

```bash
# 1. ビルド
pnpm build

# 2. MCPサーバー起動（dist/ を使用）
node dist/server.js

# または systemd / Docker で管理
```

## チェックリスト

変更を反映させるための確認項目：

- [ ] `.mcp.json` を変更した → MCPサーバー再起動が必要
- [ ] ソースコード（src/*.ts）を変更した → Claude Code 再起動が必要
- [ ] パッケージをインストールした（`pnpm install`） → MCPサーバー再起動が必要
- [ ] `dist/` ディレクトリを手動削除した → MCPサーバー再起動が必要
- [ ] エラーが出ている → `npx tsx src/server.ts` で直接実行してエラーメッセージを確認
- [ ] 「接続できない」と言われた → プロセス確認（`Get-Process -Name node`）と再起動

## 参考リンク

- [MCPサーバー仕様](https://modelcontextprotocol.io/)
- [tsx - TypeScript Executor](https://tsx.is/)
- [pnpm パッケージマネージャー](https://pnpm.io/)
- [Node.js キャッシング機構](https://nodejs.org/en/docs/guides/simple-profiling/)
