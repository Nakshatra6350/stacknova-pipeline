"""The render harness: exact frame counts, a clock that really redraws, text that fits."""

from itertools import pairwise
from pathlib import Path
from typing import Any

import pytest

pytest.importorskip("manim", reason="needs the scenes dependency group")

from channel_os.scenes.easing import bump, lin, smooth, window
from channel_os.scenes.formats import LANDSCAPE, PORTRAIT, frame_count
from channel_os.scenes.kit import FONT_FILES, Canvas, SceneError
from channel_os.scenes.render import RenderError, count_frames, read_frame, render_scene
from channel_os.scenes.theme import load_themes

QUALITY = 0.25  # quarter size keeps these tests quick


@pytest.fixture(scope="module")
def themes(tmp_path_factory: pytest.TempPathFactory) -> Any:
    root = Path(__file__).resolve().parents[1]
    return load_themes(root / "config" / "themes.yaml")


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


def test_every_bundled_face_is_the_one_drawn(tmp_path: Path, themes: Any, cache: Path) -> None:
    # Seen on GitHub on 11 October 2026: Inter Medium and SemiBold were registered after
    # Pango's first label, so Linux drew a system font in their place and nothing failed.
    # Each face sets this sentence to its own width; a substitute is about 10% wider, and a
    # weight faked from another one lands on that one's width.
    probe = "Why illicit waves move"
    measured = {  # pixels at 40 px in portrait, from the faces themselves
        ("Inter", "NORMAL"): 517.7,
        ("Inter", "MEDIUM"): 524.8,
        ("Inter", "SEMIBOLD"): 531.9,
        ("Inter", "BOLD"): 538.9,
        ("Inter Display", "ULTRABOLD"): 520.7,
        ("JetBrains Mono", "NORMAL"): 639.5,
        ("JetBrains Mono", "BOLD"): 640.4,
    }
    assert set(measured) == set(FONT_FILES)
    seen: dict[tuple[str, str], float] = {}

    def build(canvas: Canvas) -> Any:
        # Mono first, as in every real scene: the other faces are asked for after it.
        for family, weight in sorted(measured, key=lambda face: face[0] != "JetBrains Mono"):
            label = canvas.text(probe, 540, 600, 40, canvas.theme.ink, font=family, weight=weight)
            seen[(family, weight)] = label.width / canvas.unit
        return lambda t: None

    render_scene(build, PORTRAIT, themes.themes["brand"], themes, 1, tmp_path / "clip.mp4",
                 quality=QUALITY, cache_dir=cache)
    for face, width in measured.items():
        assert seen[face] == pytest.approx(width, rel=0.02), f"{face} is not the bundled face"
    inter = [seen[("Inter", weight)] for weight in ("NORMAL", "MEDIUM", "SEMIBOLD", "BOLD")]
    assert all(heavier > lighter * 1.008 for lighter, heavier in pairwise(inter)), inter


def test_text_is_fitted_to_its_slot_and_sits_on_a_shared_baseline(
    tmp_path: Path, themes: Any, cache: Path
) -> None:
    seen: dict[str, Any] = {}

    def build(canvas: Canvas) -> Any:
        wide = canvas.text("idempotency_keys", 540, 500, 40, canvas.theme.ink, max_width=300)
        with pytest.raises(SceneError, match="too long"):
            canvas.text("a label far too long to shrink into its slot", 540, 500, 40,
                        canvas.theme.ink, max_width=300)
        with pytest.raises(SceneError, match="no bundled font for JetBrains Mono HEAVY"):
            canvas.text("x", 540, 500, 40, canvas.theme.ink, weight="HEAVY")
        low = canvas.text("gypsy", 300, 700, 40, canvas.theme.ink)
        high = canvas.text("TITLE", 700, 700, 40, canvas.theme.ink)
        small = canvas.text("TITLE", 700, 900, 20, canvas.theme.muted)
        canvas.add(wide, low, high, small)
        seen.update(width=wide.width / canvas.unit, low=low, high=high, unit=canvas.unit,
                    ratio=high.width / small.width, box=canvas.bounds(high))
        return lambda t: None

    render_scene(build, PORTRAIT, themes.themes["brand"], themes, 2, tmp_path / "clip.mp4",
                 quality=QUALITY, cache_dir=cache)
    assert seen["width"] <= 300.5
    # Descenders hang below the baseline and capitals stand on it: the bottoms differ, but
    # neither word may be re-centred on its own letters.
    assert seen["low"].get_bottom()[1] < seen["high"].get_bottom()[1]
    assert seen["high"].get_top()[1] > seen["low"].get_center()[1]
    # One cached outline serves every size: the same word at half the size is half as wide.
    assert seen["ratio"] == pytest.approx(2.0, rel=1e-6)
    # 40 px mono capitals at portrait's 1.25 text scale: five 30 px advances, about 36 px tall.
    box = seen["box"]
    assert box.cx == pytest.approx(700, abs=1.0)
    assert 130 < box.w < 150
    assert 30 < box.h < 42
