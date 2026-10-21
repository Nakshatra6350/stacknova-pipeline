"""Draws the SN logo files the owner paints onto the engineer's hoodie in VRoid Studio.

    .venv\\Scripts\\python.exe brand-assets/character/make_logos.py

Writes transparent PNGs next to this script: the SN mark with its arrow (as on the reference
sheet) in cyan and in white, and a thin cyan stripe for sleeves and seams.
"""

import base64
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
FONT = "data:font/ttf;base64," + base64.b64encode((HERE.parents[1] / "assets" / "fonts" / "InterDisplay-ExtraBold.ttf").read_bytes()).decode()

PAGE = """
<html><head><style>
@font-face {{ font-family: D; font-weight: 800; src: url("{font}"); }}
html, body {{ margin: 0; background: transparent; }}
.box {{ position: relative; width: {w}px; height: {h}px; }}
.sn {{ position: absolute; left: 70px; top: 230px; font: 800 470px/1 D; letter-spacing: -24px;
       color: {c}; transform: skewX(-9deg); }}
svg {{ position: absolute; left: 0; top: 0; }}
</style></head><body><div class="box">{body}</div></body></html>
"""

ARROW = """<svg width="1024" height="1024"><path d="M770 380 L940 210 M815 210 L940 210 L940 335"
  stroke="{c}" stroke-width="58" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>"""
STRIPE = """<svg width="1024" height="64"><rect x="0" y="22" width="1024" height="20" rx="10" fill="#2fd3f5"/></svg>"""


def main() -> None:
    files = {
        "SN-logo-cyan.png": (1024, 1024, "#2fd3f5", True),
        "SN-logo-white.png": (1024, 1024, "#f2f6fb", True),
        "cyan-stripe.png": (1024, 64, "#2fd3f5", False),
    }
    with sync_playwright() as play:
        browser = play.chromium.launch(channel="chrome", headless=True)
        for name, (w, h, c, mark) in files.items():
            body = f'<div class="sn">SN</div>{ARROW.format(c=c)}' if mark else STRIPE
            page = browser.new_page(viewport={"width": w, "height": h})
            page.set_content(PAGE.format(font=FONT, w=w, h=h, c=c, body=body))
            page.evaluate("document.fonts.load('800 100px D').then(() => document.fonts.ready)")
            page.wait_for_timeout(400)
            page.screenshot(path=str(HERE / name), omit_background=True)
            page.close()
        browser.close()
    print("wrote", ", ".join(files))


if __name__ == "__main__":
    main()
