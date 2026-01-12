#!/bin/bash

# Tauri环境设置脚本
# 自动安装Rust和Tauri依赖

set -e

echo "🦀 设置Tauri开发环境..."

# 检查操作系统
OS="$(uname -s)"
case "${OS}" in
    Linux*)     MACHINE=Linux;;
    Darwin*)    MACHINE=Mac;;
    CYGWIN*)    MACHINE=Cygwin;;
    MINGW*)     MACHINE=MinGw;;
    *)          MACHINE="UNKNOWN:${OS}"
esac

echo "检测到操作系统: ${MACHINE}"

# 安装Rust
if ! command -v rustc &> /dev/null; then
    echo "📦 安装Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source ~/.cargo/env
    echo "✅ Rust安装完成"
else
    echo "✅ Rust已安装: $(rustc --version)"
fi

# 更新Rust
echo "🔄 更新Rust..."
rustup update

# 安装系统依赖
case "${MACHINE}" in
    Linux)
        echo "📦 安装Linux系统依赖..."
        if command -v apt-get &> /dev/null; then
            sudo apt-get update
            sudo apt-get install -y libwebkit2gtk-4.0-dev \
                build-essential \
                curl \
                wget \
                libssl-dev \
                libgtk-3-dev \
                libayatana-appindicator3-dev \
                librsvg2-dev
        elif command -v yum &> /dev/null; then
            sudo yum groupinstall -y "C Development Tools and Libraries"
            sudo yum install -y webkit2gtk3-devel openssl-devel curl wget libappindicator-gtk3-devel librsvg2-devel
        elif command -v pacman &> /dev/null; then
            sudo pacman -Syu --needed webkit2gtk base-devel curl wget openssl gtk3 libappindicator-gtk3 librsvg
        else
            echo "⚠️ 无法识别的Linux发行版，请手动安装系统依赖"
        fi
        ;;
    Mac)
        echo "📦 检查macOS系统依赖..."
        if ! command -v xcode-select &> /dev/null; then
            echo "请安装Xcode Command Line Tools:"
            echo "xcode-select --install"
            exit 1
        fi
        echo "✅ macOS依赖已满足"
        ;;
    *)
        echo "⚠️ 不支持的操作系统: ${MACHINE}"
        echo "请参考Tauri文档手动安装依赖: https://tauri.app/v1/guides/getting-started/prerequisites"
        ;;
esac

# 安装Tauri CLI
echo "📦 安装Tauri CLI..."
if ! command -v cargo-tauri &> /dev/null; then
    cargo install tauri-cli
    echo "✅ Tauri CLI安装完成"
else
    echo "✅ Tauri CLI已安装"
    cargo install tauri-cli --force  # 强制更新到最新版本
fi

# 验证安装
echo "🔍 验证安装..."
echo "Node.js: $(node --version)"
echo "npm: $(npm --version)"
echo "Rust: $(rustc --version)"
echo "Cargo: $(cargo --version)"
echo "Tauri CLI: $(cargo tauri --version)"

echo ""
echo "🎉 Tauri环境设置完成！"
echo ""
echo "现在您可以运行以下命令："
echo "  make tauri-dev    # 启动开发模式"
echo "  make tauri-build  # 构建应用"
echo ""
echo "如果遇到问题，请参考："
echo "  https://tauri.app/v1/guides/getting-started/prerequisites"