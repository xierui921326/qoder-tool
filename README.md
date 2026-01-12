# Qoder账号管理器

自动化Qoder账号注册和管理工具，采用现代化的Tauri + Node.js架构。

## 项目架构

本项目采用monorepo架构，包含以下应用：

```
qoder-account-manager/
├── apps/
│   ├── desktop/                 # Tauri桌面应用
│   │   ├── src/                # 前端源码 (HTML/CSS/JS)
│   │   ├── src-tauri/          # Rust后端源码
│   │   └── package.json        # 桌面应用依赖
│   └── node-core/              # Node.js核心模块
│       ├── src/                # Node.js源码
│       │   ├── core/           # 核心模块
│       │   ├── email/          # 邮件处理
│       │   ├── browser/        # 浏览器自动化
│       │   ├── account/        # 账号管理
│       │   ├── task/           # 任务管理
│       │   ├── ipc/            # IPC通信
│       │   └── utils/          # 工具函数
│       └── package.json        # Node.js核心依赖
├── data/                       # 数据存储
├── logs/                       # 日志文件
├── config/                     # 配置文件
├── backups/                    # 备份文件
└── package.json               # 根目录配置
```

## 技术栈

### 桌面应用 (apps/desktop)
- **前端**: HTML5 + CSS3 + JavaScript (ES6+)
- **后端**: Rust + Tauri
- **UI框架**: 原生Web技术
- **通信**: Tauri Commands API

### Node.js核心 (apps/node-core)
- **运行时**: Node.js 18+
- **浏览器自动化**: Playwright
- **邮件处理**: IMAP + Mailparser
- **数据库**: SQLite3
- **加密**: Node.js Crypto (AES-256-GCM)

## 功能特性

### ✅ 已实现功能

1. **核心架构**
   - 数据库管理 (SQLite)
   - 凭据存储 (AES-256-GCM加密)
   - 日志系统
   - 重试机制

2. **邮件处理**
   - IMAP邮件检索
   - 验证邮件识别
   - 验证链接提取
   - 邮件验证自动化

3. **桌面界面**
   - Tauri桌面应用框架
   - 现代化UI界面
   - 配置管理界面
   - 邮箱配置向导

### 🚧 开发中功能

4. **浏览器自动化**
   - Playwright浏览器控制
   - 注册表单自动填写
   - 验证码处理
   - 反机器人措施

5. **账号管理**
   - 单个账号注册
   - 批量账号注册
   - 账号状态监控
   - 注册进度跟踪

6. **任务系统**
   - 任务队列管理
   - 并发控制
   - 任务调度
   - 进度报告

## 快速开始

### 环境要求

- Node.js 18.0+
- Rust 1.70+
- npm 9.0+

### 安装依赖

```bash
# 安装所有依赖
make install

# 或者手动安装
npm run install:all
```

### 完整设置

```bash
# 完整项目设置（推荐）
make setup
```

这将自动：
- 安装所有依赖
- 设置Playwright浏览器
- 创建必要目录
- 配置Tauri环境

### 开发模式

```bash
# 启动桌面应用开发模式
make dev

# 启动Node.js核心开发模式
make dev-core

# 同时启动两个应用
make dev & make dev-core
```

### 生产运行

```bash
# 启动桌面应用
make start

# 启动Node.js核心
make start-core
```

## 开发指南

### 项目结构说明

#### apps/desktop - 桌面应用
- `src/`: 前端源码 (HTML/CSS/JS)
- `src-tauri/`: Rust后端源码
- 负责用户界面和系统集成

#### apps/node-core - Node.js核心
- `src/core/`: 核心模块 (数据库、凭据存储等)
- `src/email/`: 邮件处理模块
- `src/browser/`: 浏览器自动化模块
- `src/account/`: 账号管理模块
- `src/task/`: 任务管理模块
- `src/utils/`: 工具函数

### 开发工作流

1. **功能开发**
   ```bash
   # 创建功能分支
   git checkout -b feature/new-feature
   
   # 开发和测试
   make dev
   make test
   
   # 代码检查
   make lint
   ```

2. **测试**
   ```bash
   # 运行所有测试
   make test
   
   # 运行特定模块测试
   make test-core
   ```

3. **构建**
   ```bash
   # 构建所有应用
   make build
   
   # 构建桌面应用
   make build-desktop
   ```

### 配置管理

#### 邮箱配置
支持主流邮件提供商的自动配置：
- Gmail
- Outlook/Hotmail
- QQ邮箱
- 163邮箱
- 126邮箱
- Yahoo Mail

#### 数据库配置
- 默认使用SQLite数据库
- 数据文件位置: `data/qoder-accounts.db`
- 支持自动备份和恢复

#### 日志配置
- 日志文件位置: `logs/`
- 支持日志轮转和清理
- 可配置日志级别

## 使用说明

### 基本使用流程

1. **配置邮箱**
   - 启动桌面应用
   - 进入邮箱配置页面
   - 添加用于接收验证邮件的邮箱

2. **配置域名**
   - 添加要注册的邮箱域名
   - 配置域名相关设置

3. **开始注册**
   - 选择注册模式（单个/批量）
   - 设置注册参数
   - 启动注册任务

4. **监控进度**
   - 查看注册进度
   - 监控任务状态
   - 处理异常情况

### 高级功能

#### 批量注册
- 支持并发注册多个账号
- 可配置注册间隔和重试策略
- 提供详细的进度报告

#### 数据管理
```bash
# 备份数据
make backup

# 恢复数据
make restore FILE=backups/backup-xxx.tar.gz
```

#### 日志管理
```bash
# 查看实时日志
make logs

# 清理旧日志
make logs-clean
```

## 故障排除

### 常见问题

1. **邮箱连接失败**
   - 检查IMAP设置是否正确
   - 确认是否需要应用专用密码
   - 验证网络连接

2. **浏览器启动失败**
   - 运行 `make setup` 重新安装浏览器
   - 检查系统权限设置

3. **数据库错误**
   - 检查数据目录权限
   - 尝试重新初始化数据库

### 获取帮助

```bash
# 查看所有可用命令
make help

# 查看项目状态
make status

# 查看系统信息
make info
```

## 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 更新日志

### v1.0.0 (当前版本)
- ✅ 完成核心架构设计
- ✅ 实现数据库和凭据存储
- ✅ 实现邮件处理系统
- ✅ 完成Tauri桌面应用框架
- 🚧 开发浏览器自动化功能
- 🚧 开发账号管理功能

## 支持

如果您觉得这个项目有用，请给它一个 ⭐️！

如有问题或建议，请创建 [Issue](https://github.com/your-repo/qoder-account-manager/issues)。