/**
 * Qoder注册机器人
 * 处理Qoder账号注册的浏览器自动化
 */

import { chromium } from 'playwright';
import { createLogger } from '../utils/logger.js';

/**
 * Qoder注册机器人类
 * 负责自动化Qoder账号注册流程
 */
export class RegistrationBot {
  constructor(options = {}) {
    this.options = {
      headless: options.headless === true, // 默认可见模式，便于调试
      timeout: options.timeout || 30000, // 30秒超时
      retryAttempts: options.retryAttempts || 3,
      screenshotOnError: options.screenshotOnError !== false,
      humanlike: options.humanlike !== false, // 默认启用拟人化输入
      ...options
    };
    
    this.logger = createLogger({ component: 'RegistrationBot' });
    this.browser = null;
    this.page = null;
    this.context = null;
  }

  /**
   * 随机延迟（模拟人类行为）
   * @param {number} min - 最小延迟（毫秒）
   * @param {number} max - 最大延迟（毫秒）
   */
  async randomDelay(min = 100, max = 300) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await this.page.waitForTimeout(delay);
  }

  /**
   * 拟人化输入文本（逐字符输入，带随机延迟）
   * @param {ElementHandle} element - 输入元素
   * @param {string} text - 要输入的文本
   */
  async humanType(element, text) {
    // 先点击元素获取焦点
    await element.click();
    await this.randomDelay(200, 400);
    
    // 清空现有内容
    await element.fill('');
    await this.randomDelay(100, 200);
    
    // 逐字符输入
    for (const char of text) {
      await element.type(char, { delay: 0 });
      // 每个字符之间随机延迟 50-150ms，模拟打字速度
      await this.randomDelay(50, 150);
    }
    
    // 输入完成后稍作停顿
    await this.randomDelay(200, 500);
  }

  /**
   * 拟人化移动鼠标到元素
   * @param {ElementHandle} element - 目标元素
   */
  async humanMoveTo(element) {
    const box = await element.boundingBox();
    if (box) {
      // 移动到元素中心附近的随机位置
      const x = box.x + box.width / 2 + (Math.random() - 0.5) * 10;
      const y = box.y + box.height / 2 + (Math.random() - 0.5) * 10;
      await this.page.mouse.move(x, y, { steps: 10 });
      await this.randomDelay(100, 200);
    }
  }

  /**
   * 拟人化点击元素
   * @param {ElementHandle} element - 目标元素
   */
  async humanClick(element) {
    await this.humanMoveTo(element);
    await element.click();
    await this.randomDelay(200, 400);
  }

  /**
   * 初始化浏览器
   * @returns {Promise<boolean>} 初始化是否成功
   */
  async initialize() {
    try {
      this.logger.info('初始化浏览器', { headless: this.options.headless });
      
      // 启动浏览器
      this.browser = await chromium.launch({
        headless: this.options.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled'
        ]
      });

      // 创建浏览器上下文，使用更真实的配置
      this.context = await this.browser.newContext({
        viewport: { width: 1366, height: 768 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        locale: 'en-US',
        timezoneId: 'America/New_York',
        geolocation: { longitude: -73.935242, latitude: 40.730610 },
        permissions: ['geolocation']
      });

      // 创建页面
      this.page = await this.context.newPage();
      
      // 注入脚本来隐藏自动化特征
      await this.page.addInitScript(() => {
        // 隐藏 webdriver 属性
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined
        });
        
        // 修改 plugins 长度
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5]
        });
        
        // 修改 languages
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en']
        });
      });
      
      // 设置默认超时
      this.page.setDefaultTimeout(this.options.timeout);
      
      this.logger.info('浏览器初始化完成');
      return true;
      
    } catch (error) {
      this.logger.error('浏览器初始化失败', error);
      await this.cleanup();
      return false;
    }
  }

  /**
   * 导航到Qoder注册页面
   * @returns {Promise<boolean>} 导航是否成功
   */
  async navigateToRegistration() {
    if (!this.page) {
      throw new Error('浏览器未初始化，请先调用initialize()');
    }

    try {
      this.logger.info('导航到Qoder注册页面');
      
      // 直接访问注册页面
      await this.page.goto('https://qoder.com/users/sign-up', { 
        waitUntil: 'domcontentloaded',
        timeout: this.options.timeout 
      });

      // 等待页面加载完成
      await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {
        this.logger.warn('网络空闲等待超时，继续执行');
      });

      // 模拟人类浏览行为：随机等待
      await this.randomDelay(1500, 3000);

      this.logger.info('成功导航到Qoder注册页面', { url: this.page.url() });
      return true;
      
    } catch (error) {
      this.logger.error('导航到注册页面失败', error);
      
      if (this.options.screenshotOnError) {
        await this.takeScreenshot('navigation-error');
      }
      
      return false;
    }
  }

  /**
   * 检查当前页面是否为注册页面
   * @returns {Promise<boolean>} 是否为注册页面
   */
  async isRegistrationPage() {
    try {
      // 检查页面标题和URL
      const title = await this.page.title();
      const url = this.page.url();
      
      const registrationIndicators = [
        title.toLowerCase().includes('register'),
        title.toLowerCase().includes('signup'),
        title.toLowerCase().includes('注册'),
        url.includes('register'),
        url.includes('signup')
      ];

      if (registrationIndicators.some(indicator => indicator)) {
        return true;
      }

      // 检查页面内容
      const registrationFormSelectors = [
        'form[action*="register"]',
        'form[action*="signup"]',
        'input[type="email"]',
        'input[name*="email"]',
        'input[name*="password"]'
      ];

      for (const selector of registrationFormSelectors) {
        const element = await this.page.$(selector);
        if (element) {
          return true;
        }
      }

      return false;
    } catch (error) {
      this.logger.error('检查注册页面时出错', error);
      return false;
    }
  }

  /**
   * 生成随机名字
   * @returns {Object} 包含 firstName 和 lastName
   */
  generateRandomName() {
    const firstNames = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Quinn', 'Avery', 'Parker', 'Skyler'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Wilson', 'Moore'];
    
    return {
      firstName: firstNames[Math.floor(Math.random() * firstNames.length)],
      lastName: lastNames[Math.floor(Math.random() * lastNames.length)]
    };
  }

  /**
   * 填写注册表单（Qoder 分步骤表单，拟人化输入）
   * 步骤1：填写 First Name、Last Name、Email，勾选同意条款
   * 步骤2：填写 Password
   * @param {string} email - 邮箱地址
   * @param {string} password - 密码
   * @param {Object} profile - 用户资料（可选）
   * @returns {Promise<boolean>} 填写是否成功
   */
  async fillRegistrationForm(email, password, profile = {}) {
    if (!this.page) {
      throw new Error('浏览器未初始化');
    }

    try {
      this.logger.info('开始填写注册表单（分步骤，拟人化）', { email });

      // 等待页面稳定
      await this.randomDelay(1000, 2000);

      // 截图查看当前页面状态
      await this.takeScreenshot('before-fill');

      // 生成随机名字（如果没有提供）
      const { firstName, lastName } = profile.firstName && profile.lastName 
        ? profile 
        : this.generateRandomName();

      // ========== 步骤 1：填写基本信息 ==========
      this.logger.info('步骤 1：填写基本信息（拟人化输入）');

      // 1. 填写 First Name（拟人化）
      const firstNameField = await this.page.$('#basic_firstName');
      if (firstNameField && await firstNameField.isVisible()) {
        await this.humanType(firstNameField, firstName);
        this.logger.info('First Name 已填写', { value: firstName });
      } else {
        this.logger.warn('First Name 字段不可见，跳过');
      }

      // 随机停顿，模拟人类思考
      await this.randomDelay(300, 800);

      // 2. 填写 Last Name（拟人化）
      const lastNameField = await this.page.$('#basic_lastName');
      if (lastNameField && await lastNameField.isVisible()) {
        await this.humanType(lastNameField, lastName);
        this.logger.info('Last Name 已填写', { value: lastName });
      } else {
        this.logger.warn('Last Name 字段不可见，跳过');
      }

      // 随机停顿
      await this.randomDelay(300, 800);

      // 3. 填写 Email（拟人化）
      const emailSelectors = [
        '#basic_email',
        'input[id="basic_email"]',
        'input[type="email"]',
        'input[placeholder*="email" i]'
      ];

      let emailFilled = false;
      for (const selector of emailSelectors) {
        try {
          const emailField = await this.page.$(selector);
          if (emailField && await emailField.isVisible()) {
            await this.humanType(emailField, email);
            emailFilled = true;
            this.logger.info('Email 已填写', { selector });
            break;
          }
        } catch (error) {
          continue;
        }
      }

      if (!emailFilled) {
        await this.takeScreenshot('email-not-found');
        throw new Error('无法找到邮箱输入字段');
      }

      // 随机停顿
      await this.randomDelay(500, 1000);

      // 4. 勾选同意条款（拟人化点击）
      await this.handleAgreementCheckboxes();

      // 截图步骤1完成状态
      await this.takeScreenshot('step1-filled');

      // 随机停顿，模拟阅读条款
      await this.randomDelay(800, 1500);

      // 5. 点击 Continue 按钮进入步骤2（拟人化点击）
      this.logger.info('点击 Continue 按钮进入步骤2');
      const continueBtn = this.page.locator('button', { hasText: 'Continue' });
      if (await continueBtn.count() > 0 && await continueBtn.first().isVisible()) {
        const btnElement = await continueBtn.first().elementHandle();
        if (btnElement) {
          await this.humanClick(btnElement);
        } else {
          await continueBtn.first().click();
        }
        // 等待页面过渡
        await this.randomDelay(2000, 3000);
      } else {
        this.logger.warn('未找到 Continue 按钮，尝试其他方式');
      }

      // ========== 步骤 2：填写密码 ==========
      this.logger.info('步骤 2：填写密码（拟人化输入）');

      // 等待密码字段出现
      const passwordSelectors = [
        '#basic_password',
        'input[id="basic_password"]',
        'input[type="password"]'
      ];

      let passwordFilled = false;
      for (const selector of passwordSelectors) {
        try {
          // 等待密码字段可见
          await this.page.waitForSelector(selector, { state: 'visible', timeout: 8000 }).catch(() => {});
          
          const passwordField = await this.page.$(selector);
          if (passwordField && await passwordField.isVisible()) {
            await this.humanType(passwordField, password);
            passwordFilled = true;
            this.logger.info('Password 已填写', { selector });
            break;
          }
        } catch (error) {
          continue;
        }
      }

      if (!passwordFilled) {
        await this.takeScreenshot('password-not-found');
        throw new Error('无法找到密码输入字段');
      }

      // 截图步骤2完成状态
      await this.takeScreenshot('step2-filled');

      this.logger.info('注册表单填写完成', { firstName, lastName, email });
      return true;

    } catch (error) {
      this.logger.error('填写注册表单失败', error);
      
      if (this.options.screenshotOnError) {
        await this.takeScreenshot('form-fill-error');
      }
      
      return false;
    }
  }

  /**
   * 填写可选字段
   * @param {string[]} selectors - 选择器数组
   * @param {string} value - 要填写的值
   */
  async fillOptionalField(selectors, value) {
    for (const selector of selectors) {
      try {
        const elementFound = await this.waitForDynamicContent(selector, { timeout: 3000 });
        if (elementFound) {
          const field = await this.page.$(selector);
          if (field) {
            await field.fill(''); // 清空字段
            await field.fill(value);
            this.logger.info('可选字段填写完成', { selector, value });
            return;
          }
        }
      } catch (error) {
        continue;
      }
    }
  }

  /**
   * 处理同意条款复选框（拟人化点击）
   */
  async handleAgreementCheckboxes() {
    try {
      // 查找所有复选框
      const checkboxes = await this.page.$$('input[type="checkbox"]');
      
      for (const checkbox of checkboxes) {
        try {
          const isVisible = await checkbox.isVisible();
          if (isVisible) {
            const isChecked = await checkbox.isChecked();
            if (!isChecked) {
              await this.humanClick(checkbox);
              this.logger.info('已勾选同意条款复选框');
            }
          }
        } catch (error) {
          // 忽略单个复选框的错误
          continue;
        }
      }
    } catch (error) {
      this.logger.warn('处理复选框时出错', { error: error.message });
    }
  }

  /**
   * 处理验证码
   * @returns {Promise<boolean>} 处理是否成功
   */
  async handleCaptcha() {
    try {
      this.logger.info('检查验证码');

      // 常见验证码选择器
      const captchaSelectors = [
        '.captcha',
        '.recaptcha',
        '#captcha',
        'iframe[src*="recaptcha"]',
        'iframe[src*="captcha"]',
        '[data-sitekey]',
        '.g-recaptcha',
        '#recaptcha',
        '.hcaptcha',
        '.cf-turnstile'
      ];

      let captchaFound = false;
      let captchaType = null;
      
      for (const selector of captchaSelectors) {
        try {
          const captchaElement = await this.page.$(selector);
          if (captchaElement) {
            captchaFound = true;
            captchaType = this.detectCaptchaType(selector);
            this.logger.warn('检测到验证码', { selector, type: captchaType });
            break;
          }
        } catch (error) {
          continue;
        }
      }

      if (captchaFound) {
        return await this.solveCaptcha(captchaType);
      }

      this.logger.info('未检测到验证码');
      return true;

    } catch (error) {
      this.logger.error('处理验证码时出错', error);
      return false;
    }
  }

  /**
   * 检测验证码类型
   * @param {string} selector - 验证码选择器
   * @returns {string} 验证码类型
   */
  detectCaptchaType(selector) {
    if (selector.includes('recaptcha') || selector.includes('g-recaptcha') || selector.includes('data-sitekey')) return 'recaptcha';
    if (selector.includes('hcaptcha')) return 'hcaptcha';
    if (selector.includes('turnstile') || selector.includes('cf-turnstile')) return 'turnstile';
    if (selector.includes('captcha')) return 'image_captcha';
    return 'unknown';
  }

  /**
   * 解决验证码
   * @param {string} captchaType - 验证码类型
   * @returns {Promise<boolean>} 解决是否成功
   */
  async solveCaptcha(captchaType) {
    try {
      switch (captchaType) {
        case 'recaptcha':
          return await this.solveRecaptcha();
        case 'hcaptcha':
          return await this.solveHcaptcha();
        case 'turnstile':
          return await this.solveTurnstile();
        case 'image_captcha':
          return await this.solveImageCaptcha();
        default:
          return await this.handleUnknownCaptcha();
      }
    } catch (error) {
      this.logger.error('解决验证码失败', { type: captchaType, error });
      return false;
    }
  }

  /**
   * 解决reCAPTCHA
   * @returns {Promise<boolean>}
   */
  async solveRecaptcha() {
    this.logger.info('处理reCAPTCHA');
    
    // 在非无头模式下，给用户时间手动完成
    if (!this.options.headless) {
      this.logger.info('请手动完成reCAPTCHA验证，等待60秒...');
      
      // 等待reCAPTCHA完成
      try {
        await this.page.waitForFunction(() => {
          const recaptchaResponse = document.querySelector('#g-recaptcha-response');
          return recaptchaResponse && recaptchaResponse.value.length > 0;
        }, { timeout: 60000 });
        
        this.logger.info('reCAPTCHA验证完成');
        return true;
      } catch (error) {
        this.logger.warn('reCAPTCHA验证超时');
        return false;
      }
    } else {
      // 无头模式下的处理策略
      this.logger.warn('无头模式下检测到reCAPTCHA，尝试绕过策略');
      
      // 尝试点击"我不是机器人"复选框
      try {
        const checkbox = await this.page.$('.recaptcha-checkbox-border');
        if (checkbox) {
          await checkbox.click();
          await this.page.waitForTimeout(2000);
          
          // 检查是否需要进一步验证
          const challengeFrame = await this.page.$('iframe[src*="bframe"]');
          if (!challengeFrame) {
            this.logger.info('reCAPTCHA简单验证完成');
            return true;
          }
        }
      } catch (error) {
        // 继续其他策略
      }
      
      // 如果有配置的验证码解决服务，可以在这里调用
      this.logger.error('无法在无头模式下解决reCAPTCHA');
      return false;
    }
  }

  /**
   * 解决hCaptcha
   * @returns {Promise<boolean>}
   */
  async solveHcaptcha() {
    this.logger.info('处理hCaptcha');
    
    if (!this.options.headless) {
      this.logger.info('请手动完成hCaptcha验证，等待60秒...');
      
      try {
        await this.page.waitForFunction(() => {
          const hcaptchaResponse = document.querySelector('[name="h-captcha-response"]');
          return hcaptchaResponse && hcaptchaResponse.value.length > 0;
        }, { timeout: 60000 });
        
        this.logger.info('hCaptcha验证完成');
        return true;
      } catch (error) {
        this.logger.warn('hCaptcha验证超时');
        return false;
      }
    } else {
      this.logger.error('无法在无头模式下解决hCaptcha');
      return false;
    }
  }

  /**
   * 解决Cloudflare Turnstile
   * @returns {Promise<boolean>}
   */
  async solveTurnstile() {
    this.logger.info('处理Cloudflare Turnstile');
    
    // Turnstile通常会自动完成，等待一段时间
    try {
      await this.page.waitForFunction(() => {
        const turnstileResponse = document.querySelector('[name="cf-turnstile-response"]');
        return turnstileResponse && turnstileResponse.value.length > 0;
      }, { timeout: 30000 });
      
      this.logger.info('Turnstile验证完成');
      return true;
    } catch (error) {
      this.logger.warn('Turnstile验证超时');
      return false;
    }
  }

  /**
   * 解决图片验证码
   * @returns {Promise<boolean>}
   */
  async solveImageCaptcha() {
    this.logger.info('处理图片验证码');
    
    if (!this.options.headless) {
      this.logger.info('请手动完成图片验证码，等待60秒...');
      await this.page.waitForTimeout(60000);
      return true;
    } else {
      // 可以集成OCR服务来识别图片验证码
      this.logger.error('无法在无头模式下解决图片验证码');
      return false;
    }
  }

  /**
   * 处理未知类型验证码
   * @returns {Promise<boolean>}
   */
  async handleUnknownCaptcha() {
    this.logger.warn('检测到未知类型验证码');
    
    if (!this.options.headless) {
      this.logger.info('请手动完成验证码，等待60秒...');
      await this.page.waitForTimeout(60000);
      return true;
    } else {
      this.logger.error('无法处理未知类型验证码');
      return false;
    }
  }

  /**
   * 实现动态内容等待策略
   * @param {string} selector - 要等待的选择器
   * @param {Object} options - 等待选项
   * @returns {Promise<boolean>} 等待是否成功
   */
  async waitForDynamicContent(selector, options = {}) {
    const {
      timeout = this.options.timeout,
      stable = true,
      retries = 3
    } = options;

    try {
      this.logger.info('等待动态内容加载', { selector });

      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          // 等待元素出现
          await this.page.waitForSelector(selector, { timeout: timeout / retries });
          
          if (stable) {
            // 等待内容稳定（没有变化）
            await this.waitForContentStable(selector);
          }
          
          this.logger.info('动态内容加载完成', { selector, attempt });
          return true;
          
        } catch (error) {
          if (attempt === retries - 1) {
            throw error;
          }
          
          this.logger.warn('等待动态内容重试', { selector, attempt, error: error.message });
          await this.page.waitForTimeout(1000);
        }
      }
      
      return false;
      
    } catch (error) {
      this.logger.error('等待动态内容失败', { selector, error });
      return false;
    }
  }

  /**
   * 等待内容稳定
   * @param {string} selector - 选择器
   * @param {number} stableTime - 稳定时间（毫秒）
   */
  async waitForContentStable(selector, stableTime = 2000) {
    let lastContent = '';
    let stableCount = 0;
    const checkInterval = 500;
    const requiredStableChecks = Math.ceil(stableTime / checkInterval);

    while (stableCount < requiredStableChecks) {
      try {
        const currentContent = await this.page.$eval(selector, el => el.textContent || el.innerHTML);
        
        if (currentContent === lastContent) {
          stableCount++;
        } else {
          stableCount = 0;
          lastContent = currentContent;
        }
        
        await this.page.waitForTimeout(checkInterval);
      } catch (error) {
        // 元素可能暂时不可用，重置计数
        stableCount = 0;
        await this.page.waitForTimeout(checkInterval);
      }
    }
  }

  /**
   * 处理页面布局变化
   * @returns {Promise<boolean>} 处理是否成功
   */
  async handleLayoutChanges() {
    try {
      this.logger.info('检测页面布局变化');

      // 等待页面稳定
      await this.page.waitForLoadState('networkidle');
      
      // 检测常见的动态加载指示器
      const loadingSelectors = [
        '.loading',
        '.spinner',
        '.loader',
        '[data-loading="true"]',
        '.skeleton'
      ];

      for (const selector of loadingSelectors) {
        try {
          const loadingElement = await this.page.$(selector);
          if (loadingElement) {
            this.logger.info('检测到加载指示器，等待完成', { selector });
            
            // 等待加载指示器消失
            await this.page.waitForSelector(selector, { 
              state: 'hidden', 
              timeout: 30000 
            });
          }
        } catch (error) {
          // 加载指示器可能已经消失，继续
          continue;
        }
      }

      // 等待JavaScript执行完成
      await this.page.waitForFunction(() => {
        return document.readyState === 'complete';
      });

      this.logger.info('页面布局稳定');
      return true;

    } catch (error) {
      this.logger.error('处理页面布局变化失败', error);
      return false;
    }
  }

  /**
   * 智能等待策略
   * @param {Object} options - 等待选项
   * @returns {Promise<boolean>} 等待是否成功
   */
  async smartWait(options = {}) {
    const {
      waitForNetwork = true,
      waitForLayout = true,
      waitForCaptcha = true,
      timeout = this.options.timeout
    } = options;

    try {
      this.logger.info('开始智能等待策略');

      // 等待网络空闲
      if (waitForNetwork) {
        await this.page.waitForLoadState('networkidle', { timeout });
      }

      // 处理页面布局变化
      if (waitForLayout) {
        await this.handleLayoutChanges();
      }

      // 检查并处理验证码
      if (waitForCaptcha) {
        const captchaHandled = await this.handleCaptcha();
        if (!captchaHandled) {
          this.logger.warn('验证码处理失败，但继续执行');
        }
      }

      this.logger.info('智能等待策略完成');
      return true;

    } catch (error) {
      this.logger.error('智能等待策略失败', error);
      return false;
    }
  }

  /**
   * 提交注册表单
   * @returns {Promise<string>} 注册状态
   */
  async submitRegistration() {
    if (!this.page) {
      throw new Error('浏览器未初始化');
    }

    try {
      this.logger.info('提交注册表单');

      // Qoder 注册页面专用选择器 - 按钮文本是 "Continue"
      const submitSelectors = [
        'button:has-text("Continue")',
        'button:has-text("continue")',
        'button[type="button"]:has-text("Continue")',
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Sign up")',
        'button:has-text("Sign Up")',
        'button:has-text("Register")',
        'button:has-text("注册")',
        'button:has-text("Create account")',
        'button:has-text("Create Account")',
        '[data-testid="submit"]',
        '.submit-btn',
        '.register-btn',
        '#submit'
      ];

      let submitButton = null;
      for (const selector of submitSelectors) {
        try {
          const btn = await this.page.$(selector);
          if (btn && await btn.isVisible()) {
            submitButton = btn;
            this.logger.info('找到提交按钮', { selector });
            break;
          }
        } catch (error) {
          continue;
        }
      }

      if (!submitButton) {
        // 尝试使用 locator 查找包含 "Continue" 文本的按钮
        try {
          const continueBtn = this.page.locator('button', { hasText: 'Continue' });
          if (await continueBtn.count() > 0) {
            submitButton = await continueBtn.first().elementHandle();
            this.logger.info('使用 locator 找到 Continue 按钮');
          }
        } catch (e) {
          this.logger.warn('locator 查找按钮失败', { error: e.message });
        }
      }

      if (!submitButton) {
        await this.takeScreenshot('submit-button-not-found');
        throw new Error('无法找到提交按钮');
      }

      // 点击提交按钮（拟人化）
      await this.humanClick(submitButton);
      this.logger.info('已点击提交按钮');

      // 等待页面响应
      await this.randomDelay(2000, 4000);
      
      // 尝试等待导航或页面变化
      try {
        await this.page.waitForLoadState('networkidle', { timeout: 15000 });
      } catch (e) {
        this.logger.warn('等待网络空闲超时');
      }

      // 检查是否有 Cloudflare Turnstile 验证
      const turnstileFrame = await this.page.$('iframe[src*="turnstile"], .cf-turnstile, [data-sitekey]');
      if (turnstileFrame) {
        this.logger.info('检测到 Cloudflare Turnstile 验证');
        
        // 根据模式决定等待时间
        const waitTimeout = this.options.headless ? 30000 : 60000;
        
        if (!this.options.headless) {
          this.logger.info(`可见模式：请在浏览器中完成人机验证，等待 ${waitTimeout / 1000} 秒...`);
        }
        
        // 等待 Turnstile 验证完成
        try {
          await this.page.waitForFunction(() => {
            const response = document.querySelector('[name="cf-turnstile-response"]');
            return response && response.value && response.value.length > 0;
          }, { timeout: waitTimeout });
          this.logger.info('Turnstile 验证已完成');
          await this.randomDelay(1000, 2000);
          
          // 验证完成后，可能需要再次点击提交按钮
          const submitBtnAfterCaptcha = await this.page.$('button[type="submit"], button:has-text("Continue"), button:has-text("Sign up")');
          if (submitBtnAfterCaptcha && await submitBtnAfterCaptcha.isVisible()) {
            this.logger.info('验证完成后再次点击提交按钮');
            await this.humanClick(submitBtnAfterCaptcha);
            await this.randomDelay(2000, 4000);
          }
        } catch (e) {
          if (this.options.headless) {
            this.logger.warn('无头模式下 Turnstile 验证超时，建议使用可见模式');
            return 'CAPTCHA_REQUIRED: 无头模式下无法完成人机验证，请使用可见模式';
          } else {
            this.logger.warn('Turnstile 验证等待超时');
          }
        }
      }

      // 截图查看提交后的状态
      await this.takeScreenshot('after-submit');

      // 检查注册结果
      const registrationStatus = await this.checkRegistrationResult();
      
      this.logger.info('注册提交完成', { status: registrationStatus });
      return registrationStatus;

    } catch (error) {
      this.logger.error('提交注册表单失败', error);
      
      if (this.options.screenshotOnError) {
        await this.takeScreenshot('submit-error');
      }
      
      return 'SUBMIT_ERROR: ' + error.message;
    }
  }

  /**
   * 检查注册结果
   * @returns {Promise<string>} 注册状态
   */
  async checkRegistrationResult() {
    try {
      const url = this.page.url();
      const title = await this.page.title();
      const content = await this.page.content();

      this.logger.info('检查注册结果', { url, title: title.substring(0, 50) });

      // 检查是否有人机验证（Cloudflare Turnstile、reCAPTCHA 等）
      const captchaIndicators = [
        content.includes('cf-turnstile'),
        content.includes('turnstile'),
        content.includes('recaptcha'),
        content.includes('hcaptcha'),
        content.includes('challenge'),
        content.includes('verify you are human'),
        content.includes('验证您是人类'),
        content.includes('robot'),
        content.includes('机器人')
      ];

      if (captchaIndicators.some(indicator => indicator)) {
        this.logger.warn('检测到人机验证');
        // 尝试处理验证码
        const captchaHandled = await this.handleCaptcha();
        if (!captchaHandled) {
          return 'CAPTCHA_REQUIRED';
        }
        // 验证码处理后重新检查
        await this.page.waitForTimeout(3000);
      }

      // 成功指示器
      const successIndicators = [
        url.includes('success'),
        url.includes('verify'),
        url.includes('confirm'),
        url.includes('dashboard'),
        url.includes('welcome'),
        title.toLowerCase().includes('success'),
        title.toLowerCase().includes('verify'),
        title.toLowerCase().includes('welcome'),
        content.includes('验证邮件'),
        content.includes('verification email'),
        content.includes('check your email'),
        content.includes('注册成功'),
        content.includes('successfully registered'),
        content.includes('account created')
      ];

      if (successIndicators.some(indicator => indicator)) {
        return 'SUCCESS_PENDING_VERIFICATION';
      }

      // 明确的错误指示器（更精确的匹配）
      const errorPatterns = [
        /email.*already.*exists/i,
        /邮箱.*已存在/,
        /account.*already.*exists/i,
        /registration.*failed/i,
        /注册.*失败/,
        /invalid.*email/i,
        /邮箱.*无效/
      ];

      for (const pattern of errorPatterns) {
        if (pattern.test(content)) {
          const errorMessage = await this.detectRegistrationErrors();
          return `ERROR: ${errorMessage || '注册失败'}`;
        }
      }

      // 如果还在注册页面，可能是表单验证失败或需要人机验证
      const isStillOnRegistrationPage = await this.isRegistrationPage();
      if (isStillOnRegistrationPage) {
        // 检查是否有表单验证错误
        const errorMessage = await this.detectRegistrationErrors();
        if (errorMessage) {
          return `VALIDATION_ERROR: ${errorMessage}`;
        }
        
        // 检查是否有 Turnstile 验证
        const hasTurnstile = await this.page.$('.cf-turnstile, [data-sitekey], iframe[src*="turnstile"]');
        if (hasTurnstile) {
          if (this.options.headless) {
            return 'CAPTCHA_REQUIRED: 检测到人机验证，无头模式下无法自动完成，请使用可见模式';
          }
          return 'CAPTCHA_REQUIRED: 请在浏览器中完成人机验证';
        }
        
        // 检查页面是否有任何错误提示
        const pageText = await this.page.textContent('body');
        if (pageText && (pageText.includes('error') || pageText.includes('错误') || pageText.includes('failed'))) {
          return 'VALIDATION_ERROR: 页面显示错误，请检查截图';
        }
        
        return 'VALIDATION_ERROR: 表单验证失败或需要人机验证';
      }

      return 'SUCCESS_PENDING_VERIFICATION';

    } catch (error) {
      this.logger.error('检查注册结果时出错', error);
      return 'CHECK_ERROR: ' + error.message;
    }
  }

  /**
   * 检测注册错误
   * @returns {Promise<string|null>} 错误信息
   */
  async detectRegistrationErrors() {
    try {
      // 查找错误消息元素
      const errorSelectors = [
        '.error',
        '.error-message',
        '.alert-danger',
        '.validation-error',
        '[class*="error"]',
        '[role="alert"]'
      ];

      for (const selector of errorSelectors) {
        try {
          const errorElements = await this.page.$$(selector);
          for (const element of errorElements) {
            const errorText = await element.textContent();
            if (errorText && errorText.trim()) {
              this.logger.warn('检测到注册错误', { error: errorText });
              return errorText.trim();
            }
          }
        } catch (error) {
          continue;
        }
      }

      return null;

    } catch (error) {
      this.logger.error('检测注册错误时出错', error);
      return null;
    }
  }

  /**
   * 截图
   * @param {string} name - 截图名称
   */
  async takeScreenshot(name) {
    try {
      if (this.page) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `screenshot-${name}-${timestamp}.png`;
        // 使用系统临时目录存储截图
        const os = await import('os');
        const path = await import('path');
        const screenshotPath = path.default.join(os.default.tmpdir(), 'qoder-screenshots', filename);
        
        // 确保目录存在
        const fs = await import('fs');
        const dir = path.default.dirname(screenshotPath);
        if (!fs.default.existsSync(dir)) {
          fs.default.mkdirSync(dir, { recursive: true });
        }
        
        await this.page.screenshot({ 
          path: screenshotPath,
          fullPage: true 
        });
        this.logger.info('截图已保存', { path: screenshotPath });
      }
    } catch (error) {
      this.logger.error('截图失败', error);
    }
  }

  /**
   * 清理资源
   */
  async cleanup() {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }
      
      if (this.context) {
        await this.context.close();
        this.context = null;
      }
      
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      
      this.logger.info('浏览器资源清理完成');
    } catch (error) {
      this.logger.error('清理浏览器资源时出错', error);
    }
  }
}

/**
 * 创建注册机器人实例
 * @param {Object} options - 配置选项
 * @returns {RegistrationBot} 注册机器人实例
 */
export function createRegistrationBot(options = {}) {
  return new RegistrationBot(options);
}