"""Look v3 draft: draw the 3D scene page frame by frame, or a few stills to look at.

    python spikes/look-v3/render_draft.py stills DATA.json OUT_DIR T1 T2 ...
    python spikes/look-v3/render_draft.py part TIMELINE.json FIRST LAST OUT.mp4   (frames FIRST..LAST-1, no sound)
    python spikes/look-v3/render_draft.py join AUDIO.wav OUT.mp4 PART.mp4 ...     (parts in order, then the sound)

The page is served from memory under http://look-v3.test/ (ES modules do not load from file://):
/ is spikes/look-v3/scene, /fonts is assets/fonts, /brand is brand-assets/source.
On CI (no GPU) Chrome draws WebGL with SwiftShader. Throwaway spike, not part of the pipeline.
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

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
ROOTS = {"/fonts/": REPO / "assets" / "fonts", "/brand/": REPO / "brand-assets" / "source"}
BASE = "http://look-v3.test"
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
        except Exception:  # noqa: BLE001 - try the next browser
            continue
    raise RuntimeError("no browser")


def serve(route) -> None:
    path = route.request.url.removeprefix(BASE).split("?")[0]
    file = next((root / path.removeprefix(prefix) for prefix, root in ROOTS.items()
                 if path.startswith(prefix)), HERE / "scene" / path.lstrip("/"))
    if path == "/":
        file = HERE / "scene" / "index.html"
    if not file.is_file():
        route.fulfill(status=404, body="not found")
        return
    kind = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
    if file.suffix == ".js":
        kind = "text/javascript"
    route.fulfill(status=200, body=file.read_bytes(), headers={"content-type": kind})


def page_for(play, data):
    browser = launch(play)
    page = browser.new_page(viewport={"width": W, "height": H})
    errors: list[str] = []
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    page.route(f"{BASE}/**", serve)
    page.goto(f"{BASE}/")
    page.wait_for_function("typeof window.boot === 'function'", timeout=60000)
    page.evaluate("d => window.boot(d)", data)
    if errors:
        raise RuntimeError("page errors: " + " | ".join(errors[:5]))
    return browser, page, errors


def ffmpeg() -> str:
    path = shutil.which("ffmpeg")
    assert path, "ffmpeg not found"
    return path


def stills(data_path: Path, out: Path, times: list[float]) -> None:
    out.mkdir(parents=True, exist_ok=True)
    from playwright.sync_api import sync_playwright

    data = json.loads(data_path.read_text(encoding="utf-8-sig"))
    with sync_playwright() as play:
        browser, page, errors = page_for(play, data)
        for t in times:
            page.evaluate("t => window.render(t)", t)
            page.screenshot(path=str(out / f"t{t:06.2f}.jpg"), type="jpeg", quality=88)
        browser.close()
        if errors:
            print("page errors:", errors[:5])
    print("wrote", len(times), "stills to", out)


def part(data_path: Path, first: int, last: int, out: Path) -> None:
    data = json.loads(data_path.read_text(encoding="utf-8-sig"))
    from playwright.sync_api import sync_playwright

    last = min(last, int(round(data["duration"] * FPS)))
    out.parent.mkdir(parents=True, exist_ok=True)
    started = time.time()
    with sync_playwright() as play:
        browser, page, errors = page_for(play, data)
        encoder = subprocess.Popen(
            [ffmpeg(), "-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-c:v", "mjpeg",
             "-framerate", str(FPS), "-i", "-", "-vf", "scale=in_range=full:out_range=limited,format=yuv420p",
             *ENCODE, str(out)], stdin=subprocess.PIPE)
        assert encoder.stdin is not None
        for index in range(first, last):
            page.evaluate("t => window.render(t)", index / FPS)
            encoder.stdin.write(page.screenshot(type="jpeg", quality=93))
            if (index - first) % 60 == 0:
                print(f"frame {index} ({index - first + 1}/{last - first})  {time.time() - started:.0f} s", flush=True)
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
    subprocess.run([ffmpeg(), "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0",
                    "-i", listing.name, "-i", str(audio), "-map", "0:v", "-map", "1:a", "-c:v", "copy",
                    "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(out)], check=True)
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
