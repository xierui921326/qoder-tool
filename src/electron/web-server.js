/**
 * Web服务器
 * 为Electron应用提供HTTP服务
 */
import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logger = createLogger();

/**
 * 创建Web服务器
 * @returns {Promise<{app: Express, server: Server, port: number}>}
 */
export async function createWebServer() {
  const app = express();
  
  // 中间件配置
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // 静态文件服务
  const publicPath = join(__dirname, '../web/public');
  app.use(express.static(publicPath));
  
  // API路由
  setupApiRoutes(app);
  
  // 主页路由
  app.get('/', (req, res) => {
    res.sendFile(join(publicPath, 'index.html'));
  });
  
  // 启动服务器
  const port = await findAvailablePort(3000);
  const server = app.listen(port, 'localhost', () => {
    logger.info('Web服务器启动成功', { port });
  });
  
  return { app, server, port, close: () => server.close() };
}

/**
 * 设置API路由
 * @param {Express} app - Express应用实例
 */
function setupApiRoutes(app) {
  // 健康检查
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  
  // 获取应用信息
  app.get('/api/app-info', (req, res) => {
    res.json({
      name: 'Qoder账号管理器',
      version: '1.0.0',
      description: '自动化Qoder账号注册和管理工具'
    });
  });
  
  // 账号管理API
  app.get('/api/accounts', async (req, res) => {
    try {
      // TODO: 实现账号列表获取
      res.json({ accounts: [] });
    } catch (error) {
      logger.error('获取账号列表失败', error);
      res.status(500).json({ error: '获取账号列表失败' });
    }
  });
  
  app.post('/api/accounts/register', async (req, res) => {
    try {
      // const { email, config } = req.body;
      // TODO: 实现账号注册
      res.json({ success: true, message: '注册请求已提交' });
    } catch (error) {
      logger.error('账号注册失败', error);
      res.status(500).json({ error: '账号注册失败' });
    }
  });
  
  app.post('/api/accounts/batch-register', async (req, res) => {
    try {
      // const { emails, config } = req.body;
      // TODO: 实现批量注册
      res.json({ success: true, message: '批量注册请求已提交' });
    } catch (error) {
      logger.error('批量注册失败', error);
      res.status(500).json({ error: '批量注册失败' });
    }
  });
  
  // 配置管理API
  app.get('/api/config', async (req, res) => {
    try {
      // TODO: 实现配置获取
      res.json({ config: {} });
    } catch (error) {
      logger.error('获取配置失败', error);
      res.status(500).json({ error: '获取配置失败' });
    }
  });
  
  app.post('/api/config', async (req, res) => {
    try {
      // const config = req.body;
      // TODO: 实现配置保存
      res.json({ success: true, message: '配置保存成功' });
    } catch (error) {
      logger.error('保存配置失败', error);
      res.status(500).json({ error: '保存配置失败' });
    }
  });
  
  // 日志API
  app.get('/api/logs', async (req, res) => {
    try {
      // TODO: 实现日志获取
      res.json({ logs: [] });
    } catch (error) {
      logger.error('获取日志失败', error);
      res.status(500).json({ error: '获取日志失败' });
    }
  });
  
  // 错误处理中间件
  app.use((error, req, res, _next) => {
    logger.error('API错误', error);
    res.status(500).json({ error: '服务器内部错误' });
  });
}

/**
 * 查找可用端口
 * @param {number} startPort - 起始端口
 * @returns {Promise<number>} 可用端口
 */
async function findAvailablePort(startPort) {
  const net = await import('net');
  
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    
    server.listen(startPort, (err) => {
      if (err) {
        // 端口被占用，尝试下一个
        server.close();
        findAvailablePort(startPort + 1).then(resolve).catch(reject);
      } else {
        const port = server.address().port;
        server.close(() => {
          resolve(port);
        });
      }
    });
    
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        // 端口被占用，尝试下一个
        findAvailablePort(startPort + 1).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });
  });
}