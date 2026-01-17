/**
 * Tauri API 客户端
 * 用于与桌面应用的 HTTP API 通信
 * 所有数据操作都通过此客户端进行
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger({ component: 'ApiClient' });

/**
 * API 客户端配置
 */
const DEFAULT_CONFIG = {
  baseUrl: 'http://127.0.0.1:9527',
  timeout: 10000,
};

/**
 * API 客户端类
 */
export class ApiClient {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.isConnected = false;
  }

  /**
   * 发送 HTTP 请求
   * @param {string} method - HTTP 方法
   * @param {string} path - API 路径
   * @param {Object} data - 请求数据
   * @returns {Promise<Object>} 响应数据
   */
  async request(method, path, data = null) {
    const url = `${this.config.baseUrl}${path}`;
    
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(data);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
      options.signal = controller.signal;

      const response = await fetch(url, options);
      clearTimeout(timeoutId);

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || '请求失败');
      }

      return result.data;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('请求超时');
      }
      throw error;
    }
  }

  /**
   * 检查 API 服务器是否可用
   * @returns {Promise<boolean>} 是否可用
   */
  async checkHealth() {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      const data = await response.json();
      this.isConnected = data.status === 'ok';
      return this.isConnected;
    } catch (error) {
      this.isConnected = false;
      return false;
    }
  }

  /**
   * 等待 API 服务器就绪
   * @param {number} maxRetries - 最大重试次数
   * @param {number} retryDelay - 重试间隔（毫秒）
   * @returns {Promise<boolean>} 是否就绪
   */
  async waitForReady(maxRetries = 10, retryDelay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
      if (await this.checkHealth()) {
        logger.info('API 服务器已就绪');
        return true;
      }
      logger.debug(`等待 API 服务器就绪... (${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
    logger.error('API 服务器连接超时');
    return false;
  }

  // ============ 邮箱配置 API ============

  /**
   * 获取所有邮箱配置
   * @returns {Promise<Array>} 邮箱配置列表
   */
  async getEmailConfigs() {
    return this.request('GET', '/api/email-configs');
  }

  /**
   * 根据 ID 获取邮箱配置
   * @param {string} id - 配置 ID
   * @returns {Promise<Object>} 邮箱配置
   */
  async getEmailConfigById(id) {
    return this.request('GET', `/api/email-configs/${id}`);
  }

  // ============ 账号 API ============

  /**
   * 获取所有账号
   * @returns {Promise<Array>} 账号列表
   */
  async getAccounts() {
    return this.request('GET', '/api/accounts');
  }

  /**
   * 创建账号（保存注册结果）
   * @param {Object} account - 账号信息
   * @returns {Promise<Object>} 创建的账号
   */
  async createAccount(account) {
    return this.request('POST', '/api/accounts', account);
  }

  /**
   * 根据 ID 获取账号
   * @param {string} id - 账号 ID
   * @returns {Promise<Object>} 账号信息
   */
  async getAccountById(id) {
    return this.request('GET', `/api/accounts/${id}`);
  }

  // ============ 日志 API ============

  /**
   * 获取日志
   * @returns {Promise<Array>} 日志列表
   */
  async getLogs() {
    return this.request('GET', '/api/logs');
  }

  /**
   * 创建日志
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @returns {Promise<Object>} 创建的日志
   */
  async createLog(level, message) {
    return this.request('POST', '/api/logs', { level, message });
  }

  /**
   * 记录信息日志
   * @param {string} message - 日志消息
   */
  async logInfo(message) {
    try {
      await this.createLog('info', message);
    } catch (error) {
      logger.error('写入日志失败', { error: error.message });
    }
  }

  /**
   * 记录错误日志
   * @param {string} message - 日志消息
   */
  async logError(message) {
    try {
      await this.createLog('error', message);
    } catch (error) {
      logger.error('写入日志失败', { error: error.message });
    }
  }
}

/**
 * 创建 API 客户端实例
 * @param {Object} config - 配置
 * @returns {ApiClient} API 客户端实例
 */
export function createApiClient(config = {}) {
  return new ApiClient(config);
}

/**
 * 全局 API 客户端实例
 */
export const globalApiClient = new ApiClient();
