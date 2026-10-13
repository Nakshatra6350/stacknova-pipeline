"""The scenes stage of the render CLI, with the renderer and the music replaced by recorders."""

import json
from pathlib import Path
from typing import Any

import pytest
import yaml
from conftest import FakeListener

from channel_os.render import main

Data = dict[str, Any]


class Recorder:
    """Stands in for scenes.preview.render_preview: remembers what it was asked to draw."""

    def __init__(self) -> None:
        self.calls: list[Data] = []

    def __call__(self, plan: Any, fmt: Any, theme: Any, narration: Path, out_path: Path,
                 sounds: Any, quality: float = 1.0, jobs: int = 1) -> Path:
        self.calls.append({"plan": plan, "format": fmt.name, "theme": theme.name,
                           "narration": narration, "out": out_path, "sounds": dict(sounds),
                           "quality": quality, "jobs": jobs})
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(b"video")
        return out_path


class Composer:
    """Stands in for brand.sound.write_sound: writes a marker and remembers the name asked for."""

    def __init__(self) -> None:
        self.made: list[str] = []

    def __call__(self, name: str, path: Path) -> Path:
        self.made.append(name)
        path.write_bytes(b"music")
        return path


@pytest.fixture
def narrated(project: Any, episode: Data, fake_synthesizer: Any) -> Any:
    """A repo root whose episode already has the narration of short-2."""

    def build(change: Any = None) -> Path:
        if change:
            change(episode)
        root, reference = project(episode)
        argv = ["--root", str(root), "--episode", "900-fixture", "--reference", str(reference),
                "--only", "short-2", "--allow-draft"]
        assert main(argv, make_synthesizer=lambda settings, prepared: fake_synthesizer(),
                    make_listener=FakeListener) == 0
        return Path(root)

    return build


def scenes(root: Path, recorder: Any, *extra: str, only: str = "short-2",
           composer: Composer | None = None) -> int:
    argv = ["--root", str(root), "--episode", "900-fixture", "--stage", "scenes", "--only", only]
    return main([*argv, *extra], render_preview=recorder, make_sound=composer or Composer())


def timing_path(root: Path) -> Path:
    return root / "out" / "900-fixture" / "timing.json"


def narrate_long(root: Path) -> None:
    """Record a narration of the long video in timing.json without running the voice stage."""
    timing = json.loads(timing_path(root).read_text(encoding="utf-8"))
    timing["targets"]["long"] = {
        "narration": "voice/long/narration.wav",
        "duration": 36.0,
        "segments": [
            {"id": unit, "file": f"voice/long/seg-{unit}.wav", "start": index * 12.0,
             "duration": 11.75, "pauses": []}
            for index, unit in enumerate(["s01", "s02", "s03"])
        ],
    }
    timing_path(root).write_text(json.dumps(timing), encoding="utf-8")


def test_a_short_is_animated_to_the_narration_the_voice_stage_left(
    narrated: Any, capsys: pytest.CaptureFixture[str]
) -> None:
    root = narrated()
    recorder, composer = Recorder(), Composer()
    capsys.readouterr()
    assert scenes(root, recorder, composer=composer) == 0

    (call,) = recorder.calls
    entry = json.loads(timing_path(root).read_text(encoding="utf-8"))["targets"]["short-2"]
    frames = call["plan"].frames
    assert frames == round(entry["duration"] * 30)
    assert call["narration"] == root / "out" / "900-fixture" / "voice" / "short-2" / "narration.wav"
    assert call["narration"].is_file()
    assert call["out"] == root / "out" / "900-fixture" / "preview" / "short-2.mp4"
    # Shorts are portrait; episode 900, Short 2 lands on the second look of the rotation.
    assert (call["format"], call["theme"], call["quality"]) == ("portrait", "nova", 1.0)
    # A Short has no brand scenes, so no music is made for it.
    assert call["sounds"] == {} and composer.made == []
    assert [clip.spec.layout for clip in call["plan"].clips] == ["console"]
    printed = capsys.readouterr().out
    assert printed.startswith(f"short-2: {frames} frames")
    assert "1 scene(s), portrait, theme nova" in printed


def test_a_long_video_gets_its_brand_scenes_and_the_outro_music(narrated: Any) -> None:
    root = narrated()
    narrate_long(root)
    recorder, composer = Recorder(), Composer()
    assert scenes(root, recorder, only="long", composer=composer) == 0
    (call,) = recorder.calls
    assert [clip.unit for clip in call["plan"].clips] == ["s01", "intro", "s02", "s03", "outro"]
    assert (call["format"], call["out"].name) == ("landscape", "long.mp4")
    # Both sounds are the ones config/brand.yaml names, the owner's picks.
    assert composer.made == ["lofi-nod", "nod-up"]
    assert sorted(call["sounds"]) == ["intro", "outro"]


def test_an_intro_sound_is_passed_through_when_given(narrated: Any, tmp_path: Path) -> None:
    root = narrated()
    narrate_long(root)
    sting = tmp_path / "sting.wav"
    sting.write_bytes(b"sting")
    recorder = Recorder()
    assert scenes(root, recorder, "--intro-sound", str(sting), only="long") == 0
    assert recorder.calls[0]["sounds"]["intro"] == sting


def set_intro_sound(root: Path, name: str | None) -> None:
    config = root / "config" / "brand.yaml"
    brand = yaml.safe_load(config.read_text(encoding="utf-8"))
    brand["video"]["intro"]["sound"] = name
    config.write_text(yaml.safe_dump(brand, allow_unicode=True, sort_keys=False), encoding="utf-8")


def test_the_intro_sound_is_whatever_the_config_names(narrated: Any, tmp_path: Path) -> None:
    root = narrated()
    narrate_long(root)
    set_intro_sound(root, "another-sting")
    recorder, composer = Recorder(), Composer()
    assert scenes(root, recorder, only="long", composer=composer) == 0
    assert composer.made == ["lofi-nod", "another-sting"]

    # A file given on the command line wins over the configured sound.
    sting = tmp_path / "sting.wav"
    sting.write_bytes(b"sting")
    recorder, composer = Recorder(), Composer()
    assert scenes(root, recorder, "--intro-sound", str(sting), only="long",
                  composer=composer) == 0
    assert composer.made == ["lofi-nod"] and recorder.calls[0]["sounds"]["intro"] == sting

    # With no sound named, the logo plays in silence.
    set_intro_sound(root, None)
    recorder, composer = Recorder(), Composer()
    assert scenes(root, recorder, only="long", composer=composer) == 0
    assert composer.made == ["lofi-nod"] and list(recorder.calls[0]["sounds"]) == ["outro"]


def test_format_theme_and_quality_can_be_chosen_for_one_run(narrated: Any) -> None:
    root = narrated()
    recorder = Recorder()
    assert scenes(root, recorder, "--format", "landscape", "--theme", "control",
                  "--quality", "0.5", "--jobs", "3") == 0
    (call,) = recorder.calls
    assert (call["format"], call["theme"], call["quality"]) == ("landscape", "control", 0.5)
    assert call["jobs"] == 3
    # A format other than the target's own is kept beside the main preview, not over it.
    assert call["out"].name == "short-2.landscape.mp4"


def test_the_theme_an_episode_names_wins_over_the_rotation(narrated: Any) -> None:
    def name_theme(episode: Data) -> None:
        episode["shorts"][1]["theme"] = "control"

    recorder = Recorder()
    assert scenes(narrated(name_theme), recorder) == 0
    assert recorder.calls[0]["theme"] == "control"


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
    recorder = Recorder()
    assert scenes(narrated(), recorder, only="long") == 1
    assert "long: timing.json has no narration for it" in capsys.readouterr().err
    assert recorder.calls == []


@pytest.mark.parametrize(
    ("extra", "words"),
    [
        (["--theme", "sepia"], "unknown theme 'sepia'; config/themes.yaml has: control, nova"),
        (["--quality", "3"], "--quality must be between 0.1 and 1"),
        (["--jobs", "0"], "--jobs must be between 1 and 8"),
        (["--intro-sound", "missing.wav"], "missing.wav: intro sound not found"),
    ],
    ids=["theme", "quality", "jobs", "intro-sound"],
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
    def broken(*args: Any, **options: Any) -> Path:
        raise RuntimeError("part of the scene leaves the portrait content area")

    assert scenes(narrated(), broken) == 1
    assert "leaves the portrait content area" in capsys.readouterr().err


def test_the_voice_stage_still_needs_a_reference(project: Any, episode: Data) -> None:
    root, _ = project(episode)
    with pytest.raises(SystemExit) as stopped:
        main(["--root", str(root), "--episode", "900-fixture"])
    assert stopped.value.code == 2
