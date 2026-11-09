"""阅读器的端到端冒烟测试（Playwright + headless Chromium）。

    python3 -m unittest tests.test_ui -v

未安装 playwright 时自动跳过：

    pip install -r requirements-dev.txt
    python3 -m playwright install chromium
"""

from __future__ import annotations

import contextlib
import functools
import http.server
import io
import sys
import threading
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover - 开发机未装 playwright
    sync_playwright = None

DIST = ROOT / "dist"

import build as build_mod  # noqa: E402

VIEWPORT = {"width": 1280, "height": 860}
MOBILE = {"width": 430, "height": 900}


class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args, **kwargs):  # noqa: D102 - 静默访问日志
        pass


def _serve(directory: Path) -> tuple[http.server.ThreadingHTTPServer, str]:
    handler = functools.partial(_QuietHandler, directory=str(directory))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_address[1]}/zhuangzi.html"


@unittest.skipIf(sync_playwright is None, "未安装 playwright")
class ReaderTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        DIST.mkdir(exist_ok=True)
        with contextlib.redirect_stdout(io.StringIO()):
            build_mod.main(["--quiet"])
        cls.server, cls.url = _serve(DIST)
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.browser.close()
        cls.pw.stop()
        cls.server.shutdown()

    def setUp(self) -> None:
        self.errors: list[str] = []
        self._open(VIEWPORT)

    def _open(self, viewport: dict) -> None:
        """新建上下文并打开阅读器，收集页面报错。"""
        self.context = self.browser.new_context(viewport=viewport)
        self.page = self.context.new_page()
        self.page.on("pageerror", lambda exc: self.errors.append(str(exc)))
        self.page.on("console", lambda m: self.errors.append(m.text) if m.type == "error" else None)
        self.page.goto(self.url, wait_until="load")
        self.page.wait_for_timeout(500)

    def tearDown(self) -> None:
        self.assertEqual(self.errors, [], "控制台/页面报错")
        self.context.close()

    # ---------------------------------------------------------------- 工具
    def _vertical(self) -> None:
        self.page.click("#btn-mode")
        self.page.wait_for_timeout(600)

    def _page_no(self) -> tuple[int, int]:
        label = self.page.inner_text("#pg-label")
        cur, total = label.replace("第", "").replace("页", "").split("/")
        return int(cur), int(total)

    def _heads_in_view(self) -> list[int]:
        return self.page.evaluate(
            """() => {
                 const vp = document.getElementById('viewport').getBoundingClientRect();
                 return [...document.querySelectorAll('.ch-name')]
                   .map((el, i) => ({i: i + 1, r: el.getBoundingClientRect()}))
                   .filter(o => o.r.right > vp.left && o.r.left < vp.right)
                   .map(o => o.i);
               }"""
        )

    # ---------------------------------------------------------------- 用例
    def test_toc_and_body_render(self) -> None:
        self.assertEqual(self.page.eval_on_selector_all(".chapter", "e => e.length"), 33)
        self.assertEqual(self.page.eval_on_selector_all(".toc-item", "e => e.length"), 33)
        self.assertEqual(self.page.inner_text("#topic"), "逍遥游｜第一")

    def test_search_and_jump(self) -> None:
        self.page.click("#btn-search")
        self.page.fill("#q", "庖丁")
        self.page.wait_for_timeout(500)
        self.assertEqual(self.page.eval_on_selector_all("mark", "e => e.length"), 3)
        self.assertIn("共 3 处", self.page.inner_text("#q-count"))
        self.assertEqual(self.page.inner_text("#topic"), "养生主｜第三")
        self.page.click("#q-next")
        self.page.wait_for_timeout(400)
        self.assertIn("第 2 处", self.page.inner_text("#q-count"))

    def test_script_toggle(self) -> None:
        self.page.click("#btn-script")
        self.page.wait_for_timeout(400)
        self.assertIn("北冥有魚", self.page.inner_text(".chapter"))
        self.assertEqual(self.page.inner_text("#topic"), "逍遙遊｜第一")
        self.page.click("#btn-script")
        self.page.wait_for_timeout(400)
        self.assertIn("北冥有鱼", self.page.inner_text(".chapter"))

    def test_vertical_pagination(self) -> None:
        self._vertical()
        self.assertTrue(self.page.is_visible("#pagebar"))
        cur, total = self._page_no()
        self.assertEqual(cur, 1)
        # 与字体度量相关：装了 CJK 字体时整本约 65 页，回退字体时会更多/更少，只做下界检查
        self.assertGreater(total, 10)
        self.page.keyboard.press("ArrowLeft")
        self.page.wait_for_timeout(400)
        self.assertEqual(self._page_no()[0], 2)
        self.page.keyboard.press("ArrowRight")
        self.page.wait_for_timeout(400)
        self.assertEqual(self._page_no()[0], 1)

    def test_page_grid_alignment(self) -> None:
        """回归：页宽是栏距的整数倍；每篇都从新的一页开始（篇首落在页边界）。

        曾经的问题：篇题字号更大把行盒撑高，累积 33 篇后整页偏移小半栏，
        页边会露出相邻页的半栏字。现在用「篇首块的右边缘是否落在页边界」
        来判定 —— 用 section 的矩形，不受字形宽度影响。
        """
        for mode in ("v", "h"):
            if mode != "v":
                self.page.click("#btn-mode")
                self.page.wait_for_timeout(600)
            geo = self.page.evaluate(
                """() => {
                     const vp = document.getElementById('viewport').getBoundingClientRect();
                     const book = document.getElementById('book');
                     const pitch = parseFloat(getComputedStyle(book).lineHeight);
                     const tx = new DOMMatrix(getComputedStyle(book).transform).m41;
                     const phases = [];
                     for (const sec of document.querySelectorAll('.chapter')) {
                       const r = sec.getBoundingClientRect();
                       if (!r.width) continue;
                       phases.push((vp.right - (r.right - tx)) / vp.width);
                     }
                     return {width: vp.width, pitch, phases, mode: document.body.dataset.mode};
                   }"""
            )
            frac = [abs(p - round(p)) for p in geo["phases"]]
            self.assertTrue(frac, "没有量到章节位置")
            self.assertLess(max(frac), 0.02, f"篇首没有落在页边界上（{max(frac):.3f} 页）")
            if geo["mode"] == "v":
                per = geo["width"] / geo["pitch"]
                self.assertAlmostEqual(per, round(per), delta=1e-3, msg="页宽不是栏距的整数倍")

    def test_toc_jump_in_vertical(self) -> None:
        """回归：竖排下点目录要跳到该篇所在页，而不是按当前位移算错页。"""
        self._vertical()
        for _ in range(6):
            self.page.keyboard.press("ArrowLeft")
            self.page.wait_for_timeout(120)
        self.page.wait_for_timeout(400)
        self.page.click("#btn-toc")
        self.page.wait_for_timeout(300)
        self.page.locator(".toc-item").nth(16).click()  # 秋水 第十七
        self.page.wait_for_timeout(600)
        self.assertEqual(self.page.inner_text("#topic"), "秋水｜第十七")
        heads = self._heads_in_view()
        self.assertIn(17, heads, "秋水应出现在当前页")
        # 一页 30 余栏，篇与篇之间通常只有一篇的起点，允许邻篇尾页同时可见
        self.assertLessEqual(len(heads), 2)

    def test_panels_block_page_flip(self) -> None:
        """面板打开时点正文/滚轮不应翻页。"""
        self._vertical()
        self.page.click("#btn-toc")
        self.page.wait_for_timeout(300)
        before = self._page_no()
        # 目录宽 286px，点它右侧的正文区（左 30% 属于「下一页」热区）
        self.page.mouse.click(350, 500)
        self.page.mouse.wheel(0, 400)
        self.page.wait_for_timeout(400)
        self.assertEqual(self._page_no(), before)
        self.page.keyboard.press("Escape")
        self.page.wait_for_timeout(300)
        self.page.mouse.click(350, 500)
        self.page.wait_for_timeout(400)
        self.assertEqual(self._page_no()[0], before[0] + 1)

    def test_position_restored(self) -> None:
        self._vertical()
        for _ in range(8):
            self.page.keyboard.press("ArrowLeft")
            self.page.wait_for_timeout(90)
        self.page.wait_for_timeout(600)
        expected = self._page_no()
        self.page.reload(wait_until="load")
        self.page.wait_for_timeout(900)
        self.assertEqual(self._page_no(), expected)

    def test_mobile_drawer(self) -> None:
        self.context.close()
        self._open(MOBILE)
        self._vertical()
        self.page.click("#btn-toc")
        self.page.wait_for_timeout(300)
        self.page.locator(".toc-item").nth(21).click()
        self.page.wait_for_timeout(700)
        self.assertEqual(self.page.inner_text("#topic"), "知北游｜第二十二")
        self.assertFalse(self.page.evaluate("() => document.body.classList.contains('toc-open')"))

    def test_small_screen_layout(self) -> None:
        """小屏（< 600px）下页码条不重排，触控热区 ≥ 44px。"""
        self.context.close()
        small = {"width": 375, "height": 667}  # iPhone SE
        self._open(small)
        self._vertical()
        self.page.wait_for_timeout(400)

        # 页码条应该可见且为浮层（fixed 定位，不占文档流）
        pagebar = self.page.locator("#pagebar")
        self.assertTrue(pagebar.is_visible())
        pagebar_box = pagebar.bounding_box()
        self.assertIsNotNone(pagebar_box)
        # 页码条应该在底部
        self.assertGreater(pagebar_box["y"], small["height"] - 100)

        # 顶栏按钮触控热区 ≥ 44px
        buttons = self.page.locator("#topbar .tbtn").all()
        for btn in buttons:
            box = btn.bounding_box()
            self.assertIsNotNone(box)
            self.assertGreaterEqual(box["width"], 44, f"按钮宽 {box['width']}px < 44px")
            self.assertGreaterEqual(box["height"], 44, f"按钮高 {box['height']}px < 44px")

        # 切换横排后再次验证
        self.page.keyboard.press("v")
        self.page.wait_for_timeout(400)
        for btn in buttons:
            box = btn.bounding_box()
            self.assertIsNotNone(box)
            self.assertGreaterEqual(box["width"], 44)
            self.assertGreaterEqual(box["height"], 44)


if __name__ == "__main__":
    unittest.main()
