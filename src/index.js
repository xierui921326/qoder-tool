/**
 * Qoder账号管理器主入口文件
 */
import { createLogger } from './utils/logger.js';

// 创建全局日志记录器
const logger = createLogger({
  console: true,
  file: true,
  logDir: 'logs'
});

/**
 * 主函数
 */
async function main() {
  try {
    logger.info('Qoder账号管理器启动中...');
    
    // TODO: 在后续任务中实现CLI和核心功能
    logger.info('系统初始化完成');
    
    // 暂时显示帮助信息
    console.log(`
Qoder账号管理器 v1.0.0

这是一个自动化Qoder账号注册和管理的工具。

当前状态: 项目架构已搭建完成
下一步: 实现凭据存储系统

使用方法:
  npm start              启动应用
  npm test               运行测试
  npm run lint           代码检查

项目结构:
  src/core/             核心类型和接口定义
  src/utils/            工具函数
  src/cli/              命令行界面（待实现）
  test/                 测试文件
  config/               配置文件
  logs/                 日志文件
    `);
    
  } catch (error) {
    logger.error('应用启动失败', error);
    process.exit(1);
  }
}

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  logger.error('未捕获的异常', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的Promise拒绝', { reason, promise });
  process.exit(1);
});

// 优雅关闭
process.on('SIGINT', () => {
  logger.info('收到SIGINT信号，正在关闭应用...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('收到SIGTERM信号，正在关闭应用...');
  process.exit(0);
});

// 启动应用
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}