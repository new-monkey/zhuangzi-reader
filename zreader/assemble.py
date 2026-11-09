"""把正文数据 + 前端资源装配成一个自包含的单页 HTML。"""

from __future__ import annotations

import json
from pathlib import Path

WEB_DIR = Path(__file__).resolve().parent.parent / "web"

#: 注入模板的占位符
TOKENS = ("{{STYLE}}", "{{APP}}", "{{BOOK}}", "{{S2T}}", "{{T2S}}")


def _read(name: str) -> str:
    return (WEB_DIR / name).read_text(encoding="utf-8")


def _js(value: object) -> str:
    """序列化成可安全内嵌进 <script> 的 JS 字面量。"""
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")


def build_html(book: dict, s2t: dict[str, str], t2s: dict[str, str]) -> str:
    """返回完整的 HTML 文本。"""
    html = _read("layout.html")
    replacements = {
        "{{STYLE}}": _read("style.css").rstrip(),
        "{{APP}}": _read("app.js").rstrip(),
        "{{BOOK}}": "window.__BOOK__=" + _js(book) + ";",
        "{{S2T}}": "window.__S2T__=" + _js(s2t) + ";",
        "{{T2S}}": "window.__T2S__=" + _js(t2s) + ";",
    }
    for token in TOKENS:
        if token not in html:
            raise RuntimeError(f"模板 layout.html 缺少占位符 {token}")
        html = html.replace(token, replacements[token], 1)
    leftovers = [t for t in TOKENS if t in html]
    if leftovers:
        raise RuntimeError(f"模板占位符重复出现：{leftovers}")
    return html
