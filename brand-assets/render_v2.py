"""StackNova brand v2 — three concepts (avatar + banner each) and a comparison sheet."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path(__file__).parent / "v2"
OUT.mkdir(exist_ok=True)

BG = "#0A0E14"
INK = "#EAF0F6"
MUTED = "#8C99AB"
GREEN = "#3DDC97"
TEAL = "#2EC4D6"
VIOLET = "#7C5CFF"


def spark(cx, cy, r, fill, pinch=0.16):
    """Four-point star with concave sides."""
    p = r * pinch
    return (f'<path d="M{cx} {cy-r} C{cx+p} {cy-p} {cx+p} {cy-p} {cx+r} {cy} '
            f'C{cx+p} {cy+p} {cx+p} {cy+p} {cx} {cy+r} C{cx-p} {cy+p} {cx-p} {cy+p} {cx-r} {cy} '
            f'C{cx-p} {cy-p} {cx-p} {cy-p} {cx} {cy-r} Z" fill="{fill}"/>')


def defs(u):
    return f"""<defs>
  <linearGradient id="nv{u}" x1="0" y1="1" x2="1" y2="0">
    <stop offset="0" stop-color="{VIOLET}"/><stop offset=".55" stop-color="{TEAL}"/><stop offset="1" stop-color="{GREEN}"/>
  </linearGradient>
  <radialGradient id="glow{u}" cx=".5" cy=".5" r=".5">
    <stop offset="0" stop-color="{GREEN}" stop-opacity=".55"/><stop offset=".45" stop-color="{TEAL}" stop-opacity=".15"/>
    <stop offset="1" stop-color="{TEAL}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="side{u}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#1B2433"/><stop offset="1" stop-color="#111823"/>
  </linearGradient>
</defs>"""


# ---------- Concept A: "Lit Stack" — three isometric layers, a nova igniting on top ----------
def layer(cx, y, hw, hh, t, top_fill, edge, u):
    top = f"{cx},{y-hh} {cx+hw},{y} {cx},{y+hh} {cx-hw},{y}"
    left = f"{cx-hw},{y} {cx},{y+hh} {cx},{y+hh+t} {cx-hw},{y+t}"
    right = f"{cx+hw},{y} {cx},{y+hh} {cx},{y+hh+t} {cx+hw},{y+t}"
    return (f'<polygon points="{left}" fill="url(#side{u})" stroke="{edge}" stroke-width="3" stroke-linejoin="round"/>'
            f'<polygon points="{right}" fill="#0F151F" stroke="{edge}" stroke-width="3" stroke-linejoin="round"/>'
            f'<polygon points="{top}" fill="{top_fill}" stroke="{edge}" stroke-width="3" stroke-linejoin="round"/>')


def mark_a(u):
    hw, hh, t = 230, 118, 44
    return f"""<svg viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">{defs(u)}
  <circle cx="400" cy="250" r="250" fill="url(#glow{u})"/>
  {layer(400, 560, hw, hh, t, "#18202D", VIOLET, u)}
  {layer(400, 458, hw, hh, t, "#1A2533", TEAL, u)}
  {layer(400, 356, hw, hh, t, f"url(#nv{u})", GREEN, u)}
  {spark(400, 200, 128, "#FFFFFF", .14)}
  {spark(400, 200, 128, f"url(#nv{u})", .14).replace('fill=', 'opacity=".35" fill=')}
  <circle cx="400" cy="200" r="13" fill="#FFFFFF"/>
</svg>"""


# ---------- Concept B: "Braces Nova" — code braces holding a nova ----------
def brace(mirror=False):
    d = ("M300 140 C215 140 215 190 215 265 L215 335 C215 378 195 400 140 400 "
         "C195 400 215 422 215 465 L215 535 C215 610 215 660 300 660")
    tr = ' transform="translate(800 0) scale(-1 1)"' if mirror else ""
    return d, tr


def mark_b(u):
    d, _ = brace()
    return f"""<svg viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">{defs(u)}
  <circle cx="400" cy="400" r="230" fill="url(#glow{u})"/>
  <path d="{d}" fill="none" stroke="{INK}" stroke-width="46" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="{d}" transform="translate(800 0) scale(-1 1)" fill="none" stroke="{INK}" stroke-width="46" stroke-linecap="round" stroke-linejoin="round"/>
  {spark(400, 400, 150, f"url(#nv{u})", .15)}
  <circle cx="400" cy="400" r="15" fill="#FFFFFF"/>
</svg>"""


# ---------- Concept C: "SN Monogram" — calm, credible tile ----------
def mark_c(u):
    return f"""<svg viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">{defs(u)}
  <rect x="90" y="90" width="620" height="620" rx="150" fill="#111823" stroke="url(#nv{u})" stroke-width="14"/>
  <text x="392" y="512" text-anchor="middle" font-family="Inter" font-weight="800" font-size="300"
        letter-spacing="-14" fill="{INK}">SN</text>
  <rect x="215" y="565" width="370" height="16" rx="8" fill="url(#nv{u})"/>
  {spark(575, 230, 70, GREEN, .16)}
</svg>"""


CONCEPTS = {"a-lit-stack": mark_a, "b-braces-nova": mark_b, "c-monogram": mark_c}

CSS = f"""*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{background:{BG}}} body{{font-family:Inter,sans-serif;color:{INK};overflow:hidden}}"""


def avatar_html(fn, size):
    return f"""<!doctype html><html><head><style>{CSS}
body{{width:{size}px;height:{size}px;display:grid;place-items:center;
 background:radial-gradient(circle at 50% 42%,#142030 0%,{BG} 68%)}}
.m{{width:{int(size*.84)}px;height:{int(size*.84)}px}} .m svg{{width:100%;height:100%}}
</style></head><body><div class="m">{fn('x')}</div></body></html>"""


def iso_cube(x, y, s, stroke, op):
    h = s * .5
    return (f'<g opacity="{op}" stroke="{stroke}" stroke-width="2" fill="none" stroke-linejoin="round">'
            f'<polygon points="{x},{y-h} {x+s},{y} {x},{y+h} {x-s},{y}"/>'
            f'<polyline points="{x-s},{y} {x-s},{y+s*.8} {x},{y+h+s*.8} {x+s},{y+s*.8} {x+s},{y}"/>'
            f'<line x1="{x}" y1="{y+h}" x2="{x}" y2="{y+h+s*.8}"/></g>')


def system_map():
    """Faint isometric 'architecture' on both flanks (outside the mobile safe area)."""
    nodes_l = [(250, 420, VIOLET), (420, 640, TEAL), (210, 860, GREEN), (400, 1060, VIOLET)]
    nodes_r = [(2310, 400, TEAL), (2140, 620, GREEN), (2350, 840, VIOLET), (2160, 1060, TEAL)]
    out = []
    for pts in (nodes_l, nodes_r):
        for (x1, y1, _), (x2, y2, _) in zip(pts, pts[1:]):
            out.append(f'<path d="M{x1} {y1+60} L{x2} {y2-30}" stroke="{TEAL}" stroke-opacity=".28" '
                       f'stroke-width="2" stroke-dasharray="4 10"/>')
            mx, my = (x1 + x2) / 2, (y1 + 60 + y2 - 30) / 2
            out.append(f'<circle cx="{mx}" cy="{my}" r="6" fill="{GREEN}" opacity=".7"/>')
        for x, y, c in pts:
            out.append(iso_cube(x, y, 64, c, .55))
    return "".join(out)


def banner_html(fn):
    dots = "".join(f'<circle cx="{x}" cy="{y}" r="1.6" fill="#1E2836"/>'
                   for x in range(40, 2560, 64) for y in range(40, 1440, 64))
    return f"""<!doctype html><html><head><style>{CSS}
body{{width:2560px;height:1440px;position:relative;
 background:radial-gradient(ellipse 55% 50% at 50% 50%,#121B28 0%,{BG} 78%)}}
.bg{{position:absolute;inset:0}}
.safe{{position:absolute;left:507px;top:508px;width:1546px;height:423px;display:flex;align-items:center;gap:60px;padding:0 30px}}
.m{{width:350px;height:350px;flex:none}} .m svg{{width:100%;height:100%}}
.kick{{font-weight:600;font-size:28px;letter-spacing:6px;color:{GREEN};text-transform:uppercase}}
.word{{font-weight:800;font-size:138px;letter-spacing:-5px;line-height:1.02;margin-top:6px}}
.word span{{background:linear-gradient(90deg,{TEAL},{GREEN});-webkit-background-clip:text;color:transparent}}
.head{{white-space:nowrap;font-weight:600;font-size:40px;letter-spacing:-.6px;margin-top:10px}}
.row{{display:flex;gap:16px;margin-top:28px;white-space:nowrap}}
.chip{{font-weight:600;font-size:27px;padding:11px 20px;border-radius:999px;border:2px solid #263244;color:{INK};background:#0F1620}}
.chip b{{color:{GREEN};margin-right:8px}}
.chip.solid{{background:{GREEN};color:{BG};border-color:{GREEN}}}
</style></head><body>
<svg class="bg" viewBox="0 0 2560 1440" xmlns="http://www.w3.org/2000/svg">{dots}{system_map()}</svg>
<div class="safe">
  <div class="m">{fn('b')}</div>
  <div>
    <div class="kick">Backend engineering · explained from the inside</div>
    <div class="word">Stack<span>Nova</span></div>
    <div class="head">How real backend systems work — and why they break.</div>
    <div class="row">
      <div class="chip"><b>✓</b>Every claim sourced</div>
      <div class="chip"><b>✓</b>Current versions only</div>
      <div class="chip solid">New deep dives · Tue &amp; Sat</div>
    </div>
  </div>
</div></body></html>"""


def sheet_html(paths):
    cards = ""
    for name, label in [("a-lit-stack", "A · Lit Stack"), ("b-braces-nova", "B · Braces Nova"),
                        ("c-monogram", "C · Monogram")]:
        av = (OUT / f"{name}-avatar-800.png").resolve().as_uri()
        bn = (OUT / f"{name}-banner.png").resolve().as_uri()
        sizes = "".join(f'<img src="{av}" style="width:{s}px;height:{s}px;border-radius:50%">' for s in (160, 88, 40))
        cards += f"""<div class="card"><div class="lbl">{label}</div>
<div class="row">{sizes}<img class="bn" src="{bn}"></div></div>"""
    return f"""<!doctype html><html><head><style>{CSS}
body{{width:1800px;padding:40px;background:#05080C}}
.card{{margin-bottom:36px}} .lbl{{font-weight:700;font-size:30px;margin-bottom:14px}}
.row{{display:flex;align-items:center;gap:28px}} .bn{{width:1100px;border-radius:10px;margin-left:20px}}
</style></head><body>{cards}</body></html>"""


async def shot(page, html, w, h, name):
    await page.set_viewport_size({"width": w, "height": h})
    await page.set_content(html, wait_until="networkidle")
    await page.screenshot(path=str(OUT / name), clip={"x": 0, "y": 0, "width": w, "height": h})


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
                                    args=["--allow-file-access-from-files"])
        page = await b.new_page()
        for name, fn in CONCEPTS.items():
            await shot(page, avatar_html(fn, 800), 800, 800, f"{name}-avatar-800.png")
            await shot(page, avatar_html(fn, 1080), 1080, 1080, f"{name}-avatar-1080.png")
            await shot(page, banner_html(fn), 2560, 1440, f"{name}-banner.png")
        await page.set_viewport_size({"width": 1800, "height": 1200})
        await page.goto((OUT / "_blank.html").resolve().as_uri()) if False else None
        tmp = OUT / "_sheet.html"
        tmp.write_text(sheet_html(None))
        await page.goto(tmp.resolve().as_uri(), wait_until="networkidle")
        await page.screenshot(path=str(OUT / "compare-sheet.png"), full_page=True)
        await b.close()


asyncio.run(main())
