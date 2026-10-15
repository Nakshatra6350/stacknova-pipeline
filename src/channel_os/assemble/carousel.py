"""Instagram carousel slides, drawn from an HTML template with Playwright (M3).

One 1080x1350 slide per `carousel.slides` entry (assemble/web/carousel.html): the first is the
cover, over a still of the hook's scene; a last slide that asks for a follow gets the emblem;
each slide between carries its headline and line above a still of the scene that matches its
words (config/brand.yaml `carousel.scenes_on_every_slide`, the owner's pick of 15 October 2026).
"""

from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

from channel_os.assemble.frames import aspect
from channel_os.assemble.thumbnails import JPEG_QUALITY, fonts
from channel_os.scenes.browser import open_page
from channel_os.scenes.preview import EMBLEM

WEB = Path(__file__).resolve().parent / "web"
WIDTH, HEIGHT = 1080, 1350


def kind(index: int, total: int, headline: str) -> str:
    if index == 0:
        return "cover"
    if index == total - 1 and headline.lower().startswith("follow"):
        return "follow"
    return "idea"


def idea_texts(episode: Mapping[str, Any]) -> list[str]:
    """The words of each idea slide, in order, to find the scene that matches each."""
    slides = (episode.get("carousel") or {}).get("slides") or []
    return [f"{slide['headline']} {slide['body']}" for index, slide in enumerate(slides)
            if kind(index, len(slides), str(slide["headline"])) == "idea"]


def draw_carousel(episode: Mapping[str, Any], cover_still: Path, folder: Path,
                  idea_stills: Sequence[Path] = ()) -> list[Path]:
    """carousel-01.jpg, carousel-02.jpg, ... in folder. `idea_stills` go on the idea slides in
    order; an idea slide without one carries its words alone."""
    slides = (episode.get("carousel") or {}).get("slides") or []
    number = str(episode["id"]).split("-", 1)[0]
    ideas = iter(idea_stills)
    written: list[Path] = []
    for index, slide in enumerate(slides):
        sort = kind(index, len(slides), str(slide["headline"]))
        frame = cover_still if sort == "cover" else next(ideas, None) if sort == "idea" else None
        data: dict[str, Any] = {
            "kind": sort, "index": index, "total": len(slides), "episode": f"EP {number}",
            "headline": slide["headline"], "body": slide["body"],
            "frame": frame.as_uri() if frame else None,
            # 16:9, or a wider strip; never taller, whatever the picture is.
            "aspect": min(max(aspect(frame) if frame else 0.0, 16 / 9), 3.0),
            "emblem": EMBLEM.as_uri(),
            "fonts": fonts()}
        out = folder / f"carousel-{index + 1:02}.jpg"
        with open_page(WEB / "carousel.html", WIDTH, HEIGHT) as page:
            verdict = page.evaluate("d => window.draw(d)", data)
            if verdict != "ok":
                raise ValueError(f"carousel slide {index + 1}: {verdict}")
            page.screenshot(path=str(out), type="jpeg", quality=JPEG_QUALITY)
        written.append(out)
    return written
