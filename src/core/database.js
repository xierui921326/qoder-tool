/**
 * 数据库连接和管理模块
 */
import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { createLogger } from '../utils/logger.js';

const logger = createLogger();

/**
 * SQLite数据库管理器
 */
export class DatabaseManager {
  constructor(dbPath = 'data/qoder-accounts.db') {
    this.dbPath = dbPath;
    this.db = null;
    this.isConnected = false;
  }

  /**
   * 连接到数据库
   * @returns {Promise<void>}
   */
  async connect() {
    try {
      // 确保数据目录存在
      const dbDir = path.dirname(this.dbPath);
      await fs.mkdir(dbDir, { recursive: true });

      // 创建数据库连接
      this.db = new sqlite3.Database(this.dbPath);
      
      // 将get和all方法转换为Promise
      this.db.get = promisify(this.db.get.bind(this.db));
      this.db.all = promisify(this.db.all.bind(this.db));

      // 启用外键约束
      await this.db.run('PRAGMA foreign_keys = ON');
      
      // 设置WAL模式以提高并发性能
      await this.db.run('PRAGMA journal_mode = WAL');
      
      // 设置同步模式
      await this.db.run('PRAGMA synchronous = NORMAL');

      this.isConnected = true;
      logger.info('数据库连接成功', { dbPath: this.dbPath });

      // 初始化数据库表
      await this.initializeTables();

    } catch (error) {
      logger.error('数据库连接失败', error);
      throw new Error(`数据库连接失败: ${error.message}`);
    }
  }

  /**
   * 初始化数据库表
   * @returns {Promise<void>}
   */
  async initializeTables() {
    try {
      // 使用Promise包装的run方法
      const runQuery = (sql) => {
        return new Promise((resolve, reject) => {
          this.db.run(sql, (error) => {
            if (error) reject(error);
            else resolve();
          });
        });
      };

      // 启用外键约束
      await runQuery('PRAGMA foreign_keys = ON');
      
      // 设置WAL模式以提高并发性能
      await runQuery('PRAGMA journal_mode = WAL');
      
      // 设置同步模式
      await runQuery('PRAGMA synchronous = NORMAL');

      // 创建账号表
      await runQuery(`
        CREATE TABLE IF NOT EXISTS accounts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          encrypted_password BLOB NOT NULL,
          account_id TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_verified TIMESTAMP,
          metadata TEXT,
          salt BLOB NOT NULL,
          CONSTRAINT email_format CHECK (email LIKE '%@%')
        )
      `);

      // 创建注册日志表
      await runQuery(`
        CREATE TABLE IF NOT EXISTS registration_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL,
          action TEXT NOT NULL,
          status TEXT NOT NULL,
          error_message TEXT,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          duration_ms INTEGER,
          metadata TEXT,
          FOREIGN KEY (email) REFERENCES accounts (email) ON DELETE CASCADE
        )
      `);

      // 创建配置表
      await runQuery(`
        CREATE TABLE IF NOT EXISTS configurations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT UNIQUE NOT NULL,
          value TEXT NOT NULL,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 创建索引以提高查询性能
      await runQuery('CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email)');
      await runQuery('CREATE INDEX IF NOT EXISTS idx_accounts_created_at ON accounts(created_at)');
      await runQuery('CREATE INDEX IF NOT EXISTS idx_logs_email ON registration_logs(email)');
      await runQuery('CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON registration_logs(timestamp)');
      await runQuery('CREATE INDEX IF NOT EXISTS idx_logs_status ON registration_logs(status)');

      logger.info('数据库表初始化完成');

      // 插入默认配置
      await this.insertDefaultConfigurations();

    } catch (error) {
      logger.error('数据库表初始化失败', error);
      throw new Error(`数据库表初始化失败: ${error.message}`);
    }
  }

  /**
   * 插入默认配置
   * @returns {Promise<void>}
   */
  async insertDefaultConfigurations() {
    const defaultConfigs = [
      {
        key: 'db_version',
        value: '1.0.0',
        description: '数据库版本'
      },
      {
        key: 'encryption_algorithm',
        value: 'aes-256-gcm',
        description: '加密算法'
      },
      {
        key: 'password_iterations',
        value: '100000',
        description: 'PBKDF2迭代次数'
      }
    ];

    for (const config of defaultConfigs) {
      try {
        await new Promise((resolve, reject) => {
          this.db.run(
            'INSERT OR IGNORE INTO configurations (key, value, description) VALUES (?, ?, ?)',
            [config.key, config.value, config.description],
            (error) => {
              if (error) reject(error);
              else resolve();
            }
          );
        });
      } catch (error) {
        logger.warn('插入默认配置失败', { config, error: error.message });
      }
    }
  }

  /**
   * 执行查询
   * @param {string} sql - SQL查询语句
   * @param {Array} params - 查询参数
   * @returns {Promise<Object>} 查询结果
   */
  async get(sql, params = []) {
    this.ensureConnected();
    try {
      const result = await this.db.get(sql, params);
      logger.debug('执行查询', { sql, params, hasResult: !!result });
      return result;
    } catch (error) {
      logger.error('查询执行失败', { sql, params, error: error.message });
      throw error;
    }
  }

  /**
   * 执行查询（返回多行）
   * @param {string} sql - SQL查询语句
   * @param {Array} params - 查询参数
   * @returns {Promise<Array>} 查询结果数组
   */
  async all(sql, params = []) {
    this.ensureConnected();
    try {
      const results = await this.db.all(sql, params);
      logger.debug('执行查询', { sql, params, resultCount: results.length });
      return results;
    } catch (error) {
      logger.error('查询执行失败', { sql, params, error: error.message });
      throw error;
    }
  }

  /**
   * 执行更新/插入/删除操作
   * @param {string} sql - SQL语句
   * @param {Array} params - 参数
   * @returns {Promise<Object>} 执行结果
   */
  async run(sql, params = []) {
    this.ensureConnected();
    try {
      const result = await new Promise((resolve, reject) => {
        this.db.run(sql, params, function(error) {
          if (error) {
            reject(error);
          } else {
            resolve({
              lastID: this.lastID,
              changes: this.changes
            });
          }
        });
      });
      
      logger.debug('执行更新', { 
        sql, 
        params, 
        lastID: result.lastID, 
        changes: result.changes 
      });
      return result;
    } catch (error) {
      logger.error('更新执行失败', { sql, params, error: error.message });
      throw error;
    }
  }

  /**
   * 开始事务
   * @returns {Promise<void>}
   */
  async beginTransaction() {
    this.ensureConnected();
    await new Promise((resolve, reject) => {
      this.db.run('BEGIN TRANSACTION', (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    logger.debug('开始事务');
  }

  /**
   * 提交事务
   * @returns {Promise<void>}
   */
  async commit() {
    this.ensureConnected();
    await new Promise((resolve, reject) => {
      this.db.run('COMMIT', (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    logger.debug('提交事务');
  }

  /**
   * 回滚事务
   * @returns {Promise<void>}
   */
  async rollback() {
    this.ensureConnected();
    await new Promise((resolve, reject) => {
      this.db.run('ROLLBACK', (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    logger.debug('回滚事务');
  }

  /**
   * 执行事务
   * @param {Function} callback - 事务回调函数
   * @returns {Promise<any>} 回调函数的返回值
   */
  async transaction(callback) {
    await this.beginTransaction();
    try {
      const result = await callback(this);
      await this.commit();
      return result;
    } catch (error) {
      await this.rollback();
      throw error;
    }
  }

  /**
   * 获取数据库统计信息
   * @returns {Promise<Object>} 统计信息
   */
  async getStats() {
    this.ensureConnected();
    
    const accountCount = await this.get('SELECT COUNT(*) as count FROM accounts');
    const logCount = await this.get('SELECT COUNT(*) as count FROM registration_logs');
    const dbSize = await this.get('PRAGMA page_count');
    const pageSize = await this.get('PRAGMA page_size');
    
    const recentLogs = await this.all(`
      SELECT status, COUNT(*) as count 
      FROM registration_logs 
      WHERE timestamp > datetime('now', '-24 hours')
      GROUP BY status
    `);

    return {
      accounts: accountCount.count,
      logs: logCount.count,
      dbSizeBytes: dbSize.page_count * pageSize.page_size,
      recentActivity: recentLogs
    };
  }

  /**
   * 备份数据库
   * @param {string} backupPath - 备份文件路径
   * @returns {Promise<void>}
   */
  async backup(backupPath) {
    this.ensureConnected();
    
    try {
      // 确保备份目录存在
      const backupDir = path.dirname(backupPath);
      await fs.mkdir(backupDir, { recursive: true });

      // 执行VACUUM INTO备份
      await new Promise((resolve, reject) => {
        this.db.run(`VACUUM INTO '${backupPath}'`, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      
      logger.info('数据库备份完成', { backupPath });
    } catch (error) {
      logger.error('数据库备份失败', error);
      throw new Error(`数据库备份失败: ${error.message}`);
    }
  }

  /**
   * 检查连接状态
   */
  ensureConnected() {
    if (!this.isConnected || !this.db) {
      throw new Error('数据库未连接，请先调用connect()方法');
    }
  }

  /**
   * 关闭数据库连接
   * @returns {Promise<void>}
   */
  async close() {
    if (this.db && this.isConnected) {
      return new Promise((resolve, reject) => {
        this.db.close((error) => {
          if (error) {
            logger.error('关闭数据库连接失败', error);
            reject(error);
          } else {
            this.isConnected = false;
            this.db = null;
            logger.info('数据库连接已关闭');
            resolve();
          }
        });
      });
    }
  }

  /**
   * 健康检查
   * @returns {Promise<boolean>} 数据库是否健康
   */
  async healthCheck() {
    try {
      await this.get('SELECT 1');
      return true;
    } catch (error) {
      logger.error('数据库健康检查失败', error);
      return false;
    }
  }
}

/**
 * 创建数据库管理器实例
 * @param {string} dbPath - 数据库文件路径
 * @returns {DatabaseManager} 数据库管理器实例
 */
export function createDatabaseManager(dbPath) {
  return new DatabaseManager(dbPath);
}

// 导出默认实例
export const defaultDb = new DatabaseManager();