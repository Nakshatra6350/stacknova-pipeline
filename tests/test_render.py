"""The render CLI: validation gate, status gate, targets and exit codes."""

import json
import shutil
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
import yaml

from channel_os.render import main

Data = dict[str, Any]
SHORT = "Here is the retry that matters. It works every time."


@pytest.fixture
def project(tmp_path: Path, repo_root: Path, audio: Any) -> Callable[[Data], tuple[Path, Path]]:
    """Build a throwaway repo root holding one episode, plus a voice reference beside it."""

    def build(episode: Data) -> tuple[Path, Path]:
        root = tmp_path / "repo"
        shutil.copytree(repo_root / "schemas", root / "schemas")
        shutil.copytree(repo_root / "config", root / "config")
        folder = root / "content" / "episodes" / episode["id"]
        folder.mkdir(parents=True)
        text = yaml.safe_dump(episode, allow_unicode=True, sort_keys=False)
        (folder / "episode.yaml").write_text(text, encoding="utf-8")
        reference = audio(tmp_path / "reference.wav", [(8.0, 0.05)], rate=44100, channels=2)
        return root, reference

    return build


def run(root: Path, reference: Path, synthesizer: Any, *extra: str) -> int:
    argv = ["--root", str(root), "--episode", "900-fixture", "--reference", str(reference)]
    return main([*argv, *extra], make_synthesizer=lambda settings, prepared: synthesizer)


def timing(root: Path) -> Data:
    path = root / "out" / "900-fixture" / "timing.json"
    data: Data = json.loads(path.read_text(encoding="utf-8"))
    return data


def test_a_ready_episode_renders_one_target(
    project: Any, episode: Data, fake_synthesizer: Any, capsys: pytest.CaptureFixture[str]
) -> None:
    root, reference = project(episode)
    assert run(root, reference, fake_synthesizer(), "--only", "short-2") == 0
    assert (root / "out" / "900-fixture" / "voice" / "short-2" / "narration.wav").is_file()
    assert list(timing(root)["targets"]) == ["short-2"]
    assert capsys.readouterr().out.startswith("short-2: ")


def test_a_draft_is_skipped_unless_allowed(
    project: Any, episode: Data, fake_synthesizer: Any, capsys: pytest.CaptureFixture[str]
) -> None:
    episode["status"] = "draft"
    root, reference = project(episode)
    synthesizer = fake_synthesizer()

    assert run(root, reference, synthesizer, "--only", "short-2") == 0
    assert "skipped 900-fixture: status is draft" in capsys.readouterr().out
    assert synthesizer.calls == []
    assert not (root / "out").exists()

    assert run(root, reference, synthesizer, "--only", "short-2", "--allow-draft") == 0
    assert list(timing(root)["targets"]) == ["short-2"]


def test_an_invalid_episode_never_renders(
    project: Any, episode: Data, fake_synthesizer: Any, capsys: pytest.CaptureFixture[str]
) -> None:
    episode["segments"][0]["visual"]["steps"][1]["at"] = "never said"
    root, reference = project(episode)
    synthesizer = fake_synthesizer()
    assert run(root, reference, synthesizer, "--only", "short-2") == 1
    assert "error [step-anchor]" in capsys.readouterr().out
    assert synthesizer.calls == []


def test_a_missing_reference_exits_2(
    project: Any, episode: Data, fake_synthesizer: Any, capsys: pytest.CaptureFixture[str]
) -> None:
    root, reference = project(episode)
    reference.unlink()
    assert run(root, reference, fake_synthesizer(), "--only", "short-2") == 2
    assert "voice reference not found" in capsys.readouterr().err


def test_an_unknown_target_exits_1(
    project: Any, episode: Data, fake_synthesizer: Any, capsys: pytest.CaptureFixture[str]
) -> None:
    root, reference = project(episode)
    assert run(root, reference, fake_synthesizer(), "--only", "short-9") == 1
    assert "unknown target" in capsys.readouterr().err


def test_all_renders_the_long_video_and_every_short(
    project: Any, episode: Data, fake_synthesizer: Any
) -> None:
    for segment in episode["segments"]:
        segment["narration"] = SHORT
    root, reference = project(episode)
    assert run(root, reference, fake_synthesizer(), "--only", "all") == 0
    assert list(timing(root)["targets"]) == ["long", "short-1", "short-2"]


def test_the_model_can_be_overridden(project: Any, episode: Data, fake_synthesizer: Any) -> None:
    root, reference = project(episode)
    assert run(root, reference, fake_synthesizer(), "--only", "short-2", "--model", "turbo") == 0
    assert timing(root)["targets"]["short-2"]["model"] == "turbo"


def test_settings_can_be_overridden_for_one_run(
    project: Any, episode: Data, fake_synthesizer: Any, capsys: pytest.CaptureFixture[str]
) -> None:
    root, reference = project(episode)
    assert run(root, reference, fake_synthesizer(), "--only", "short-2", "--set", "tempo=0.8") == 0
    assert run(root, reference, fake_synthesizer(), "--only", "short-2", "--set", "speed=2") == 2
    assert "unknown voice setting" in capsys.readouterr().err


def test_the_model_gets_a_prepared_copy_of_the_reference(
    project: Any, episode: Data, fake_synthesizer: Any
) -> None:
    root, reference = project(episode)
    original = reference.read_bytes()
    seen: list[Path] = []

    def factory(settings: Any, prepared: Path) -> Any:
        assert prepared.is_file()
        seen.append(prepared)
        return fake_synthesizer()

    argv = ["--root", str(root), "--episode", "900-fixture", "--reference", str(reference)]
    assert main([*argv, "--only", "short-2"], make_synthesizer=factory) == 0
    assert seen and seen[0] != reference
    assert reference.read_bytes() == original
