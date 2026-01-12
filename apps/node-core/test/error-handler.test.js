/**
 * 错误处理中间件测试
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { 
  ErrorHandler, 
  BrowserRecoveryHandler, 
  NetworkErrorHandler, 
  EmailErrorHandler,
  createErrorHandler,
  withErrorHandling
} from '../src/utils/error-handler.js';

describe('错误处理中间件', () => {
  test('应该能够创建基本错误处理器', () => {
    const handler = new ErrorHandler();
    assert(handler instanceof ErrorHandler);
    assert.strictEqual(handler.options.maxRetries, 3);
    assert.strictEqual(handler.options.baseDelay, 1000);
  });

  test('应该能够使用自定义选项创建错误处理器', () => {
    const options = {
      maxRetries: 5,
      baseDelay: 2000,
      maxDelay: 60000,
      enableCircuitBreaker: false
    };
    
    const handler = new ErrorHandler(options);
    assert.strictEqual(handler.options.maxRetries, 5);
    assert.strictEqual(handler.options.baseDelay, 2000);
    assert.strictEqual(handler.options.maxDelay, 60000);
    assert.strictEqual(handler.options.enableCircuitBreaker, false);
  });

  test('应该能够包装函数并处理成功情况', async () => {
    const handler = new ErrorHandler();
    let callCount = 0;
    
    const testFunction = async (value) => {
      callCount++;
      return value * 2;
    };
    
    const wrappedFunction = handler.wrap(testFunction);
    const result = await wrappedFunction(5);
    
    assert.strictEqual(result, 10);
    assert.strictEqual(callCount, 1);
  });

  test('应该能够处理重试逻辑', async () => {
    const handler = new ErrorHandler({ maxRetries: 2, baseDelay: 10 });
    let callCount = 0;
    
    const testFunction = async () => {
      callCount++;
      if (callCount < 3) {
        const error = new Error('网络连接失败');
        error.code = 'ECONNRESET';
        throw error;
      }
      return 'success';
    };
    
    const wrappedFunction = handler.wrap(testFunction, {
      errorType: 'network'
    });
    
    const result = await wrappedFunction();
    assert.strictEqual(result, 'success');
    assert.strictEqual(callCount, 3); // 初始调用 + 2次重试
  });

  test('应该能够处理最终失败', async () => {
    const handler = new ErrorHandler({ maxRetries: 1, baseDelay: 10 });
    let callCount = 0;
    
    const testFunction = async () => {
      callCount++;
      const error = new Error('持续失败');
      error.code = 'ECONNRESET';
      throw error;
    };
    
    const wrappedFunction = handler.wrap(testFunction, {
      errorType: 'network'
    });
    
    try {
      await wrappedFunction();
      assert.fail('应该抛出错误');
    } catch (error) {
      assert.strictEqual(error.message, '持续失败');
      assert.strictEqual(callCount, 2); // 初始调用 + 1次重试
    }
  });

  test('应该能够处理熔断器逻辑', async () => {
    const handler = new ErrorHandler({ 
      maxRetries: 0, 
      circuitBreakerThreshold: 2,
      enableCircuitBreaker: true
    });
    
    const testFunction = async () => {
      throw new Error('服务不可用');
    };
    
    const wrappedFunction = handler.wrap(testFunction, {
      circuitBreakerKey: 'test-service'
    });
    
    // 第一次失败
    try {
      await wrappedFunction();
    } catch (error) {
      // 预期的失败
    }
    
    // 第二次失败，应该触发熔断器
    try {
      await wrappedFunction();
    } catch (error) {
      // 预期的失败
    }
    
    // 第三次调用，熔断器应该阻止调用
    try {
      await wrappedFunction();
      assert.fail('熔断器应该阻止调用');
    } catch (error) {
      assert(error.message.includes('熔断器已打开'));
    }
  });

  test('应该能够获取错误统计', async () => {
    const handler = new ErrorHandler({ maxRetries: 0 });
    
    const successFunction = async () => 'success';
    const failFunction = async () => { throw new Error('fail'); };
    
    const wrappedSuccess = handler.wrap(successFunction, { circuitBreakerKey: 'test' });
    const wrappedFail = handler.wrap(failFunction, { circuitBreakerKey: 'test' });
    
    // 执行一些成功和失败的操作
    await wrappedSuccess();
    await wrappedSuccess();
    
    try {
      await wrappedFail();
    } catch (error) {
      // 预期的失败
    }
    
    const stats = handler.getStats('test');
    assert.strictEqual(stats.successes, 2);
    assert.strictEqual(stats.failures, 1);
    assert.strictEqual(stats.successRate, 2/3);
  });

  test('应该能够创建浏览器恢复处理器', () => {
    const handler = new BrowserRecoveryHandler();
    assert(handler instanceof BrowserRecoveryHandler);
    assert(handler instanceof ErrorHandler);
  });

  test('应该能够创建网络错误处理器', () => {
    const handler = new NetworkErrorHandler();
    assert(handler instanceof NetworkErrorHandler);
    assert(handler instanceof ErrorHandler);
  });

  test('应该能够创建邮件错误处理器', () => {
    const handler = new EmailErrorHandler();
    assert(handler instanceof EmailErrorHandler);
    assert(handler instanceof ErrorHandler);
  });

  test('应该能够使用工厂函数创建处理器', () => {
    const defaultHandler = createErrorHandler();
    const browserHandler = createErrorHandler('browser');
    const networkHandler = createErrorHandler('network');
    const emailHandler = createErrorHandler('email');
    
    assert(defaultHandler instanceof ErrorHandler);
    assert(browserHandler instanceof BrowserRecoveryHandler);
    assert(networkHandler instanceof NetworkErrorHandler);
    assert(emailHandler instanceof EmailErrorHandler);
  });

  test('应该能够使用便捷包装函数', async () => {
    let callCount = 0;
    
    const testFunction = async (value) => {
      callCount++;
      return value + 1;
    };
    
    const wrappedFunction = withErrorHandling(testFunction);
    const result = await wrappedFunction(5);
    
    assert.strictEqual(result, 6);
    assert.strictEqual(callCount, 1);
  });

  test('应该能够重置熔断器', async () => {
    const handler = new ErrorHandler({ 
      maxRetries: 0, 
      circuitBreakerThreshold: 1,
      enableCircuitBreaker: true
    });
    
    const testFunction = async () => {
      throw new Error('服务不可用');
    };
    
    const wrappedFunction = handler.wrap(testFunction, {
      circuitBreakerKey: 'test-reset'
    });
    
    // 触发熔断器
    try {
      await wrappedFunction();
    } catch (error) {
      // 预期的失败
    }
    
    // 验证熔断器已打开
    try {
      await wrappedFunction();
      assert.fail('熔断器应该阻止调用');
    } catch (error) {
      assert(error.message.includes('熔断器已打开'));
    }
    
    // 重置熔断器
    handler.resetCircuitBreaker('test-reset');
    
    // 现在应该可以再次调用（虽然仍会失败）
    try {
      await wrappedFunction();
    } catch (error) {
      assert.strictEqual(error.message, '服务不可用');
    }
  });

  test('应该能够判断浏览器重启条件', () => {
    const handler = new BrowserRecoveryHandler();
    
    const targetClosedError = new Error('Target closed');
    const protocolError = new Error('Protocol error');
    const normalError = new Error('Normal error');
    
    assert.strictEqual(handler.shouldRestartBrowser(targetClosedError), true);
    assert.strictEqual(handler.shouldRestartBrowser(protocolError), true);
    assert.strictEqual(handler.shouldRestartBrowser(normalError), false);
  });
});