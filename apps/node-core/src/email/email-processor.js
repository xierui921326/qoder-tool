/**
 * 邮件处理器
 * 负责邮件检索、解析和验证链接提取
 */
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import * as cheerio from 'cheerio';
import { IEmailProcessor } from '../core/interfaces.js';
import { VerificationEmail } from '../core/types.js';
import { retryWithExponentialBackoff, retryPredicates } from '../utils/retry.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger();

/**
 * 邮件处理器实现类
 */
export class EmailProcessor extends IEmailProcessor {
  constructor() {
    super();
    this.imap = null;
    this.isConnected = false;
    this.currentConfig = null;
    this.processedEmails = new Set(); // 防止重复处理
  }

  /**
   * 连接到邮箱
   * @param {EmailConfig} emailConfig - 邮件配置
   * @returns {Promise<boolean>} 是否成功连接
   */
  async connectToMailbox(emailConfig) {
    try {
      // 验证配置
      this.validateEmailConfig(emailConfig);
      
      // 如果已连接且配置相同，直接返回
      if (this.isConnected && this.isSameConfig(emailConfig)) {
        logger.debug('使用现有邮箱连接');
        return true;
      }

      // 断开现有连接
      if (this.isConnected) {
        await this.disconnect();
      }

      // 创建IMAP连接配置
      const imapConfig = {
        user: emailConfig.username,
        password: emailConfig.password,
        host: emailConfig.imapServer,
        port: emailConfig.imapPort,
        tls: emailConfig.useSSL,
        tlsOptions: {
          rejectUnauthorized: false // 允许自签名证书
        },
        connTimeout: 30000, // 30秒连接超时
        authTimeout: 30000, // 30秒认证超时
        keepalive: true
      };

      // 创建IMAP实例
      this.imap = new Imap(imapConfig);
      this.currentConfig = emailConfig;

      // 设置事件监听器
      this.setupEventListeners();

      // 连接到邮箱
      await this.connectWithRetry();

      logger.info('邮箱连接成功', { 
        server: emailConfig.imapServer, 
        user: emailConfig.username 
      });

      return true;

    } catch (error) {
      logger.error('邮箱连接失败', { 
        server: emailConfig?.imapServer, 
        user: emailConfig?.username,
        error: error.message 
      });
      throw new Error(`邮箱连接失败: ${error.message}`);
    }
  }

  /**
   * 等待验证邮件
   * @param {string} email - 邮箱地址
   * @param {number} timeout - 超时时间（毫秒）
   * @returns {Promise<VerificationEmail|null>} 验证邮件或null
   */
  async waitForVerificationEmail(email, timeout = 300000) { // 默认5分钟超时
    if (!this.isConnected) {
      throw new Error('邮箱未连接，请先调用connectToMailbox()');
    }

    const startTime = Date.now();
    const checkInterval = 10000; // 10秒检查一次
    
    logger.info('开始等待验证邮件', { email, timeout });

    try {
      while (Date.now() - startTime < timeout) {
        // 检查新邮件
        const verificationEmail = await this.checkForVerificationEmail(email);
        
        if (verificationEmail) {
          logger.info('找到验证邮件', { 
            email, 
            subject: verificationEmail.subject,
            receivedAt: verificationEmail.receivedAt 
          });
          return verificationEmail;
        }

        // 等待下次检查
        await this.sleep(checkInterval);
        
        // 记录等待进度
        const elapsed = Date.now() - startTime;
        const remaining = timeout - elapsed;
        logger.debug('等待验证邮件中', { 
          email, 
          elapsed: Math.round(elapsed / 1000), 
          remaining: Math.round(remaining / 1000) 
        });
      }

      logger.warn('等待验证邮件超时', { email, timeout });
      return null;

    } catch (error) {
      logger.error('等待验证邮件时发生错误', { email, error: error.message });
      throw new Error(`等待验证邮件失败: ${error.message}`);
    }
  }

  /**
   * 检查验证邮件
   * @param {string} targetEmail - 目标邮箱地址
   * @returns {Promise<VerificationEmail|null>} 验证邮件或null
   */
  async checkForVerificationEmail(targetEmail) {
    try {
      // 打开收件箱
      await this.openMailbox(this.currentConfig.folder);

      // 搜索最近的邮件
      const searchCriteria = [
        'UNSEEN', // 未读邮件
        ['SINCE', new Date(Date.now() - 24 * 60 * 60 * 1000)] // 24小时内
      ];

      const uids = await this.searchEmails(searchCriteria);
      
      if (uids.length === 0) {
        logger.debug('没有找到新邮件');
        return null;
      }

      logger.debug('找到新邮件', { count: uids.length });

      // 按时间倒序检查邮件
      const sortedUids = uids.sort((a, b) => b - a);
      
      for (const uid of sortedUids) {
        // 避免重复处理
        if (this.processedEmails.has(uid)) {
          continue;
        }

        const email = await this.fetchEmail(uid);
        
        if (email && this.isVerificationEmail(email, targetEmail)) {
          // 标记为已处理
          this.processedEmails.add(uid);
          
          // 提取验证链接
          const verificationLink = await this.extractVerificationLink(email.html || email.text);
          
          if (verificationLink) {
            return new VerificationEmail(
              email.subject,
              email.html || email.text,
              verificationLink,
              email.date
            );
          }
        }

        // 标记为已处理（即使不是验证邮件）
        this.processedEmails.add(uid);
      }

      return null;

    } catch (error) {
      logger.error('检查验证邮件失败', error);
      throw error;
    }
  }

  /**
   * 提取验证链接
   * @param {string} emailContent - 邮件内容
   * @returns {Promise<string|null>} 验证链接或null
   */
  async extractVerificationLink(emailContent) {
    if (!emailContent) {
      return null;
    }

    try {
      // 常见的验证链接模式
      const linkPatterns = [
        // Qoder特定模式
        /https?:\/\/[^\/]*qoder\.com[^\s<>"']*verify[^\s<>"']*/gi,
        /https?:\/\/[^\/]*qoder\.com[^\s<>"']*confirm[^\s<>"']*/gi,
        /https?:\/\/[^\/]*qoder\.com[^\s<>"']*activate[^\s<>"']*/gi,
        
        // 通用验证链接模式
        /https?:\/\/[^\s<>"']*\/verify[^\s<>"']*/gi,
        /https?:\/\/[^\s<>"']*\/confirm[^\s<>"']*/gi,
        /https?:\/\/[^\s<>"']*\/activate[^\s<>"']*/gi,
        /https?:\/\/[^\s<>"']*verification[^\s<>"']*/gi,
        /https?:\/\/[^\s<>"']*email-verify[^\s<>"']*/gi,
        
        // 包含token的链接
        /https?:\/\/[^\s<>"']*[?&]token=[^\s<>"'&]*/gi,
        /https?:\/\/[^\s<>"']*[?&]code=[^\s<>"'&]*/gi
      ];

      // 如果是HTML内容，使用cheerio解析
      if (emailContent.includes('<')) {
        const $ = cheerio.load(emailContent);
        
        // 查找包含验证相关文本的链接
        const verificationTexts = [
          'verify', 'confirm', 'activate', '验证', '确认', '激活',
          'click here', 'verify email', 'confirm email'
        ];

        for (const text of verificationTexts) {
          const link = $(`a:contains("${text}")`).first().attr('href');
          if (link && this.isValidVerificationLink(link)) {
            logger.debug('通过HTML解析找到验证链接', { text, link });
            return this.cleanUrl(link);
          }
        }

        // 查找所有链接并匹配模式
        $('a[href]').each((_, element) => {
          const href = $(element).attr('href');
          if (href && this.isValidVerificationLink(href)) {
            logger.debug('通过HTML链接匹配找到验证链接', { href });
            return this.cleanUrl(href);
          }
        });
      }

      // 使用正则表达式匹配
      for (const pattern of linkPatterns) {
        const matches = emailContent.match(pattern);
        if (matches && matches.length > 0) {
          // 选择最可能的验证链接（通常是最长的）
          const bestMatch = matches.reduce((longest, current) => 
            current.length > longest.length ? current : longest
          );
          
          if (this.isValidVerificationLink(bestMatch)) {
            logger.debug('通过正则表达式找到验证链接', { pattern: pattern.source, link: bestMatch });
            return this.cleanUrl(bestMatch);
          }
        }
      }

      logger.debug('未找到验证链接');
      return null;

    } catch (error) {
      logger.error('提取验证链接失败', error);
      return null;
    }
  }

  /**
   * 完成邮件验证
   * @param {string} verificationLink - 验证链接
   * @returns {Promise<boolean>} 是否成功
   */
  async completeEmailVerification(verificationLink) {
    try {
      logger.info('开始邮件验证', { link: verificationLink });

      // 使用fetch访问验证链接
      const response = await fetch(verificationLink, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        redirect: 'follow',
        timeout: 30000
      });

      if (response.ok) {
        logger.info('邮件验证成功', { 
          status: response.status, 
          url: response.url 
        });
        return true;
      } else {
        logger.warn('邮件验证响应异常', { 
          status: response.status, 
          statusText: response.statusText 
        });
        return false;
      }

    } catch (error) {
      logger.error('邮件验证失败', { link: verificationLink, error: error.message });
      return false;
    }
  }

  /**
   * 断开邮箱连接
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (this.imap && this.isConnected) {
      return new Promise((resolve) => {
        this.imap.once('end', () => {
          this.isConnected = false;
          this.imap = null;
          this.currentConfig = null;
          this.processedEmails.clear();
          logger.info('邮箱连接已断开');
          resolve();
        });
        
        this.imap.end();
      });
    }
  }

  // 私有方法

  /**
   * 验证邮件配置
   * @param {EmailConfig} config - 邮件配置
   */
  validateEmailConfig(config) {
    if (!config.imapServer || !config.username || !config.password) {
      throw new Error('邮件配置不完整：缺少服务器、用户名或密码');
    }

    if (!config.imapPort || config.imapPort < 1 || config.imapPort > 65535) {
      throw new Error('邮件配置错误：端口号无效');
    }

    if (!config.username.includes('@')) {
      throw new Error('邮件配置错误：用户名应为完整邮箱地址');
    }
  }

  /**
   * 检查是否为相同配置
   * @param {EmailConfig} config - 邮件配置
   * @returns {boolean} 是否相同
   */
  isSameConfig(config) {
    if (!this.currentConfig) return false;
    
    return this.currentConfig.imapServer === config.imapServer &&
           this.currentConfig.username === config.username &&
           this.currentConfig.imapPort === config.imapPort;
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    this.imap.once('ready', () => {
      this.isConnected = true;
      logger.debug('IMAP连接就绪');
    });

    this.imap.once('error', (error) => {
      logger.error('IMAP连接错误', error);
      this.isConnected = false;
    });

    this.imap.once('end', () => {
      logger.debug('IMAP连接结束');
      this.isConnected = false;
    });
  }

  /**
   * 带重试的连接
   * @returns {Promise<void>}
   */
  async connectWithRetry() {
    return retryWithExponentialBackoff(
      () => new Promise((resolve, reject) => {
        this.imap.once('ready', resolve);
        this.imap.once('error', reject);
        this.imap.connect();
      }),
      {
        maxRetries: 3,
        baseDelay: 2000,
        shouldRetry: retryPredicates.networkError,
        onRetry: (error, attempt, delay) => {
          logger.warn('IMAP连接重试', { attempt, delay, error: error.message });
        }
      }
    );
  }

  /**
   * 打开邮箱文件夹
   * @param {string} folder - 文件夹名称
   * @returns {Promise<void>}
   */
  async openMailbox(folder = 'INBOX') {
    return new Promise((resolve, reject) => {
      this.imap.openBox(folder, false, (error, box) => {
        if (error) {
          reject(new Error(`打开邮箱文件夹失败: ${error.message}`));
        } else {
          logger.debug('邮箱文件夹已打开', { folder, messages: box.messages.total });
          resolve(box);
        }
      });
    });
  }

  /**
   * 搜索邮件
   * @param {Array} criteria - 搜索条件
   * @returns {Promise<Array>} UID数组
   */
  async searchEmails(criteria) {
    return new Promise((resolve, reject) => {
      this.imap.search(criteria, (error, uids) => {
        if (error) {
          reject(new Error(`搜索邮件失败: ${error.message}`));
        } else {
          resolve(uids || []);
        }
      });
    });
  }

  /**
   * 获取邮件内容
   * @param {number} uid - 邮件UID
   * @returns {Promise<Object>} 邮件对象
   */
  async fetchEmail(uid) {
    return new Promise((resolve, reject) => {
      const fetch = this.imap.fetch(uid, { bodies: '' });
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
          } catch (error) {
            reject(new Error(`解析邮件失败: ${error.message}`));
          }
        });
      });

      fetch.once('error', (error) => {
        reject(new Error(`获取邮件失败: ${error.message}`));
      });
    });
  }

  /**
   * 判断是否为验证邮件
   * @param {Object} email - 邮件对象
   * @param {string} targetEmail - 目标邮箱
   * @returns {boolean} 是否为验证邮件
   */
  isVerificationEmail(email, targetEmail) {
    const subject = (email.subject || '').toLowerCase();
    const content = ((email.html || email.text) || '').toLowerCase();
    
    // 检查主题是否包含验证相关关键词
    const verificationKeywords = [
      'verify', 'verification', 'confirm', 'confirmation', 
      'activate', 'activation', 'welcome', 'register',
      '验证', '确认', '激活', '欢迎', '注册'
    ];

    const hasVerificationKeyword = verificationKeywords.some(keyword => 
      subject.includes(keyword) || content.includes(keyword)
    );

    // 检查是否发送给目标邮箱
    const isForTargetEmail = email.to && 
      email.to.some(recipient => 
        recipient.address && recipient.address.toLowerCase() === targetEmail.toLowerCase()
      );

    // 检查发件人是否来自Qoder或相关域名
    const fromAddress = email.from && email.from.address ? email.from.address.toLowerCase() : '';
    const isFromQoder = fromAddress.includes('qoder') || 
                       fromAddress.includes('alibaba') ||
                       fromAddress.includes('noreply') ||
                       fromAddress.includes('no-reply');

    return hasVerificationKeyword && (isForTargetEmail || isFromQoder);
  }

  /**
   * 验证链接是否有效
   * @param {string} link - 链接
   * @returns {boolean} 是否有效
   */
  isValidVerificationLink(link) {
    if (!link || typeof link !== 'string') {
      return false;
    }

    // 必须是HTTP/HTTPS链接
    if (!link.match(/^https?:\/\//i)) {
      return false;
    }

    // 长度合理
    if (link.length < 10 || link.length > 2000) {
      return false;
    }

    // 包含验证相关路径或参数
    const verificationIndicators = [
      'verify', 'confirm', 'activate', 'token', 'code', 'email'
    ];

    return verificationIndicators.some(indicator => 
      link.toLowerCase().includes(indicator)
    );
  }

  /**
   * 清理URL
   * @param {string} url - 原始URL
   * @returns {string} 清理后的URL
   */
  cleanUrl(url) {
    // 移除可能的HTML实体编码
    return url.replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }

  /**
   * 睡眠函数
   * @param {number} ms - 毫秒数
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 创建邮件处理器实例
 * @returns {EmailProcessor} 邮件处理器实例
 */
export function createEmailProcessor() {
  return new EmailProcessor();
}