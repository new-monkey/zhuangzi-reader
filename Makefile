PY ?= python3
NPX ?= npx

.PHONY: all build test test-ui test-ux test-a11y serve clean check help

all: build ## 构建 dist/zhuangzi.html

build: ## 把 texts/zhuangzi.txt 编译成单文件阅读器
	$(PY) build.py

test: ## 构建/解析/简繁转换的单元测试（不需要浏览器）
	$(PY) -m unittest discover -s tests -p 'test_build.py' -v

test-ui: ## 端到端冒烟测试（需要 playwright + chromium）
	$(PY) build.py --quiet
	$(PY) -m unittest tests.test_ui -v

test-ux: build ## UX Spec 自动化测试（需要 npm install）
	$(NPX) playwright test tests/ux.spec.js

test-a11y: build ## 可访问性测试
	$(NPX) playwright test tests/a11y.spec.js

test-all: test test-ui test-ux test-a11y ## 全部测试

check: test test-ui ## 基础测试

serve: build ## 本地起一个静态服务器预览（http://127.0.0.1:8000/zhuangzi.html）
	$(PY) -m http.server 8000 --directory dist

clean: ## 清理构建产物与缓存
	rm -rf dist __pycache__ zreader/__pycache__ tests/__pycache__ test-results playwright-report

help: ## 显示本帮助
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | sed 's/:.*## /\t/' | column -t
