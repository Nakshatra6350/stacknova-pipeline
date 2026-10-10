"""The scenes stage of the render CLI, with the renderer replaced by a recorder."""

import json
from pathlib import Path
from typing import Any

import pytest

from channel_os.render import main

Data = dict[str, Any]


class Recorder:
    """Stands in for scenes.preview.render_preview: remembers what it was asked to draw."""

    def __init__(self) -> None:
        self.calls: list[Data] = []

    def __call__(self, clips: Any, fmt: Any, theme: Any, fonts: Any, narration: Path,
                 out_path: Path, quality: float, cache_dir: Path) -> Path:
        self.calls.append({"clips": list(clips), "format": fmt.name, "theme": theme.name,
                           "narration": narration, "out": out_path, "quality": quality,
                           "cache": cache_dir})
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(b"video")
        return out_path


@pytest.fixture
def narrated(project: Any, episode: Data, fake_synthesizer: Any) -> Any:
    """A repo root whose episode already has the narration of short-2."""

    def build(change: Any = None) -> Path:
        if change:
            change(episode)
        root, reference = project(episode)
        argv = ["--root", str(root), "--episode", "900-fixture", "--reference", str(reference),
                "--only", "short-2", "--allow-draft"]
        assert main(argv, make_synthesizer=lambda settings, prepared: fake_synthesizer()) == 0
        return Path(root)

    return build


def scenes(root: Path, recorder: Recorder, *extra: str) -> int:
    argv = ["--root", str(root), "--episode", "900-fixture", "--stage", "scenes",
            "--only", "short-2"]
    return main([*argv, *extra], render_preview=recorder)


def timing_path(root: Path) -> Path:
    return root / "out" / "900-fixture" / "timing.json"


def test_a_short_is_animated_to_the_narration_the_voice_stage_left(
    narrated: Any, capsys: pytest.CaptureFixture[str]
) -> None:
    root = narrated()
    recorder = Recorder()
    capsys.readouterr()
    assert scenes(root, recorder) == 0

    (call,) = recorder.calls
    entry = json.loads(timing_path(root).read_text(encoding="utf-8"))["targets"]["short-2"]
    frames = sum(clip.frames for clip in call["clips"])
    assert frames == round(entry["duration"] * 30)
    assert call["narration"] == root / "out" / "900-fixture" / "voice" / "short-2" / "narration.wav"
    assert call["narration"].is_file()
    assert call["out"] == root / "out" / "900-fixture" / "preview" / "short-2.mp4"
    assert call["cache"] == root / ".cache" / "manim"
    # Shorts are portrait; episode 900, Short 2 lands on the second theme of the rotation.
    assert (call["format"], call["theme"], call["quality"]) == ("portrait", "navy", 1.0)
    printed = capsys.readouterr().out
    assert printed.startswith(f"short-2: {frames} frames")
    assert "1 scene(s), portrait, theme navy" in printed


def test_format_theme_and_quality_can_be_chosen_for_one_run(narrated: Any) -> None:
    root = narrated()
    recorder = Recorder()
    assert scenes(root, recorder, "--format", "landscape", "--theme", "brand",
                  "--quality", "0.5") == 0
    (call,) = recorder.calls
    assert (call["format"], call["theme"], call["quality"]) == ("landscape", "brand", 0.5)
    # A format other than the target's own is kept beside the main preview, not over it.
    assert call["out"].name == "short-2.landscape.mp4"


def test_the_theme_an_episode_names_wins_over_the_rotation(narrated: Any) -> None:
    def name_theme(episode: Data) -> None:
        episode["shorts"][1]["theme"] = "brand"

    recorder = Recorder()
    assert scenes(narrated(name_theme), recorder) == 0
    assert recorder.calls[0]["theme"] == "brand"


def test_a_narration_recorded_without_pauses_is_measured(narrated: Any) -> None:
    root = narrated()
    timing = json.loads(timing_path(root).read_text(encoding="utf-8"))
    for segment in timing["targets"]["short-2"]["segments"]:
        del segment["pauses"]
    timing_path(root).write_text(json.dumps(timing), encoding="utf-8")
    recorder = Recorder()
    assert scenes(root, recorder) == 0
    assert len(recorder.calls) == 1


def test_scenes_need_the_voice_first(
    project: Any, episode: Data, capsys: pytest.CaptureFixture[str]
) -> None:
    root, _ = project(episode)
    recorder = Recorder()
    assert scenes(root, recorder) == 2
    assert "timing.json" in capsys.readouterr().err
    assert recorder.calls == []


def test_a_target_without_narration_fails_and_says_so(
    narrated: Any, capsys: pytest.CaptureFixture[str]
) -> None:
    root = narrated()
    recorder = Recorder()
    argv = ["--root", str(root), "--episode", "900-fixture", "--stage", "scenes", "--only", "long"]
    assert main(argv, render_preview=recorder) == 1
    assert "long: timing.json has no narration for it" in capsys.readouterr().err
    assert recorder.calls == []


@pytest.mark.parametrize(
    ("extra", "words"),
    [
        (["--theme", "sepia"], "unknown theme 'sepia'; config/themes.yaml has: brand, navy"),
        (["--quality", "3"], "--quality must be between 0.1 and 1"),
    ],
    ids=["theme", "quality"],
)
def test_a_bad_setting_exits_2(
    narrated: Any, capsys: pytest.CaptureFixture[str], extra: list[str], words: str
) -> None:
    recorder = Recorder()
    assert scenes(narrated(), recorder, *extra) == 2
    assert words in capsys.readouterr().err
    assert recorder.calls == []


def test_a_draft_is_not_animated_unless_allowed(
    narrated: Any, capsys: pytest.CaptureFixture[str]
) -> None:
    def make_draft(episode: Data) -> None:
        episode["status"] = "draft"

    root = narrated(make_draft)
    recorder = Recorder()
    capsys.readouterr()
    assert scenes(root, recorder) == 0
    assert "skipped 900-fixture: status is draft" in capsys.readouterr().out
    assert recorder.calls == []
    assert scenes(root, recorder, "--allow-draft") == 0
    assert len(recorder.calls) == 1


def test_a_failed_render_exits_1(narrated: Any, capsys: pytest.CaptureFixture[str]) -> None:
    def broken(*args: Any) -> Path:
        raise RuntimeError("the text 'CHARGED TWICE' leaves the content area")

    argv = ["--root", str(narrated()), "--episode", "900-fixture", "--stage", "scenes",
            "--only", "short-2"]
    assert main(argv, render_preview=broken) == 1
    assert "leaves the content area" in capsys.readouterr().err


def test_the_voice_stage_still_needs_a_reference(project: Any, episode: Data) -> None:
    root, _ = project(episode)
    with pytest.raises(SystemExit) as stopped:
        main(["--root", str(root), "--episode", "900-fixture"])
    assert stopped.value.code == 2
