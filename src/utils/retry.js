/**
 * 重试工具函数
 */

/**
 * 指数退避重试函数
 * @param {Function} fn - 要重试的异步函数
 * @param {Object} options - 重试选项
 * @param {number} options.maxRetries - 最大重试次数，默认3
 * @param {number} options.baseDelay - 基础延迟时间（毫秒），默认1000
 * @param {number} options.maxDelay - 最大延迟时间（毫秒），默认30000
 * @param {number} options.backoffMultiplier - 退避乘数，默认2
 * @param {Function} options.shouldRetry - 判断是否应该重试的函数
 * @param {Function} options.onRetry - 重试时的回调函数
 * @returns {Promise<any>} 函数执行结果
 */
export async function retryWithExponentialBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    shouldRetry = () => true,
    onRetry = () => {}
  } = options;

  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // 如果是最后一次尝试，直接抛出错误
      if (attempt === maxRetries) {
        throw error;
      }
      
      // 检查是否应该重试
      if (!shouldRetry(error, attempt)) {
        throw error;
      }
      
      // 计算延迟时间
      const delay = Math.min(
        baseDelay * Math.pow(backoffMultiplier, attempt),
        maxDelay
      );
      
      // 添加随机抖动（±25%）
      const jitter = delay * 0.25 * (Math.random() * 2 - 1);
      const finalDelay = Math.max(0, delay + jitter);
      
      // 调用重试回调
      onRetry(error, attempt + 1, finalDelay);
      
      // 等待延迟时间
      await sleep(finalDelay);
    }
  }
  
  throw lastError;
}

/**
 * 线性重试函数
 * @param {Function} fn - 要重试的异步函数
 * @param {Object} options - 重试选项
 * @param {number} options.maxRetries - 最大重试次数，默认3
 * @param {number} options.delay - 固定延迟时间（毫秒），默认1000
 * @param {Function} options.shouldRetry - 判断是否应该重试的函数
 * @param {Function} options.onRetry - 重试时的回调函数
 * @returns {Promise<any>} 函数执行结果
 */
export async function retryWithLinearBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    delay = 1000,
    shouldRetry = () => true,
    onRetry = () => {}
  } = options;

  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      if (!shouldRetry(error, attempt)) {
        throw error;
      }
      
      onRetry(error, attempt + 1, delay);
      await sleep(delay);
    }
  }
  
  throw lastError;
}

/**
 * 带超时的重试函数
 * @param {Function} fn - 要重试的异步函数
 * @param {Object} options - 重试选项
 * @param {number} options.timeout - 总超时时间（毫秒）
 * @param {number} options.maxRetries - 最大重试次数，默认3
 * @param {number} options.baseDelay - 基础延迟时间（毫秒），默认1000
 * @param {Function} options.shouldRetry - 判断是否应该重试的函数
 * @param {Function} options.onRetry - 重试时的回调函数
 * @returns {Promise<any>} 函数执行结果
 */
export async function retryWithTimeout(fn, options = {}) {
  const {
    timeout,
    maxRetries = 3,
    baseDelay = 1000,
    shouldRetry = () => true,
    onRetry = () => {}
  } = options;

  const startTime = Date.now();
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // 检查是否超时
    if (timeout && Date.now() - startTime > timeout) {
      throw new Error(`操作超时：${timeout}ms`);
    }
    
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      if (!shouldRetry(error, attempt)) {
        throw error;
      }
      
      // 检查延迟后是否会超时
      if (timeout && Date.now() - startTime + baseDelay > timeout) {
        throw new Error(`操作超时：${timeout}ms`);
      }
      
      onRetry(error, attempt + 1, baseDelay);
      await sleep(baseDelay);
    }
  }
  
  throw lastError;
}

/**
 * 睡眠函数
 * @param {number} ms - 睡眠时间（毫秒）
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 常见错误类型的重试判断函数
 */
export const retryPredicates = {
  /**
   * 网络错误重试判断
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否应该重试
   */
  networkError: (error) => {
    const networkErrorCodes = ['ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT'];
    return networkErrorCodes.some(code => error.code === code) ||
           error.message.includes('网络') ||
           error.message.includes('连接');
  },

  /**
   * HTTP错误重试判断
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否应该重试
   */
  httpError: (error) => {
    const retryableStatusCodes = [408, 429, 500, 502, 503, 504];
    return error.response && retryableStatusCodes.includes(error.response.status);
  },

  /**
   * 浏览器错误重试判断
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否应该重试
   */
  browserError: (error) => {
    const retryableMessages = [
      'Target closed',
      'Protocol error',
      'Connection closed',
      'Navigation timeout'
    ];
    return retryableMessages.some(msg => error.message.includes(msg));
  },

  /**
   * 邮件错误重试判断
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否应该重试
   */
  emailError: (error) => {
    const retryableMessages = [
      'Connection timeout',
      'IMAP connection',
      'Authentication failed'
    ];
    return retryableMessages.some(msg => error.message.includes(msg));
  }
};

/**
 * 创建带重试的函数包装器
 * @param {Function} fn - 原始函数
 * @param {Object} retryOptions - 重试选项
 * @returns {Function} 包装后的函数
 */
export function withRetry(fn, retryOptions = {}) {
  return async (...args) => {
    return retryWithExponentialBackoff(() => fn(...args), retryOptions);
  };
}