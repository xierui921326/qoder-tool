/**
 * Electron预加载脚本
 * 提供安全的IPC通信接口
 */
import { contextBridge, ipcRenderer } from 'electron';

// 暴露安全的API到渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 应用相关API
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getPath: (name) => ipcRenderer.invoke('app:getPath', name),
    restart: () => ipcRenderer.invoke('app:restart'),
    quit: () => ipcRenderer.invoke('app:quit')
  },

  // 窗口控制API
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
    close: () => ipcRenderer.invoke('window:close')
  },

  // 对话框API
  dialog: {
    showMessageBox: (options) => ipcRenderer.invoke('dialog:showMessageBox', options),
    showErrorBox: (title, content) => ipcRenderer.invoke('dialog:showErrorBox', title, content),
    showOpenDialog: (options) => ipcRenderer.invoke('dialog:showOpenDialog', options),
    showSaveDialog: (options) => ipcRenderer.invoke('dialog:showSaveDialog', options)
  },

  // Shell API
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
    showItemInFolder: (fullPath) => ipcRenderer.invoke('shell:showItemInFolder', fullPath)
  },

  // 菜单事件监听
  menu: {
    onNewConfig: (callback) => ipcRenderer.on('menu:new-config', callback),
    onOpenConfig: (callback) => ipcRenderer.on('menu:open-config', callback),
    onSaveConfig: (callback) => ipcRenderer.on('menu:save-config', callback),
    onExportData: (callback) => ipcRenderer.on('menu:export-data', callback),
    onImportData: (callback) => ipcRenderer.on('menu:import-data', callback),
    onBatchRegister: (callback) => ipcRenderer.on('menu:batch-register', callback),
    onAccountManagement: (callback) => ipcRenderer.on('menu:account-management', callback),
    onEmailConfig: (callback) => ipcRenderer.on('menu:email-config', callback),
    onViewLogs: (callback) => ipcRenderer.on('menu:view-logs', callback),
    onCleanupData: (callback) => ipcRenderer.on('menu:cleanup-data', callback),
    
    // 移除监听器
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
  },

  // 通知API
  notification: {
    show: (title, body, options = {}) => {
      if (Notification.permission === 'granted') {
        return new Notification(title, { body, ...options });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            return new Notification(title, { body, ...options });
          }
        });
      }
    }
  },

  // 系统信息API
  system: {
    platform: process.platform,
    arch: process.arch,
    version: process.version
  }
});

// 日志记录函数
contextBridge.exposeInMainWorld('logger', {
  info: (message, data) => console.log('[INFO]', message, data),
  warn: (message, data) => console.warn('[WARN]', message, data),
  error: (message, data) => console.error('[ERROR]', message, data),
  debug: (message, data) => console.debug('[DEBUG]', message, data)
});

// 工具函数
contextBridge.exposeInMainWorld('utils', {
  // 格式化日期
  formatDate: (date) => {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date(date));
  },

  // 格式化文件大小
  formatFileSize: (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  // 生成UUID
  generateUUID: () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },

  // 验证邮箱格式
  validateEmail: (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  },

  // 延迟函数
  delay: (ms) => new Promise(resolve => setTimeout(resolve, ms))
});

// 在页面加载完成后初始化
window.addEventListener('DOMContentLoaded', () => {
  console.log('Electron预加载脚本已加载');
  
  // 请求通知权限
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
});