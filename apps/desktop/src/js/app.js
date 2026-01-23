// Qoder账号管理器 - 前端应用
import { invoke } from '@tauri-apps/api/core';

// ============ 页面导航 ============
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const pageName = item.getAttribute('data-page');
            switchPage(pageName);
        });
    });
}

function switchPage(pageName) {
    // 更新导航状态
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-page') === pageName) {
            item.classList.add('active');
        }
    });
    
    // 切换页面
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    const targetPage = document.getElementById(pageName + '-page');
    if (targetPage) {
        targetPage.classList.add('active');
    }
    
    // 加载页面数据
    loadPageData(pageName);
}

function loadPageData(pageName) {
    switch(pageName) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'accounts':
            loadAccounts();
            break;
        case 'email-config':
            loadEmailConfigs();
            break;
        case 'batch-register':
            loadBatchRegisterPage();
            break;
        case 'logs':
            loadLogs();
            break;
    }
}

// ============ 仪表板 ============
async function loadDashboard() {
    try {
        const stats = await invoke('get_dashboard_stats');
        document.getElementById('stat-total').textContent = stats.total_accounts;
        document.getElementById('stat-active').textContent = stats.active_accounts;
        document.getElementById('stat-today').textContent = stats.today_registered;
        document.getElementById('stat-rate').textContent = stats.success_rate.toFixed(1) + '%';
    } catch (err) {
        console.error('加载仪表板失败:', err);
    }
}

// ============ 账号管理 ============
async function loadAccounts() {
    try {
        const accounts = await invoke('get_accounts');
        const container = document.getElementById('accounts-list');
        
        if (accounts.length === 0) {
            container.innerHTML = '<p class="empty-tip">暂无账号数据</p>';
            return;
        }
        
        let html = '<table class="data-table"><thead><tr>' +
            '<th>邮箱</th><th>用户名</th><th>状态</th><th>创建时间</th><th>操作</th>' +
            '</tr></thead><tbody>';
        
        accounts.forEach(account => {
            html += `<tr>
                <td>${escapeHtml(account.email)}</td>
                <td>${escapeHtml(account.username)}</td>
                <td><span class="status-badge status-${account.status}">${account.status}</span></td>
                <td>${account.created_at}</td>
                <td><button class="btn btn-sm btn-danger" data-delete-account="${account.id}">删除</button></td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        container.innerHTML = html;
        
        // 绑定删除事件
        container.querySelectorAll('[data-delete-account]').forEach(btn => {
            btn.addEventListener('click', () => deleteAccount(btn.dataset.deleteAccount));
        });
    } catch (err) {
        console.error('加载账号失败:', err);
    }
}

function initAccountActions() {
    document.getElementById('add-account-btn').addEventListener('click', () => {
        showModal('添加账号', 
            `<div class="form-group"><label>邮箱</label><input type="email" id="new-email" placeholder="请输入邮箱"></div>
             <div class="form-group"><label>用户名</label><input type="text" id="new-username" placeholder="请输入用户名"></div>`,
            async () => {
                const email = document.getElementById('new-email').value.trim();
                const username = document.getElementById('new-username').value.trim();
                if (email && username) {
                    try {
                        await invoke('add_account', { email, username });
                        loadAccounts();
                        showToast('账号添加成功', 'success');
                    } catch (err) {
                        showToast('添加失败: ' + err, 'error');
                    }
                }
            }
        );
    });
}

async function deleteAccount(id) {
    if (confirm('确定要删除这个账号吗？')) {
        try {
            await invoke('delete_account', { id });
            loadAccounts();
            showToast('账号已删除', 'success');
        } catch (err) {
            showToast('删除失败: ' + err, 'error');
        }
    }
}

// ============ 邮箱配置 ============
async function loadEmailConfigs() {
    try {
        const configs = await invoke('get_email_configs');
        const container = document.getElementById('email-config-list');
        
        if (configs.length === 0) {
            container.innerHTML = `
                <div class="empty-state-card">
                    <div class="empty-icon">📧</div>
                    <p>暂无邮箱配置</p>
                    <p class="empty-hint">点击上方"添加邮箱配置"按钮开始配置</p>
                </div>`;
            return;
        }
        
        let html = '';
        configs.forEach(config => {
            const passwordModeText = config.password_mode === 'random' ? '随机密码' : '使用邮箱账号';
            html += `
                <div class="email-config-card">
                    <div class="config-card-header">
                        <div class="config-domain">
                            <span class="domain-icon">🌐</span>
                            <span class="domain-name">${escapeHtml(config.domain)}</span>
                        </div>
                        <div class="config-actions">
                            <button class="btn-icon" data-edit-config="${config.id}" title="编辑">✏️</button>
                            <button class="btn-icon btn-icon-danger" data-delete-config="${config.id}" title="删除">🗑️</button>
                        </div>
                    </div>
                    <div class="config-card-body">
                        <div class="config-item">
                            <span class="config-label">IMAP服务器</span>
                            <span class="config-value">${escapeHtml(config.imap_host)}:${config.imap_port}</span>
                        </div>
                        <div class="config-item">
                            <span class="config-label">用户名</span>
                            <span class="config-value">${escapeHtml(config.username)}</span>
                        </div>
                        <div class="config-item">
                            <span class="config-label">密码模式</span>
                            <span class="config-value">${passwordModeText}</span>
                        </div>
                    </div>
                    <div class="config-card-footer">
                        <span class="config-time">创建于 ${config.created_at}</span>
                    </div>
                </div>`;
        });
        
        container.innerHTML = html;
        
        // 绑定编辑和删除事件
        container.querySelectorAll('[data-edit-config]').forEach(btn => {
            btn.addEventListener('click', () => {
                const config = configs.find(c => c.id === btn.dataset.editConfig);
                if (config) showEditEmailConfigModal(config);
            });
        });
        
        container.querySelectorAll('[data-delete-config]').forEach(btn => {
            btn.addEventListener('click', () => deleteEmailConfig(btn.dataset.deleteConfig));
        });
    } catch (err) {
        console.error('加载邮箱配置失败:', err);
    }
}

function initEmailConfigActions() {
    document.getElementById('add-email-config-btn').addEventListener('click', () => {
        showAddEmailConfigModal();
    });
}

function showAddEmailConfigModal() {
    const formHtml = `
        <div class="email-form-grid">
            <div class="form-card">
                <div class="form-card-header">
                    <span class="form-card-icon">🌐</span>
                    <span class="form-card-title">基本信息</span>
                </div>
                <div class="form-card-body">
                    <div class="form-group">
                        <label>域名 <span class="required">*</span></label>
                        <input type="text" id="cfg-domain" placeholder="example.com">
                    </div>
                    <div class="form-group">
                        <label>密码模式</label>
                        <select id="cfg-password-mode" class="form-select">
                            <option value="random">随机生成密码</option>
                            <option value="same_as_email">使用邮箱账号作为密码</option>
                        </select>
                    </div>
                </div>
            </div>
            <div class="form-card">
                <div class="form-card-header">
                    <span class="form-card-icon">📬</span>
                    <span class="form-card-title">IMAP配置</span>
                </div>
                <div class="form-card-body">
                    <div class="form-row-inline">
                        <div class="form-group flex-2">
                            <label>服务器 <span class="required">*</span></label>
                            <input type="text" id="cfg-imap-host" placeholder="imap.example.com">
                        </div>
                        <div class="form-group flex-1">
                            <label>端口</label>
                            <input type="number" id="cfg-imap-port" value="993">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>用户名 <span class="required">*</span></label>
                        <input type="text" id="cfg-username" placeholder="your@email.com">
                    </div>
                    <div class="form-group">
                        <label>授权码 <span class="required">*</span></label>
                        <input type="password" id="cfg-password" placeholder="IMAP授权码">
                    </div>
                </div>
            </div>
        </div>
        <div class="quick-fill-bar">
            <span class="quick-fill-label">快速填充：</span>
            <button type="button" class="quick-btn" data-host="imap.gmail.com">Gmail</button>
            <button type="button" class="quick-btn" data-host="imap.qq.com">QQ邮箱</button>
            <button type="button" class="quick-btn" data-host="imap.163.com">网易163</button>
            <button type="button" class="quick-btn" data-host="outlook.office365.com">Outlook</button>
        </div>`;
    
    showModal('添加邮箱配置', formHtml, async () => {
        const domain = document.getElementById('cfg-domain').value.trim();
        const imapHost = document.getElementById('cfg-imap-host').value.trim();
        const imapPort = parseInt(document.getElementById('cfg-imap-port').value) || 993;
        const username = document.getElementById('cfg-username').value.trim();
        const password = document.getElementById('cfg-password').value;
        const passwordMode = document.getElementById('cfg-password-mode').value;
        
        if (!domain || !imapHost || !username || !password) {
            showToast('请填写所有必填项', 'error');
            return;
        }
        
        try {
            await invoke('add_email_config', { domain, imapHost, imapPort, username, password, passwordMode });
            loadEmailConfigs();
            showToast('邮箱配置添加成功', 'success');
        } catch (err) {
            showToast('添加失败: ' + err, 'error');
        }
    });
    
    // 绑定快速填充按钮
    setTimeout(() => {
        document.querySelectorAll('#modal-body .quick-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('cfg-imap-host').value = btn.dataset.host;
            });
        });
    }, 100);
}

function showEditEmailConfigModal(config) {
    const formHtml = `
        <div class="email-form-grid">
            <div class="form-card">
                <div class="form-card-header">
                    <span class="form-card-icon">🌐</span>
                    <span class="form-card-title">基本信息</span>
                </div>
                <div class="form-card-body">
                    <div class="form-group">
                        <label>域名 <span class="required">*</span></label>
                        <input type="text" id="cfg-domain" value="${escapeHtml(config.domain)}">
                    </div>
                    <div class="form-group">
                        <label>密码模式</label>
                        <select id="cfg-password-mode" class="form-select">
                            <option value="random" ${config.password_mode === 'random' ? 'selected' : ''}>随机生成密码</option>
                            <option value="same_as_email" ${config.password_mode === 'same_as_email' ? 'selected' : ''}>使用邮箱账号作为密码</option>
                        </select>
                    </div>
                </div>
            </div>
            <div class="form-card">
                <div class="form-card-header">
                    <span class="form-card-icon">📬</span>
                    <span class="form-card-title">IMAP配置</span>
                </div>
                <div class="form-card-body">
                    <div class="form-row-inline">
                        <div class="form-group flex-2">
                            <label>服务器 <span class="required">*</span></label>
                            <input type="text" id="cfg-imap-host" value="${escapeHtml(config.imap_host)}">
                        </div>
                        <div class="form-group flex-1">
                            <label>端口</label>
                            <input type="number" id="cfg-imap-port" value="${config.imap_port}">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>用户名 <span class="required">*</span></label>
                        <input type="text" id="cfg-username" value="${escapeHtml(config.username)}">
                    </div>
                    <div class="form-group">
                        <label>授权码 <span class="required">*</span></label>
                        <input type="password" id="cfg-password" value="${escapeHtml(config.password)}">
                    </div>
                </div>
            </div>
        </div>`;
    
    showModal('编辑邮箱配置', formHtml, async () => {
        const domain = document.getElementById('cfg-domain').value.trim();
        const imapHost = document.getElementById('cfg-imap-host').value.trim();
        const imapPort = parseInt(document.getElementById('cfg-imap-port').value) || 993;
        const username = document.getElementById('cfg-username').value.trim();
        const password = document.getElementById('cfg-password').value;
        const passwordMode = document.getElementById('cfg-password-mode').value;
        
        if (!domain || !imapHost || !username || !password) {
            showToast('请填写所有必填项', 'error');
            return;
        }
        
        try {
            await invoke('update_email_config', { id: config.id, domain, imapHost, imapPort, username, password, passwordMode });
            loadEmailConfigs();
            showToast('邮箱配置更新成功', 'success');
        } catch (err) {
            showToast('更新失败: ' + err, 'error');
        }
    });
}

async function deleteEmailConfig(id) {
    if (confirm('确定要删除这个邮箱配置吗？')) {
        try {
            await invoke('delete_email_config', { id });
            loadEmailConfigs();
            showToast('邮箱配置已删除', 'success');
        } catch (err) {
            showToast('删除失败: ' + err, 'error');
        }
    }
}

// ============ 日志管理 ============
async function loadLogs() {
    try {
        const logs = await invoke('get_logs');
        const container = document.getElementById('logs-list');
        
        if (logs.length === 0) {
            container.innerHTML = '<p class="empty-tip">暂无日志记录</p>';
            return;
        }
        
        let html = '';
        logs.forEach(log => {
            html += `<div class="log-entry log-${log.level}">
                <span class="log-time">${log.timestamp}</span>
                <span class="log-level">[${log.level.toUpperCase()}]</span>
                <span class="log-message">${escapeHtml(log.message)}</span>
            </div>`;
        });
        container.innerHTML = html;
    } catch (err) {
        console.error('加载日志失败:', err);
    }
}

function initLogActions() {
    document.getElementById('clear-logs-btn').addEventListener('click', async () => {
        if (confirm('确定要清空所有日志吗？')) {
            try {
                await invoke('clear_logs');
                loadLogs();
                showToast('日志已清空', 'success');
            } catch (err) {
                showToast('清空失败: ' + err, 'error');
            }
        }
    });
}

// ============ 系统设置 ============
function initSettingsActions() {
    document.getElementById('clear-data-btn').addEventListener('click', async () => {
        if (confirm('确定要清空所有数据吗？此操作不可恢复！')) {
            try {
                await invoke('clear_all_data');
                showToast('所有数据已清空', 'success');
                loadDashboard();
            } catch (err) {
                showToast('清空失败: ' + err, 'error');
            }
        }
    });
}

// ============ 模态框 ============
let modalCallback = null;

function initModal() {
    document.getElementById('modal-close').addEventListener('click', hideModal);
    document.getElementById('modal-cancel').addEventListener('click', hideModal);
    document.getElementById('modal-confirm').addEventListener('click', () => {
        if (modalCallback) {
            modalCallback();
        }
        hideModal();
    });
    document.getElementById('modal').addEventListener('click', (e) => {
        if (e.target.id === 'modal') {
            hideModal();
        }
    });
}

function showModal(title, bodyHtml, callback) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal').classList.add('active');
    modalCallback = callback;
}

function hideModal() {
    document.getElementById('modal').classList.remove('active');
    modalCallback = null;
}

// ============ Toast提示 ============
function showToast(message, type) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:10000;';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = message;
    toast.style.cssText = `padding:12px 20px;margin-bottom:10px;border-radius:6px;color:white;
        background:${type === 'success' ? '#10b981' : '#ef4444'};`;
    container.appendChild(toast);
    
    setTimeout(() => toast.remove(), 3000);
}

// ============ 工具函数 ============
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============ 批量注册 ============
let registerState = {
    isRunning: false,
    isPaused: false,
    emails: [],
    results: [],
    currentIndex: 0,
    successCount: 0,
    failedCount: 0,
    selectedConfig: null,  // 存储选中的邮箱配置
    previewEmails: []      // 缓存预览邮箱，避免每次重新生成
};

// 生成随机用户名：8位字母 + 6位数字
function generateRandomUsername() {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const digits = '0123456789';
    
    let username = '';
    // 8位随机字母
    for (let i = 0; i < 8; i++) {
        username += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    // 6位随机数字
    for (let i = 0; i < 6; i++) {
        username += digits.charAt(Math.floor(Math.random() * digits.length));
    }
    return username;
}

// 根据配置和数量生成邮箱列表
async function generateEmails(domain, count) {
    // 获取已存在的邮箱列表
    const existingAccounts = await invoke('get_accounts');
    const existingEmails = new Set(existingAccounts.map(acc => acc.email));
    
    const emails = [];
    let attempts = 0;
    const maxAttempts = count * 10; // 最多尝试 10 倍数量
    
    while (emails.length < count && attempts < maxAttempts) {
        const username = generateRandomUsername();
        const email = `${username}@${domain}`;
        
        // 检查邮箱是否已存在
        if (!existingEmails.has(email)) {
            emails.push(email);
            existingEmails.add(email); // 添加到集合中，避免本次生成重复
        }
        
        attempts++;
    }
    
    if (emails.length < count) {
        console.warn(`只生成了 ${emails.length} 个邮箱，目标是 ${count} 个`);
    }
    
    return emails;
}

// 更新数字按钮状态
function updateNumberButtonState(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    
    const wrapper = input.closest('.number-input-wrapper');
    if (!wrapper) return;
    
    const minusBtn = wrapper.querySelector('.minus');
    const plusBtn = wrapper.querySelector('.plus');
    
    const value = parseInt(input.value) || 1;
    const min = parseInt(input.min) || 1;
    const max = parseInt(input.max) || 100;
    
    if (minusBtn) {
        minusBtn.disabled = value <= min;
    }
    if (plusBtn) {
        plusBtn.disabled = value >= max;
    }
}

// 更新邮箱预览（智能更新，不是每次都重新生成）
async function updateEmailPreview() {
    const configId = document.getElementById('register-email-config').value;
    const countInput = document.getElementById('register-count');
    const previewEl = document.getElementById('email-preview');
    const domainHint = document.getElementById('domain-hint');
    
    const count = parseInt(countInput.value) || 1;
    
    // 更新数字按钮状态
    updateNumberButtonState('register-count');
    updateNumberButtonState('register-delay');
    
    if (!configId || !registerState.selectedConfig) {
        previewEl.innerHTML = '<span class="preview-placeholder">选择配置后显示预览</span>';
        domainHint.textContent = '选择邮箱配置后将使用该域名生成邮箱';
        registerState.previewEmails = [];
        return;
    }
    
    const domain = registerState.selectedConfig.domain;
    domainHint.textContent = `将使用 @${domain} 域名`;
    
    // 智能更新预览邮箱：
    // - 如果数量增加，只添加新的邮箱
    // - 如果数量减少，只移除多余的邮箱
    // - 如果域名变化，重新生成所有邮箱
    const currentDomain = registerState.previewEmails.length > 0 
        ? registerState.previewEmails[0].split('@')[1] 
        : null;
    
    if (currentDomain !== domain) {
        // 域名变化，重新生成
        registerState.previewEmails = await generateEmails(domain, count);
    } else if (count > registerState.previewEmails.length) {
        // 数量增加，添加新邮箱
        const additionalCount = count - registerState.previewEmails.length;
        const newEmails = await generateEmails(domain, additionalCount);
        registerState.previewEmails = [...registerState.previewEmails, ...newEmails];
    } else if (count < registerState.previewEmails.length) {
        // 数量减少，移除多余邮箱
        registerState.previewEmails = registerState.previewEmails.slice(0, count);
    }
    
    // 显示预览（最多显示5个）
    const previewCount = Math.min(count, 5);
    let html = registerState.previewEmails.slice(0, previewCount).map(email => 
        `<div class="preview-email">${escapeHtml(email)}</div>`
    ).join('');
    
    if (count > 5) {
        html += `<div class="preview-more">... 还有 ${count - 5} 个</div>`;
    }
    
    previewEl.innerHTML = html;
}

// 加载批量注册页面
async function loadBatchRegisterPage() {
    try {
        // 加载邮箱配置到下拉框
        const configs = await invoke('get_email_configs');
        const optionsContainer = document.getElementById('dropdown-options');
        
        if (configs.length === 0) {
            optionsContainer.innerHTML = '<div class="dropdown-empty">暂无邮箱配置，请先添加</div>';
        } else {
            optionsContainer.innerHTML = configs.map(config => 
                `<div class="dropdown-option" data-value="${config.id}" data-domain="${config.domain}">${config.domain} (${config.username})</div>`
            ).join('');
        }
        
        // 存储配置列表供后续使用
        registerState.configList = configs;
        
        // 重置选择状态
        document.getElementById('register-email-config').value = '';
        document.getElementById('dropdown-selected').querySelector('.dropdown-text').textContent = '请选择邮箱配置';
        document.getElementById('dropdown-selected').querySelector('.dropdown-text').classList.add('placeholder');
        registerState.selectedConfig = null;
        
        // 重置预览
        updateEmailPreview();
        
        // 重置进度显示
        document.getElementById('progress-total').textContent = '0';
        document.getElementById('progress-success').textContent = '0';
        document.getElementById('progress-failed').textContent = '0';
        document.getElementById('progress-percent').textContent = '0%';
        document.getElementById('register-progress-bar').style.width = '0%';
        document.getElementById('current-task').textContent = '等待开始...';
        document.getElementById('register-results-list').innerHTML = '<div class="empty-results">暂无结果</div>';
    } catch (err) {
        console.error('加载批量注册页面失败:', err);
    }
}

// 初始化批量注册操作
function initBatchRegisterActions() {
    // 初始化自定义下拉组件 - 邮箱配置
    initCustomDropdown('email-config-dropdown', (value, text) => {
        document.getElementById('register-email-config').value = value;
        if (value && registerState.configList) {
            registerState.selectedConfig = registerState.configList.find(c => c.id === value);
        } else {
            registerState.selectedConfig = null;
        }
        // 域名变化时清空预览缓存
        registerState.previewEmails = [];
        updateEmailPreview();
    });
    
    // 初始化自定义下拉组件 - 浏览器模式
    initCustomDropdown('headless-dropdown', (value, text) => {
        document.getElementById('register-headless').value = value;
    });
    
    // 注册数量变化时更新预览
    const countInput = document.getElementById('register-count');
    if (countInput) {
        countInput.addEventListener('input', () => {
            // 确保值在有效范围内
            let value = parseInt(countInput.value) || 1;
            const min = parseInt(countInput.min) || 1;
            const max = parseInt(countInput.max) || 100;
            value = Math.max(min, Math.min(max, value));
            countInput.value = value;
            updateEmailPreview();
        });
    }
    
    // 间隔变化时更新按钮状态
    const delayInput = document.getElementById('register-delay');
    if (delayInput) {
        delayInput.addEventListener('input', () => {
            updateNumberButtonState('register-delay');
        });
    }
    
    // 数字输入框加减按钮
    document.querySelectorAll('.number-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.disabled) return;
            
            const targetId = btn.dataset.target;
            const input = document.getElementById(targetId);
            if (!input) return;
            
            const min = parseInt(input.min) || 1;
            const max = parseInt(input.max) || 100;
            let value = parseInt(input.value) || min;
            
            if (btn.classList.contains('plus')) {
                value = Math.min(value + 1, max);
            } else {
                value = Math.max(value - 1, min);
            }
            
            input.value = value;
            // 触发input事件以更新预览和按钮状态
            input.dispatchEvent(new Event('input'));
        });
    });
    
    // 初始化按钮状态
    updateNumberButtonState('register-count');
    updateNumberButtonState('register-delay');
    
    // 开始注册按钮
    const startBtn = document.getElementById('start-register-btn');
    if (startBtn) {
        startBtn.addEventListener('click', startBatchRegister);
    }
    
    // 暂停按钮
    const pauseBtn = document.getElementById('pause-register-btn');
    if (pauseBtn) {
        pauseBtn.addEventListener('click', togglePauseRegister);
    }
    
    // 停止按钮
    const stopBtn = document.getElementById('stop-register-btn');
    if (stopBtn) {
        stopBtn.addEventListener('click', stopBatchRegister);
    }
    
    // 导出结果按钮
    const exportBtn = document.getElementById('export-results-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportRegisterResults);
    }
}

// 初始化自定义下拉组件
function initCustomDropdown(dropdownId, onChange) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;
    
    const selected = dropdown.querySelector('.dropdown-selected');
    const options = dropdown.querySelector('.dropdown-options');
    const textEl = selected.querySelector('.dropdown-text');
    
    // 点击选择框切换下拉
    selected.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // 关闭其他下拉
        document.querySelectorAll('.custom-dropdown').forEach(d => {
            if (d !== dropdown) {
                d.querySelector('.dropdown-selected').classList.remove('active');
                d.querySelector('.dropdown-options').classList.remove('show');
            }
        });
        
        selected.classList.toggle('active');
        options.classList.toggle('show');
    });
    
    // 点击选项
    options.addEventListener('click', (e) => {
        const option = e.target.closest('.dropdown-option');
        if (!option) return;
        
        const value = option.dataset.value;
        const text = option.textContent.replace(/^✓\s*/, '');
        
        // 更新选中状态
        options.querySelectorAll('.dropdown-option').forEach(opt => {
            opt.classList.remove('selected');
        });
        option.classList.add('selected');
        
        // 更新显示文本
        textEl.textContent = text;
        textEl.classList.remove('placeholder');
        
        // 关闭下拉
        selected.classList.remove('active');
        options.classList.remove('show');
        
        // 触发回调
        if (onChange) {
            onChange(value, text);
        }
    });
    
    // 点击外部关闭
    document.addEventListener('click', () => {
        selected.classList.remove('active');
        options.classList.remove('show');
    });
}

// 开始批量注册
async function startBatchRegister() {
    try {
        // 验证配置
        const configId = document.getElementById('register-email-config').value;
        if (!configId) {
            showToast('请选择邮箱配置', 'error');
            return;
        }
        
        if (!registerState.selectedConfig) {
            showToast('邮箱配置无效', 'error');
            return;
        }
        
        const count = parseInt(document.getElementById('register-count').value) || 1;
        if (count < 1 || count > 100) {
            showToast('注册数量必须在1-100之间', 'error');
            return;
        }
        
        // 获取配置参数
        const delay = parseInt(document.getElementById('register-delay').value) || 5;
        const headless = document.getElementById('register-headless').value === 'true';
        
        // 使用预览中的邮箱列表（保持一致性）
        // 如果预览邮箱数量不够，补充生成
        const domain = registerState.selectedConfig.domain;
        let emails = [...registerState.previewEmails];
        if (emails.length < count) {
            const additionalEmails = await generateEmails(domain, count - emails.length);
            emails = [...emails, ...additionalEmails];
        } else if (emails.length > count) {
            emails = emails.slice(0, count);
        }
        
        // 初始化状态
        registerState = {
            ...registerState,
            isRunning: true,
            isPaused: false,
            emails: emails,
            results: [],
            currentIndex: 0,
            successCount: 0,
            failedCount: 0
        };
        
        // 更新UI
        updateRegisterUI('running');
        
        // 初始化结果列表
        initResultsList(emails);
        
        // 调用后端开始注册
        showToast('开始批量注册...', 'success');
        
        // 逐个处理邮箱
        for (let i = 0; i < emails.length; i++) {
            if (!registerState.isRunning) break;
            
            // 等待暂停状态解除
            while (registerState.isPaused && registerState.isRunning) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            if (!registerState.isRunning) break;
            
            registerState.currentIndex = i;
            const email = emails[i];
            
            // 更新当前任务显示
            updateCurrentTask(`正在注册: ${email}`);
            updateResultStatus(i, 'processing', '注册中...');
            
            try {
                // 调用后端注册命令
                const result = await invoke('register_single_account', {
                    email: email,
                    configId: configId,
                    headless: headless
                });
                
                if (result.success) {
                    registerState.successCount++;
                    updateResultStatus(i, 'success', '注册成功');
                } else {
                    registerState.failedCount++;
                    updateResultStatus(i, 'failed', result.error || '注册失败');
                }
                
                registerState.results.push(result);
                
            } catch (err) {
                registerState.failedCount++;
                const errorMsg = err.toString();
                updateResultStatus(i, 'failed', errorMsg);
                registerState.results.push({ email, success: false, error: errorMsg });
                
                // 记录错误到控制台
                console.error('注册失败:', email, err);
            }
            
            // 更新进度
            updateProgress();
            
            // 添加日志
            try {
                await invoke('add_log', {
                    level: registerState.results[i]?.success ? 'info' : 'error',
                    message: `注册 ${email}: ${registerState.results[i]?.success ? '成功' : registerState.results[i]?.error || '失败'}`
                });
            } catch (logErr) {
                console.error('添加日志失败:', logErr);
            }
            
            // 延迟
            if (i < emails.length - 1 && registerState.isRunning) {
                updateCurrentTask(`等待 ${delay} 秒后继续...`);
                await new Promise(resolve => setTimeout(resolve, delay * 1000));
            }
        }
        
        // 完成
        registerState.isRunning = false;
        updateRegisterUI('completed');
        updateCurrentTask('批量注册完成');
        
        showToast(`注册完成！成功: ${registerState.successCount}, 失败: ${registerState.failedCount}`, 
            registerState.failedCount === 0 ? 'success' : 'error');
        
        // 刷新仪表板数据
        loadDashboard();
        
    } catch (err) {
        console.error('批量注册失败:', err);
        showToast('批量注册失败: ' + err, 'error');
        registerState.isRunning = false;
        updateRegisterUI('stopped');
    }
}

// 暂停/恢复注册
function togglePauseRegister() {
    registerState.isPaused = !registerState.isPaused;
    
    const pauseBtn = document.getElementById('pause-register-btn');
    if (registerState.isPaused) {
        pauseBtn.textContent = '▶️ 继续';
        updateRegisterUI('paused');
        updateCurrentTask('已暂停');
    } else {
        pauseBtn.textContent = '⏸️ 暂停';
        updateRegisterUI('running');
    }
}

// 停止注册
function stopBatchRegister() {
    if (confirm('确定要停止批量注册吗？')) {
        registerState.isRunning = false;
        registerState.isPaused = false;
        updateRegisterUI('stopped');
        updateCurrentTask('已停止');
        showToast('批量注册已停止', 'success');
    }
}

// 更新注册UI状态
function updateRegisterUI(status) {
    const startBtn = document.getElementById('start-register-btn');
    const pauseBtn = document.getElementById('pause-register-btn');
    const stopBtn = document.getElementById('stop-register-btn');
    const statusBadge = document.getElementById('register-status-badge');
    
    switch (status) {
        case 'running':
            startBtn.disabled = true;
            pauseBtn.disabled = false;
            stopBtn.disabled = false;
            statusBadge.textContent = '运行中';
            statusBadge.className = 'status-badge-sm running';
            break;
        case 'paused':
            startBtn.disabled = true;
            pauseBtn.disabled = false;
            stopBtn.disabled = false;
            statusBadge.textContent = '已暂停';
            statusBadge.className = 'status-badge-sm paused';
            break;
        case 'completed':
            startBtn.disabled = false;
            pauseBtn.disabled = true;
            stopBtn.disabled = true;
            statusBadge.textContent = '已完成';
            statusBadge.className = 'status-badge-sm completed';
            break;
        case 'stopped':
            startBtn.disabled = false;
            pauseBtn.disabled = true;
            stopBtn.disabled = true;
            statusBadge.textContent = '已停止';
            statusBadge.className = 'status-badge-sm stopped';
            break;
        default:
            startBtn.disabled = false;
            pauseBtn.disabled = true;
            stopBtn.disabled = true;
            statusBadge.textContent = '待开始';
            statusBadge.className = 'status-badge-sm';
    }
}

// 初始化结果列表
function initResultsList(emails) {
    const container = document.getElementById('register-results-list');
    container.innerHTML = emails.map((email, index) => `
        <div class="result-item" id="result-${index}">
            <span class="result-email">${escapeHtml(email)}</span>
            <span class="result-status pending" id="result-status-${index}">待处理</span>
        </div>
    `).join('');
    
    // 更新进度显示
    document.getElementById('progress-total').textContent = emails.length;
    document.getElementById('progress-success').textContent = '0';
    document.getElementById('progress-failed').textContent = '0';
    document.getElementById('progress-percent').textContent = '0%';
    document.getElementById('register-progress-bar').style.width = '0%';
}

// 更新结果状态
function updateResultStatus(index, status, message) {
    const itemEl = document.getElementById(`result-${index}`);
    const statusEl = document.getElementById(`result-status-${index}`);
    
    if (statusEl) {
        statusEl.className = `result-status ${status}`;
        statusEl.textContent = status === 'success' ? '成功' : 
                               status === 'failed' ? '失败' : 
                               status === 'processing' ? '处理中' : '待处理';
        
        // 如果有错误信息，添加title属性显示完整错误
        if (message && status === 'failed') {
            statusEl.title = message;
        }
    }
    
    // 如果失败，在结果项中显示简短错误信息
    if (itemEl && status === 'failed' && message) {
        // 检查是否已有错误信息元素
        let msgEl = itemEl.querySelector('.result-error');
        if (!msgEl) {
            msgEl = document.createElement('span');
            msgEl.className = 'result-error';
            itemEl.appendChild(msgEl);
        }
        // 截取错误信息前50个字符
        const shortMsg = message.length > 50 ? message.substring(0, 50) + '...' : message;
        msgEl.textContent = shortMsg;
        msgEl.title = message;
    }
}

// 更新进度
function updateProgress() {
    const total = registerState.emails.length;
    const processed = registerState.currentIndex + 1;
    const percent = Math.round((processed / total) * 100);
    
    document.getElementById('progress-total').textContent = total;
    document.getElementById('progress-success').textContent = registerState.successCount;
    document.getElementById('progress-failed').textContent = registerState.failedCount;
    document.getElementById('progress-percent').textContent = `${percent}%`;
    
    document.getElementById('register-progress-bar').style.width = `${percent}%`;
}

// 更新当前任务
function updateCurrentTask(text) {
    const taskEl = document.getElementById('current-task');
    if (taskEl) {
        taskEl.textContent = text;
    }
}

// 导出注册结果
function exportRegisterResults() {
    if (registerState.results.length === 0) {
        showToast('没有可导出的结果', 'error');
        return;
    }
    
    // 生成CSV内容
    let csv = '邮箱,状态,消息,时间\n';
    registerState.results.forEach((result, index) => {
        const email = registerState.emails[index];
        const status = result.success ? '成功' : '失败';
        const message = result.error || '';
        const time = new Date().toLocaleString();
        csv += `${email},${status},"${message}",${time}\n`;
    });
    
    // 下载文件
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `register-results-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    
    showToast('结果已导出', 'success');
}

// ============ 初始化 ============
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initModal();
    initAccountActions();
    initEmailConfigActions();
    initLogActions();
    initSettingsActions();
    initBatchRegisterActions();
    
    // 加载仪表板数据
    loadDashboard();
});
