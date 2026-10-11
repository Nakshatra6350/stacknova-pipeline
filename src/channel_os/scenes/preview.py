"""Render a target's clips and join them with its narration into one preview video (M2).

Previews are for the owner to judge the animation against the voice. Captions, the hook card
and the watermark belong to assembly (M3).
"""

import multiprocessing
import os
import shutil
import tempfile
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path

from channel_os.assemble.ffmpeg import run_ffmpeg
from channel_os.scenes.cards import build_cards
from channel_os.scenes.code import build_code
from channel_os.scenes.fanin import build_fanin
from channel_os.scenes.flow import build_flow
from channel_os.scenes.formats import Format
from channel_os.scenes.kit import Canvas
from channel_os.scenes.plan import Clip
from channel_os.scenes.render import RenderError, Update, count_frames, render_scene
from channel_os.scenes.sequence import build_sequence
from channel_os.scenes.spec import SceneSpec
from channel_os.scenes.theme import Theme, Themes

# layout name -> the function that draws it. spec.STAGES lists the same names for validation.
BUILDERS: Mapping[str, Callable[[Canvas, SceneSpec], Update]] = {
    "flow": build_flow,
    "sequence": build_sequence,
    "cards": build_cards,
    "fanin": build_fanin,
    "code": build_code,
}


Job = tuple[SceneSpec, Format, Theme, Themes, int, Path, float, Path]


def _copy_labels(source: Path, target: Path) -> None:
    """Copy rasterised labels that `target` lacks, so that no reader ever sees half a file."""
    if not source.is_dir():
        return
    target.mkdir(parents=True, exist_ok=True)
    for label in source.glob("*.svg"):
        final = target / label.name
        if final.exists():
            continue
        partial = final.with_name(f"{label.name}.{os.getpid()}.part")
        try:
            shutil.copyfile(label, partial)
            os.replace(partial, final)
        except OSError:
            # The cache only saves time. A label another process holds is drawn again later.
            partial.unlink(missing_ok=True)


def _render_clip(job: Job) -> Path:
    """Render one clip. Runs in a worker process; everything it needs comes in `job`.

    Manim rewrites a cached label file every time it is used, so two processes must not share
    its text folder. Each worker takes a private copy of the labels and hands back the new ones.
    """
    spec, fmt, theme, fonts, frames, part, quality, cache_dir = job
    builder = BUILDERS[spec.layout]
    with tempfile.TemporaryDirectory() as private:
        _copy_labels(cache_dir / "texts", Path(private) / "texts")
        render_scene(lambda canvas: builder(canvas, spec), fmt, theme, fonts, frames, part,
                     quality, Path(private))
        _copy_labels(Path(private) / "texts", cache_dir / "texts")
    return part


def render_preview(clips: Sequence[Clip], fmt: Format, theme: Theme, fonts: Themes,
                   narration: Path, out_path: Path, quality: float = 1.0,
                   cache_dir: Path = Path(".cache") / "manim", jobs: int = 1) -> Path:
    """Render every clip, join them in order and lay the narration under them.

    Each clip is drawn in a fresh process. Rasterising a label leaks memory inside Pango on
    Windows (tens of megabytes each), and a long video has hundreds of labels: one process for
    everything grew until the page file filled the disk. A process per clip gives the memory
    back after every scene, and lets `jobs` clips be drawn at the same time.
    """
    with tempfile.TemporaryDirectory() as work:
        parts = [Path(work) / f"{index:03d}.mp4" for index in range(len(clips))]
        work_list: list[Job] = [
            (clip.spec, fmt, theme, fonts, clip.frames, part, quality, cache_dir)
            for clip, part in zip(clips, parts, strict=True)
        ]
        workers = max(1, min(jobs, len(work_list)))
        with multiprocessing.get_context("spawn").Pool(workers, maxtasksperchild=1) as pool:
            pool.map(_render_clip, work_list, chunksize=1)
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
