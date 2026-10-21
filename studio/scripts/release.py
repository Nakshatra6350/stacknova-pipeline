r"""Render a vertical film for both platforms: the body once, then each ending, joined with sound.

    .venv\Scripts\python.exe studio/scripts/release.py ID TIMELINE.json MIX.wav

Writes out/release/<ID>-short.mp4 (YouTube: "Subscribe for ...") and out/release/<ID>-reel.mp4
(Instagram: "Follow for ..."). Only the end card differs, so the frames before it are drawn once.
"""

import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import render

ROOT = Path(__file__).resolve().parents[2]


def main(film_id: str, timeline: Path, mix: Path) -> None:
    tl = json.loads(timeline.read_text(encoding="utf-8"))
    end = round(tl["events"]["end"] * render.FPS)
    total = round(tl["duration"] * render.FPS)
    out = ROOT / "out" / "release"
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as work:
        body = Path(work) / "body.mp4"
        render.part(timeline, 0, end, body)
        for variant in ("short", "reel"):
            render.VARIANT = variant
            tail = Path(work) / f"tail-{variant}.mp4"
            render.part(timeline, end, total, tail)
            render.join(mix, out / f"{film_id}-{variant}.mp4", [body, tail])
        render.VARIANT = "reel"


if __name__ == "__main__":
    main(sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3]))
