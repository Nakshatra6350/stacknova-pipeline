"""The render harness: exact frame counts, a clock that really redraws, text that fits."""

from pathlib import Path
from typing import Any

import pytest

pytest.importorskip("manim", reason="needs the scenes dependency group")

from channel_os.scenes.easing import bump, lin, smooth, window
from channel_os.scenes.flow_model import LANDSCAPE, PORTRAIT
from channel_os.scenes.kit import Canvas, SceneError
from channel_os.scenes.render import (
    RenderError,
    count_frames,
    frame_count,
    read_frame,
    render_scene,
)
from channel_os.scenes.theme import load_themes

QUALITY = 0.25  # quarter size keeps these tests quick


@pytest.fixture(scope="module")
def themes(tmp_path_factory: pytest.TempPathFactory) -> Any:
    root = Path(__file__).resolve().parents[1]
    return load_themes(root / "config" / "themes.yaml")


@pytest.fixture
def cache(repo_root: Path) -> Path:
    # Shared between runs on purpose: Manim caches rasterised text here.
    return repo_root / ".cache" / "manim-tests"


def test_easing_shapes() -> None:
    assert (lin(0, 1, 3), lin(2, 1, 3), lin(9, 1, 3)) == (0.0, 0.5, 1.0)
    assert smooth(2, 1, 3) == 0.5
    assert smooth(1.5, 1, 3) < lin(1.5, 1, 3)
    assert bump(2, 1, 3) == pytest.approx(1.0)
    assert bump(1, 1, 3) == pytest.approx(0.0)
    assert window(2, 1, 3) == pytest.approx(1.0)
    assert window(0.5, 1, 3) == 0.0


def test_frame_count_rounds_to_the_nearest_frame() -> None:
    assert frame_count(14.0) == 420
    assert frame_count(32.66) == 980
    assert frame_count(0.001) == 1


@pytest.mark.parametrize("frames", [1, 17, 45])
def test_a_clip_has_exactly_the_frames_asked_for(
    tmp_path: Path, themes: Any, cache: Path, frames: int
) -> None:
    def build(canvas: Canvas) -> Any:
        theme = canvas.theme
        box = canvas.reg(canvas.rrect(540, 600, 300, 200, 20, theme.strong, theme.surface))
        canvas.add(box)
        return lambda t: canvas.show(box, 1.0)

    out = render_scene(build, PORTRAIT, themes.themes["brand"], themes, frames,
                       tmp_path / "clip.mp4", quality=QUALITY, cache_dir=cache)
    assert out == tmp_path / "clip.mp4"
    assert count_frames(out) == frames


def test_the_clock_redraws_every_frame(tmp_path: Path, themes: Any, cache: Path) -> None:
    # Regression: Manim repaints only from the first mobject with an updater onwards. Without a
    # driver added first, every frame was a copy of the first one and the video was black.
    def build(canvas: Canvas) -> Any:
        box = canvas.reg(canvas.rrect(540, 650, 500, 400, 20, canvas.theme.ink, canvas.theme.ink))
        canvas.add(box)
        return lambda t: canvas.show(box, 1.0 if t > 0.5 else 0.0)

    out = render_scene(build, PORTRAIT, themes.themes["brand"], themes, 30,
                       tmp_path / "clip.mp4", quality=QUALITY, cache_dir=cache)
    first, last = read_frame(out, 0), read_frame(out, 29)
    assert first.mean() < 5, "the box starts invisible on a near-black background"
    assert last.mean() > first.mean() + 10, "the box must have appeared by the last frame"


def test_a_wrong_frame_count_is_an_error(
    tmp_path: Path, themes: Any, cache: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("channel_os.scenes.render.count_frames", lambda path: 7)
    with pytest.raises(RenderError, match="7 frames"):
        render_scene(lambda canvas: (lambda t: None), LANDSCAPE, themes.themes["navy"], themes,
                     10, tmp_path / "clip.mp4", quality=QUALITY, cache_dir=cache)


def test_text_is_fitted_to_its_slot_and_sits_on_a_shared_baseline(
    tmp_path: Path, themes: Any, cache: Path
) -> None:
    seen: dict[str, Any] = {}

    def build(canvas: Canvas) -> Any:
        wide = canvas.text("idempotency_keys", 540, 500, 40, canvas.theme.ink, max_width=300)
        with pytest.raises(SceneError, match="too long"):
            canvas.text("a label far too long to shrink into its slot", 540, 500, 40,
                        canvas.theme.ink, max_width=300)
        low = canvas.text("gypsy", 300, 700, 40, canvas.theme.ink)
        high = canvas.text("TITLE", 700, 700, 40, canvas.theme.ink)
        canvas.add(wide, low, high)
        seen.update(width=wide.width / canvas.unit, low=low, high=high, unit=canvas.unit)
        return lambda t: None

    render_scene(build, PORTRAIT, themes.themes["brand"], themes, 2, tmp_path / "clip.mp4",
                 quality=QUALITY, cache_dir=cache)
    assert seen["width"] <= 300.5
    # Descenders hang below the baseline and capitals stand on it: the bottoms differ, but
    # neither word may be re-centred on its own letters.
    assert seen["low"].get_bottom()[1] < seen["high"].get_bottom()[1]
    assert seen["high"].get_top()[1] > seen["low"].get_center()[1]
