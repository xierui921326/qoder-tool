/**
 * 重试工具
 * 提供指数退避重试逻辑和重试判断函数
 */

import { createLogger } from './logger.js';

/**
 * 指数退避重试函数
 * @param {Function} fn - 要重试的函数
 * @param {Object} options - 重试选项
 * @returns {Promise} 函数执行结果
 */
export async function retryWithExponentialBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    shouldRetry = () => true,
    onRetry = () => {},
    jitter = true
  } = options;

  const logger = createLogger({ component: 'RetryUtil' });
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      
      if (attempt > 0) {
        logger.info('重试成功', { attempt, maxRetries });
      }
      
      return result;
    } catch (error) {
      lastError = error;
      
      // 如果是最后一次尝试，直接抛出错误
      if (attempt === maxRetries) {
        logger.error('重试次数已用完', { 
          attempt, 
          maxRetries, 
          error: error.message 
        });
        throw error;
      }

      // 检查是否应该重试
      if (!shouldRetry(error, attempt)) {
        logger.warn('根据重试策略，停止重试', { 
          attempt, 
          error: error.message 
        });
        throw error;
      }

      // 计算延迟时间
      let delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      
      // 添加抖动以避免雷群效应
      if (jitter) {
        delay = delay * (0.5 + Math.random() * 0.5);
      }

      logger.warn('操作失败，准备重试', { 
        attempt: attempt + 1, 
        maxRetries, 
        delay: Math.round(delay),
        error: error.message 
      });

      // 调用重试回调
      await onRetry(error, attempt + 1, delay);

      // 等待延迟时间
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * 重试判断函数集合
 */
export const retryPredicates = {
  /**
   * 网络错误重试判断
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否应该重试
   */
  networkError: (error) => {
    const networkErrorCodes = [
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ENETUNREACH',
      'EHOSTUNREACH'
    ];

    const networkErrorMessages = [
      'network error',
      'connection reset',
      'connection refused',
      'timeout',
      'socket hang up',
      'getaddrinfo'
    ];

    return networkErrorCodes.includes(error.code) ||
           networkErrorMessages.some(msg => 
             error.message.toLowerCase().includes(msg)
           );
  },

  /**
   * HTTP错误重试判断
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否应该重试
   */
  httpError: (error) => {
    // 重试5xx服务器错误和429限流错误
    const retryableStatusCodes = [429, 500, 502, 503, 504];
    
    if (error.response && error.response.status) {
      return retryableStatusCodes.includes(error.response.status);
    }

    if (error.status) {
      return retryableStatusCodes.includes(error.status);
    }

    return false;
  },

  /**
   * 浏览器错误重试判断
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否应该重试
   */
  browserError: (error) => {
    const retryableBrowserErrors = [
      'Target closed',
      'Protocol error',
      'Connection closed',
      'Navigation timeout',
      'Timeout',
      'Page crashed'
    ];

    return retryableBrowserErrors.some(errorType =>
      error.message.includes(errorType)
    );
  },

  /**
   * 邮件错误重试判断
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否应该重试
   */
  emailError: (error) => {
    const retryableEmailErrors = [
      'IMAP connection timeout',
      'Connection lost',
      'Server temporarily unavailable',
      'Temporary failure',
      'ECONNRESET',
      'ETIMEDOUT'
    ];

    // 不重试认证错误
    const nonRetryableErrors = [
      'Authentication failed',
      'Invalid credentials',
      'Login failed',
      'Bad username or password'
    ];

    if (nonRetryableErrors.some(errorType =>
      error.message.toLowerCase().includes(errorType.toLowerCase())
    )) {
      return false;
    }

    return retryableEmailErrors.some(errorType =>
      error.message.includes(errorType)
    ) || retryPredicates.networkError(error);
  },

  /**
   * 数据库错误重试判断
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否应该重试
   */
  databaseError: (error) => {
    const retryableDatabaseErrors = [
      'SQLITE_BUSY',
      'SQLITE_LOCKED',
      'database is locked',
      'Connection lost',
      'Connection timeout'
    ];

    return retryableDatabaseErrors.some(errorType =>
      error.message.includes(errorType)
    );
  },

  /**
   * 文件系统错误重试判断
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否应该重试
   */
  fileSystemError: (error) => {
    const retryableFileErrors = [
      'EMFILE',
      'ENFILE',
      'EAGAIN',
      'EBUSY'
    ];

    return retryableFileErrors.includes(error.code);
  }
};

/**
 * 创建自定义重试函数
 * @param {Object} defaultOptions - 默认重试选项
 * @returns {Function} 重试函数
 */
export function createRetryFunction(defaultOptions = {}) {
  return (fn, options = {}) => {
    const mergedOptions = { ...defaultOptions, ...options };
    return retryWithExponentialBackoff(fn, mergedOptions);
  };
}

/**
 * 重试装饰器
 * @param {Object} options - 重试选项
 * @returns {Function} 装饰器函数
 */
export function retry(options = {}) {
  return function(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function(...args) {
      return retryWithExponentialBackoff(
        () => originalMethod.apply(this, args),
        options
      );
    };
    
    return descriptor;
  };
}

/**
 * 简单重试函数（固定延迟）
 * @param {Function} fn - 要重试的函数
 * @param {Object} options - 重试选项
 * @returns {Promise} 函数执行结果
 */
export async function simpleRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    delay = 1000,
    shouldRetry = () => true
  } = options;

  const logger = createLogger({ component: 'SimpleRetry' });
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries || !shouldRetry(error, attempt)) {
        throw error;
      }

      logger.warn('操作失败，准备重试', { 
        attempt: attempt + 1, 
        maxRetries, 
        delay,
        error: error.message 
      });

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * 带超时的重试
 * @param {Function} fn - 要重试的函数
 * @param {Object} options - 重试选项
 * @returns {Promise} 函数执行结果
 */
export async function retryWithTimeout(fn, options = {}) {
  const {
    timeout = 30000,
    ...retryOptions
  } = options;

  return Promise.race([
    retryWithExponentialBackoff(fn, retryOptions),
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`操作超时: ${timeout}ms`));
      }, timeout);
    })
  ]);
}