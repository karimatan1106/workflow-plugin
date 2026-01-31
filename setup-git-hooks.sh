#!/bin/bash
# workflow-plugin git hooks セットアップスクリプト
# git pull後にinstall.jsを自動実行するフックをインストール

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GIT_DIR="$(git -C "$SCRIPT_DIR" rev-parse --git-dir 2>/dev/null)" || {
    echo "❌ エラー: gitリポジトリ内で実行してください"
    exit 1
}

HOOKS_DIR="$GIT_DIR/hooks"
POST_MERGE_HOOK="$HOOKS_DIR/post-merge"
SOURCE_HOOK="$SCRIPT_DIR/hooks/git/post-merge"

echo "🔧 workflow-plugin git hooks セットアップ"
echo ""

# post-mergeフックをコピー
if [ -f "$POST_MERGE_HOOK" ]; then
    echo "⚠️  既存のpost-mergeフックをバックアップ: $POST_MERGE_HOOK.backup"
    cp "$POST_MERGE_HOOK" "$POST_MERGE_HOOK.backup"
fi

cp "$SOURCE_HOOK" "$POST_MERGE_HOOK"
chmod +x "$POST_MERGE_HOOK"

echo "✅ post-mergeフックをインストールしました"
echo ""
echo "これにより、git pull後に自動的にinstall.jsが実行されます。"
