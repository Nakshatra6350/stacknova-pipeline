"""The validate CLI: exit codes, output format, and the real episode 001."""

import io
import sys
from pathlib import Path
from typing import Any

import pytest
import yaml

from channel_os.validate import main

Data = dict[str, Any]


def write_episode(tmp_path: Path, episode: Data) -> Path:
    path = tmp_path / "episode.yaml"
    path.write_text(yaml.safe_dump(episode, allow_unicode=True, sort_keys=False), encoding="utf-8")
    return path


def run(root: Path, *paths: Path) -> int:
    return main(["--root", str(root), *(str(path) for path in paths)])


def test_valid_episode_exits_0(
    tmp_path: Path, episode: Data, repo_root: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert run(repo_root, write_episode(tmp_path, episode)) == 0
    assert capsys.readouterr().out == "1 file(s) checked: 0 error(s), 0 warning(s)\n"


def test_schema_violation_exits_1(
    tmp_path: Path, episode: Data, repo_root: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    del episode["pillar"]
    path = write_episode(tmp_path, episode)
    assert run(repo_root, path) == 1
    out = capsys.readouterr().out
    assert f"{path}: error [schema] (root): 'pillar' is a required property" in out


def test_schema_failure_skips_the_lint(
    tmp_path: Path, episode: Data, repo_root: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    del episode["pillar"]
    episode["segments"][0]["visual"]["steps"][1]["at"] = "never said"
    assert run(repo_root, write_episode(tmp_path, episode)) == 1
    assert "[step-anchor]" not in capsys.readouterr().out


def test_lint_error_exits_1_with_one_line_per_finding(
    tmp_path: Path, episode: Data, repo_root: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    episode["segments"][0]["visual"]["steps"][1]["at"] = "never said"
    path = write_episode(tmp_path, episode)
    assert run(repo_root, path) == 1
    assert capsys.readouterr().out.splitlines() == [
        f'{path}: error [step-anchor] s01.visual.steps[1]: at "never said" is not in the narration',
        "1 file(s) checked: 1 error(s), 0 warning(s)",
    ]


def test_warnings_alone_exit_0(
    tmp_path: Path, episode: Data, repo_root: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    episode["shorts"][0]["hook_on_screen"] = "Which of these is safe to retry?"
    assert run(repo_root, write_episode(tmp_path, episode)) == 0
    out = capsys.readouterr().out
    assert "warning [hook-words] short-1" in out
    assert out.endswith("1 file(s) checked: 0 error(s), 1 warning(s)\n")


def test_missing_episode_file_exits_2(
    tmp_path: Path, repo_root: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert run(repo_root, tmp_path / "nope.yaml") == 2
    assert "nope.yaml" in capsys.readouterr().err


def test_yaml_that_is_not_a_mapping_exits_2(
    tmp_path: Path, repo_root: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    path = tmp_path / "episode.yaml"
    path.write_text("- a\n- b\n", encoding="utf-8")
    assert run(repo_root, path) == 2
    assert "expected a mapping" in capsys.readouterr().err


def test_missing_schema_exits_2(
    tmp_path: Path, episode: Data, capsys: pytest.CaptureFixture[str]
) -> None:
    assert run(tmp_path, write_episode(tmp_path, episode)) == 2
    assert "episode.schema.json" in capsys.readouterr().err


def test_output_survives_a_console_that_cannot_encode_it(
    tmp_path: Path, episode: Data, repo_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    episode["segments"][0]["emphasis"] = ["→ arrow"]
    path = write_episode(tmp_path, episode)
    buffer = io.BytesIO()
    monkeypatch.setattr(sys, "stdout", io.TextIOWrapper(buffer, encoding="ascii"))
    assert run(repo_root, path) == 1
    sys.stdout.flush()
    assert b"\\u2192 arrow" in buffer.getvalue()


def test_episode_001_validates_as_a_draft(
    repo_root: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    path = repo_root / "content" / "episodes" / "001-idempotency" / "episode.yaml"
    assert run(repo_root, path) == 0
    out = capsys.readouterr().out
    assert "warning [story-placeholder] s09" in out
    assert " error [" not in out
