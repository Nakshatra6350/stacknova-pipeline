"""Stills of an episode's own scenes, for its thumbnails and carousel cover (M3).

A thumbnail shows "one diagram fragment" (docs/REACH_PLAYBOOK.md); the episode already has the
best ones, drawn by the page its video was made on. A still is a scene near the end of its clip,
when everything it builds is on screen, without the top bar or captions, cropped to what the
scene draws: the film leaves wide margins that would read as empty space in a thumbnail.
"""

import json
import re
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

from channel_os.scenes.browser import open_clip
from channel_os.scenes.formats import FPS, LANDSCAPE
from channel_os.scenes.plan import Clip, VideoPlan
from channel_os.scenes.preview import clip_data
from channel_os.scenes.theme import Theme

DRAWN_STAGES = ("console", "cards", "fanin", "sequence", "code")
LATE = 0.9  # how far through its clip a still is taken
EXIT_SECONDS = 0.5  # the last moments of a clip, when it may be leaving the screen
MARGIN = 48  # pixels kept around what the scene draws
MAX_ZOOM = 2.5  # a crop is never smaller than 40% of the frame's width
WIDE = 16 / 9  # the widest a crop may be, as width over height; a carousel allows 3
SHARPNESS = 1.5  # pixels per CSS pixel in a still, so a crop stays sharp when enlarged
_SMALL_WORDS = {"a", "an", "and", "as", "at", "be", "by", "for", "in", "is", "it", "of", "on",
                "or", "the", "to", "too", "why", "you", "your"}
# The box around everything visible in the scene layer, in page pixels; the scene's small
# header label in the corner does not count.
_CONTENT_BOX = """() => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const el of document.getElementById('scene').querySelectorAll('*')) {
    if (el.offsetParent === null || el.children.length || el.closest('.shead')) continue;
    const r = el.getBoundingClientRect(), st = getComputedStyle(el);
    if (r.width < 2 || r.height < 2 || st.visibility === 'hidden') continue;
    let shown = 1;
    for (let p = el; p && p.id !== 'scene'; p = p.parentElement)
      shown *= +getComputedStyle(p).opacity;
    if (shown < 0.5) continue;
    x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top);
    x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom);
  }
  return x1 > x0 ? [x0, y0, x1, y1] : null;
}"""


def _scenes(plan: VideoPlan) -> list[Clip]:
    return [clip for clip in plan.clips if clip.spec.layout in DRAWN_STAGES]


def picks(plan: VideoPlan, episode: Mapping[str, Any], count: int = 3) -> list[Clip]:
    """Up to `count` different scenes worth a still: the hook's last scene, the first code
    walkthrough, the production story; then scenes spread through the video."""
    scenes = _scenes(plan)
    if not scenes:
        return []
    hook = scenes[0].unit
    titles = {segment["id"]: str(segment.get("title", "")).lower()
              for segment in episode["segments"]}
    wanted: list[Clip | None] = [
        [clip for clip in scenes if clip.unit == hook][-1],
        next((clip for clip in scenes if clip.spec.layout == "code"), None),
        next((clip for clip in scenes if "production" in titles.get(clip.unit, "")), None),
    ]
    chosen: list[Clip] = []
    for clip in wanted:
        if clip is not None and clip not in chosen:
            chosen.append(clip)
    step = max(1, len(scenes) // (count + 1))
    for clip in scenes[step::step]:
        if len(chosen) >= count:
            break
        if clip not in chosen:
            chosen.append(clip)
    return chosen[:count]


def _words(text: str) -> set[str]:
    return {word for word in re.findall(r"[a-z0-9]+", text.lower()) if word not in _SMALL_WORDS}


def for_texts(texts: Sequence[str], plan: VideoPlan, episode: Mapping[str, Any]) -> list[Clip]:
    """A different scene for each thumbnail text: the one that shows or says its words most.
    What is on screen counts double; a scene that shows none of them falls back to picks()."""
    scenes = _scenes(plan)
    narration = {segment["id"]: f"{segment.get('title', '')} {segment.get('narration', '')}"
                 for segment in episode["segments"]}
    # A recap repeats every keyword of the episode; the scene that explains it is better.
    recaps = {segment["id"] for segment in episode["segments"]
              if str(segment.get("title", "")).lower().startswith("recap")}
    fallback = picks(plan, episode, len(texts))
    chosen: list[Clip] = []
    for index, text in enumerate(texts):
        wanted = _words(text)

        def score(clip: Clip, wanted: set[str] = wanted) -> float:
            steps = [{"target": step.target, **dict(step.params)} for step in clip.spec.steps]
            shown = _words(json.dumps([clip.spec.decl, steps]))
            said = _words(narration.get(clip.unit, ""))
            found = sum(2 * (word in shown) + (word in said) for word in wanted)
            return found / 4 if clip.unit in recaps else float(found)

        free = [clip for clip in scenes if clip not in chosen]
        best = max(free, key=score, default=None)
        if best is None or score(best) == 0:
            best = next((clip for clip in fallback if clip not in chosen), best)
        if best is not None:
            chosen.append(best)
        elif index < len(fallback):
            chosen.append(fallback[index])
    return chosen


def _crop(box: Sequence[float], widest: float = WIDE) -> dict[str, float]:
    """A region around `box`, inside the frame, at most MAX_ZOOM times enlarged, whose width is
    between 16:9 and `widest` times its height (a row of cards makes a wide strip)."""
    width, height = LANDSCAPE.width, LANDSCAPE.height
    x0, y0, x1, y1 = box[0] - MARGIN, box[1] - MARGIN, box[2] + MARGIN, box[3] + MARGIN
    w = min(max(x1 - x0, width / MAX_ZOOM), width)
    h = min(max(y1 - y0, w / widest), w * height / width)
    w = max(w, h * width / height)  # never taller than 16:9
    if w > width:
        w, h = width, width * height / width
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    left = min(max(0.0, cx - w / 2), width - w)
    top = min(max(0.0, cy - h / 2), height - h)
    return {"x": left, "y": top, "width": w, "height": h}


def still(clip: Clip, theme: Theme, path: Path, widest: float = WIDE) -> Path:
    """A picture of `clip` near its end, cropped to what it draws, with no chrome: 16:9, or up
    to `widest` times as wide as tall when the scene is a wide strip."""
    data = clip_data(clip, LANDSCAPE, theme)
    data["chrome"] = None  # the scene alone: no top bar, captions or progress bar
    seconds = clip.frames / FPS
    at = max(0.0, min(seconds * LATE, seconds - EXIT_SECONDS))
    path.parent.mkdir(parents=True, exist_ok=True)
    with open_clip(data, LANDSCAPE, SHARPNESS) as page:
        page.evaluate("t => window.render(t)", at)
        box = page.evaluate(_CONTENT_BOX)
        region = _crop(box, widest) if box else None
        if region is None:
            page.screenshot(path=str(path))
        else:
            page.screenshot(path=str(path), clip=region)
    return path


def stills(clips: Sequence[Clip], theme: Theme, folder: Path) -> list[Path]:
    return [still(clip, theme, folder / f"still-{index + 1}.png")
            for index, clip in enumerate(clips)]
