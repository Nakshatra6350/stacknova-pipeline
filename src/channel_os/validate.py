"""Validate episode.yaml files: the JSON schema first, then the mechanical reach lint.

Usage: python -m channel_os.validate [--root DIR] PATH [PATH ...]
Exit codes: 0 no errors, 1 at least one error finding, 2 a needed file could not be read.
"""

import argparse
import io
import json
import sys
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft202012Validator

from channel_os.reach.lint import Finding, lint_episode

SCHEMA_PATH = Path("schemas") / "episode.schema.json"
REACH_PATH = Path("config") / "reach.yaml"


class InputError(Exception):
    """A file needed for validation is missing, unparsable or not a mapping."""


def _require_mapping(path: Path, data: object) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise InputError(f"{path}: expected a mapping at the top level")
    return data


def load_yaml(path: Path) -> dict[str, Any]:
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        raise InputError(f"{path}: {exc}") from exc
    return _require_mapping(path, data)


def load_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise InputError(f"{path}: {exc}") from exc
    return _require_mapping(path, data)


def schema_findings(episode: Mapping[str, Any], schema: Mapping[str, Any]) -> list[Finding]:
    errors = sorted(
        Draft202012Validator(schema).iter_errors(episode),
        key=lambda error: [str(part) for part in error.absolute_path],
    )
    return [
        Finding(
            "error",
            "schema",
            "/".join(str(part) for part in error.absolute_path) or "(root)",
            error.message,
        )
        for error in errors
    ]


def validate_episode(
    episode: Mapping[str, Any], schema: Mapping[str, Any], reach: Mapping[str, Any]
) -> list[Finding]:
    """Schema findings if there are any; otherwise the lint findings."""
    return schema_findings(episode, schema) or lint_episode(episode, reach)


def _make_output_safe() -> None:
    """Escape, rather than crash on, characters the console encoding cannot represent."""
    for stream in (sys.stdout, sys.stderr):
        if isinstance(stream, io.TextIOWrapper):
            stream.reconfigure(errors="backslashreplace")


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m channel_os.validate",
        description="Validate episode.yaml files against the schema and the reach lint.",
    )
    parser.add_argument("paths", nargs="+", type=Path, metavar="PATH")
    parser.add_argument(
        "--root",
        type=Path,
        default=Path.cwd(),
        help="repo root holding schemas/ and config/ (default: current directory)",
    )
    args = parser.parse_args(argv)
    _make_output_safe()

    try:
        schema = load_json(args.root / SCHEMA_PATH)
        reach = load_yaml(args.root / REACH_PATH)
        episodes = [(path, load_yaml(path)) for path in args.paths]
    except InputError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    errors = 0
    warnings = 0
    for path, episode in episodes:
        for finding in validate_episode(episode, schema, reach):
            print(f"{path}: {finding.level} [{finding.rule}] {finding.where}: {finding.message}")
            if finding.level == "error":
                errors += 1
            else:
                warnings += 1
    print(f"{len(episodes)} file(s) checked: {errors} error(s), {warnings} warning(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
