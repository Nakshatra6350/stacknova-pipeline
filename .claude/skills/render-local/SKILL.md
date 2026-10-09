---
name: render-local
description: Render an episode or a single asset (long video, a Short, a Reel, carousel, thumbnail) locally on the owner's machine for preview, without publishing or touching approval state. Use when asked to preview, test-render, or check how an episode looks.
---

# Render locally

1. Confirm the pipeline milestones needed exist (M1 voice, M2 scenes, M3 assembly). If not, say which milestone is missing and stop.
2. Check prerequisites: Python 3.12 + uv, ffmpeg on PATH, a local voice reference at
   `.local/voice/reference.wav` (never commit it; it's in .gitignore via `*.wav`). If missing, ask the owner.
3. Run with `DRY_RUN=true` always:
   `uv run python -m channel_os.render --episode <id> --only <asset> --out out/<id>`
4. Open/inspect results: report durations, file sizes, and grab 3 frames per video
   (`ffmpeg -ss <t> -i file -frames:v 1 frame.png`) to check captions are inside the safe zone
   (`docs/CAPTIONS_SPEC.md`).
5. Never upload, never send Telegram messages (unless the owner explicitly asks for a test notify), never change `state/`.
