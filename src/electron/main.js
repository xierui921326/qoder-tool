/**
 * Electron主进程
 * 负责创建和管理应用窗口
 */
import { app, BrowserWindow, Menu, ipcMain, dialog, shell } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createWebServer } from './web-server.js';
import { createLogger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logger = createLogger();

/**
 * Electron应用管理器
 */
class ElectronApp {
  constructor() {
    this.mainWindow = null;
    this.webServer = null;
    this.isDevelopment = process.env.NODE_ENV === 'development';
  }

  /**
   * 初始化应用
   */
  async initialize() {
    try {
      // 设置应用事件监听器
      this.setupAppEventListeners();
      
      // 设置IPC通信
      this.setupIpcHandlers();
      
      // 等待应用准备就绪
      await app.whenReady();
      
      // 启动Web服务器
      await this.startWebServer();
      
      // 创建主窗口
      await this.createMainWindow();
      
      // 设置应用菜单
      this.setupApplicationMenu();
      
      logger.info('Electron应用初始化完成');
      
    } catch (error) {
      logger.error('Electron应用初始化失败', error);
      app.quit();
    }
  }

  /**
   * 启动Web服务器
   */
  async startWebServer() {
    try {
      this.webServer = await createWebServer();
      const port = this.webServer.port;
      logger.info('Web服务器启动成功', { port });
    } catch (error) {
      logger.error('Web服务器启动失败', error);
      throw error;
    }
  }

  /**
   * 创建主窗口
   */
  async createMainWindow() {
    // 创建浏览器窗口
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        preload: join(__dirname, 'preload.js')
      },
      icon: this.getAppIcon(),
      title: 'Qoder账号管理器',
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      show: false // 先隐藏，加载完成后显示
    });

    // 加载应用页面
    const serverUrl = `http://localhost:${this.webServer.port}`;
    await this.mainWindow.loadURL(serverUrl);

    // 窗口准备好后显示
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show();
      
      // 开发模式下打开开发者工具
      if (this.isDevelopment) {
        this.mainWindow.webContents.openDevTools();
      }
    });

    // 窗口关闭事件
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    // 处理外部链接
    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    logger.info('主窗口创建完成');
  }

  /**
   * 设置应用事件监听器
   */
  setupAppEventListeners() {
    // 所有窗口关闭时退出应用（除了macOS）
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    // macOS上点击dock图标时重新创建窗口
    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await this.createMainWindow();
      }
    });

    // 应用退出前清理
    app.on('before-quit', () => {
      if (this.webServer) {
        this.webServer.close();
      }
    });

    // 处理证书错误（开发环境）
    app.on('certificate-error', (event, _webContents, _url, _error, _certificate, callback) => {
      if (this.isDevelopment) {
        event.preventDefault();
        callback(true);
      } else {
        callback(false);
      }
    });
  }

  /**
   * 设置IPC通信处理器
   */
  setupIpcHandlers() {
    // 获取应用版本
    ipcMain.handle('app:getVersion', () => {
      return app.getVersion();
    });

    // 获取应用路径
    ipcMain.handle('app:getPath', (_event, name) => {
      return app.getPath(name);
    });

    // 显示消息框
    ipcMain.handle('dialog:showMessageBox', async (_event, options) => {
      const result = await dialog.showMessageBox(this.mainWindow, options);
      return result;
    });

    // 显示错误对话框
    ipcMain.handle('dialog:showErrorBox', (_event, title, content) => {
      dialog.showErrorBox(title, content);
    });

    // 选择文件
    ipcMain.handle('dialog:showOpenDialog', async (_event, options) => {
      const result = await dialog.showOpenDialog(this.mainWindow, options);
      return result;
    });

    // 保存文件
    ipcMain.handle('dialog:showSaveDialog', async (_event, options) => {
      const result = await dialog.showSaveDialog(this.mainWindow, options);
      return result;
    });

    // 打开外部链接
    ipcMain.handle('shell:openExternal', (_event, url) => {
      return shell.openExternal(url);
    });

    // 显示文件夹
    ipcMain.handle('shell:showItemInFolder', (_event, fullPath) => {
      return shell.showItemInFolder(fullPath);
    });

    // 重启应用
    ipcMain.handle('app:restart', () => {
      app.relaunch();
      app.exit();
    });

    // 退出应用
    ipcMain.handle('app:quit', () => {
      app.quit();
    });

    // 最小化窗口
    ipcMain.handle('window:minimize', () => {
      if (this.mainWindow) {
        this.mainWindow.minimize();
      }
    });

    // 最大化/还原窗口
    ipcMain.handle('window:toggleMaximize', () => {
      if (this.mainWindow) {
        if (this.mainWindow.isMaximized()) {
          this.mainWindow.unmaximize();
        } else {
          this.mainWindow.maximize();
        }
      }
    });

    // 关闭窗口
    ipcMain.handle('window:close', () => {
      if (this.mainWindow) {
        this.mainWindow.close();
      }
    });
  }

  /**
   * 设置应用菜单
   */
  setupApplicationMenu() {
    const template = [
      {
        label: '文件',
        submenu: [
          {
            label: '新建配置',
            accelerator: 'CmdOrCtrl+N',
            click: () => {
              this.mainWindow.webContents.send('menu:new-config');
            }
          },
          {
            label: '打开配置',
            accelerator: 'CmdOrCtrl+O',
            click: () => {
              this.mainWindow.webContents.send('menu:open-config');
            }
          },
          {
            label: '保存配置',
            accelerator: 'CmdOrCtrl+S',
            click: () => {
              this.mainWindow.webContents.send('menu:save-config');
            }
          },
          { type: 'separator' },
          {
            label: '导出数据',
            click: () => {
              this.mainWindow.webContents.send('menu:export-data');
            }
          },
          {
            label: '导入数据',
            click: () => {
              this.mainWindow.webContents.send('menu:import-data');
            }
          },
          { type: 'separator' },
          {
            label: '退出',
            accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
            click: () => {
              app.quit();
            }
          }
        ]
      },
      {
        label: '编辑',
        submenu: [
          { label: '撤销', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
          { label: '重做', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
          { type: 'separator' },
          { label: '剪切', accelerator: 'CmdOrCtrl+X', role: 'cut' },
          { label: '复制', accelerator: 'CmdOrCtrl+C', role: 'copy' },
          { label: '粘贴', accelerator: 'CmdOrCtrl+V', role: 'paste' },
          { label: '全选', accelerator: 'CmdOrCtrl+A', role: 'selectall' }
        ]
      },
      {
        label: '视图',
        submenu: [
          { label: '重新加载', accelerator: 'CmdOrCtrl+R', role: 'reload' },
          { label: '强制重新加载', accelerator: 'CmdOrCtrl+Shift+R', role: 'forceReload' },
          { label: '开发者工具', accelerator: 'F12', role: 'toggleDevTools' },
          { type: 'separator' },
          { label: '实际大小', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
          { label: '放大', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
          { label: '缩小', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
          { type: 'separator' },
          { label: '全屏', accelerator: 'F11', role: 'togglefullscreen' }
        ]
      },
      {
        label: '工具',
        submenu: [
          {
            label: '批量注册',
            accelerator: 'CmdOrCtrl+B',
            click: () => {
              this.mainWindow.webContents.send('menu:batch-register');
            }
          },
          {
            label: '账号管理',
            accelerator: 'CmdOrCtrl+M',
            click: () => {
              this.mainWindow.webContents.send('menu:account-management');
            }
          },
          {
            label: '邮件配置',
            accelerator: 'CmdOrCtrl+E',
            click: () => {
              this.mainWindow.webContents.send('menu:email-config');
            }
          },
          { type: 'separator' },
          {
            label: '查看日志',
            click: () => {
              this.mainWindow.webContents.send('menu:view-logs');
            }
          },
          {
            label: '清理数据',
            click: () => {
              this.mainWindow.webContents.send('menu:cleanup-data');
            }
          }
        ]
      },
      {
        label: '帮助',
        submenu: [
          {
            label: '使用说明',
            click: () => {
              shell.openExternal('https://github.com/your-repo/qoder-account-manager#readme');
            }
          },
          {
            label: '报告问题',
            click: () => {
              shell.openExternal('https://github.com/your-repo/qoder-account-manager/issues');
            }
          },
          { type: 'separator' },
          {
            label: '关于',
            click: () => {
              dialog.showMessageBox(this.mainWindow, {
                type: 'info',
                title: '关于 Qoder账号管理器',
                message: 'Qoder账号管理器',
                detail: `版本: ${app.getVersion()}\n\n一个自动化Qoder账号注册和管理的桌面应用程序。`,
                buttons: ['确定']
              });
            }
          }
        ]
      }
    ];

    // macOS特殊处理
    if (process.platform === 'darwin') {
      template.unshift({
        label: app.getName(),
        submenu: [
          { label: '关于 ' + app.getName(), role: 'about' },
          { type: 'separator' },
          { label: '服务', role: 'services', submenu: [] },
          { type: 'separator' },
          { label: '隐藏 ' + app.getName(), accelerator: 'Command+H', role: 'hide' },
          { label: '隐藏其他', accelerator: 'Command+Shift+H', role: 'hideothers' },
          { label: '显示全部', role: 'unhide' },
          { type: 'separator' },
          { label: '退出', accelerator: 'Command+Q', click: () => app.quit() }
        ]
      });
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  /**
   * 获取应用图标路径
   */
  getAppIcon() {
    const iconPath = join(__dirname, '../web/public/icon.svg');
    return iconPath;
  }
}

// 创建应用实例并初始化
const electronApp = new ElectronApp();
electronApp.initialize().catch(error => {
  logger.error('应用启动失败', error);
  app.quit();
});