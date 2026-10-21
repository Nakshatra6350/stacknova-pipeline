"""An Instagram carousel in the new look: the channel's carousel template (headline and line above
a framed screen, the owner's pick of 15 October 2026) with stills from the 3D films.

    .venv\\Scripts\\python.exe studio/scripts/carousel.py 007-c1

Reads studio/films/<id>/carousel.yaml: `number` (the episode, "007") and `slides`, each a headline,
a body and, except on the last "Follow ..." slide, a `still`: the timeline it comes from, the time
t, and `y`, where the middle of the 16:9 crop sits in the 3D view (0 top .. 1 bottom). Writes
out/release/<id>/carousel-01.jpg ... (after `npm run build` in studio/).
"""

import json
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
            stills(ROOT / still["timeline"], frames, [float(still["t"])])
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
