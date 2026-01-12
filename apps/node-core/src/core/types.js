/**
 * 核心类型定义
 * 定义系统中使用的数据类型和结构
 */

/**
 * 账号凭据类
 */
export class AccountCredentials {
  constructor(email, password, accountId = null, createdAt = null, lastVerified = null, metadata = {}) {
    this.email = email;
    this.password = password;
    this.accountId = accountId;
    this.createdAt = createdAt || new Date();
    this.lastVerified = lastVerified;
    this.metadata = metadata;
  }

  /**
   * 转换为JSON对象
   * @returns {Object} JSON对象
   */
  toJSON() {
    return {
      email: this.email,
      accountId: this.accountId,
      createdAt: this.createdAt,
      lastVerified: this.lastVerified,
      metadata: this.metadata
      // 注意：不包含密码以确保安全
    };
  }

  /**
   * 从JSON对象创建实例
   * @param {Object} json - JSON对象
   * @param {string} password - 密码（需要单独提供）
   * @returns {AccountCredentials} 账号凭据实例
   */
  static fromJSON(json, password) {
    return new AccountCredentials(
      json.email,
      password,
      json.accountId,
      json.createdAt ? new Date(json.createdAt) : null,
      json.lastVerified ? new Date(json.lastVerified) : null,
      json.metadata || {}
    );
  }

  /**
   * 验证凭据完整性
   * @returns {boolean} 是否有效
   */
  isValid() {
    return !!(this.email && this.password && this.email.includes('@'));
  }

  /**
   * 获取域名
   * @returns {string} 邮箱域名
   */
  getDomain() {
    return this.email.split('@')[1];
  }

  /**
   * 是否已验证
   * @returns {boolean} 是否已验证
   */
  isVerified() {
    return !!this.lastVerified;
  }

  /**
   * 获取账号年龄（天数）
   * @returns {number} 账号年龄
   */
  getAgeInDays() {
    if (!this.createdAt) return 0;
    const now = new Date();
    const diffTime = Math.abs(now - this.createdAt);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
}

/**
 * 验证邮件类
 */
export class VerificationEmail {
  constructor(subject, content, verificationLink, receivedAt = null) {
    this.subject = subject;
    this.content = content;
    this.verificationLink = verificationLink;
    this.receivedAt = receivedAt || new Date();
  }

  /**
   * 转换为JSON对象
   * @returns {Object} JSON对象
   */
  toJSON() {
    return {
      subject: this.subject,
      content: this.content,
      verificationLink: this.verificationLink,
      receivedAt: this.receivedAt
    };
  }

  /**
   * 从JSON对象创建实例
   * @param {Object} json - JSON对象
   * @returns {VerificationEmail} 验证邮件实例
   */
  static fromJSON(json) {
    return new VerificationEmail(
      json.subject,
      json.content,
      json.verificationLink,
      json.receivedAt ? new Date(json.receivedAt) : null
    );
  }

  /**
   * 验证邮件是否有效
   * @returns {boolean} 是否有效
   */
  isValid() {
    return !!(this.subject && this.content && this.verificationLink);
  }

  /**
   * 获取邮件年龄（分钟）
   * @returns {number} 邮件年龄
   */
  getAgeInMinutes() {
    if (!this.receivedAt) return 0;
    const now = new Date();
    const diffTime = Math.abs(now - this.receivedAt);
    return Math.floor(diffTime / (1000 * 60));
  }

  /**
   * 是否为新邮件（5分钟内）
   * @returns {boolean} 是否为新邮件
   */
  isRecent() {
    return this.getAgeInMinutes() <= 5;
  }
}

/**
 * 注册结果类
 */
export class RegistrationResult {
  constructor(email, success = false, accountId = null, error = null, metadata = {}) {
    this.email = email;
    this.success = success;
    this.accountId = accountId;
    this.error = error;
    this.metadata = metadata;
    this.timestamp = new Date();
  }

  /**
   * 转换为JSON对象
   * @returns {Object} JSON对象
   */
  toJSON() {
    return {
      email: this.email,
      success: this.success,
      accountId: this.accountId,
      error: this.error,
      metadata: this.metadata,
      timestamp: this.timestamp
    };
  }

  /**
   * 从JSON对象创建实例
   * @param {Object} json - JSON对象
   * @returns {RegistrationResult} 注册结果实例
   */
  static fromJSON(json) {
    const result = new RegistrationResult(
      json.email,
      json.success,
      json.accountId,
      json.error,
      json.metadata || {}
    );
    result.timestamp = json.timestamp ? new Date(json.timestamp) : new Date();
    return result;
  }

  /**
   * 创建成功结果
   * @param {string} email - 邮箱地址
   * @param {string} accountId - 账号ID
   * @param {Object} metadata - 元数据
   * @returns {RegistrationResult} 成功结果
   */
  static success(email, accountId, metadata = {}) {
    return new RegistrationResult(email, true, accountId, null, metadata);
  }

  /**
   * 创建失败结果
   * @param {string} email - 邮箱地址
   * @param {string} error - 错误信息
   * @param {Object} metadata - 元数据
   * @returns {RegistrationResult} 失败结果
   */
  static failure(email, error, metadata = {}) {
    return new RegistrationResult(email, false, null, error, metadata);
  }

  /**
   * 获取结果状态文本
   * @returns {string} 状态文本
   */
  getStatusText() {
    return this.success ? '成功' : '失败';
  }

  /**
   * 获取详细信息
   * @returns {string} 详细信息
   */
  getDetails() {
    if (this.success) {
      return `账号 ${this.email} 注册成功，账号ID: ${this.accountId}`;
    } else {
      return `账号 ${this.email} 注册失败: ${this.error}`;
    }
  }
}

/**
 * 账号状态枚举
 */
export const AccountStatus = {
  UNKNOWN: 'unknown',
  PENDING: 'pending',
  REGISTERED: 'registered',
  VERIFIED: 'verified',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  DELETED: 'deleted',
  ERROR: 'error'
};

/**
 * 任务状态枚举
 */
export const TaskStatus = {
  CREATED: 'created',
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  TIMEOUT: 'timeout'
};

/**
 * 任务类型枚举
 */
export const TaskType = {
  REGISTER_ACCOUNT: 'register_account',
  VERIFY_EMAIL: 'verify_email',
  BATCH_REGISTER: 'batch_register',
  EXPORT_DATA: 'export_data',
  IMPORT_DATA: 'import_data',
  BACKUP_DATA: 'backup_data',
  RESTORE_DATA: 'restore_data'
};

/**
 * 任务结果类
 */
export class TaskResult {
  constructor(taskId, status, result = null, error = null, metadata = {}) {
    this.taskId = taskId;
    this.status = status;
    this.result = result;
    this.error = error;
    this.metadata = metadata;
    this.timestamp = new Date();
  }

  /**
   * 转换为JSON对象
   * @returns {Object} JSON对象
   */
  toJSON() {
    return {
      taskId: this.taskId,
      status: this.status,
      result: this.result,
      error: this.error,
      metadata: this.metadata,
      timestamp: this.timestamp
    };
  }

  /**
   * 从JSON对象创建实例
   * @param {Object} json - JSON对象
   * @returns {TaskResult} 任务结果实例
   */
  static fromJSON(json) {
    const result = new TaskResult(
      json.taskId,
      json.status,
      json.result,
      json.error,
      json.metadata || {}
    );
    result.timestamp = json.timestamp ? new Date(json.timestamp) : new Date();
    return result;
  }

  /**
   * 是否成功
   * @returns {boolean} 是否成功
   */
  isSuccess() {
    return this.status === TaskStatus.COMPLETED && !this.error;
  }

  /**
   * 是否失败
   * @returns {boolean} 是否失败
   */
  isFailure() {
    return this.status === TaskStatus.FAILED || !!this.error;
  }

  /**
   * 是否正在运行
   * @returns {boolean} 是否正在运行
   */
  isRunning() {
    return [TaskStatus.QUEUED, TaskStatus.RUNNING].includes(this.status);
  }

  /**
   * 是否已完成（成功或失败）
   * @returns {boolean} 是否已完成
   */
  isCompleted() {
    return [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED, TaskStatus.TIMEOUT].includes(this.status);
  }
}

/**
 * 批量操作结果类
 */
export class BatchResult {
  constructor(total = 0, successful = 0, failed = 0, results = []) {
    this.total = total;
    this.successful = successful;
    this.failed = failed;
    this.results = results;
    this.timestamp = new Date();
  }

  /**
   * 添加结果
   * @param {RegistrationResult|TaskResult} result - 结果
   */
  addResult(result) {
    this.results.push(result);
    this.total++;
    
    if (result.success || result.isSuccess?.()) {
      this.successful++;
    } else {
      this.failed++;
    }
  }

  /**
   * 获取成功率
   * @returns {number} 成功率（百分比）
   */
  getSuccessRate() {
    return this.total > 0 ? (this.successful / this.total * 100) : 0;
  }

  /**
   * 获取失败率
   * @returns {number} 失败率（百分比）
   */
  getFailureRate() {
    return this.total > 0 ? (this.failed / this.total * 100) : 0;
  }

  /**
   * 转换为JSON对象
   * @returns {Object} JSON对象
   */
  toJSON() {
    return {
      total: this.total,
      successful: this.successful,
      failed: this.failed,
      successRate: this.getSuccessRate(),
      failureRate: this.getFailureRate(),
      results: this.results.map(r => r.toJSON ? r.toJSON() : r),
      timestamp: this.timestamp
    };
  }

  /**
   * 从JSON对象创建实例
   * @param {Object} json - JSON对象
   * @returns {BatchResult} 批量结果实例
   */
  static fromJSON(json) {
    const result = new BatchResult(
      json.total,
      json.successful,
      json.failed,
      json.results || []
    );
    result.timestamp = json.timestamp ? new Date(json.timestamp) : new Date();
    return result;
  }

  /**
   * 生成摘要报告
   * @returns {string} 摘要报告
   */
  getSummary() {
    const successRate = this.getSuccessRate().toFixed(1);
    return `批量操作完成: 总计 ${this.total} 个，成功 ${this.successful} 个，失败 ${this.failed} 个，成功率 ${successRate}%`;
  }
}

/**
 * 配置类
 */
export class Config {
  constructor(data = {}) {
    this.data = { ...data };
    this.timestamp = new Date();
  }

  /**
   * 获取配置值
   * @param {string} key - 配置键
   * @param {any} defaultValue - 默认值
   * @returns {any} 配置值
   */
  get(key, defaultValue = null) {
    return this.data[key] ?? defaultValue;
  }

  /**
   * 设置配置值
   * @param {string} key - 配置键
   * @param {any} value - 配置值
   */
  set(key, value) {
    this.data[key] = value;
    this.timestamp = new Date();
  }

  /**
   * 检查配置键是否存在
   * @param {string} key - 配置键
   * @returns {boolean} 是否存在
   */
  has(key) {
    return key in this.data;
  }

  /**
   * 删除配置键
   * @param {string} key - 配置键
   * @returns {boolean} 是否成功删除
   */
  delete(key) {
    if (this.has(key)) {
      delete this.data[key];
      this.timestamp = new Date();
      return true;
    }
    return false;
  }

  /**
   * 获取所有配置键
   * @returns {string[]} 配置键数组
   */
  keys() {
    return Object.keys(this.data);
  }

  /**
   * 获取所有配置值
   * @returns {any[]} 配置值数组
   */
  values() {
    return Object.values(this.data);
  }

  /**
   * 清空所有配置
   */
  clear() {
    this.data = {};
    this.timestamp = new Date();
  }

  /**
   * 合并配置
   * @param {Object|Config} other - 其他配置
   */
  merge(other) {
    const otherData = other instanceof Config ? other.data : other;
    this.data = { ...this.data, ...otherData };
    this.timestamp = new Date();
  }

  /**
   * 转换为JSON对象
   * @returns {Object} JSON对象
   */
  toJSON() {
    return {
      data: this.data,
      timestamp: this.timestamp
    };
  }

  /**
   * 从JSON对象创建实例
   * @param {Object} json - JSON对象
   * @returns {Config} 配置实例
   */
  static fromJSON(json) {
    const config = new Config(json.data || {});
    config.timestamp = json.timestamp ? new Date(json.timestamp) : new Date();
    return config;
  }
}