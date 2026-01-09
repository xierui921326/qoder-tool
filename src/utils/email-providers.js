/**
 * 邮件提供商配置管理
 * 提供常见邮件服务商的IMAP配置
 */
import { EmailConfig } from '../core/types.js';

/**
 * 常见邮件提供商的IMAP配置
 */
export const EMAIL_PROVIDERS = {
  // Gmail
  'gmail.com': {
    imapServer: 'imap.gmail.com',
    imapPort: 993,
    useSSL: true,
    smtpServer: 'smtp.gmail.com',
    smtpPort: 587,
    requiresAppPassword: true,
    setupInstructions: '需要启用两步验证并生成应用专用密码'
  },

  // Outlook/Hotmail
  'outlook.com': {
    imapServer: 'outlook.office365.com',
    imapPort: 993,
    useSSL: true,
    smtpServer: 'smtp-mail.outlook.com',
    smtpPort: 587
  },
  'hotmail.com': {
    imapServer: 'outlook.office365.com',
    imapPort: 993,
    useSSL: true,
    smtpServer: 'smtp-mail.outlook.com',
    smtpPort: 587
  },

  // Yahoo
  'yahoo.com': {
    imapServer: 'imap.mail.yahoo.com',
    imapPort: 993,
    useSSL: true,
    smtpServer: 'smtp.mail.yahoo.com',
    smtpPort: 587,
    requiresAppPassword: true,
    setupInstructions: '需要启用两步验证并生成应用专用密码'
  },

  // QQ邮箱
  'qq.com': {
    imapServer: 'imap.qq.com',
    imapPort: 993,
    useSSL: true,
    smtpServer: 'smtp.qq.com',
    smtpPort: 587,
    requiresAppPassword: true,
    setupInstructions: '需要在QQ邮箱设置中开启IMAP服务并获取授权码'
  },

  // 163邮箱
  '163.com': {
    imapServer: 'imap.163.com',
    imapPort: 993,
    useSSL: true,
    smtpServer: 'smtp.163.com',
    smtpPort: 587,
    requiresAppPassword: true,
    setupInstructions: '需要在163邮箱设置中开启IMAP服务并获取授权码'
  },

  // 126邮箱
  '126.com': {
    imapServer: 'imap.126.com',
    imapPort: 993,
    useSSL: true,
    smtpServer: 'smtp.126.com',
    smtpPort: 587,
    requiresAppPassword: true,
    setupInstructions: '需要在126邮箱设置中开启IMAP服务并获取授权码'
  },

  // 新浪邮箱
  'sina.com': {
    imapServer: 'imap.sina.com',
    imapPort: 993,
    useSSL: true,
    smtpServer: 'smtp.sina.com',
    smtpPort: 587
  },

  // 企业邮箱常见配置
  'exmail.qq.com': {
    imapServer: 'imap.exmail.qq.com',
    imapPort: 993,
    useSSL: true,
    smtpServer: 'smtp.exmail.qq.com',
    smtpPort: 587,
    isEnterprise: true
  }
};

/**
 * 邮件提供商配置管理器
 */
export class EmailProviderManager {
  /**
   * 根据邮箱地址获取提供商配置
   * @param {string} email - 邮箱地址
   * @returns {Object|null} 提供商配置
   */
  static getProviderConfig(email) {
    if (!email || !email.includes('@')) {
      return null;
    }

    const domain = email.split('@')[1].toLowerCase();
    return EMAIL_PROVIDERS[domain] || null;
  }

  /**
   * 创建邮件配置
   * @param {string} email - 邮箱地址
   * @param {string} password - 密码或应用专用密码
   * @param {Object} customConfig - 自定义配置（可选）
   * @returns {EmailConfig|null} 邮件配置对象
   */
  static createEmailConfig(email, password, customConfig = {}) {
    const providerConfig = this.getProviderConfig(email);
    
    if (!providerConfig && !customConfig.imapServer) {
      return null;
    }

    // 合并提供商配置和自定义配置
    const config = {
      ...providerConfig,
      ...customConfig
    };

    return new EmailConfig(
      config.imapServer,
      config.imapPort,
      email,
      password,
      config.useSSL,
      config.folder || 'INBOX'
    );
  }

  /**
   * 验证邮件配置
   * @param {EmailConfig} emailConfig - 邮件配置
   * @returns {Object} 验证结果
   */
  static validateEmailConfig(emailConfig) {
    const result = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // 基本验证
    if (!emailConfig.username || !emailConfig.username.includes('@')) {
      result.errors.push('邮箱地址格式无效');
      result.isValid = false;
    }

    if (!emailConfig.password) {
      result.errors.push('密码不能为空');
      result.isValid = false;
    }

    if (!emailConfig.imapServer) {
      result.errors.push('IMAP服务器地址不能为空');
      result.isValid = false;
    }

    if (!emailConfig.imapPort || emailConfig.imapPort < 1 || emailConfig.imapPort > 65535) {
      result.errors.push('IMAP端口号无效');
      result.isValid = false;
    }

    // 提供商特定验证
    if (result.isValid) {
      const providerConfig = this.getProviderConfig(emailConfig.username);
      
      if (providerConfig) {
        // 检查是否需要应用专用密码
        if (providerConfig.requiresAppPassword) {
          result.warnings.push(`${emailConfig.username.split('@')[1]} 通常需要应用专用密码而非普通密码`);
          
          if (providerConfig.setupInstructions) {
            result.warnings.push(providerConfig.setupInstructions);
          }
        }

        // 检查配置是否匹配推荐设置
        if (emailConfig.imapServer !== providerConfig.imapServer) {
          result.warnings.push(`推荐的IMAP服务器为: ${providerConfig.imapServer}`);
        }

        if (emailConfig.imapPort !== providerConfig.imapPort) {
          result.warnings.push(`推荐的IMAP端口为: ${providerConfig.imapPort}`);
        }

        if (emailConfig.useSSL !== providerConfig.useSSL) {
          result.warnings.push(`推荐${providerConfig.useSSL ? '启用' : '禁用'}SSL`);
        }
      }
    }

    return result;
  }

  /**
   * 获取所有支持的邮件提供商
   * @returns {Array} 提供商列表
   */
  static getSupportedProviders() {
    return Object.keys(EMAIL_PROVIDERS).map(domain => ({
      domain,
      config: EMAIL_PROVIDERS[domain],
      displayName: this.getProviderDisplayName(domain)
    }));
  }

  /**
   * 获取提供商显示名称
   * @param {string} domain - 域名
   * @returns {string} 显示名称
   */
  static getProviderDisplayName(domain) {
    const displayNames = {
      'gmail.com': 'Gmail',
      'outlook.com': 'Outlook',
      'hotmail.com': 'Hotmail',
      'yahoo.com': 'Yahoo Mail',
      'qq.com': 'QQ邮箱',
      '163.com': '163邮箱',
      '126.com': '126邮箱',
      'sina.com': '新浪邮箱',
      'exmail.qq.com': '腾讯企业邮箱'
    };

    return displayNames[domain] || domain;
  }

  /**
   * 检测邮箱类型
   * @param {string} email - 邮箱地址
   * @returns {Object} 邮箱类型信息
   */
  static detectEmailType(email) {
    const providerConfig = this.getProviderConfig(email);
    
    if (!providerConfig) {
      return {
        type: 'unknown',
        isSupported: false,
        domain: email.split('@')[1],
        displayName: '未知提供商'
      };
    }

    const domain = email.split('@')[1];
    
    return {
      type: providerConfig.isEnterprise ? 'enterprise' : 'personal',
      isSupported: true,
      domain,
      displayName: this.getProviderDisplayName(domain),
      requiresAppPassword: providerConfig.requiresAppPassword || false,
      setupInstructions: providerConfig.setupInstructions
    };
  }

  /**
   * 生成邮件配置向导
   * @param {string} email - 邮箱地址
   * @returns {Object} 配置向导信息
   */
  static generateConfigWizard(email) {
    const emailType = this.detectEmailType(email);
    const providerConfig = this.getProviderConfig(email);

    const wizard = {
      email,
      emailType,
      steps: []
    };

    if (!emailType.isSupported) {
      wizard.steps.push({
        step: 1,
        title: '手动配置',
        description: '该邮件提供商不在预设列表中，需要手动配置IMAP设置',
        action: 'manual_config',
        fields: ['imapServer', 'imapPort', 'useSSL']
      });
    } else {
      wizard.steps.push({
        step: 1,
        title: '基本信息',
        description: `配置${emailType.displayName}邮箱`,
        action: 'basic_info',
        fields: ['email', 'password']
      });

      if (emailType.requiresAppPassword) {
        wizard.steps.push({
          step: 2,
          title: '应用专用密码',
          description: emailType.setupInstructions,
          action: 'app_password_setup',
          isRequired: true
        });
      }

      wizard.steps.push({
        step: emailType.requiresAppPassword ? 3 : 2,
        title: '测试连接',
        description: '验证邮箱配置是否正确',
        action: 'test_connection'
      });
    }

    // 添加推荐配置
    if (providerConfig) {
      wizard.recommendedConfig = {
        imapServer: providerConfig.imapServer,
        imapPort: providerConfig.imapPort,
        useSSL: providerConfig.useSSL,
        folder: 'INBOX'
      };
    }

    return wizard;
  }
}

/**
 * 创建快速邮件配置
 * @param {string} email - 邮箱地址
 * @param {string} password - 密码
 * @returns {EmailConfig|null} 邮件配置
 */
export function createQuickEmailConfig(email, password) {
  return EmailProviderManager.createEmailConfig(email, password);
}

/**
 * 获取邮件提供商信息
 * @param {string} email - 邮箱地址
 * @returns {Object} 提供商信息
 */
export function getEmailProviderInfo(email) {
  return EmailProviderManager.detectEmailType(email);
}