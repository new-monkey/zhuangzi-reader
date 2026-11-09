// @ts-check
const { test, expect } = require('@playwright/test');
const { injectAxe, checkA11y } = require('axe-playwright');

/**
 * 可访问性测试 (UX-A11Y-*)
 */

test.describe('可访问性', () => {
  
  test('页面无严重可访问性问题', async ({ page }) => {
    await page.goto('file:///home/ou/code/explore/zhuangzi-reader/dist/zhuangzi.html');
    await page.waitForTimeout(500);
    
    // 注入 axe-core
    await injectAxe(page);
    
    // 运行可访问性检查
    const results = await checkA11y(page, null, {
      detailedReport: true,
      detailedReportOptions: { html: true },
    });
    
    // 如果有严重问题，测试失败
    // 允许 minor/moderate 问题，但 serious/critical 必须为 0
    if (results && results.violations) {
      const seriousViolations = results.violations.filter(
        v => v.impact === 'serious' || v.impact === 'critical'
      );
      expect(seriousViolations.length).toBe(0);
    }
  });

  test('所有按钮有可访问名称 (UX-A11Y-03)', async ({ page }) => {
    await page.goto('file:///home/ou/code/explore/zhuangzi-reader/dist/zhuangzi.html');
    await page.waitForTimeout(500);
    
    const buttonsWithoutLabel = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      const missing = [];
      
      buttons.forEach(btn => {
        const hasLabel = btn.textContent.trim() || 
                        btn.getAttribute('aria-label') || 
                        btn.getAttribute('aria-labelledby') ||
                        btn.getAttribute('title');
        if (!hasLabel) {
          missing.push(btn.outerHTML.slice(0, 100));
        }
      });
      
      return missing;
    });
    
    expect(buttonsWithoutLabel.length).toBe(0);
  });

  test('面板有正确的 ARIA 属性 (UX-A11Y-04)', async ({ page }) => {
    await page.goto('file:///home/ou/code/explore/zhuangzi-reader/dist/zhuangzi.html');
    await page.waitForTimeout(500);
    
    const panels = await page.evaluate(() => {
      const selectors = ['#toc', '#searchDrawer', '#setDrawer'];
      return selectors.map(sel => {
        const el = document.querySelector(sel);
        return {
          selector: sel,
          role: el?.getAttribute('role'),
          ariaModal: el?.getAttribute('aria-modal'),
          ariaLabel: el?.getAttribute('aria-label'),
        };
      });
    });
    
    for (const panel of panels) {
      expect(panel.role).toBe('dialog');
      expect(panel.ariaModal).toBe('true');
      expect(panel.ariaLabel).toBeTruthy();
    }
  });

  test('页码有 aria-live 播报 (UX-A11Y-05)', async ({ page }) => {
    await page.goto('file:///home/ou/code/explore/zhuangzi-reader/dist/zhuangzi.html');
    await page.waitForTimeout(500);
    
    const hasAriaLive = await page.evaluate(() => {
      const label = document.querySelector('#pg-label');
      return label?.getAttribute('aria-live') === 'polite';
    });
    
    expect(hasAriaLive).toBe(true);
  });

  test('焦点可见 (UX-A11Y-02)', async ({ page }) => {
    await page.goto('file:///home/ou/code/explore/zhuangzi-reader/dist/zhuangzi.html');
    await page.waitForTimeout(500);
    
    // Tab 到第一个按钮
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    
    // 检查焦点样式
    const hasVisibleFocus = await page.evaluate(() => {
      const focused = document.activeElement;
      if (!focused) return false;
      
      const style = getComputedStyle(focused);
      // 检查 outline 或 box-shadow
      return style.outlineStyle !== 'none' || 
             style.outlineWidth !== '0px' ||
             style.boxShadow !== 'none';
    });
    
    expect(hasVisibleFocus).toBe(true);
  });
});

test.describe('主题对比度 (UX-A11Y-01, UX-THEME-02/03)', () => {
  const themes = ['paper', 'sepia', 'green', 'ink', 'night'];
  
  for (const theme of themes) {
    test(`${theme} 主题正文对比度 ≥ 7:1`, async ({ page }) => {
      await page.goto('file:///home/ou/code/explore/zhuangzi-reader/dist/zhuangzi.html');
      
      // 切换到指定主题
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
        document.body.dataset.theme = t;
      }, theme);
      await page.waitForTimeout(300);
      
      // 获取前景色和背景色
      const colors = await page.evaluate(() => {
        const body = document.body;
        const para = document.querySelector('.para');
        
        const fg = getComputedStyle(para || body).color;
        const bg = getComputedStyle(body).backgroundColor;
        
        return { fg, bg };
      });
      
      // 解析颜色并计算对比度
      const contrast = await page.evaluate(({ fg, bg }) => {
        function parseColor(str) {
          const match = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          if (!match) return [0, 0, 0];
          return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
        }
        
        function luminance([r, g, b]) {
          const a = [r, g, b].map(v => {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
          });
          return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
        }
        
        function contrastRatio(fg, bg) {
          const l1 = luminance(fg);
          const l2 = luminance(bg);
          const lighter = Math.max(l1, l2);
          const darker = Math.min(l1, l2);
          return (lighter + 0.05) / (darker + 0.05);
        }
        
        const fgRgb = parseColor(fg);
        const bgRgb = parseColor(bg);
        return contrastRatio(fgRgb, bgRgb);
      }, colors);
      
      // WCAG AAA 要求正文对比度 ≥ 7:1
      expect(contrast).toBeGreaterThanOrEqual(7);
    });
  }
});
