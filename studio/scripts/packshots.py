r"""Reel covers and thumbnail styles for the 22 Oct 2026 reach plan (studio/covers/packshots.html).

    .venv\Scripts\python.exe studio/scripts/packshots.py cover ID TIMELINE T TITLE SERIES [PART OF]
    .venv\Scripts\python.exe studio/scripts/packshots.py thumbs SPEC.yaml OUT_DIR

cover: a still of the film at T, its 3D view under the title, SERIES and (with PART OF) a bar
showing which part it is; writes out/release/v2/<ID>-cover.jpg, to pick as the Reel's cover.
thumbs: the three labelled thumbnail styles (A engineer + object, B object, C diagram) for one
video, from a spec with `words`, `receipt`, `stamp` and `flow`; writes OUT_DIR/A.jpg, B.jpg, C.jpg.
"""

import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

import yaml

from channel_os.assemble.thumbnails import fonts
from channel_os.scenes.browser import open_page
from channel_os.scenes.theme import EMBLEM

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from render import ffmpeg, stills  # noqa: E402

WEB = ROOT / "studio" / "covers" / "packshots.html"
ENGINEER = ROOT / "studio" / "public" / "local" / "engineer-2p5d.png"  # owner's art, git-ignored
VIEW_TOP, VIEW_H = 300, 1160  # the 3D view inside a Short's frame


def shoot(kind: str, size: tuple[int, int], data: dict[str, Any], out: Path) -> Path:
    out.parent.mkdir(parents=True, exist_ok=True)
    with open_page(WEB, *size) as page:
        page.evaluate(
            "d => window.draw(d)",
            {"kind": kind, "emblem": EMBLEM.as_uri(), "fonts": fonts(), **data},
        )
        page.screenshot(path=str(out), type="jpeg", quality=92)
    return out


def cover(
    film_id: str, timeline: Path, t: float, title: str, series: str, part: int, of: int
) -> Path:
    with tempfile.TemporaryDirectory() as work:
        stills(timeline, Path(work), [t])
        frame = next(Path(work).glob("t*.jpg"))
        view = Path(work) / "view.png"
        subprocess.run([ffmpeg(), "-hide_banner", "-loglevel", "error", "-y", "-i", str(frame),
                        "-vf", f"crop=1080:{VIEW_H}:0:{VIEW_TOP}", str(view)], check=True)
        out = ROOT / "out" / "release" / "v2" / f"{film_id}-cover.jpg"
        data = {"view": view.as_uri(), "title": title, "series": series, "part": part, "of": of}
        return shoot("cover", (1080, 1920), data, out)


def thumbs(spec_path: Path, out_dir: Path) -> list[Path]:
    spec = yaml.safe_load(spec_path.read_text(encoding="utf-8"))
    out = []
    for letter, kind in (("A", "thumbA"), ("B", "thumbB"), ("C", "thumbC")):
        words = spec["words"].get(letter, spec["words"]["A"])
        data = {**spec, "engineer": ENGINEER.as_uri(), "words": words}
        out.append(shoot(kind, (1280, 720), data, out_dir / f"{letter}.jpg"))
    return out


if __name__ == "__main__":
    if sys.argv[1] == "cover":
        a = sys.argv[2:]
        part, of = (int(a[5]), int(a[6])) if len(a) > 6 else (0, 0)
        print(cover(a[0], Path(a[1]), float(a[2]), a[3], a[4], part, of))
    elif sys.argv[1] == "thumbs":
        print(thumbs(Path(sys.argv[2]), Path(sys.argv[3])))
    else:
        raise SystemExit(f"unknown mode {sys.argv[1]}")
