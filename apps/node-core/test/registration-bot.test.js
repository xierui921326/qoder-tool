/**
 * RegistrationBot 测试
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { RegistrationBot, createRegistrationBot } from '../src/automation/registration-bot.js';

describe('RegistrationBot', () => {
  test('应该能够创建RegistrationBot实例', () => {
    const bot = createRegistrationBot();
    assert(bot instanceof RegistrationBot);
  });

  test('应该能够使用自定义选项创建RegistrationBot实例', () => {
    const options = {
      headless: false,
      timeout: 60000,
      retryAttempts: 5
    };
    
    const bot = createRegistrationBot(options);
    assert(bot instanceof RegistrationBot);
    assert.strictEqual(bot.options.headless, false);
    assert.strictEqual(bot.options.timeout, 60000);
    assert.strictEqual(bot.options.retryAttempts, 5);
  });

  test('应该能够初始化和清理浏览器', async () => {
    const bot = createRegistrationBot({ headless: true });
    
    try {
      const initialized = await bot.initialize();
      assert.strictEqual(initialized, true);
      assert(bot.browser !== null);
      assert(bot.page !== null);
      
    } finally {
      await bot.cleanup();
      assert.strictEqual(bot.browser, null);
      assert.strictEqual(bot.page, null);
    }
  });

  test('应该能够检测注册页面', async () => {
    const bot = createRegistrationBot({ headless: true });
    
    try {
      await bot.initialize();
      
      // 创建一个模拟的注册页面
      await bot.page.setContent(`
        <html>
          <head><title>Register - Qoder</title></head>
          <body>
            <form action="/register" method="post">
              <input type="email" name="email" placeholder="邮箱地址" />
              <input type="password" name="password" placeholder="密码" />
              <button type="submit">注册</button>
            </form>
          </body>
        </html>
      `);
      
      const isRegistrationPage = await bot.isRegistrationPage();
      assert.strictEqual(isRegistrationPage, true);
      
    } finally {
      await bot.cleanup();
    }
  });

  test('应该能够填写注册表单', async () => {
    const bot = createRegistrationBot({ headless: true });
    
    try {
      await bot.initialize();
      
      // 创建一个模拟的注册表单
      await bot.page.setContent(`
        <html>
          <body>
            <form>
              <input type="email" name="email" id="email" />
              <input type="password" name="password" id="password" />
              <input type="text" name="firstName" id="firstName" />
              <input type="text" name="lastName" id="lastName" />
              <input type="text" name="company" id="company" />
              <input type="checkbox" name="agree" id="agree" />
            </form>
          </body>
        </html>
      `);
      
      // 等待页面加载完成
      await bot.page.waitForLoadState('domcontentloaded');
      
      const profile = {
        firstName: '测试',
        lastName: '用户',
        company: '测试公司'
      };
      
      const filled = await bot.fillRegistrationForm('test@example.com', 'password123', profile);
      assert.strictEqual(filled, true);
      
      // 验证字段是否正确填写
      const emailValue = await bot.page.$eval('#email', el => el.value);
      const passwordValue = await bot.page.$eval('#password', el => el.value);
      const firstNameValue = await bot.page.$eval('#firstName', el => el.value);
      
      assert.strictEqual(emailValue, 'test@example.com');
      assert.strictEqual(passwordValue, 'password123');
      assert.strictEqual(firstNameValue, '测试');
      
    } finally {
      await bot.cleanup();
    }
  });

  test('应该能够处理缺失的表单字段', async () => {
    const bot = createRegistrationBot({ headless: true });
    
    try {
      await bot.initialize();
      
      // 创建一个没有必需字段的页面
      await bot.page.setContent(`
        <html>
          <body>
            <div>这不是注册表单</div>
          </body>
        </html>
      `);
      
      const filled = await bot.fillRegistrationForm('test@example.com', 'password123');
      assert.strictEqual(filled, false);
      
    } finally {
      await bot.cleanup();
    }
  });
});