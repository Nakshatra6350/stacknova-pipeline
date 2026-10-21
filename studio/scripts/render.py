"""Draw the studio's Short frame by frame (after `npm run build`), or a few stills to look at.

    python studio/scripts/render.py stills TIMELINE.json OUT_DIR T1 T2 ...
    python studio/scripts/render.py part TIMELINE.json FIRST LAST OUT.mp4
    python studio/scripts/render.py join AUDIO.wav OUT.mp4 PART.mp4 ...

`part` draws frames FIRST..LAST-1 without sound; `join` puts the parts in order and adds the sound.

studio/dist is served from memory under http://studio.test/ and opened with ?mode=render.
On CI (no GPU) Chrome draws WebGL with SwiftShader. Needs Playwright (the `scenes` group).
"""

import json
import mimetypes
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

DIST = Path(__file__).resolve().parents[1] / "dist"
BASE = "http://studio.test"
FPS = 30
W, H = 1080, 1920
SOFTWARE_GL = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
ENCODE = ["-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p",
          "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709",
          "-color_trc", "bt709", "-r", str(FPS), "-video_track_timescale", "15360"]


def launch(play):
    args = SOFTWARE_GL if os.environ.get("CI") else []
    for channel in ("chrome", "msedge", None):
        try:
            return play.chromium.launch(channel=channel, headless=True, args=args)
        except Exception:  # try the next browser
            continue
    raise RuntimeError("no browser")


def serve(route) -> None:
    path = route.request.url.removeprefix(BASE).split("?")[0].lstrip("/") or "index.html"
    file = DIST / path
    if not file.is_file():
        route.fulfill(status=404, body="not found")
        return
    kind = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
    if file.suffix in (".js", ".mjs"):
        kind = "text/javascript"
    route.fulfill(status=200, body=file.read_bytes(), headers={"content-type": kind})


def page_for(play, timeline):
    browser = launch(play)
    page = browser.new_page(viewport={"width": W, "height": H})
    errors: list[str] = []
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    page.route(f"{BASE}/**", serve)
    mode = "lab" if "cam" in timeline else "render"
    page.goto(f"{BASE}/index.html?mode={mode}")
    page.wait_for_function("typeof window.boot === 'function'", timeout=60000)
    page.evaluate("tl => window.boot(tl)", timeline)
    if errors:
        raise RuntimeError("page errors: " + " | ".join(errors[:5]))
    return browser, page, errors


def ffmpeg() -> str:
    path = shutil.which("ffmpeg")
    assert path, "ffmpeg not found"
    return path


def stills(timeline_path: Path, out: Path, times: list[float]) -> None:
    from playwright.sync_api import sync_playwright

    out.mkdir(parents=True, exist_ok=True)
    timeline = json.loads(timeline_path.read_text(encoding="utf-8-sig"))
    with sync_playwright() as play:
        browser, page, errors = page_for(play, timeline)
        for t in times:
            page.evaluate("t => window.render(t)", t)
            page.screenshot(path=str(out / f"t{t:06.2f}.jpg"), type="jpeg", quality=88)
        browser.close()
    if errors:
        print("page errors:", errors[:5])
    print("wrote", len(times), "stills to", out)


def part(timeline_path: Path, first: int, last: int, out: Path) -> None:
    from playwright.sync_api import sync_playwright

    timeline = json.loads(timeline_path.read_text(encoding="utf-8-sig"))
    last = min(last, round(timeline["duration"] * FPS))
    out.parent.mkdir(parents=True, exist_ok=True)
    started = time.time()
    with sync_playwright() as play:
        browser, page, errors = page_for(play, timeline)
        encoder = subprocess.Popen(
            [ffmpeg(), "-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe",
             "-c:v", "mjpeg", "-framerate", str(FPS), "-i", "-",
             "-vf", "scale=in_range=full:out_range=limited,format=yuv420p", *ENCODE, str(out)],
            stdin=subprocess.PIPE)
        assert encoder.stdin is not None
        for index in range(first, last):
            page.evaluate("t => window.render(t)", index / FPS)
            encoder.stdin.write(page.screenshot(type="jpeg", quality=93))
            if (index - first) % 60 == 0:
                done, took = index - first + 1, time.time() - started
                print(f"frame {index} ({done}/{last - first})  {took:.0f} s", flush=True)
        encoder.stdin.close()
        encoder.wait()
        browser.close()
    if errors:
        print("page errors:", errors[:5])
    if encoder.returncode:
        raise RuntimeError("ffmpeg failed")
    print("wrote", out, f"frames {first}-{last - 1} in {time.time() - started:.0f} s")


def join(audio: Path, out: Path, parts: list[Path]) -> None:
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as listing:
        for p in parts:
            listing.write(f"file '{p.resolve().as_posix()}'\n")
    subprocess.run([ffmpeg(), "-hide_banner", "-loglevel", "error", "-y",
                    "-f", "concat", "-safe", "0", "-i", listing.name, "-i", str(audio),
                    "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                    "-shortest", "-movflags", "+faststart", str(out)], check=True)
    print("wrote", out)


if __name__ == "__main__":
    mode = sys.argv[1]
    if mode == "stills":
        stills(Path(sys.argv[2]), Path(sys.argv[3]), [float(x) for x in sys.argv[4:]])
    elif mode == "part":
        part(Path(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), Path(sys.argv[5]))
    elif mode == "join":
        join(Path(sys.argv[2]), Path(sys.argv[3]), [Path(p) for p in sys.argv[4:]])
    else:
        raise SystemExit(f"unknown mode {mode}")
