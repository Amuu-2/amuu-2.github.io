# -*- coding: utf-8 -*-
"""重新生成 Fusion Pixel 字体子集(硬约束 1:改任何页面文案后必跑)。

汇总 index.html / style.css / tokens.css 的全部字符 → 子集化 → 写回 fusion-pixel-subset.woff2。
跑完记得把四处 ?v= 版本号 +1(硬约束 6),否则浏览器会复用旧字体、新字回退黑体。

用法:  C:/python/python.exe fonts/make-subset.py       # 在仓库根目录执行
依赖:  pip install fonttools brotli
完整字体:默认找 ../fusion-pixel-zh_hans-FULL.woff2(工作区,故意不入仓库以免 915KB 上 Pages);
        丢了就去 github.com/TakWolf/fusion-pixel-font releases 重下 12px monospaced zh_hans。

关于缺字校验:子集化时多收一点字符是无害的,但"渲染得到却字体里没有"会让该字回退系统黑体
(用户称之为"乱码感")。所以这里分两个集合——注释里的字符只参与子集化,不参与缺字校验,
否则 CSS 注释里的 ≈ ≥ 之类会造成误报。
"""
import os, re, subprocess, sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FULL = os.environ.get("FUSION_FULL") or os.path.join(REPO, "..", "fusion-pixel-zh_hans-FULL.woff2")
OUT = os.path.join(REPO, "fonts", "fusion-pixel-subset.woff2")
CHARS = os.path.join(REPO, "fonts", ".subset-chars.txt")
SOURCES = ["index.html", "style.css", "tokens.css",
           "intro/intro.js", "intro/intro.css"]  # intro 的文案在 JS 里(bootLines/标签)

if not os.path.exists(FULL):
    sys.exit("找不到完整字体: %s\n去 TakWolf/fusion-pixel-font releases 下 12px monospaced zh_hans" % FULL)

STRIP_COMMENTS = [re.compile(r"/\*.*?\*/", re.S), re.compile(r"<!--.*?-->", re.S)]

all_chars, rendered_chars = set(), set()
for name in SOURCES:
    raw = open(os.path.join(REPO, name), encoding="utf-8").read()
    all_chars.update(raw)
    stripped = raw
    for pat in STRIP_COMMENTS:
        stripped = pat.sub(" ", stripped)
    rendered_chars.update(stripped)
all_chars -= set("\n\r\t")
rendered_chars -= set("\n\r\t")

text = "".join(sorted(all_chars))
open(CHARS, "w", encoding="utf-8").write(text)
print("汇总字符数:", len(text), "(其中参与缺字校验的:", len(rendered_chars), ")")

r = subprocess.run([sys.executable, "-m", "fontTools.subset", FULL,
                    "--text-file=" + CHARS, "--flavor=woff2", "--output-file=" + OUT,
                    "--no-hinting", "--desubroutinize"], capture_output=True, text=True)
if r.returncode:
    sys.exit(r.stdout + r.stderr)

from fontTools.ttLib import TTFont
cmap = TTFont(OUT).getBestCmap()
missing = sorted(c for c in rendered_chars if ord(c) not in cmap and c.strip())
only_in_comments = sorted(c for c in all_chars - rendered_chars if ord(c) not in cmap and c.strip())

print("子集体积:", os.path.getsize(OUT), "字节")
if only_in_comments:
    print("仅注释里缺字(不渲染,可忽略):", "".join(only_in_comments))
if missing:
    sys.exit("渲染文本缺字: %s\n这些字符完整字体里也没有,会回退系统黑体。换成字体支持的字符(例:✕→×)" % "".join(missing))
print("缺字: (无)")
print("完成。别忘了把 index.html / style.css / tokens.css 里的 ?v= 版本号 +1")
