#!/usr/bin/env node

/**
 * 注册 CLI 入口文件
 * 接收 Tauri 传递的 JSON 配置，执行注册流程
 * 
 * 使用方式：
 *   node src/register-cli.js --config-json '{"email":"test@example.com",...}'
 */

import { createAccountManagerV2, RegistrationConfig, UserProfile } from './core/account-manager-v2.js';
import { EmailConfig } from './config/email-config.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger({ component: 'RegisterCLI' });

/**
 * 解析命令行参数
 * @returns {Object} 配置对象
 */
function parseArgs() {
  const args = process.argv.slice(2);
  let configJson = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config-json' && args[i + 1]) {
      configJson = args[i + 1];
      break;
    }
  }

  if (!configJson) {
    throw new Error('缺少 --config-json 参数');
  }

  try {
    return JSON.parse(configJson);
  } catch (error) {
    throw new Error(`JSON 解析失败: ${error.message}`);
  }
}

/**
 * 输出结果（JSON 格式）
 * @param {Object} result - 结果对象
 */
function outputResult(result) {
  console.log(JSON.stringify(result));
}

/**
 * 主函数
 */
async function main() {
  let accountManager = null;

  try {
    // 解析配置
    const config = parseArgs();
    logger.info('收到注册配置', { email: config.email, configId: config.configId });

    const { email, emailConfig, headless, apiPort } = config;

    if (!email) {
      throw new Error('邮箱地址不能为空');
    }

    if (!emailConfig) {
      throw new Error('邮箱配置不能为空');
    }

    // 创建邮箱配置对象
    const emailConfigObj = new EmailConfig({
      imapServer: emailConfig.imapHost,
      imapPort: emailConfig.imapPort,
      username: emailConfig.username,
      password: emailConfig.password,
      useSSL: true,
      provider: 'custom',
      domain: emailConfig.domain
    });

    // 创建注册配置
    const registrationConfig = new RegistrationConfig({
      emailConfig: emailConfigObj,
      userProfile: new UserProfile(),
      headless: headless === true,
      timeout: 60000,
      retryAttempts: 3,
      emailVerificationTimeout: 300000
    });

    // 验证配置
    const validation = registrationConfig.validate();
    if (!validation.isValid) {
      throw new Error(`配置验证失败: ${validation.errors.join(', ')}`);
    }

    // 创建账号管理器
    const apiConfig = apiPort ? { baseUrl: `http://127.0.0.1:${apiPort}` } : {};
    accountManager = createAccountManagerV2({ apiConfig });

    // 初始化
    await accountManager.initialize();

    // 执行注册
    logger.info('开始执行注册流程', { email });
    const result = await accountManager.registerSingleAccount(email, registrationConfig);

    // 输出结果
    outputResult({
      success: result.success,
      email: result.email,
      username: result.accountId,
      error: result.errorMessage
    });

    // 退出码
    process.exit(result.success ? 0 : 1);

  } catch (error) {
    logger.error('注册失败', { error: error.message });

    // 输出错误结果
    outputResult({
      success: false,
      email: '',
      username: null,
      error: error.message
    });

    process.exit(1);

  } finally {
    // 清理资源
    if (accountManager) {
      await accountManager.close();
    }
  }
}

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  outputResult({
    success: false,
    email: '',
    username: null,
    error: `未捕获的异常: ${error.message}`
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  outputResult({
    success: false,
    email: '',
    username: null,
    error: `未处理的 Promise 拒绝: ${reason}`
  });
  process.exit(1);
});

// 执行主函数
main();
