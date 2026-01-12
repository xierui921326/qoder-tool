/**
 * Qoder注册机器人
 * 处理Qoder账号注册的浏览器自动化
 */

import { chromium } from 'playwright';
import { createLogger } from '../utils/logger.js';
import { retryWithExponentialBackoff } from '../utils/retry.js';
import { BrowserRecoveryHandler } from '../utils/error-handler.js';

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
      ...options
    };
    
    this.logger = createLogger({ component: 'RegistrationBot' });
    this.browser = null;
    this.page = null;
    this.context = null;
    
    // 初始化错误处理器
    this.errorHandler = new BrowserRecoveryHandler({
      maxRetries: this.options.retryAttempts,
      baseDelay: 2000,
      maxDelay: 30000
    });
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
          '--disable-gpu'
        ]
      });

      // 创建浏览器上下文
      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });

      // 创建页面
      this.page = await this.context.newPage();
      
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

    const wrappedNavigate = this.errorHandler.wrapBrowserOperation(
      async () => {
        this.logger.info('导航到Qoder注册页面');
        
        // 访问Qoder主页
        await this.page.goto('https://qoder.com', { 
          waitUntil: 'networkidle',
          timeout: this.options.timeout 
        });

        // 使用智能等待策略
        await this.smartWait();

        // 查找并点击注册按钮/链接
        const registrationSelectors = [
          'a[href*="sign-up"]',
          'a[href*="signup"]',
          'a[href*="register"]',
          'button:has-text("注册")',
          'button:has-text("Sign Up")',
          'a:has-text("注册")',
          'a:has-text("Sign Up")',
          '.register-btn',
          '.signup-btn',
          '[data-testid="register"]',
          '[data-testid="signup"]',
          '.user-icon', // 可能需要先点击用户图标
          '.login-btn' // 有时注册链接在登录页面
        ];

        let registrationFound = false;
        for (const selector of registrationSelectors) {
          try {
            // 使用动态内容等待
            const elementFound = await this.waitForDynamicContent(selector, { timeout: 5000 });
            if (elementFound) {
              const element = await this.page.$(selector);
              if (element) {
                await element.click();
                registrationFound = true;
                this.logger.info('找到并点击注册按钮', { selector });
                break;
              }
            }
          } catch (error) {
            // 继续尝试下一个选择器
            continue;
          }
        }

        if (!registrationFound) {
          // 尝试直接访问注册页面
          const registrationUrls = [
            'https://qoder.com/users/sign-up',
            'https://qoder.com/signup',
            'https://qoder.com/register',
            'https://qoder.com/auth/register',
            'https://qoder.com/user/register'
          ];

          for (const url of registrationUrls) {
            try {
              await this.page.goto(url, { 
                waitUntil: 'networkidle',
                timeout: this.options.timeout 
              });
              
              // 使用智能等待策略
              await this.smartWait();
              
              // 检查是否成功到达注册页面
              const isRegistrationPage = await this.isRegistrationPage();
              if (isRegistrationPage) {
                registrationFound = true;
                this.logger.info('直接访问注册页面成功', { url });
                break;
              }
            } catch (error) {
              continue;
            }
          }
        }

        if (!registrationFound) {
          throw new Error('无法找到或访问Qoder注册页面');
        }

        // 等待注册表单加载
        await this.smartWait();
        
        // 验证是否在注册页面
        const isRegistrationPage = await this.isRegistrationPage();
        if (!isRegistrationPage) {
          throw new Error('未能成功导航到注册页面');
        }

        this.logger.info('成功导航到Qoder注册页面');
        return true;
      },
      { registrationBot: this },
      { circuitBreakerKey: 'navigate-to-registration' }
    );

    try {
      return await wrappedNavigate();
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
   * 填写注册表单
   * @param {string} email - 邮箱地址
   * @param {string} password - 密码
   * @param {Object} profile - 用户资料
   * @returns {Promise<boolean>} 填写是否成功
   */
  async fillRegistrationForm(email, password, profile = {}) {
    if (!this.page) {
      throw new Error('浏览器未初始化');
    }

    try {
      this.logger.info('开始填写注册表单', { email });

      // 使用智能等待策略
      await this.smartWait();

      // 邮箱字段
      const emailSelectors = [
        'input[type="email"]',
        'input[name="email"]',
        'input[name="username"]',
        'input[placeholder*="邮箱"]',
        'input[placeholder*="email"]',
        'input[placeholder*="Email"]',
        '#email',
        '#username',
        '[data-testid="email"]'
      ];

      let emailFilled = false;
      for (const selector of emailSelectors) {
        try {
          // 等待元素出现并稳定
          const elementFound = await this.waitForDynamicContent(selector, { timeout: 5000 });
          if (elementFound) {
            const emailField = await this.page.$(selector);
            if (emailField) {
              await emailField.fill(''); // 清空字段
              await emailField.fill(email);
              emailFilled = true;
              this.logger.info('邮箱字段填写完成', { selector });
              break;
            }
          }
        } catch (error) {
          continue;
        }
      }

      if (!emailFilled) {
        throw new Error('无法找到邮箱输入字段');
      }

      // 密码字段
      const passwordSelectors = [
        'input[type="password"]',
        'input[name="password"]',
        'input[name="pwd"]',
        'input[placeholder*="密码"]',
        'input[placeholder*="password"]',
        'input[placeholder*="Password"]',
        '#password',
        '#pwd',
        '[data-testid="password"]'
      ];

      let passwordFilled = false;
      for (const selector of passwordSelectors) {
        try {
          const elementFound = await this.waitForDynamicContent(selector, { timeout: 5000 });
          if (elementFound) {
            const passwordField = await this.page.$(selector);
            if (passwordField) {
              await passwordField.fill(''); // 清空字段
              await passwordField.fill(password);
              passwordFilled = true;
              this.logger.info('密码字段填写完成', { selector });
              break;
            }
          }
        } catch (error) {
          continue;
        }
      }

      if (!passwordFilled) {
        throw new Error('无法找到密码输入字段');
      }

      // 确认密码字段（如果存在）
      const confirmPasswordSelectors = [
        'input[name="confirmPassword"]',
        'input[name="confirm_password"]',
        'input[name="passwordConfirm"]',
        'input[name="password_confirmation"]',
        'input[placeholder*="确认密码"]',
        'input[placeholder*="confirm"]',
        'input[placeholder*="Confirm"]',
        '#confirmPassword',
        '#confirm_password',
        '[data-testid="confirm-password"]'
      ];

      for (const selector of confirmPasswordSelectors) {
        try {
          const elementFound = await this.waitForDynamicContent(selector, { timeout: 3000 });
          if (elementFound) {
            const confirmField = await this.page.$(selector);
            if (confirmField) {
              await confirmField.fill(''); // 清空字段
              await confirmField.fill(password);
              this.logger.info('确认密码字段填写完成', { selector });
              break;
            }
          }
        } catch (error) {
          // 确认密码字段可能不存在，继续
          continue;
        }
      }

      // 填写其他可选字段
      if (profile.firstName) {
        await this.fillOptionalField([
          'input[name="firstName"]', 
          'input[name="first_name"]', 
          'input[name="fname"]',
          '#firstName',
          '[data-testid="first-name"]'
        ], profile.firstName);
      }

      if (profile.lastName) {
        await this.fillOptionalField([
          'input[name="lastName"]', 
          'input[name="last_name"]', 
          'input[name="lname"]',
          '#lastName',
          '[data-testid="last-name"]'
        ], profile.lastName);
      }

      if (profile.company) {
        await this.fillOptionalField([
          'input[name="company"]', 
          'input[name="organization"]', 
          'input[name="org"]',
          '#company',
          '[data-testid="company"]'
        ], profile.company);
      }

      // 处理同意条款复选框
      await this.handleAgreementCheckboxes();

      // 处理验证码
      const captchaHandled = await this.handleCaptcha();
      if (!captchaHandled) {
        this.logger.warn('验证码处理失败，但继续执行');
      }

      this.logger.info('注册表单填写完成');
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
   * 处理同意条款复选框
   */
  async handleAgreementCheckboxes() {
    const checkboxSelectors = [
      'input[type="checkbox"]',
      'input[name*="agree"]',
      'input[name*="terms"]',
      'input[name*="privacy"]'
    ];

    for (const selector of checkboxSelectors) {
      try {
        const checkboxes = await this.page.$$(selector);
        for (const checkbox of checkboxes) {
          const isChecked = await checkbox.isChecked();
          if (!isChecked) {
            await checkbox.check();
            this.logger.info('勾选同意条款复选框');
          }
        }
      } catch (error) {
        // 忽略复选框错误
        continue;
      }
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

      // 查找提交按钮
      const submitSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("注册")',
        'button:has-text("Register")',
        'button:has-text("Sign Up")',
        '.submit-btn',
        '.register-btn',
        '#submit',
        '#register'
      ];

      let submitButton = null;
      for (const selector of submitSelectors) {
        try {
          submitButton = await this.page.waitForSelector(selector, { timeout: 5000 });
          if (submitButton) {
            this.logger.info('找到提交按钮', { selector });
            break;
          }
        } catch (error) {
          continue;
        }
      }

      if (!submitButton) {
        throw new Error('无法找到提交按钮');
      }

      // 点击提交按钮
      await submitButton.click();
      this.logger.info('已点击提交按钮');

      // 等待页面响应
      await this.page.waitForLoadState('networkidle', { timeout: this.options.timeout });

      // 检查注册结果
      const registrationStatus = await this.checkRegistrationResult();
      
      this.logger.info('注册提交完成', { status: registrationStatus });
      return registrationStatus;

    } catch (error) {
      this.logger.error('提交注册表单失败', error);
      
      if (this.options.screenshotOnError) {
        await this.takeScreenshot('submit-error');
      }
      
      return 'SUBMIT_ERROR';
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

      // 成功指示器
      const successIndicators = [
        url.includes('success'),
        url.includes('verify'),
        url.includes('confirm'),
        title.toLowerCase().includes('success'),
        title.toLowerCase().includes('verify'),
        content.includes('验证邮件'),
        content.includes('verification email'),
        content.includes('check your email'),
        content.includes('注册成功')
      ];

      if (successIndicators.some(indicator => indicator)) {
        return 'SUCCESS_PENDING_VERIFICATION';
      }

      // 错误指示器
      const errorIndicators = [
        content.includes('error'),
        content.includes('错误'),
        content.includes('failed'),
        content.includes('失败'),
        content.includes('already exists'),
        content.includes('已存在')
      ];

      if (errorIndicators.some(indicator => indicator)) {
        const errorMessage = await this.detectRegistrationErrors();
        return `ERROR: ${errorMessage}`;
      }

      // 如果还在注册页面，可能是表单验证失败
      const isStillOnRegistrationPage = await this.isRegistrationPage();
      if (isStillOnRegistrationPage) {
        const errorMessage = await this.detectRegistrationErrors();
        return errorMessage ? `VALIDATION_ERROR: ${errorMessage}` : 'VALIDATION_ERROR';
      }

      return 'UNKNOWN_STATUS';

    } catch (error) {
      this.logger.error('检查注册结果时出错', error);
      return 'CHECK_ERROR';
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
        await this.page.screenshot({ 
          path: `logs/${filename}`,
          fullPage: true 
        });
        this.logger.info('截图已保存', { filename });
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