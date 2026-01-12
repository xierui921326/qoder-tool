# 安装指南

本文档将指导您完成Qoder账号管理器的安装和设置。

## 系统要求

### 基础要求
- **Node.js** >= 18.0.0
- **npm** >= 8.0.0
- **Rust** >= 1.70.0

### 系统特定依赖

#### Windows
- Microsoft C++ Build Tools
- Windows 10/11

#### macOS
- Xcode Command Line Tools
- macOS 10.15+

#### Linux
- build-essential
- libwebkit2gtk-4.0-dev
- libssl-dev
- libgtk-3-dev
- libayatana-appindicator3-dev
- librsvg2-dev

## 快速安装

### 1. 克隆项目
```bash
git clone <repository-url>
cd qoder-account-manager
```

### 2. 自动设置（推荐）
```bash
# 完整设置（包括Tauri环境）
make setup

# 或者分步设置
make install        # 安装Node.js依赖
make setup-tauri    # 设置Tauri环境
```

### 3. 手动设置Tauri环境

#### Linux/macOS
```bash
./scripts/setup-tauri.sh
```

#### Windows (PowerShell管理员模式)
```powershell
PowerShell -ExecutionPolicy Bypass -File scripts/setup-tauri.ps1
```

## 验证安装

运行以下命令验证所有组件是否正确安装：

```bash
# 检查Node.js环境
node --version
npm --version

# 检查Rust环境
rustc --version
cargo --version

# 检查Tauri CLI
cargo tauri --version
```

## 启动应用

### 桌面应用（推荐）
```bash
make tauri-dev
```

### 命令行模式
```bash
make start
```

## 常见问题

### Windows相关问题

**问题**: 缺少Microsoft C++ Build Tools
**解决**: 运行设置脚本或手动安装Visual Studio Build Tools

**问题**: PowerShell执行策略限制
**解决**: 以管理员身份运行PowerShell并执行：
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### macOS相关问题

**问题**: 缺少Xcode Command Line Tools
**解决**: 运行以下命令：
```bash
xcode-select --install
```

**问题**: Rust安装失败
**解决**: 手动安装Rust：
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Linux相关问题

**问题**: 缺少系统依赖
**解决**: 根据您的发行版安装相应依赖：

**Ubuntu/Debian**:
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.0-dev build-essential curl wget libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

**CentOS/RHEL**:
```bash
sudo yum groupinstall "C Development Tools and Libraries"
sudo yum install webkit2gtk3-devel openssl-devel curl wget libappindicator-gtk3-devel librsvg2-devel
```

**Arch Linux**:
```bash
sudo pacman -Syu webkit2gtk base-devel curl wget openssl gtk3 libappindicator-gtk3 librsvg
```

## 开发环境设置

### 推荐的IDE设置

**Visual Studio Code**:
- 安装Rust扩展包
- 安装Tauri扩展
- 安装ESLint扩展

**推荐扩展**:
- rust-analyzer
- Tauri
- ESLint
- Prettier

### 环境变量

可选的环境变量配置：

```bash
# 开发模式
export TAURI_DEBUG=true

# 日志级别
export RUST_LOG=debug
```

## 构建和部署

### 开发构建
```bash
make tauri-dev
```

### 生产构建
```bash
make tauri-build
```

构建产物将位于 `src-tauri/target/release/bundle/` 目录中。

## 获取帮助

如果您遇到安装问题：

1. 查看 [常见问题](FAQ.md)
2. 检查 [Tauri官方文档](https://tauri.app/v1/guides/getting-started/prerequisites)
3. 提交 [Issue](../../issues)

## 更新

### 更新项目依赖
```bash
npm update
cargo update
```

### 更新Tauri CLI
```bash
cargo install tauri-cli --force
```