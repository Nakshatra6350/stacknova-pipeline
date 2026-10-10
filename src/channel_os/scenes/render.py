"""Render one scene to a frame-exact clip (M2).

A scene is a `build(canvas)` function that queues drawables on the canvas and returns
`update(t)`, which sets every animated property for time `t`. The whole clip is one wait.
"""

import shutil
import uuid
from collections.abc import Callable
from pathlib import Path
from typing import Any

import av
from manim import Scene, VMobject, tempconfig

from channel_os.scenes.flow_model import Format
from channel_os.scenes.kit import FPS, Canvas, register_fonts
from channel_os.scenes.theme import Theme, Themes

Update = Callable[[float], None]
Build = Callable[[Canvas], Update]


class RenderError(RuntimeError):
    """A clip that did not come out as asked."""


def frame_count(duration: float, fps: int = FPS) -> int:
    return max(1, round(duration * fps))


def count_frames(path: Path) -> int:
    with av.open(str(path)) as container:
        stream = container.streams.video[0]
        return int(stream.frames) or sum(1 for _ in container.decode(stream))


def read_frame(path: Path, index: int) -> Any:
    """One decoded frame as a greyscale array (for tests and checks)."""
    with av.open(str(path)) as container:
        for number, frame in enumerate(container.decode(container.streams.video[0])):
            if number == index:
                return frame.to_ndarray(format="gray")
    raise RenderError(f"{path} has no frame {index}")


def render_scene(build: Build, fmt: Format, theme: Theme, fonts: Themes, frames: int,
                 out_path: Path, quality: float = 1.0,
                 cache_dir: Path = Path(".cache") / "manim") -> Path:
    """Render `frames` frames of a scene to `out_path` and verify the count.

    `quality` scales the pixel size (0.5 gives a quick half-size check). `cache_dir` holds
    Manim's rasterised text; keeping it stable between runs matters, because rasterising a
    new label is slow.
    """
    register_fonts()

    class _Clip(Scene):  # type: ignore[misc]
        def construct(self) -> None:
            # Manim repaints only from the first mobject that has an updater onwards and
            # freezes everything before it. The clock's driver therefore goes in first.
            driver = VMobject()
            self.add(driver)
            canvas = Canvas(fmt, theme, fonts)
            update = build(canvas)
            self.add(*canvas.mobjects)
            clock = {"t": 0.0}

            def tick(mob: Any, dt: float) -> None:
                clock["t"] += dt
                update(clock["t"])

            update(0.0)
            driver.add_updater(tick)
            # With an updater running, Manim renders ceil(duration * fps) frames. Asking for a
            # quarter frame less than a whole number makes that exact despite float error.
            self.wait((frames - 0.25) / FPS)

    landscape = fmt.width >= fmt.height
    frame_height = 8.0 if landscape else 8.0 * fmt.height / fmt.width
    name = f"clip-{uuid.uuid4().hex}"
    settings = {
        "pixel_width": round(fmt.width * quality),
        "pixel_height": round(fmt.height * quality),
        "frame_rate": FPS,
        "frame_height": frame_height,
        "frame_width": frame_height * fmt.width / fmt.height,
        "background_color": theme.bg,
        "media_dir": str(cache_dir),
        "output_file": name,
        "disable_caching": True,
        "verbosity": "ERROR",
        "progress_bar": "none",
    }
    with tempconfig(settings):
        clip = _Clip()
        clip.render()
        produced = Path(clip.renderer.file_writer.movie_file_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(produced), str(out_path))
    shutil.rmtree(produced.parent / "partial_movie_files" / "_Clip", ignore_errors=True)
    actual = count_frames(out_path)
    if actual != frames:
        raise RenderError(f"{out_path.name} has {actual} frames, expected {frames}")
    return out_path
