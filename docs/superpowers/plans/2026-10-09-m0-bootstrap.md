# M0 Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A repo that installs with `uv sync`, has the importable `channel_os` skeleton, validates `episode.yaml` files from the command line, and proves it in CI.

**Architecture:** `schemas/episode.schema.json` stays the single contract and is checked with `jsonschema`. Rules the schema cannot express are plain functions in `channel_os.reach.lint` that return `Finding` objects. `channel_os.validate` is a thin CLI that runs the schema first and the lint only when the schema passes.

**Tech Stack:** Python 3.12, uv, jsonschema, PyYAML, pytest, ruff, mypy (strict), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-09-m0-bootstrap-design.md`

## Global Constraints

- Python `>=3.12,<3.13`; dependencies managed only through `pyproject.toml` + `uv.lock`.
- `uv run pytest`, `uv run ruff check` and `uv run mypy src` must all pass before any task is called done.
- `mypy --strict` applies to everything under `src/`.
- Line length 100. Python source is ASCII-only (ruff `RUF001`-`RUF003` reject look-alike Unicode).
- No rendering, no network calls, no reads or writes of `state/`, nothing that publishes.
- No Phase 2 content (store, guide or affiliate links) anywhere.
- Work on branch `m0-bootstrap`. Stage files by explicit path; `brand-assets/` and `config/brand.yaml` belong to other work and are never staged here.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- On the owner's PC `uv` was installed during this session: open a new terminal (or refresh `PATH`) before running the commands below.

## File Structure

| Path | Responsibility |
|---|---|
| `pyproject.toml`, `uv.lock`, `.python-version` | Project metadata, pinned dependencies, tool configuration |
| `.gitattributes`, `.gitignore` | LF line endings; ignore tool caches |
| `src/channel_os/**` (skeleton) | One docstring-only module per future component (`CLAUDE.md` §5) |
| `src/channel_os/reach/lint.py` | `Finding`, the ten rules, `lint_episode` |
| `src/channel_os/validate.py` | File loading, schema check, CLI and exit codes |
| `tests/conftest.py` | `episode`, `reach`, `repo_root` fixtures |
| `tests/test_skeleton.py`, `tests/test_reach_lint.py`, `tests/test_validate.py` | Tests, one file per unit |
| `.github/workflows/ci.yml` | `check` and `samples` jobs |
| `CLAUDE.md`, `README.md` | Layout lines for the two new modules; how to run the checks |

---

### Task 1: Tooling and package skeleton

**Files:**
- Create: `pyproject.toml`, `.python-version`, `.gitattributes`, `uv.lock` (generated)
- Modify: `.gitignore`
- Create: every file in the skeleton table below
- Test: `tests/test_skeleton.py`

**Interfaces:**
- Consumes: nothing.
- Produces: an installed, importable `channel_os` package; the `uv run` commands used by every later task.

- [ ] **Step 1: Write the project configuration**

`pyproject.toml`:

```toml
[project]
name = "channel-os"
version = "0.1.0"
description = "Automation pipeline behind the StackNova channel"
readme = "README.md"
requires-python = ">=3.12,<3.13"
dependencies = [
    "jsonschema>=4.23",
    "pyyaml>=6.0.2",
]

[dependency-groups]
dev = [
    "mypy>=1.13",
    "pytest>=8.3",
    "ruff>=0.8",
    "types-jsonschema>=4.23",
    "types-pyyaml>=6.0.12",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/channel_os"]

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-ra"

[tool.ruff]
line-length = 100
target-version = "py312"
extend-exclude = [".claude", "brand-assets"]

[tool.ruff.lint]
select = ["E", "F", "I", "B", "UP", "SIM", "RUF"]

[tool.mypy]
python_version = "3.12"
strict = true
files = ["src"]
```

`.python-version`:

```text
3.12
```

`.gitattributes`:

```text
* text=auto eol=lf
*.png binary
*.jpg binary
*.wav binary
*.mp4 binary
```

Append to `.gitignore`:

```text
.pytest_cache/
.ruff_cache/
.mypy_cache/
```

- [ ] **Step 2: Create the package root and install**

`src/channel_os/__init__.py`:

```python
"""channel-os: the automation pipeline behind the StackNova channel."""
```

`src/channel_os/py.typed`: empty file.

Run: `uv sync`
Expected: uv downloads CPython 3.12, creates `.venv/` and writes `uv.lock`.

- [ ] **Step 3: Write the failing test**

`tests/test_skeleton.py`:

```python
"""The package layout of CLAUDE.md section 5 exists and is importable."""

import importlib

import pytest

SKELETON_MODULES = [
    "channel_os",
    "channel_os.voice.tts",
    "channel_os.voice.loudness",
    "channel_os.scenes.theme",
    "channel_os.scenes.components",
    "channel_os.assemble.timeline",
    "channel_os.assemble.ffmpeg",
    "channel_os.assemble.cuts",
    "channel_os.assemble.thumbnails",
    "channel_os.assemble.carousel",
    "channel_os.captions.align",
    "channel_os.captions.ass",
    "channel_os.captions.srt",
    "channel_os.publish.youtube",
    "channel_os.publish.instagram",
    "channel_os.publish.pages_host",
    "channel_os.telegram.bot",
    "channel_os.telegram.approvals",
    "channel_os.state.queue",
    "channel_os.report.weekly",
    "channel_os.reach",
]


@pytest.mark.parametrize("name", SKELETON_MODULES)
def test_module_imports_and_is_documented(name: str) -> None:
    module = importlib.import_module(name)
    assert module.__doc__ and module.__doc__.strip()
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `uv run pytest tests/test_skeleton.py -q`
Expected: 1 passed (`channel_os`), 20 failed with `ModuleNotFoundError`.

- [ ] **Step 5: Create the skeleton**

Each file below contains exactly one line: the docstring shown.

| File under `src/channel_os/` | Content |
|---|---|
| `voice/__init__.py` | `"""Narration: voice synthesis and loudness (milestone M1)."""` |
| `voice/tts.py` | `"""Synthesise narration per segment with chatterbox-tts in the owner's cloned voice (M1)."""` |
| `voice/loudness.py` | `"""Two-pass ffmpeg loudnorm to -14 LUFS, true peak at most -1 dBTP (M1)."""` |
| `scenes/__init__.py` | `"""Shared Manim theme and components (milestone M2)."""` |
| `scenes/theme.py` | `"""Colours and fonts for every scene, read from config/brand.yaml (M2)."""` |
| `scenes/components.py` | `"""Reusable Manim components: Box, Arrow, Lane, Timeline, CodeBlock, Callout (M2)."""` |
| `assemble/__init__.py` | `"""Assembly of final media files (milestone M3)."""` |
| `assemble/timeline.py` | `"""Build the edit timeline from segment timings and scene clips (M3)."""` |
| `assemble/ffmpeg.py` | `"""ffmpeg wrappers: concat, mux, encode H.264 high + AAC 192k with faststart (M3)."""` |
| `assemble/cuts.py` | `"""Cut Shorts and Reels from episode.yaml shorts[] (M3)."""` |
| `assemble/thumbnails.py` | `"""Render thumbnail variants from HTML templates with Playwright (M3)."""` |
| `assemble/carousel.py` | `"""Render carousel slides from HTML templates with Playwright (M3)."""` |
| `captions/__init__.py` | `"""Captions and subtitle tracks, per docs/CAPTIONS_SPEC.md (milestone M3)."""` |
| `captions/align.py` | `"""Align faster-whisper word timestamps to the known script words (M3)."""` |
| `captions/ass.py` | `"""Burned-in word-by-word captions as an ASS file (M3)."""` |
| `captions/srt.py` | `"""Sentence-level SRT subtitle tracks for upload (M3)."""` |
| `publish/__init__.py` | `"""Publishing of approved assets only (milestones M5 and M6). See CLAUDE.md section 1."""` |
| `publish/youtube.py` | `"""YouTube Data API v3 uploads and metadata for approved assets (M5)."""` |
| `publish/instagram.py` | `"""Instagram API publishing of Reels, carousels and stories for approved assets (M6)."""` |
| `publish/pages_host.py` | `"""Temporary public URLs on the gh-pages branch for Instagram media (M6)."""` |
| `telegram/__init__.py` | `"""Telegram previews and approvals, per docs/APPROVAL_FLOW.md (milestone M4)."""` |
| `telegram/bot.py` | `"""Send asset previews and parse callbacks from the owner's chat only (M4)."""` |
| `telegram/approvals.py` | `"""Turn Telegram callbacks into approve and reject state transitions (M4)."""` |
| `state/__init__.py` | `"""Asset state on the state branch (milestone M4)."""` |
| `state/queue.py` | `"""Asset state machine and optimistic-concurrency writes to state/queue.json (M4)."""` |
| `report/__init__.py` | `"""Weekly analytics report (milestone M7)."""` |
| `report/weekly.py` | `"""Pull YouTube and Instagram analytics and write the weekly report (M7)."""` |
| `reach/__init__.py` | `"""Reach and content rules enforced before an episode can render."""` |

- [ ] **Step 6: Run the checks to verify they pass**

Run: `uv run pytest tests/test_skeleton.py -q`
Expected: 21 passed.

Run: `uv run ruff check`
Expected: `All checks passed!`

Run: `uv run mypy src`
Expected: `Success: no issues found in 29 source files`

- [ ] **Step 7: Commit**

```bash
git add pyproject.toml uv.lock .python-version .gitattributes .gitignore src tests/test_skeleton.py
git commit -m "build: add uv project, tooling config and package skeleton" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Lint rules that are always errors

**Files:**
- Create: `src/channel_os/reach/lint.py`
- Create: `tests/conftest.py`
- Test: `tests/test_reach_lint.py`

**Interfaces:**
- Consumes: the installed package from Task 1.
- Produces:
  - `Finding(level: Literal["error", "warning"], rule: str, where: str, message: str)` — frozen dataclass.
  - `lint_episode(episode: Mapping[str, Any], reach: Mapping[str, Any]) -> list[Finding]`.
  - Fixtures `episode` (a dict that passes the schema and every rule), `reach` (minimal reach config) and `repo_root` (`Path`).

- [ ] **Step 1: Write the fixtures**

`tests/conftest.py`:

```python
"""Shared fixtures: a minimal episode that passes the schema and every lint rule."""

from pathlib import Path
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
LANGUAGES = ["hi", "es", "pt", "id", "vi", "ar"]


def _segment(segment_id: str) -> dict[str, Any]:
    return {
        "id": segment_id,
        "title": f"Segment {segment_id}",
        "narration": "Here is the retry that matters." + " filler" * 400,
        "emphasis": ["retry"],
        "visual": {
            "layout": "client-server-db",
            "steps": [
                {"at": "start", "action": "add", "target": "client"},
                {"at": "the retry", "action": "highlight", "target": "client"},
            ],
        },
    }


@pytest.fixture
def episode() -> dict[str, Any]:
    return {
        "id": "900-fixture",
        "version": 1,
        "status": "ready_to_render",
        "pillar": "money-systems",
        "language": "en",
        "keywords": {"primary": "idempotency"},
        "packaging": {
            "titles": ["Idempotency keys explained", "Idempotency: why retries are safe"],
            "thumbnail_texts": ["CHARGED TWICE?"],
            "description": "Fixture description.",
            "tags": ["a", "b", "c", "d", "e"],
        },
        "segments": [_segment("s01"), _segment("s02"), _segment("s03")],
        "shorts": [
            {
                "id": "short-1",
                "source": "segments",
                "segments": ["s02"],
                "hook_on_screen": "This retry charged you twice",
                "youtube_title": "Why Your Retry Charged You Twice #Shorts",
                "instagram_caption": "Caption.",
            },
            {
                "id": "short-2",
                "source": "standalone",
                "script": "A standalone script about one retry.",
                "hook_on_screen": "Exactly-once is a lie",
                "youtube_title": "Exactly-Once Delivery Doesn't Exist #Shorts",
                "instagram_caption": "Caption.",
            },
        ],
        "sources": [{"title": "RFC 9110", "url": "https://www.rfc-editor.org/rfc/rfc9110"}],
        "fact_check": [
            {"claim": "GET is idempotent", "source": "https://www.rfc-editor.org/rfc/rfc9110"}
        ],
        "localizations": {
            language: {"title": f"Title {language}", "description": f"Description {language}"}
            for language in LANGUAGES
        },
    }


@pytest.fixture
def reach() -> dict[str, Any]:
    return {"subtitle_languages": list(LANGUAGES), "quality_gates": {"title_max_chars": 60}}


@pytest.fixture
def repo_root() -> Path:
    return REPO_ROOT
```

- [ ] **Step 2: Write the failing tests**

`tests/test_reach_lint.py`:

```python
"""One passing and one failing case per rule in channel_os.reach.lint."""

from typing import Any

import pytest

from channel_os.reach.lint import Finding, lint_episode

Data = dict[str, Any]


def found(findings: list[Finding], rule: str) -> list[tuple[str, str]]:
    return [(finding.level, finding.where) for finding in findings if finding.rule == rule]


def test_valid_episode_has_no_findings(episode: Data, reach: Data) -> None:
    assert lint_episode(episode, reach) == []


def test_title_over_the_limit_is_an_error(episode: Data, reach: Data) -> None:
    episode["packaging"]["titles"][1] = "Idempotency " + "x" * 49
    assert found(lint_episode(episode, reach), "title-length") == [
        ("error", "packaging.titles[1]")
    ]


def test_title_limit_comes_from_the_reach_config(episode: Data, reach: Data) -> None:
    reach["quality_gates"]["title_max_chars"] = 20
    assert found(lint_episode(episode, reach), "title-length") == [
        ("error", "packaging.titles[0]"),
        ("error", "packaging.titles[1]"),
    ]


def test_blank_first_narration_is_an_error(episode: Data, reach: Data) -> None:
    episode["segments"][0]["narration"] = "   "
    assert found(lint_episode(episode, reach), "hook-present") == [("error", "s01")]


def test_blank_short_hook_is_an_error(episode: Data, reach: Data) -> None:
    episode["shorts"][1]["hook_on_screen"] = " "
    assert found(lint_episode(episode, reach), "hook-present") == [("error", "short-2")]


def test_emphasis_missing_from_narration_is_an_error(episode: Data, reach: Data) -> None:
    episode["segments"][1]["emphasis"] = ["Retry", "not there"]
    findings = [f for f in lint_episode(episode, reach) if f.rule == "emphasis-in-narration"]
    assert [(f.level, f.where) for f in findings] == [("error", "s02")]
    assert "not there" in findings[0].message


def test_phrases_match_across_line_breaks_and_case(episode: Data, reach: Data) -> None:
    episode["segments"][0]["narration"] = "Here is THE\n   retry that matters." + " filler" * 400
    episode["segments"][0]["emphasis"] = ["the retry"]
    findings = lint_episode(episode, reach)
    assert found(findings, "emphasis-in-narration") == []
    assert found(findings, "step-anchor") == []


def test_step_anchor_missing_from_narration_is_an_error(episode: Data, reach: Data) -> None:
    episode["segments"][0]["visual"]["steps"][1]["at"] = "never said"
    assert found(lint_episode(episode, reach), "step-anchor") == [
        ("error", "s01.visual.steps[1]")
    ]


def test_short_cut_from_an_unknown_segment_is_an_error(episode: Data, reach: Data) -> None:
    episode["shorts"][0]["segments"] = ["s02", "s99"]
    assert found(lint_episode(episode, reach), "short-source") == [("error", "short-1")]


def test_short_cut_from_no_segments_is_an_error(episode: Data, reach: Data) -> None:
    del episode["shorts"][0]["segments"]
    assert found(lint_episode(episode, reach), "short-source") == [("error", "short-1")]


@pytest.mark.parametrize("script", ["", "   ", None])
def test_standalone_short_without_a_script_is_an_error(
    episode: Data, reach: Data, script: str | None
) -> None:
    if script is None:
        del episode["shorts"][1]["script"]
    else:
        episode["shorts"][1]["script"] = script
    assert found(lint_episode(episode, reach), "short-source") == [("error", "short-2")]
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `uv run pytest tests/test_reach_lint.py -q`
Expected: collection error, `ModuleNotFoundError: No module named 'channel_os.reach.lint'`.

- [ ] **Step 4: Write the implementation**

`src/channel_os/reach/lint.py`:

```python
"""Mechanical content and reach rules that the episode schema cannot express.

Rule ids and levels follow docs/superpowers/specs/2026-10-09-m0-bootstrap-design.md.
Every rule assumes the episode already passed schemas/episode.schema.json.
"""

from collections.abc import Callable, Iterator, Mapping
from dataclasses import dataclass
from typing import Any, Literal

Level = Literal["error", "warning"]
Episode = Mapping[str, Any]
Reach = Mapping[str, Any]


@dataclass(frozen=True)
class Finding:
    """One rule violation in one place of an episode."""

    level: Level
    rule: str
    where: str
    message: str


def _norm(text: str) -> str:
    """Collapse whitespace and ignore case, as the caption aligner does."""
    return " ".join(text.split()).casefold()


def _title_length(episode: Episode, reach: Reach) -> Iterator[Finding]:
    limit = int(reach["quality_gates"]["title_max_chars"])
    for index, title in enumerate(episode["packaging"]["titles"]):
        if len(title) > limit:
            yield Finding(
                "error",
                "title-length",
                f"packaging.titles[{index}]",
                f"{len(title)} characters, limit is {limit}",
            )


def _hook_present(episode: Episode, reach: Reach) -> Iterator[Finding]:
    first = episode["segments"][0]
    if not first["narration"].strip():
        yield Finding("error", "hook-present", first["id"], "the first segment has no narration")
    for short in episode["shorts"]:
        if not short["hook_on_screen"].strip():
            yield Finding("error", "hook-present", short["id"], "hook_on_screen is blank")


def _emphasis_in_narration(episode: Episode, reach: Reach) -> Iterator[Finding]:
    for segment in episode["segments"]:
        narration = _norm(segment["narration"])
        for phrase in segment.get("emphasis", []):
            if _norm(phrase) not in narration:
                yield Finding(
                    "error",
                    "emphasis-in-narration",
                    segment["id"],
                    f'emphasis "{phrase}" is not in the narration',
                )


def _step_anchor(episode: Episode, reach: Reach) -> Iterator[Finding]:
    for segment in episode["segments"]:
        narration = _norm(segment["narration"])
        for index, step in enumerate(segment["visual"]["steps"]):
            anchor = step["at"]
            if anchor != "start" and _norm(anchor) not in narration:
                yield Finding(
                    "error",
                    "step-anchor",
                    f"{segment['id']}.visual.steps[{index}]",
                    f'at "{anchor}" is not in the narration',
                )


def _short_source(episode: Episode, reach: Reach) -> Iterator[Finding]:
    segment_ids = {segment["id"] for segment in episode["segments"]}
    for short in episode["shorts"]:
        if short["source"] == "segments":
            listed = short.get("segments", [])
            if not listed:
                yield Finding(
                    "error", "short-source", short["id"], "source is segments but none are listed"
                )
            for segment_id in listed:
                if segment_id not in segment_ids:
                    yield Finding(
                        "error", "short-source", short["id"], f"unknown segment {segment_id}"
                    )
        elif not str(short.get("script", "")).strip():
            yield Finding(
                "error", "short-source", short["id"], "source is standalone but script is blank"
            )


Rule = Callable[[Episode, Reach], Iterator[Finding]]

RULES: tuple[Rule, ...] = (
    _title_length,
    _hook_present,
    _emphasis_in_narration,
    _step_anchor,
    _short_source,
)


def lint_episode(episode: Episode, reach: Reach) -> list[Finding]:
    """Run every rule and return the findings in rule order."""
    return [finding for rule in RULES for finding in rule(episode, reach)]
```

- [ ] **Step 5: Run the checks to verify they pass**

Run: `uv run pytest tests/test_reach_lint.py -q`
Expected: 13 passed.

Run: `uv run ruff check` then `uv run mypy src`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/channel_os/reach/lint.py tests/conftest.py tests/test_reach_lint.py
git commit -m "feat: add reach lint with the always-error rules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Gate rules and warnings

**Files:**
- Modify: `src/channel_os/reach/lint.py`
- Test: `tests/test_reach_lint.py`

**Interfaces:**
- Consumes: `Finding`, `Episode`, `Reach`, `Level`, `_norm`, `RULES` from Task 2.
- Produces: five more rules in `RULES`. A gate rule yields `"warning"` when `episode["status"]` is `draft` or `archived` and `"error"` otherwise.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_reach_lint.py`:

```python
GATED_STATUSES = ["ready_to_render", "rendering", "rendered", "published"]
UNGATED_STATUSES = ["draft", "archived"]


@pytest.mark.parametrize("status", GATED_STATUSES)
def test_story_placeholder_blocks_every_status_after_draft(
    episode: Data, reach: Data, status: str
) -> None:
    episode["status"] = status
    episode["segments"][2]["narration"] += " [STORY:duplicate-callback]"
    assert found(lint_episode(episode, reach), "story-placeholder") == [("error", "s03")]


@pytest.mark.parametrize("status", UNGATED_STATUSES)
def test_story_placeholder_is_a_warning_before_the_gate(
    episode: Data, reach: Data, status: str
) -> None:
    episode["status"] = status
    episode["segments"][2]["narration"] += " [STORY:duplicate-callback]"
    assert found(lint_episode(episode, reach), "story-placeholder") == [("warning", "s03")]


def test_story_placeholder_in_a_short_script_is_found(episode: Data, reach: Data) -> None:
    episode["shorts"][1]["script"] = "[STORY:duplicate-callback] and then the rest."
    assert found(lint_episode(episode, reach), "story-placeholder") == [("error", "short-2")]


def test_missing_localizations_block_ready_to_render(episode: Data, reach: Data) -> None:
    del episode["localizations"]["vi"]
    episode["localizations"]["ar"]["title"] = None
    findings = [f for f in lint_episode(episode, reach) if f.rule == "localizations"]
    assert [(f.level, f.where, f.message) for f in findings] == [
        ("error", "localizations.vi", "missing title and description"),
        ("error", "localizations.ar", "missing title"),
    ]


def test_missing_localizations_are_warnings_on_a_draft(episode: Data, reach: Data) -> None:
    episode["status"] = "draft"
    del episode["localizations"]
    assert found(lint_episode(episode, reach), "localizations") == [
        ("warning", f"localizations.{language}")
        for language in ["hi", "es", "pt", "id", "vi", "ar"]
    ]


def test_hook_longer_than_six_words_is_a_warning(episode: Data, reach: Data) -> None:
    episode["shorts"][0]["hook_on_screen"] = "Which of these is safe to retry?"
    assert found(lint_episode(episode, reach), "hook-words") == [("warning", "short-1")]


def test_keyword_outside_the_first_40_characters_is_a_warning(
    episode: Data, reach: Data
) -> None:
    episode["packaging"]["titles"][0] = "Why Your Payment Got Charged Twice (Idempotency)"
    assert found(lint_episode(episode, reach), "keyword-position") == [
        ("warning", "packaging.titles[0]")
    ]


def test_narration_outside_the_word_range_is_a_warning(episode: Data, reach: Data) -> None:
    for segment in episode["segments"]:
        segment["narration"] = "Here is the retry that matters."
    findings = [f for f in lint_episode(episode, reach) if f.rule == "word-count"]
    assert [(f.level, f.where, f.message) for f in findings] == [
        ("warning", "segments", "narration is 18 words, target is 1100-2200")
    ]
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run pytest tests/test_reach_lint.py -q`
Expected: 13 passed, 12 failed (each new test gets `[]` instead of the expected findings).

- [ ] **Step 3: Write the implementation**

In `src/channel_os/reach/lint.py`, add the constants below the type aliases:

```python
HOOK_MAX_WORDS = 6  # docs/CAPTIONS_SPEC.md, hook card
KEYWORD_WINDOW_CHARS = 40  # docs/REACH_PLAYBOOK.md section 1
NARRATION_WORDS = (1100, 2200)  # docs/CONTENT_RULES.md section 4
STORY_PLACEHOLDER = "[STORY:"
UNGATED_STATUSES = frozenset({"draft", "archived"})
```

Add `_gate_level` below `_norm`:

```python
def _gate_level(episode: Episode) -> Level:
    """Gate rules block rendering, so they are only warnings while an episode is a draft."""
    return "warning" if episode["status"] in UNGATED_STATUSES else "error"
```

Add the five rules below `_short_source`:

```python
def _story_placeholder(episode: Episode, reach: Reach) -> Iterator[Finding]:
    level = _gate_level(episode)
    for segment in episode["segments"]:
        if STORY_PLACEHOLDER in segment["narration"]:
            yield Finding(
                level,
                "story-placeholder",
                segment["id"],
                "narration still holds a [STORY:...] placeholder",
            )
    for short in episode["shorts"]:
        if STORY_PLACEHOLDER in str(short.get("script", "")):
            yield Finding(
                level,
                "story-placeholder",
                short["id"],
                "script still holds a [STORY:...] placeholder",
            )


def _localizations(episode: Episode, reach: Reach) -> Iterator[Finding]:
    level = _gate_level(episode)
    localizations = episode.get("localizations", {})
    for language in reach["subtitle_languages"]:
        entry = localizations.get(language) or {}
        missing = [
            field for field in ("title", "description") if not str(entry.get(field) or "").strip()
        ]
        if missing:
            yield Finding(
                level,
                "localizations",
                f"localizations.{language}",
                f"missing {' and '.join(missing)}",
            )


def _hook_words(episode: Episode, reach: Reach) -> Iterator[Finding]:
    for short in episode["shorts"]:
        words = len(short["hook_on_screen"].split())
        if words > HOOK_MAX_WORDS:
            yield Finding(
                "warning",
                "hook-words",
                short["id"],
                f"hook_on_screen has {words} words, limit is {HOOK_MAX_WORDS}",
            )


def _keyword_position(episode: Episode, reach: Reach) -> Iterator[Finding]:
    primary = episode["keywords"]["primary"]
    keyword = _norm(primary)
    for index, title in enumerate(episode["packaging"]["titles"]):
        if keyword not in _norm(title[:KEYWORD_WINDOW_CHARS]):
            yield Finding(
                "warning",
                "keyword-position",
                f"packaging.titles[{index}]",
                f'"{primary}" is not within the first {KEYWORD_WINDOW_CHARS} characters',
            )


def _word_count(episode: Episode, reach: Reach) -> Iterator[Finding]:
    low, high = NARRATION_WORDS
    total = sum(len(segment["narration"].split()) for segment in episode["segments"])
    if not low <= total <= high:
        yield Finding(
            "warning",
            "word-count",
            "segments",
            f"narration is {total} words, target is {low}-{high}",
        )
```

Replace `RULES` with:

```python
RULES: tuple[Rule, ...] = (
    _title_length,
    _hook_present,
    _emphasis_in_narration,
    _step_anchor,
    _short_source,
    _story_placeholder,
    _localizations,
    _hook_words,
    _keyword_position,
    _word_count,
)
```

- [ ] **Step 4: Run the checks to verify they pass**

Run: `uv run pytest tests/test_reach_lint.py -q`
Expected: 25 passed.

Run: `uv run ruff check` then `uv run mypy src`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/channel_os/reach/lint.py tests/test_reach_lint.py
git commit -m "feat: add ready_to_render gate rules and reach warnings" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The `validate` CLI

**Files:**
- Create: `src/channel_os/validate.py`
- Test: `tests/test_validate.py`

**Interfaces:**
- Consumes: `Finding` and `lint_episode` from `channel_os.reach.lint`; fixtures `episode` and `repo_root`.
- Produces: `main(argv: Sequence[str] | None = None) -> int`, run as `python -m channel_os.validate [--root DIR] PATH [PATH ...]`. Exit 0 = no errors, 1 = errors, 2 = unreadable input.

- [ ] **Step 1: Write the failing tests**

`tests/test_validate.py`:

```python
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run pytest tests/test_validate.py -q`
Expected: collection error, `ModuleNotFoundError: No module named 'channel_os.validate'`.

- [ ] **Step 3: Write the implementation**

`src/channel_os/validate.py`:

```python
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
```

- [ ] **Step 4: Run the checks to verify they pass**

Run: `uv run pytest -q`
Expected: 56 passed (21 skeleton + 25 lint + 10 validate).

Run: `uv run ruff check` then `uv run mypy src`
Expected: both clean.

Run: `uv run python -m channel_os.validate content/episodes/001-idempotency/episode.yaml`
Expected: warnings only, last line `1 file(s) checked: 0 error(s), N warning(s)`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/channel_os/validate.py tests/test_validate.py
git commit -m "feat: add the episode validator CLI" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: CI workflow and docs

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `CLAUDE.md` (§5 layout block), `README.md` (new "Develop" section)

**Interfaces:**
- Consumes: the `uv run` commands from Tasks 1-4.
- Produces: the `check` and `samples` jobs that later milestones extend.

- [ ] **Step 1: Write the workflow**

`.github/workflows/ci.yml`:

```yaml
name: ci

on:
  push:
  pull_request:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.event_name }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  check:
    name: lint, types, tests, episodes
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v7
      # setup-uv publishes no floating major tag, so pin the release commit.
      - uses: astral-sh/setup-uv@c18668ad3cf93ea998bef934396af7bb5c839dc7 # v10.2.0
        with:
          enable-cache: true
      - name: Install
        run: uv sync --locked
      - name: Lint
        run: uv run ruff check
      - name: Types
        run: uv run mypy src
      - name: Tests
        run: uv run pytest
      - name: Validate every episode
        run: uv run python -m channel_os.validate content/episodes/*/episode.yaml

  samples:
    name: code samples compile
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-go@v7
        with:
          go-version: stable
          cache: false
      - name: Vet and build every Go sample
        run: |
          set -euo pipefail
          count=0
          while IFS= read -r mod; do
            dir=$(dirname "$mod")
            echo "::group::$dir"
            (cd "$dir" && go vet ./... && go build ./...)
            echo "::endgroup::"
            count=$((count + 1))
          done < <(find content/episodes -name go.mod)
          echo "checked $count Go module(s)"
```

- [ ] **Step 2: Update the docs**

In `CLAUDE.md` §5, inside the `src/channel_os/` block, add these two lines after the `report/` line:

```text
  reach/           lint.py (mechanical content + reach rules, run by validate)
  validate.py      CLI: python -m channel_os.validate <episode.yaml> (schema + reach lint)
```

In `README.md`, add this section before `## Map`:

````markdown
## Develop

```bash
uv sync
uv run pytest && uv run ruff check && uv run mypy src
uv run python -m channel_os.validate content/episodes/001-idempotency/episode.yaml
```

`uv sync` installs Python 3.12 and the locked dependencies. The validator exits 0 when an episode
has no errors; warnings do not fail it.
````

- [ ] **Step 3: Run the full local check**

Run: `uv run pytest -q` then `uv run ruff check` then `uv run mypy src`
Expected: 56 passed; both linters clean.

- [ ] **Step 4: Commit and push the branch**

```bash
git add .github/workflows/ci.yml CLAUDE.md README.md
git commit -m "ci: add lint, type, test, episode and sample checks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin m0-bootstrap
```

- [ ] **Step 5: Verify CI is green on GitHub**

Open `https://github.com/Nakshatra6350/stacknova-pipeline/actions` and wait for the `ci` run on
`m0-bootstrap`.
Expected: both jobs (`lint, types, tests, episodes` and `code samples compile`) succeed.
If a job fails, read its log, fix the cause with a failing test first where code is involved, and push again.

---

## Acceptance (from `docs/BUILD_PLAN.md` M0)

- [ ] `uv run pytest` passes
- [ ] `uv run ruff check` and `uv run mypy src` pass
- [ ] `ci.yml` is green on GitHub
- [ ] `content/episodes/001-idempotency/episode.yaml` validates (exit 0)
