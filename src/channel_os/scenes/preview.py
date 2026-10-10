"""Render a target's clips and join them with its narration into one preview video (M2).

Previews are for the owner to judge the animation against the voice. Captions, the hook card
and the watermark belong to assembly (M3).
"""

import tempfile
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path

from channel_os.assemble.ffmpeg import run_ffmpeg
from channel_os.scenes.flow import build_flow
from channel_os.scenes.formats import Format
from channel_os.scenes.kit import Canvas
from channel_os.scenes.plan import Clip
from channel_os.scenes.render import RenderError, Update, count_frames, render_scene
from channel_os.scenes.spec import SceneSpec
from channel_os.scenes.theme import Theme, Themes

# layout name -> the function that draws it. spec.STAGES lists the same names for validation.
BUILDERS: Mapping[str, Callable[[Canvas, SceneSpec], Update]] = {"flow": build_flow}


def render_preview(clips: Sequence[Clip], fmt: Format, theme: Theme, fonts: Themes,
                   narration: Path, out_path: Path, quality: float = 1.0,
                   cache_dir: Path = Path(".cache") / "manim") -> Path:
    """Render every clip, join them in order and lay the narration under them."""
    with tempfile.TemporaryDirectory() as work:
        parts: list[Path] = []
        for index, clip in enumerate(clips):
            builder = BUILDERS[clip.spec.layout]
            part = Path(work) / f"{index:03d}.mp4"

            def build(canvas: Canvas, builder: Callable[[Canvas, SceneSpec], Update] = builder,
                      spec: SceneSpec = clip.spec) -> Update:
                return builder(canvas, spec)

            render_scene(build, fmt, theme, fonts, clip.frames, part, quality, cache_dir)
            parts.append(part)
        listing = Path(work) / "clips.txt"
        listing.write_text("".join(f"file '{part.as_posix()}'\n" for part in parts),
                           encoding="utf-8")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        run_ffmpeg([
            "-y", "-f", "concat", "-safe", "0", "-i", str(listing), "-i", str(narration),
            "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
            "-movflags", "+faststart", str(out_path),
        ])
    expected = sum(clip.frames for clip in clips)
    actual = count_frames(out_path)
    if actual != expected:
        raise RenderError(f"{out_path.name} has {actual} frames, expected {expected}")
    return out_path
