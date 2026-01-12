/**
 * 批量处理管理器
 * 提供高级批量账号注册功能，包括进度跟踪、速率限制和并发控制
 */

import { createLogger } from '../utils/logger.js';
import { createTransactionLogger, TransactionStatus } from '../utils/transaction-logger.js';
import { createErrorHandler } from '../utils/error-handler.js';
import { BatchResult } from './account-manager.js';

/**
 * 批量处理配置类
 */
export class BatchProcessingConfig {
  constructor(options = {}) {
    this.concurrency = options.concurrency || 1; // 并发数量
    this.rateLimitDelay = options.rateLimitDelay || 5000; // 速率限制延迟（毫秒）
    this.batchSize = options.batchSize || 10; // 批次大小
    this.retryFailedAccounts = options.retryFailedAccounts !== false; // 是否重试失败的账号
    this.maxRetryAttempts = options.maxRetryAttempts || 2; // 最大重试次数
    this.progressCallback = options.progressCallback || null; // 进度回调函数
    this.pauseBetweenBatches = options.pauseBetweenBatches || 30000; // 批次间暂停时间（毫秒）
    this.enableProgressReport = options.enableProgressReport !== false; // 启用进度报告
    this.reportInterval = options.reportInterval || 10000; // 报告间隔（毫秒）
  }

  validate() {
    const errors = [];

    if (this.concurrency < 1 || this.concurrency > 10) {
      errors.push('并发数量必须在1-10之间');
    }

    if (this.rateLimitDelay < 1000) {
      errors.push('速率限制延迟不能少于1秒');
    }

    if (this.batchSize < 1 || this.batchSize > 100) {
      errors.push('批次大小必须在1-100之间');
    }

    if (this.maxRetryAttempts < 0 || this.maxRetryAttempts > 5) {
      errors.push('最大重试次数必须在0-5之间');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

/**
 * 批量处理进度类
 */
export class BatchProgress {
  constructor(totalCount) {
    this.totalCount = totalCount;
    this.processedCount = 0;
    this.successCount = 0;
    this.failureCount = 0;
    this.retryCount = 0;
    this.currentBatch = 0;
    this.totalBatches = 0;
    this.startTime = new Date();
    this.estimatedEndTime = null;
    this.currentEmail = null;
    this.status = 'INITIALIZING';
  }

  updateProgress(email, success, isRetry = false) {
    this.processedCount++;
    this.currentEmail = email;

    if (success) {
      this.successCount++;
    } else {
      this.failureCount++;
    }

    if (isRetry) {
      this.retryCount++;
    }

    // 计算预计完成时间
    if (this.processedCount > 0) {
      const elapsed = Date.now() - this.startTime.getTime();
      const avgTimePerAccount = elapsed / this.processedCount;
      const remainingAccounts = this.totalCount - this.processedCount;
      this.estimatedEndTime = new Date(Date.now() + (avgTimePerAccount * remainingAccounts));
    }
  }

  getProgressPercentage() {
    return this.totalCount > 0 ? (this.processedCount / this.totalCount) * 100 : 0;
  }

  getSuccessRate() {
    return this.processedCount > 0 ? (this.successCount / this.processedCount) * 100 : 0;
  }

  getElapsedTime() {
    return Date.now() - this.startTime.getTime();
  }

  toJSON() {
    return {
      totalCount: this.totalCount,
      processedCount: this.processedCount,
      successCount: this.successCount,
      failureCount: this.failureCount,
      retryCount: this.retryCount,
      currentBatch: this.currentBatch,
      totalBatches: this.totalBatches,
      progressPercentage: this.getProgressPercentage(),
      successRate: this.getSuccessRate(),
      elapsedTime: this.getElapsedTime(),
      estimatedEndTime: this.estimatedEndTime,
      currentEmail: this.currentEmail,
      status: this.status
    };
  }
}

/**
 * 批量处理管理器类
 */
export class BatchProcessor {
  constructor(accountManager, options = {}) {
    this.accountManager = accountManager;
    this.options = options;

    this.logger = createLogger({ component: 'BatchProcessor' });
    this.transactionLogger = createTransactionLogger({
      logDir: (options.logDir || 'logs') + '/batch-processing'
    });
    this.errorHandler = createErrorHandler('default', {
      maxRetries: 2,
      baseDelay: 3000
    });

    // 状态管理
    this.isProcessing = false;
    this.isPaused = false;
    this.shouldStop = false;
    this.currentProgress = null;
    this.progressReportTimer = null;
  }

  /**
   * 初始化批量处理器
   */
  async initialize() {
    try {
      await this.transactionLogger.init();
      this.logger.info('批量处理器初始化完成');
    } catch (error) {
      this.logger.error('批量处理器初始化失败', error);
      throw error;
    }
  }

  /**
   * 批量处理账号注册
   * @param {Array<string>} emails - 邮箱地址数组
   * @param {Object} registrationConfig - 注册配置
   * @param {BatchProcessingConfig} batchConfig - 批量处理配置
   * @returns {Promise<BatchResult>} 批量处理结果
   */
  async processBatch(emails, registrationConfig, batchConfig) {
    // 验证配置
    const validation = batchConfig.validate();
    if (!validation.isValid) {
      throw new Error(`批量处理配置无效: ${validation.errors.join(', ')}`);
    }

    const batchId = `batch-${Date.now()}`;
    const batchResult = new BatchResult();
    
    try {
      this.logger.info('开始批量处理', { 
        batchId,
        emailCount: emails.length,
        concurrency: batchConfig.concurrency,
        batchSize: batchConfig.batchSize
      });

      // 初始化状态
      this.isProcessing = true;
      this.isPaused = false;
      this.shouldStop = false;
      this.currentProgress = new BatchProgress(emails.length);
      this.currentProgress.status = 'PROCESSING';

      // 开始事务日志
      await this.transactionLogger.startTransaction(batchId, 'batch_processing', {
        emailCount: emails.length,
        config: {
          concurrency: batchConfig.concurrency,
          batchSize: batchConfig.batchSize,
          rateLimitDelay: batchConfig.rateLimitDelay
        }
      });

      // 启动进度报告
      if (batchConfig.enableProgressReport) {
        this.startProgressReporting(batchId, batchConfig.reportInterval);
      }

      // 分批处理
      const batches = this.createBatches(emails, batchConfig.batchSize);
      this.currentProgress.totalBatches = batches.length;

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        if (this.shouldStop) {
          this.logger.info('批量处理被停止', { batchId, batchIndex });
          break;
        }

        this.currentProgress.currentBatch = batchIndex + 1;
        const batch = batches[batchIndex];

        this.logger.info('处理批次', { 
          batchId, 
          batchIndex: batchIndex + 1, 
          totalBatches: batches.length,
          batchSize: batch.length 
        });

        // 处理当前批次
        const batchResults = await this.processSingleBatch(
          batch, 
          registrationConfig, 
          batchConfig, 
          batchId
        );

        // 合并结果
        for (const result of batchResults) {
          batchResult.addResult(result);
          this.currentProgress.updateProgress(result.email, result.success);
        }

        // 记录批次进度
        await this.transactionLogger.logProgress(batchId, {
          step: 'batch_completed',
          batchIndex: batchIndex + 1,
          batchResults: batchResults.length,
          totalProgress: this.currentProgress.toJSON()
        });

        // 批次间暂停
        if (batchIndex < batches.length - 1 && batchConfig.pauseBetweenBatches > 0) {
          this.logger.info('批次间暂停', { 
            delay: batchConfig.pauseBetweenBatches,
            nextBatch: batchIndex + 2 
          });
          
          await this.pauseWithInterruption(batchConfig.pauseBetweenBatches);
        }
      }

      // 处理重试
      if (batchConfig.retryFailedAccounts && batchConfig.maxRetryAttempts > 0) {
        await this.retryFailedAccounts(
          batchResult, 
          registrationConfig, 
          batchConfig, 
          batchId
        );
      }

      // 完成处理
      batchResult.complete();
      this.currentProgress.status = 'COMPLETED';

      // 停止进度报告
      this.stopProgressReporting();

      // 完成事务
      await this.transactionLogger.completeTransaction(batchId, {
        result: batchResult.toJSON(),
        finalProgress: this.currentProgress.toJSON()
      });

      this.logger.info('批量处理完成', {
        batchId,
        totalCount: batchResult.totalCount,
        successCount: batchResult.successCount,
        failureCount: batchResult.failureCount,
        successRate: batchResult.getSuccessRate(),
        duration: batchResult.duration
      });

      return batchResult;

    } catch (error) {
      this.logger.error('批量处理失败', { batchId, error });
      
      this.currentProgress.status = 'FAILED';
      this.stopProgressReporting();
      
      await this.transactionLogger.failTransaction(batchId, error);
      
      batchResult.complete();
      return batchResult;
      
    } finally {
      this.isProcessing = false;
      this.isPaused = false;
      this.shouldStop = false;
    }
  }

  /**
   * 创建批次
   * @param {Array} emails - 邮箱数组
   * @param {number} batchSize - 批次大小
   * @returns {Array<Array>} 批次数组
   */
  createBatches(emails, batchSize) {
    const batches = [];
    for (let i = 0; i < emails.length; i += batchSize) {
      batches.push(emails.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * 处理单个批次
   * @param {Array<string>} batch - 批次邮箱数组
   * @param {Object} registrationConfig - 注册配置
   * @param {BatchProcessingConfig} batchConfig - 批量处理配置
   * @param {string} batchId - 批次ID
   * @returns {Promise<Array>} 批次结果数组
   */
  async processSingleBatch(batch, registrationConfig, batchConfig, batchId) {
    const results = [];

    if (batchConfig.concurrency === 1) {
      // 串行处理
      for (const email of batch) {
        if (this.shouldStop) break;
        
        await this.waitForResume(); // 检查暂停状态
        
        const result = await this.processAccount(email, registrationConfig, batchId);
        results.push(result);

        // 速率限制
        if (batchConfig.rateLimitDelay > 0) {
          await this.pauseWithInterruption(batchConfig.rateLimitDelay);
        }
      }
    } else {
      // 并发处理
      const semaphore = new Semaphore(batchConfig.concurrency);
      const promises = batch.map(async (email) => {
        await semaphore.acquire();
        
        try {
          if (this.shouldStop) return null;
          
          await this.waitForResume();
          
          const result = await this.processAccount(email, registrationConfig, batchId);
          
          // 速率限制
          if (batchConfig.rateLimitDelay > 0) {
            await this.pauseWithInterruption(batchConfig.rateLimitDelay);
          }
          
          return result;
        } finally {
          semaphore.release();
        }
      });

      const concurrentResults = await Promise.all(promises);
      results.push(...concurrentResults.filter(result => result !== null));
    }

    return results;
  }

  /**
   * 处理单个账号
   * @param {string} email - 邮箱地址
   * @param {Object} registrationConfig - 注册配置
   * @param {string} batchId - 批次ID
   * @returns {Promise<Object>} 处理结果
   */
  async processAccount(email, registrationConfig, batchId) {
    const wrappedProcess = this.errorHandler.wrap(
      () => this.accountManager.registerSingleAccount(email, registrationConfig),
      { circuitBreakerKey: `batch-${batchId}` }
    );

    try {
      this.logger.info('处理账号', { email, batchId });
      
      const result = await wrappedProcess();
      
      this.logger.info('账号处理完成', { 
        email, 
        success: result.success,
        batchId 
      });
      
      return result;
      
    } catch (error) {
      this.logger.error('账号处理失败', { email, error: error.message, batchId });
      
      return {
        email,
        success: false,
        errorMessage: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 重试失败的账号
   * @param {BatchResult} batchResult - 批量结果
   * @param {Object} registrationConfig - 注册配置
   * @param {BatchProcessingConfig} batchConfig - 批量处理配置
   * @param {string} batchId - 批次ID
   */
  async retryFailedAccounts(batchResult, registrationConfig, batchConfig, batchId) {
    const failedEmails = batchResult.results
      .filter(result => !result.success)
      .map(result => result.email);

    if (failedEmails.length === 0) {
      this.logger.info('没有需要重试的失败账号', { batchId });
      return;
    }

    this.logger.info('开始重试失败账号', { 
      batchId,
      failedCount: failedEmails.length,
      maxRetryAttempts: batchConfig.maxRetryAttempts 
    });

    for (let attempt = 1; attempt <= batchConfig.maxRetryAttempts; attempt++) {
      if (this.shouldStop) break;

      this.logger.info('重试尝试', { batchId, attempt, emailCount: failedEmails.length });

      const retryResults = [];
      
      for (const email of failedEmails) {
        if (this.shouldStop) break;
        
        await this.waitForResume();
        
        const result = await this.processAccount(email, registrationConfig, batchId);
        retryResults.push(result);
        
        this.currentProgress.updateProgress(result.email, result.success, true);

        // 速率限制
        if (batchConfig.rateLimitDelay > 0) {
          await this.pauseWithInterruption(batchConfig.rateLimitDelay);
        }
      }

      // 更新结果
      for (const retryResult of retryResults) {
        const originalIndex = batchResult.results.findIndex(
          r => r.email === retryResult.email
        );
        
        if (originalIndex !== -1 && retryResult.success) {
          // 更新原始结果
          batchResult.results[originalIndex] = retryResult;
          batchResult.successCount++;
          batchResult.failureCount--;
        }
      }

      // 更新失败邮箱列表
      const stillFailedEmails = retryResults
        .filter(result => !result.success)
        .map(result => result.email);

      await this.transactionLogger.logProgress(batchId, {
        step: 'retry_attempt_completed',
        attempt,
        retriedCount: retryResults.length,
        stillFailedCount: stillFailedEmails.length
      });

      if (stillFailedEmails.length === 0) {
        this.logger.info('所有失败账号重试成功', { batchId, attempt });
        break;
      }

      // 更新失败邮箱列表用于下次重试
      failedEmails.length = 0;
      failedEmails.push(...stillFailedEmails);
    }
  }

  /**
   * 启动进度报告
   * @param {string} batchId - 批次ID
   * @param {number} interval - 报告间隔
   */
  startProgressReporting(batchId, interval) {
    this.progressReportTimer = setInterval(() => {
      if (this.currentProgress) {
        const progress = this.currentProgress.toJSON();
        
        this.logger.info('批量处理进度报告', {
          batchId,
          ...progress
        });

        // 调用进度回调
        if (this.options.progressCallback) {
          try {
            this.options.progressCallback(progress);
          } catch (error) {
            this.logger.error('进度回调执行失败', error);
          }
        }
      }
    }, interval);
  }

  /**
   * 停止进度报告
   */
  stopProgressReporting() {
    if (this.progressReportTimer) {
      clearInterval(this.progressReportTimer);
      this.progressReportTimer = null;
    }
  }

  /**
   * 暂停处理
   */
  pause() {
    this.isPaused = true;
    this.logger.info('批量处理已暂停');
  }

  /**
   * 恢复处理
   */
  resume() {
    this.isPaused = false;
    this.logger.info('批量处理已恢复');
  }

  /**
   * 停止处理
   */
  stop() {
    this.shouldStop = true;
    this.logger.info('批量处理停止请求已发送');
  }

  /**
   * 等待恢复
   */
  async waitForResume() {
    while (this.isPaused && !this.shouldStop) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * 可中断的暂停
   * @param {number} delay - 延迟时间
   */
  async pauseWithInterruption(delay) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < delay && !this.shouldStop) {
      await this.waitForResume();
      await new Promise(resolve => setTimeout(resolve, Math.min(1000, delay)));
    }
  }

  /**
   * 获取当前进度
   * @returns {Object|null} 当前进度
   */
  getCurrentProgress() {
    return this.currentProgress ? this.currentProgress.toJSON() : null;
  }

  /**
   * 关闭批量处理器
   */
  async close() {
    try {
      this.stop();
      this.stopProgressReporting();
      
      if (this.transactionLogger) {
        await this.transactionLogger.close();
      }
      
      this.logger.info('批量处理器已关闭');
    } catch (error) {
      this.logger.error('关闭批量处理器失败', error);
    }
  }
}

/**
 * 信号量类（用于并发控制）
 */
class Semaphore {
  constructor(maxConcurrency) {
    this.maxConcurrency = maxConcurrency;
    this.currentConcurrency = 0;
    this.waitingQueue = [];
  }

  async acquire() {
    return new Promise((resolve) => {
      if (this.currentConcurrency < this.maxConcurrency) {
        this.currentConcurrency++;
        resolve();
      } else {
        this.waitingQueue.push(resolve);
      }
    });
  }

  release() {
    this.currentConcurrency--;
    
    if (this.waitingQueue.length > 0) {
      const resolve = this.waitingQueue.shift();
      this.currentConcurrency++;
      resolve();
    }
  }
}

/**
 * 创建批量处理器
 * @param {Object} accountManager - 账号管理器
 * @param {Object} options - 选项
 * @returns {BatchProcessor} 批量处理器实例
 */
export function createBatchProcessor(accountManager, options = {}) {
  return new BatchProcessor(accountManager, options);
}