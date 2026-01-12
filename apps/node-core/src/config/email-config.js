/**
 * 邮箱配置管理系统
 * 提供邮箱服务器配置、IMAP设置和邮件提供商快速配置功能
 */

import fs from 'fs/promises';
import path from 'path';
import { createLogger } from '../utils/logger.js';

/**
 * 邮箱配置类
 */
export class EmailConfig {
  constructor(options = {}) {
    this.imapServer = options.imapServer || '';
    this.imapPort = options.imapPort || 993;
    this.smtpServer = options.smtpServer || '';
    this.smtpPort = options.smtpPort || 587;
    this.username = options.username || '';
    this.password = options.password || '';
    this.useSSL = options.useSSL !== false;
    this.useTLS = options.useTLS !== false;
    this.folder = options.folder || 'INBOX';
    this.provider = options.provider || 'custom';
    this.domain = options.domain || '';
  }

  /**
   * 验证配置
   * @returns {Object} 验证结果
   */
  validate() {
    const errors = [];

    if (!this.imapServer) {
      errors.push('IMAP服务器地址不能为空');
    }

    if (!this.username) {
      errors.push('用户名不能为空');
    }

    if (!this.password) {
      errors.push('密码不能为空');
    }

    if (this.imapPort < 1 || this.imapPort > 65535) {
      errors.push('IMAP端口必须在1-65535之间');
    }

    if (this.smtpPort < 1 || this.smtpPort > 65535) {
      errors.push('SMTP端口必须在1-65535之间');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 转换为JSON对象
   * @returns {Object} JSON对象
   */
  toJSON() {
    return {
      imapServer: this.imapServer,
      imapPort: this.imapPort,
      smtpServer: this.smtpServer,
      smtpPort: this.smtpPort,
      username: this.username,
      password: this.password, // 注意：实际使用时应该加密存储
      useSSL: this.useSSL,
      useTLS: this.useTLS,
      folder: this.folder,
      provider: this.provider,
      domain: this.domain
    };
  }

  /**
   * 从JSON对象创建配置
   * @param {Object} json - JSON对象
   * @returns {EmailConfig} 邮箱配置实例
   */
  static fromJSON(json) {
    return new EmailConfig(json);
  }
}

/**
 * 邮箱配置管理器
 */
export class EmailConfigManager {
  constructor(options = {}) {
    this.options = {
      configDir: options.configDir || 'config',
      configFile: options.configFile || 'email-configs.json',
      ...options
    };

    this.logger = createLogger({ component: 'EmailConfigManager' });
    this.configs = new Map();
    this.providers = this.initializeProviders();
  }

  /**
   * 初始化邮件提供商预设配置
   * @returns {Map} 提供商配置映射
   */
  initializeProviders() {
    const providers = new Map();

    // Gmail配置
    providers.set('gmail', {
      name: 'Gmail',
      imapServer: 'imap.gmail.com',
      imapPort: 993,
      smtpServer: 'smtp.gmail.com',
      smtpPort: 587,
      useSSL: true,
      useTLS: true,
      requiresAppPassword: true,
      setupInstructions: [
        '1. 启用两步验证',
        '2. 生成应用专用密码',
        '3. 使用应用密码而不是账号密码'
      ]
    });

    // Outlook/Hotmail配置
    providers.set('outlook', {
      name: 'Outlook/Hotmail',
      imapServer: 'outlook.office365.com',
      imapPort: 993,
      smtpServer: 'smtp-mail.outlook.com',
      smtpPort: 587,
      useSSL: true,
      useTLS: true,
      requiresAppPassword: false,
      setupInstructions: [
        '1. 启用IMAP访问',
        '2. 使用账号密码登录'
      ]
    });

    // Yahoo配置
    providers.set('yahoo', {
      name: 'Yahoo Mail',
      imapServer: 'imap.mail.yahoo.com',
      imapPort: 993,
      smtpServer: 'smtp.mail.yahoo.com',
      smtpPort: 587,
      useSSL: true,
      useTLS: true,
      requiresAppPassword: true,
      setupInstructions: [
        '1. 启用两步验证',
        '2. 生成应用密码',
        '3. 使用应用密码登录'
      ]
    });

    // QQ邮箱配置
    providers.set('qq', {
      name: 'QQ邮箱',
      imapServer: 'imap.qq.com',
      imapPort: 993,
      smtpServer: 'smtp.qq.com',
      smtpPort: 587,
      useSSL: true,
      useTLS: true,
      requiresAppPassword: true,
      setupInstructions: [
        '1. 开启IMAP/SMTP服务',
        '2. 获取授权码',
        '3. 使用授权码作为密码'
      ]
    });

    // 163邮箱配置
    providers.set('163', {
      name: '163邮箱',
      imapServer: 'imap.163.com',
      imapPort: 993,
      smtpServer: 'smtp.163.com',
      smtpPort: 587,
      useSSL: true,
      useTLS: true,
      requiresAppPassword: true,
      setupInstructions: [
        '1. 开启IMAP/SMTP服务',
        '2. 设置客户端授权密码',
        '3. 使用授权密码登录'
      ]
    });

    // 126邮箱配置
    providers.set('126', {
      name: '126邮箱',
      imapServer: 'imap.126.com',
      imapPort: 993,
      smtpServer: 'smtp.126.com',
      smtpPort: 587,
      useSSL: true,
      useTLS: true,
      requiresAppPassword: true,
      setupInstructions: [
        '1. 开启IMAP/SMTP服务',
        '2. 设置客户端授权密码',
        '3. 使用授权密码登录'
      ]
    });

    return providers;
  }

  /**
   * 初始化配置管理器
   */
  async initialize() {
    try {
      // 确保配置目录存在
      await fs.mkdir(this.options.configDir, { recursive: true });
      
      // 加载现有配置
      await this.loadConfigs();
      
      this.logger.info('邮箱配置管理器初始化完成', {
        configDir: this.options.configDir,
        configCount: this.configs.size,
        providerCount: this.providers.size
      });
    } catch (error) {
      this.logger.error('邮箱配置管理器初始化失败', error);
      throw error;
    }
  }

  /**
   * 加载配置文件
   */
  async loadConfigs() {
    try {
      const configPath = path.join(this.options.configDir, this.options.configFile);
      
      try {
        const configData = await fs.readFile(configPath, 'utf8');
        const configs = JSON.parse(configData);
        
        this.configs.clear();
        for (const [key, configJson] of Object.entries(configs)) {
          this.configs.set(key, EmailConfig.fromJSON(configJson));
        }
        
        this.logger.info('邮箱配置加载完成', { 
          configCount: this.configs.size,
          configPath 
        });
      } catch (error) {
        if (error.code === 'ENOENT') {
          this.logger.info('配置文件不存在，将创建新文件', { configPath });
        } else {
          throw error;
        }
      }
    } catch (error) {
      this.logger.error('加载邮箱配置失败', error);
      throw error;
    }
  }

  /**
   * 保存配置文件
   */
  async saveConfigs() {
    try {
      const configPath = path.join(this.options.configDir, this.options.configFile);
      
      const configsJson = {};
      for (const [key, config] of this.configs) {
        configsJson[key] = config.toJSON();
      }
      
      await fs.writeFile(configPath, JSON.stringify(configsJson, null, 2), 'utf8');
      
      this.logger.info('邮箱配置保存完成', { 
        configCount: this.configs.size,
        configPath 
      });
    } catch (error) {
      this.logger.error('保存邮箱配置失败', error);
      throw error;
    }
  }

  /**
   * 添加邮箱配置
   * @param {string} name - 配置名称
   * @param {EmailConfig} config - 邮箱配置
   */
  async addConfig(name, config) {
    try {
      // 验证配置
      const validation = config.validate();
      if (!validation.isValid) {
        throw new Error(`配置验证失败: ${validation.errors.join(', ')}`);
      }

      this.configs.set(name, config);
      await this.saveConfigs();
      
      this.logger.info('邮箱配置添加成功', { name, provider: config.provider });
    } catch (error) {
      this.logger.error('添加邮箱配置失败', { name, error });
      throw error;
    }
  }

  /**
   * 获取邮箱配置
   * @param {string} name - 配置名称
   * @returns {EmailConfig|null} 邮箱配置
   */
  getConfig(name) {
    return this.configs.get(name) || null;
  }

  /**
   * 删除邮箱配置
   * @param {string} name - 配置名称
   */
  async removeConfig(name) {
    try {
      if (this.configs.has(name)) {
        this.configs.delete(name);
        await this.saveConfigs();
        this.logger.info('邮箱配置删除成功', { name });
      } else {
        throw new Error(`配置不存在: ${name}`);
      }
    } catch (error) {
      this.logger.error('删除邮箱配置失败', { name, error });
      throw error;
    }
  }

  /**
   * 列出所有配置
   * @returns {Array} 配置列表
   */
  listConfigs() {
    return Array.from(this.configs.entries()).map(([name, config]) => ({
      name,
      provider: config.provider,
      domain: config.domain,
      username: config.username,
      imapServer: config.imapServer
    }));
  }

  /**
   * 根据邮箱地址自动检测提供商
   * @param {string} email - 邮箱地址
   * @returns {string|null} 提供商名称
   */
  detectProvider(email) {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return null;

    const domainProviderMap = {
      'gmail.com': 'gmail',
      'googlemail.com': 'gmail',
      'outlook.com': 'outlook',
      'hotmail.com': 'outlook',
      'live.com': 'outlook',
      'yahoo.com': 'yahoo',
      'yahoo.cn': 'yahoo',
      'qq.com': 'qq',
      '163.com': '163',
      '126.com': '126'
    };

    return domainProviderMap[domain] || null;
  }

  /**
   * 创建基于提供商的配置
   * @param {string} provider - 提供商名称
   * @param {string} username - 用户名
   * @param {string} password - 密码
   * @param {Object} options - 额外选项
   * @returns {EmailConfig} 邮箱配置
   */
  createProviderConfig(provider, username, password, options = {}) {
    const providerConfig = this.providers.get(provider);
    if (!providerConfig) {
      throw new Error(`不支持的邮件提供商: ${provider}`);
    }

    return new EmailConfig({
      imapServer: providerConfig.imapServer,
      imapPort: providerConfig.imapPort,
      smtpServer: providerConfig.smtpServer,
      smtpPort: providerConfig.smtpPort,
      username,
      password,
      useSSL: providerConfig.useSSL,
      useTLS: providerConfig.useTLS,
      provider,
      domain: username.split('@')[1] || '',
      ...options
    });
  }

  /**
   * 获取提供商信息
   * @param {string} provider - 提供商名称
   * @returns {Object|null} 提供商信息
   */
  getProviderInfo(provider) {
    return this.providers.get(provider) || null;
  }

  /**
   * 列出所有支持的提供商
   * @returns {Array} 提供商列表
   */
  listProviders() {
    return Array.from(this.providers.entries()).map(([key, provider]) => ({
      key,
      name: provider.name,
      requiresAppPassword: provider.requiresAppPassword,
      setupInstructions: provider.setupInstructions
    }));
  }

  /**
   * 快速配置邮箱
   * @param {string} email - 邮箱地址
   * @param {string} password - 密码
   * @param {Object} options - 额外选项
   * @returns {EmailConfig} 邮箱配置
   */
  quickSetup(email, password, options = {}) {
    const provider = this.detectProvider(email);
    if (!provider) {
      throw new Error(`无法自动检测邮箱提供商: ${email}`);
    }

    return this.createProviderConfig(provider, email, password, options);
  }

  /**
   * 测试邮箱连接
   * @param {EmailConfig} config - 邮箱配置
   * @returns {Promise<Object>} 测试结果
   */
  async testConnection(config) {
    try {
      this.logger.info('开始测试邮箱连接', { 
        username: config.username,
        imapServer: config.imapServer 
      });

      // 验证配置
      const validation = config.validate();
      if (!validation.isValid) {
        return {
          success: false,
          error: `配置验证失败: ${validation.errors.join(', ')}`
        };
      }

      // 实际的IMAP连接测试
      const { createImapClient } = await import('../email/imap-client.js');
      const imapClient = createImapClient(config);
      
      const testResult = await imapClient.testConnection();
      
      if (testResult.success) {
        this.logger.info('邮箱连接测试成功', { 
          username: config.username,
          details: testResult.details 
        });
      } else {
        this.logger.error('邮箱连接测试失败', { 
          username: config.username,
          error: testResult.error 
        });
      }
      
      return testResult;
    } catch (error) {
      this.logger.error('邮箱连接测试失败', { 
        username: config.username,
        error: error.message 
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }
}

/**
 * 创建邮箱配置管理器
 * @param {Object} options - 选项
 * @returns {EmailConfigManager} 邮箱配置管理器实例
 */
export function createEmailConfigManager(options = {}) {
  return new EmailConfigManager(options);
}

/**
 * 全局邮箱配置管理器实例
 */
export const globalEmailConfigManager = new EmailConfigManager();