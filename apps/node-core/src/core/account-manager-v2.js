/**
 * 账号管理器 V2
 * 使用 Tauri API 进行数据存储，不再使用本地数据库
 */

import { createLogger } from '../utils/logger.js';
import { createApiClient } from '../api/api-client.js';
import { createRegistrationBot } from '../automation/registration-bot.js';
import { createImapClient } from '../email/imap-client.js';
import { EmailConfig } from '../config/email-config.js';

const logger = createLogger({ component: 'AccountManagerV2' });

/**
 * 注册结果类
 */
export class RegistrationResult {
  constructor(email, success, accountId = null, password = null, errorMessage = null, verificationCompleted = false) {
    this.email = email;
    this.success = success;
    this.accountId = accountId;
    this.password = password;
    this.errorMessage = errorMessage;
    this.timestamp = new Date().toISOString();
    this.verificationCompleted = verificationCompleted;
  }

  toJSON() {
    return {
      email: this.email,
      success: this.success,
      accountId: this.accountId,
      password: this.password,
      errorMessage: this.errorMessage,
      timestamp: this.timestamp,
      verificationCompleted: this.verificationCompleted
    };
  }
}

/**
 * 用户资料类
 */
export class UserProfile {
  constructor(options = {}) {
    this.firstName = options.firstName || '';
    this.lastName = options.lastName || '';
    this.company = options.company || '';
    this.country = options.country || 'CN';
    this.timezone = options.timezone || 'Asia/Shanghai';
  }
}

/**
 * 注册配置类
 */
export class RegistrationConfig {
  constructor(options = {}) {
    this.emailConfig = options.emailConfig;
    this.userProfile = options.userProfile || new UserProfile();
    this.headless = options.headless === true;
    this.timeout = options.timeout || 60000;
    this.retryAttempts = options.retryAttempts || 3;
    this.emailVerificationTimeout = options.emailVerificationTimeout || 300000;
    this.rateLimitDelay = options.rateLimitDelay || 5000;
  }

  validate() {
    const errors = [];
    if (!this.emailConfig) {
      errors.push('邮箱配置不能为空');
    }
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

/**
 * 账号管理器 V2
 * 通过 Tauri API 进行所有数据操作
 */
export class AccountManagerV2 {
  constructor(options = {}) {
    this.options = options;
    this.apiClient = createApiClient(options.apiConfig);
    this.isInitialized = false;
  }

  /**
   * 初始化账号管理器
   */
  async initialize() {
    logger.info('初始化账号管理器 V2');

    // 等待 API 服务器就绪
    const isReady = await this.apiClient.waitForReady(10, 1000);
    if (!isReady) {
      throw new Error('无法连接到 Tauri API 服务器，请确保桌面应用已启动');
    }

    this.isInitialized = true;
    logger.info('账号管理器 V2 初始化完成');
  }

  /**
   * 获取邮箱配置
   * @param {string} configId - 配置 ID
   * @returns {Promise<EmailConfig>} 邮箱配置
   */
  async getEmailConfig(configId) {
    const config = await this.apiClient.getEmailConfigById(configId);
    
    // 转换为 EmailConfig 对象
    return new EmailConfig({
      imapServer: config.imap_host,
      imapPort: config.imap_port,
      username: config.username,
      password: config.password,
      useSSL: true,
      provider: 'custom',
      domain: config.domain
    });
  }

  /**
   * 生成随机密码
   * @returns {string} 随机密码
   */
  generatePassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
    let password = '';
    for (let i = 0; i < 16; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  /**
   * 生成随机用户名
   * @returns {string} 随机用户名（8位字母 + 6位数字）
   */
  generateUsername() {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const digits = '0123456789';
    
    let username = '';
    for (let i = 0; i < 8; i++) {
      username += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    for (let i = 0; i < 6; i++) {
      username += digits.charAt(Math.floor(Math.random() * digits.length));
    }
    return username;
  }

  /**
   * 注册单个账号
   * @param {string} email - 邮箱地址
   * @param {RegistrationConfig} config - 注册配置
   * @returns {Promise<RegistrationResult>} 注册结果
   */
  async registerSingleAccount(email, config) {
    if (!this.isInitialized) {
      throw new Error('账号管理器未初始化');
    }

    const username = this.generateUsername();
    const password = this.generatePassword();

    logger.info('开始注册账号', { email, username });
    await this.apiClient.logInfo(`开始注册账号: ${email}`);

    try {
      // 验证配置
      const validation = config.validate();
      if (!validation.isValid) {
        throw new Error(`配置验证失败: ${validation.errors.join(', ')}`);
      }

      // 执行注册流程
      const result = await this.executeRegistration(email, username, password, config);

      // 如果注册成功，保存到数据库
      if (result.success) {
        await this.apiClient.createAccount({
          email,
          username,
          password,
          status: 'active'
        });
        await this.apiClient.logInfo(`账号注册成功: ${email}`);
      } else {
        await this.apiClient.logError(`账号注册失败: ${email} - ${result.errorMessage}`);
      }

      return result;

    } catch (error) {
      logger.error('注册失败', { email, error: error.message });
      await this.apiClient.logError(`注册异常: ${email} - ${error.message}`);
      
      return new RegistrationResult(
        email,
        false,
        null,
        null,
        error.message,
        false
      );
    }
  }

  /**
   * 执行注册流程
   * @param {string} email - 邮箱
   * @param {string} username - 用户名
   * @param {string} password - 密码
   * @param {RegistrationConfig} config - 配置
   * @returns {Promise<RegistrationResult>} 注册结果
   */
  async executeRegistration(email, username, password, config) {
    // 创建注册机器人
    const bot = createRegistrationBot({
      headless: config.headless,
      timeout: config.timeout
    });

    try {
      // 初始化浏览器
      const initialized = await bot.initialize();
      if (!initialized) {
        return new RegistrationResult(
          email,
          false,
          null,
          password,
          '浏览器初始化失败',
          false
        );
      }

      // 导航到注册页面
      const navigated = await bot.navigateToRegistration();
      if (!navigated) {
        return new RegistrationResult(
          email,
          false,
          null,
          password,
          '无法导航到注册页面',
          false
        );
      }

      // 填写注册表单
      const filled = await bot.fillRegistrationForm(email, password, config.userProfile);
      if (!filled) {
        return new RegistrationResult(
          email,
          false,
          null,
          password,
          '填写注册表单失败',
          false
        );
      }

      // 提交注册
      const submitResult = await bot.submitRegistration();
      
      // 检查提交结果
      if (submitResult.startsWith('ERROR') || submitResult.startsWith('VALIDATION_ERROR')) {
        return new RegistrationResult(
          email,
          false,
          null,
          password,
          submitResult,
          false
        );
      }

      // 等待邮件验证（如果需要）
      let verificationCompleted = false;
      if (submitResult === 'SUCCESS_PENDING_VERIFICATION' && config.emailConfig) {
        try {
          const imapClient = createImapClient(config.emailConfig);
          const verificationResult = await this.waitForVerificationEmail(
            imapClient,
            email,
            config.emailVerificationTimeout
          );

          if (verificationResult.success && verificationResult.verificationUrl) {
            // 访问验证链接
            await bot.page.goto(verificationResult.verificationUrl, { waitUntil: 'networkidle' });
            verificationCompleted = true;
          }
        } catch (verifyError) {
          logger.warn('邮件验证失败', { error: verifyError.message });
        }
      }

      return new RegistrationResult(
        email,
        true,
        username,
        password,
        null,
        verificationCompleted
      );

    } finally {
      await bot.cleanup();
    }
  }

  /**
   * 等待验证邮件
   * @param {Object} imapClient - IMAP 客户端
   * @param {string} email - 邮箱地址
   * @param {number} timeout - 超时时间
   * @returns {Promise<Object>} 验证结果
   */
  async waitForVerificationEmail(imapClient, email, timeout) {
    const startTime = Date.now();
    const checkInterval = 5000;

    while (Date.now() - startTime < timeout) {
      try {
        const verificationEmail = await imapClient.findVerificationEmail(email);
        if (verificationEmail) {
          return {
            success: true,
            verificationUrl: verificationEmail.verificationUrl
          };
        }
      } catch (error) {
        logger.warn('检查验证邮件失败', { error: error.message });
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    return {
      success: false,
      error: '等待验证邮件超时'
    };
  }

  /**
   * 关闭账号管理器
   */
  async close() {
    logger.info('关闭账号管理器 V2');
    this.isInitialized = false;
  }
}

/**
 * 创建账号管理器 V2 实例
 * @param {Object} options - 选项
 * @returns {AccountManagerV2} 账号管理器实例
 */
export function createAccountManagerV2(options = {}) {
  return new AccountManagerV2(options);
}
