/**
 * 凭据存储管理器
 * 提供安全的账号凭据存储和检索功能
 */
import { ICredentialStore } from './interfaces.js';
import { AccountCredentials } from './types.js';
import { DatabaseManager } from './database.js';
import { 
  generateSalt, 
  deriveKey, 
  encrypt, 
  decrypt, 
  generateStrongPassword,
  validatePasswordStrength 
} from '../utils/crypto.js';
import { createLogger } from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

const logger = createLogger();

/**
 * 凭据存储实现类
 */
export class CredentialStore extends ICredentialStore {
  constructor(dbManager = null, masterPassword = null) {
    super();
    this.dbManager = dbManager || new DatabaseManager();
    this.masterPassword = masterPassword || process.env.QODER_MASTER_PASSWORD || 'default-master-key';
    this.isInitialized = false;
  }

  /**
   * 初始化凭据存储
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      // 连接数据库
      if (!this.dbManager.isConnected) {
        await this.dbManager.connect();
      }

      // 验证主密码强度
      const passwordStrength = validatePasswordStrength(this.masterPassword);
      if (!passwordStrength.isStrong) {
        logger.warn('主密码强度不足', { 
          feedback: passwordStrength.feedback,
          score: passwordStrength.score 
        });
      }

      this.isInitialized = true;
      logger.info('凭据存储初始化完成');

    } catch (error) {
      logger.error('凭据存储初始化失败', error);
      throw new Error(`凭据存储初始化失败: ${error.message}`);
    }
  }

  /**
   * 存储凭据
   * @param {string} email - 邮箱地址
   * @param {string} password - 密码
   * @param {Object} metadata - 元数据
   * @returns {Promise<boolean>} 是否成功
   */
  async storeCredentials(email, password, metadata = {}) {
    await this.ensureInitialized();

    try {
      // 验证输入参数
      if (!email || !email.includes('@')) {
        throw new Error('无效的邮箱地址');
      }

      if (!password || password.length < 6) {
        throw new Error('密码长度至少为6位');
      }

      // 生成盐值
      const salt = generateSalt();
      
      // 派生加密密钥
      const encryptionKey = await deriveKey(this.masterPassword, salt);
      
      // 加密密码
      const encryptedPassword = encrypt(password, encryptionKey);
      
      // 序列化加密数据
      const encryptedBlob = Buffer.from(JSON.stringify(encryptedPassword));
      
      // 序列化元数据
      const metadataJson = JSON.stringify({
        ...metadata,
        passwordLength: password.length,
        encryptedAt: new Date().toISOString()
      });

      // 存储到数据库
      await this.dbManager.transaction(async (db) => {
        // 检查是否已存在
        const existing = await db.get(
          'SELECT id FROM accounts WHERE email = ?',
          [email]
        );

        if (existing) {
          // 更新现有记录
          await db.run(`
            UPDATE accounts 
            SET encrypted_password = ?, salt = ?, metadata = ?, last_verified = CURRENT_TIMESTAMP
            WHERE email = ?
          `, [encryptedBlob, salt, metadataJson, email]);

          logger.info('凭据更新成功', { email });
        } else {
          // 插入新记录
          await db.run(`
            INSERT INTO accounts (email, encrypted_password, salt, metadata)
            VALUES (?, ?, ?, ?)
          `, [email, encryptedBlob, salt, metadataJson]);

          logger.info('凭据存储成功', { email });
        }

        // 记录操作日志
        await this.logOperation(db, email, 'store_credentials', 'success');
      });

      return true;

    } catch (error) {
      logger.error('存储凭据失败', { email, error: error.message });
      
      // 记录错误日志
      try {
        await this.logOperation(this.dbManager, email, 'store_credentials', 'failed', error.message);
      } catch (logError) {
        logger.error('记录操作日志失败', logError);
      }

      throw new Error(`存储凭据失败: ${error.message}`);
    }
  }

  /**
   * 检索凭据
   * @param {string} email - 邮箱地址
   * @returns {Promise<AccountCredentials|null>} 账号凭据或null
   */
  async retrieveCredentials(email) {
    await this.ensureInitialized();

    try {
      // 从数据库查询
      const record = await this.dbManager.get(`
        SELECT email, encrypted_password, account_id, created_at, last_verified, metadata, salt
        FROM accounts 
        WHERE email = ?
      `, [email]);

      if (!record) {
        logger.debug('未找到凭据', { email });
        return null;
      }

      // 派生解密密钥
      const encryptionKey = await deriveKey(this.masterPassword, record.salt);
      
      // 解密密码
      const encryptedData = JSON.parse(record.encrypted_password.toString());
      const decryptedPassword = decrypt(encryptedData, encryptionKey);
      
      // 解析元数据
      const metadata = record.metadata ? JSON.parse(record.metadata) : {};

      // 记录操作日志
      await this.logOperation(this.dbManager, email, 'retrieve_credentials', 'success');

      // 创建凭据对象
      return new AccountCredentials(
        record.email,
        decryptedPassword,
        record.account_id,
        new Date(record.created_at),
        record.last_verified ? new Date(record.last_verified) : null,
        metadata
      );

    } catch (error) {
      logger.error('检索凭据失败', { email, error: error.message });
      
      // 记录错误日志
      try {
        await this.logOperation(this.dbManager, email, 'retrieve_credentials', 'failed', error.message);
      } catch (logError) {
        logger.error('记录操作日志失败', logError);
      }

      throw new Error(`检索凭据失败: ${error.message}`);
    }
  }

  /**
   * 列出所有账号
   * @returns {Promise<string[]>} 邮箱地址数组
   */
  async listAllAccounts() {
    await this.ensureInitialized();

    try {
      const records = await this.dbManager.all(`
        SELECT email, created_at, last_verified, account_id
        FROM accounts 
        ORDER BY created_at DESC
      `);

      logger.debug('列出所有账号', { count: records.length });
      
      return records.map(record => record.email);

    } catch (error) {
      logger.error('列出账号失败', error);
      throw new Error(`列出账号失败: ${error.message}`);
    }
  }

  /**
   * 获取账号详细信息（不包含密码）
   * @returns {Promise<Array>} 账号信息数组
   */
  async getAccountsInfo() {
    await this.ensureInitialized();

    try {
      const records = await this.dbManager.all(`
        SELECT email, account_id, created_at, last_verified, metadata
        FROM accounts 
        ORDER BY created_at DESC
      `);

      return records.map(record => ({
        email: record.email,
        accountId: record.account_id,
        createdAt: new Date(record.created_at),
        lastVerified: record.last_verified ? new Date(record.last_verified) : null,
        metadata: record.metadata ? JSON.parse(record.metadata) : {}
      }));

    } catch (error) {
      logger.error('获取账号信息失败', error);
      throw new Error(`获取账号信息失败: ${error.message}`);
    }
  }

  /**
   * 删除凭据
   * @param {string} email - 邮箱地址
   * @returns {Promise<boolean>} 是否成功
   */
  async deleteCredentials(email) {
    await this.ensureInitialized();

    try {
      await this.dbManager.transaction(async (db) => {
        // 先记录操作日志（在删除账号之前）
        await this.logOperation(db, email, 'delete_credentials', 'started');
        
        // 删除账号
        const result = await db.run(
          'DELETE FROM accounts WHERE email = ?',
          [email]
        );

        const success = result.changes > 0;
        
        if (success) {
          logger.info('凭据删除成功', { email });
        } else {
          logger.warn('未找到要删除的凭据', { email });
        }

        return success;
      });

      return true;

    } catch (error) {
      logger.error('删除凭据失败', { email, error: error.message });
      await this.logOperation(this.dbManager, email, 'delete_credentials', 'failed', error.message);
      throw new Error(`删除凭据失败: ${error.message}`);
    }
  }

  /**
   * 备份凭据
   * @param {string} backupPath - 备份路径
   * @returns {Promise<boolean>} 是否成功
   */
  async backupCredentials(backupPath) {
    await this.ensureInitialized();

    try {
      // 确保备份目录存在
      const backupDir = path.dirname(backupPath);
      await fs.mkdir(backupDir, { recursive: true });

      // 使用数据库管理器的备份功能
      await this.dbManager.backup(backupPath);

      // 创建备份元数据文件
      const metadataPath = backupPath + '.meta';
      const metadata = {
        backupTime: new Date().toISOString(),
        version: '1.0.0',
        accountCount: (await this.listAllAccounts()).length,
        dbStats: await this.dbManager.getStats()
      };

      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

      logger.info('凭据备份完成', { backupPath, metadata });
      return true;

    } catch (error) {
      logger.error('备份凭据失败', { backupPath, error: error.message });
      throw new Error(`备份凭据失败: ${error.message}`);
    }
  }

  /**
   * 恢复凭据
   * @param {string} backupPath - 备份路径
   * @returns {Promise<boolean>} 是否成功
   */
  async restoreCredentials(backupPath) {
    try {
      // 检查备份文件是否存在
      await fs.access(backupPath);

      // 关闭当前数据库连接
      if (this.dbManager.isConnected) {
        await this.dbManager.close();
      }

      // 备份当前数据库
      const currentDbPath = this.dbManager.dbPath;
      const backupCurrentPath = `${currentDbPath}.backup.${Date.now()}`;
      
      try {
        await fs.copyFile(currentDbPath, backupCurrentPath);
        logger.info('当前数据库已备份', { backupCurrentPath });
      } catch (error) {
        logger.warn('备份当前数据库失败', error);
      }

      // 恢复数据库文件
      await fs.copyFile(backupPath, currentDbPath);

      // 重新连接数据库
      await this.dbManager.connect();
      this.isInitialized = true;

      // 验证恢复的数据
      const accountCount = (await this.listAllAccounts()).length;
      
      logger.info('凭据恢复完成', { 
        backupPath, 
        accountCount,
        currentBackup: backupCurrentPath 
      });

      return true;

    } catch (error) {
      logger.error('恢复凭据失败', { backupPath, error: error.message });
      throw new Error(`恢复凭据失败: ${error.message}`);
    }
  }

  /**
   * 生成强密码
   * @param {number} length - 密码长度
   * @param {Object} options - 生成选项
   * @returns {string} 生成的密码
   */
  generatePassword(length = 16, options = {}) {
    return generateStrongPassword(length, options);
  }

  /**
   * 验证密码强度
   * @param {string} password - 密码
   * @returns {Object} 强度验证结果
   */
  validatePassword(password) {
    return validatePasswordStrength(password);
  }

  /**
   * 更新账号ID
   * @param {string} email - 邮箱地址
   * @param {string} accountId - 账号ID
   * @returns {Promise<boolean>} 是否成功
   */
  async updateAccountId(email, accountId) {
    await this.ensureInitialized();

    try {
      const result = await this.dbManager.run(
        'UPDATE accounts SET account_id = ?, last_verified = CURRENT_TIMESTAMP WHERE email = ?',
        [accountId, email]
      );

      const success = result.changes > 0;
      
      if (success) {
        logger.info('账号ID更新成功', { email, accountId });
        await this.logOperation(this.dbManager, email, 'update_account_id', 'success');
      } else {
        logger.warn('未找到要更新的账号', { email });
      }

      return success;

    } catch (error) {
      logger.error('更新账号ID失败', { email, error: error.message });
      await this.logOperation(this.dbManager, email, 'update_account_id', 'failed', error.message);
      throw new Error(`更新账号ID失败: ${error.message}`);
    }
  }

  /**
   * 获取存储统计信息
   * @returns {Promise<Object>} 统计信息
   */
  async getStats() {
    await this.ensureInitialized();
    return await this.dbManager.getStats();
  }

  /**
   * 记录操作日志
   * @param {DatabaseManager} db - 数据库管理器
   * @param {string} email - 邮箱地址
   * @param {string} action - 操作类型
   * @param {string} status - 状态
   * @param {string} errorMessage - 错误消息
   * @param {number} duration - 持续时间（毫秒）
   * @returns {Promise<void>}
   */
  async logOperation(db, email, action, status, errorMessage = null, duration = null) {
    try {
      await db.run(`
        INSERT INTO registration_logs (email, action, status, error_message, duration_ms)
        VALUES (?, ?, ?, ?, ?)
      `, [email, action, status, errorMessage, duration]);
    } catch (error) {
      logger.error('记录操作日志失败', { email, action, status, error: error.message });
    }
  }

  /**
   * 确保已初始化
   */
  async ensureInitialized() {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  /**
   * 关闭凭据存储
   * @returns {Promise<void>}
   */
  async close() {
    if (this.dbManager && this.dbManager.isConnected) {
      await this.dbManager.close();
    }
    this.isInitialized = false;
    logger.info('凭据存储已关闭');
  }

  /**
   * 健康检查
   * @returns {Promise<boolean>} 是否健康
   */
  async healthCheck() {
    try {
      await this.ensureInitialized();
      return await this.dbManager.healthCheck();
    } catch (error) {
      logger.error('凭据存储健康检查失败', error);
      return false;
    }
  }
}

/**
 * 创建凭据存储实例
 * @param {DatabaseManager} dbManager - 数据库管理器
 * @param {string} masterPassword - 主密码
 * @returns {CredentialStore} 凭据存储实例
 */
export function createCredentialStore(dbManager, masterPassword) {
  return new CredentialStore(dbManager, masterPassword);
}