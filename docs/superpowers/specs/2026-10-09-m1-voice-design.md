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
model, measured loudness, and each segment's file, start and duration. Since M2 each segment
also has its `pauses`, and since 14 October 2026 its `words`: `[offset, start, end]` for each
script word the recogniser heard in the finished segment, the offset counted in the segment's
text with whitespace collapsed. Captions and scene steps are timed from `words`; `pauses` are
the fallback for a narration rendered with `--no-listen`. What was heard is cached under the
segment file's content, so a Short cut from the long video is not heard twice.

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

## Pace and clarity (added after the owner's first listening)

`voice/polish.py` applies an optional time-stretch (`tempo`) and a gentle EQ (`clarity`) to the
raw speech before loudness. Neither is part of the chunk cache key, so changing them reuses the
cached speech. Any setting can be overridden for one run (`--set KEY=VALUE`; workflow inputs
`settings` and `label`), which is how tuning variants are rendered without commits.

The owner's approved voice, 9 October 2026: original model, `tempo: 0.92`, clarity with an 80 Hz
high-pass, +2.5 dB at 3 kHz and +2 dB above 7 kHz. A test pins these values.

## Listening and reading again (added 13 October 2026)

The owner heard "retries" said as "retrees" and "PUT" as "patt" in episode 001. Speech
recognition run over that narration found more than the two words: "retry" is said as
"re-tree" throughout, two phrases are garbled, and one sentence of segment s06 is never spoken
(the stall that `max_pause_ms` had cut down to a pause). So "pronunciation overrides", listed
as out of scope below, came into scope, together with a check that does the listening.

- **Lexicon** (`config/pronunciation.yaml`, `voice/lexicon.py`). `say` maps a written word to a
  spelling the model reads correctly (`PUT: put`), or to a list of spellings, the best first
  (`retry: [re try, ree try, re-try]`). It is applied to each chunk after chunking, so chunk
  boundaries do not move, and only to the text sent to the model: scripts, captions and the
  timing of visuals keep the written form. A lowercase key matches any casing; a key with a
  capital matches only as written. A hyphen was not enough for "retry": written "re-try" it
  was still heard wrong in 7 of the 19 chunks that hold the word, so the spellings that make
  "try" a word of its own come first.
- **Listening** (`voice/listen.py`). Every synthesised chunk is transcribed with faster-whisper
  (`small.en`, the recogniser M3 uses for alignment) and lined up with the chunk's script.
  `missed` tells a real miss from what only the recogniser changed: numbers as digits,
  contractions, words joined or split, endings, homophones, and the jargon in `terms`, which
  only has to sound close ("idempotency" is written down as "item potency"). The recogniser
  gets no hints: given the jargon as hot words it wrote those words into silences.
- **Reading again** (`voice/narrate.py`). A chunk with misses is read again as a whole, up to
  four readings in all, each with another seed (seed+1, seed+2, seed+3) and, for a word with
  several spellings in the lexicon, the next spelling. The reading with the least missed is
  kept. Reading stops early when two readings running miss exactly the same thing and every
  spelling has had its turn: that is the model's habit or the recogniser's, not chance. A
  chunk that loses a phrase in every reading (four words running, or a fifth of its words) is
  spoken sentence by sentence, which is how the model says a sentence it skips inside a long
  chunk. A sentence that still loses a phrase raises `PronunciationError` and the render
  stops: a narration with a hole in it is not shipped.
- **Why whole chunks, measured on episode 001 (13 October 2026).** Reading only the sentences
  of a chunk with a miss looked cheaper and was tried. It was not: 15 such chunks took 85
  minutes, 5.7 minutes each, against 1.2 minutes for one reading of a whole chunk (53 readings
  in 62 minutes the run before), so three or four whole readings cost what one pass of
  sentences did. Each call costs about 24 seconds more than its speech (fitted over the 115
  sentence readings), and a short sentence given alone is where the model rambles or garbles
  ("Recap" came out as something else). It was also worse: 8 places not confirmed against 5.
  Sentences are therefore the last resort, for a lost phrase only.
- **The log.** The voice model draws a progress bar for every chunk ("Sampling", counting to
  1000, its upper limit; a chunk ends near 300 to 450). That was 13,966 of the 14,978 lines of
  one render's log, and it looked like a render starting over. `TQDM_DISABLE` switches it off
  in the workflow, and the render prints one line per reading: said as written, or what was
  meant and what was heard, and which reading is kept.
- **What a render costs.** The model's work grows with the speech it makes: 5 to 9 seconds
  for each second of speech, because runners differ (the same kind of reading took 73 s on one
  runner and 125 s on another, a day apart). A whole chunk is about 14 seconds of speech, so 1.2
  to 2.1 minutes. A new episode the length of 001 (34 chunks) is 40 to 70 minutes for the first
  readings, plus the readings done again (21 for 001, the second time it was rendered); a
  render whose speech is cached takes under 3 minutes. The way to cut the first render's
  wall-clock time is to split chunks across a job matrix (still out of scope).
- **What the owner sees.** Each segment in `timing.json` records `retakes` and `unsure` (what
  was meant and what was heard, for misses too small to stop the render), and the workflow
  summary lists them, so a reviewer knows where to listen.
- **Cache.** Take 0 keeps the chunk's old cache name, so speech that was right is not
  synthesised again; other takes add `|take=N` to the key, and a reading in another spelling
  has its own key because the text differs. A sentence read on its own is cached the same way,
  under its own text. What was heard is stored beside each reading. The cache is uploaded even
  when the render fails. `--no-listen` skips the check.

Limits, said plainly: speech recognition is not an ear. It can miss a word that is said
slightly wrong and it can flag one that is fine, so the owner's listen on Telegram stays the
last check, and a word they hear wrong goes into `config/pronunciation.yaml`.

## Changes to earlier docs

- `docs/BUILD_PLAN.md` M1: the synthesis cache lives in the draft Release, not `actions/cache`.
- `CLAUDE.md` §5: the new voice modules, `render.py` and `config/voice.yaml`.
- `ci.yml`: installs ffmpeg for the audio tests.

## Out of scope

Pronunciation overrides for technical terms (in scope since 13 October 2026, see "Listening
and reading again" above), multi-language voices, splitting long renders
across a job matrix, the `long` render of episode 001 (it is still a draft), and anything that
sends audio outside the draft Release.
