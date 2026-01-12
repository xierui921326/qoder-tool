/**
 * 错误处理中间件
 * 提供统一的错误处理、重试逻辑和故障恢复机制
 */

import { createLogger } from './logger.js';
import { retryWithExponentialBackoff, retryPredicates } from './retry.js';

/**
 * 错误处理中间件类
 */
export class ErrorHandler {
  constructor(options = {}) {
    this.options = {
      maxRetries: options.maxRetries || 3,
      baseDelay: options.baseDelay || 1000,
      maxDelay: options.maxDelay || 30000,
      enableCircuitBreaker: options.enableCircuitBreaker !== false,
      circuitBreakerThreshold: options.circuitBreakerThreshold || 5,
      circuitBreakerTimeout: options.circuitBreakerTimeout || 60000,
      ...options
    };
    
    this.logger = createLogger({ component: 'ErrorHandler' });
    this.circuitBreakers = new Map();
    this.errorStats = new Map();
  }

  /**
   * 包装函数以添加错误处理和重试逻辑
   * @param {Function} fn - 要包装的函数
   * @param {Object} options - 选项
   * @returns {Function} 包装后的函数
   */
  wrap(fn, options = {}) {
    const {
      retryPredicate = this.getDefaultRetryPredicate(options.errorType),
      onRetry = this.defaultOnRetry.bind(this),
      onError = this.defaultOnError.bind(this),
      circuitBreakerKey = fn.name || 'anonymous',
      ...retryOptions
    } = options;

    return async (...args) => {
      // 检查熔断器状态
      if (this.options.enableCircuitBreaker && this.isCircuitBreakerOpen(circuitBreakerKey)) {
        throw new Error(`熔断器已打开: ${circuitBreakerKey}`);
      }

      try {
        const result = await retryWithExponentialBackoff(
          () => fn(...args),
          {
            maxRetries: this.options.maxRetries,
            baseDelay: this.options.baseDelay,
            maxDelay: this.options.maxDelay,
            shouldRetry: retryPredicate,
            onRetry,
            ...retryOptions
          }
        );

        // 成功时重置熔断器
        this.recordSuccess(circuitBreakerKey);
        return result;

      } catch (error) {
        // 记录错误
        this.recordError(circuitBreakerKey, error);
        
        // 调用错误处理回调
        await onError(error, circuitBreakerKey);
        
        throw error;
      }
    };
  }

  /**
   * 获取默认重试判断函数
   * @param {string} errorType - 错误类型
   * @returns {Function} 重试判断函数
   */
  getDefaultRetryPredicate(errorType) {
    switch (errorType) {
      case 'network':
        return retryPredicates.networkError;
      case 'http':
        return retryPredicates.httpError;
      case 'browser':
        return retryPredicates.browserError;
      case 'email':
        return retryPredicates.emailError;
      default:
        return (error) => {
          // 默认重试逻辑：网络错误、超时错误、临时错误
          return retryPredicates.networkError(error) ||
                 retryPredicates.httpError(error) ||
                 error.message.includes('timeout') ||
                 error.message.includes('temporary');
        };
    }
  }

  /**
   * 默认重试回调
   * @param {Error} error - 错误对象
   * @param {number} attempt - 重试次数
   * @param {number} delay - 延迟时间
   */
  defaultOnRetry(error, attempt, delay) {
    this.logger.warn('操作失败，准备重试', {
      error: error.message,
      attempt,
      delay,
      errorType: error.constructor.name
    });
  }

  /**
   * 默认错误处理回调
   * @param {Error} error - 错误对象
   * @param {string} circuitBreakerKey - 熔断器键
   */
  async defaultOnError(error, circuitBreakerKey) {
    this.logger.error('操作最终失败', {
      error: error.message,
      stack: error.stack,
      circuitBreakerKey,
      errorType: error.constructor.name
    });
  }

  /**
   * 检查熔断器是否打开
   * @param {string} key - 熔断器键
   * @returns {boolean} 是否打开
   */
  isCircuitBreakerOpen(key) {
    const breaker = this.circuitBreakers.get(key);
    if (!breaker) return false;

    if (breaker.state === 'open') {
      // 检查是否可以尝试半开状态
      if (Date.now() - breaker.lastFailureTime > this.options.circuitBreakerTimeout) {
        breaker.state = 'half-open';
        this.logger.info('熔断器进入半开状态', { key });
        return false;
      }
      return true;
    }

    return false;
  }

  /**
   * 记录成功
   * @param {string} key - 熔断器键
   */
  recordSuccess(key) {
    const breaker = this.circuitBreakers.get(key);
    if (breaker) {
      if (breaker.state === 'half-open') {
        breaker.state = 'closed';
        breaker.failureCount = 0;
        this.logger.info('熔断器已关闭', { key });
      }
    }

    // 更新成功统计
    const stats = this.errorStats.get(key) || { successes: 0, failures: 0 };
    stats.successes++;
    this.errorStats.set(key, stats);
  }

  /**
   * 记录错误
   * @param {string} key - 熔断器键
   * @param {Error} error - 错误对象
   */
  recordError(key, error) {
    // 更新熔断器状态
    let breaker = this.circuitBreakers.get(key);
    if (!breaker) {
      breaker = {
        state: 'closed',
        failureCount: 0,
        lastFailureTime: null
      };
      this.circuitBreakers.set(key, breaker);
    }

    breaker.failureCount++;
    breaker.lastFailureTime = Date.now();

    if (breaker.failureCount >= this.options.circuitBreakerThreshold) {
      breaker.state = 'open';
      this.logger.warn('熔断器已打开', { 
        key, 
        failureCount: breaker.failureCount,
        threshold: this.options.circuitBreakerThreshold
      });
    }

    // 更新错误统计
    const stats = this.errorStats.get(key) || { successes: 0, failures: 0 };
    stats.failures++;
    this.errorStats.set(key, stats);
  }

  /**
   * 获取错误统计
   * @param {string} key - 键
   * @returns {Object} 统计信息
   */
  getStats(key) {
    const stats = this.errorStats.get(key) || { successes: 0, failures: 0 };
    const breaker = this.circuitBreakers.get(key);
    
    return {
      ...stats,
      successRate: stats.successes + stats.failures > 0 
        ? stats.successes / (stats.successes + stats.failures) 
        : 0,
      circuitBreakerState: breaker ? breaker.state : 'closed',
      failureCount: breaker ? breaker.failureCount : 0
    };
  }

  /**
   * 获取所有统计信息
   * @returns {Object} 所有统计信息
   */
  getAllStats() {
    const allStats = {};
    for (const [key] of this.errorStats) {
      allStats[key] = this.getStats(key);
    }
    return allStats;
  }

  /**
   * 重置熔断器
   * @param {string} key - 熔断器键
   */
  resetCircuitBreaker(key) {
    const breaker = this.circuitBreakers.get(key);
    if (breaker) {
      breaker.state = 'closed';
      breaker.failureCount = 0;
      breaker.lastFailureTime = null;
      this.logger.info('熔断器已重置', { key });
    }
  }

  /**
   * 重置所有熔断器
   */
  resetAllCircuitBreakers() {
    for (const [key] of this.circuitBreakers) {
      this.resetCircuitBreaker(key);
    }
  }

  /**
   * 清理统计信息
   */
  clearStats() {
    this.errorStats.clear();
    this.logger.info('错误统计信息已清理');
  }
}

/**
 * 浏览器故障恢复处理器
 */
export class BrowserRecoveryHandler extends ErrorHandler {
  constructor(options = {}) {
    super({
      errorType: 'browser',
      maxRetries: 3,
      baseDelay: 2000,
      ...options
    });
  }

  /**
   * 包装浏览器操作
   * @param {Function} fn - 浏览器操作函数
   * @param {Object} browserContext - 浏览器上下文
   * @param {Object} options - 选项
   * @returns {Function} 包装后的函数
   */
  wrapBrowserOperation(fn, browserContext, options = {}) {
    return this.wrap(fn, {
      ...options,
      onError: async (error, key) => {
        await this.defaultOnError(error, key);
        
        // 浏览器特定的恢复逻辑
        if (this.shouldRestartBrowser(error)) {
          await this.restartBrowser(browserContext);
        }
      }
    });
  }

  /**
   * 判断是否需要重启浏览器
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否需要重启
   */
  shouldRestartBrowser(error) {
    const restartIndicators = [
      'Target closed',
      'Protocol error',
      'Connection closed',
      'Browser has been closed',
      'Page has been closed'
    ];

    return restartIndicators.some(indicator => 
      error.message.includes(indicator)
    );
  }

  /**
   * 重启浏览器
   * @param {Object} browserContext - 浏览器上下文
   */
  async restartBrowser(browserContext) {
    try {
      this.logger.info('开始重启浏览器');
      
      if (browserContext.registrationBot) {
        await browserContext.registrationBot.cleanup();
        await browserContext.registrationBot.initialize();
        this.logger.info('浏览器重启完成');
      }
    } catch (error) {
      this.logger.error('浏览器重启失败', error);
      throw error;
    }
  }
}

/**
 * 网络错误处理器
 */
export class NetworkErrorHandler extends ErrorHandler {
  constructor(options = {}) {
    super({
      errorType: 'network',
      maxRetries: 5,
      baseDelay: 1000,
      maxDelay: 10000,
      ...options
    });
  }

  /**
   * 包装网络操作
   * @param {Function} fn - 网络操作函数
   * @param {Object} options - 选项
   * @returns {Function} 包装后的函数
   */
  wrapNetworkOperation(fn, options = {}) {
    return this.wrap(fn, {
      ...options,
      retryPredicate: (error, attempt) => {
        // 网络错误重试逻辑
        if (retryPredicates.networkError(error)) {
          return true;
        }
        
        // HTTP 5xx 错误重试
        if (retryPredicates.httpError(error)) {
          return true;
        }
        
        // 超时错误重试
        if (error.message.includes('timeout')) {
          return true;
        }
        
        return false;
      }
    });
  }
}

/**
 * 邮件错误处理器
 */
export class EmailErrorHandler extends ErrorHandler {
  constructor(options = {}) {
    super({
      errorType: 'email',
      maxRetries: 3,
      baseDelay: 2000,
      maxDelay: 15000,
      ...options
    });
  }

  /**
   * 包装邮件操作
   * @param {Function} fn - 邮件操作函数
   * @param {Object} options - 选项
   * @returns {Function} 包装后的函数
   */
  wrapEmailOperation(fn, options = {}) {
    return this.wrap(fn, {
      ...options,
      retryPredicate: (error, attempt) => {
        // 邮件特定的重试逻辑
        if (retryPredicates.emailError(error)) {
          return true;
        }
        
        // IMAP/SMTP 连接错误
        if (error.message.includes('IMAP') || error.message.includes('SMTP')) {
          return true;
        }
        
        // 认证错误通常不应该重试
        if (error.message.includes('Authentication failed')) {
          return false;
        }
        
        return false;
      }
    });
  }
}

/**
 * 创建错误处理器
 * @param {string} type - 处理器类型
 * @param {Object} options - 选项
 * @returns {ErrorHandler} 错误处理器实例
 */
export function createErrorHandler(type = 'default', options = {}) {
  switch (type) {
    case 'browser':
      return new BrowserRecoveryHandler(options);
    case 'network':
      return new NetworkErrorHandler(options);
    case 'email':
      return new EmailErrorHandler(options);
    default:
      return new ErrorHandler(options);
  }
}

/**
 * 全局错误处理器实例
 */
export const globalErrorHandler = new ErrorHandler();

/**
 * 便捷的包装函数
 * @param {Function} fn - 要包装的函数
 * @param {Object} options - 选项
 * @returns {Function} 包装后的函数
 */
export function withErrorHandling(fn, options = {}) {
  return globalErrorHandler.wrap(fn, options);
}