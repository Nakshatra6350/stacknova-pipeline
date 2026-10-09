# Captions spec

Two caption products, both generated from the **known script text** (never from raw ASR output,
which mangles terms like "goroutine", "Kafka", "MVCC").

## A. Burned-in captions — Shorts, Reels, carousel videos

Purpose: most short-form viewers watch muted; captions carry the hook and retention.

**Alignment**
1. Run faster-whisper (`small.en`, `word_timestamps=True`, `vad_filter=True`) on the narration WAV.
2. Align ASR words to script words with a token-level edit-distance alignment (normalize case/punctuation; treat code identifiers as single tokens; map "go routine(s)" → "goroutine(s)" etc. via `config/reach.yaml: asr_fixups`).
3. Script words without a matched ASR word get interpolated times between neighbours.
4. Output `captions/words.json`: `[{"w": "Your", "start": 0.12, "end": 0.31}, …]`. Unit-test: monotonic, no gaps > 1.2 s inside a sentence, every script word present.

**Grouping**
- 1–3 words per caption chunk (max 16 characters per line, 1 line; 2 lines only for code identifiers longer than 16 chars).
- Break at punctuation first, then before conjunctions/prepositions, never inside a code identifier or number+unit.
- Minimum chunk on screen 0.35 s; merge shorter chunks with the next.

**Look (1080×1920)**
- Font: Inter ExtraBold (fallback DejaVu Sans Bold), 86 px, white `#FFFFFF`, 8 px black outline, soft shadow.
- Active word highlighted in the brand accent (`config/brand.yaml: accent`) and scaled 108 % — ASS `\t` transform + karaoke `\kf` timing.
- Code identifiers rendered in the monospace brand font with a subtle pill background.
- Position: centre-x, baseline at y = 1180 (inside the safe zone). **Safe zone**: keep all text out of the top 260 px and bottom 480 px (platform UI) and 60 px side margins.
- Emphasis words (listed per segment in `episode.yaml: segments[].emphasis`) → accent colour + 1-frame pop.

**Hook card**
- Frame 1 shows `episode.short_hooks[n].on_screen` (≤ 6 words, 110 px, top third inside safe zone) for the first 2.0 s, then hands over to running captions.

**Render**: generate `.ass` → `ffmpeg -vf "ass=captions.ass"`; verify with a snapshot test (render frames at 3 timestamps, compare against golden PNGs with tolerance).

## B. Subtitle tracks — long videos (and also uploaded for Shorts)

- `en.srt`: sentence-level cues, ≤ 42 chars per line, ≤ 2 lines, 1–7 s per cue, from the aligned words.
- Translated tracks for languages in `config/reach.yaml: subtitle_languages`. Translation is done by the night agent at script time (stored in `episode.yaml: localizations`) — technical terms stay in English (e.g. "idempotency key", "goroutine").
- Upload via `captions.insert` (YouTube) after the video is public or scheduled.
- Localized **title + description** per language via `videos.update(localizations=…)` with `snippet.defaultLanguage = "en"`.
- Long videos also get on-screen **key-term labels** (not full captions): every new term appears as a lower-third label for 3 s the first time it's spoken.

## Acceptance tests
- Every script word appears in exactly one caption chunk, in order.
- No caption overlaps the safe-zone boundaries (check bounding boxes from libass render).
- SRT passes a validator (sequential indices, non-overlapping cues, ≤ 42 chars/line).
- Golden-frame snapshot test passes for `tests/fixtures/sample_short`.
