"""构建产物的回归测试（不需要浏览器）。

    python3 -m unittest discover -s tests -v
"""

from __future__ import annotations

import contextlib
import io
import re
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import build as build_mod  # noqa: E402
from zreader import convert, parser  # noqa: E402


class ParserTest(unittest.TestCase):
    def setUp(self) -> None:
        self.text = (ROOT / "texts" / "zhuangzi.txt").read_text(encoding="utf-8")
        self.title, self.chapters = parser.parse_text(self.text)

    def test_title(self) -> None:
        self.assertEqual(self.title, "庄子（南华经）")

    def test_chapter_count(self) -> None:
        self.assertEqual(len(self.chapters), 33)
        self.assertEqual(sum(len(c["paras"]) for c in self.chapters), 267)

    def test_divisions(self) -> None:
        divisions = [c["division"] for c in self.chapters]
        self.assertEqual(divisions.count("内篇"), 7)
        self.assertEqual(divisions.count("外篇"), 15)
        self.assertEqual(divisions.count("杂篇"), 11)

    def test_missing_headings_recovered(self) -> None:
        """原文缺失的七篇小标题由篇首句切分补出。"""
        names = [c["name"] for c in self.chapters]
        for name in ("刻意", "田子方", "知北游", "徐无鬼", "盗跖", "渔父", "列御寇"):
            self.assertIn(name, names)

    def test_chapter_sequence(self) -> None:
        self.assertEqual(self.chapters[0]["name"], "逍遥游")
        self.assertEqual(self.chapters[-1]["name"], "天下")
        self.assertEqual(self.chapters[16]["numCn"], "第十七")

    def test_no_paragraph_lost(self) -> None:
        """正文字数应与原文一致：没有段落被当成书名/标题吃掉。"""
        chars = sum(len(p) for c in self.chapters for p in c["paras"])
        body_lines = [
            line.strip() for line in self.text.splitlines()
            if line.strip() and not parser.is_heading(line) and not line.strip().startswith(self.title)
        ]
        self.assertEqual(chars, sum(len(line) for line in body_lines))


class ConvertTest(unittest.TestCase):
    def setUp(self) -> None:
        text = (ROOT / "texts" / "zhuangzi.txt").read_text(encoding="utf-8")
        convert.verify_corrections(text)
        self.trad = convert.to_traditional(text)
        self.simp = convert.to_simplified(text)

    def test_classical_corrections(self) -> None:
        for wrong in ("裡", "鹹", "鬥斛", "佈施", "雲者", "餘愧", "餘且", "兇", "幷", "求儘"):
            self.assertNotIn(wrong, self.trad, f"繁化未校正：{wrong}")
        self.assertIn("幾千里", self.trad)
        self.assertIn("干越", self.trad)

    def test_no_supplementary_plane_glyphs(self) -> None:
        """增补区汉字多数字体缺字，简体化时应保留原字形。"""
        for text in (self.trad, self.simp):
            bad = sorted({c for c in text if ord(c) > 0xFFFF})
            self.assertEqual(bad, [], f"出现非 BMP 字形：{bad}")

    def test_both_scripts(self) -> None:
        self.assertIn("北冥有魚", self.trad)
        self.assertIn("北冥有鱼", self.simp)


class BuildTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.tmp = tempfile.TemporaryDirectory()
        cls.out = Path(cls.tmp.name) / "zhuangzi.html"
        with contextlib.redirect_stdout(io.StringIO()):
            rc = build_mod.main(["--out", str(cls.out), "--quiet"])
        assert rc == 0
        cls.html = cls.out.read_text(encoding="utf-8")

    @classmethod
    def tearDownClass(cls) -> None:
        cls.tmp.cleanup()

    def test_single_self_contained_file(self) -> None:
        self.assertTrue(self.html.startswith("<!DOCTYPE html>"))
        self.assertTrue(self.html.rstrip().endswith("</html>"))
        # 不允许任何外部资源引用（图片/脚本/样式/字体）
        self.assertIsNone(re.search(r'<(script|link)[^>]+(src|href)="(?!#|data:)', self.html))

    def test_no_placeholders_left(self) -> None:
        for token in ("{{STYLE}}", "{{APP}}", "{{BOOK}}", "{{S2T}}", "{{T2S}}"):
            self.assertNotIn(token, self.html)

    def test_payload_embedded(self) -> None:
        self.assertIn("window.__BOOK__=", self.html)
        self.assertIn('"chapters"', self.html)
        self.assertGreater(self.out.stat().st_size, 300_000)

    def test_menus_present(self) -> None:
        for anchor in ('id="toc"', 'id="searchDrawer"', 'id="setDrawer"', 'id="pg-label"'):
            self.assertIn(anchor, self.html)


if __name__ == "__main__":
    unittest.main()
