# UX Spec 自动化测试方案

## 测试工具

- **Playwright**: 跨浏览器 E2E 测试
- **jest-image-snapshot**: 视觉回归测试
- **axe-playwright**: 可访问性测试

## 安装

```bash
npm init -y
npm install -D @playwright/test jest-image-snapshot axe-playwright
npx playwright install
```

## 测试覆盖映射

| SPEC 需求 | 测试类型 | 自动化可行性 |
|----------|---------|-------------|
| UX-FLIP-01/02/03 翻页方向 | E2E | ✅ 高 |
| UX-BAR-01 浮层不占位 | E2E | ✅ 高 |
| UX-TOUCH-01 触控热区 ≥44px | E2E | ✅ 高 |
| UX-KBD-02 键盘导航 | E2E | ✅ 高 |
| UX-A11Y-01 对比度 ≥7:1 | A11y | ✅ 高 |
| UX-BP-01 无横向溢出 | E2E | ✅ 高 |
| UX-PAGE-02 页序方向 | E2E | ✅ 高 |
| UX-IMM-01 沉浸模式 | E2E | ✅ 中 |
| UX-GEST-02 拖动手势 | E2E | ✅ 中 |
| UX-PERF-02 帧率 ≥55fps | Performance | ⚠️ 需真机 |
| UX-MOB-03 单手操作 | Manual | ❌ 低 |

## 运行测试

```bash
npx playwright test
```
