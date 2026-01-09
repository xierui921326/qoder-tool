# Qoder账号管理器

一个自动化Qoder账号注册和管理的Node.js工具。

## 功能特性

- 🤖 **自动注册**: 使用域名邮箱自动注册Qoder账号
- 📧 **邮件验证**: 自动处理邮件验证流程
- 🔐 **安全存储**: 使用AES-256加密安全存储账号凭据
- 📊 **批量处理**: 支持批量注册多个账号
- 🛡️ **反机器人**: 智能处理验证码和反机器人措施
- 📝 **详细日志**: 提供全面的操作日志和错误报告
- ⚙️ **灵活配置**: 支持多种配置选项和自定义设置
- 🖥️ **桌面应用**: 提供Electron桌面GUI界面
- 💻 **命令行**: 支持命令行模式操作

## 系统要求

- Node.js >= 18.0.0
- npm >= 8.0.0

## 安装和快速开始

```bash
# 克隆项目
git clone <repository-url>
cd qoder-account-manager

# 完整设置（推荐）
make setup

# 或者分步安装
make install          # 安装依赖
npx playwright install # 安装浏览器
```

### 启动应用

#### 桌面应用模式（推荐）
```bash
make electron         # 启动Electron桌面应用
make electron-dev     # 开发模式
```

#### 命令行模式
```bash
make start            # 启动命令行应用
make dev              # 开发模式（自动重启）
```

#### 查看所有命令
```bash
make help
```

### 使用Makefile

项目提供了便捷的Makefile命令：

```bash
# 应用启动
make electron         # 启动桌面应用
make electron-dev     # 桌面应用开发模式
make start            # 启动命令行应用
make dev              # 命令行开发模式

# 构建和部署
make electron-build   # 构建桌面应用
make build            # 构建项目

# 开发相关
make test             # 运行测试
make lint             # 代码检查

# 项目管理
make status           # 查看项目状态
make clean            # 清理临时文件
make backup           # 备份数据
make logs             # 查看日志

# 查看完整命令列表
make help
```

### 传统npm命令

```bash
# 桌面应用
npm run electron      # 启动Electron桌面应用
npm run electron-dev  # Electron开发模式
npm run build         # 构建Electron应用

# 命令行应用
npm start             # 启动命令行应用
npm run dev           # 开发模式（自动重启）

# 测试和检查
npm test              # 运行测试
npm run lint          # 代码检查
```

## 项目结构

```
qoder-account-manager/
├── src/                    # 源代码
│   ├── core/              # 核心类型和接口
│   │   ├── types.js       # 数据类型定义
│   │   ├── interfaces.js  # 接口定义
│   │   ├── database.js    # 数据库管理
│   │   ├── credential-store.js # 凭据存储
│   │   ├── email-processor.js # 邮件处理
│   │   └── email-verification-manager.js # 邮件验证管理
│   ├── electron/          # Electron桌面应用
│   │   ├── main.js        # 主进程
│   │   ├── preload.js     # 预加载脚本
│   │   └── web-server.js  # Web服务器
│   ├── web/               # Web界面
│   │   └── public/        # 静态资源
│   │       ├── index.html # 主页面
│   │       ├── styles/    # 样式文件
│   │       └── js/        # JavaScript文件
│   ├── utils/             # 工具函数
│   │   ├── crypto.js      # 加密工具
│   │   ├── retry.js       # 重试工具
│   │   ├── logger.js      # 日志工具
│   │   └── email-providers.js # 邮件提供商配置
│   ├── cli/               # 命令行界面（待实现）
│   └── index.js           # 主入口文件
├── test/                  # 测试文件
│   ├── unit/             # 单元测试
│   └── integration/      # 集成测试
├── config/               # 配置文件
├── data/                 # 数据文件
├── logs/                 # 日志文件
├── docs/                 # 文档
└── .kiro/               # Kiro规范文件
    └── specs/
        └── qoder-account-manager/
            ├── requirements.md  # 需求文档
            ├── design.md       # 设计文档
            └── tasks.md        # 任务列表
```

## 开发状态

当前项目处于开发阶段，已完成的功能：

- ✅ 项目架构搭建
- ✅ 核心类型和接口定义
- ✅ 工具函数（加密、重试、日志）
- ✅ 凭据存储系统
- ✅ SQLite数据库管理
- ✅ AES-256-GCM加密存储
- ✅ 邮件处理系统
- ✅ IMAP邮件检索和解析
- ✅ 验证链接提取和自动化
- ✅ 邮件提供商配置管理
- ✅ Electron桌面GUI应用
- ✅ Web界面和前端交互
- ✅ Makefile项目管理
- ⏳ 浏览器自动化（下一个任务）
- ⏳ 账号管理器核心逻辑
- ⏳ 命令行界面

## 配置

应用支持多种配置方式：

1. **环境变量**
2. **配置文件** (config/default.json)
3. **命令行参数**

详细配置说明请参考 [配置文档](docs/configuration.md)（待创建）。

## 安全性

- 使用AES-256-GCM加密存储密码
- 支持PBKDF2密钥派生
- 自动生成强密码
- 安全的随机数生成
- 完整的审计日志

## 贡献

欢迎贡献代码！请遵循以下步骤：

1. Fork项目
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建Pull Request

## 许可证

本项目采用MIT许可证 - 详见 [LICENSE](LICENSE) 文件。

## 支持

如果您遇到问题或有建议，请：

1. 查看 [常见问题](docs/faq.md)（待创建）
2. 搜索现有的 [Issues](../../issues)
3. 创建新的 Issue

## 更新日志

详见 [CHANGELOG.md](CHANGELOG.md)（待创建）。