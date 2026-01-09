/**
 * 邮件验证自动化管理器
 * 负责协调邮件监控、链接提取和验证完成的整个流程
 */
import { EmailProcessor } from './email-processor.js';
import { retryWithExponentialBackoff, retryPredicates } from '../utils/retry.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger();

/**
 * 邮件验证状态枚举
 */
export const VerificationStatus = {
  PENDING: 'pending',
  MONITORING: 'monitoring',
  EMAIL_FOUND: 'email_found',
  LINK_EXTRACTED: 'link_extracted',
  VERIFICATION_COMPLETED: 'verification_completed',
  FAILED: 'failed',
  TIMEOUT: 'timeout'
};

/**
 * 邮件验证结果类
 */
export class VerificationResult {
  constructor(status, email = null, verificationLink = null, error = null, metadata = {}) {
    this.status = status;
    this.email = email;
    this.verificationLink = verificationLink;
    this.error = error;
    this.metadata = metadata;
    this.timestamp = new Date();
  }
}

/**
 * 邮件验证自动化管理器
 */
export class EmailVerificationManager {
  constructor(emailProcessor = null) {
    this.emailProcessor = emailProcessor || new EmailProcessor();
    this.activeVerifications = new Map(); // 跟踪活跃的验证任务
    this.verificationHistory = []; // 验证历史记录
  }

  /**
   * 启动邮件验证流程
   * @param {string} targetEmail - 目标邮箱地址
   * @param {EmailConfig} emailConfig - 邮件配置
   * @param {Object} options - 验证选项
   * @param {number} options.timeout - 超时时间（毫秒），默认5分钟
   * @param {number} options.maxRetries - 最大重试次数，默认3次
   * @param {boolean} options.autoComplete - 是否自动完成验证，默认true
   * @returns {Promise<VerificationResult>} 验证结果
   */
  async startVerification(targetEmail, emailConfig, options = {}) {
    const {
      timeout = 300000, // 5分钟
      maxRetries = 3,
      autoComplete = true
    } = options;

    const verificationId = this.generateVerificationId(targetEmail);
    
    logger.info('开始邮件验证流程', { 
      targetEmail, 
      verificationId, 
      timeout, 
      maxRetries,
      autoComplete 
    });

    try {
      // 记录验证开始
      this.activeVerifications.set(verificationId, {
        targetEmail,
        status: VerificationStatus.PENDING,
        startTime: Date.now(),
        options
      });

      // 连接到邮箱
      const connected = await this.connectWithRetry(emailConfig, maxRetries);
      if (!connected) {
        throw new Error('无法连接到邮箱服务器');
      }

      // 更新状态
      this.updateVerificationStatus(verificationId, VerificationStatus.MONITORING);

      // 等待验证邮件
      const verificationEmail = await this.waitForVerificationEmailWithRetry(
        targetEmail, 
        timeout, 
        maxRetries
      );

      if (!verificationEmail) {
        const result = new VerificationResult(
          VerificationStatus.TIMEOUT,
          targetEmail,
          null,
          '等待验证邮件超时'
        );
        this.completeVerification(verificationId, result);
        return result;
      }

      // 更新状态
      this.updateVerificationStatus(verificationId, VerificationStatus.EMAIL_FOUND);

      // 提取验证链接
      const verificationLink = verificationEmail.verificationLink;
      if (!verificationLink) {
        const result = new VerificationResult(
          VerificationStatus.FAILED,
          targetEmail,
          null,
          '无法从邮件中提取验证链接'
        );
        this.completeVerification(verificationId, result);
        return result;
      }

      // 更新状态
      this.updateVerificationStatus(verificationId, VerificationStatus.LINK_EXTRACTED);

      // 自动完成验证（如果启用）
      let verificationCompleted = false;
      if (autoComplete) {
        verificationCompleted = await this.completeVerificationWithRetry(
          verificationLink, 
          maxRetries
        );
      }

      // 创建结果
      const finalStatus = autoComplete 
        ? (verificationCompleted ? VerificationStatus.VERIFICATION_COMPLETED : VerificationStatus.FAILED)
        : VerificationStatus.LINK_EXTRACTED;

      const result = new VerificationResult(
        finalStatus,
        targetEmail,
        verificationLink,
        verificationCompleted ? null : '验证链接访问失败',
        {
          emailSubject: verificationEmail.subject,
          emailReceivedAt: verificationEmail.receivedAt,
          verificationCompleted
        }
      );

      this.completeVerification(verificationId, result);
      return result;

    } catch (error) {
      logger.error('邮件验证流程失败', { 
        targetEmail, 
        verificationId, 
        error: error.message 
      });

      const result = new VerificationResult(
        VerificationStatus.FAILED,
        targetEmail,
        null,
        error.message
      );

      this.completeVerification(verificationId, result);
      return result;
    }
  }

  /**
   * 批量邮件验证
   * @param {Array} verificationTasks - 验证任务数组
   * @param {Object} options - 批量选项
   * @param {number} options.concurrency - 并发数，默认3
   * @param {number} options.delayBetweenTasks - 任务间延迟（毫秒），默认5秒
   * @returns {Promise<Array>} 验证结果数组
   */
  async batchVerification(verificationTasks, options = {}) {
    const {
      concurrency = 3,
      delayBetweenTasks = 5000
    } = options;

    logger.info('开始批量邮件验证', { 
      taskCount: verificationTasks.length, 
      concurrency,
      delayBetweenTasks 
    });

    const results = [];

    // 分批处理任务
    for (let i = 0; i < verificationTasks.length; i += concurrency) {
      const batch = verificationTasks.slice(i, i + concurrency);
      
      // 并发执行当前批次
      const batchPromises = batch.map(async (task, index) => {
        try {
          // 添加延迟以避免过于频繁的请求
          if (i > 0 || index > 0) {
            await this.sleep(delayBetweenTasks * index);
          }

          return await this.startVerification(
            task.targetEmail,
            task.emailConfig,
            task.options
          );
        } catch (error) {
          logger.error('批量验证任务失败', { 
            targetEmail: task.targetEmail, 
            error: error.message 
          });
          return new VerificationResult(
            VerificationStatus.FAILED,
            task.targetEmail,
            null,
            error.message
          );
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // 记录批次完成情况
      const successCount = batchResults.filter(r => 
        r.status === VerificationStatus.VERIFICATION_COMPLETED
      ).length;
      
      logger.info('批次验证完成', { 
        batchIndex: Math.floor(i / concurrency) + 1,
        batchSize: batch.length,
        successCount,
        totalProcessed: results.length,
        remaining: verificationTasks.length - results.length
      });
    }

    // 生成批量验证报告
    const report = this.generateBatchReport(results);
    logger.info('批量邮件验证完成', report);

    return results;
  }

  /**
   * 获取验证状态
   * @param {string} targetEmail - 目标邮箱
   * @returns {Object|null} 验证状态信息
   */
  getVerificationStatus(targetEmail) {
    const verificationId = this.generateVerificationId(targetEmail);
    return this.activeVerifications.get(verificationId) || null;
  }

  /**
   * 取消验证
   * @param {string} targetEmail - 目标邮箱
   * @returns {boolean} 是否成功取消
   */
  cancelVerification(targetEmail) {
    const verificationId = this.generateVerificationId(targetEmail);
    const verification = this.activeVerifications.get(verificationId);
    
    if (verification) {
      this.activeVerifications.delete(verificationId);
      logger.info('验证已取消', { targetEmail, verificationId });
      return true;
    }
    
    return false;
  }

  /**
   * 获取验证历史
   * @param {number} limit - 限制数量
   * @returns {Array} 验证历史记录
   */
  getVerificationHistory(limit = 50) {
    return this.verificationHistory
      .slice(-limit)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * 清理验证历史
   * @param {number} olderThanDays - 清理多少天前的记录
   */
  cleanupHistory(olderThanDays = 7) {
    const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
    const originalLength = this.verificationHistory.length;
    
    this.verificationHistory = this.verificationHistory.filter(
      record => record.timestamp.getTime() > cutoffTime
    );

    const cleanedCount = originalLength - this.verificationHistory.length;
    if (cleanedCount > 0) {
      logger.info('清理验证历史记录', { cleanedCount, remaining: this.verificationHistory.length });
    }
  }

  /**
   * 关闭邮件验证管理器
   * @returns {Promise<void>}
   */
  async close() {
    // 取消所有活跃的验证
    for (const [verificationId, verification] of this.activeVerifications) {
      logger.info('取消活跃验证', { 
        verificationId, 
        targetEmail: verification.targetEmail 
      });
    }
    this.activeVerifications.clear();

    // 断开邮件处理器连接
    if (this.emailProcessor) {
      await this.emailProcessor.disconnect();
    }

    logger.info('邮件验证管理器已关闭');
  }

  // 私有方法

  /**
   * 生成验证ID
   * @param {string} targetEmail - 目标邮箱
   * @returns {string} 验证ID
   */
  generateVerificationId(targetEmail) {
    return `verification_${targetEmail}_${Date.now()}`;
  }

  /**
   * 更新验证状态
   * @param {string} verificationId - 验证ID
   * @param {string} status - 新状态
   */
  updateVerificationStatus(verificationId, status) {
    const verification = this.activeVerifications.get(verificationId);
    if (verification) {
      verification.status = status;
      verification.lastUpdate = Date.now();
      logger.debug('验证状态更新', { verificationId, status });
    }
  }

  /**
   * 完成验证
   * @param {string} verificationId - 验证ID
   * @param {VerificationResult} result - 验证结果
   */
  completeVerification(verificationId, result) {
    // 从活跃验证中移除
    this.activeVerifications.delete(verificationId);
    
    // 添加到历史记录
    this.verificationHistory.push(result);
    
    // 限制历史记录数量
    if (this.verificationHistory.length > 1000) {
      this.verificationHistory = this.verificationHistory.slice(-500);
    }

    logger.info('验证完成', { 
      verificationId, 
      status: result.status, 
      email: result.email 
    });
  }

  /**
   * 带重试的邮箱连接
   * @param {EmailConfig} emailConfig - 邮件配置
   * @param {number} maxRetries - 最大重试次数
   * @returns {Promise<boolean>} 是否连接成功
   */
  async connectWithRetry(emailConfig, maxRetries) {
    return retryWithExponentialBackoff(
      () => this.emailProcessor.connectToMailbox(emailConfig),
      {
        maxRetries,
        baseDelay: 2000,
        shouldRetry: retryPredicates.emailError,
        onRetry: (error, attempt, delay) => {
          logger.warn('邮箱连接重试', { 
            attempt, 
            delay, 
            server: emailConfig.imapServer,
            error: error.message 
          });
        }
      }
    );
  }

  /**
   * 带重试的等待验证邮件
   * @param {string} targetEmail - 目标邮箱
   * @param {number} timeout - 超时时间
   * @param {number} maxRetries - 最大重试次数
   * @returns {Promise<VerificationEmail|null>} 验证邮件
   */
  async waitForVerificationEmailWithRetry(targetEmail, timeout, maxRetries) {
    return retryWithExponentialBackoff(
      () => this.emailProcessor.waitForVerificationEmail(targetEmail, timeout),
      {
        maxRetries,
        baseDelay: 5000,
        shouldRetry: (error) => {
          // 只有在非超时错误时才重试
          return !error.message.includes('超时') && retryPredicates.emailError(error);
        },
        onRetry: (error, attempt, delay) => {
          logger.warn('等待验证邮件重试', { 
            targetEmail, 
            attempt, 
            delay, 
            error: error.message 
          });
        }
      }
    );
  }

  /**
   * 带重试的完成验证
   * @param {string} verificationLink - 验证链接
   * @param {number} maxRetries - 最大重试次数
   * @returns {Promise<boolean>} 是否成功
   */
  async completeVerificationWithRetry(verificationLink, maxRetries) {
    return retryWithExponentialBackoff(
      () => this.emailProcessor.completeEmailVerification(verificationLink),
      {
        maxRetries,
        baseDelay: 3000,
        shouldRetry: retryPredicates.networkError,
        onRetry: (error, attempt, delay) => {
          logger.warn('完成验证重试', { 
            verificationLink, 
            attempt, 
            delay, 
            error: error.message 
          });
        }
      }
    );
  }

  /**
   * 生成批量验证报告
   * @param {Array} results - 验证结果数组
   * @returns {Object} 报告对象
   */
  generateBatchReport(results) {
    const total = results.length;
    const statusCounts = {};
    
    // 统计各状态数量
    for (const result of results) {
      statusCounts[result.status] = (statusCounts[result.status] || 0) + 1;
    }

    const successCount = statusCounts[VerificationStatus.VERIFICATION_COMPLETED] || 0;
    const failureCount = total - successCount;
    const successRate = total > 0 ? (successCount / total * 100).toFixed(2) : 0;

    return {
      total,
      successCount,
      failureCount,
      successRate: `${successRate}%`,
      statusBreakdown: statusCounts,
      completedAt: new Date()
    };
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
 * 创建邮件验证管理器实例
 * @param {EmailProcessor} emailProcessor - 邮件处理器实例
 * @returns {EmailVerificationManager} 邮件验证管理器实例
 */
export function createEmailVerificationManager(emailProcessor) {
  return new EmailVerificationManager(emailProcessor);
}