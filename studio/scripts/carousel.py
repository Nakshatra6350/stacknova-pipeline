"""An Instagram carousel in the new look: the channel's carousel template (headline and line above
a framed screen, the owner's pick of 15 October 2026) with stills from the 3D films.

    .venv\\Scripts\\python.exe studio/scripts/carousel.py 007-c1

Reads studio/films/<id>/carousel.yaml: `number` (the episode, "007") and `slides`, each a headline,
a body and, except on the last "Follow ..." slide, a `still`: the timeline it comes from, the time
t, and `y`, where the middle of the 16:9 crop sits in the 3D view (0 top .. 1 bottom). t is seconds
or a moment of the film: a line ("e3", its end "e3>"), an event ("split"), with an offset
("e3+1.5"). Writes out/release/<id>/carousel-01.jpg ... (after `npm run build` in studio/).
"""

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import yaml

from channel_os.assemble.carousel import draw_carousel

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from render import ffmpeg, stills  # noqa: E402

VIEW_TOP, VIEW_H, W = 300, 1160, 1080  # the 3D view inside a Short's frame
CROP_H = round(W * 9 / 16)
MOMENT = re.compile(r"^(?P<base>\w+)(?P<end>>)?(?P<off>[+-]\d+(?:\.\d+)?)?$")


def when(timeline: Path, t: float | str) -> float:
    """The still's time in seconds: t itself, or the line or event it names plus its offset."""
    if isinstance(t, int | float):
        return float(t)
    m = MOMENT.match(t.replace(" ", ""))
    if not m:
        raise ValueError(f"cannot read the moment {t!r}")
    tl = json.loads(timeline.read_text(encoding="utf-8"))
    lines = {line["id"]: line for line in tl["lines"]}
    base, off = m["base"], float(m["off"] or 0)
    if base in lines:
        return lines[base]["end" if m["end"] else "start"] + off
    if base in tl["events"]:
        return float(tl["events"][base]) + off
    raise ValueError(f"{timeline.parent.name} has no line or event called {base!r}")


def main(carousel_id: str) -> None:
    spec = yaml.safe_load(
        (ROOT / "studio" / "films" / carousel_id / "carousel.yaml").read_text(encoding="utf-8")
    )
    out = ROOT / "out" / "release" / carousel_id
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as work:
        crops: list[Path] = []
        for n, slide in enumerate(s for s in spec["slides"] if s.get("still")):
            still = slide["still"]
            frames = Path(work) / f"f{n}"
            timeline = ROOT / still["timeline"]
            stills(timeline, frames, [when(timeline, still["t"])])
            frame = next(frames.iterdir())
            top = VIEW_TOP + round((VIEW_H - CROP_H) * float(still.get("y", 0.5)))
            crop = Path(work) / f"still-{n}.png"
            subprocess.run(
                [
                    ffmpeg(),
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-y",
                    "-i",
                    str(frame),
                    "-vf",
                    f"crop={W}:{CROP_H}:0:{top}",
                    str(crop),
                ],
                check=True,
            )
            crops.append(crop)
        episode = {
            "id": f"{spec['number']}-carousel",
            "carousel": {
                "slides": [{"headline": s["headline"], "body": s["body"]} for s in spec["slides"]]
            },
        }
        written = draw_carousel(episode, crops[0], out, crops[1:])
    print(json.dumps([p.name for p in written]))


if __name__ == "__main__":
    main(sys.argv[1])
