---
name: render-local
description: Render an episode or a single asset (long video, a Short, a Reel, carousel, thumbnail) locally on the owner's machine for preview, without publishing or touching approval state. Use when asked to preview, test-render, or check how an episode looks.
---

# Render locally

1. Confirm the pipeline milestones needed exist (M1 voice, M2 scenes, M3 assembly). If not, say which milestone is missing and stop.
2. Check prerequisites: Python 3.12 + uv, ffmpeg on PATH, and Chrome or Edge installed (scenes
   are drawn in it, headless; nothing is downloaded).
3. **Voice** runs on GitHub (the cloned-voice model is too heavy for the owner's PC and its
   dependency group conflicts with the scenes group). Get the narration from the draft Release
   instead of rendering it:
   `gh release download ep-<id> --pattern "voice.<target>.*.zip" --dir out/<id>` and unzip it
   into `out/<id>/` (it holds `timing.json` and `voice/`). If there is none, run the `render`
   workflow for that target first (`gh workflow run render.yml -f episode=<id> -f only=<target>`).
4. **Scenes** (picture + that narration), from the repo root:
   `uv run --group scenes python -m channel_os.render --episode <id> --stage scenes --only <target> --allow-draft`
   writes `out/<id>/preview/<target>.mp4`. `--quality 0.5` is a quick half-size look,
   `--format landscape|portrait` shows the other format, `--theme control|nova` the other look,
   `--intro-sound <file>` lays a sound under the logo intro of a long video.
   Expect about ten frames a second at full size with `--jobs 2`: a Short in a minute or two,
   a seven-minute long video in about twenty. The owner's PC has little free disk and 16 GB of
   memory: check free space first and use at most `--jobs 2`. **Do not edit anything under
   `src/channel_os/scenes/`, `config/` or the episode while a render runs**: each scene is
   drawn by a fresh process that reads those files anew, so an edit changes the scenes not yet
   drawn. When only the result matters, download `preview.<target>.mp4` from the draft Release
   instead of rendering.
5. Inspect results: report durations and frame counts, and grab frames across the whole
   timeline (`ffmpeg -ss <t> -i file -frames:v 1 frame.png`), not just the start. The render
   itself fails, with the reason, when a block leaves the content area, a panel holds more
   than fits, or a caption is too long for its bar; from M3 on also check that burned-in
   captions are inside the safe zone (`docs/CAPTIONS_SPEC.md`).
6. Never upload, never send Telegram messages (unless the owner explicitly asks for a test notify), never change `state/`. Rendered media stays in `out/` (gitignored) and draft Releases.
