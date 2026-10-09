"""StackNova final brand: 3D emblem (stack of glowing layers + nova burst) + wordmark."""
import asyncio, base64
from pathlib import Path
from playwright.async_api import async_playwright

HERE = Path(__file__).parent
OUT = HERE  # outputs next to this script
EMB = "data:image/jpeg;base64," + base64.b64encode((HERE / "source" / "emblem-1264.jpg").read_bytes()).decode()

BG = "#020008"
CSS = """*{margin:0;padding:0;box-sizing:border-box} body{overflow:hidden;font-family:'Inter Display',Inter,sans-serif}
.emb{background:url(EMB) center/cover no-repeat;
 -webkit-mask-image:radial-gradient(circle at 50% 50%,#000 52%,transparent 71%)}""".replace("EMB", EMB)
GRAD = "linear-gradient(90deg,#FF4D8D 0%,#FF8A3D 60%,#FFD24D 100%)"


def avatar(size):
    # emblem fills the circle; content centre is slightly above middle, so nudge down
    s = int(size * 1.0)
    return f"""<!doctype html><html><head><style>{CSS}
body{{width:{size}px;height:{size}px;position:relative;background:radial-gradient(circle at 50% 55%,#1a0b33 0%,{BG} 70%)}}
.emb{{position:absolute;width:{s}px;height:{s}px;left:{(size-s)//2}px;top:{(size-s)//2 + int(size*.025)}px;-webkit-mask-image:none}}
</style></head><body><div class="emb"></div></body></html>"""


def banner():
    stars = "".join(
        f'<circle cx="{x}" cy="{y}" r="{r}" fill="#fff" opacity="{o}"/>'
        for x, y, r, o in [(180,220,1.6,.5),(420,120,1.2,.4),(760,300,1.4,.35),(1900,160,1.5,.5),(2240,260,1.2,.4),
                           (2400,520,1.8,.45),(2100,1180,1.3,.35),(300,1200,1.6,.4),(980,1300,1.2,.3),(1500,90,1.3,.35),
                           (120,760,1.2,.3),(2460,980,1.4,.35),(1700,1340,1.5,.3),(640,980,1.1,.25),(2300,820,1.1,.3)])
    return f"""<!doctype html><html><head><style>{CSS}
body{{width:2560px;height:1440px;position:relative;
 background:radial-gradient(ellipse 45% 60% at 36% 52%,#1d0c3a 0%,{BG} 70%)}}
.bg{{position:absolute;inset:0}}
.emb{{position:absolute;left:520px;top:438px;width:570px;height:570px}}
.txt{{position:absolute;left:1110px;top:515px}}
.word{{font-weight:800;font-size:160px;letter-spacing:-6px;line-height:1;color:#fff}}
.word span{{background:{GRAD};-webkit-background-clip:text;color:transparent}}
.tag{{display:flex;align-items:center;gap:22px;margin-top:22px;font-family:Inter;font-weight:600;font-size:30px;
 letter-spacing:9px;color:#C9C2E8;text-transform:uppercase;white-space:nowrap}}
.tag i{{display:block;width:70px;height:2px;background:linear-gradient(90deg,transparent,#7B5CFF)}}
.tag i:last-child{{background:linear-gradient(90deg,#7B5CFF,transparent)}}
.topics{{font-family:Inter;font-weight:500;font-size:32px;color:#A79FC9;margin-top:26px;white-space:nowrap}}
.row{{display:flex;gap:18px;margin-top:26px;white-space:nowrap;font-family:Inter}}
.chip{{font-weight:700;font-size:28px;padding:12px 26px;border-radius:999px;color:#fff;background:{GRAD}}}
.ghost{{font-weight:600;font-size:28px;padding:12px 26px;border-radius:999px;border:2px solid #3B2A66;color:#EDE9FF;background:#0C0620}}
</style></head><body>
<svg class="bg" viewBox="0 0 2560 1440">{stars}</svg>
<div class="emb"></div>
<div class="txt">
  <div class="word">Stack<span>Nova</span></div>
  <div class="tag"><i></i>Light up your whole stack<i></i></div>
  <div class="topics">Distributed systems · Databases · Java · Go · Node.js</div>
  <div class="row"><div class="chip">New deep dives · Tue &amp; Sat</div></div>
</div></body></html>"""


def logo_full():
    """Square lockup like the reference: emblem above wordmark (for posts, watermark, intros)."""
    return f"""<!doctype html><html><head><style>{CSS}
body{{width:1600px;height:1600px;position:relative;background:radial-gradient(circle at 50% 38%,#1d0c3a 0%,{BG} 65%)}}
.emb{{position:absolute;left:330px;top:40px;width:940px;height:940px}}
.word{{position:absolute;top:1010px;width:100%;text-align:center;font-weight:800;font-size:220px;letter-spacing:-8px;color:#fff}}
.word span{{background:{GRAD};-webkit-background-clip:text;color:transparent}}
.tag{{position:absolute;top:1290px;width:100%;display:flex;justify-content:center;align-items:center;gap:26px;
 font-family:Inter;font-weight:600;font-size:38px;letter-spacing:12px;color:#C9C2E8;text-transform:uppercase}}
.tag i{{display:block;width:120px;height:2px;background:linear-gradient(90deg,transparent,#7B5CFF)}}
.tag i:last-child{{background:linear-gradient(90deg,#7B5CFF,transparent)}}
</style></head><body><div class="emb"></div>
<div class="word">Stack<span>Nova</span></div>
<div class="tag"><i></i>Light up your whole stack<i></i></div></body></html>"""


async def shot(page, html, w, h, name):
    await page.set_viewport_size({"width": w, "height": h})
    await page.set_content(html, wait_until="networkidle")
    await page.screenshot(path=str(OUT / name), clip={"x": 0, "y": 0, "width": w, "height": h})


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
        page = await b.new_page()
        await shot(page, avatar(800), 800, 800, "youtube-profile-800.png")
        await shot(page, avatar(1080), 1080, 1080, "instagram-profile-1080.png")
        await shot(page, banner(), 2560, 1440, "youtube-banner-2560x1440.png")
        await shot(page, logo_full(), 1600, 1600, "stacknova-logo-full-1600.png")
        await b.close()


asyncio.run(main())
