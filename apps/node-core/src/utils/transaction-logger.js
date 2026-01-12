/**
 * 事务日志系统
 * 提供详细的操作日志记录、事务恢复支持和日志轮转功能
 */

import fs from 'fs/promises';
import path from 'path';
import { createLogger } from './logger.js';

/**
 * 事务状态枚举
 */
export const TransactionStatus = {
  STARTED: 'STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  ROLLED_BACK: 'ROLLED_BACK'
};

/**
 * 事务日志条目
 */
export class TransactionLogEntry {
  constructor(transactionId, operation, status, data = {}, error = null) {
    this.id = this.generateId();
    this.transactionId = transactionId;
    this.operation = operation;
    this.status = status;
    this.data = data;
    this.error = error;
    this.timestamp = new Date().toISOString();
    this.version = '1.0';
  }

  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  toJSON() {
    return {
      id: this.id,
      transactionId: this.transactionId,
      operation: this.operation,
      status: this.status,
      data: this.data,
      error: this.error,
      timestamp: this.timestamp,
      version: this.version
    };
  }

  static fromJSON(json) {
    const entry = new TransactionLogEntry(
      json.transactionId,
      json.operation,
      json.status,
      json.data,
      json.error
    );
    entry.id = json.id;
    entry.timestamp = json.timestamp;
    entry.version = json.version || '1.0';
    return entry;
  }
}

/**
 * 事务日志管理器
 */
export class TransactionLogger {
  constructor(options = {}) {
    this.options = {
      logDir: options.logDir || 'logs/transactions',
      maxFileSize: options.maxFileSize || 10 * 1024 * 1024, // 10MB
      maxFiles: options.maxFiles || 10,
      enableCompression: options.enableCompression !== false,
      flushInterval: options.flushInterval || 5000, // 5秒
      ...options
    };

    this.logger = createLogger({ component: 'TransactionLogger' });
    this.currentLogFile = null;
    this.logBuffer = [];
    this.activeTransactions = new Map();
    this.flushTimer = null;

    this.init();
  }

  /**
   * 初始化事务日志系统
   */
  async init() {
    try {
      // 确保日志目录存在
      await fs.mkdir(this.options.logDir, { recursive: true });
      
      // 设置当前日志文件
      await this.setupCurrentLogFile();
      
      // 启动定期刷新
      this.startFlushTimer();
      
      this.logger.info('事务日志系统初始化完成', {
        logDir: this.options.logDir,
        maxFileSize: this.options.maxFileSize,
        maxFiles: this.options.maxFiles
      });
    } catch (error) {
      this.logger.error('事务日志系统初始化失败', error);
      throw error;
    }
  }

  /**
   * 设置当前日志文件
   */
  async setupCurrentLogFile() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `transaction-${timestamp}.log`;
    this.currentLogFile = path.join(this.options.logDir, filename);
    
    this.logger.info('设置当前日志文件', { file: this.currentLogFile });
  }

  /**
   * 启动定期刷新定时器
   */
  startFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    
    this.flushTimer = setInterval(() => {
      this.flush().catch(error => {
        this.logger.error('定期刷新失败', error);
      });
    }, this.options.flushInterval);
  }

  /**
   * 开始事务
   * @param {string} transactionId - 事务ID
   * @param {string} operation - 操作名称
   * @param {Object} data - 事务数据
   * @returns {Promise<TransactionLogEntry>} 日志条目
   */
  async startTransaction(transactionId, operation, data = {}) {
    const entry = new TransactionLogEntry(
      transactionId,
      operation,
      TransactionStatus.STARTED,
      { ...data, startTime: Date.now() }
    );

    this.activeTransactions.set(transactionId, {
      operation,
      startTime: Date.now(),
      status: TransactionStatus.STARTED
    });

    await this.writeLogEntry(entry);
    
    this.logger.info('事务开始', {
      transactionId,
      operation,
      entryId: entry.id
    });

    return entry;
  }

  /**
   * 更新事务状态
   * @param {string} transactionId - 事务ID
   * @param {string} status - 新状态
   * @param {Object} data - 更新数据
   * @param {Error} error - 错误信息（如果有）
   * @returns {Promise<TransactionLogEntry>} 日志条目
   */
  async updateTransaction(transactionId, status, data = {}, error = null) {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction) {
      throw new Error(`事务不存在: ${transactionId}`);
    }

    const entry = new TransactionLogEntry(
      transactionId,
      transaction.operation,
      status,
      {
        ...data,
        duration: Date.now() - transaction.startTime
      },
      error ? {
        message: error.message,
        stack: error.stack,
        name: error.constructor.name
      } : null
    );

    // 更新活跃事务状态
    transaction.status = status;
    if (status === TransactionStatus.COMPLETED || 
        status === TransactionStatus.FAILED || 
        status === TransactionStatus.ROLLED_BACK) {
      this.activeTransactions.delete(transactionId);
    }

    await this.writeLogEntry(entry);
    
    this.logger.info('事务状态更新', {
      transactionId,
      status,
      entryId: entry.id,
      duration: entry.data.duration
    });

    return entry;
  }

  /**
   * 完成事务
   * @param {string} transactionId - 事务ID
   * @param {Object} data - 完成数据
   * @returns {Promise<TransactionLogEntry>} 日志条目
   */
  async completeTransaction(transactionId, data = {}) {
    return this.updateTransaction(transactionId, TransactionStatus.COMPLETED, data);
  }

  /**
   * 事务失败
   * @param {string} transactionId - 事务ID
   * @param {Error} error - 错误信息
   * @param {Object} data - 失败数据
   * @returns {Promise<TransactionLogEntry>} 日志条目
   */
  async failTransaction(transactionId, error, data = {}) {
    return this.updateTransaction(transactionId, TransactionStatus.FAILED, data, error);
  }

  /**
   * 回滚事务
   * @param {string} transactionId - 事务ID
   * @param {Object} data - 回滚数据
   * @returns {Promise<TransactionLogEntry>} 日志条目
   */
  async rollbackTransaction(transactionId, data = {}) {
    return this.updateTransaction(transactionId, TransactionStatus.ROLLED_BACK, data);
  }

  /**
   * 记录事务进度
   * @param {string} transactionId - 事务ID
   * @param {Object} data - 进度数据
   * @returns {Promise<TransactionLogEntry>} 日志条目
   */
  async logProgress(transactionId, data = {}) {
    return this.updateTransaction(transactionId, TransactionStatus.IN_PROGRESS, data);
  }

  /**
   * 写入日志条目
   * @param {TransactionLogEntry} entry - 日志条目
   */
  async writeLogEntry(entry) {
    this.logBuffer.push(entry);
    
    // 如果缓冲区太大，立即刷新
    if (this.logBuffer.length >= 100) {
      await this.flush();
    }
  }

  /**
   * 刷新日志缓冲区
   */
  async flush() {
    if (this.logBuffer.length === 0) {
      return;
    }

    try {
      // 检查是否需要轮转日志文件
      await this.checkLogRotation();

      // 准备写入的数据
      const entries = this.logBuffer.splice(0);
      const logLines = entries.map(entry => JSON.stringify(entry.toJSON())).join('\n') + '\n';

      // 写入文件
      await fs.appendFile(this.currentLogFile, logLines, 'utf8');
      
      this.logger.debug('日志缓冲区已刷新', { 
        entriesCount: entries.length,
        file: this.currentLogFile 
      });
    } catch (error) {
      this.logger.error('刷新日志缓冲区失败', error);
      throw error;
    }
  }

  /**
   * 检查日志轮转
   */
  async checkLogRotation() {
    try {
      const stats = await fs.stat(this.currentLogFile);
      
      if (stats.size >= this.options.maxFileSize) {
        await this.rotateLogFile();
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // 文件不存在，无需轮转
    }
  }

  /**
   * 轮转日志文件
   */
  async rotateLogFile() {
    try {
      this.logger.info('开始日志轮转', { currentFile: this.currentLogFile });

      // 压缩当前文件（如果启用）
      if (this.options.enableCompression) {
        await this.compressLogFile(this.currentLogFile);
      }

      // 清理旧文件
      await this.cleanupOldLogFiles();

      // 创建新的日志文件
      await this.setupCurrentLogFile();

      this.logger.info('日志轮转完成', { newFile: this.currentLogFile });
    } catch (error) {
      this.logger.error('日志轮转失败', error);
      throw error;
    }
  }

  /**
   * 压缩日志文件
   * @param {string} filePath - 文件路径
   */
  async compressLogFile(filePath) {
    try {
      const { createGzip } = await import('zlib');
      const { createReadStream, createWriteStream } = await import('fs');
      const { pipeline } = await import('stream/promises');

      const gzipPath = `${filePath}.gz`;
      const readStream = createReadStream(filePath);
      const writeStream = createWriteStream(gzipPath);
      const gzipStream = createGzip();

      await pipeline(readStream, gzipStream, writeStream);
      
      // 删除原文件
      await fs.unlink(filePath);
      
      this.logger.info('日志文件压缩完成', { 
        original: filePath, 
        compressed: gzipPath 
      });
    } catch (error) {
      this.logger.error('日志文件压缩失败', error);
      throw error;
    }
  }

  /**
   * 清理旧日志文件
   */
  async cleanupOldLogFiles() {
    try {
      const files = await fs.readdir(this.options.logDir);
      const logFiles = files
        .filter(file => file.startsWith('transaction-') && (file.endsWith('.log') || file.endsWith('.log.gz')))
        .map(file => ({
          name: file,
          path: path.join(this.options.logDir, file),
          stat: null
        }));

      // 获取文件统计信息
      for (const file of logFiles) {
        try {
          file.stat = await fs.stat(file.path);
        } catch (error) {
          // 忽略无法访问的文件
        }
      }

      // 按修改时间排序，保留最新的文件
      const validFiles = logFiles
        .filter(file => file.stat)
        .sort((a, b) => b.stat.mtime - a.stat.mtime);

      // 删除超出限制的文件
      const filesToDelete = validFiles.slice(this.options.maxFiles);
      for (const file of filesToDelete) {
        await fs.unlink(file.path);
        this.logger.info('删除旧日志文件', { file: file.name });
      }
    } catch (error) {
      this.logger.error('清理旧日志文件失败', error);
    }
  }

  /**
   * 查询事务日志
   * @param {Object} criteria - 查询条件
   * @returns {Promise<TransactionLogEntry[]>} 日志条目数组
   */
  async queryLogs(criteria = {}) {
    try {
      const {
        transactionId,
        operation,
        status,
        startTime,
        endTime,
        limit = 100
      } = criteria;

      const files = await fs.readdir(this.options.logDir);
      const logFiles = files
        .filter(file => file.startsWith('transaction-') && file.endsWith('.log'))
        .map(file => path.join(this.options.logDir, file));

      const results = [];

      for (const file of logFiles) {
        try {
          const content = await fs.readFile(file, 'utf8');
          const lines = content.trim().split('\n').filter(line => line.trim());

          for (const line of lines) {
            try {
              const entry = TransactionLogEntry.fromJSON(JSON.parse(line));
              
              // 应用过滤条件
              if (transactionId && entry.transactionId !== transactionId) continue;
              if (operation && entry.operation !== operation) continue;
              if (status && entry.status !== status) continue;
              if (startTime && new Date(entry.timestamp) < new Date(startTime)) continue;
              if (endTime && new Date(entry.timestamp) > new Date(endTime)) continue;

              results.push(entry);
              
              if (results.length >= limit) {
                break;
              }
            } catch (parseError) {
              // 忽略解析错误的行
              continue;
            }
          }
          
          if (results.length >= limit) {
            break;
          }
        } catch (fileError) {
          // 忽略无法读取的文件
          continue;
        }
      }

      // 按时间戳排序
      results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      return results.slice(0, limit);
    } catch (error) {
      this.logger.error('查询事务日志失败', error);
      throw error;
    }
  }

  /**
   * 获取活跃事务
   * @returns {Map} 活跃事务映射
   */
  getActiveTransactions() {
    return new Map(this.activeTransactions);
  }

  /**
   * 获取事务统计
   * @param {Object} criteria - 统计条件
   * @returns {Promise<Object>} 统计信息
   */
  async getTransactionStats(criteria = {}) {
    try {
      const logs = await this.queryLogs({ ...criteria, limit: 10000 });
      
      const stats = {
        total: logs.length,
        byStatus: {},
        byOperation: {},
        averageDuration: 0,
        successRate: 0
      };

      let totalDuration = 0;
      let completedCount = 0;

      for (const log of logs) {
        // 按状态统计
        stats.byStatus[log.status] = (stats.byStatus[log.status] || 0) + 1;
        
        // 按操作统计
        stats.byOperation[log.operation] = (stats.byOperation[log.operation] || 0) + 1;
        
        // 计算持续时间
        if (log.data && log.data.duration) {
          totalDuration += log.data.duration;
          if (log.status === TransactionStatus.COMPLETED) {
            completedCount++;
          }
        }
      }

      // 计算平均持续时间
      if (logs.length > 0) {
        stats.averageDuration = totalDuration / logs.length;
      }

      // 计算成功率
      const completedTransactions = stats.byStatus[TransactionStatus.COMPLETED] || 0;
      const failedTransactions = stats.byStatus[TransactionStatus.FAILED] || 0;
      const totalFinished = completedTransactions + failedTransactions;
      
      if (totalFinished > 0) {
        stats.successRate = completedTransactions / totalFinished;
      }

      return stats;
    } catch (error) {
      this.logger.error('获取事务统计失败', error);
      throw error;
    }
  }

  /**
   * 关闭事务日志系统
   */
  async close() {
    try {
      // 停止定时器
      if (this.flushTimer) {
        clearInterval(this.flushTimer);
        this.flushTimer = null;
      }

      // 刷新剩余的日志
      await this.flush();

      this.logger.info('事务日志系统已关闭');
    } catch (error) {
      this.logger.error('关闭事务日志系统失败', error);
      throw error;
    }
  }
}

/**
 * 创建事务日志管理器
 * @param {Object} options - 选项
 * @returns {TransactionLogger} 事务日志管理器实例
 */
export function createTransactionLogger(options = {}) {
  return new TransactionLogger(options);
}

/**
 * 全局事务日志管理器实例
 */
export const globalTransactionLogger = new TransactionLogger();