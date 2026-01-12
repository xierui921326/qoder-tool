/**
 * 核心模块测试
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { 
  DatabaseManager, 
  CredentialStore, 
  EmailProcessor,
  generateSalt,
  generateStrongPassword,
  validatePasswordStrength,
  createLogger
} from '../src/index.js';

describe('核心模块测试', () => {
  test('数据库管理器创建', () => {
    const dbManager = new DatabaseManager(':memory:');
    assert.ok(dbManager instanceof DatabaseManager);
    assert.strictEqual(dbManager.isConnected, false);
  });

  test('凭据存储创建', () => {
    const credentialStore = new CredentialStore();
    assert.ok(credentialStore instanceof CredentialStore);
    assert.strictEqual(credentialStore.isInitialized, false);
  });

  test('邮件处理器创建', () => {
    const emailProcessor = new EmailProcessor();
    assert.ok(emailProcessor instanceof EmailProcessor);
    assert.strictEqual(emailProcessor.isConnected, false);
  });

  test('生成盐值', () => {
    const salt = generateSalt();
    assert.ok(Buffer.isBuffer(salt));
    assert.strictEqual(salt.length, 32);
  });

  test('生成强密码', () => {
    const password = generateStrongPassword(16);
    assert.strictEqual(typeof password, 'string');
    assert.strictEqual(password.length, 16);
  });

  test('验证密码强度', () => {
    const weakPassword = '123';
    const strongPassword = 'Abc123!@#xyz';
    
    const weakResult = validatePasswordStrength(weakPassword);
    const strongResult = validatePasswordStrength(strongPassword);
    
    assert.strictEqual(weakResult.isStrong, false);
    assert.strictEqual(strongResult.isStrong, true);
  });

  test('创建日志记录器', () => {
    const logger = createLogger({ console: true, file: false });
    assert.ok(logger);
    assert.strictEqual(typeof logger.info, 'function');
    assert.strictEqual(typeof logger.error, 'function');
  });
});