/**
 * 错误处理系统属性测试
 * 功能: qoder-account-manager, 属性5: 综合错误处理
 * 验证: 需求 1.5, 2.5, 8.1, 8.2, 8.3, 8.4
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';
import { 
  ErrorHandler, 
  BrowserRecoveryHandler, 
  NetworkErrorHandler, 
  EmailErrorHandler,
  createErrorHandler
} from '../src/utils/error-handler.js';

// 自定义生成器
const errorTypeGenerator = fc.constantFrom('network', 'browser', 'email', 'default');

const errorConfigGenerator = fc.record({
  maxRetries: fc.integer({ min: 0, max: 10 }),
  baseDelay: fc.integer({ min: 10, max: 5000 }),
  maxDelay: fc.integer({ min: 1000, max: 60000 }),
  enableCircuitBreaker: fc.boolean(),
  circuitBreakerThreshold: fc.integer({ min: 1, max: 10 })
});

const networkErrorGenerator = fc.oneof(
  fc.constant(Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' })),
  fc.constant(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' })),
  fc.constant(Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT' })),
  fc.constant(Object.assign(new Error('Request timeout'), { code: 'TIMEOUT' }))
);

const browserErrorGenerator = fc.oneof(
  fc.constant(new Error('Target closed')),
  fc.constant(new Error('Protocol error')),
  fc.constant(new Error('Connection closed')),
  fc.constant(new Error('Browser has been closed')),
  fc.constant(new Error('Page has been closed'))
);

const emailErrorGenerator = fc.oneof(
  fc.constant(new Error('IMAP connection failed')),
  fc.constant(new Error('SMTP authentication failed')),
  fc.constant(new Error('Mailbox not found')),
  fc.constant(new Error('Email parsing error'))
);

const httpErrorGenerator = fc.oneof(
  fc.constant(Object.assign(new Error('Internal Server Error'), { status: 500 })),
  fc.constant(Object.assign(new Error('Bad Gateway'), { status: 502 })),
  fc.constant(Object.assign(new Error('Service Unavailable'), { status: 503 })),
  fc.constant(Object.assign(new Error('Gateway Timeout'), { status: 504 })),
  fc.constant(Object.assign(new Error('Too Many Requests'), { status: 429 }))
);

const anyErrorGenerator = fc.oneof(
  networkErrorGenerator,
  browserErrorGenerator,
  emailErrorGenerator,
  httpErrorGenerator,
  fc.string().map(msg => new Error(msg))
);

describe('错误处理系统属性测试', () => {
  
  test('属性5.1: 错误处理器创建的一致性', () => {
    // 功能: qoder-account-manager, 属性5: 综合错误处理
    // 对于任何有效的配置，错误处理器应该能够成功创建并保持配置一致性
    fc.assert(fc.property(
      errorTypeGenerator,
      errorConfigGenerator,
      (errorType, config) => {
        // 确保maxDelay >= baseDelay
        if (config.maxDelay < config.baseDelay) {
          config.maxDelay = config.baseDelay * 2;
        }

        const handler = createErrorHandler(errorType, config);
        
        // 验证处理器类型正确
        assert(handler instanceof ErrorHandler);
        
        // 验证配置保持一致
        assert.strictEqual(handler.options.maxRetries, config.maxRetries);
        assert.strictEqual(handler.options.baseDelay, config.baseDelay);
        assert.strictEqual(handler.options.maxDelay, config.maxDelay);
        assert.strictEqual(handler.options.enableCircuitBreaker, config.enableCircuitBreaker);
        assert.strictEqual(handler.options.circuitBreakerThreshold, config.circuitBreakerThreshold);
        
        return true;
      }
    ), { numRuns: 100 });
  });

  test('属性5.2: 成功操作的幂等性', async () => {
    // 功能: qoder-account-manager, 属性5: 综合错误处理
    // 对于任何成功的操作，包装后的函数应该返回相同的结果且不触发重试
    await fc.assert(fc.asyncProperty(
      fc.anything(),
      errorConfigGenerator,
      async (inputValue, config) => {
        const handler = new ErrorHandler(config);
        let callCount = 0;
        
        const successFunction = async (value) => {
          callCount++;
          return { result: value, timestamp: Date.now() };
        };
        
        const wrappedFunction = handler.wrap(successFunction);
        const result = await wrappedFunction(inputValue);
        
        // 验证只调用了一次
        assert.strictEqual(callCount, 1);
        
        // 验证结果包含输入值
        assert.strictEqual(result.result, inputValue);
        assert(typeof result.timestamp === 'number');
        
        return true;
      }
    ), { numRuns: 100 });
  });

  test('属性5.3: 重试逻辑的正确性', async () => {
    // 功能: qoder-account-manager, 属性5: 综合错误处理
    // 对于任何可重试的错误，系统应该按照配置进行重试，直到成功或达到最大重试次数
    await fc.assert(fc.asyncProperty(
      fc.integer({ min: 1, max: 5 }),
      fc.integer({ min: 1, max: 3 }),
      networkErrorGenerator,
      async (successAfterAttempts, maxRetries, error) => {
        const handler = new ErrorHandler({ 
          maxRetries, 
          baseDelay: 10,
          enableCircuitBreaker: false 
        });
        
        let callCount = 0;
        
        const retryFunction = async () => {
          callCount++;
          if (callCount < successAfterAttempts) {
            throw error;
          }
          return 'success';
        };
        
        const wrappedFunction = handler.wrap(retryFunction, {
          errorType: 'network'
        });
        
        try {
          const result = await wrappedFunction();
          
          // 如果成功，验证调用次数正确
          assert.strictEqual(result, 'success');
          assert.strictEqual(callCount, successAfterAttempts);
          assert(callCount <= maxRetries + 1);
          
        } catch (thrownError) {
          // 如果失败，验证达到了最大重试次数
          assert.strictEqual(callCount, maxRetries + 1);
          assert.strictEqual(thrownError.message, error.message);
        }
        
        return true;
      }
    ), { numRuns: 100 });
  });

  test('属性5.4: 熔断器状态管理的正确性', async () => {
    // 功能: qoder-account-manager, 属性5: 综合错误处理
    // 对于任何错误序列，熔断器应该正确地在关闭、打开和半开状态之间转换
    await fc.assert(fc.asyncProperty(
      fc.integer({ min: 1, max: 3 }),
      fc.array(fc.boolean(), { minLength: 1, maxLength: 10 }),
      async (threshold, operationResults) => {
        const handler = new ErrorHandler({ 
          maxRetries: 0,
          circuitBreakerThreshold: threshold,
          circuitBreakerTimeout: 50,
          enableCircuitBreaker: true
        });
        
        const testKey = `test-circuit-${Date.now()}-${Math.random()}`;
        let consecutiveFailures = 0;
        let circuitBreakerTriggered = false;
        
        for (let i = 0; i < operationResults.length; i++) {
          const shouldSucceed = operationResults[i];
          
          const testFunction = async () => {
            if (shouldSucceed) {
              return 'success';
            } else {
              throw new Error('operation failed');
            }
          };
          
          const wrappedFunction = handler.wrap(testFunction, {
            circuitBreakerKey: testKey
          });
          
          try {
            const result = await wrappedFunction();
            
            // 成功操作应该重置连续失败计数
            if (result === 'success') {
              consecutiveFailures = 0;
            }
            
          } catch (error) {
            if (error.message.includes('熔断器已打开')) {
              // 验证熔断器确实应该被触发
              assert(circuitBreakerTriggered, '熔断器不应该在此时打开');
            } else {
              // 这是一个正常的操作失败
              consecutiveFailures++;
              if (consecutiveFailures >= threshold) {
                circuitBreakerTriggered = true;
              }
            }
          }
        }
        
        return true;
      }
    ), { numRuns: 30 });
  });

  test('属性5.5: 错误类型特定处理的正确性', async () => {
    // 功能: qoder-account-manager, 属性5: 综合错误处理
    // 对于任何特定类型的错误，相应的错误处理器应该应用正确的重试策略
    await fc.assert(fc.asyncProperty(
      errorTypeGenerator,
      anyErrorGenerator,
      async (handlerType, error) => {
        const handler = createErrorHandler(handlerType, { 
          maxRetries: 2, 
          baseDelay: 10,
          enableCircuitBreaker: false 
        });
        
        let callCount = 0;
        
        const errorFunction = async () => {
          callCount++;
          throw error;
        };
        
        const wrappedFunction = handler.wrap(errorFunction, {
          errorType: handlerType
        });
        
        try {
          await wrappedFunction();
          assert.fail('应该抛出错误');
        } catch (thrownError) {
          // 验证错误被正确传播
          assert.strictEqual(thrownError.message, error.message);
          
          // 验证重试次数符合预期
          const shouldRetry = handler.getDefaultRetryPredicate(handlerType)(error);
          const expectedCalls = shouldRetry ? 3 : 1; // 初始调用 + 重试次数
          assert.strictEqual(callCount, expectedCalls);
        }
        
        return true;
      }
    ), { numRuns: 100 });
  });

  test('属性5.6: 统计信息的准确性', async () => {
    // 功能: qoder-account-manager, 属性5: 综合错误处理
    // 对于任何操作序列，错误处理器应该维护准确的统计信息
    await fc.assert(fc.asyncProperty(
      fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }),
      async (operationResults) => {
        const handler = new ErrorHandler({ 
          maxRetries: 0,
          enableCircuitBreaker: false 
        });
        
        const testKey = `stats-test-${Date.now()}-${Math.random()}`;
        let expectedSuccesses = 0;
        let expectedFailures = 0;
        
        for (const shouldSucceed of operationResults) {
          const testFunction = async () => {
            if (shouldSucceed) {
              return 'success';
            } else {
              throw new Error('failure');
            }
          };
          
          const wrappedFunction = handler.wrap(testFunction, {
            circuitBreakerKey: testKey
          });
          
          try {
            await wrappedFunction();
            expectedSuccesses++;
          } catch (error) {
            expectedFailures++;
          }
        }
        
        const stats = handler.getStats(testKey);
        
        // 验证统计信息准确性
        assert.strictEqual(stats.successes, expectedSuccesses);
        assert.strictEqual(stats.failures, expectedFailures);
        
        // 验证成功率计算正确
        const expectedSuccessRate = expectedSuccesses + expectedFailures > 0 
          ? expectedSuccesses / (expectedSuccesses + expectedFailures) 
          : 0;
        assert.strictEqual(stats.successRate, expectedSuccessRate);
        
        return true;
      }
    ), { numRuns: 50 });
  });

  test('属性5.7: 浏览器错误处理的特殊性', () => {
    // 功能: qoder-account-manager, 属性5: 综合错误处理
    // 对于任何浏览器相关错误，浏览器恢复处理器应该正确识别需要重启的情况
    fc.assert(fc.property(
      browserErrorGenerator,
      (browserError) => {
        const handler = new BrowserRecoveryHandler();
        
        // 验证浏览器错误识别
        const shouldRestart = handler.shouldRestartBrowser(browserError);
        
        // 所有生成的浏览器错误都应该触发重启
        assert.strictEqual(shouldRestart, true);
        
        return true;
      }
    ), { numRuns: 100 });
  });

  test('属性5.8: 网络错误重试策略的一致性', async () => {
    // 功能: qoder-account-manager, 属性5: 综合错误处理
    // 对于任何网络错误，网络错误处理器应该应用一致的重试策略
    await fc.assert(fc.asyncProperty(
      networkErrorGenerator,
      async (networkError) => {
        const handler = new NetworkErrorHandler({ 
          maxRetries: 3, 
          baseDelay: 10,
          enableCircuitBreaker: false 
        });
        
        let callCount = 0;
        
        const networkFunction = async () => {
          callCount++;
          throw networkError;
        };
        
        const wrappedFunction = handler.wrapNetworkOperation(networkFunction);
        
        try {
          await wrappedFunction();
          assert.fail('应该抛出错误');
        } catch (error) {
          // 验证网络错误被重试了正确的次数
          assert.strictEqual(callCount, 4); // 初始调用 + 3次重试
          assert.strictEqual(error.message, networkError.message);
        }
        
        return true;
      }
    ), { numRuns: 100 });
  });

  test('属性5.9: 邮件错误处理的特殊逻辑', async () => {
    // 功能: qoder-account-manager, 属性5: 综合错误处理
    // 对于任何邮件错误，邮件错误处理器应该根据错误类型决定是否重试
    await fc.assert(fc.asyncProperty(
      emailErrorGenerator,
      async (emailError) => {
        const handler = new EmailErrorHandler({ 
          maxRetries: 2, 
          baseDelay: 10,
          enableCircuitBreaker: false 
        });
        
        let callCount = 0;
        
        const emailFunction = async () => {
          callCount++;
          throw emailError;
        };
        
        const wrappedFunction = handler.wrapEmailOperation(emailFunction);
        
        try {
          await wrappedFunction();
          assert.fail('应该抛出错误');
        } catch (error) {
          // 验证邮件错误处理逻辑
          const shouldRetry = (
            emailError.message.includes('Connection timeout') ||
            emailError.message.includes('IMAP connection') ||
            (emailError.message.includes('IMAP') || emailError.message.includes('SMTP'))
          ) && !emailError.message.includes('Authentication failed');
          
          if (shouldRetry) {
            // 可重试的错误应该重试
            assert.strictEqual(callCount, 3); // 初始调用 + 2次重试
          } else {
            // 不可重试的错误不应该重试
            assert.strictEqual(callCount, 1);
          }
          
          assert.strictEqual(error.message, emailError.message);
        }
        
        return true;
      }
    ), { numRuns: 100 });
  });

  test('属性5.10: 错误恢复的完整性', async () => {
    // 功能: qoder-account-manager, 属性5: 综合错误处理
    // 对于任何错误条件，系统应该记录详细信息并实施适当的恢复策略
    await fc.assert(fc.asyncProperty(
      errorTypeGenerator,
      anyErrorGenerator,
      fc.integer({ min: 1, max: 3 }),
      async (handlerType, error, failureCount) => {
        const handler = createErrorHandler(handlerType, { 
          maxRetries: 3, 
          baseDelay: 10,
          enableCircuitBreaker: false 
        });
        
        let callCount = 0;
        let onRetryCallCount = 0;
        let onErrorCallCount = 0;
        
        const testFunction = async () => {
          callCount++;
          if (callCount <= failureCount) {
            throw error;
          }
          return 'recovered';
        };
        
        const wrappedFunction = handler.wrap(testFunction, {
          errorType: handlerType,
          onRetry: (err, attempt, delay) => {
            onRetryCallCount++;
            // 验证重试回调参数
            assert.strictEqual(err.message, error.message);
            assert(typeof attempt === 'number');
            assert(typeof delay === 'number');
          },
          onError: async (err, key) => {
            onErrorCallCount++;
            // 验证错误回调参数
            assert.strictEqual(err.message, error.message);
            assert(typeof key === 'string');
          }
        });
        
        try {
          const result = await wrappedFunction();
          
          // 如果恢复成功
          assert.strictEqual(result, 'recovered');
          assert.strictEqual(callCount, failureCount + 1);
          assert.strictEqual(onRetryCallCount, failureCount);
          assert.strictEqual(onErrorCallCount, 0); // 成功时不调用onError
          
        } catch (thrownError) {
          // 如果最终失败
          assert.strictEqual(thrownError.message, error.message);
          assert.strictEqual(onErrorCallCount, 1); // 最终失败时调用onError
        }
        
        return true;
      }
    ), { numRuns: 50 });
  });
});