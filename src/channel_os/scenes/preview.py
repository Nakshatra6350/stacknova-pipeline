"""Render a target's clips and join them with its audio into one preview video (M2, look v2).

Previews are for the owner to judge the animation against the voice. Word-by-word captions on
Shorts, the hook card and final encoding belong to assembly (M3).
"""

import multiprocessing
import tempfile
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from channel_os.assemble.ffmpeg import run_ffmpeg
from channel_os.scenes import code_model
from channel_os.scenes.browser import RenderError, count_frames, render_clip
from channel_os.scenes.formats import FPS, Format
from channel_os.scenes.plan import Clip, VideoPlan
from channel_os.scenes.theme import EMBLEM, FACES, FONT_DIR, Theme

# Layouts the page can draw: every stage the validator accepts (spec.STAGES), and the brand
# scenes the planner adds.
DRAWN = ("console", "cards", "fanin", "sequence", "code", "brand")
BRAND_FADE = 0.35  # seconds over which an intro or outro sound fades out at its scene's end

Job = tuple[dict[str, Any], Format, int, Path, float]


def clip_data(clip: Clip, fmt: Format, theme: Theme) -> dict[str, Any]:
    """One clip as the plain data the page is given."""
    decl = dict(clip.spec.decl)
    if clip.spec.layout == "code":
        # The page colours a listing with the validator's own tokeniser, not a second one.
        language = decl.get("language", "text")
        decl["tokens"] = [code_model.tokens(str(line), language) for line in decl["lines"]]
    return {
        "stage": clip.spec.layout,
        "format": fmt.name,
        "duration": clip.frames / FPS,
        "theme": theme.css(),
        "emblem": EMBLEM.as_uri(),
        "fonts": [{"family": family, "weight": weight, "url": (FONT_DIR / name).as_uri()}
                  for family, weight, name in FACES],
        "decl": decl,
        "steps": [{"time": step.time, "action": step.action, "target": step.target,
                   "params": dict(step.params)} for step in clip.spec.steps],
        "chrome": dict(clip.chrome),
    }


def _render(job: Job) -> Path:
    """Render one clip. Runs in a worker process with its own browser."""
    data, fmt, frames, part, quality = job
    return render_clip(data, fmt, frames, part, quality)


def render_preview(plan: VideoPlan, fmt: Format, theme: Theme, narration: Path, out_path: Path,
                   sounds: Mapping[str, Path], quality: float = 1.0, jobs: int = 1) -> Path:
    """Render every clip, join them in order and lay the audio under them.

    `sounds` gives the audio file for each brand scene ("intro", "outro"); a scene without one
    plays in silence. Each clip is drawn in its own process, `jobs` of them at a time.
    """
    with tempfile.TemporaryDirectory() as work:
        parts = [Path(work) / f"{index:03d}.mp4" for index in range(len(plan.clips))]
        work_list: list[Job] = [
            (clip_data(clip, fmt, theme), fmt, clip.frames, part, quality)
            for clip, part in zip(plan.clips, parts, strict=True)
        ]
        workers = max(1, min(jobs, len(work_list)))
        with multiprocessing.get_context("spawn").Pool(workers, maxtasksperchild=1) as pool:
            pool.map(_render, work_list, chunksize=1)
        listing = Path(work) / "clips.txt"
        listing.write_text("".join(f"file '{part.as_posix()}'\n" for part in parts),
                           encoding="utf-8")

        # The audio is cut and joined to match the picture: narration up to the end of the
        # hook, the intro's sound, the rest of the narration, the outro's music.
        inputs = ["-f", "concat", "-safe", "0", "-i", str(listing)]
        sources = {"narration": narration, **sounds}
        index_of: dict[str, int] = {}
        for part_audio in plan.audio:
            if part_audio.source in sources and part_audio.source not in index_of:
                index_of[part_audio.source] = len(index_of) + 1
                inputs += ["-i", str(sources[part_audio.source])]
        chain: list[str] = []
        for number, piece in enumerate(plan.audio):
            length = piece.end - piece.start
            shape = "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo"
            if piece.source in index_of:
                # A brand sound longer than its scene is faded out, never cut off mid-note.
                fade = "" if piece.source == "narration" else (
                    f"afade=t=out:st={max(0.0, length - BRAND_FADE):.6f}:d={BRAND_FADE},")
                chain.append(f"[{index_of[piece.source]}:a]atrim=start={piece.start:.6f}:"
                             f"end={piece.end:.6f},asetpts=PTS-STARTPTS,{shape},{fade}"
                             f"apad=whole_dur={length:.6f}[a{number}]")
            else:
                chain.append(f"anullsrc=r=48000:cl=stereo,atrim=duration={length:.6f}[a{number}]")
        joined = "".join(f"[a{number}]" for number in range(len(plan.audio)))
        chain.append(f"{joined}concat=n={len(plan.audio)}:v=0:a=1[aout]")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        run_ffmpeg([
            "-y", *inputs, "-filter_complex", ";".join(chain), "-map", "0:v:0", "-map", "[aout]",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(out_path),
        ])
    actual = count_frames(out_path)
    if actual != plan.frames:
        raise RenderError(f"{out_path.name} has {actual} frames, expected {plan.frames}")
    return out_path
