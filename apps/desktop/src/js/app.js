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

// ============ 初始化 ============
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initModal();
    initAccountActions();
    initEmailConfigActions();
    initLogActions();
    initSettingsActions();
    
    // 加载仪表板数据
    loadDashboard();
});
