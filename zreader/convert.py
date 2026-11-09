"""简繁转换。

原文以简体为主（夹杂少量繁体字），阅读器需要同时提供简体与繁体两个版本：

* 简 -> 繁：OpenCC `s2tw` 用词级转换，再做一轮**文言文校正**（见 CORRECTIONS）。
* 繁 -> 简：逐字 `t2s`；若简化结果是 Unicode 增补区（非 BMP）的罕用字，
  多数系统字体缺字会显示成豆腐块，此时保留原字形。

校正表里每一条都必须在语料中命中，否则构建报错——避免改了文本后规则悄悄失效。
"""

from __future__ import annotations

from opencc import OpenCC

_s2tw = OpenCC("s2tw")
_t2s = OpenCC("t2s")

#: 文言文语料上 OpenCC 的常见误判（误 -> 正）。按出现顺序应用。
CORRECTIONS: tuple[tuple[str, str], ...] = (
    # 里：文言多指里程/乡里，不应一律转成「裡」
    ("裡", "里"),
    # 咸 = 皆/全，不是「鹹」
    ("鹹", "咸"),
    # 斗斛是量器（斗），不是「鬥」
    ("鬥斛", "斗斛"),
    # 盡 / 儘
    ("求儘性", "求盡性"),
    # 布施（不是「佈施」）
    ("佈施", "布施"),
    # 復命（不是「覆命」）
    ("覆命搖作", "復命搖作"),
    # 干：干越 / 干餘骨 / 鏌干 / 干縣令 为专名；乾 = 乾燥
    ("被髮而幹", "被髮而乾"),
    ("欲幹酒肉", "欲乾酒肉"),
    ("幹越", "干越"),
    ("幹餘骨", "干餘骨"),
    ("鏌幹", "鏌干"),
    ("幹縣令", "干縣令"),
    # 云：曰 / 云云 用「云」；「雲將」为人名，保留
    ("雲者", "云者"),
    ("雲至於大病", "云至於大病"),
    # 余：第一人称「余」与剩余「餘」
    ("餘愧乎道德", "余愧乎道德"),
    ("餘語女", "余語女"),
    ("餘語，三皇五帝", "余語，三皇五帝"),
    ("餘將去女", "余將去女"),
    ("餘立於宇宙之中", "余立於宇宙之中"),
    ("不知餘也", "不知余也"),
    ("餘且", "余且"),  # 渔者「余且」为人名
    # 幷 -> 並
    ("幷", "並"),
    # 凶：凶器 / 逆之則凶，用「凶」不用「兇」
    ("兇", "凶"),
)


class ConversionError(RuntimeError):
    """校正规则在本轮语料上没有命中。"""


def to_traditional(text: str) -> str:
    """简体 -> 繁体（含文言文校正）。"""
    out = _s2tw.convert(text)
    for wrong, right in CORRECTIONS:
        out = out.replace(wrong, right)
    return out


def to_simplified(text: str) -> str:
    """繁体/混合 -> 简体；非 BMP 的罕用简体字形保留原字。"""
    out: list[str] = []
    for ch in text:
        simple = _t2s.convert(ch)
        if len(simple) != 1 or ord(simple) > 0xFFFF:
            out.append(ch)
        else:
            out.append(simple)
    return "".join(out)


def char_maps(chars: str) -> tuple[dict[str, str], dict[str, str]]:
    """为「搜索词归一化」生成逐字映射：(简->繁, 繁->简)。只收录会变化的字。"""
    s2t: dict[str, str] = {}
    t2s: dict[str, str] = {}
    for ch in sorted(set(chars)):
        trad = _s2tw.convert(ch)
        if len(trad) == 1 and trad != ch:
            s2t[ch] = trad
        simple = _t2s.convert(ch)
        if len(simple) == 1 and simple != ch and ord(simple) <= 0xFFFF:
            t2s[ch] = simple
    return s2t, t2s


def verify_corrections(source_text: str) -> None:
    """确认每条校正规则都在本轮语料中命中，防止规则失效后被静默忽略。"""
    converted = _s2tw.convert(source_text)
    missing = [f"{wrong}->{right}" for wrong, right in CORRECTIONS if wrong not in converted]
    if missing:
        raise ConversionError(
            "以下校正规则在语料中未命中（原文或 OpenCC 版本变化？）：" + ", ".join(missing)
        )
