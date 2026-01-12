/**
 * 反机器人措施处理测试
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { RegistrationBot, createRegistrationBot } from '../src/automation/registration-bot.js';

describe('反机器人措施处理', () => {
  test('应该能够检测reCAPTCHA', async () => {
    const bot = createRegistrationBot({ headless: true });
    
    try {
      await bot.initialize();
      
      // 创建包含reCAPTCHA的页面
      await bot.page.setContent(`
        <html>
          <body>
            <div class="g-recaptcha" data-sitekey="test-key"></div>
            <textarea id="g-recaptcha-response" name="g-recaptcha-response"></textarea>
          </body>
        </html>
      `);
      
      await bot.page.waitForLoadState('domcontentloaded');
      
      // 检测验证码类型
      const captchaType = bot.detectCaptchaType('[data-sitekey]');
      assert.strictEqual(captchaType, 'recaptcha');
      
    } finally {
      await bot.cleanup();
    }
  });

  test('应该能够检测hCaptcha', async () => {
    const bot = createRegistrationBot({ headless: true });
    
    try {
      await bot.initialize();
      
      // 创建包含hCaptcha的页面
      await bot.page.setContent(`
        <html>
          <body>
            <div class="hcaptcha" data-sitekey="test-key"></div>
            <textarea name="h-captcha-response"></textarea>
          </body>
        </html>
      `);
      
      await bot.page.waitForLoadState('domcontentloaded');
      
      // 检测验证码类型
      const captchaType = bot.detectCaptchaType('.hcaptcha');
      assert.strictEqual(captchaType, 'hcaptcha');
      
    } finally {
      await bot.cleanup();
    }
  });

  test('应该能够等待动态内容加载', async () => {
    const bot = createRegistrationBot({ headless: true });
    
    try {
      await bot.initialize();
      
      // 创建一个会动态加载内容的页面
      await bot.page.setContent(`
        <html>
          <body>
            <div id="container"></div>
            <script>
              setTimeout(() => {
                document.getElementById('container').innerHTML = '<input type="email" id="email" />';
              }, 1000);
            </script>
          </body>
        </html>
      `);
      
      // 等待动态内容
      const success = await bot.waitForDynamicContent('#email', { timeout: 5000 });
      assert.strictEqual(success, true);
      
      // 验证元素确实存在
      const emailElement = await bot.page.$('#email');
      assert(emailElement !== null);
      
    } finally {
      await bot.cleanup();
    }
  });

  test('应该能够处理页面布局变化', async () => {
    const bot = createRegistrationBot({ headless: true });
    
    try {
      await bot.initialize();
      
      // 创建包含加载指示器的页面
      await bot.page.setContent(`
        <html>
          <body>
            <div class="loading">Loading...</div>
            <div id="content" style="display: none;">Content loaded</div>
            <script>
              setTimeout(() => {
                document.querySelector('.loading').style.display = 'none';
                document.getElementById('content').style.display = 'block';
              }, 1000);
            </script>
          </body>
        </html>
      `);
      
      // 处理布局变化
      const success = await bot.handleLayoutChanges();
      assert.strictEqual(success, true);
      
      // 验证加载指示器已消失
      const loadingElement = await bot.page.$('.loading');
      const isHidden = await loadingElement.isHidden();
      assert.strictEqual(isHidden, true);
      
    } finally {
      await bot.cleanup();
    }
  });

  test('应该能够使用智能等待策略', async () => {
    const bot = createRegistrationBot({ headless: true });
    
    try {
      await bot.initialize();
      
      // 创建一个复杂的页面
      await bot.page.setContent(`
        <html>
          <body>
            <div class="spinner">Loading...</div>
            <form id="registration-form" style="display: none;">
              <input type="email" name="email" />
              <input type="password" name="password" />
            </form>
            <script>
              setTimeout(() => {
                document.querySelector('.spinner').remove();
                document.getElementById('registration-form').style.display = 'block';
              }, 1500);
            </script>
          </body>
        </html>
      `);
      
      // 使用智能等待策略
      const success = await bot.smartWait({
        waitForNetwork: true,
        waitForLayout: true,
        waitForCaptcha: false // 跳过验证码检查以加快测试
      });
      
      assert.strictEqual(success, true);
      
      // 验证表单已显示
      const form = await bot.page.$('#registration-form');
      const isVisible = await form.isVisible();
      assert.strictEqual(isVisible, true);
      
    } finally {
      await bot.cleanup();
    }
  });

  test('应该能够处理内容稳定等待', async () => {
    const bot = createRegistrationBot({ headless: true });
    
    try {
      await bot.initialize();
      
      // 创建内容会变化然后稳定的页面
      await bot.page.setContent(`
        <html>
          <body>
            <div id="dynamic-content">Loading...</div>
            <script>
              let count = 0;
              const interval = setInterval(() => {
                count++;
                document.getElementById('dynamic-content').textContent = 'Loading' + '.'.repeat(count);
                if (count >= 3) {
                  clearInterval(interval);
                  document.getElementById('dynamic-content').textContent = 'Content loaded';
                }
              }, 500);
            </script>
          </body>
        </html>
      `);
      
      // 等待内容稳定
      await bot.waitForContentStable('#dynamic-content', 1000);
      
      // 验证最终内容
      const content = await bot.page.$eval('#dynamic-content', el => el.textContent);
      assert.strictEqual(content, 'Content loaded');
      
    } finally {
      await bot.cleanup();
    }
  });
});