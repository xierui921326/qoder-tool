/**
 * 邮件接收器
 * 支持多种邮箱提供商的验证码接收功能
 * 参考: https://github.com/crispvibe/Windsurf-Tool
 */

import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { createLogger } from '../utils/logger.js';

/**
 * 邮箱提供商配置
 */
const EMAIL_PROVIDERS = {
  // QQ邮箱
  qq: {
    imap: {
      host: 'imap.qq.com',
      port: 993,
      tls: true
    },
    // QQ邮箱需要使用授权码而非密码
    authType: 'authCode',
    searchFolder: 'INBOX'
  },
  // 网易163邮箱
  '163': {
    imap: {
      host: 'imap.163.com',
      port: 993,
      tls: true
    },
    authType: 'authCode',
    searchFolder: 'INBOX'
  },
  // 网易126邮箱
  '126': {
    imap: {
      host: 'imap.126.com',
      port: 993,
      tls: true
    },
    authType: 'authCode',
    searchFolder: 'INBOX'
  },
  // Gmail
  gmail: {
    imap: {
      host: 'imap.gmail.com',
      port: 993,
      tls: true
    },
    // Gmail需要应用专用密码
    authType: 'appPassword',
    searchFolder: 'INBOX'
  },
  // Outlook/Hotmail
  outlook: {
    imap: {
      host: 'outlook.office365.com',
      port: 993,
      tls: true
    },
    authType: 'password',
    searchFolder: 'INBOX'
  },
  // Yahoo邮箱
  yahoo: {
    imap: {
      host: 'imap.mail.yahoo.com',
      port: 993,
      tls: true
    },
    authType: 'appPassword',
    searchFolder: 'INBOX'
  },
  // iCloud邮箱
  icloud: {
    imap: {
      host: 'imap.mail.me.com',
      port: 993,
      tls: true
    },
    authType: 'appPassword',
    searchFolder: 'INBOX'
  },
  // 阿里云企业邮箱
  aliyun: {
    imap: {
      host: 'imap.qiye.aliyun.com',
      port: 993,
      tls: true
    },
    authType: 'password',
    searchFolder: 'INBOX'
  },
  // 腾讯企业邮箱
  exmail: {
    imap: {
      host: 'imap.exmail.qq.com',
      port: 993,
      tls: true
    },
    authType: 'password',
    searchFolder: 'INBOX'
  }
};

/**
 * 邮件接收器类
 */
export class EmailReceiver {
  constructor(config) {
    this.config = config;
    this.logger = createLogger({ component: 'EmailReceiver' });
    this.imap = null;
    this.isConnected = false;
    
    // 自动检测邮箱提供商
    this.provider = this.detectProvider(config.email || config.username);
    this.providerConfig = EMAIL_PROVIDERS[this.provider] || null;
  }

  /**
   * 根据邮箱地址检测提供商
   * @param {string} email - 邮箱地址
   * @returns {string} 提供商标识
   */
  detectProvider(email) {
    if (!email) return 'custom';
    
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return 'custom';

    // 检测常见邮箱提供商
    if (domain.includes('qq.com')) return 'qq';
    if (domain.includes('163.com')) return '163';
    if (domain.includes('126.com')) return '126';
    if (domain.includes('gmail.com')) return 'gmail';
    if (domain.includes('outlook.com') || domain.includes('hotmail.com') || domain.includes('live.com')) return 'outlook';
    if (domain.includes('yahoo.com') || domain.includes('yahoo.cn')) return 'yahoo';
    if (domain.includes('icloud.com') || domain.includes('me.com')) return 'icloud';
    if (domain.includes('aliyun.com')) return 'aliyun';
    if (domain.includes('exmail.qq.com')) return 'exmail';

    return 'custom';
  }

  /**
   * 获取IMAP配置
   * @returns {Object} IMAP配置对象
   */
  getImapConfig() {
    // 如果有提供商配置，使用提供商配置
    if (this.providerConfig) {
      return {
        user: this.config.email || this.config.username,
        password: this.config.password || this.config.authCode,
        host: this.config.imapServer || this.providerConfig.imap.host,
        port: this.config.imapPort || this.providerConfig.imap.port,
        tls: this.config.useSSL !== false ? this.providerConfig.imap.tls : false,
        tlsOptions: {
          rejectUnauthorized: false,
          servername: this.config.imapServer || this.providerConfig.imap.host
        },
        connTimeout: 30000,
        authTimeout: 30000,
        keepalive: {
          interval: 10000,
          idleInterval: 300000,
          forceNoop: true
        }
      };
    }

    // 自定义配置
    return {
      user: this.config.email || this.config.username,
      password: this.config.password,
      host: this.config.imapServer,
      port: this.config.imapPort || 993,
      tls: this.config.useSSL !== false,
      tlsOptions: {
        rejectUnauthorized: false,
        servername: this.config.imapServer
      },
      connTimeout: 30000,
      authTimeout: 30000
    };
  }

  /**
   * 连接到IMAP服务器
   * @returns {Promise<boolean>} 连接是否成功
   */
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        const imapConfig = this.getImapConfig();
        
        this.logger.info('连接IMAP服务器', {
          host: imapConfig.host,
          port: imapConfig.port,
          user: imapConfig.user,
          provider: this.provider
        });

        this.imap = new Imap(imapConfig);

        this.imap.once('ready', () => {
          this.isConnected = true;
          this.logger.info('IMAP连接成功');
          resolve(true);
        });

        this.imap.once('error', (error) => {
          this.isConnected = false;
          this.logger.error('IMAP连接错误', { error: error.message });
          reject(error);
        });

        this.imap.once('end', () => {
          this.isConnected = false;
          this.logger.info('IMAP连接已断开');
        });

        this.imap.connect();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 断开连接
   */
  async disconnect() {
    if (this.imap && this.isConnected) {
      try {
        this.imap.end();
      } catch (error) {
        this.logger.error('断开连接时出错', { error: error.message });
      }
      this.isConnected = false;
    }
  }

  /**
   * 打开邮箱文件夹
   * @param {string} folder - 文件夹名称
   * @returns {Promise<Object>} 文件夹信息
   */
  async openFolder(folder = 'INBOX') {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('IMAP未连接'));
        return;
      }

      this.imap.openBox(folder, false, (error, box) => {
        if (error) {
          this.logger.error('打开文件夹失败', { folder, error: error.message });
          reject(error);
        } else {
          this.logger.info('文件夹已打开', { 
            folder, 
            total: box.messages.total,
            new: box.messages.new 
          });
          resolve(box);
        }
      });
    });
  }

  /**
   * 搜索邮件
   * @param {Array} criteria - 搜索条件
   * @returns {Promise<Array>} 邮件序号数组
   */
  async searchEmails(criteria) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('IMAP未连接'));
        return;
      }

      this.imap.search(criteria, (error, results) => {
        if (error) {
          this.logger.error('搜索邮件失败', { error: error.message });
          reject(error);
        } else {
          this.logger.info('搜索完成', { count: results.length });
          resolve(results);
        }
      });
    });
  }

  /**
   * 获取邮件内容
   * @param {number} seqno - 邮件序号
   * @returns {Promise<Object>} 解析后的邮件
   */
  async fetchEmail(seqno) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('IMAP未连接'));
        return;
      }

      const fetch = this.imap.fetch(seqno, {
        bodies: '',
        struct: true
      });

      let emailData = '';

      fetch.on('message', (msg) => {
        msg.on('body', (stream) => {
          stream.on('data', (chunk) => {
            emailData += chunk.toString('utf8');
          });
        });

        msg.once('end', async () => {
          try {
            const parsed = await simpleParser(emailData);
            resolve(parsed);
          } catch (parseError) {
            reject(parseError);
          }
        });
      });

      fetch.once('error', reject);
    });
  }

  /**
   * 等待并获取验证码邮件
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 验证码信息
   */
  async waitForVerificationEmail(options = {}) {
    const {
      timeout = 300000,        // 5分钟超时
      checkInterval = 5000,    // 5秒检查一次
      senderKeywords = [],     // 发件人关键词
      subjectKeywords = [],    // 主题关键词
      maxAge = 600000          // 10分钟内的邮件
    } = options;

    // 默认关键词
    const defaultSenderKeywords = ['qoder', 'noreply', 'no-reply', 'verify', 'verification'];
    const defaultSubjectKeywords = ['验证', 'verify', 'verification', 'code', '验证码', 'confirm', '确认'];
    
    const allSenderKeywords = [...new Set([...defaultSenderKeywords, ...senderKeywords])];
    const allSubjectKeywords = [...new Set([...defaultSubjectKeywords, ...subjectKeywords])];

    const startTime = Date.now();
    let lastCheckedSeqno = 0;

    this.logger.info('开始等待验证码邮件', { timeout, checkInterval });

    try {
      await this.connect();
      await this.openFolder(this.providerConfig?.searchFolder || 'INBOX');

      while (Date.now() - startTime < timeout) {
        try {
          // 搜索最近的未读邮件
          const since = new Date(Date.now() - maxAge);
          const criteria = ['UNSEEN', ['SINCE', since]];
          
          const seqnos = await this.searchEmails(criteria);
          
          // 只检查新邮件
          const newSeqnos = seqnos.filter(s => s > lastCheckedSeqno);
          
          for (const seqno of newSeqnos.reverse()) { // 从最新的开始检查
            try {
              const email = await this.fetchEmail(seqno);
              
              // 检查是否为验证邮件
              const isVerification = this.isVerificationEmail(email, {
                senderKeywords: allSenderKeywords,
                subjectKeywords: allSubjectKeywords
              });

              if (isVerification) {
                // 提取验证码
                const verificationCode = this.extractVerificationCode(email);
                const verificationLink = this.extractVerificationLink(email);

                this.logger.info('找到验证邮件', {
                  subject: email.subject,
                  from: email.from?.text,
                  hasCode: !!verificationCode,
                  hasLink: !!verificationLink
                });

                await this.disconnect();

                return {
                  success: true,
                  email: {
                    subject: email.subject,
                    from: email.from?.text,
                    date: email.date,
                    text: email.text,
                    html: email.html
                  },
                  verificationCode,
                  verificationLink
                };
              }

              lastCheckedSeqno = Math.max(lastCheckedSeqno, seqno);
            } catch (fetchError) {
              this.logger.warn('获取邮件失败', { seqno, error: fetchError.message });
            }
          }

          if (newSeqnos.length > 0) {
            lastCheckedSeqno = Math.max(lastCheckedSeqno, ...newSeqnos);
          }

        } catch (searchError) {
          this.logger.warn('搜索邮件失败', { error: searchError.message });
        }

        // 等待下一次检查
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      }

      await this.disconnect();
      
      return {
        success: false,
        error: '等待验证邮件超时'
      };

    } catch (error) {
      await this.disconnect();
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 判断是否为验证邮件
   * @param {Object} email - 邮件对象
   * @param {Object} options - 选项
   * @returns {boolean}
   */
  isVerificationEmail(email, options = {}) {
    const { senderKeywords = [], subjectKeywords = [] } = options;

    // 检查发件人
    const from = (email.from?.text || '').toLowerCase();
    const hasSenderKeyword = senderKeywords.some(kw => from.includes(kw.toLowerCase()));

    // 检查主题
    const subject = (email.subject || '').toLowerCase();
    const hasSubjectKeyword = subjectKeywords.some(kw => subject.includes(kw.toLowerCase()));

    // 检查内容中是否有验证码或验证链接
    const text = (email.text || '').toLowerCase();
    const html = (email.html || '').toLowerCase();
    const content = text + html;

    const hasVerificationContent = 
      /\b\d{4,8}\b/.test(content) || // 4-8位数字验证码
      /verify|verification|confirm|activate/i.test(content) ||
      /验证|确认|激活/.test(content);

    return (hasSenderKeyword || hasSubjectKeyword) && hasVerificationContent;
  }

  /**
   * 提取验证码
   * @param {Object} email - 邮件对象
   * @returns {string|null} 验证码
   */
  extractVerificationCode(email) {
    const content = (email.text || '') + (email.html || '');
    
    // 常见验证码模式
    const patterns = [
      // 中文：验证码是 123456
      /验证码[是为：:\s]*(\d{4,8})/i,
      // 英文：Your code is 123456
      /(?:code|verification code|verify code)[:\s]*(\d{4,8})/i,
      // 通用：Code: 123456
      /(?:code)[:\s]*(\d{4,8})/i,
      // 独立的4-6位数字（最后尝试）
      /\b(\d{4,6})\b/
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * 提取验证链接
   * @param {Object} email - 邮件对象
   * @returns {string|null} 验证链接
   */
  extractVerificationLink(email) {
    const html = email.html || '';
    const text = email.text || '';

    // 从HTML中提取链接
    const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
    let match;
    const links = [];

    while ((match = linkRegex.exec(html)) !== null) {
      links.push(match[1]);
    }

    // 从文本中提取链接
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
    while ((match = urlRegex.exec(text)) !== null) {
      links.push(match[0]);
    }

    // 过滤验证相关链接
    const verificationPatterns = [
      /verify/i,
      /confirm/i,
      /activate/i,
      /validation/i,
      /token/i,
      /auth/i,
      /registration/i,
      /email/i
    ];

    for (const link of links) {
      if (verificationPatterns.some(p => p.test(link))) {
        return link;
      }
    }

    // 如果没有找到验证链接，返回第一个非静态资源链接
    for (const link of links) {
      if (!/(\.css|\.js|\.png|\.jpg|\.gif|\.ico|unsubscribe|privacy|terms)/i.test(link)) {
        return link;
      }
    }

    return null;
  }

  /**
   * 测试连接
   * @returns {Promise<Object>} 测试结果
   */
  async testConnection() {
    try {
      await this.connect();
      const box = await this.openFolder('INBOX');
      await this.disconnect();

      return {
        success: true,
        message: '连接测试成功',
        details: {
          provider: this.provider,
          totalMessages: box.messages.total,
          newMessages: box.messages.new
        }
      };
    } catch (error) {
      await this.disconnect();
      
      return {
        success: false,
        error: error.message,
        provider: this.provider
      };
    }
  }
}

/**
 * 创建邮件接收器
 * @param {Object} config - 配置
 * @returns {EmailReceiver}
 */
export function createEmailReceiver(config) {
  return new EmailReceiver(config);
}

/**
 * 获取邮箱提供商配置
 * @param {string} provider - 提供商标识
 * @returns {Object|null}
 */
export function getProviderConfig(provider) {
  return EMAIL_PROVIDERS[provider] || null;
}

/**
 * 获取所有支持的邮箱提供商
 * @returns {Array}
 */
export function getSupportedProviders() {
  return Object.keys(EMAIL_PROVIDERS).map(key => ({
    id: key,
    name: getProviderName(key),
    ...EMAIL_PROVIDERS[key]
  }));
}

/**
 * 获取提供商显示名称
 * @param {string} provider - 提供商标识
 * @returns {string}
 */
function getProviderName(provider) {
  const names = {
    qq: 'QQ邮箱',
    '163': '网易163邮箱',
    '126': '网易126邮箱',
    gmail: 'Gmail',
    outlook: 'Outlook/Hotmail',
    yahoo: 'Yahoo邮箱',
    icloud: 'iCloud邮箱',
    aliyun: '阿里云企业邮箱',
    exmail: '腾讯企业邮箱'
  };
  return names[provider] || provider;
}
