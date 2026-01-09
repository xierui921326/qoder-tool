/**
 * 核心数据类型定义
 */

/**
 * 注册配置类
 */
export class RegistrationConfig {
  /**
   * @param {EmailConfig} emailConfig - 邮件配置
   * @param {UserProfile} userProfile - 用户配置文件
   * @param {AutomationSettings} automationSettings - 自动化设置
   * @param {RetrySettings} retrySettings - 重试设置
   */
  constructor(emailConfig, userProfile, automationSettings, retrySettings) {
    this.emailConfig = emailConfig;
    this.userProfile = userProfile;
    this.automationSettings = automationSettings;
    this.retrySettings = retrySettings;
  }
}

/**
 * 邮件配置类
 */
export class EmailConfig {
  /**
   * @param {string} imapServer - IMAP服务器地址
   * @param {number} imapPort - IMAP端口
   * @param {string} username - 用户名
   * @param {string} password - 密码
   * @param {boolean} useSSL - 是否使用SSL
   * @param {string} folder - 邮件文件夹，默认为INBOX
   */
  constructor(imapServer, imapPort, username, password, useSSL, folder = 'INBOX') {
    this.imapServer = imapServer;
    this.imapPort = imapPort;
    this.username = username;
    this.password = password;
    this.useSSL = useSSL;
    this.folder = folder;
  }
}

/**
 * 用户配置文件类
 */
export class UserProfile {
  /**
   * @param {string} firstName - 名字
   * @param {string} lastName - 姓氏
   * @param {string|null} company - 公司名称
   * @param {string} country - 国家
   * @param {string} timezone - 时区
   */
  constructor(firstName, lastName, company, country, timezone) {
    this.firstName = firstName;
    this.lastName = lastName;
    this.company = company;
    this.country = country;
    this.timezone = timezone;
  }
}

/**
 * 自动化设置类
 */
export class AutomationSettings {
  /**
   * @param {boolean} headless - 是否使用无头模式
   * @param {number} timeout - 超时时间（毫秒）
   * @param {boolean} screenshots - 是否启用截图
   * @param {string} browserType - 浏览器类型
   */
  constructor(headless = true, timeout = 30000, screenshots = false, browserType = 'chromium') {
    this.headless = headless;
    this.timeout = timeout;
    this.screenshots = screenshots;
    this.browserType = browserType;
  }
}

/**
 * 重试设置类
 */
export class RetrySettings {
  /**
   * @param {number} maxRetries - 最大重试次数
   * @param {number} baseDelay - 基础延迟时间（毫秒）
   * @param {number} maxDelay - 最大延迟时间（毫秒）
   * @param {number} backoffMultiplier - 退避乘数
   */
  constructor(maxRetries = 3, baseDelay = 1000, maxDelay = 30000, backoffMultiplier = 2) {
    this.maxRetries = maxRetries;
    this.baseDelay = baseDelay;
    this.maxDelay = maxDelay;
    this.backoffMultiplier = backoffMultiplier;
  }
}

/**
 * 注册结果类
 */
export class RegistrationResult {
  /**
   * @param {string} email - 邮箱地址
   * @param {boolean} success - 是否成功
   * @param {string|null} accountId - 账号ID
   * @param {string|null} password - 密码
   * @param {string|null} errorMessage - 错误消息
   * @param {Date} timestamp - 时间戳
   * @param {boolean} verificationCompleted - 是否完成验证
   */
  constructor(email, success, accountId = null, password = null, errorMessage = null, timestamp = new Date(), verificationCompleted = false) {
    this.email = email;
    this.success = success;
    this.accountId = accountId;
    this.password = password;
    this.errorMessage = errorMessage;
    this.timestamp = timestamp;
    this.verificationCompleted = verificationCompleted;
  }
}

/**
 * 批量结果类
 */
export class BatchResult {
  /**
   * @param {RegistrationResult[]} results - 注册结果数组
   * @param {number} totalCount - 总数
   * @param {number} successCount - 成功数
   * @param {number} failureCount - 失败数
   * @param {Date} startTime - 开始时间
   * @param {Date} endTime - 结束时间
   */
  constructor(results, totalCount, successCount, failureCount, startTime, endTime) {
    this.results = results;
    this.totalCount = totalCount;
    this.successCount = successCount;
    this.failureCount = failureCount;
    this.startTime = startTime;
    this.endTime = endTime;
    this.duration = endTime - startTime;
  }
}

/**
 * 账号凭据类
 */
export class AccountCredentials {
  /**
   * @param {string} email - 邮箱地址
   * @param {string} password - 密码
   * @param {string|null} accountId - 账号ID
   * @param {Date} createdAt - 创建时间
   * @param {Date|null} lastVerified - 最后验证时间
   * @param {Object} metadata - 元数据
   */
  constructor(email, password, accountId = null, createdAt = new Date(), lastVerified = null, metadata = {}) {
    this.email = email;
    this.password = password;
    this.accountId = accountId;
    this.createdAt = createdAt;
    this.lastVerified = lastVerified;
    this.metadata = metadata;
  }
}

/**
 * 验证邮件类
 */
export class VerificationEmail {
  /**
   * @param {string} subject - 邮件主题
   * @param {string} content - 邮件内容
   * @param {string} verificationLink - 验证链接
   * @param {Date} receivedAt - 接收时间
   */
  constructor(subject, content, verificationLink, receivedAt = new Date()) {
    this.subject = subject;
    this.content = content;
    this.verificationLink = verificationLink;
    this.receivedAt = receivedAt;
  }
}

/**
 * 注册状态枚举
 */
export const RegistrationStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  EMAIL_VERIFICATION_REQUIRED: 'email_verification_required',
  COMPLETED: 'completed',
  FAILED: 'failed',
  TIMEOUT: 'timeout',
  CAPTCHA_REQUIRED: 'captcha_required'
};

/**
 * 错误类型枚举
 */
export const ErrorType = {
  NETWORK_ERROR: 'network_error',
  BROWSER_ERROR: 'browser_error',
  EMAIL_ERROR: 'email_error',
  VALIDATION_ERROR: 'validation_error',
  TIMEOUT_ERROR: 'timeout_error',
  CAPTCHA_ERROR: 'captcha_error',
  RATE_LIMIT_ERROR: 'rate_limit_error',
  UNKNOWN_ERROR: 'unknown_error'
};