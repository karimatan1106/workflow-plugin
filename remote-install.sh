#!/bin/bash
# workflow-plugin リモートインストールスクリプト
#
# 使用方法:
#   curl -fsSL https://raw.githubusercontent.com/karimatan1106/workflow-plugin/master/remote-install.sh | bash
#
# または:
#   wget -qO- https://raw.githubusercontent.com/karimatan1106/workflow-plugin/master/remote-install.sh | bash

set -e

# 色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ログ関数
log_info() {
    echo -e "${CYAN}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

# ヘッダー表示
echo ""
echo -e "${CYAN}═══════════════════════════════════════${NC}"
echo -e "${CYAN}  workflow-plugin インストーラー${NC}"
echo -e "${CYAN}═══════════════════════════════════════${NC}"
echo ""

# Node.js バージョンチェック
log_info "Node.js バージョンを確認中..."
if ! command -v node &> /dev/null; then
    log_error "Node.js がインストールされていません"
    log_error "Node.js 18.0.0 以上をインストールしてください"
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    log_error "Node.js 18.0.0 以上が必要です（現在: $(node -v)）"
    exit 1
fi
log_success "Node.js $(node -v) 検出"

# pnpm または npm の確認
log_info "パッケージマネージャーを確認中..."
if command -v pnpm &> /dev/null; then
    PKG_MANAGER="pnpm"
    log_success "pnpm 検出"
elif command -v npm &> /dev/null; then
    PKG_MANAGER="npm"
    log_success "npm 検出"
else
    log_error "npm または pnpm がインストールされていません"
    exit 1
fi

# プラグインディレクトリの確認
PLUGIN_DIR="workflow-plugin"

if [ -d "$PLUGIN_DIR" ]; then
    log_warn "既存の $PLUGIN_DIR を検出"
    log_info "更新を実行します..."
    cd "$PLUGIN_DIR"
    git pull origin master 2>/dev/null || git pull origin main 2>/dev/null || {
        log_warn "git pull に失敗。再クローンします..."
        cd ..
        rm -rf "$PLUGIN_DIR"
        git clone --depth 1 https://github.com/karimatan1106/workflow-plugin.git "$PLUGIN_DIR"
    }
    cd ..
else
    log_info "リポジトリをクローン中..."
    git clone --depth 1 https://github.com/karimatan1106/workflow-plugin.git "$PLUGIN_DIR"
    log_success "クローン完了"
fi

# インストールスクリプトを実行
log_info "インストールスクリプトを実行中..."
node "$PLUGIN_DIR/install.js"

echo ""
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}  1コマンドインストール完了！${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo ""
