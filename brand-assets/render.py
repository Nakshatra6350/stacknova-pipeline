"""StackNova brand v4 — Supernova theme, two refined marks.

1. 'Trail S'   : an S drawn as three parallel lanes (the stack) that rise into a nova burst.
2. 'Strata Nova': a four-point nova built from stacked horizontal strata.
"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path(__file__).parent / "v4"
OUT.mkdir(exist_ok=True)

BG1, BG2 = "#17122E", "#07050D"
INK, SUB = "#FFFFFF", "#B7B0D6"
VIOLET, PINK, ORANGE, GOLD = "#7B5CFF", "#FF4D8D", "#FF8A3D", "#FFD24D"


def sparkle(cx, cy, r, pinch=0.12):
    p = r * pinch
    return (f"M{cx} {cy-r} C{cx+p} {cy-p} {cx+p} {cy-p} {cx+r} {cy} "
            f"C{cx+p} {cy+p} {cx+p} {cy+p} {cx} {cy+r} C{cx-p} {cy+p} {cx-p} {cy+p} {cx-r} {cy} "
            f"C{cx-p} {cy-p} {cx-p} {cy-p} {cx} {cy-r} Z")


S = "M610 210 H340 A130 130 0 0 0 340 470 H460 A130 130 0 0 1 460 730 H190"


def trail_s(u, glow=True):
    return f"""<svg viewBox="95 70 760 790" xmlns="http://www.w3.org/2000/svg"><defs>
<linearGradient id="t{u}" gradientUnits="userSpaceOnUse" x1="190" y1="820" x2="640" y2="120">
  <stop offset="0" stop-color="{VIOLET}"/><stop offset=".55" stop-color="{PINK}"/><stop offset="1" stop-color="{ORANGE}"/></linearGradient>
<linearGradient id="sp{u}" x1="0" y1="1" x2="1" y2="0">
  <stop offset="0" stop-color="{ORANGE}"/><stop offset="1" stop-color="{GOLD}"/></linearGradient>
<radialGradient id="gl{u}"><stop offset="0" stop-color="{GOLD}" stop-opacity=".55"/>
  <stop offset=".5" stop-color="{ORANGE}" stop-opacity=".15"/><stop offset="1" stop-color="{ORANGE}" stop-opacity="0"/></radialGradient>
<mask id="m{u}" maskUnits="userSpaceOnUse" x="0" y="0" width="900" height="900">
  <path d="{S}" fill="none" stroke="#fff" stroke-width="180"/>
  <path d="{S}" fill="none" stroke="#000" stroke-width="96"/>
  <path d="{S}" fill="none" stroke="#fff" stroke-width="48"/>
</mask></defs>
{f'<circle cx="728" cy="210" r="124" fill="url(#gl{u})"/>' if glow else ''}
<rect width="900" height="900" fill="url(#t{u})" mask="url(#m{u})"/>
<path d="{sparkle(728, 210, 100)}" fill="url(#sp{u})"/>
</svg>"""


def strata_nova(u, glow=True):
    bands, top, bot, gap = 5, 70, 730, 22
    h = (bot - top) / bands
    rects = "".join(f'<rect x="0" y="{top + i*h + gap/2:.1f}" width="800" height="{h-gap:.1f}" fill="#fff"/>'
                    for i in range(bands))
    return f"""<svg viewBox="40 40 720 720" xmlns="http://www.w3.org/2000/svg"><defs>
<linearGradient id="n{u}" gradientUnits="userSpaceOnUse" x1="0" y1="70" x2="0" y2="730">
  <stop offset="0" stop-color="{GOLD}"/><stop offset=".3" stop-color="{ORANGE}"/>
  <stop offset=".62" stop-color="{PINK}"/><stop offset="1" stop-color="{VIOLET}"/></linearGradient>
<radialGradient id="g{u}"><stop offset="0" stop-color="{PINK}" stop-opacity=".35"/>
  <stop offset="1" stop-color="{VIOLET}" stop-opacity="0"/></radialGradient>
<mask id="k{u}" maskUnits="userSpaceOnUse" x="0" y="0" width="800" height="800">{rects}</mask></defs>
{f'<circle cx="400" cy="400" r="360" fill="url(#g{u})"/>' if glow else ''}
<path d="{sparkle(400, 400, 330, .26)}" fill="url(#n{u})" mask="url(#k{u})"/>
</svg>"""


MARKS = {"trail-s": (trail_s, 760 / 790), "strata-nova": (strata_nova, 1.0)}
CSS = "*{margin:0;padding:0;box-sizing:border-box} body{overflow:hidden;font-family:'Inter Display',Inter,sans-serif}"


def avatar_html(fn, ar, size, k=.66):
    w = int(size * k * min(1, ar)); h = int(w / ar)
    return f"""<!doctype html><html><head><style>{CSS}
body{{width:{size}px;height:{size}px;display:grid;place-items:center;
 background:radial-gradient(circle at 50% 35%,#221A42 0%,{BG2} 75%)}}
.m{{width:{w}px;height:{h}px}} .m svg{{width:100%;height:100%}}
</style></head><body><div class="m">{fn('a')}</div></body></html>"""


def banner_html(fn, ar):
    mh = 360; mw = int(mh * ar)
    return f"""<!doctype html><html><head><style>{CSS}
body{{width:2560px;height:1440px;position:relative;
 background:radial-gradient(ellipse 70% 80% at 30% 45%,{BG1} 0%,{BG2} 100%)}}
.giant{{position:absolute;right:-380px;top:-160px;width:1600px;height:{int(1600/ar)}px;opacity:.09}}
.giant svg{{width:100%;height:100%}}
.safe{{position:absolute;left:507px;top:508px;width:1546px;height:423px;display:flex;align-items:center;gap:64px;padding:0 20px}}
.m{{width:{mw}px;height:{mh}px;flex:none}} .m svg{{width:100%;height:100%}}
.word{{font-weight:800;font-size:150px;letter-spacing:-6px;line-height:.95;color:{INK}}}
.word span{{background:linear-gradient(90deg,{PINK},{ORANGE});-webkit-background-clip:text;color:transparent}}
.head{{font-family:Inter;font-weight:500;font-size:44px;letter-spacing:-.5px;color:{SUB};margin-top:22px;white-space:nowrap}}
.head b{{color:{INK};font-weight:700}}
.row{{display:flex;gap:18px;margin-top:34px;white-space:nowrap;font-family:Inter}}
.chip{{font-weight:700;font-size:28px;padding:12px 24px;border-radius:999px;color:#fff;
 background:linear-gradient(90deg,{PINK},{ORANGE})}}
.ghost{{font-weight:600;font-size:28px;padding:12px 24px;border-radius:999px;border:2px solid #3A3260;color:{INK}}}
</style></head><body>
<div class="giant">{fn('g', False)}</div>
<div class="safe">
  <div class="m">{fn('b')}</div>
  <div>
    <div class="word">Stack<span>Nova</span></div>
    <div class="head">Backend systems, <b>explained from the inside.</b></div>
    <div class="row">
      <div class="chip">New deep dives · Tue &amp; Sat</div>
      <div class="ghost">Distributed systems · Databases · Java · Go · Node</div>
    </div>
  </div>
</div></body></html>"""


def sheet_html():
    rows = ""
    for name in MARKS:
        av = (OUT / f"{name}-avatar-800.png").resolve().as_uri()
        bn = (OUT / f"{name}-banner.png").resolve().as_uri()
        sizes = "".join(f'<img src="{av}" style="width:{s}px;height:{s}px;border-radius:50%">' for s in (200, 88, 40))
        rows += f'<div class="r"><div class="l">{name}</div>{sizes}<img class="b" src="{bn}"></div>'
    return f"""<!doctype html><html><head><style>{CSS}
body{{width:1900px;padding:40px;background:#F4F3EF;font-family:Inter}}
.r{{display:flex;align-items:center;gap:26px;margin-bottom:34px}} .l{{width:160px;font-weight:700;font-size:28px;color:#111}}
.b{{width:1120px;border-radius:12px;margin-left:16px}}</style></head><body>{rows}</body></html>"""


async def shot(page, html, w, h, name):
    await page.set_viewport_size({"width": w, "height": h})
    await page.set_content(html, wait_until="networkidle")
    await page.screenshot(path=str(OUT / name), clip={"x": 0, "y": 0, "width": w, "height": h})


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
                                    args=["--allow-file-access-from-files"])
        page = await b.new_page()
        for name, (fn, ar) in MARKS.items():
            await shot(page, avatar_html(fn, ar, 800), 800, 800, f"{name}-avatar-800.png")
            await shot(page, avatar_html(fn, ar, 1080), 1080, 1080, f"{name}-avatar-1080.png")
            await shot(page, banner_html(fn, ar), 2560, 1440, f"{name}-banner.png")
        tmp = OUT / "_sheet.html"; tmp.write_text(sheet_html())
        await page.set_viewport_size({"width": 1900, "height": 900})
        await page.goto(tmp.resolve().as_uri(), wait_until="networkidle")
        await page.screenshot(path=str(OUT / "compare-sheet.png"), full_page=True)
        await b.close()


asyncio.run(main())
