PY ?= python3

.PHONY: all build test test-ui serve clean check help

all: build ## 构建 dist/zhuangzi.html

build: ## 把 texts/zhuangzi.txt 编译成单文件阅读器
	$(PY) build.py

test: ## 构建/解析/简繁转换的单元测试（不需要浏览器）
	$(PY) -m unittest discover -s tests -p 'test_build.py' -v

test-ui: ## 端到端冒烟测试（需要 playwright + chromium）
	$(PY) build.py --quiet
	$(PY) -m unittest tests.test_ui -v

check: test test-ui ## 全部测试

serve: build ## 本地起一个静态服务器预览（http://127.0.0.1:8000/zhuangzi.html）
	$(PY) -m http.server 8000 --directory dist

clean: ## 清理构建产物与缓存
	rm -rf dist __pycache__ zreader/__pycache__ tests/__pycache__

help: ## 显示本帮助
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | sed 's/:.*## /\t/' | column -t
