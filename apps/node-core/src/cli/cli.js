/**
 * 命令行界面
 * 提供Qoder账号管理器的命令行操作接口
 */

import { createLogger } from '../utils/logger.js';
import { createAccountManager } from '../core/account-manager.js';
import { createBatchProcessor, BatchProcessingConfig } from '../core/batch-processor.js';
import { createEmailConfigManager, EmailConfig } from '../config/email-config.js';
import { RegistrationConfig, UserProfile } from '../core/account-manager.js';
import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';

/**
 * CLI配置类
 */
export class CLIConfig {
  constructor(options = {}) {
    this.configFile = options.configFile || 'cli-config.json';
    this.dataDir = options.dataDir || 'data';
    this.logDir = options.logDir || 'logs';
    this.verbose = options.verbose || false;
    this.interactive = options.interactive !== false;
  }

  async load() {
    try {
      const configData = await fs.readFile(this.configFile, 'utf8');
      const config = JSON.parse(configData);
      Object.assign(this, config);
    } catch (error) {
      // 配置文件不存在或无法读取，使用默认配置
    }
  }

  async save() {
    try {
      await fs.writeFile(this.configFile, JSON.stringify(this, null, 2), 'utf8');
    } catch (error) {
      throw new Error(`保存配置文件失败: ${error.message}`);
    }
  }
}

/**
 * 命令行界面类
 */
export class CLI {
  constructor(options = {}) {
    this.config = new CLIConfig(options);
    this.logger = createLogger({ 
      component: 'CLI',
      level: options.verbose ? 0 : 1 // DEBUG级别如果verbose为true
    });
    
    this.accountManager = null;
    this.emailConfigManager = null;
    this.batchProcessor = null;
    
    this.rl = null; // readline接口
  }

  /**
   * 初始化CLI
   */
  async initialize() {
    try {
      // 加载配置
      await this.config.load();
      
      // 初始化组件
      this.accountManager = createAccountManager({
        configDir: 'config',
        dataDir: this.config.dataDir,
        logDir: this.config.logDir
      });
      
      await this.accountManager.initialize();
      
      this.emailConfigManager = this.accountManager.emailConfigManager;
      
      this.batchProcessor = createBatchProcessor(this.accountManager, {
        logDir: this.config.logDir,
        progressCallback: this.config.interactive ? this.onProgressUpdate.bind(this) : null
      });
      
      await this.batchProcessor.initialize();
      
      // 初始化readline接口
      if (this.config.interactive) {
        this.rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
      }
      
      this.logger.info('CLI初始化完成');
      
    } catch (error) {
      this.logger.error('CLI初始化失败', error);
      throw error;
    }
  }

  /**
   * 解析命令行参数
   * @param {Array} args - 命令行参数
   * @returns {Object} 解析后的参数
   */
  parseArguments(args) {
    const parsed = {
      command: null,
      subcommand: null,
      options: {},
      positional: []
    };

    let i = 2; // 跳过 node 和脚本名
    
    while (i < args.length) {
      const arg = args[i];
      
      if (arg.startsWith('--')) {
        // 长选项
        const [key, value] = arg.slice(2).split('=');
        if (value !== undefined) {
          parsed.options[key] = value;
        } else if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          parsed.options[key] = args[++i];
        } else {
          parsed.options[key] = true;
        }
      } else if (arg.startsWith('-')) {
        // 短选项
        const key = arg.slice(1);
        if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          parsed.options[key] = args[++i];
        } else {
          parsed.options[key] = true;
        }
      } else {
        // 位置参数
        if (!parsed.command) {
          parsed.command = arg;
        } else if (!parsed.subcommand) {
          parsed.subcommand = arg;
        } else {
          parsed.positional.push(arg);
        }
      }
      
      i++;
    }

    return parsed;
  }

  /**
   * 运行CLI
   * @param {Array} args - 命令行参数
   */
  async run(args = process.argv) {
    try {
      const parsed = this.parseArguments(args);
      
      // 处理全局选项
      if (parsed.options.verbose || parsed.options.v) {
        this.config.verbose = true;
        this.logger.setLevel(0); // DEBUG级别
      }
      
      if (parsed.options.help || parsed.options.h || !parsed.command) {
        this.showHelp();
        return;
      }
      
      if (parsed.options.version) {
        this.showVersion();
        return;
      }

      // 初始化
      await this.initialize();

      // 执行命令
      await this.executeCommand(parsed);
      
    } catch (error) {
      this.logger.error('CLI执行失败', error);
      console.error(`错误: ${error.message}`);
      process.exit(1);
    } finally {
      await this.cleanup();
    }
  }

  /**
   * 执行命令
   * @param {Object} parsed - 解析后的参数
   */
  async executeCommand(parsed) {
    const { command, subcommand, options, positional } = parsed;

    switch (command) {
      case 'register':
        await this.handleRegisterCommand(subcommand, options, positional);
        break;
        
      case 'config':
        await this.handleConfigCommand(subcommand, options, positional);
        break;
        
      case 'credentials':
        await this.handleCredentialsCommand(subcommand, options, positional);
        break;
        
      case 'batch':
        await this.handleBatchCommand(subcommand, options, positional);
        break;
        
      case 'status':
        await this.handleStatusCommand(subcommand, options, positional);
        break;
        
      case 'setup':
        await this.handleSetupCommand(subcommand, options, positional);
        break;
        
      default:
        console.error(`未知命令: ${command}`);
        this.showHelp();
        process.exit(1);
    }
  }

  /**
   * 处理注册命令
   * @param {string} subcommand - 子命令
   * @param {Object} options - 选项
   * @param {Array} positional - 位置参数
   */
  async handleRegisterCommand(subcommand, options, positional) {
    switch (subcommand) {
      case 'single':
        await this.registerSingleAccount(options, positional);
        break;
        
      case 'batch':
        await this.registerBatchAccounts(options, positional);
        break;
        
      default:
        if (positional.length > 0) {
          // 默认为单个账号注册
          await this.registerSingleAccount(options, positional);
        } else {
          console.error('请指定要注册的邮箱地址或使用子命令');
          this.showRegisterHelp();
        }
    }
  }

  /**
   * 注册单个账号
   * @param {Object} options - 选项
   * @param {Array} positional - 位置参数
   */
  async registerSingleAccount(options, positional) {
    try {
      const email = positional[0] || options.email;
      if (!email) {
        throw new Error('请指定邮箱地址');
      }

      console.log(`开始注册账号: ${email}`);

      // 获取或创建注册配置
      const registrationConfig = await this.createRegistrationConfig(options);

      // 执行注册
      const result = await this.accountManager.registerSingleAccount(email, registrationConfig);

      // 显示结果
      if (result.success) {
        console.log(`✅ 账号注册成功: ${email}`);
        if (result.accountId) {
          console.log(`   账号ID: ${result.accountId}`);
        }
        if (result.verificationCompleted) {
          console.log(`   邮件验证: 已完成`);
        } else {
          console.log(`   邮件验证: 待完成`);
        }
      } else {
        console.log(`❌ 账号注册失败: ${email}`);
        console.log(`   错误: ${result.errorMessage}`);
      }

    } catch (error) {
      console.error(`注册失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 批量注册账号
   * @param {Object} options - 选项
   * @param {Array} positional - 位置参数
   */
  async registerBatchAccounts(options, positional) {
    try {
      let emails = [];

      // 获取邮箱列表
      if (options.file || options.f) {
        const filePath = options.file || options.f;
        const fileContent = await fs.readFile(filePath, 'utf8');
        emails = fileContent.split('\n')
          .map(line => line.trim())
          .filter(line => line && line.includes('@'));
      } else if (positional.length > 0) {
        emails = positional;
      } else {
        throw new Error('请指定邮箱列表文件或直接提供邮箱地址');
      }

      if (emails.length === 0) {
        throw new Error('没有找到有效的邮箱地址');
      }

      console.log(`开始批量注册 ${emails.length} 个账号`);

      // 创建配置
      const registrationConfig = await this.createRegistrationConfig(options);
      const batchConfig = this.createBatchConfig(options);

      // 执行批量注册
      const result = await this.batchProcessor.processBatch(
        emails, 
        registrationConfig, 
        batchConfig
      );

      // 显示结果
      console.log('\n📊 批量注册完成');
      console.log(`   总数: ${result.totalCount}`);
      console.log(`   成功: ${result.successCount}`);
      console.log(`   失败: ${result.failureCount}`);
      console.log(`   成功率: ${(result.getSuccessRate() * 100).toFixed(1)}%`);
      console.log(`   耗时: ${Math.round(result.duration / 1000)}秒`);

      // 显示失败的账号
      const failedAccounts = result.results.filter(r => !r.success);
      if (failedAccounts.length > 0) {
        console.log('\n❌ 失败的账号:');
        failedAccounts.forEach(account => {
          console.log(`   ${account.email}: ${account.errorMessage}`);
        });
      }

    } catch (error) {
      console.error(`批量注册失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 处理配置命令
   * @param {string} subcommand - 子命令
   * @param {Object} options - 选项
   * @param {Array} positional - 位置参数
   */
  async handleConfigCommand(subcommand, options, positional) {
    switch (subcommand) {
      case 'email':
        await this.configureEmail(options, positional);
        break;
        
      case 'list':
        await this.listConfigs(options);
        break;
        
      case 'test':
        await this.testEmailConfig(options, positional);
        break;
        
      default:
        console.error('请指定配置子命令: email, list, test');
        this.showConfigHelp();
    }
  }

  /**
   * 配置邮箱
   * @param {Object} options - 选项
   * @param {Array} positional - 位置参数
   */
  async configureEmail(options, positional) {
    try {
      const configName = positional[0] || options.name || 'default';
      
      let emailConfig;
      
      if (options.interactive !== false && this.config.interactive) {
        // 交互式配置
        emailConfig = await this.interactiveEmailConfig();
      } else {
        // 命令行参数配置
        emailConfig = this.createEmailConfigFromOptions(options);
      }

      // 验证配置
      const validation = emailConfig.validate();
      if (!validation.isValid) {
        throw new Error(`配置无效: ${validation.errors.join(', ')}`);
      }

      // 测试连接
      if (options.test !== false) {
        console.log('测试邮箱连接...');
        const testResult = await this.emailConfigManager.testConnection(emailConfig);
        
        if (!testResult.success) {
          throw new Error(`邮箱连接测试失败: ${testResult.error}`);
        }
        
        console.log('✅ 邮箱连接测试成功');
      }

      // 保存配置
      await this.emailConfigManager.addConfig(configName, emailConfig);
      
      console.log(`✅ 邮箱配置已保存: ${configName}`);

    } catch (error) {
      console.error(`配置邮箱失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 交互式邮箱配置
   * @returns {Promise<EmailConfig>} 邮箱配置
   */
  async interactiveEmailConfig() {
    console.log('\n📧 邮箱配置向导');
    
    const email = await this.question('邮箱地址: ');
    const password = await this.question('密码/授权码: ', true);
    
    // 尝试自动检测提供商
    const provider = this.emailConfigManager.detectProvider(email);
    
    if (provider) {
      const useProvider = await this.confirm(`检测到邮箱提供商: ${provider}，是否使用预设配置? (y/n): `);
      
      if (useProvider) {
        return this.emailConfigManager.createProviderConfig(provider, email, password);
      }
    }
    
    // 手动配置
    console.log('\n手动配置IMAP设置:');
    const imapServer = await this.question('IMAP服务器: ');
    const imapPort = parseInt(await this.question('IMAP端口 (默认993): ') || '993');
    const useSSL = await this.confirm('使用SSL? (y/n): ');
    
    return new EmailConfig({
      imapServer,
      imapPort,
      username: email,
      password,
      useSSL,
      provider: 'custom'
    });
  }

  /**
   * 从选项创建邮箱配置
   * @param {Object} options - 选项
   * @returns {EmailConfig} 邮箱配置
   */
  createEmailConfigFromOptions(options) {
    const email = options.email;
    const password = options.password;
    
    if (!email || !password) {
      throw new Error('请提供邮箱地址和密码');
    }

    // 尝试自动检测
    if (options.auto !== false) {
      const provider = this.emailConfigManager.detectProvider(email);
      if (provider) {
        return this.emailConfigManager.createProviderConfig(provider, email, password);
      }
    }

    // 手动配置
    return new EmailConfig({
      imapServer: options.imapServer || options.imap,
      imapPort: parseInt(options.imapPort || options.port || '993'),
      username: email,
      password: password,
      useSSL: options.ssl !== false,
      provider: 'custom'
    });
  }

  /**
   * 创建注册配置
   * @param {Object} options - 选项
   * @returns {Promise<RegistrationConfig>} 注册配置
   */
  async createRegistrationConfig(options) {
    // 获取邮箱配置
    const configName = options.emailConfig || options.config || 'default';
    const emailConfig = this.emailConfigManager.getConfig(configName);
    
    if (!emailConfig) {
      throw new Error(`邮箱配置不存在: ${configName}。请先使用 'config email' 命令配置邮箱`);
    }

    // 创建用户资料
    const userProfile = new UserProfile({
      firstName: options.firstName || options.fname || '',
      lastName: options.lastName || options.lname || '',
      company: options.company || '',
      country: options.country || 'CN',
      timezone: options.timezone || 'Asia/Shanghai'
    });

    // 创建注册配置
    return new RegistrationConfig({
      emailConfig,
      userProfile,
      headless: options.headless === true,
      timeout: parseInt(options.timeout || '60000'),
      retryAttempts: parseInt(options.retryAttempts || '3'),
      emailVerificationTimeout: parseInt(options.emailTimeout || '300000'),
      rateLimitDelay: parseInt(options.rateLimitDelay || '5000')
    });
  }

  /**
   * 创建批量配置
   * @param {Object} options - 选项
   * @returns {BatchProcessingConfig} 批量配置
   */
  createBatchConfig(options) {
    return new BatchProcessingConfig({
      concurrency: parseInt(options.concurrency || '1'),
      rateLimitDelay: parseInt(options.rateLimitDelay || '5000'),
      batchSize: parseInt(options.batchSize || '10'),
      retryFailedAccounts: options.noRetry !== true,
      maxRetryAttempts: parseInt(options.maxRetries || '2'),
      pauseBetweenBatches: parseInt(options.pauseBetweenBatches || '30000'),
      enableProgressReport: options.noProgress !== true,
      reportInterval: parseInt(options.reportInterval || '10000')
    });
  }

  /**
   * 列出配置
   * @param {Object} options - 选项
   */
  async listConfigs(options) {
    try {
      console.log('\n📋 邮箱配置列表:');
      
      const configs = this.emailConfigManager.listConfigs();
      
      if (configs.length === 0) {
        console.log('   没有找到邮箱配置');
        console.log('   使用 "config email" 命令添加配置');
        return;
      }
      
      configs.forEach((config, index) => {
        console.log(`   ${index + 1}. ${config.name}`);
        console.log(`      邮箱: ${config.username}`);
        console.log(`      提供商: ${config.provider}`);
        console.log(`      IMAP: ${config.imapServer}:${config.imapPort || 993}`);
        console.log('');
      });
      
    } catch (error) {
      console.error(`列出配置失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 测试邮箱配置
   * @param {Object} options - 选项
   * @param {Array} positional - 位置参数
   */
  async testEmailConfig(options, positional) {
    try {
      const configName = positional[0] || options.name || 'default';
      
      console.log(`测试邮箱配置: ${configName}`);
      
      const emailConfig = this.emailConfigManager.getConfig(configName);
      if (!emailConfig) {
        throw new Error(`配置不存在: ${configName}`);
      }
      
      const testResult = await this.emailConfigManager.testConnection(emailConfig);
      
      if (testResult.success) {
        console.log('✅ 邮箱连接测试成功');
        if (testResult.details) {
          console.log(`   总邮件数: ${testResult.details.totalMessages}`);
          console.log(`   新邮件数: ${testResult.details.newMessages}`);
        }
      } else {
        console.log('❌ 邮箱连接测试失败');
        console.log(`   错误: ${testResult.error}`);
      }
      
    } catch (error) {
      console.error(`测试配置失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 处理凭据命令
   * @param {string} subcommand - 子命令
   * @param {Object} options - 选项
   * @param {Array} positional - 位置参数
   */
  async handleCredentialsCommand(subcommand, options, positional) {
    switch (subcommand) {
      case 'list':
        await this.listCredentials(options);
        break;
        
      case 'export':
        await this.exportCredentials(options, positional);
        break;
        
      case 'get':
        await this.getCredentials(options, positional);
        break;
        
      case 'delete':
        await this.deleteCredentials(options, positional);
        break;
        
      default:
        console.error('请指定凭据子命令: list, export, get, delete');
        this.showCredentialsHelp();
    }
  }

  /**
   * 列出凭据
   * @param {Object} options - 选项
   */
  async listCredentials(options) {
    try {
      console.log('\n🔐 账号凭据列表:');
      
      const accounts = await this.accountManager.credentialStore.listAllAccounts();
      
      if (accounts.length === 0) {
        console.log('   没有找到账号凭据');
        return;
      }
      
      accounts.forEach((account, index) => {
        console.log(`   ${index + 1}. ${account.email}`);
        if (account.accountId) {
          console.log(`      账号ID: ${account.accountId}`);
        }
        console.log(`      创建时间: ${account.createdAt}`);
        if (account.provider) {
          console.log(`      提供商: ${account.provider}`);
        }
        console.log('');
      });
      
      console.log(`总计: ${accounts.length} 个账号`);
      
    } catch (error) {
      console.error(`列出凭据失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 导出凭据
   * @param {Object} options - 选项
   * @param {Array} positional - 位置参数
   */
  async exportCredentials(options, positional) {
    try {
      const outputPath = positional[0] || options.output || `credentials-export-${Date.now()}.json`;
      
      console.log(`导出凭据到: ${outputPath}`);
      
      const success = await this.accountManager.exportCredentials(outputPath);
      
      if (success) {
        console.log('✅ 凭据导出成功');
      } else {
        console.log('❌ 凭据导出失败');
      }
      
    } catch (error) {
      console.error(`导出凭据失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取单个凭据
   * @param {Object} options - 选项
   * @param {Array} positional - 位置参数
   */
  async getCredentials(options, positional) {
    try {
      const email = positional[0] || options.email;
      if (!email) {
        throw new Error('请指定邮箱地址');
      }
      
      const credentials = await this.accountManager.getStoredCredentials(email);
      
      if (credentials) {
        console.log(`\n🔐 账号凭据: ${email}`);
        console.log(`   密码: ${options.showPassword ? credentials.password : '***'}`);
        if (credentials.accountId) {
          console.log(`   账号ID: ${credentials.accountId}`);
        }
        console.log(`   创建时间: ${credentials.createdAt}`);
        if (credentials.lastVerified) {
          console.log(`   最后验证: ${credentials.lastVerified}`);
        }
      } else {
        console.log(`❌ 未找到账号凭据: ${email}`);
      }
      
    } catch (error) {
      console.error(`获取凭据失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 删除凭据
   * @param {Object} options - 选项
   * @param {Array} positional - 位置参数
   */
  async deleteCredentials(options, positional) {
    try {
      const email = positional[0] || options.email;
      if (!email) {
        throw new Error('请指定邮箱地址');
      }
      
      if (this.config.interactive && !options.force) {
        const confirmed = await this.confirm(`确定要删除账号凭据 ${email}? (y/n): `);
        if (!confirmed) {
          console.log('操作已取消');
          return;
        }
      }
      
      const success = await this.accountManager.credentialStore.deleteCredentials(email);
      
      if (success) {
        console.log(`✅ 账号凭据已删除: ${email}`);
      } else {
        console.log(`❌ 账号凭据不存在: ${email}`);
      }
      
    } catch (error) {
      console.error(`删除凭据失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 处理批量命令
   * @param {string} subcommand - 子命令
   * @param {Object} options - 选项
   * @param {Array} positional - 位置参数
   */
  async handleBatchCommand(subcommand, options, positional) {
    switch (subcommand) {
      case 'status':
        await this.showBatchStatus(options);
        break;
        
      case 'pause':
        await this.pauseBatch(options);
        break;
        
      case 'resume':
        await this.resumeBatch(options);
        break;
        
      case 'stop':
        await this.stopBatch(options);
        break;
        
      default:
        console.error('请指定批量子命令: status, pause, resume, stop');
        this.showBatchHelp();
    }
  }

  /**
   * 显示批量状态
   * @param {Object} options - 选项
   */
  async showBatchStatus(options) {
    try {
      const progress = this.batchProcessor.getCurrentProgress();
      
      if (!progress) {
        console.log('当前没有正在进行的批量处理');
        return;
      }
      
      console.log('\n📊 批量处理状态:');
      console.log(`   状态: ${progress.status}`);
      console.log(`   进度: ${progress.progressPercentage.toFixed(1)}% (${progress.processedCount}/${progress.totalCount})`);
      console.log(`   成功: ${progress.successCount}`);
      console.log(`   失败: ${progress.failureCount}`);
      console.log(`   成功率: ${progress.successRate.toFixed(1)}%`);
      console.log(`   当前批次: ${progress.currentBatch}/${progress.totalBatches}`);
      console.log(`   已用时间: ${Math.round(progress.elapsedTime / 1000)}秒`);
      
      if (progress.estimatedEndTime) {
        console.log(`   预计完成: ${new Date(progress.estimatedEndTime).toLocaleString()}`);
      }
      
      if (progress.currentEmail) {
        console.log(`   当前处理: ${progress.currentEmail}`);
      }
      
    } catch (error) {
      console.error(`获取批量状态失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 暂停批量处理
   * @param {Object} options - 选项
   */
  async pauseBatch(options) {
    try {
      this.batchProcessor.pause();
      console.log('✅ 批量处理已暂停');
    } catch (error) {
      console.error(`暂停批量处理失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 恢复批量处理
   * @param {Object} options - 选项
   */
  async resumeBatch(options) {
    try {
      this.batchProcessor.resume();
      console.log('✅ 批量处理已恢复');
    } catch (error) {
      console.error(`恢复批量处理失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 停止批量处理
   * @param {Object} options - 选项
   */
  async stopBatch(options) {
    try {
      if (this.config.interactive && !options.force) {
        const confirmed = await this.confirm('确定要停止批量处理? (y/n): ');
        if (!confirmed) {
          console.log('操作已取消');
          return;
        }
      }
      
      this.batchProcessor.stop();
      console.log('✅ 批量处理停止请求已发送');
    } catch (error) {
      console.error(`停止批量处理失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 处理状态命令
   * @param {string} subcommand - 子命令
   * @param {Object} options - 选项
   * @param {Array} positional - 位置参数
   */
  async handleStatusCommand(subcommand, options, positional) {
    try {
      console.log('\n📊 系统状态:');
      
      // 获取凭据统计
      const stats = await this.accountManager.credentialStore.getStatistics();
      console.log(`   总账号数: ${stats.totalAccounts}`);
      console.log(`   最近7天注册: ${stats.recentRegistrations}`);
      
      if (Object.keys(stats.byProvider).length > 0) {
        console.log('   按提供商分布:');
        for (const [provider, count] of Object.entries(stats.byProvider)) {
          console.log(`     ${provider}: ${count}`);
        }
      }
      
      // 获取错误处理统计
      const errorStats = this.accountManager.errorHandler.getAllStats();
      if (Object.keys(errorStats).length > 0) {
        console.log('\n   错误处理统计:');
        for (const [key, stat] of Object.entries(errorStats)) {
          console.log(`     ${key}: 成功率 ${(stat.successRate * 100).toFixed(1)}%`);
        }
      }
      
      // 批量处理状态
      const batchProgress = this.batchProcessor.getCurrentProgress();
      if (batchProgress) {
        console.log('\n   批量处理: 进行中');
        console.log(`     进度: ${batchProgress.progressPercentage.toFixed(1)}%`);
      } else {
        console.log('\n   批量处理: 空闲');
      }
      
    } catch (error) {
      console.error(`获取系统状态失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 处理设置命令
   * @param {string} subcommand - 子命令
   * @param {Object} options - 选项
   * @param {Array} positional - 位置参数
   */
  async handleSetupCommand(subcommand, options, positional) {
    try {
      console.log('\n🚀 Qoder账号管理器设置向导');
      console.log('');
      
      if (this.config.interactive) {
        // 交互式设置
        await this.interactiveSetup();
      } else {
        // 非交互式设置
        await this.nonInteractiveSetup(options);
      }
      
      console.log('\n✅ 设置完成！');
      console.log('');
      console.log('下一步:');
      console.log('  1. 使用 "register single <邮箱>" 注册单个账号');
      console.log('  2. 使用 "register batch --file <文件>" 批量注册账号');
      console.log('  3. 使用 "credentials list" 查看已注册的账号');
      
    } catch (error) {
      console.error(`设置失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 交互式设置
   */
  async interactiveSetup() {
    console.log('步骤 1: 配置邮箱设置');
    
    const setupEmail = await this.confirm('是否要配置邮箱? (y/n): ');
    if (setupEmail) {
      await this.configureEmail({}, []);
    }
    
    console.log('\n步骤 2: 配置CLI设置');
    
    const verbose = await this.confirm('启用详细输出? (y/n): ');
    this.config.verbose = verbose;
    
    const dataDir = await this.question(`数据目录 (默认: ${this.config.dataDir}): `) || this.config.dataDir;
    this.config.dataDir = dataDir;
    
    const logDir = await this.question(`日志目录 (默认: ${this.config.logDir}): `) || this.config.logDir;
    this.config.logDir = logDir;
    
    // 保存配置
    await this.config.save();
    console.log('✅ CLI配置已保存');
  }

  /**
   * 非交互式设置
   * @param {Object} options - 选项
   */
  async nonInteractiveSetup(options) {
    console.log('使用默认配置进行设置...');
    
    // 如果提供了邮箱配置选项，则配置邮箱
    if (options.email && options.password) {
      console.log('配置邮箱设置...');
      await this.configureEmail(options, []);
    }
    
    // 更新CLI配置
    if (options.dataDir) this.config.dataDir = options.dataDir;
    if (options.logDir) this.config.logDir = options.logDir;
    if (options.verbose) this.config.verbose = true;
    
    await this.config.save();
    console.log('✅ 配置已保存');
  }

  /**
   * 显示注册帮助
   */
  showRegisterHelp() {
    console.log(`
注册命令帮助:

用法:
  register single <邮箱> [选项]     注册单个账号
  register batch [选项]            批量注册账号

选项:
  --config <名称>                  使用指定的邮箱配置
  --headless                       使用无头浏览器模式
  --timeout <毫秒>                 设置超时时间
  --firstName <名字>               设置名字
  --lastName <姓氏>                设置姓氏
  --company <公司>                 设置公司名称

批量注册选项:
  --file <文件路径>                从文件读取邮箱列表
  --concurrency <数量>             并发处理数量
  --batchSize <大小>               批次大小
  --rateLimitDelay <毫秒>          速率限制延迟

示例:
  register single user@example.com
  register batch --file emails.txt --concurrency 2
    `);
  }

  /**
   * 显示配置帮助
   */
  showConfigHelp() {
    console.log(`
配置命令帮助:

用法:
  config email [选项]              配置邮箱设置
  config list                      列出所有配置
  config test <配置名称>           测试邮箱配置

邮箱配置选项:
  --name <名称>                    配置名称
  --email <邮箱>                   邮箱地址
  --password <密码>                密码或授权码
  --imapServer <服务器>            IMAP服务器地址
  --imapPort <端口>                IMAP端口
  --auto                           自动检测提供商设置
  --test                           配置后测试连接

示例:
  config email --email user@gmail.com --password app123
  config test default
    `);
  }

  /**
   * 显示凭据帮助
   */
  showCredentialsHelp() {
    console.log(`
凭据命令帮助:

用法:
  credentials list                 列出所有凭据
  credentials export [文件]        导出凭据
  credentials get <邮箱>           获取单个凭据
  credentials delete <邮箱>        删除凭据

选项:
  --output <文件>                  导出文件路径
  --showPassword                   显示密码
  --force                          强制执行，不询问确认

示例:
  credentials list
  credentials export backup.json
  credentials get user@example.com --showPassword
    `);
  }

  /**
   * 显示批量帮助
   */
  showBatchHelp() {
    console.log(`
批量命令帮助:

用法:
  batch status                     查看批量处理状态
  batch pause                      暂停批量处理
  batch resume                     恢复批量处理
  batch stop                       停止批量处理

选项:
  --force                          强制执行，不询问确认

示例:
  batch status
  batch pause
  batch resume
  batch stop --force
    `);
  }

  /**
   * 询问用户输入
   * @param {string} prompt - 提示信息
   * @param {boolean} hidden - 是否隐藏输入
   * @returns {Promise<string>} 用户输入
   */
  async question(prompt, hidden = false) {
    return new Promise((resolve) => {
      if (hidden) {
        // 隐藏输入（用于密码）
        process.stdout.write(prompt);
        process.stdin.setRawMode(true);
        process.stdin.resume();
        
        let input = '';
        const onData = (char) => {
          char = char.toString();
          
          if (char === '\n' || char === '\r' || char === '\u0004') {
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdin.removeListener('data', onData);
            process.stdout.write('\n');
            resolve(input);
          } else if (char === '\u0003') {
            process.exit();
          } else if (char === '\u007f') {
            if (input.length > 0) {
              input = input.slice(0, -1);
              process.stdout.write('\b \b');
            }
          } else {
            input += char;
            process.stdout.write('*');
          }
        };
        
        process.stdin.on('data', onData);
      } else {
        this.rl.question(prompt, resolve);
      }
    });
  }

  /**
   * 确认询问
   * @param {string} prompt - 提示信息
   * @returns {Promise<boolean>} 确认结果
   */
  async confirm(prompt) {
    const answer = await this.question(prompt);
    return ['y', 'yes', '是', 'true', '1'].includes(answer.toLowerCase());
  }

  /**
   * 显示帮助信息
   */
  showHelp() {
    console.log(`
Qoder账号管理器 CLI

用法: node cli.js <命令> [子命令] [选项]

命令:
  register single <邮箱>     注册单个账号
  register batch             批量注册账号
  config email               配置邮箱设置
  config list                列出所有配置
  config test                测试邮箱配置
  credentials list           列出所有凭据
  credentials export         导出凭据
  batch status               查看批量处理状态
  status                     查看系统状态
  setup                      初始化设置向导

全局选项:
  --verbose, -v              详细输出
  --help, -h                 显示帮助
  --version                  显示版本

示例:
  node cli.js register single user@example.com --config myconfig
  node cli.js register batch --file emails.txt --concurrency 2
  node cli.js config email --email user@gmail.com --password pass123
  node cli.js credentials list
    `);
  }

  /**
   * 显示版本信息
   */
  showVersion() {
    console.log('Qoder账号管理器 v1.0.0');
  }

  /**
   * 清理资源
   */
  async cleanup() {
    try {
      if (this.rl) {
        this.rl.close();
      }
      
      if (this.batchProcessor) {
        await this.batchProcessor.close();
      }
      
      if (this.accountManager) {
        await this.accountManager.close();
      }
      
    } catch (error) {
      this.logger.error('清理资源失败', error);
    }
  }
}

/**
 * 创建CLI实例
 * @param {Object} options - 选项
 * @returns {CLI} CLI实例
 */
export function createCLI(options = {}) {
  return new CLI(options);
}