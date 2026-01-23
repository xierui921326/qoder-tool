/**
 * 日志工具
 * 提供统一的日志记录功能
 */

import chalk from 'chalk';

/**
 * 日志级别
 */
export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

/**
 * 日志器类
 */
export class Logger {
  constructor(options = {}) {
    this.component = options.component || 'App';
    this.level = options.level || LogLevel.INFO;
    this.enableColors = options.enableColors !== false;
  }

  /**
   * 格式化日志消息
   * @param {string} level - 日志级别
   * @param {string} message - 消息
   * @param {Object} meta - 元数据
   * @returns {string} 格式化后的消息
   */
  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const component = `[${this.component}]`;
    
    let formattedMessage = `${timestamp} ${level} ${component} ${message}`;
    
    if (Object.keys(meta).length > 0) {
      formattedMessage += ` ${JSON.stringify(meta)}`;
    }

    return formattedMessage;
  }

  /**
   * 应用颜色
   * @param {string} level - 日志级别
   * @param {string} message - 消息
   * @returns {string} 带颜色的消息
   */
  applyColors(level, message) {
    if (!this.enableColors) {
      return message;
    }

    switch (level) {
      case 'DEBUG':
        return chalk.gray(message);
      case 'INFO':
        return chalk.blue(message);
      case 'WARN':
        return chalk.yellow(message);
      case 'ERROR':
        return chalk.red(message);
      default:
        return message;
    }
  }

  /**
   * 记录调试信息
   * @param {string} message - 消息
   * @param {Object} meta - 元数据
   */
  debug(message, meta = {}) {
    if (this.level <= LogLevel.DEBUG) {
      const formatted = this.formatMessage('DEBUG', message, meta);
      console.error(this.applyColors('DEBUG', formatted));
    }
  }

  /**
   * 记录信息
   * @param {string} message - 消息
   * @param {Object} meta - 元数据
   */
  info(message, meta = {}) {
    if (this.level <= LogLevel.INFO) {
      const formatted = this.formatMessage('INFO', message, meta);
      console.error(this.applyColors('INFO', formatted));
    }
  }

  /**
   * 记录警告
   * @param {string} message - 消息
   * @param {Object} meta - 元数据
   */
  warn(message, meta = {}) {
    if (this.level <= LogLevel.WARN) {
      const formatted = this.formatMessage('WARN', message, meta);
      console.warn(this.applyColors('WARN', formatted));
    }
  }

  /**
   * 记录错误
   * @param {string} message - 消息
   * @param {Error|Object} error - 错误对象或元数据
   */
  error(message, error = {}) {
    if (this.level <= LogLevel.ERROR) {
      let meta = {};
      
      if (error instanceof Error) {
        meta = {
          error: error.message,
          stack: error.stack
        };
      } else {
        meta = error;
      }
      
      const formatted = this.formatMessage('ERROR', message, meta);
      console.error(this.applyColors('ERROR', formatted));
    }
  }

  /**
   * 设置日志级别
   * @param {number} level - 日志级别
   */
  setLevel(level) {
    this.level = level;
  }

  /**
   * 创建子日志器
   * @param {string} component - 组件名称
   * @returns {Logger} 子日志器
   */
  child(component) {
    return new Logger({
      component: `${this.component}:${component}`,
      level: this.level,
      enableColors: this.enableColors
    });
  }
}

/**
 * 创建日志器
 * @param {Object} options - 选项
 * @returns {Logger} 日志器实例
 */
export function createLogger(options = {}) {
  return new Logger(options);
}

/**
 * 全局日志器实例
 */
export const globalLogger = new Logger({ component: 'Global' });