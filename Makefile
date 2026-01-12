# Qoder账号管理器 Makefile
# 提供便捷的项目管理命令

.PHONY: help install dev test lint clean build tauri-info tauri-dev tauri-build

# 默认目标
help:
	@echo "Qoder账号管理器 - 可用命令:"
	@echo ""
	@echo "  安装和开发:"
	@echo "    make install      - 安装项目依赖"
	@echo "    make dev          - 启动桌面应用开发模式"
	@echo "    make dev-core     - 启动Node.js核心开发模式"
	@echo ""
	@echo "  Tauri相关:"
	@echo "    make tauri-info   - 显示Tauri环境信息"
	@echo "    make tauri-dev    - 启动Tauri开发模式"
	@echo "    make tauri-build  - 构建Tauri应用"
	@echo ""
	@echo "  测试和质量:"
	@echo "    make test         - 运行所有测试"
	@echo "    make test-core    - 运行Node.js核心测试"
	@echo ""
	@echo "  构建和清理:"
	@echo "    make build        - 构建所有应用"
	@echo "    make clean        - 清理临时文件"

# 安装依赖
install:
	@echo "📦 安装项目依赖..."
	npm install
	cd apps/desktop && npm install
	cd apps/node-core && npm install
	@echo "✅ 依赖安装完成"

# 开发模式 - 桌面应用
dev:
	@echo "🖥️ 启动桌面应用开发模式..."
	cd apps/desktop && npm run tauri dev

# 开发模式 - Node.js核心
dev-core:
	@echo "🔄 启动Node.js核心开发模式..."
	cd apps/node-core && npm start

# Tauri相关命令
tauri-info:
	@echo "🦀 显示Tauri环境信息..."
	cd apps/desktop && npm run tauri info

tauri-dev:
	@echo "🦀 启动Tauri开发模式..."
	cd apps/desktop && npm run dev

tauri-build:
	@echo "🦀 构建Tauri应用..."
	cd apps/desktop && npm run build

# 运行测试
test:
	@echo "� 运行所有测试..."
	cd apps/node-core && npm test

# 运行Node.js核心测试
test-core:
	@echo "🧪 运行Node.js核心测试..."
	cd apps/node-core && npm test

# 代码检查
lint:
	@echo "🔍 运行代码检查..."
	cd apps/node-core && npm run lint

# 构建所有应用
build:
	@echo "🏗️ 构建所有应用..."
	cd apps/desktop && npm run build
	cd apps/node-core && npm run build

# 清理临时文件
clean:
	@echo "🧹 清理临时文件..."
	rm -rf node_modules/.cache
	rm -rf apps/desktop/src-tauri/target
	rm -rf apps/desktop/node_modules/.cache
	rm -rf apps/node-core/node_modules/.cache
	@echo "✅ 清理完成"