# Qoder账号管理器 Makefile
# 提供便捷的项目管理命令

.PHONY: help install start dev test test-watch lint lint-fix clean build setup deps-check logs-clean backup restore

# 默认目标
help:
	@echo "Qoder账号管理器 - 可用命令:"
	@echo ""
	@echo "  安装和设置:"
	@echo "    make install      - 安装项目依赖"
	@echo "    make setup        - 完整项目设置（安装依赖+浏览器）"
	@echo "    make deps-check   - 检查依赖状态"
	@echo ""
	@echo "  开发和运行:"
	@echo "    make start        - 启动应用"
	@echo "    make dev          - 开发模式（自动重启）"
	@echo "    make electron     - 启动Electron桌面应用"
	@echo "    make electron-dev - 启动Electron开发模式"
	@echo ""
	@echo "  测试和质量:"
	@echo "    make test         - 运行测试"
	@echo "    make test-watch   - 监视模式运行测试"
	@echo "    make lint         - 代码检查"
	@echo "    make lint-fix     - 自动修复代码问题"
	@echo ""
	@echo "  构建和部署:"
	@echo "    make build        - 构建项目"
	@echo "    make electron-build - 构建Electron应用"
	@echo "    make clean        - 清理临时文件"
	@echo ""
	@echo "  数据管理:"
	@echo "    make backup       - 备份数据库和配置"
	@echo "    make restore      - 恢复数据库和配置"
	@echo ""
	@echo "  日志管理:"
	@echo "    make logs         - 查看最新日志"
	@echo "    make logs-clean   - 清理旧日志文件"
	@echo ""
	@echo "  其他:"
	@echo "    make status       - 显示项目状态"
	@echo "    make info         - 显示系统信息"

# 安装依赖
install:
	@echo "📦 安装项目依赖..."
	npm install
	@echo "✅ 依赖安装完成"

# 完整设置
setup: install
	@echo "🔧 设置Playwright浏览器..."
	npx playwright install
	@echo "📁 创建必要目录..."
	mkdir -p logs config data backups
	@echo "✅ 项目设置完成"

# 检查依赖状态
deps-check:
	@echo "🔍 检查依赖状态..."
	npm audit
	npm outdated

# 启动应用
start:
	@echo "🚀 启动Qoder账号管理器..."
	npm start

# 开发模式
dev:
	@echo "🔄 启动开发模式（自动重启）..."
	npm run dev

# Electron桌面应用
electron:
	@echo "🖥️ 启动Electron桌面应用..."
	npm run electron

# Electron开发模式
electron-dev:
	@echo "🖥️ 启动Electron开发模式..."
	npm run electron-dev

# 构建Electron应用
electron-build:
	@echo "📦 构建Electron应用..."
	npm run build

# 运行测试
test:
	@echo "🧪 运行测试..."
	npm test

# 监视模式测试
test-watch:
	@echo "👀 监视模式运行测试..."
	npm run test:watch

# 代码检查
lint:
	@echo "🔍 运行代码检查..."
	npm run lint

# 自动修复代码问题
lint-fix:
	@echo "🔧 自动修复代码问题..."
	npm run lint:fix

# 构建项目
build:
	@echo "🏗️ 构建项目..."
	@echo "当前版本为开发版本，无需构建步骤"
	@echo "如需打包，请考虑使用 pkg 或 nexe"

# 清理临时文件
clean:
	@echo "🧹 清理临时文件..."
	rm -rf node_modules/.cache
	rm -rf .nyc_output
	rm -rf coverage
	rm -f *.log
	@echo "✅ 清理完成"

# 查看最新日志
logs:
	@echo "📋 显示最新日志..."
	@if [ -d "logs" ] && [ -n "$$(ls -A logs 2>/dev/null)" ]; then \
		tail -f logs/qoder-$$(date +%Y-%m-%d).log; \
	else \
		echo "❌ 没有找到日志文件"; \
	fi

# 清理旧日志
logs-clean:
	@echo "🗑️ 清理7天前的日志文件..."
	@if [ -d "logs" ]; then \
		find logs -name "*.log" -mtime +7 -delete; \
		echo "✅ 旧日志清理完成"; \
	else \
		echo "❌ 日志目录不存在"; \
	fi

# 备份数据
backup:
	@echo "💾 备份数据库和配置..."
	@mkdir -p backups
	@BACKUP_FILE="backups/backup-$$(date +%Y%m%d-%H%M%S).tar.gz"; \
	if [ -d "data" ] || [ -d "config" ]; then \
		tar -czf "$$BACKUP_FILE" data config 2>/dev/null || true; \
		echo "✅ 备份完成: $$BACKUP_FILE"; \
	else \
		echo "⚠️ 没有找到需要备份的数据"; \
	fi

# 恢复数据
restore:
	@echo "📥 恢复数据库和配置..."
	@if [ -z "$(FILE)" ]; then \
		echo "❌ 请指定备份文件: make restore FILE=backups/backup-xxx.tar.gz"; \
		exit 1; \
	fi
	@if [ ! -f "$(FILE)" ]; then \
		echo "❌ 备份文件不存在: $(FILE)"; \
		exit 1; \
	fi
	tar -xzf "$(FILE)"
	@echo "✅ 数据恢复完成"

# 显示项目状态
status:
	@echo "📊 Qoder账号管理器状态:"
	@echo ""
	@echo "项目信息:"
	@if [ -f "package.json" ]; then \
		echo "  版本: $$(node -p "require('./package.json').version")"; \
		echo "  Node.js: $$(node --version)"; \
		echo "  npm: $$(npm --version)"; \
	fi
	@echo ""
	@echo "目录状态:"
	@echo "  源代码: $$(find src -name '*.js' | wc -l | tr -d ' ') 个文件"
	@if [ -d "logs" ]; then \
		echo "  日志文件: $$(ls logs/*.log 2>/dev/null | wc -l | tr -d ' ') 个"; \
	fi
	@if [ -d "data" ]; then \
		echo "  数据文件: $$(find data -type f 2>/dev/null | wc -l | tr -d ' ') 个"; \
	fi
	@if [ -d "backups" ]; then \
		echo "  备份文件: $$(ls backups/*.tar.gz 2>/dev/null | wc -l | tr -d ' ') 个"; \
	fi

# 显示系统信息
info:
	@echo "💻 系统信息:"
	@echo "  操作系统: $$(uname -s)"
	@echo "  架构: $$(uname -m)"
	@echo "  Node.js: $$(node --version)"
	@echo "  npm: $$(npm --version)"
	@echo "  当前目录: $$(pwd)"
	@echo "  磁盘空间: $$(df -h . | tail -1 | awk '{print $$4}') 可用"

# 开发者工具
dev-tools:
	@echo "🛠️ 安装开发者工具..."
	npm install -g nodemon
	npm install -g npm-check-updates
	@echo "✅ 开发者工具安装完成"

# 更新依赖
update-deps:
	@echo "📦 检查依赖更新..."
	npx npm-check-updates
	@echo "运行 'npx ncu -u && npm install' 来更新依赖"

# 安全检查
security-check:
	@echo "🔒 运行安全检查..."
	npm audit
	@echo "如发现漏洞，运行 'npm audit fix' 修复"

# 性能分析
profile:
	@echo "📈 运行性能分析..."
	node --prof src/index.js
	@echo "使用 'node --prof-process isolate-*.log > profile.txt' 分析结果"

# 生成文档
docs:
	@echo "📚 生成项目文档..."
	@echo "TODO: 集成JSDoc或其他文档生成工具"

# Docker相关命令（预留）
docker-build:
	@echo "🐳 构建Docker镜像..."
	@echo "TODO: 添加Dockerfile和Docker构建逻辑"

docker-run:
	@echo "🐳 运行Docker容器..."
	@echo "TODO: 添加Docker运行逻辑"

# 发布相关
release:
	@echo "🚀 准备发布..."
	@echo "TODO: 添加版本标记和发布逻辑"