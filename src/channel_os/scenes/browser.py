"""Draw a clip in a headless browser and capture it frame by frame (look v2).

A clip is plain data: the stage, the declaration, the timed steps, the chrome. The page in
`scenes/web/` turns it into a picture for any time t; this module asks for each frame in turn,
pipes the screenshots to ffmpeg and checks the frame count afterwards.
"""

import re
import shutil
import subprocess
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from playwright.sync_api import Browser, Page, Playwright, sync_playwright
from playwright.sync_api import Error as BrowserError

from channel_os.scenes.formats import FPS, Format

WEB = Path(__file__).resolve().parent / "web"
# An installed browser first (nothing to download), then Playwright's own Chromium.
CHANNELS: tuple[str | None, ...] = ("chrome", "msedge", None)
COLOUR = ("scale=in_range=full:in_color_matrix=bt601:out_range=limited:out_color_matrix=bt709,"
          "format=yuv420p")


class RenderError(RuntimeError):
    """A clip that did not come out as asked."""


class SceneError(RuntimeError):
    """A scene that cannot be drawn as described. The message says what and where."""


def _launch(play: Playwright) -> Browser:
    reasons: list[str] = []
    for channel in CHANNELS:
        try:
            return play.chromium.launch(channel=channel, headless=True)
        except BrowserError as exc:
            reasons.append(f"{channel or 'chromium'}: {str(exc).splitlines()[0]}")
    raise RenderError(
        "no browser to draw scenes with; install Chrome or Edge, or run "
        "`uv run --group scenes playwright install chromium` (" + "; ".join(reasons) + ")"
    )


@contextmanager
def open_clip(clip: Mapping[str, Any], fmt: Format, quality: float = 1.0) -> Iterator[Page]:
    """The page with `clip` built on it, ready for `window.render(t)`.

    `quality` scales the pixels captured (0.5 gives a quick half-size look); the layout is the
    same at every quality. Raises SceneError when the page cannot build the scene or when a
    part of it leaves the format's content area.
    """
    with sync_playwright() as play:
        browser = _launch(play)
        try:
            page = browser.new_page(viewport={"width": fmt.width, "height": fmt.height},
                                    device_scale_factor=quality)
            page.goto((WEB / "index.html").as_uri())
            try:
                page.evaluate("clip => window.boot(clip)", dict(clip))
            except BrowserError as exc:
                raise SceneError(f"cannot draw the scene: {str(exc).splitlines()[0]}") from exc
            area = fmt.content
            outside = page.evaluate("area => SN.unsafe(area)", [area.x0, area.y0, area.x1, area.y1])
            if outside:
                raise SceneError(
                    f"part of the scene leaves the {fmt.name} content area "
                    f"(x {area.x0:.0f}-{area.x1:.0f}, y {area.y0:.0f}-{area.y1:.0f}): "
                    + "; ".join(outside)
                )
            yield page
        finally:
            browser.close()


def count_frames(path: Path) -> int:
    probe = shutil.which("ffprobe")
    if probe is None:
        raise RenderError("ffprobe was not found on PATH")
    done = subprocess.run(
        [probe, "-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries",
         "stream=nb_read_frames", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=False,
    )
    # ffprobe may print "980" or "980," (an empty field for side data), so take the number.
    found = re.search(r"\d+", done.stdout)
    if found is None:
        raise RenderError(f"could not count the frames of {path.name}: {done.stderr.strip()}")
    return int(found.group())


def render_clip(clip: Mapping[str, Any], fmt: Format, frames: int, out_path: Path,
                quality: float = 1.0) -> Path:
    """Render `frames` frames of a clip to `out_path` and verify the count."""
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        raise RenderError("ffmpeg was not found on PATH")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open_clip(clip, fmt, quality) as page:
        # Every clip is encoded the same way, so clips can be joined without re-encoding.
        # Screenshots are full-range JPEG; video players and YouTube expect limited-range
        # BT.709, so the frames are converted and the stream says what it is.
        encoder = subprocess.Popen(
            [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe",
             "-c:v", "mjpeg", "-framerate", str(FPS), "-i", "-", "-vf", COLOUR, "-c:v", "libx264",
             "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", "-color_range", "tv",
             "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
             "-r", str(FPS), "-video_track_timescale", "15360", str(out_path)],
            stdin=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        assert encoder.stdin is not None
        try:
            for index in range(frames):
                page.evaluate("t => window.render(t)", index / FPS)
                encoder.stdin.write(page.screenshot(type="jpeg", quality=95))
        finally:
            encoder.stdin.close()
            errors = encoder.stderr.read().decode(errors="replace") if encoder.stderr else ""
            encoder.wait()
    if encoder.returncode != 0:
        raise RenderError(f"ffmpeg could not encode {out_path.name}: {errors.strip()[-500:]}")
    actual = count_frames(out_path)
    if actual != frames:
        raise RenderError(f"{out_path.name} has {actual} frames, expected {frames}")
    return out_path


def probe(clip: Mapping[str, Any], fmt: Format, times: Mapping[str, float],
          script: str) -> dict[str, Any]:
    """Ask the page a question at several moments (for tests and checks).

    `script` is a JavaScript expression evaluated after `window.render(t)`; the result for each
    named time comes back under that name.
    """
    with open_clip(clip, fmt, 0.25) as page:
        answers: dict[str, Any] = {}
        for name, at in times.items():
            page.evaluate("t => window.render(t)", at)
            answers[name] = page.evaluate(script)
        return answers
