/**
 * 核心接口定义
 * 这些接口定义了系统各组件的标准行为
 */

/**
 * 账号管理器接口
 * 负责协调整个注册流程
 */
export class IAccountManager {
  /**
   * 注册单个账号
   * @param {string} email - 邮箱地址
   * @param {RegistrationConfig} config - 注册配置
   * @returns {Promise<RegistrationResult>} 注册结果
   */
  async registerSingleAccount(_email, _config) {
    throw new Error('方法必须被实现');
  }

  /**
   * 批量注册账号
   * @param {string[]} emails - 邮箱地址数组
   * @param {RegistrationConfig} config - 注册配置
   * @returns {Promise<BatchResult>} 批量注册结果
   */
  async registerBatchAccounts(_emails, _config) {
    throw new Error('方法必须被实现');
  }

  /**
   * 获取存储的凭据
   * @param {string} email - 邮箱地址
   * @returns {Promise<AccountCredentials|null>} 账号凭据或null
   */
  async getStoredCredentials(_email) {
    throw new Error('方法必须被实现');
  }

  /**
   * 导出凭据
   * @param {string} outputPath - 输出路径
   * @returns {Promise<boolean>} 是否成功
   */
  async exportCredentials(_outputPath) {
    throw new Error('方法必须被实现');
  }
}

/**
 * 注册机器人接口
 * 负责Web自动化和表单提交
 */
export class IRegistrationBot {
  /**
   * 导航到注册页面
   * @returns {Promise<boolean>} 是否成功
   */
  async navigateToRegistration() {
    throw new Error('方法必须被实现');
  }

  /**
   * 填写注册表单
   * @param {string} email - 邮箱地址
   * @param {string} password - 密码
   * @param {UserProfile} profile - 用户配置文件
   * @returns {Promise<boolean>} 是否成功
   */
  async fillRegistrationForm(_email, _password, _profile) {
    throw new Error('方法必须被实现');
  }

  /**
   * 处理验证码
   * @returns {Promise<boolean>} 是否成功
   */
  async handleCaptcha() {
    throw new Error('方法必须被实现');
  }

  /**
   * 提交注册
   * @returns {Promise<string>} 注册状态
   */
  async submitRegistration() {
    throw new Error('方法必须被实现');
  }

  /**
   * 检测注册错误
   * @returns {Promise<string|null>} 错误消息或null
   */
  async detectRegistrationErrors() {
    throw new Error('方法必须被实现');
  }

  /**
   * 关闭浏览器
   * @returns {Promise<void>}
   */
  async close() {
    throw new Error('方法必须被实现');
  }
}

/**
 * 邮件处理器接口
 * 负责邮件检索和验证链接处理
 */
export class IEmailProcessor {
  /**
   * 连接到邮箱
   * @param {EmailConfig} emailConfig - 邮件配置
   * @returns {Promise<boolean>} 是否成功连接
   */
  async connectToMailbox(_emailConfig) {
    throw new Error('方法必须被实现');
  }

  /**
   * 等待验证邮件
   * @param {string} email - 邮箱地址
   * @param {number} timeout - 超时时间（毫秒）
   * @returns {Promise<VerificationEmail|null>} 验证邮件或null
   */
  async waitForVerificationEmail(_email, _timeout) {
    throw new Error('方法必须被实现');
  }

  /**
   * 提取验证链接
   * @param {string} emailContent - 邮件内容
   * @returns {Promise<string|null>} 验证链接或null
   */
  async extractVerificationLink(_emailContent) {
    throw new Error('方法必须被实现');
  }

  /**
   * 完成邮件验证
   * @param {string} verificationLink - 验证链接
   * @returns {Promise<boolean>} 是否成功
   */
  async completeEmailVerification(_verificationLink) {
    throw new Error('方法必须被实现');
  }

  /**
   * 断开邮箱连接
   * @returns {Promise<void>}
   */
  async disconnect() {
    throw new Error('方法必须被实现');
  }
}

/**
 * 凭据存储接口
 * 负责账号凭据的安全存储和管理
 */
export class ICredentialStore {
  /**
   * 存储凭据
   * @param {string} email - 邮箱地址
   * @param {string} password - 密码
   * @param {Object} metadata - 元数据
   * @returns {Promise<boolean>} 是否成功
   */
  async storeCredentials(_email, _password, _metadata) {
    throw new Error('方法必须被实现');
  }

  /**
   * 检索凭据
   * @param {string} email - 邮箱地址
   * @returns {Promise<AccountCredentials|null>} 账号凭据或null
   */
  async retrieveCredentials(_email) {
    throw new Error('方法必须被实现');
  }

  /**
   * 列出所有账号
   * @returns {Promise<string[]>} 邮箱地址数组
   */
  async listAllAccounts() {
    throw new Error('方法必须被实现');
  }

  /**
   * 备份凭据
   * @param {string} backupPath - 备份路径
   * @returns {Promise<boolean>} 是否成功
   */
  async backupCredentials(_backupPath) {
    throw new Error('方法必须被实现');
  }

  /**
   * 恢复凭据
   * @param {string} backupPath - 备份路径
   * @returns {Promise<boolean>} 是否成功
   */
  async restoreCredentials(_backupPath) {
    throw new Error('方法必须被实现');
  }

  /**
   * 关闭数据库连接
   * @returns {Promise<void>}
   */
  async close() {
    throw new Error('方法必须被实现');
  }
}

/**
 * 日志记录器接口
 * 负责系统日志记录
 */
export class ILogger {
  /**
   * 记录信息日志
   * @param {string} message - 消息
   * @param {Object} metadata - 元数据
   */
  info(message, _metadata = {}) {
    throw new Error('方法必须被实现');
  }

  /**
   * 记录警告日志
   * @param {string} message - 消息
   * @param {Object} metadata - 元数据
   */
  warn(message, _metadata = {}) {
    throw new Error('方法必须被实现');
  }

  /**
   * 记录错误日志
   * @param {string} message - 消息
   * @param {Error|Object} error - 错误对象或元数据
   */
  error(message, _error = {}) {
    throw new Error('方法必须被实现');
  }

  /**
   * 记录调试日志
   * @param {string} message - 消息
   * @param {Object} metadata - 元数据
   */
  debug(message, _metadata = {}) {
    throw new Error('方法必须被实现');
  }
}