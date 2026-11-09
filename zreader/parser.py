"""把《庄子》原文解析成结构化的章节数据。

原文格式（`texts/zhuangzi.txt`）：

* 首行是书名：「庄子（南华经）」
* 篇题单独成行，形如「　　卷一上第一逍遥游」，以两个全角空格缩进、不含标点
* 正文段落以两个全角空格缩进，段落之间用空行分隔
* 另有「外篇卷」「杂篇」这类分卷标记行

原文本缺失七篇小标题（刻意、田子方、知北游、徐无鬼、盗跖、渔父、列御寇），
它们的正文被并入了前一篇，因此解析时需要按篇首句再切一刀，见 EXTRA_CHAPTERS。
"""

from __future__ import annotations

import re
from typing import Iterable

#: 分卷标记行 -> 分卷名
DIVISION_MARKERS = {"内篇": "内篇", "外篇卷": "外篇", "杂篇": "杂篇"}

#: 原文缺失小标题的篇目：(篇首句前缀, 篇序, 篇名, 分卷)
EXTRA_CHAPTERS: tuple[tuple[str, int, str, str], ...] = (
    ("刻意尚行", 15, "刻意", "外篇"),
    ("田子方侍坐于魏文侯", 21, "田子方", "外篇"),
    ("知北游于玄水之上", 22, "知北游", "外篇"),
    ("徐无鬼因女商见魏武侯", 24, "徐无鬼", "杂篇"),
    ("孔子与柳下季为友", 29, "盗跖", "杂篇"),
    ("孔子游乎缁帷之林", 31, "渔父", "杂篇"),
    ("列御寇之齐，中道而反", 32, "列御寇", "杂篇"),
)

#: 判断「篇题行」时要排除的标点
_PUNCT = "，。；：！？、「」『』（）《》﹗﹖…"

_HEAD_RE = re.compile(r"^(卷[一二三四五六七八九十]+[上中下]?)第([一二三四五六七八九十]+)(.+)$")

_CN_DIGITS = "零一二三四五六七八九"

_INDENT = "\u3000\u3000"  # 原文段落缩进用的两个全角空格


def cn_num(n: int) -> str:
    """1..99 的中文数字写法，用于「第二十三」这类篇序。"""
    if n < 10:
        return _CN_DIGITS[n]
    if n < 20:
        return "十" + (_CN_DIGITS[n % 10] if n % 10 else "")
    tens, ones = divmod(n, 10)
    return _CN_DIGITS[tens] + "十" + (_CN_DIGITS[ones] if ones else "")


def is_heading(line: str) -> bool:
    """篇题行：全角缩进、很短、且不含标点。"""
    if not line.startswith(_INDENT):
        return False
    body = line.strip()
    if not body or len(body) > 30:
        return False
    return not any(ch in body for ch in _PUNCT)


def _split_extra(chapter: dict) -> list[dict]:
    """把「寄生」在前一篇里的缺标题篇目切出来。"""
    extra = {prefix: (num, name, div) for prefix, num, name, div in EXTRA_CHAPTERS}
    out: list[dict] = []
    cur: dict | None = None
    for para in chapter["paras"]:
        meta = next((extra[p] for p in extra if para.startswith(p)), None)
        if meta:
            num, name, div = meta
            cur = {
                "juan": "",
                "numCn": "第" + cn_num(num),
                "name": name,
                "division": div,
                "paras": [para],
            }
            out.append(cur)
        else:
            if cur is None:
                cur = {k: chapter[k] for k in ("juan", "numCn", "name", "division")}
                cur["paras"] = []
                out.append(cur)
            cur["paras"].append(para)
    return out


def parse_text(text: str) -> tuple[str, list[dict]]:
    """解析整篇原文，返回 (书名, 章节列表)。

    每个章节形如::

        {"juan": "卷一上", "numCn": "第一", "name": "逍遥游",
         "division": "内篇", "paras": ["北冥有鱼，…", …]}
    """
    title = "庄子（南华经）"
    chapters: list[dict] = []
    division = "内篇"

    for raw in text.splitlines():
        line = raw.rstrip()
        body = line.strip()
        if not body:
            continue
        if body in DIVISION_MARKERS:
            division = DIVISION_MARKERS[body]
            continue
        # 书名行：形如「庄子（南华经）」，只认第一行，避免把「庄子曰：…」当成书名
        if not chapters and body.startswith("庄子") and "（" in body:
            title = body
            continue
        if is_heading(line):
            m = _HEAD_RE.match(body)
            if m:
                juan, num_cn, name = m.group(1), "第" + m.group(2), m.group(3)
            else:
                juan, num_cn, name = "", "", body
            chapters.append(
                {"juan": juan, "numCn": num_cn, "name": name,
                 "division": division, "paras": []}
            )
            continue
        if not chapters:  # 兜底：第一个标题之前出现的正文
            chapters.append(
                {"juan": "", "numCn": "", "name": title,
                 "division": division, "paras": []}
            )
        chapters[-1]["paras"].append(body)

    result: list[dict] = []
    for chapter in chapters:
        result.extend(_split_extra(chapter))
    return title, result


def iter_paragraphs(chapters: Iterable[dict]) -> Iterable[str]:
    """遍历所有正文段落。"""
    for chapter in chapters:
        yield from chapter["paras"]
