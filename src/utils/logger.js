/**
 * 日志记录工具
 */
import fs from 'fs/promises';
import path from 'path';
import { ILogger } from '../core/interfaces.js';

/**
 * 日志级别枚举
 */
export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

/**
 * 控制台日志记录器
 */
export class ConsoleLogger extends ILogger {
  constructor(level = LogLevel.INFO) {
    super();
    this.level = level;
  }

  /**
   * 格式化日志消息
   * @param {string} level - 日志级别
   * @param {string} message - 消息
   * @param {Object} metadata - 元数据
   * @returns {string} 格式化后的消息
   */
  formatMessage(level, message, metadata = {}) {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(metadata).length > 0 ? ` ${JSON.stringify(metadata)}` : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
  }

  debug(message, metadata = {}) {
    if (this.level <= LogLevel.DEBUG) {
      console.debug(this.formatMessage('debug', message, metadata));
    }
  }

  info(message, metadata = {}) {
    if (this.level <= LogLevel.INFO) {
      console.info(this.formatMessage('info', message, metadata));
    }
  }

  warn(message, metadata = {}) {
    if (this.level <= LogLevel.WARN) {
      console.warn(this.formatMessage('warn', message, metadata));
    }
  }

  error(message, error = {}) {
    if (this.level <= LogLevel.ERROR) {
      const metadata = error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error;
      console.error(this.formatMessage('error', message, metadata));
    }
  }
}

/**
 * 文件日志记录器
 */
export class FileLogger extends ILogger {
  constructor(logDir = 'logs', level = LogLevel.INFO, maxFileSize = 10 * 1024 * 1024) {
    super();
    this.logDir = logDir;
    this.level = level;
    this.maxFileSize = maxFileSize;
    this.currentLogFile = null;
    this.writeQueue = [];
    this.isWriting = false;
    
    this.ensureLogDirectory();
  }

  /**
   * 确保日志目录存在
   */
  async ensureLogDirectory() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      console.error('创建日志目录失败:', error);
    }
  }

  /**
   * 获取当前日志文件路径
   * @returns {string} 日志文件路径
   */
  getCurrentLogFile() {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.logDir, `qoder-${date}.log`);
  }

  /**
   * 检查是否需要轮转日志文件
   * @param {string} filePath - 文件路径
   * @returns {Promise<boolean>} 是否需要轮转
   */
  async shouldRotateLog(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return stats.size > this.maxFileSize;
    } catch (error) {
      return false; // 文件不存在，不需要轮转
    }
  }

  /**
   * 轮转日志文件
   * @param {string} filePath - 原文件路径
   */
  async rotateLog(filePath) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rotatedPath = filePath.replace('.log', `-${timestamp}.log`);
    
    try {
      await fs.rename(filePath, rotatedPath);
    } catch (error) {
      console.error('日志轮转失败:', error);
    }
  }

  /**
   * 写入日志到文件
   * @param {string} level - 日志级别
   * @param {string} message - 消息
   * @param {Object} metadata - 元数据
   */
  async writeToFile(level, message, metadata = {}) {
    const logFile = this.getCurrentLogFile();
    
    // 检查是否需要轮转
    if (await this.shouldRotateLog(logFile)) {
      await this.rotateLog(logFile);
    }

    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(metadata).length > 0 ? ` ${JSON.stringify(metadata)}` : '';
    const logEntry = `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}\n`;

    this.writeQueue.push({ logFile, logEntry });
    
    if (!this.isWriting) {
      this.processWriteQueue();
    }
  }

  /**
   * 处理写入队列
   */
  async processWriteQueue() {
    this.isWriting = true;
    
    while (this.writeQueue.length > 0) {
      const { logFile, logEntry } = this.writeQueue.shift();
      
      try {
        await fs.appendFile(logFile, logEntry);
      } catch (error) {
        console.error('写入日志文件失败:', error);
      }
    }
    
    this.isWriting = false;
  }

  debug(message, metadata = {}) {
    if (this.level <= LogLevel.DEBUG) {
      this.writeToFile('debug', message, metadata);
    }
  }

  info(message, metadata = {}) {
    if (this.level <= LogLevel.INFO) {
      this.writeToFile('info', message, metadata);
    }
  }

  warn(message, metadata = {}) {
    if (this.level <= LogLevel.WARN) {
      this.writeToFile('warn', message, metadata);
    }
  }

  error(message, error = {}) {
    if (this.level <= LogLevel.ERROR) {
      const metadata = error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error;
      this.writeToFile('error', message, metadata);
    }
  }
}

/**
 * 组合日志记录器
 * 同时输出到控制台和文件
 */
export class CompositeLogger extends ILogger {
  constructor(loggers = []) {
    super();
    this.loggers = loggers;
  }

  /**
   * 添加日志记录器
   * @param {ILogger} logger - 日志记录器
   */
  addLogger(logger) {
    this.loggers.push(logger);
  }

  debug(message, metadata = {}) {
    this.loggers.forEach(logger => logger.debug(message, metadata));
  }

  info(message, metadata = {}) {
    this.loggers.forEach(logger => logger.info(message, metadata));
  }

  warn(message, metadata = {}) {
    this.loggers.forEach(logger => logger.warn(message, metadata));
  }

  error(message, error = {}) {
    this.loggers.forEach(logger => logger.error(message, error));
  }
}

/**
 * 创建默认日志记录器
 * @param {Object} options - 选项
 * @param {boolean} options.console - 是否启用控制台输出，默认true
 * @param {boolean} options.file - 是否启用文件输出，默认true
 * @param {string} options.logDir - 日志目录，默认'logs'
 * @param {number} options.level - 日志级别，默认INFO
 * @returns {ILogger} 日志记录器实例
 */
export function createLogger(options = {}) {
  const {
    console: enableConsole = true,
    file: enableFile = true,
    logDir = 'logs',
    level = LogLevel.INFO
  } = options;

  const loggers = [];

  if (enableConsole) {
    loggers.push(new ConsoleLogger(level));
  }

  if (enableFile) {
    loggers.push(new FileLogger(logDir, level));
  }

  if (loggers.length === 1) {
    return loggers[0];
  }

  return new CompositeLogger(loggers);
}