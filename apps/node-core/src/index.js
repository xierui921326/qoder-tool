#!/usr/bin/env node

/**
 * Qoder账号管理器CLI入口文件
 */

import { createCLI } from './cli/cli.js';

async function main() {
  try {
    const cli = createCLI({
      verbose: process.env.VERBOSE === 'true',
      interactive: process.env.NON_INTERACTIVE !== 'true'
    });
    
    await cli.run(process.argv);
    
  } catch (error) {
    console.error('程序执行失败:', error.message);
    
    if (process.env.VERBOSE === 'true') {
      console.error(error.stack);
    }
    
    process.exit(1);
  }
}

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
  process.exit(1);
});

// 处理中断信号
process.on('SIGINT', () => {
  console.log('\n收到中断信号，正在退出...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('收到终止信号，正在退出...');
  process.exit(0);
});

main();