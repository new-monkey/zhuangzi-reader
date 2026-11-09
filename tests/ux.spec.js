// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * UX Spec 自动化测试
 * 覆盖 SPEC 中可量化的需求
 */

test.describe('翻页方向 (UX-FLIP-01/02/03, UX-PAGE-02)', () => {
  
  test.describe('横排模式', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('file:///home/ou/code/explore/zhuangzi-reader/dist/zhuangzi.html');
      // 确保横排模式
      await page.evaluate(() => {
        if (document.body.dataset.mode !== 'h') {
          document.querySelector('#btn-mode').click();
        }
      });
      await page.waitForTimeout(300);
    });

    test('键盘 → = 下一页', async ({ page }) => {
      const initialPage = await page.evaluate(() => window.__P?.page || 0);
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(400);
      const newPage = await page.evaluate(() => window.__P?.page || 0);
      expect(newPage).toBe(initialPage + 1);
    });

    test('键盘 ← = 上一页', async ({ page }) => {
      // 先翻到第 2 页
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(400);
      const page2 = await page.evaluate(() => window.__P?.page || 0);
      
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(400);
      const newPage = await page.evaluate(() => window.__P?.page || 0);
      expect(newPage).toBe(page2 - 1);
    });

    test('点击右侧 1/3 = 下一页', async ({ page }) => {
      const viewport = page.viewportSize();
      const initialPage = await page.evaluate(() => window.__P?.page || 0);
      
      // 点击右侧 1/3 区域
      await page.mouse.click(viewport.width * 0.85, viewport.height * 0.5);
      await page.waitForTimeout(400);
      
      const newPage = await page.evaluate(() => window.__P?.page || 0);
      expect(newPage).toBe(initialPage + 1);
    });

    test('点击左侧 1/3 = 上一页', async ({ page }) => {
      // 先翻到第 2 页
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(400);
      const page2 = await page.evaluate(() => window.__P?.page || 0);
      
      const viewport = page.viewportSize();
      // 点击左侧 1/3 区域
      await page.mouse.click(viewport.width * 0.15, viewport.height * 0.5);
      await page.waitForTimeout(400);
      
      const newPage = await page.evaluate(() => window.__P?.page || 0);
      expect(newPage).toBe(page2 - 1);
    });

    test('向左拖动 = 下一页', async ({ page }) => {
      const viewport = page.viewportSize();
      const initialPage = await page.evaluate(() => window.__P?.page || 0);
      
      // 从右向左拖动
      await page.mouse.move(viewport.width * 0.7, viewport.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(viewport.width * 0.3, viewport.height * 0.5, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(400);
      
      const newPage = await page.evaluate(() => window.__P?.page || 0);
      expect(newPage).toBe(initialPage + 1);
    });
  });

  test.describe('竖排模式', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('file:///home/ou/code/explore/zhuangzi-reader/dist/zhuangzi.html');
      // 切换到竖排模式
      await page.evaluate(() => {
        if (document.body.dataset.mode !== 'v') {
          document.querySelector('#btn-mode').click();
        }
      });
      await page.waitForTimeout(300);
    });

    test('键盘 ← = 下一页', async ({ page }) => {
      const initialPage = await page.evaluate(() => window.__P?.page || 0);
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(400);
      const newPage = await page.evaluate(() => window.__P?.page || 0);
      expect(newPage).toBe(initialPage + 1);
    });

    test('键盘 → = 上一页', async ({ page }) => {
      // 先翻到第 2 页
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(400);
      const page2 = await page.evaluate(() => window.__P?.page || 0);
      
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(400);
      const newPage = await page.evaluate(() => window.__P?.page || 0);
      expect(newPage).toBe(page2 - 1);
    });

    test('点击左侧 1/3 = 下一页', async ({ page }) => {
      const viewport = page.viewportSize();
      const initialPage = await page.evaluate(() => window.__P?.page || 0);
      
      // 点击左侧 1/3 区域
      await page.mouse.click(viewport.width * 0.15, viewport.height * 0.5);
      await page.waitForTimeout(400);
      
      const newPage = await page.evaluate(() => window.__P?.page || 0);
      expect(newPage).toBe(initialPage + 1);
    });

    test('向右拖动 = 下一页', async ({ page }) => {
      const viewport = page.viewportSize();
      const initialPage = await page.evaluate(() => window.__P?.page || 0);
      
      // 从左向右拖动
      await page.mouse.move(viewport.width * 0.3, viewport.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(viewport.width * 0.7, viewport.height * 0.5, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(400);
      
      const newPage = await page.evaluate(() => window.__P?.page || 0);
      expect(newPage).toBe(initialPage + 1);
    });
  });
});

test.describe('浮层不占位 (UX-BAR-01, UX-LAY-03)', () => {
  test('正文区域不因页码浮层缩小', async ({ page }) => {
    await page.goto('file:///home/ou/code/explore/zhuangzi-reader/dist/zhuangzi.html');
    await page.waitForTimeout(500);
    
    // 获取正文区域高度
    const viewportHeight = await page.evaluate(() => {
      return document.querySelector('#viewport').getBoundingClientRect().height;
    });
    
    // 获取 stage 高度
    const stageHeight = await page.evaluate(() => {
      return document.querySelector('#stage').getBoundingClientRect().height;
    });
    
    // 正文应该占满 stage（减去上下 padding）
    const padY = await page.evaluate(() => {
      return parseFloat(getComputedStyle(document.querySelector('#stage')).getPropertyValue('--pad-y')) || 34;
    });
    
    // viewport 高度应该约等于 stage - 2*padY - 28px（浮层预留空间）
    const expectedMinHeight = stageHeight - 2 * padY - 30;
    expect(viewportHeight).toBeGreaterThan(expectedMinHeight);
  });
});

test.describe('触控热区 (UX-TOUCH-01)', () => {
  test('所有按钮热区 ≥ 44px', async ({ page }) => {
    await page.goto('file:///home/ou/code/explore/zhuangzi-reader/dist/zhuangzi.html');
    await page.waitForTimeout(500);
    
    const buttons = await page.evaluate(() => {
      const selectors = [
        '#topbar .tbtn',
        '#seg-font button',
        '#seg-mode button', 
        '#seg-script button',
        '.sw',
        '.toc-item',
        '.res-item',
        '.mini',
        '.iconbtn',
        '.reset'
      ];
      
      const results = [];
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          const rect = el.getBoundingClientRect();
          results.push({
            selector,
            width: rect.width,
            height: rect.height,
            pass: rect.width >= 44 && rect.height >= 44
          });
        });
      }
      return results;
    });
    
    const failed = buttons.filter(b => !b.pass);
    if (failed.length > 0) {
      console.log('热区不达标的元素:', failed);
    }
    expect(failed.length).toBe(0);
  });
});

test.describe('键盘导航 (UX-KBD-02)', () => {
  test('全部功能可用键盘完成', async ({ page }) => {
    await page.goto('file:///home/ou/code/explore/zhuangzi-reader/dist/zhuangzi.html');
    await page.waitForTimeout(500);
    
    // M = 目录
    await page.keyboard.press('m');
    await expect(page.locator('#toc')).toBeVisible();
    await page.keyboard.press('Escape');
    
    // / = 搜索
    await page.keyboard.press('/');
    await expect(page.locator('#searchDrawer')).toBeVisible();
    await page.keyboard.press('Escape');
    
    // V = 横竖切换
    const modeBefore = await page.evaluate(() => document.body.dataset.mode);
    await page.keyboard.press('v');
    await page.waitForTimeout(300);
    const modeAfter = await page.evaluate(() => document.body.dataset.mode);
    expect(modeAfter).not.toBe(modeBefore);
    
    // T = 简繁切换
    const scriptBefore = await page.evaluate(() => document.body.dataset.script);
    await page.keyboard.press('t');
    await page.waitForTimeout(300);
    const scriptAfter = await page.evaluate(() => document.body.dataset.script);
    expect(scriptAfter).not.toBe(scriptBefore);
    
    // F = 沉浸模式
    await page.keyboard.press('f');
    await page.waitForTimeout(300);
    const isImmersive = await page.evaluate(() => document.body.classList.contains('immersive'));
    expect(isImmersive).toBe(true);
    
    // Esc = 退出沉浸
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const isNotImmersive = await page.evaluate(() => !document.body.classList.contains('immersive'));
    expect(isNotImmersive).toBe(true);
  });
});

test.describe('无横向溢出 (UX-BP-01)', () => {
  const viewports = [
    { name: '手机竖屏', width: 390, height: 844 },
    { name: '手机横屏', width: 844, height: 390 },
    { name: '平板竖屏', width: 768, height: 1024 },
    { name: '平板横屏', width: 1024, height: 768 },
    { name: '桌面', width: 1280, height: 800 },
    { name: '极窄屏', width: 320, height: 568 },
  ];
  
  for (const vp of viewports) {
    test(`${vp.name} (${vp.width}x${vp.height}) 无横向溢出`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('file:///home/ou/code/explore/zhuangzi-reader/dist/zhuangzi.html');
      await page.waitForTimeout(500);
      
      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      
      expect(hasOverflow).toBe(false);
    });
  }
});

test.describe('沉浸模式 (UX-IMM-01/04/05)', () => {
  test('进入/退出沉浸模式', async ({ page }) => {
    await page.goto('file:///home/ou/code/explore/zhuangzi-reader/dist/zhuangzi.html');
    await page.waitForTimeout(500);
    
    // 进入沉浸
    await page.keyboard.press('f');
    await page.waitForTimeout(300);
    
    const isImmersive = await page.evaluate(() => {
      return document.body.classList.contains('immersive');
    });
    expect(isImmersive).toBe(true);
    
    // 顶栏应该隐藏
    const topbarVisible = await page.evaluate(() => {
      const topbar = document.querySelector('#topbar');
      const style = getComputedStyle(topbar);
      return style.opacity !== '0' && style.transform !== 'translateY(-100%)';
    });
    expect(topbarVisible).toBe(false);
    
    // 退出沉浸
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    
    const isNotImmersive = await page.evaluate(() => {
      return !document.body.classList.contains('immersive');
    });
    expect(isNotImmersive).toBe(true);
  });

  test('沉浸模式下翻页正常', async ({ page }) => {
    await page.goto('file:///home/ou/code/explore/zhuangzi-reader/dist/zhuangzi.html');
    await page.waitForTimeout(500);
    
    // 进入沉浸
    await page.keyboard.press('f');
    await page.waitForTimeout(300);
    
    // 翻页
    const initialPage = await page.evaluate(() => window.__P?.page || 0);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400);
    const newPage = await page.evaluate(() => window.__P?.page || 0);
    
    expect(newPage).toBe(initialPage + 1);
  });
});

test.describe('进度条方向 (UX-POS-03)', () => {
  test('横排进度条从左向右增长', async ({ page }) => {
    await page.goto('file:///home/ou/code/explore/zhuangzi-reader/dist/zhuangzi.html');
    // 确保横排
    await page.evaluate(() => {
      if (document.body.dataset.mode !== 'h') {
        document.querySelector('#btn-mode').click();
      }
    });
    await page.waitForTimeout(300);
    
    // 翻到第 5 页
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);
    }
    
    const progressWidth = await page.evaluate(() => {
      const bar = document.querySelector('#bar i');
      return parseFloat(bar.style.width);
    });
    
    // 进度应该大于 0
    expect(progressWidth).toBeGreaterThan(0);
    
    // 横排进度条应该从左向右（没有 margin-left: auto）
    const hasMarginAuto = await page.evaluate(() => {
      const bar = document.querySelector('#bar i');
      return getComputedStyle(bar).marginLeft === 'auto';
    });
    expect(hasMarginAuto).toBe(false);
  });

  test('竖排进度条从右向左增长', async ({ page }) => {
    await page.goto('file:///home/ou/code/explore/zhuangzi-reader/dist/zhuangzi.html');
    // 切换到竖排
    await page.evaluate(() => {
      if (document.body.dataset.mode !== 'v') {
        document.querySelector('#btn-mode').click();
      }
    });
    await page.waitForTimeout(300);
    
    // 翻到第 5 页
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(100);
    }
    
    // 竖排进度条应该从右向左（有 margin-left: auto）
    const hasMarginAuto = await page.evaluate(() => {
      const bar = document.querySelector('#bar i');
      return getComputedStyle(bar).marginLeft === 'auto';
    });
    expect(hasMarginAuto).toBe(true);
  });
});
