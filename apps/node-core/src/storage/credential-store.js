/**
 * 凭据存储系统
 * 提供账号凭据的安全存储和管理功能
 */

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { createLogger } from '../utils/logger.js';

/**
 * 账号凭据类
 */
export class AccountCredentials {
  constructor(email, password, accountId = null, createdAt = null, lastVerified = null, metadata = {}) {
    this.email = email;
    this.password = password;
    this.accountId = accountId;
    this.createdAt = createdAt || new Date().toISOString();
    this.lastVerified = lastVerified;
    this.metadata = metadata;
  }

  toJSON() {
    return {
      email: this.email,
      password: this.password,
      accountId: this.accountId,
      createdAt: this.createdAt,
      lastVerified: this.lastVerified,
      metadata: this.metadata
    };
  }

  static fromJSON(json) {
    return new AccountCredentials(
      json.email,
      json.password,
      json.accountId,
      json.createdAt,
      json.lastVerified,
      json.metadata
    );
  }
}

/**
 * 凭据存储类
 */
export class CredentialStore {
  constructor(options = {}) {
    this.options = {
      dataDir: options.dataDir || 'data',
      dbFile: options.dbFile || 'credentials.db',
      encryptionKey: options.encryptionKey || this.generateEncryptionKey(),
      backupDir: options.backupDir || 'backups',
      ...options
    };

    this.logger = createLogger({ component: 'CredentialStore' });
    this.db = null;
    this.isInitialized = false;
  }

  /**
   * 生成加密密钥
   * @returns {string} 加密密钥
   */
  generateEncryptionKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * 初始化凭据存储
   */
  async initialize() {
    try {
      this.logger.info('初始化凭据存储系统');

      // 确保数据目录存在
      await fs.mkdir(this.options.dataDir, { recursive: true });
      await fs.mkdir(path.join(this.options.dataDir, this.options.backupDir), { recursive: true });

      // 打开数据库连接
      const dbPath = path.join(this.options.dataDir, this.options.dbFile);
      this.db = await open({
        filename: dbPath,
        driver: sqlite3.Database
      });

      // 创建表结构
      await this.createTables();

      this.isInitialized = true;
      this.logger.info('凭据存储系统初始化完成', { dbPath });

    } catch (error) {
      this.logger.error('凭据存储系统初始化失败', error);
      throw error;
    }
  }

  /**
   * 创建数据库表
   */
  async createTables() {
    try {
      // 创建账号表
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS accounts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          encrypted_password BLOB NOT NULL,
          account_id TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_verified TIMESTAMP,
          metadata TEXT,
          salt BLOB NOT NULL
        )
      `);

      // 创建注册日志表
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS registration_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL,
          action TEXT NOT NULL,
          status TEXT NOT NULL,
          error_message TEXT,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (email) REFERENCES accounts (email)
        )
      `);

      // 创建索引
      await this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts (email);
        CREATE INDEX IF NOT EXISTS idx_logs_email ON registration_logs (email);
        CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON registration_logs (timestamp);
      `);

      this.logger.info('数据库表创建完成');

    } catch (error) {
      this.logger.error('创建数据库表失败', error);
      throw error;
    }
  }

  /**
   * 加密密码
   * @param {string} password - 明文密码
   * @returns {Object} 加密结果
   */
  encryptPassword(password) {
    try {
      // 生成随机盐
      const salt = crypto.randomBytes(16);
      
      // 使用PBKDF2派生密钥
      const key = crypto.pbkdf2Sync(this.options.encryptionKey, salt, 100000, 32, 'sha256');
      
      // 生成随机IV
      const iv = crypto.randomBytes(16);
      
      // 加密密码
      const cipher = crypto.createCipher('aes-256-cbc', key);
      cipher.setAutoPadding(true);
      
      let encrypted = cipher.update(password, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      return {
        encryptedPassword: Buffer.from(encrypted, 'hex'),
        salt: salt
      };

    } catch (error) {
      this.logger.error('密码加密失败', error);
      throw error;
    }
  }

  /**
   * 解密密码
   * @param {Buffer} encryptedPassword - 加密的密码
   * @param {Buffer} salt - 盐值
   * @returns {string} 明文密码
   */
  decryptPassword(encryptedPassword, salt) {
    try {
      // 使用PBKDF2派生密钥
      const key = crypto.pbkdf2Sync(this.options.encryptionKey, salt, 100000, 32, 'sha256');
      
      // 解密密码
      const decipher = crypto.createDecipher('aes-256-cbc', key);
      decipher.setAutoPadding(true);
      
      let decrypted = decipher.update(encryptedPassword, null, 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;

    } catch (error) {
      this.logger.error('密码解密失败', error);
      throw error;
    }
  }

  /**
   * 存储凭据
   * @param {string} email - 邮箱地址
   * @param {string} password - 密码
   * @param {Object} metadata - 元数据
   * @returns {Promise<boolean>} 存储是否成功
   */
  async storeCredentials(email, password, metadata = {}) {
    if (!this.isInitialized) {
      throw new Error('凭据存储未初始化');
    }

    try {
      this.logger.info('存储账号凭据', { email });

      // 加密密码
      const { encryptedPassword, salt } = this.encryptPassword(password);

      // 存储到数据库
      await this.db.run(`
        INSERT OR REPLACE INTO accounts 
        (email, encrypted_password, account_id, metadata, salt, created_at, last_verified)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        email,
        encryptedPassword,
        metadata.accountId || null,
        JSON.stringify(metadata),
        salt,
        metadata.createdAt || new Date().toISOString(),
        metadata.lastVerified || null
      ]);

      // 记录操作日志
      await this.logAction(email, 'STORE_CREDENTIALS', 'SUCCESS');

      this.logger.info('账号凭据存储成功', { email });
      return true;

    } catch (error) {
      this.logger.error('存储账号凭据失败', { email, error });
      await this.logAction(email, 'STORE_CREDENTIALS', 'FAILED', error.message);
      throw error;
    }
  }

  /**
   * 检索凭据
   * @param {string} email - 邮箱地址
   * @returns {Promise<AccountCredentials|null>} 账号凭据
   */
  async retrieveCredentials(email) {
    if (!this.isInitialized) {
      throw new Error('凭据存储未初始化');
    }

    try {
      this.logger.info('检索账号凭据', { email });

      const row = await this.db.get(`
        SELECT * FROM accounts WHERE email = ?
      `, [email]);

      if (!row) {
        this.logger.info('账号凭据不存在', { email });
        return null;
      }

      // 解密密码
      const password = this.decryptPassword(row.encrypted_password, row.salt);

      // 解析元数据
      let metadata = {};
      try {
        metadata = JSON.parse(row.metadata || '{}');
      } catch (parseError) {
        this.logger.warn('元数据解析失败', { email, error: parseError.message });
      }

      const credentials = new AccountCredentials(
        row.email,
        password,
        row.account_id,
        row.created_at,
        row.last_verified,
        metadata
      );

      // 记录操作日志
      await this.logAction(email, 'RETRIEVE_CREDENTIALS', 'SUCCESS');

      this.logger.info('账号凭据检索成功', { email });
      return credentials;

    } catch (error) {
      this.logger.error('检索账号凭据失败', { email, error });
      await this.logAction(email, 'RETRIEVE_CREDENTIALS', 'FAILED', error.message);
      throw error;
    }
  }

  /**
   * 列出所有账号
   * @returns {Promise<Array>} 账号列表
   */
  async listAllAccounts() {
    if (!this.isInitialized) {
      throw new Error('凭据存储未初始化');
    }

    try {
      this.logger.info('列出所有账号');

      const rows = await this.db.all(`
        SELECT email, account_id, created_at, last_verified, metadata 
        FROM accounts 
        ORDER BY created_at DESC
      `);

      const accounts = rows.map(row => {
        let metadata = {};
        try {
          metadata = JSON.parse(row.metadata || '{}');
        } catch (parseError) {
          // 忽略解析错误
        }

        return {
          email: row.email,
          accountId: row.account_id,
          createdAt: row.created_at,
          lastVerified: row.last_verified,
          provider: metadata.provider,
          registrationDate: metadata.registrationDate
        };
      });

      this.logger.info('账号列表获取成功', { count: accounts.length });
      return accounts;

    } catch (error) {
      this.logger.error('列出所有账号失败', error);
      throw error;
    }
  }

  /**
   * 删除凭据
   * @param {string} email - 邮箱地址
   * @returns {Promise<boolean>} 删除是否成功
   */
  async deleteCredentials(email) {
    if (!this.isInitialized) {
      throw new Error('凭据存储未初始化');
    }

    try {
      this.logger.info('删除账号凭据', { email });

      const result = await this.db.run(`
        DELETE FROM accounts WHERE email = ?
      `, [email]);

      if (result.changes === 0) {
        this.logger.warn('账号凭据不存在', { email });
        return false;
      }

      // 记录操作日志
      await this.logAction(email, 'DELETE_CREDENTIALS', 'SUCCESS');

      this.logger.info('账号凭据删除成功', { email });
      return true;

    } catch (error) {
      this.logger.error('删除账号凭据失败', { email, error });
      await this.logAction(email, 'DELETE_CREDENTIALS', 'FAILED', error.message);
      throw error;
    }
  }

  /**
   * 备份凭据
   * @param {string} backupPath - 备份路径
   * @returns {Promise<boolean>} 备份是否成功
   */
  async backupCredentials(backupPath) {
    if (!this.isInitialized) {
      throw new Error('凭据存储未初始化');
    }

    try {
      this.logger.info('开始备份凭据', { backupPath });

      // 获取所有账号数据
      const accounts = await this.db.all(`
        SELECT * FROM accounts ORDER BY created_at
      `);

      // 解密并导出数据
      const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        accounts: []
      };

      for (const account of accounts) {
        try {
          const password = this.decryptPassword(account.encrypted_password, account.salt);
          
          let metadata = {};
          try {
            metadata = JSON.parse(account.metadata || '{}');
          } catch (parseError) {
            // 忽略解析错误
          }

          exportData.accounts.push({
            email: account.email,
            password: password,
            accountId: account.account_id,
            createdAt: account.created_at,
            lastVerified: account.last_verified,
            metadata: metadata
          });
        } catch (decryptError) {
          this.logger.warn('解密账号密码失败，跳过', { 
            email: account.email, 
            error: decryptError.message 
          });
        }
      }

      // 写入备份文件
      await fs.writeFile(backupPath, JSON.stringify(exportData, null, 2), 'utf8');

      this.logger.info('凭据备份完成', { 
        backupPath, 
        accountCount: exportData.accounts.length 
      });

      return true;

    } catch (error) {
      this.logger.error('备份凭据失败', { backupPath, error });
      throw error;
    }
  }

  /**
   * 恢复凭据
   * @param {string} backupPath - 备份路径
   * @returns {Promise<boolean>} 恢复是否成功
   */
  async restoreCredentials(backupPath) {
    if (!this.isInitialized) {
      throw new Error('凭据存储未初始化');
    }

    try {
      this.logger.info('开始恢复凭据', { backupPath });

      // 读取备份文件
      const backupData = await fs.readFile(backupPath, 'utf8');
      const importData = JSON.parse(backupData);

      if (!importData.accounts || !Array.isArray(importData.accounts)) {
        throw new Error('备份文件格式无效');
      }

      let successCount = 0;
      let failureCount = 0;

      // 恢复每个账号
      for (const accountData of importData.accounts) {
        try {
          await this.storeCredentials(
            accountData.email,
            accountData.password,
            {
              accountId: accountData.accountId,
              createdAt: accountData.createdAt,
              lastVerified: accountData.lastVerified,
              ...accountData.metadata
            }
          );
          successCount++;
        } catch (error) {
          this.logger.warn('恢复单个账号失败', { 
            email: accountData.email, 
            error: error.message 
          });
          failureCount++;
        }
      }

      this.logger.info('凭据恢复完成', { 
        backupPath, 
        successCount, 
        failureCount,
        totalCount: importData.accounts.length
      });

      return true;

    } catch (error) {
      this.logger.error('恢复凭据失败', { backupPath, error });
      throw error;
    }
  }

  /**
   * 记录操作日志
   * @param {string} email - 邮箱地址
   * @param {string} action - 操作类型
   * @param {string} status - 状态
   * @param {string} errorMessage - 错误消息
   */
  async logAction(email, action, status, errorMessage = null) {
    try {
      await this.db.run(`
        INSERT INTO registration_logs (email, action, status, error_message)
        VALUES (?, ?, ?, ?)
      `, [email, action, status, errorMessage]);
    } catch (error) {
      this.logger.error('记录操作日志失败', { email, action, status, error });
    }
  }

  /**
   * 获取操作日志
   * @param {string} email - 邮箱地址（可选）
   * @param {number} limit - 限制数量
   * @returns {Promise<Array>} 日志列表
   */
  async getActionLogs(email = null, limit = 100) {
    if (!this.isInitialized) {
      throw new Error('凭据存储未初始化');
    }

    try {
      let query = `
        SELECT * FROM registration_logs 
        ${email ? 'WHERE email = ?' : ''}
        ORDER BY timestamp DESC 
        LIMIT ?
      `;
      
      const params = email ? [email, limit] : [limit];
      const rows = await this.db.all(query, params);

      return rows;

    } catch (error) {
      this.logger.error('获取操作日志失败', { email, error });
      throw error;
    }
  }

  /**
   * 获取统计信息
   * @returns {Promise<Object>} 统计信息
   */
  async getStatistics() {
    if (!this.isInitialized) {
      throw new Error('凭据存储未初始化');
    }

    try {
      const stats = {};

      // 总账号数
      const totalResult = await this.db.get(`
        SELECT COUNT(*) as total FROM accounts
      `);
      stats.totalAccounts = totalResult.total;

      // 按提供商统计
      const providerStats = await this.db.all(`
        SELECT 
          JSON_EXTRACT(metadata, '$.provider') as provider,
          COUNT(*) as count
        FROM accounts 
        WHERE JSON_EXTRACT(metadata, '$.provider') IS NOT NULL
        GROUP BY JSON_EXTRACT(metadata, '$.provider')
      `);
      stats.byProvider = Object.fromEntries(
        providerStats.map(row => [row.provider, row.count])
      );

      // 最近注册统计
      const recentResult = await this.db.get(`
        SELECT COUNT(*) as recent 
        FROM accounts 
        WHERE created_at > datetime('now', '-7 days')
      `);
      stats.recentRegistrations = recentResult.recent;

      return stats;

    } catch (error) {
      this.logger.error('获取统计信息失败', error);
      throw error;
    }
  }

  /**
   * 关闭数据库连接
   */
  async close() {
    try {
      if (this.db) {
        await this.db.close();
        this.db = null;
      }
      this.isInitialized = false;
      this.logger.info('凭据存储系统已关闭');
    } catch (error) {
      this.logger.error('关闭凭据存储系统失败', error);
    }
  }
}

/**
 * 创建凭据存储
 * @param {Object} options - 选项
 * @returns {CredentialStore} 凭据存储实例
 */
export function createCredentialStore(options = {}) {
  return new CredentialStore(options);
}