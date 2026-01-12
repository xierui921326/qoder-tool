/**
 * 账号管理器核心逻辑
 * 协调注册流程的中央协调器，管理组件间的交互
 */

import { createLogger } from '../utils/logger.js';
import { createTransactionLogger, TransactionStatus } from '../utils/transaction-logger.js';
import { createErrorHandler } from '../utils/error-handler.js';
import { createRegistrationBot } from '../automation/registration-bot.js';
import { createImapClient } from '../email/imap-client.js';
import { createEmailConfigManager } from '../config/email-config.js';
import { createCredentialStore } from '../storage/credential-store.js';

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
 * 批量处理结果类
 */
export class BatchResult {
  constructor() {
    this.results = [];
    this.totalCount = 0;
    this.successCount = 0;
    this.failureCount = 0;
    this.startTime = new Date().toISOString();
    this.endTime = null;
    this.duration = 0;
  }

  addResult(result) {
    this.results.push(result);
    this.totalCount++;
    
    if (result.success) {
      this.successCount++;
    } else {
      this.failureCount++;
    }
  }

  complete() {
    this.endTime = new Date().toISOString();
    this.duration = new Date(this.endTime) - new Date(this.startTime);
  }

  getSuccessRate() {
    return this.totalCount > 0 ? this.successCount / this.totalCount : 0;
  }

  toJSON() {
    return {
      results: this.results.map(r => r.toJSON()),
      totalCount: this.totalCount,
      successCount: this.successCount,
      failureCount: this.failureCount,
      successRate: this.getSuccessRate(),
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.duration
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

  toJSON() {
    return {
      firstName: this.firstName,
      lastName: this.lastName,
      company: this.company,
      country: this.country,
      timezone: this.timezone
    };
  }

  static fromJSON(json) {
    return new UserProfile(json);
  }
}

/**
 * 注册配置类
 */
export class RegistrationConfig {
  constructor(options = {}) {
    this.emailConfig = options.emailConfig;
    this.userProfile = options.userProfile || new UserProfile();
    this.automationSettings = {
      headless: options.headless === true, // 默认可见模式
      timeout: options.timeout || 60000, // 60秒超时
      retryAttempts: options.retryAttempts || 3,
      screenshotOnError: options.screenshotOnError !== false,
      ...options.automationSettings
    };
    this.retrySettings = {
      maxRetries: options.maxRetries || 3,
      baseDelay: options.baseDelay || 2000,
      maxDelay: options.maxDelay || 30000,
      ...options.retrySettings
    };
    this.emailVerificationTimeout = options.emailVerificationTimeout || 300000; // 5分钟
    this.rateLimitDelay = options.rateLimitDelay || 5000; // 5秒间隔
  }

  validate() {
    const errors = [];

    if (!this.emailConfig) {
      errors.push('邮箱配置不能为空');
    } else {
      const emailValidation = this.emailConfig.validate();
      if (!emailValidation.isValid) {
        errors.push(`邮箱配置无效: ${emailValidation.errors.join(', ')}`);
      }
    }

    if (this.automationSettings.timeout < 10000) {
      errors.push('自动化超时时间不能少于10秒');
    }

    if (this.emailVerificationTimeout < 60000) {
      errors.push('邮件验证超时时间不能少于1分钟');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

/**
 * 账号管理器类
 * 协调注册过程的中央协调器
 */
export class AccountManager {
  constructor(options = {}) {
    this.options = {
      configDir: options.configDir || 'config',
      dataDir: options.dataDir || 'data',
      logDir: options.logDir || 'logs',
      ...options
    };

    this.logger = createLogger({ component: 'AccountManager' });
    this.transactionLogger = createTransactionLogger({
      logDir: this.options.logDir + '/transactions'
    });
    this.errorHandler = createErrorHandler('default', {
      maxRetries: 3,
      baseDelay: 2000
    });

    // 组件实例
    this.emailConfigManager = null;
    this.credentialStore = null;
    this.registrationBot = null;
    this.imapClient = null;

    // 状态管理
    this.isInitialized = false;
    this.activeRegistrations = new Map();
  }

  /**
   * 初始化账号管理器
   */
  async initialize() {
    try {
      this.logger.info('初始化账号管理器');

      // 初始化邮箱配置管理器
      this.emailConfigManager = createEmailConfigManager({
        configDir: this.options.configDir
      });
      await this.emailConfigManager.initialize();

      // 初始化凭据存储
      this.credentialStore = createCredentialStore({
        dataDir: this.options.dataDir
      });
      await this.credentialStore.initialize();

      // 初始化事务日志
      await this.transactionLogger.init();

      this.isInitialized = true;
      this.logger.info('账号管理器初始化完成');

    } catch (error) {
      this.logger.error('账号管理器初始化失败', error);
      throw error;
    }
  }

  /**
   * 注册单个账号
   * @param {string} email - 邮箱地址
   * @param {RegistrationConfig} config - 注册配置
   * @returns {Promise<RegistrationResult>} 注册结果
   */
  async registerSingleAccount(email, config) {
    if (!this.isInitialized) {
      throw new Error('账号管理器未初始化，请先调用initialize()');
    }

    const transactionId = `register-${email}-${Date.now()}`;
    
    try {
      this.logger.info('开始单个账号注册', { email, transactionId });

      // 验证配置
      const validation = config.validate();
      if (!validation.isValid) {
        throw new Error(`配置验证失败: ${validation.errors.join(', ')}`);
      }

      // 开始事务
      await this.transactionLogger.startTransaction(transactionId, 'register_single_account', {
        email,
        config: {
          provider: config.emailConfig.provider,
          userProfile: config.userProfile.toJSON()
        }
      });

      // 检查账号是否已存在
      const existingCredentials = await this.credentialStore.retrieveCredentials(email);
      if (existingCredentials) {
        this.logger.warn('账号已存在', { email });
        
        const result = new RegistrationResult(
          email, 
          false, 
          existingCredentials.accountId, 
          null, 
          '账号已存在'
        );

        await this.transactionLogger.failTransaction(transactionId, new Error('账号已存在'));
        return result;
      }

      // 生成密码
      const password = this.generatePassword();

      // 记录进度
      await this.transactionLogger.logProgress(transactionId, {
        step: 'password_generated',
        passwordLength: password.length
      });

      // 执行注册流程
      const result = await this.executeRegistrationFlow(email, password, config, transactionId);

      // 如果注册成功，存储凭据
      if (result.success && result.verificationCompleted) {
        await this.credentialStore.storeCredentials(email, password, {
          accountId: result.accountId,
          registrationDate: result.timestamp,
          provider: config.emailConfig.provider,
          userProfile: config.userProfile.toJSON()
        });

        await this.transactionLogger.logProgress(transactionId, {
          step: 'credentials_stored'
        });
      }

      // 完成事务
      if (result.success) {
        await this.transactionLogger.completeTransaction(transactionId, {
          result: result.toJSON()
        });
      } else {
        await this.transactionLogger.failTransaction(transactionId, new Error(result.errorMessage));
      }

      this.logger.info('单个账号注册完成', { 
        email, 
        success: result.success,
        transactionId 
      });

      return result;

    } catch (error) {
      this.logger.error('单个账号注册失败', { email, error, transactionId });
      
      await this.transactionLogger.failTransaction(transactionId, error);
      
      return new RegistrationResult(
        email,
        false,
        null,
        null,
        error.message
      );
    }
  }

  /**
   * 执行注册流程
   * @param {string} email - 邮箱地址
   * @param {string} password - 密码
   * @param {RegistrationConfig} config - 注册配置
   * @param {string} transactionId - 事务ID
   * @returns {Promise<RegistrationResult>} 注册结果
   */
  async executeRegistrationFlow(email, password, config, transactionId) {
    try {
      // 1. 初始化浏览器自动化
      this.registrationBot = createRegistrationBot(config.automationSettings);
      
      const initSuccess = await this.registrationBot.initialize();
      if (!initSuccess) {
        throw new Error('浏览器初始化失败');
      }

      await this.transactionLogger.logProgress(transactionId, {
        step: 'browser_initialized'
      });

      // 2. 导航到注册页面
      const navSuccess = await this.registrationBot.navigateToRegistration();
      if (!navSuccess) {
        throw new Error('导航到注册页面失败');
      }

      await this.transactionLogger.logProgress(transactionId, {
        step: 'navigation_completed'
      });

      // 3. 填写注册表单
      const fillSuccess = await this.registrationBot.fillRegistrationForm(
        email, 
        password, 
        config.userProfile
      );
      if (!fillSuccess) {
        throw new Error('填写注册表单失败');
      }

      await this.transactionLogger.logProgress(transactionId, {
        step: 'form_filled'
      });

      // 4. 提交注册表单
      const submitStatus = await this.registrationBot.submitRegistration();
      
      await this.transactionLogger.logProgress(transactionId, {
        step: 'form_submitted',
        submitStatus
      });

      // 5. 处理邮件验证
      let verificationCompleted = false;
      let accountId = null;

      if (submitStatus === 'SUCCESS_PENDING_VERIFICATION') {
        try {
          // 初始化IMAP客户端
          this.imapClient = createImapClient(config.emailConfig);
          
          const verificationResult = await this.handleEmailVerification(
            email, 
            config, 
            transactionId
          );
          
          verificationCompleted = verificationResult.success;
          accountId = verificationResult.accountId;

        } catch (verificationError) {
          this.logger.warn('邮件验证失败，但注册可能已成功', { 
            email, 
            error: verificationError.message 
          });
          
          await this.transactionLogger.logProgress(transactionId, {
            step: 'email_verification_failed',
            error: verificationError.message
          });
        }
      }

      // 6. 清理浏览器资源
      await this.registrationBot.cleanup();

      // 7. 返回结果
      const success = submitStatus.startsWith('SUCCESS') || verificationCompleted;
      const errorMessage = success ? null : `注册失败: ${submitStatus}`;

      return new RegistrationResult(
        email,
        success,
        accountId,
        success ? password : null,
        errorMessage,
        verificationCompleted
      );

    } catch (error) {
      // 清理资源
      if (this.registrationBot) {
        await this.registrationBot.cleanup();
      }
      if (this.imapClient) {
        await this.imapClient.disconnect();
      }

      throw error;
    }
  }

  /**
   * 处理邮件验证
   * @param {string} email - 邮箱地址
   * @param {RegistrationConfig} config - 注册配置
   * @param {string} transactionId - 事务ID
   * @returns {Promise<Object>} 验证结果
   */
  async handleEmailVerification(email, config, transactionId) {
    try {
      this.logger.info('开始邮件验证', { email });

      // 连接到邮箱
      const connectSuccess = await this.imapClient.connect();
      if (!connectSuccess) {
        throw new Error('邮箱连接失败');
      }

      await this.transactionLogger.logProgress(transactionId, {
        step: 'email_connected'
      });

      // 查找验证邮件
      const verificationEmail = await this.imapClient.findVerificationEmail(email, {
        timeout: config.emailVerificationTimeout
      });

      if (!verificationEmail) {
        throw new Error('未找到验证邮件');
      }

      await this.transactionLogger.logProgress(transactionId, {
        step: 'verification_email_found',
        subject: verificationEmail.subject
      });

      // 提取验证链接
      const verificationLinks = this.imapClient.extractVerificationLinks(verificationEmail);
      
      if (verificationLinks.length === 0) {
        throw new Error('未找到验证链接');
      }

      const verificationLink = verificationLinks[0];
      this.logger.info('找到验证链接', { email, link: verificationLink });

      await this.transactionLogger.logProgress(transactionId, {
        step: 'verification_link_extracted',
        link: verificationLink
      });

      // 访问验证链接
      await this.registrationBot.page.goto(verificationLink, {
        waitUntil: 'networkidle',
        timeout: config.automationSettings.timeout
      });

      // 等待验证完成
      await this.registrationBot.smartWait();

      await this.transactionLogger.logProgress(transactionId, {
        step: 'verification_completed'
      });

      // 断开邮箱连接
      await this.imapClient.disconnect();

      // 尝试提取账号ID（如果页面上有显示）
      let accountId = null;
      try {
        accountId = await this.extractAccountId();
      } catch (error) {
        this.logger.warn('无法提取账号ID', { error: error.message });
      }

      return {
        success: true,
        accountId
      };

    } catch (error) {
      if (this.imapClient) {
        await this.imapClient.disconnect();
      }
      throw error;
    }
  }

  /**
   * 提取账号ID
   * @returns {Promise<string|null>} 账号ID
   */
  async extractAccountId() {
    try {
      if (!this.registrationBot || !this.registrationBot.page) {
        return null;
      }

      // 尝试从页面中提取账号ID
      const accountIdSelectors = [
        '[data-testid="account-id"]',
        '.account-id',
        '#account-id',
        '.user-id',
        '#user-id'
      ];

      for (const selector of accountIdSelectors) {
        try {
          const element = await this.registrationBot.page.$(selector);
          if (element) {
            const accountId = await element.textContent();
            if (accountId && accountId.trim()) {
              return accountId.trim();
            }
          }
        } catch (error) {
          continue;
        }
      }

      // 尝试从URL中提取
      const url = this.registrationBot.page.url();
      const urlMatch = url.match(/user[s]?\/([a-zA-Z0-9-_]+)/);
      if (urlMatch) {
        return urlMatch[1];
      }

      return null;

    } catch (error) {
      this.logger.error('提取账号ID失败', error);
      return null;
    }
  }

  /**
   * 批量注册账号
   * @param {Array<string>} emails - 邮箱地址数组
   * @param {RegistrationConfig} config - 注册配置
   * @returns {Promise<BatchResult>} 批量处理结果
   */
  async registerBatchAccounts(emails, config) {
    if (!this.isInitialized) {
      throw new Error('账号管理器未初始化，请先调用initialize()');
    }

    const batchResult = new BatchResult();
    const batchId = `batch-${Date.now()}`;

    try {
      this.logger.info('开始批量账号注册', { 
        emailCount: emails.length,
        batchId 
      });

      // 开始批量事务
      await this.transactionLogger.startTransaction(batchId, 'register_batch_accounts', {
        emailCount: emails.length,
        emails: emails.slice(0, 5) // 只记录前5个邮箱以避免日志过长
      });

      for (let i = 0; i < emails.length; i++) {
        const email = emails[i];
        
        try {
          this.logger.info('处理批量注册', { 
            email, 
            progress: `${i + 1}/${emails.length}`,
            batchId 
          });

          // 注册单个账号
          const result = await this.registerSingleAccount(email, config);
          batchResult.addResult(result);

          await this.transactionLogger.logProgress(batchId, {
            step: 'account_processed',
            email,
            success: result.success,
            progress: `${i + 1}/${emails.length}`
          });

          // 速率限制：在处理下一个账号前等待
          if (i < emails.length - 1) {
            this.logger.info('速率限制等待', { 
              delay: config.rateLimitDelay,
              nextEmail: emails[i + 1] 
            });
            
            await new Promise(resolve => 
              setTimeout(resolve, config.rateLimitDelay)
            );
          }

        } catch (error) {
          this.logger.error('批量注册中的单个账号失败', { 
            email, 
            error: error.message,
            batchId 
          });

          const failedResult = new RegistrationResult(
            email,
            false,
            null,
            null,
            error.message
          );
          
          batchResult.addResult(failedResult);
        }
      }

      batchResult.complete();

      // 完成批量事务
      await this.transactionLogger.completeTransaction(batchId, {
        result: batchResult.toJSON()
      });

      this.logger.info('批量账号注册完成', {
        batchId,
        totalCount: batchResult.totalCount,
        successCount: batchResult.successCount,
        failureCount: batchResult.failureCount,
        successRate: batchResult.getSuccessRate(),
        duration: batchResult.duration
      });

      return batchResult;

    } catch (error) {
      this.logger.error('批量账号注册失败', { batchId, error });
      
      await this.transactionLogger.failTransaction(batchId, error);
      
      batchResult.complete();
      return batchResult;
    }
  }

  /**
   * 获取存储的凭据
   * @param {string} email - 邮箱地址
   * @returns {Promise<Object|null>} 账号凭据
   */
  async getStoredCredentials(email) {
    if (!this.isInitialized) {
      throw new Error('账号管理器未初始化');
    }

    try {
      return await this.credentialStore.retrieveCredentials(email);
    } catch (error) {
      this.logger.error('获取存储凭据失败', { email, error });
      throw error;
    }
  }

  /**
   * 导出凭据
   * @param {string} outputPath - 输出路径
   * @returns {Promise<boolean>} 导出是否成功
   */
  async exportCredentials(outputPath) {
    if (!this.isInitialized) {
      throw new Error('账号管理器未初始化');
    }

    try {
      return await this.credentialStore.backupCredentials(outputPath);
    } catch (error) {
      this.logger.error('导出凭据失败', { outputPath, error });
      throw error;
    }
  }

  /**
   * 生成密码
   * @param {Object} options - 密码选项
   * @returns {string} 生成的密码
   */
  generatePassword(options = {}) {
    const {
      length = 16,
      includeUppercase = true,
      includeLowercase = true,
      includeNumbers = true,
      includeSymbols = true,
      excludeSimilar = true
    } = options;

    let charset = '';
    
    if (includeLowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
    if (includeUppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (includeNumbers) charset += '0123456789';
    if (includeSymbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';

    if (excludeSimilar) {
      charset = charset.replace(/[0O1lI]/g, '');
    }

    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }

    return password;
  }

  /**
   * 关闭账号管理器
   */
  async close() {
    try {
      if (this.transactionLogger) {
        await this.transactionLogger.close();
      }

      if (this.registrationBot) {
        await this.registrationBot.cleanup();
      }

      if (this.imapClient) {
        await this.imapClient.disconnect();
      }

      this.logger.info('账号管理器已关闭');
    } catch (error) {
      this.logger.error('关闭账号管理器时出错', error);
    }
  }
}

/**
 * 创建账号管理器
 * @param {Object} options - 选项
 * @returns {AccountManager} 账号管理器实例
 */
export function createAccountManager(options = {}) {
  return new AccountManager(options);
}