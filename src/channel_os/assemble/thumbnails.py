"""Thumbnails for a long video, drawn from an HTML template with Playwright (M3).

Three of them, one per `packaging.thumbnail_texts` entry, each over a still of the scene that
shows its words (assemble/frames.py), for YouTube's Test & compare. The template has two
layouts (assemble/web/thumb.html); config/brand.yaml `thumbnail.layouts` gives one per
thumbnail in order (the owner's pick of 15 October 2026: verdict, monitor, verdict). With
`variants` every layout is also written as thumb-<letter>.<layout>.jpg to compare them.
"""

from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

from channel_os.scenes.theme import EMBLEM, FACES, FONT_DIR

WEB = Path(__file__).resolve().parent / "web"
LAYOUTS = ("verdict", "monitor")
WIDTH, HEIGHT = 1280, 720
JPEG_QUALITY = 92  # YouTube takes thumbnails up to 2 MB


def fonts() -> list[dict[str, Any]]:
    return [{"family": family, "weight": weight, "url": (FONT_DIR / name).as_uri()}
            for family, weight, name in FACES]


def layouts(brand: Mapping[str, Any], count: int) -> list[str]:
    """The layout of each of `count` thumbnails, from config/brand.yaml, repeated as needed."""
    wanted = [str(name) for name in (brand.get("thumbnail") or {}).get("layouts") or LAYOUTS[:1]]
    unknown = [name for name in wanted if name not in LAYOUTS]
    if unknown:
        raise ValueError(f"unknown thumbnail layout {unknown[0]!r}; known: {', '.join(LAYOUTS)}")
    return [wanted[index % len(wanted)] for index in range(count)]


def draw(text: str, still: Path, layout: str, out: Path) -> Path:
    from channel_os.scenes.browser import open_page  # the browser: scenes dependency group

    with open_page(WEB / "thumb.html", WIDTH, HEIGHT) as page:
        page.evaluate("d => window.draw(d)", {
            "layout": layout, "text": text, "frame": still.as_uri(), "emblem": EMBLEM.as_uri(),
            "fonts": fonts()})
        page.screenshot(path=str(out), type="jpeg", quality=JPEG_QUALITY)
    return out


def draw_thumbnails(episode: Mapping[str, Any], stills: Sequence[Path], brand: Mapping[str, Any],
                    folder: Path, variants: bool = False) -> list[Path]:
    """thumb-a.jpg, thumb-b.jpg, ... in folder, one per thumbnail text."""
    texts = list(episode["packaging"]["thumbnail_texts"])[:len(stills)]
    written: list[Path] = []
    for letter, text, still, layout in zip("abcdef", texts, stills, layouts(brand, len(texts)),
                                           strict=False):
        written.append(draw(text, still, layout, folder / f"thumb-{letter}.jpg"))
        if variants:
            written += [draw(text, still, other, folder / f"thumb-{letter}.{other}.jpg")
                        for other in LAYOUTS]
    return written
