/**
 * IMAP客户端
 * 提供IMAP邮箱连接和邮件处理功能
 */

import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { createLogger } from '../utils/logger.js';
import { EmailErrorHandler } from '../utils/error-handler.js';

/**
 * IMAP客户端类
 */
export class ImapClient {
  constructor(config) {
    this.config = config;
    this.logger = createLogger({ component: 'ImapClient' });
    this.imap = null;
    this.isConnected = false;
    
    // 初始化错误处理器
    this.errorHandler = new EmailErrorHandler({
      maxRetries: 3,
      baseDelay: 2000,
      maxDelay: 15000
    });
  }

  /**
   * 连接到IMAP服务器
   * @returns {Promise<boolean>} 连接是否成功
   */
  async connect() {
    const wrappedConnect = this.errorHandler.wrapEmailOperation(
      () => this._connect(),
      { circuitBreakerKey: 'imap-connect' }
    );

    try {
      await wrappedConnect();
      return true;
    } catch (error) {
      this.logger.error('IMAP连接失败', { 
        server: this.config.imapServer,
        username: this.config.username,
        error: error.message 
      });
      return false;
    }
  }

  /**
   * 内部连接方法
   * @returns {Promise<void>}
   */
  _connect() {
    return new Promise((resolve, reject) => {
      try {
        this.logger.info('连接IMAP服务器', {
          server: this.config.imapServer,
          port: this.config.imapPort,
          username: this.config.username
        });

        this.imap = new Imap({
          user: this.config.username,
          password: this.config.password,
          host: this.config.imapServer,
          port: this.config.imapPort,
          tls: this.config.useSSL,
          tlsOptions: {
            rejectUnauthorized: false // 在生产环境中应该设置为true
          },
          connTimeout: 30000, // 30秒连接超时
          authTimeout: 30000, // 30秒认证超时
          keepalive: true
        });

        this.imap.once('ready', () => {
          this.isConnected = true;
          this.logger.info('IMAP连接成功', { username: this.config.username });
          resolve();
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
   * 断开IMAP连接
   */
  async disconnect() {
    try {
      if (this.imap && this.isConnected) {
        this.imap.end();
        this.isConnected = false;
        this.logger.info('IMAP连接已断开');
      }
    } catch (error) {
      this.logger.error('断开IMAP连接时出错', error);
    }
  }

  /**
   * 选择邮箱文件夹
   * @param {string} folder - 文件夹名称
   * @returns {Promise<Object>} 文件夹信息
   */
  async selectFolder(folder = 'INBOX') {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('IMAP未连接'));
        return;
      }

      this.imap.openBox(folder, false, (error, box) => {
        if (error) {
          this.logger.error('选择邮箱文件夹失败', { folder, error: error.message });
          reject(error);
        } else {
          this.logger.info('邮箱文件夹选择成功', { 
            folder, 
            totalMessages: box.messages.total,
            newMessages: box.messages.new 
          });
          resolve(box);
        }
      });
    });
  }

  /**
   * 搜索邮件
   * @param {Array} criteria - 搜索条件
   * @returns {Promise<Array>} 邮件UID数组
   */
  async searchEmails(criteria) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('IMAP未连接'));
        return;
      }

      this.logger.info('搜索邮件', { criteria });

      this.imap.search(criteria, (error, uids) => {
        if (error) {
          this.logger.error('搜索邮件失败', { criteria, error: error.message });
          reject(error);
        } else {
          this.logger.info('邮件搜索完成', { 
            criteria, 
            foundCount: uids.length 
          });
          resolve(uids);
        }
      });
    });
  }

  /**
   * 获取邮件内容
   * @param {number} uid - 邮件UID
   * @returns {Promise<Object>} 解析后的邮件对象
   */
  async fetchEmail(uid) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('IMAP未连接'));
        return;
      }

      this.logger.info('获取邮件内容', { uid });

      const fetch = this.imap.fetch(uid, {
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
            this.logger.info('邮件解析完成', { 
              uid,
              subject: parsed.subject,
              from: parsed.from?.text 
            });
            resolve(parsed);
          } catch (parseError) {
            this.logger.error('邮件解析失败', { uid, error: parseError.message });
            reject(parseError);
          }
        });
      });

      fetch.once('error', (error) => {
        this.logger.error('获取邮件失败', { uid, error: error.message });
        reject(error);
      });
    });
  }

  /**
   * 等待新邮件
   * @param {Object} options - 等待选项
   * @returns {Promise<Array>} 新邮件UID数组
   */
  async waitForNewEmails(options = {}) {
    const {
      timeout = 300000, // 5分钟默认超时
      checkInterval = 10000, // 10秒检查间隔
      criteria = ['UNSEEN'] // 默认搜索未读邮件
    } = options;

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const checkForEmails = async () => {
        try {
          if (Date.now() - startTime > timeout) {
            reject(new Error('等待新邮件超时'));
            return;
          }

          const uids = await this.searchEmails(criteria);
          
          if (uids.length > 0) {
            this.logger.info('发现新邮件', { count: uids.length });
            resolve(uids);
          } else {
            // 继续等待
            setTimeout(checkForEmails, checkInterval);
          }
        } catch (error) {
          reject(error);
        }
      };

      checkForEmails();
    });
  }

  /**
   * 查找验证邮件
   * @param {string} targetEmail - 目标邮箱地址
   * @param {Object} options - 搜索选项
   * @returns {Promise<Object|null>} 验证邮件对象
   */
  async findVerificationEmail(targetEmail, options = {}) {
    const {
      timeout = 300000, // 5分钟超时
      maxAge = 3600000, // 1小时内的邮件
      keywords = ['verification', 'verify', 'confirm', 'activate', '验证', '确认', '激活']
    } = options;

    try {
      this.logger.info('查找验证邮件', { targetEmail, timeout });

      // 选择收件箱
      await this.selectFolder(this.config.folder || 'INBOX');

      // 构建搜索条件
      const since = new Date(Date.now() - maxAge);
      const searchCriteria = [
        'UNSEEN',
        ['SINCE', since],
        ['OR', 
          ['TO', targetEmail],
          ['CC', targetEmail]
        ]
      ];

      // 等待新邮件
      const uids = await this.waitForNewEmails({
        timeout,
        criteria: searchCriteria
      });

      // 检查每封邮件
      for (const uid of uids) {
        try {
          const email = await this.fetchEmail(uid);
          
          // 检查是否为验证邮件
          if (this.isVerificationEmail(email, targetEmail, keywords)) {
            this.logger.info('找到验证邮件', { 
              uid,
              subject: email.subject,
              from: email.from?.text 
            });
            return email;
          }
        } catch (error) {
          this.logger.warn('处理邮件时出错', { uid, error: error.message });
          continue;
        }
      }

      this.logger.warn('未找到验证邮件', { targetEmail });
      return null;

    } catch (error) {
      this.logger.error('查找验证邮件失败', { targetEmail, error: error.message });
      throw error;
    }
  }

  /**
   * 判断是否为验证邮件
   * @param {Object} email - 邮件对象
   * @param {string} targetEmail - 目标邮箱
   * @param {Array} keywords - 关键词列表
   * @returns {boolean} 是否为验证邮件
   */
  isVerificationEmail(email, targetEmail, keywords) {
    try {
      // 检查收件人
      const recipients = [
        ...(email.to || []),
        ...(email.cc || []),
        ...(email.bcc || [])
      ].map(addr => addr.address || addr.text || addr).filter(Boolean);

      const isToTarget = recipients.some(addr => 
        addr.toLowerCase().includes(targetEmail.toLowerCase())
      );

      if (!isToTarget) {
        return false;
      }

      // 检查主题和内容中的关键词
      const subject = (email.subject || '').toLowerCase();
      const textContent = (email.text || '').toLowerCase();
      const htmlContent = (email.html || '').toLowerCase();

      const hasKeyword = keywords.some(keyword => 
        subject.includes(keyword.toLowerCase()) ||
        textContent.includes(keyword.toLowerCase()) ||
        htmlContent.includes(keyword.toLowerCase())
      );

      return hasKeyword;

    } catch (error) {
      this.logger.error('判断验证邮件时出错', error);
      return false;
    }
  }

  /**
   * 提取验证链接
   * @param {Object} email - 邮件对象
   * @returns {Array} 验证链接数组
   */
  extractVerificationLinks(email) {
    try {
      const links = [];
      
      // 从HTML内容中提取链接
      if (email.html) {
        const htmlLinks = this.extractLinksFromHtml(email.html);
        links.push(...htmlLinks);
      }

      // 从文本内容中提取链接
      if (email.text) {
        const textLinks = this.extractLinksFromText(email.text);
        links.push(...textLinks);
      }

      // 过滤验证相关的链接
      const verificationLinks = links.filter(link => 
        this.isVerificationLink(link)
      );

      this.logger.info('提取验证链接完成', { 
        totalLinks: links.length,
        verificationLinks: verificationLinks.length 
      });

      return verificationLinks;

    } catch (error) {
      this.logger.error('提取验证链接失败', error);
      return [];
    }
  }

  /**
   * 从HTML中提取链接
   * @param {string} html - HTML内容
   * @returns {Array} 链接数组
   */
  extractLinksFromHtml(html) {
    const links = [];
    const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      links.push(match[1]);
    }

    return links;
  }

  /**
   * 从文本中提取链接
   * @param {string} text - 文本内容
   * @returns {Array} 链接数组
   */
  extractLinksFromText(text) {
    const links = [];
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
    let match;

    while ((match = urlRegex.exec(text)) !== null) {
      links.push(match[0]);
    }

    return links;
  }

  /**
   * 判断是否为验证链接
   * @param {string} link - 链接URL
   * @returns {boolean} 是否为验证链接
   */
  isVerificationLink(link) {
    const verificationPatterns = [
      /verify/i,
      /confirm/i,
      /activate/i,
      /validation/i,
      /token/i,
      /auth/i,
      /registration/i
    ];

    return verificationPatterns.some(pattern => pattern.test(link));
  }

  /**
   * 标记邮件为已读
   * @param {number} uid - 邮件UID
   * @returns {Promise<boolean>} 操作是否成功
   */
  async markAsRead(uid) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('IMAP未连接'));
        return;
      }

      this.imap.addFlags(uid, ['\\Seen'], (error) => {
        if (error) {
          this.logger.error('标记邮件已读失败', { uid, error: error.message });
          reject(error);
        } else {
          this.logger.info('邮件已标记为已读', { uid });
          resolve(true);
        }
      });
    });
  }

  /**
   * 测试连接
   * @returns {Promise<Object>} 测试结果
   */
  async testConnection() {
    try {
      this.logger.info('开始测试IMAP连接');
      
      await this.connect();
      
      if (this.isConnected) {
        // 尝试选择收件箱
        const box = await this.selectFolder('INBOX');
        
        await this.disconnect();
        
        return {
          success: true,
          message: 'IMAP连接测试成功',
          details: {
            totalMessages: box.messages.total,
            newMessages: box.messages.new
          }
        };
      } else {
        return {
          success: false,
          error: 'IMAP连接失败'
        };
      }
    } catch (error) {
      await this.disconnect();
      
      return {
        success: false,
        error: error.message
      };
    }
  }
}

/**
 * 创建IMAP客户端
 * @param {Object} config - 邮箱配置
 * @returns {ImapClient} IMAP客户端实例
 */
export function createImapClient(config) {
  return new ImapClient(config);
}