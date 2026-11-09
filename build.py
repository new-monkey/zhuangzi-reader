#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把《庄子》原文编译成一个自包含的单页 HTML 阅读器。

用法::

    python3 build.py                     # texts/zhuangzi.txt -> dist/zhuangzi.html
    python3 build.py --out /tmp/a.html    # 指定输出
    python3 build.py --text other.txt     # 换语料（需同样格式）

构建分四步：解析章节 -> 生成简/繁双版本 -> 生成搜索用字符映射 -> 装配前端资源。
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from zreader import assemble, convert, parser

ROOT = Path(__file__).resolve().parent
DEFAULT_TEXT = ROOT / "texts" / "zhuangzi.txt"
DEFAULT_OUT = ROOT / "dist" / "zhuangzi.html"


def build(text: str) -> tuple[dict, dict[str, str], dict[str, str]]:
    """解析并转换语料，返回 (book, s2t, t2s)。"""
    title, chapters = parser.parse_text(text)

    book = {"title": convert.to_simplified(title), "titleT": convert.to_traditional(title),
            "chapters": []}
    for index, chapter in enumerate(chapters, start=1):
        paragraphs = [
            [convert.to_simplified(para), convert.to_traditional(para)]
            for para in chapter["paras"]
        ]
        book["chapters"].append({
            "ci": index,
            "division": chapter["division"],
            "juan": chapter["juan"],
            "numCn": chapter["numCn"],
            "name": convert.to_simplified(chapter["name"]),
            "nameT": convert.to_traditional(chapter["name"]),
            "paras": paragraphs,
        })

    s2t, t2s = convert.char_maps(text)
    return book, s2t, t2s


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="把《庄子》原文编译成单页 HTML 阅读器")
    ap.add_argument("--text", type=Path, default=DEFAULT_TEXT, help="原文路径（默认 texts/zhuangzi.txt）")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help="输出路径（默认 dist/zhuangzi.html）")
    ap.add_argument("--quiet", action="store_true", help="只输出结果，不打印章节列表")
    args = ap.parse_args(argv)

    if not args.text.exists():
        print(f"找不到原文：{args.text}", file=sys.stderr)
        return 2

    raw = args.text.read_text(encoding="utf-8")
    convert.verify_corrections(raw)
    book, s2t, t2s = build(raw)
    html = assemble.build_html(book, s2t, t2s)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(html, encoding="utf-8")

    chapters = book["chapters"]
    chars = sum(len(p[0]) for c in chapters for p in c["paras"])
    print(f"章节 {len(chapters)} 篇 · 段落 {sum(len(c['paras']) for c in chapters)} 段 · 正文 {chars} 字")
    print(f"输出 {args.out} （{args.out.stat().st_size / 1024:.0f} KB）")
    if not args.quiet:
        for c in chapters:
            print(f"  {c['ci']:2d}  {c['division']:<4} {c['numCn']:<5} {c['name']}（{len(c['paras'])} 段）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
