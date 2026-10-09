# M0 — Bootstrap: design

Approved by the owner on 9 October 2026. Source: `docs/BUILD_PLAN.md` M0.

## Goal

A repo that installs with one command, has an importable package skeleton, can tell whether an
`episode.yaml` is valid, and proves all of that on every push. No rendering, no API calls,
nothing that touches `state/`.

## Acceptance

- `uv run pytest`, `uv run ruff check` and `uv run mypy src` pass locally.
- `ci.yml` is green on GitHub.
- `uv run python -m channel_os.validate content/episodes/001-idempotency/episode.yaml` exits 0.

## Approach

`schemas/episode.schema.json` stays the single contract between the night agent and the
renderer. `validate.py` checks an episode against it with the `jsonschema` library. Rules the
schema cannot express live in `reach/lint.py` as plain functions that return findings.

Rejected: pydantic models as the source of truth. They give stronger typing, but they would
replace the schema file the docs name as the contract, or sit beside it and drift. Typed
accessors can be added in M1/M2 when code first consumes segments.

## Components

### `channel_os.validate` (CLI)

`python -m channel_os.validate [--root DIR] PATH [PATH ...]`

- `--root` is the repo root holding `schemas/` and `config/`; it defaults to the current directory.
- For each path: parse the YAML, validate against the schema, and only if the schema passes, run
  the lint rules. Lint assumes the shape the schema guarantees.
- Prints one line per finding: `<path>: <level> [<rule>] <where>: <message>`, then a summary line.
- Exit code 0 when there are no errors (warnings allowed), 1 when any file has an error,
  2 when a file, the schema or the config cannot be read.

### `channel_os.reach.lint`

`lint_episode(episode, reach) -> list[Finding]`, where `reach` is the parsed `config/reach.yaml`
and `Finding` is a frozen dataclass: `level` (`error` or `warning`), `rule`, `where`, `message`.

Phrases are compared after collapsing whitespace and ignoring case, because the caption aligner
normalises the same way (`docs/CAPTIONS_SPEC.md`).

| Rule id | Level | Check |
|---|---|---|
| `title-length` | error | every `packaging.titles[]` is at most `quality_gates.title_max_chars` characters |
| `hook-present` | error | the first segment has narration, and every Short has a non-blank `hook_on_screen` |
| `emphasis-in-narration` | error | every `segments[].emphasis[]` phrase occurs in that segment's narration |
| `step-anchor` | error | every `visual.steps[].at` is `start` or occurs in that segment's narration |
| `short-source` | error | `source: segments` lists at least one id and every id is a real segment; `source: standalone` has a non-blank `script` |
| `story-placeholder` | gate | no narration or Short script contains `[STORY:` |
| `localizations` | gate | every language in `subtitle_languages` has a non-blank `title` and `description` |
| `hook-words` | warning | `hook_on_screen` is at most 6 words (`docs/CAPTIONS_SPEC.md`) |
| `keyword-position` | warning | `keywords.primary` lies entirely inside the first 40 characters of each title |
| `word-count` | warning | narration summed over all segments is 1,100–2,200 words (`docs/CONTENT_RULES.md` §4) |

A **gate** rule is an error for every status except `draft` and `archived`, and a warning for
those two. This is what lets episode 001 validate as a draft while still showing what blocks
`ready_to_render`.

### Package skeleton

`src/channel_os/` with the layout of `CLAUDE.md` §5. Every module below exists with a docstring
stating its purpose and the milestone that implements it, and nothing else:

`voice/{tts,loudness}`, `scenes/{theme,components}`, `assemble/{timeline,ffmpeg,cuts,thumbnails,carousel}`,
`captions/{align,ass,srt}`, `publish/{youtube,instagram,pages_host}`, `telegram/{bot,approvals}`,
`state/queue`, `report/weekly`.

`reach/lint` and `validate` are the two modules with real code. They are not in `CLAUDE.md` §5
but are named by `docs/BUILD_PLAN.md` and `docs/REACH_PLAYBOOK.md`; §5 gets the two lines added.

### Tooling

- `pyproject.toml`: Python `>=3.12,<3.13`, runtime dependencies `jsonschema` and `pyyaml`, a `dev`
  dependency group (`pytest`, `ruff`, `mypy`, type stubs), `hatchling` build with the `src` layout.
  Heavy dependencies (torch, chatterbox, manim) arrive with their milestones as separate groups.
- `uv.lock` committed; `.python-version` set to `3.12`.
- `ruff`: line length 100, rules `E,F,I,B,UP,SIM,RUF`; excludes `.claude/` (vendored skills) and
  `brand-assets/` (design scripts maintained outside the pipeline).
- `mypy --strict` on `src/`.
- `.gitattributes`: `* text=auto eol=lf`, so scripts and vendored skills stay LF on Windows clones.

### `ci.yml`

Triggers on push and pull request, `permissions: contents: read`, no secrets.

- `check`: `uv sync --locked`, `ruff check`, `mypy src`, `pytest`, then validate every
  `content/episodes/*/episode.yaml`.
- `samples`: for every `go.mod` under `content/episodes/`, run `go vet` and `go build`
  (`docs/CONTENT_RULES.md` §2: every sample must compile in CI).

## Error handling

Unreadable or non-mapping YAML, a missing schema or a missing config file are reported on stderr
and exit 2; they are operator errors, not episode findings. Schema violations become `error`
findings with rule `schema` and the JSON path as `where`.

## Testing

- `test_reach_lint.py`: one passing and one failing case per rule, built by mutating a minimal
  valid episode dict; gate rules tested for `draft` and `ready_to_render`.
- `test_validate.py`: the CLI on temp files for exit codes 0, 1 and 2, the output format, and
  the real episode 001 exiting 0.
- `test_skeleton.py`: every skeleton module imports and has a docstring.

## Out of scope

Rendering, voice, scenes, captions, any external API, `state/`, fixing episode 001's content
warnings (that is `write-episode` work), and the code-sample existence check.
