# M1 — Voice: design

Approved by the owner on 9 October 2026. Source: `docs/BUILD_PLAN.md` M1.

## Goal

Narration in the owner's cloned voice, produced by a GitHub Action from `episode.yaml`, at
broadcast loudness, with per-segment timing that later milestones build on.

## Acceptance

- The `render` workflow produces `voice/<target>/seg-*.wav` and `narration.wav` for the standalone
  Short `short-1` of episode 001.
- Narration loudness is -14 LUFS +/- 1 and true peak is at or below -1 dBTP.
- Per-segment durations are written to `timing.json`.
- `uv run pytest`, `uv run ruff check`, `uv run mypy src` pass and `ci.yml` is green.
- The owner listens to the sample and accepts the voice.

## Facts this design rests on (checked 9 October 2026)

- `chatterbox-tts` 0.1.7 supports Python 3.12 and pins `torch==2.6.0`; with the PyTorch CPU index
  the lock holds no GPU packages.
- The released library (0.1.7) has two English models: original (500M) and Turbo (350M). A
  smaller Nano model exists only in unreleased code on GitHub and is not used.
- It builds its voice prompt from the first 6-15 s of the reference, does not trim silence, and
  rejects references under 5 s (Turbo). One call yields at most about 40 s of speech.
- Its watermarker (resemble-perth 1.0.1) imports `pkg_resources`, which setuptools dropped in
  version 81, so the voice group pins `setuptools<81`.
- `gh api` cannot download binary files; the workflow fetches the reference with `curl`.
- Every output carries the Perth watermark.
- The owner's reference is 48 s, 44.1 kHz, dual-mono, -30 LUFS, peaks at -13 dBFS, with
  noise-suppressed (digitally silent) pauses.
- A single two-pass `loudnorm` cannot bring high-crest speech to -14 LUFS under a -1 dBTP ceiling;
  on the owner's clip it stopped at -15.2 LUFS.
- `ubuntu-24.04` runners have the GitHub CLI but not ffmpeg.

## Components

| Module | Does | Depends on |
|---|---|---|
| `voice/settings.py` | Loads `config/voice.yaml` into frozen dataclasses | PyYAML |
| `assemble/ffmpeg.py` | Runs ffmpeg, returns its report, raises on failure | ffmpeg on PATH |
| `voice/wavio.py` | Sample-exact WAV duration and concatenation with gaps | standard library |
| `voice/chunking.py` | Packs whole sentences into chunks of at most `max_chunk_chars` | — |
| `voice/loudness.py` | Measures loudness; normalises to target (limiter when needed, then two-pass loudnorm) | `assemble/ffmpeg.py` |
| `voice/reference.py` | Makes a working copy of the reference: mono, silence trimmed, pauses shortened, level set | loudness, wavio |
| `voice/tts.py` | `Synthesizer` protocol, cache key, and the chatterbox adapter (lazy imports) | chatterbox-tts (render job only) |
| `voice/narrate.py` | Units -> cached chunks -> segment WAVs -> narration + timing entry | all of the above |
| `render.py` | CLI: validate, gate on status, run the voice stage | `validate.py`, narrate |

Tests use a fake synthesizer that writes tones, so they need ffmpeg but no model and no network.
The chatterbox adapter is about 40 lines and is exercised by the workflow run, not by unit tests.

## Behaviour

**Targets.** `--only long` renders every segment. `--only short-N` renders a standalone Short's
script as one unit, or a cut Short's listed segments. `--only all` renders the long video and
every Short. Each target gets `voice/<target>/`.

**Chunks and cache.** A unit's text is packed into chunks of whole sentences. Each chunk is
synthesised once and stored as `<sha256(identity + text)>.wav`, where identity covers the
library version, model, seed, sampling settings and the hash of the prepared reference. The
seed is reset before every chunk, so a chunk's audio does not depend on render order.

**Loudness.** Each segment is normalised on its own, because Shorts are cut from segments. If
plain gain would push peaks past the ceiling, a limiter is applied first; two-pass `loudnorm`
then sets the level. The internal ceiling is -1.5 dBTP so rounding never crosses -1. After
concatenation the narration is measured again; outside -14 +/- 1 LUFS or above -1 dBTP the
render fails.

**Timing.** `timing.json` holds one entry per target: narration path, duration, pause length,
model, measured loudness, and each segment's file, start and duration.

**Status gate.** An episode with validation errors never renders. A status other than
`ready_to_render` is skipped unless `--allow-draft` is passed.

## Workflow `render.yml`

- Triggers: push to `main` touching `content/episodes/*/episode.yaml`, and manual dispatch with
  `episode`, `only`, `models` and `allow_draft`. Never on pull requests.
- Runner `ubuntu-24.04`; every action pinned to a commit; `permissions: contents: write` only.
- The reference is downloaded with `CONTENT_REPO_TOKEN` to the runner's temp folder, outside the
  workspace.
- Model weights (public) use the Actions cache. Synthesised audio does not: the chunk cache
  travels as `voice-cache.tar` inside the draft Release `ep-<id>`.
- Uploads per model: one narration WAV per target and one zip with segments and `timing.json`,
  all to the draft Release. Nothing audible goes to logs, the job summary or artifacts.
- Inputs reach the shell only through environment variables, and the episode id is checked
  against the id pattern before use.

Because manual dispatch only works for workflows present on the default branch, a stub
`render.yml` with no permissions and no secrets is pushed to `main` first; runs then use the
branch's version through `--ref`.

## Changes to earlier docs

- `docs/BUILD_PLAN.md` M1: the synthesis cache lives in the draft Release, not `actions/cache`.
- `CLAUDE.md` §5: the new voice modules, `render.py` and `config/voice.yaml`.
- `ci.yml`: installs ffmpeg for the audio tests.

## Out of scope

Pronunciation overrides for technical terms, multi-language voices, splitting long renders
across a job matrix, the `long` render of episode 001 (it is still a draft), and anything that
sends audio outside the draft Release.
