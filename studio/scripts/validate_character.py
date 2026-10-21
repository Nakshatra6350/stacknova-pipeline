"""Renders the six character checks the owner asked for and puts them under the reference sheet.

    python studio/scripts/validate_character.py REFERENCE_IMAGE OUT.png

Uses whatever studio/public/local/characters.json (or public/characters.json) selects, so it
checks the real engineer model once it is in place. Needs `npm run build` first.
Views: 1 full body front, 2 three-quarter, 3 face close-up, 4 side, 5 beside Nova,
6 pointing at the HashMap.
"""

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import render

E = {"expression": "calm", "pos": [0, 0, 0], "yaw": 0}
AWAY = {"pos": [6, 1.4, 0]}
BUCKET7 = [-0.29, 0.6, -3.59]


def view(cam=None, look=None, fov=34, engineer=None, nova=None, cam_head=None):
    v = {"fov": fov, "engineer": {**E, **(engineer or {})}, "nova": nova or AWAY}
    if cam_head:
        v["camHead"] = cam_head
    else:
        v["cam"], v["look"] = cam, look
    return v


VIEWS = [
    view([0, 0.95, 3.7], [0, 0.9, 0], engineer={"look": [0, 1.5, 3.7]}),
    view([2.3, 1.15, 3.0], [0, 0.9, 0], engineer={"look": [2.3, 1.5, 3.0], "expression": "smile"}),
    view(cam_head=[0.05, 0.0, 0.7], fov=30, engineer={"look": [0.05, 1.5, 2.0]}),
    view([3.4, 1.0, 0], [0, 0.9, 0]),
    view([0.25, 1.1, 3.4], [-0.1, 0.95, 0], fov=36,
         engineer={"yaw": -0.3, "expression": "smile", "look": [-0.55, 1.45, 0.25]},
         nova={"pos": [-0.55, 1.45, 0.25], "yaw": 0.6, "expression": "happy", "look": [0, 1.5, 0]}),
    view([-1.6, 1.45, -0.2], [0.3, 1.15, 1.1], fov=40,
         engineer={"pos": [0.45, 0, 1.3], "yaw": 3.0, "expression": "focus", "look": BUCKET7,
                   "gesture": {"name": "point", "weight": 1, "time": 0.5, "target": BUCKET7}},
         nova={"pos": [-0.25, 1.48, 1.35], "yaw": 2.8, "expression": "normal"}),
]


def main(reference: Path, out: Path) -> None:
    from playwright.sync_api import sync_playwright

    work = Path(tempfile.mkdtemp())
    frames = []
    with sync_playwright() as play:
        for i, view in enumerate(VIEWS, 1):
            browser, page, _ = render.page_for(play, view)
            page.evaluate("t => window.render(t)", 0.5)
            path = work / f"view{i}.png"
            page.screenshot(path=str(path))
            frames.append(path)
            browser.close()
    ff = shutil.which("ffmpeg")
    assert ff
    args = [ff, "-hide_banner", "-loglevel", "error", "-threads", "1", "-y", "-i", str(reference)]
    for f in frames:
        args += ["-i", str(f)]
    tiles = ";".join(f"[{i + 1}:v]scale=360:640[v{i}]" for i in range(len(frames)))
    grid = "".join(f"[v{i}]" for i in range(len(frames)))
    layout = "|".join(f"{(i % 3) * 360}_{(i // 3) * 640}" for i in range(len(frames)))
    stack = f"{grid}xstack=inputs={len(frames)}:layout={layout}[g]"
    graph = f"[0:v]scale=1080:-2[ref];{tiles};{stack};[ref][g]vstack=inputs=2[o]"
    command = [*args, "-filter_complex", graph, "-map", "[o]", "-frames:v", "1", str(out)]
    subprocess.run(command, check=True)
    print("wrote", out)


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
