"""StackNova brand v3 — 'Sliced S' lettermark.

Idea: a bold geometric S cut into three stacked slabs (the STACK) with a sparkle bursting
off the top terminal (the NOVA). Solid shapes, no outlines, one confident colour field.
"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path(__file__).parent / "v3"
OUT.mkdir(exist_ok=True)

COLORWAYS = {
    "electric": dict(bg1="#3B2BFF", bg2="#1E12B8", mark="#FFFFFF", spark="#D4FF3A",
                     ink="#FFFFFF", sub="#C9C6FF", chip_bg="#D4FF3A", chip_fg="#14102E"),
    "supernova": dict(bg1="#17122E", bg2="#08060F", mark="url(#warm)", spark="#FFD24D",
                      ink="#FFFFFF", sub="#B7B0D6", chip_bg="#FF5A5F", chip_fg="#FFFFFF"),
    "lime": dict(bg1="#D4FF3A", bg2="#B8EE12", mark="#120E2A", spark="#3B2BFF",
                 ink="#120E2A", sub="#3C4A12", chip_bg="#120E2A", chip_fg="#D4FF3A"),
}

S_PATH = "M600 220 H340 A125 125 0 0 0 340 470 H460 A125 125 0 0 1 460 720 H200"


def sparkle(cx, cy, r, pinch=0.13):
    p = r * pinch
    return (f"M{cx} {cy-r} C{cx+p} {cy-p} {cx+p} {cy-p} {cx+r} {cy} "
            f"C{cx+p} {cy+p} {cx+p} {cy+p} {cx} {cy+r} C{cx-p} {cy+p} {cx-p} {cy+p} {cx-r} {cy} "
            f"C{cx-p} {cy-p} {cx-p} {cy-p} {cx} {cy-r} Z")


def mark(cw, uid, show_spark=True):
    c = COLORWAYS[cw]
    gap = 24
    return f"""<svg viewBox="100 20 680 800" xmlns="http://www.w3.org/2000/svg">
<defs>
  <linearGradient id="warm" gradientUnits="userSpaceOnUse" x1="140" y1="145" x2="660" y2="755">
    <stop offset="0" stop-color="#FFB547"/><stop offset=".45" stop-color="#FF5A5F"/><stop offset="1" stop-color="#8B5CFF"/>
  </linearGradient>
  <mask id="cut{uid}" maskUnits="userSpaceOnUse" x="0" y="0" width="900" height="900">
    <rect width="900" height="900" fill="#fff"/>
    <rect x="0" y="{345-gap/2}" width="900" height="{gap}" fill="#000"/>
    <rect x="0" y="{595-gap/2}" width="900" height="{gap}" fill="#000"/>
  </mask>
</defs>
<path d="{S_PATH}" fill="none" stroke="{c['mark']}" stroke-width="150" mask="url(#cut{uid})"/>
{f'<path d="{sparkle(690, 118, 84)}" fill="{c["spark"]}"/>' if show_spark else ''}
</svg>"""


CSS = """*{margin:0;padding:0;box-sizing:border-box} body{overflow:hidden;font-family:'Inter Display',Inter,sans-serif}"""


def avatar_html(cw, size):
    c = COLORWAYS[cw]
    return f"""<!doctype html><html><head><style>{CSS}
body{{width:{size}px;height:{size}px;display:grid;place-items:center;
 background:radial-gradient(circle at 30% 20%,{c['bg1']} 0%,{c['bg2']} 100%)}}
.m{{width:{int(size*.62)}px;height:{int(size*.62*800/680)}px;transform:translate(-1%,1%)}} .m svg{{width:100%;height:100%}}
</style></head><body><div class="m">{mark(cw,'a')}</div></body></html>"""


def banner_html(cw):
    c = COLORWAYS[cw]
    # giant cropped S as a background graphic, echoing the slices as bands across the banner
    return f"""<!doctype html><html><head><style>{CSS}
body{{width:2560px;height:1440px;position:relative;
 background:radial-gradient(ellipse 80% 90% at 25% 40%,{c['bg1']} 0%,{c['bg2']} 100%)}}
.giant{{position:absolute;right:-420px;top:-200px;width:1500px;height:1765px;opacity:.07}}
.giant svg{{width:100%;height:100%}}
.safe{{position:absolute;left:507px;top:508px;width:1546px;height:423px;display:flex;align-items:center;gap:70px;padding:0 20px}}
.m{{width:300px;height:353px;flex:none}} .m svg{{width:100%;height:100%}}
.word{{font-weight:800;font-size:150px;letter-spacing:-6px;line-height:.95;color:{c['ink']}}}
.head{{font-family:Inter;font-weight:500;font-size:44px;letter-spacing:-.5px;color:{c['sub']};margin-top:22px;white-space:nowrap}}
.head b{{color:{c['ink']};font-weight:700}}
.row{{display:flex;gap:18px;margin-top:34px;white-space:nowrap;font-family:Inter}}
.chip{{font-weight:700;font-size:28px;padding:12px 24px;border-radius:999px;background:{c['chip_bg']};color:{c['chip_fg']}}}
.ghost{{font-weight:600;font-size:28px;padding:12px 24px;border-radius:999px;border:2px solid {c['sub']};color:{c['ink']};opacity:.9}}
</style></head><body>
<div class="giant">{mark(cw,'g',False)}</div>
<div class="safe">
  <div class="m">{mark(cw,'b')}</div>
  <div>
    <div class="word">StackNova</div>
    <div class="head">Backend systems, <b>explained from the inside.</b></div>
    <div class="row">
      <div class="chip">New deep dives · Tue &amp; Sat</div>
      <div class="ghost">Distributed systems · Databases · Java · Go · Node</div>
    </div>
  </div>
</div></body></html>"""


def sheet_html():
    rows = ""
    for cw in COLORWAYS:
        av = (OUT / f"{cw}-avatar-800.png").resolve().as_uri()
        bn = (OUT / f"{cw}-banner.png").resolve().as_uri()
        sizes = "".join(f'<img src="{av}" style="width:{s}px;height:{s}px;border-radius:50%">' for s in (180, 88, 40))
        rows += f'<div class="r"><div class="l">{cw}</div>{sizes}<img class="b" src="{bn}"></div>'
    return f"""<!doctype html><html><head><style>{CSS}
body{{width:1900px;padding:40px;background:#F4F3EF;font-family:Inter}}
.r{{display:flex;align-items:center;gap:26px;margin-bottom:34px}} .l{{width:150px;font-weight:700;font-size:28px;color:#111}}
.b{{width:1150px;border-radius:12px;margin-left:16px}}
</style></head><body>{rows}</body></html>"""


async def shot(page, html, w, h, name):
    await page.set_viewport_size({"width": w, "height": h})
    await page.set_content(html, wait_until="networkidle")
    await page.screenshot(path=str(OUT / name), clip={"x": 0, "y": 0, "width": w, "height": h})


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
                                    args=["--allow-file-access-from-files"])
        page = await b.new_page()
        for cw in COLORWAYS:
            await shot(page, avatar_html(cw, 800), 800, 800, f"{cw}-avatar-800.png")
            await shot(page, avatar_html(cw, 1080), 1080, 1080, f"{cw}-avatar-1080.png")
            await shot(page, banner_html(cw), 2560, 1440, f"{cw}-banner.png")
        tmp = OUT / "_sheet.html"
        tmp.write_text(sheet_html())
        await page.set_viewport_size({"width": 1900, "height": 1000})
        await page.goto(tmp.resolve().as_uri(), wait_until="networkidle")
        await page.screenshot(path=str(OUT / "compare-sheet.png"), full_page=True)
        await b.close()


asyncio.run(main())
