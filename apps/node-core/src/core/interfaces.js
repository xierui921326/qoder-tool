/**
 * 核心接口定义
 * 定义系统中各个组件的接口规范
 */

/**
 * 邮件配置接口
 */
export class EmailConfig {
  constructor(imapServer, imapPort, username, password, useSSL = true, folder = 'INBOX') {
    this.imapServer = imapServer;
    this.imapPort = imapPort;
    this.username = username;
    this.password = password;
    this.useSSL = useSSL;
    this.folder = folder;
  }
}

/**
 * 凭据存储接口
 */
export class ICredentialStore {
  /**
   * 存储凭据
   * @param {string} email - 邮箱地址
   * @param {string} password - 密码
   * @param {Object} metadata - 元数据
   * @returns {Promise<boolean>} 是否成功
   */
  async storeCredentials(email, password, _metadata = {}) {
    throw new Error('必须实现storeCredentials方法');
  }

  /**
   * 检索凭据
   * @param {string} email - 邮箱地址
   * @returns {Promise<AccountCredentials|null>} 账号凭据或null
   */
  async retrieveCredentials(_email) {
    throw new Error('必须实现retrieveCredentials方法');
  }

  /**
   * 列出所有账号
   * @returns {Promise<string[]>} 邮箱地址数组
   */
  async listAllAccounts() {
    throw new Error('必须实现listAllAccounts方法');
  }

  /**
   * 删除凭据
   * @param {string} email - 邮箱地址
   * @returns {Promise<boolean>} 是否成功
   */
  async deleteCredentials(_email) {
    throw new Error('必须实现deleteCredentials方法');
  }

  /**
   * 备份凭据
   * @param {string} backupPath - 备份路径
   * @returns {Promise<boolean>} 是否成功
   */
  async backupCredentials(_backupPath) {
    throw new Error('必须实现backupCredentials方法');
  }

  /**
   * 恢复凭据
   * @param {string} backupPath - 备份路径
   * @returns {Promise<boolean>} 是否成功
   */
  async restoreCredentials(_backupPath) {
    throw new Error('必须实现restoreCredentials方法');
  }
}

/**
 * 邮件处理器接口
 */
export class IEmailProcessor {
  /**
   * 连接到邮箱
   * @param {EmailConfig} emailConfig - 邮件配置
   * @returns {Promise<boolean>} 是否成功连接
   */
  async connectToMailbox(_emailConfig) {
    throw new Error('必须实现connectToMailbox方法');
  }

  /**
   * 等待验证邮件
   * @param {string} email - 邮箱地址
   * @param {number} timeout - 超时时间（毫秒）
   * @returns {Promise<VerificationEmail|null>} 验证邮件或null
   */
  async waitForVerificationEmail(email, _timeout = 300000) {
    throw new Error('必须实现waitForVerificationEmail方法');
  }

  /**
   * 提取验证链接
   * @param {string} emailContent - 邮件内容
   * @returns {Promise<string|null>} 验证链接或null
   */
  async extractVerificationLink(_emailContent) {
    throw new Error('必须实现extractVerificationLink方法');
  }

  /**
   * 完成邮件验证
   * @param {string} verificationLink - 验证链接
   * @returns {Promise<boolean>} 是否成功
   */
  async completeEmailVerification(_verificationLink) {
    throw new Error('必须实现completeEmailVerification方法');
  }

  /**
   * 断开邮箱连接
   * @returns {Promise<void>}
   */
  async disconnect() {
    throw new Error('必须实现disconnect方法');
  }
}

/**
 * 注册机器人接口
 */
export class IRegistrationBot {
  /**
   * 初始化浏览器
   * @param {Object} options - 浏览器选项
   * @returns {Promise<void>}
   */
  async initializeBrowser(_options = {}) {
    throw new Error('必须实现initializeBrowser方法');
  }

  /**
   * 导航到注册页面
   * @param {string} registrationUrl - 注册页面URL
   * @returns {Promise<boolean>} 是否成功导航
   */
  async navigateToRegistration(_registrationUrl) {
    throw new Error('必须实现navigateToRegistration方法');
  }

  /**
   * 填写注册表单
   * @param {Object} formData - 表单数据
   * @returns {Promise<boolean>} 是否成功填写
   */
  async fillRegistrationForm(_formData) {
    throw new Error('必须实现fillRegistrationForm方法');
  }

  /**
   * 提交注册表单
   * @returns {Promise<boolean>} 是否成功提交
   */
  async submitRegistrationForm() {
    throw new Error('必须实现submitRegistrationForm方法');
  }

  /**
   * 处理验证码
   * @returns {Promise<boolean>} 是否成功处理
   */
  async handleCaptcha() {
    throw new Error('必须实现handleCaptcha方法');
  }

  /**
   * 关闭浏览器
   * @returns {Promise<void>}
   */
  async closeBrowser() {
    throw new Error('必须实现closeBrowser方法');
  }
}

/**
 * 账号管理器接口
 */
export class IAccountManager {
  /**
   * 注册单个账号
   * @param {string} email - 邮箱地址
   * @param {string} password - 密码
   * @param {Object} options - 注册选项
   * @returns {Promise<RegistrationResult>} 注册结果
   */
  async registerAccount(email, password, _options = {}) {
    throw new Error('必须实现registerAccount方法');
  }

  /**
   * 批量注册账号
   * @param {Array} accounts - 账号数组
   * @param {Object} options - 批量选项
   * @returns {Promise<Array>} 注册结果数组
   */
  async batchRegisterAccounts(accounts, _options = {}) {
    throw new Error('必须实现batchRegisterAccounts方法');
  }

  /**
   * 获取账号状态
   * @param {string} email - 邮箱地址
   * @returns {Promise<AccountStatus>} 账号状态
   */
  async getAccountStatus(_email) {
    throw new Error('必须实现getAccountStatus方法');
  }

  /**
   * 删除账号
   * @param {string} email - 邮箱地址
   * @returns {Promise<boolean>} 是否成功
   */
  async deleteAccount(_email) {
    throw new Error('必须实现deleteAccount方法');
  }
}

/**
 * 任务管理器接口
 */
export class ITaskManager {
  /**
   * 创建任务
   * @param {string} type - 任务类型
   * @param {Object} data - 任务数据
   * @param {Object} options - 任务选项
   * @returns {Promise<string>} 任务ID
   */
  async createTask(type, data, _options = {}) {
    throw new Error('必须实现createTask方法');
  }

  /**
   * 执行任务
   * @param {string} taskId - 任务ID
   * @returns {Promise<TaskResult>} 任务结果
   */
  async executeTask(_taskId) {
    throw new Error('必须实现executeTask方法');
  }

  /**
   * 获取任务状态
   * @param {string} taskId - 任务ID
   * @returns {Promise<TaskStatus>} 任务状态
   */
  async getTaskStatus(_taskId) {
    throw new Error('必须实现getTaskStatus方法');
  }

  /**
   * 取消任务
   * @param {string} taskId - 任务ID
   * @returns {Promise<boolean>} 是否成功取消
   */
  async cancelTask(_taskId) {
    throw new Error('必须实现cancelTask方法');
  }

  /**
   * 列出任务
   * @param {Object} filters - 过滤条件
   * @returns {Promise<Array>} 任务列表
   */
  async listTasks(_filters = {}) {
    throw new Error('必须实现listTasks方法');
  }
}

/**
 * IPC通信接口
 */
export class IIPCHandler {
  /**
   * 处理IPC消息
   * @param {string} channel - 通道名称
   * @param {any} data - 消息数据
   * @returns {Promise<any>} 处理结果
   */
  async handleMessage(_channel, _data) {
    throw new Error('必须实现handleMessage方法');
  }

  /**
   * 发送IPC消息
   * @param {string} channel - 通道名称
   * @param {any} data - 消息数据
   * @returns {Promise<void>}
   */
  async sendMessage(_channel, _data) {
    throw new Error('必须实现sendMessage方法');
  }

  /**
   * 注册消息处理器
   * @param {string} channel - 通道名称
   * @param {Function} handler - 处理函数
   * @returns {void}
   */
  registerHandler(_channel, _handler) {
    throw new Error('必须实现registerHandler方法');
  }

  /**
   * 取消注册消息处理器
   * @param {string} channel - 通道名称
   * @returns {void}
   */
  unregisterHandler(_channel) {
    throw new Error('必须实现unregisterHandler方法');
  }
}