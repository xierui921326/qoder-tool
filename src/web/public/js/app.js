/**
 * 前端应用主文件
 */

class QoderAccountManager {
  constructor() {
    this.currentPage = 'dashboard';
    this.isElectron = typeof window.electronAPI !== 'undefined';
    this.apiBase = '/api';
    
    this.init();
  }

  /**
   * 初始化应用
   */
  async init() {
    try {
      // 设置事件监听器
      this.setupEventListeners();
      
      // 设置Electron菜单监听器
      if (this.isElectron) {
        this.setupElectronMenuListeners();
      }
      
      // 加载初始数据
      await this.loadInitialData();
      
      // 显示应用版本
      await this.updateVersionInfo();
      
      this.showNotification('应用启动成功', '欢迎使用Qoder账号管理器', 'success');
      this.updateStatus('就绪');
      
    } catch (error) {
      console.error('应用初始化失败:', error);
      this.showNotification('初始化失败', error.message, 'error');
    }
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    // 导航菜单点击
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.dataset.page;
        this.navigateToPage(page);
      });
    });

    // 标题栏按钮（仅Electron环境）
    if (this.isElectron) {
      document.getElementById('minimize-btn').addEventListener('click', () => {
        window.electronAPI.window.minimize();
      });

      document.getElementById('maximize-btn').addEventListener('click', () => {
        window.electronAPI.window.toggleMaximize();
      });

      document.getElementById('close-btn').addEventListener('click', () => {
        window.electronAPI.window.close();
      });
    }

    // 注册表单提交
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
      registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSingleRegister();
      });
    }

    // 批量注册按钮
    const batchRegisterBtn = document.getElementById('batch-register-btn');
    if (batchRegisterBtn) {
      batchRegisterBtn.addEventListener('click', () => {
        this.handleBatchRegister();
      });
    }
  }

  /**
   * 设置Electron菜单监听器
   */
  setupElectronMenuListeners() {
    if (!this.isElectron) return;

    // 新建配置
    window.electronAPI.menu.onNewConfig(() => {
      this.navigateToPage('config');
      this.showNotification('新建配置', '请填写配置信息', 'info');
    });

    // 打开配置
    window.electronAPI.menu.onOpenConfig(async () => {
      try {
        const result = await window.electronAPI.dialog.showOpenDialog({
          title: '选择配置文件',
          filters: [
            { name: 'JSON文件', extensions: ['json'] },
            { name: '所有文件', extensions: ['*'] }
          ]
        });
        
        if (!result.canceled && result.filePaths.length > 0) {
          // TODO: 实现配置文件加载
          this.showNotification('配置加载', '配置文件加载成功', 'success');
        }
      } catch (error) {
        this.showNotification('配置加载失败', error.message, 'error');
      }
    });

    // 保存配置
    window.electronAPI.menu.onSaveConfig(async () => {
      try {
        const result = await window.electronAPI.dialog.showSaveDialog({
          title: '保存配置文件',
          defaultPath: 'qoder-config.json',
          filters: [
            { name: 'JSON文件', extensions: ['json'] },
            { name: '所有文件', extensions: ['*'] }
          ]
        });
        
        if (!result.canceled) {
          // TODO: 实现配置文件保存
          this.showNotification('配置保存', '配置文件保存成功', 'success');
        }
      } catch (error) {
        this.showNotification('配置保存失败', error.message, 'error');
      }
    });

    // 批量注册
    window.electronAPI.menu.onBatchRegister(() => {
      this.navigateToPage('register');
      this.handleBatchRegister();
    });

    // 账号管理
    window.electronAPI.menu.onAccountManagement(() => {
      this.navigateToPage('accounts');
    });

    // 邮件配置
    window.electronAPI.menu.onEmailConfig(() => {
      this.navigateToPage('config');
    });

    // 查看日志
    window.electronAPI.menu.onViewLogs(() => {
      this.navigateToPage('logs');
    });

    // 数据导出
    window.electronAPI.menu.onExportData(async () => {
      try {
        const result = await window.electronAPI.dialog.showSaveDialog({
          title: '导出数据',
          defaultPath: 'qoder-accounts.json',
          filters: [
            { name: 'JSON文件', extensions: ['json'] },
            { name: 'CSV文件', extensions: ['csv'] }
          ]
        });
        
        if (!result.canceled) {
          // TODO: 实现数据导出
          this.showNotification('数据导出', '数据导出成功', 'success');
        }
      } catch (error) {
        this.showNotification('数据导出失败', error.message, 'error');
      }
    });

    // 数据导入
    window.electronAPI.menu.onImportData(async () => {
      try {
        const result = await window.electronAPI.dialog.showOpenDialog({
          title: '导入数据',
          filters: [
            { name: 'JSON文件', extensions: ['json'] },
            { name: 'CSV文件', extensions: ['csv'] }
          ]
        });
        
        if (!result.canceled && result.filePaths.length > 0) {
          // TODO: 实现数据导入
          this.showNotification('数据导入', '数据导入成功', 'success');
        }
      } catch (error) {
        this.showNotification('数据导入失败', error.message, 'error');
      }
    });
  }

  /**
   * 导航到指定页面
   * @param {string} page - 页面名称
   */
  navigateToPage(page) {
    // 更新导航状态
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
    });
    document.querySelector(`[data-page="${page}"]`).classList.add('active');

    // 显示对应页面
    document.querySelectorAll('.page').forEach(pageEl => {
      pageEl.classList.remove('active');
    });
    document.getElementById(`${page}-page`).classList.add('active');

    this.currentPage = page;

    // 加载页面数据
    this.loadPageData(page);
  }

  /**
   * 加载页面数据
   * @param {string} page - 页面名称
   */
  async loadPageData(page) {
    try {
      switch (page) {
      case 'dashboard':
        await this.loadDashboardData();
        break;
      case 'accounts':
        await this.loadAccountsData();
        break;
      case 'config':
        await this.loadConfigData();
        break;
      case 'logs':
        await this.loadLogsData();
        break;
      }
    } catch (error) {
      console.error(`加载${page}页面数据失败:`, error);
      this.showNotification('数据加载失败', error.message, 'error');
    }
  }

  /**
   * 加载初始数据
   */
  async loadInitialData() {
    await this.loadDashboardData();
  }

  /**
   * 加载仪表板数据
   */
  async loadDashboardData() {
    try {
      const response = await fetch(`${this.apiBase}/accounts`);
      const data = await response.json();
      
      // 更新统计数据
      document.getElementById('total-accounts').textContent = data.accounts?.length || 0;
      document.getElementById('success-accounts').textContent = 0;
      document.getElementById('failed-accounts').textContent = 0;
      document.getElementById('pending-accounts').textContent = 0;
      
    } catch (error) {
      console.error('加载仪表板数据失败:', error);
    }
  }

  /**
   * 加载账号数据
   */
  async loadAccountsData() {
    try {
      const response = await fetch(`${this.apiBase}/accounts`);
      const data = await response.json();
      
      const container = document.getElementById('accounts-table-container');
      if (data.accounts && data.accounts.length > 0) {
        container.innerHTML = this.generateAccountsTable(data.accounts);
      } else {
        container.innerHTML = '<div class="text-center p-20">暂无账号数据</div>';
      }
      
    } catch (error) {
      console.error('加载账号数据失败:', error);
    }
  }

  /**
   * 生成账号表格HTML
   * @param {Array} accounts - 账号数组
   * @returns {string} HTML字符串
   */
  generateAccountsTable(accounts) {
    return `
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>邮箱</th>
              <th>状态</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${accounts.map(account => `
              <tr>
                <td>${account.email}</td>
                <td><span class="status-badge ${account.status}">${this.getStatusText(account.status)}</span></td>
                <td>${this.formatDate(account.createdAt)}</td>
                <td>
                  <button class="btn btn-sm btn-secondary" onclick="app.viewAccount('${account.email}')">查看</button>
                  <button class="btn btn-sm btn-danger" onclick="app.deleteAccount('${account.email}')">删除</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * 加载配置数据
   */
  async loadConfigData() {
    try {
      const response = await fetch(`${this.apiBase}/config`);
      const data = await response.json();
      
      const container = document.querySelector('.config-container');
      container.innerHTML = this.generateConfigForm(data.config || {});
      
    } catch (error) {
      console.error('加载配置数据失败:', error);
    }
  }

  /**
   * 生成配置表单HTML
   * @param {Object} config - 配置对象
   * @returns {string} HTML字符串
   */
  generateConfigForm(config) {
    return `
      <form id="config-form" class="register-form">
        <h3>邮件配置</h3>
        <div class="form-group">
          <label for="imap-server">IMAP服务器</label>
          <input type="text" id="imap-server" name="imapServer" value="${config.imapServer || ''}" required>
        </div>
        <div class="form-group">
          <label for="imap-port">IMAP端口</label>
          <input type="number" id="imap-port" name="imapPort" value="${config.imapPort || 993}" required>
        </div>
        <div class="form-group">
          <label for="email-username">邮箱用户名</label>
          <input type="text" id="email-username" name="emailUsername" value="${config.emailUsername || ''}" required>
        </div>
        <div class="form-group">
          <label for="email-password">邮箱密码</label>
          <input type="password" id="email-password" name="emailPassword" value="${config.emailPassword || ''}" required>
        </div>
        
        <h3>自动化配置</h3>
        <div class="form-group">
          <label for="headless">无头模式</label>
          <select id="headless" name="headless">
            <option value="true" ${config.headless !== false ? 'selected' : ''}>启用</option>
            <option value="false" ${config.headless === false ? 'selected' : ''}>禁用</option>
          </select>
        </div>
        <div class="form-group">
          <label for="timeout">超时时间（毫秒）</label>
          <input type="number" id="timeout" name="timeout" value="${config.timeout || 30000}" required>
        </div>
        
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">保存配置</button>
          <button type="button" class="btn btn-secondary" onclick="app.resetConfig()">重置</button>
        </div>
      </form>
    `;
  }

  /**
   * 加载日志数据
   */
  async loadLogsData() {
    try {
      const response = await fetch(`${this.apiBase}/logs`);
      const data = await response.json();
      
      const container = document.getElementById('logs-container');
      if (data.logs && data.logs.length > 0) {
        container.innerHTML = this.generateLogsHTML(data.logs);
      } else {
        container.innerHTML = '<div class="text-center p-20">暂无日志数据</div>';
      }
      
    } catch (error) {
      console.error('加载日志数据失败:', error);
    }
  }

  /**
   * 生成日志HTML
   * @param {Array} logs - 日志数组
   * @returns {string} HTML字符串
   */
  generateLogsHTML(logs) {
    return `
      <div class="logs-container">
        ${logs.map(log => `
          <div class="log-entry ${log.level}">
            <div class="log-time">${this.formatDate(log.timestamp)}</div>
            <div class="log-level">[${log.level.toUpperCase()}]</div>
            <div class="log-message">${log.message}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  /**
   * 处理单个账号注册
   */
  async handleSingleRegister() {
    const form = document.getElementById('register-form');
    const formData = new FormData(form);
    const email = formData.get('email');
    const password = formData.get('password');

    if (!email || !password) {
      this.showNotification('输入错误', '请填写邮箱和密码', 'error');
      return;
    }

    if (!this.validateEmail(email)) {
      this.showNotification('邮箱格式错误', '请输入有效的邮箱地址', 'error');
      return;
    }

    try {
      this.showLoading('正在注册账号...');
      
      const response = await fetch(`${this.apiBase}/accounts/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      const result = await response.json();
      
      if (result.success) {
        this.showNotification('注册成功', '账号注册请求已提交', 'success');
        form.reset();
        await this.loadDashboardData();
      } else {
        this.showNotification('注册失败', result.error || '未知错误', 'error');
      }
      
    } catch (error) {
      console.error('注册失败:', error);
      this.showNotification('注册失败', error.message, 'error');
    } finally {
      this.hideLoading();
    }
  }

  /**
   * 处理批量注册
   */
  async handleBatchRegister() {
    // TODO: 实现批量注册对话框
    this.showNotification('批量注册', '批量注册功能开发中...', 'info');
  }

  /**
   * 更新版本信息
   */
  async updateVersionInfo() {
    try {
      if (this.isElectron) {
        const version = await window.electronAPI.app.getVersion();
        document.getElementById('version-text').textContent = `v${version}`;
      }
    } catch (error) {
      console.error('获取版本信息失败:', error);
    }
  }

  /**
   * 显示通知
   * @param {string} title - 标题
   * @param {string} message - 消息
   * @param {string} type - 类型 (success, error, warning, info)
   */
  showNotification(title, message, type = 'info') {
    const container = document.getElementById('notifications');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <div class="notification-title">${title}</div>
      <div class="notification-message">${message}</div>
    `;

    container.appendChild(notification);

    // 3秒后自动移除
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);
  }

  /**
   * 显示加载指示器
   * @param {string} text - 加载文本
   */
  showLoading(text = '处理中...') {
    const overlay = document.getElementById('loading-overlay');
    const loadingText = overlay.querySelector('.loading-text');
    loadingText.textContent = text;
    overlay.classList.remove('hidden');
  }

  /**
   * 隐藏加载指示器
   */
  hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    overlay.classList.add('hidden');
  }

  /**
   * 更新状态栏
   * @param {string} status - 状态文本
   */
  updateStatus(status) {
    document.getElementById('status-text').textContent = status;
  }

  /**
   * 验证邮箱格式
   * @param {string} email - 邮箱地址
   * @returns {boolean} 是否有效
   */
  validateEmail(email) {
    if (this.isElectron && window.utils) {
      return window.utils.validateEmail(email);
    }
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  /**
   * 格式化日期
   * @param {string|Date} date - 日期
   * @returns {string} 格式化后的日期
   */
  formatDate(date) {
    if (this.isElectron && window.utils) {
      return window.utils.formatDate(date);
    }
    return new Date(date).toLocaleString('zh-CN');
  }

  /**
   * 获取状态文本
   * @param {string} status - 状态
   * @returns {string} 状态文本
   */
  getStatusText(status) {
    const statusMap = {
      'pending': '待处理',
      'in_progress': '处理中',
      'completed': '已完成',
      'failed': '失败',
      'timeout': '超时'
    };
    return statusMap[status] || status;
  }

  /**
   * 查看账号详情
   * @param {string} email - 邮箱地址
   */
  viewAccount(email) {
    this.showNotification('查看账号', `查看账号: ${email}`, 'info');
  }

  /**
   * 删除账号
   * @param {string} email - 邮箱地址
   */
  async deleteAccount(email) {
    if (this.isElectron) {
      const result = await window.electronAPI.dialog.showMessageBox({
        type: 'question',
        buttons: ['取消', '删除'],
        defaultId: 0,
        message: '确认删除',
        detail: `确定要删除账号 ${email} 吗？此操作不可撤销。`
      });

      if (result.response === 1) {
        // TODO: 实现账号删除
        this.showNotification('删除成功', `账号 ${email} 已删除`, 'success');
        await this.loadAccountsData();
      }
    } else {
      if (confirm(`确定要删除账号 ${email} 吗？`)) {
        // TODO: 实现账号删除
        this.showNotification('删除成功', `账号 ${email} 已删除`, 'success');
        await this.loadAccountsData();
      }
    }
  }

  /**
   * 重置配置
   */
  resetConfig() {
    if (confirm('确定要重置所有配置吗？')) {
      document.getElementById('config-form').reset();
      this.showNotification('配置重置', '配置已重置为默认值', 'info');
    }
  }
}

// 创建应用实例
const app = new QoderAccountManager();

// 全局错误处理
window.addEventListener('error', (event) => {
  console.error('全局错误:', event.error);
  if (app) {
    app.showNotification('应用错误', event.error.message, 'error');
  }
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('未处理的Promise拒绝:', event.reason);
  if (app) {
    app.showNotification('应用错误', event.reason.message || '未知错误', 'error');
  }
});