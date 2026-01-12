/**
 * 事务日志系统测试
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'fs/promises';
import path from 'path';
import { 
  TransactionLogger, 
  TransactionLogEntry, 
  TransactionStatus,
  createTransactionLogger
} from '../src/utils/transaction-logger.js';

// 测试用的临时目录
const TEST_LOG_DIR = 'test-logs';

describe('事务日志系统', () => {
  // 清理测试目录
  async function cleanupTestDir() {
    try {
      await fs.rm(TEST_LOG_DIR, { recursive: true, force: true });
    } catch (error) {
      // 忽略清理错误
    }
  }

  test('应该能够创建事务日志条目', () => {
    const entry = new TransactionLogEntry(
      'test-tx-001',
      'user-registration',
      TransactionStatus.STARTED,
      { email: 'test@example.com' }
    );

    assert.strictEqual(entry.transactionId, 'test-tx-001');
    assert.strictEqual(entry.operation, 'user-registration');
    assert.strictEqual(entry.status, TransactionStatus.STARTED);
    assert.deepStrictEqual(entry.data, { email: 'test@example.com' });
    assert(entry.id);
    assert(entry.timestamp);
  });

  test('应该能够序列化和反序列化日志条目', () => {
    const originalEntry = new TransactionLogEntry(
      'test-tx-002',
      'email-verification',
      TransactionStatus.COMPLETED,
      { verified: true },
      null
    );

    const json = originalEntry.toJSON();
    const deserializedEntry = TransactionLogEntry.fromJSON(json);

    assert.strictEqual(deserializedEntry.transactionId, originalEntry.transactionId);
    assert.strictEqual(deserializedEntry.operation, originalEntry.operation);
    assert.strictEqual(deserializedEntry.status, originalEntry.status);
    assert.deepStrictEqual(deserializedEntry.data, originalEntry.data);
    assert.strictEqual(deserializedEntry.id, originalEntry.id);
    assert.strictEqual(deserializedEntry.timestamp, originalEntry.timestamp);
  });

  test('应该能够创建事务日志管理器', async () => {
    await cleanupTestDir();
    
    const logger = new TransactionLogger({
      logDir: TEST_LOG_DIR,
      flushInterval: 100 // 快速刷新用于测试
    });

    await logger.init();
    
    assert(logger instanceof TransactionLogger);
    assert.strictEqual(logger.options.logDir, TEST_LOG_DIR);
    
    await logger.close();
    await cleanupTestDir();
  });

  test('应该能够记录完整的事务生命周期', async () => {
    await cleanupTestDir();
    
    const logger = new TransactionLogger({
      logDir: TEST_LOG_DIR,
      flushInterval: 50
    });

    await logger.init();

    const transactionId = 'test-tx-lifecycle';
    
    // 开始事务
    const startEntry = await logger.startTransaction(
      transactionId, 
      'user-registration',
      { email: 'test@example.com' }
    );
    
    assert.strictEqual(startEntry.status, TransactionStatus.STARTED);
    assert(logger.getActiveTransactions().has(transactionId));

    // 记录进度
    await logger.logProgress(transactionId, { step: 'email-validation' });
    
    // 完成事务
    const completeEntry = await logger.completeTransaction(
      transactionId,
      { userId: 'user-123' }
    );
    
    assert.strictEqual(completeEntry.status, TransactionStatus.COMPLETED);
    assert(!logger.getActiveTransactions().has(transactionId));

    // 等待刷新
    await new Promise(resolve => setTimeout(resolve, 100));
    await logger.flush();

    await logger.close();
    await cleanupTestDir();
  });

  test('应该能够处理事务失败', async () => {
    await cleanupTestDir();
    
    const logger = new TransactionLogger({
      logDir: TEST_LOG_DIR,
      flushInterval: 50
    });

    await logger.init();

    const transactionId = 'test-tx-failure';
    const error = new Error('注册失败');
    
    // 开始事务
    await logger.startTransaction(transactionId, 'user-registration');
    
    // 事务失败
    const failEntry = await logger.failTransaction(
      transactionId,
      error,
      { reason: 'email-already-exists' }
    );
    
    assert.strictEqual(failEntry.status, TransactionStatus.FAILED);
    assert.strictEqual(failEntry.error.message, '注册失败');
    assert(!logger.getActiveTransactions().has(transactionId));

    await logger.close();
    await cleanupTestDir();
  });

  test('应该能够查询事务日志', async () => {
    await cleanupTestDir();
    
    const logger = new TransactionLogger({
      logDir: TEST_LOG_DIR,
      flushInterval: 50
    });

    await logger.init();

    // 创建多个事务
    const transactions = [
      { id: 'tx-001', operation: 'user-registration', status: TransactionStatus.COMPLETED },
      { id: 'tx-002', operation: 'email-verification', status: TransactionStatus.FAILED },
      { id: 'tx-003', operation: 'user-registration', status: TransactionStatus.COMPLETED }
    ];

    for (const tx of transactions) {
      await logger.startTransaction(tx.id, tx.operation);
      if (tx.status === TransactionStatus.COMPLETED) {
        await logger.completeTransaction(tx.id);
      } else {
        await logger.failTransaction(tx.id, new Error('测试错误'));
      }
    }

    // 等待刷新
    await new Promise(resolve => setTimeout(resolve, 100));
    await logger.flush();

    // 查询所有日志
    const allLogs = await logger.queryLogs({ limit: 100 });
    assert(allLogs.length >= 6); // 每个事务至少2个条目（开始+结束）

    // 按操作查询
    const registrationLogs = await logger.queryLogs({ 
      operation: 'user-registration',
      limit: 100 
    });
    assert(registrationLogs.length >= 4); // 2个注册事务，每个至少2个条目

    // 按状态查询
    const completedLogs = await logger.queryLogs({ 
      status: TransactionStatus.COMPLETED,
      limit: 100 
    });
    assert(completedLogs.length >= 2); // 2个完成的事务

    await logger.close();
    await cleanupTestDir();
  });

  test('应该能够获取事务统计', async () => {
    await cleanupTestDir();
    
    const logger = new TransactionLogger({
      logDir: TEST_LOG_DIR,
      flushInterval: 50
    });

    await logger.init();

    // 创建一些测试事务
    await logger.startTransaction('tx-stats-1', 'registration');
    await logger.completeTransaction('tx-stats-1');
    
    await logger.startTransaction('tx-stats-2', 'registration');
    await logger.failTransaction('tx-stats-2', new Error('测试失败'));
    
    await logger.startTransaction('tx-stats-3', 'verification');
    await logger.completeTransaction('tx-stats-3');

    // 等待刷新
    await new Promise(resolve => setTimeout(resolve, 100));
    await logger.flush();

    const stats = await logger.getTransactionStats();
    
    assert(stats.total >= 6); // 至少6个日志条目
    assert(stats.byStatus[TransactionStatus.STARTED] >= 3);
    assert(stats.byStatus[TransactionStatus.COMPLETED] >= 2);
    assert(stats.byStatus[TransactionStatus.FAILED] >= 1);
    assert(stats.byOperation['registration'] >= 4);
    assert(stats.byOperation['verification'] >= 2);
    assert(typeof stats.successRate === 'number');
    assert(stats.successRate >= 0 && stats.successRate <= 1);

    await logger.close();
    await cleanupTestDir();
  });

  test('应该能够处理日志轮转', async () => {
    await cleanupTestDir();
    
    const logger = new TransactionLogger({
      logDir: TEST_LOG_DIR,
      maxFileSize: 1024, // 1KB，很小的文件大小用于测试轮转
      flushInterval: 50
    });

    await logger.init();

    // 生成大量日志以触发轮转
    for (let i = 0; i < 50; i++) {
      const txId = `bulk-tx-${i}`;
      await logger.startTransaction(txId, 'bulk-operation', {
        data: 'x'.repeat(100) // 添加一些数据使日志更大
      });
      await logger.completeTransaction(txId, {
        result: 'success',
        moreData: 'y'.repeat(100)
      });
    }

    // 强制刷新
    await logger.flush();

    // 检查是否创建了多个日志文件
    const files = await fs.readdir(TEST_LOG_DIR);
    const logFiles = files.filter(file => file.startsWith('transaction-') && file.endsWith('.log'));
    
    // 应该有多个日志文件（由于轮转）
    assert(logFiles.length >= 1);

    await logger.close();
    await cleanupTestDir();
  });

  test('应该能够使用工厂函数创建日志管理器', async () => {
    await cleanupTestDir();
    
    const logger = createTransactionLogger({
      logDir: TEST_LOG_DIR
    });

    await logger.init();
    
    assert(logger instanceof TransactionLogger);
    
    await logger.close();
    await cleanupTestDir();
  });

  test('应该能够处理回滚事务', async () => {
    await cleanupTestDir();
    
    const logger = new TransactionLogger({
      logDir: TEST_LOG_DIR,
      flushInterval: 50
    });

    await logger.init();

    const transactionId = 'test-rollback';
    
    // 开始事务
    await logger.startTransaction(transactionId, 'complex-operation');
    
    // 记录一些进度
    await logger.logProgress(transactionId, { step: 'step-1' });
    await logger.logProgress(transactionId, { step: 'step-2' });
    
    // 回滚事务
    const rollbackEntry = await logger.rollbackTransaction(
      transactionId,
      { reason: 'validation-failed' }
    );
    
    assert.strictEqual(rollbackEntry.status, TransactionStatus.ROLLED_BACK);
    assert.strictEqual(rollbackEntry.data.reason, 'validation-failed');
    assert(!logger.getActiveTransactions().has(transactionId));

    await logger.close();
    await cleanupTestDir();
  });
});