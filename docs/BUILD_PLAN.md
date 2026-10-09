# Build plan for Claude Code

Build in this order. Each milestone has: goal, files, acceptance checks, and the exact prompt
to paste into Claude Code. Start every session in this repo's root so Claude Code loads `CLAUDE.md`.

> Tip for the owner: for each milestone, first press **Shift+Tab** to enter plan mode, paste
> the prompt, read the plan, then let it build. Commit after each milestone passes.

---

## M0 — Bootstrap (½ day)
**Goal:** repo skeleton, tooling, CI, schema validation.
**Acceptance:** `uv run pytest` passes; `ci.yml` green on GitHub; `content/episodes/001-idempotency/episode.yaml` validates against `schemas/episode.schema.json`.

```text
Read CLAUDE.md and docs/ARCHITECTURE.md. Implement milestone M0 from docs/BUILD_PLAN.md:
create pyproject.toml (Python 3.12, uv), the src/channel_os package layout from CLAUDE.md §5
with empty modules and docstrings, a validate_episode CLI (python -m channel_os.validate <path>)
that checks episode.yaml against schemas/episode.schema.json and runs reach/lint.py rules that
are mechanical (title length, hook present, emphasis words exist in text), pytest + ruff + mypy
config, and .github/workflows/ci.yml running lint, types, tests and validation of every
content/episodes/*/episode.yaml. Do not implement rendering yet.
```

## M1 — Voice (1 day)
**Goal:** narration in the owner's cloned voice.
**Files:** `voice/tts.py`, `voice/loudness.py`, `render.yml` (voice job).
**Acceptance:** Action renders `out/001-idempotency/voice/seg-*.wav` + `narration.wav` for the short script; loudness −14 LUFS ±1, true peak ≤ −1 dBTP; per-segment durations written to `out/<id>/timing.json`.

```text
Implement M1 from docs/BUILD_PLAN.md. Use chatterbox-tts on CPU. The reference voice clip is
fetched at runtime from the private content repo (path voice/reference.wav) using the
CONTENT_REPO_TOKEN secret — never commit it. Synthesize each segment of episode.yaml separately
(segments[].narration), cache by sha256(text+voice+model version) inside the draft Release
(never actions/cache: the repo is public), normalize
loudness with ffmpeg loudnorm two-pass to -14 LUFS, concatenate with 250 ms pauses between
segments, and write timing.json. Add a render.yml job that runs on push when an episode.yaml has
status ready_to_render, with a 'only' input to render just the short or long. Add tests that mock
the TTS model.
```

## M2 — Scenes (2 days)
**Goal:** Manim theme + reusable components; one scene per segment, timed to narration.
**Acceptance:** `long.mp4` (1920×1080, 30 fps) and a 1080×1920 variant for shorts render for episode 001; each scene's duration = its segment audio ± 1 frame; dark theme from `config/brand.yaml`.

```text
Implement M2. Create src/channel_os/scenes/theme.py (colours/fonts from config/brand.yaml),
components (Box, Arrow, Lane, Timeline, CodeBlock with line highlight, Callout, KeyTermLabel),
and a SceneSpec renderer that turns episode.yaml segments[].visual (a small declarative DSL
described in schemas/episode.schema.json) into Manim scenes. Scenes must accept a target
duration and stretch waits to match timing.json. Support both 16:9 and 9:16 layouts from the same
spec. Render episode 001 segments in render.yml.
```

## M3 — Assembly, captions, thumbnails, carousels (2 days)
**Goal:** final files ready to post.
**Acceptance:** `long.mp4`, `short-1..3.mp4`, `reel-1..3.mp4`, `carousel-1/01..10.jpg`, `thumb-a/b/c.jpg`, `en.srt`, translated `.srt`, `manifest.json`; captions meet every test in docs/CAPTIONS_SPEC.md; encode H.264 high, AAC 192k, faststart.

```text
Implement M3 following docs/CAPTIONS_SPEC.md exactly (alignment, grouping, look, safe zone,
hook card, SRT rules, acceptance tests). Cut shorts using episode.yaml shorts[] (each lists the
segment ids or a standalone script). Reels = shorts with IG-specific end card. Build thumbnails
and carousel slides from HTML templates rendered with Playwright (Chromium is available on
runners), text from episode.yaml packaging. Write manifest.json listing every asset with path,
duration, size, sha256 and the target platforms. Upload outputs as a draft GitHub Release ep-<id>
(never as workflow artifacts — see docs/ARCHITECTURE.md).
```

## M4 — Telegram + approval state machine (1 day)
**Acceptance:** after a render, the owner receives each asset per docs/APPROVAL_FLOW.md; tapping Approve/Reject updates `state/queue.json` within 10 min; only TELEGRAM_CHAT_ID is honoured; unit tests cover every allowed/forbidden transition.

```text
Implement M4 per docs/APPROVAL_FLOW.md: state/queue.py (state machine + optimistic-concurrency
writes to branch 'state' via GitHub contents API), telegram/bot.py (send previews: video, media
group, photo+link; inline keyboard; force_reply for reject reasons), notify.yml and
watch-approvals.yml (cron */10, concurrency group 'state'). Ignore updates from any other chat id.
```

## M5 — YouTube publishing (1 day)
**Acceptance:** dry-run prints exact API requests; real run uploads long video as private at render time, and on approval sets public or `publishAt`; uploads `en.srt` + translations; sets localizations, tags, category 27 (Education), `containsSyntheticMedia=true`, `selfDeclaredMadeForKids=false`; thumbnail A; adds to the pillar playlist. If the project is unaudited and the privacy change fails → Telegram "tap to make public" + state `published_manual_pending`.

```text
Implement M5 (publish/youtube.py + publish.yml) using google-api-python-client with a refresh
token from secrets YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN. Resumable upload with retry
and exponential backoff. Never call publish for assets not in state approved/scheduled.
Shorts: no thumbnails.set call; '#Shorts' in description. Record youtube_video_id in state
before any later step so re-runs never re-upload.
```

## M6 — Instagram publishing (1 day)
**Acceptance:** Reel, carousel and story publish to the owner's account from approved state; temp files removed from gh-pages after publish; token refresh workflow works and updates the secret.

```text
Implement M6: publish/pages_host.py (temporary public URLs on gh-pages, wait for HTTP 200,
remove after publish with an orphan force-push), publish/instagram.py (Instagram API with
Instagram Login: create media container → poll status_code until FINISHED → media_publish;
REELS, CAROUSEL with up to 10 children, STORIES), refresh-tokens.yml (refresh long-lived
token monthly; write back with SECRETS_PAT via the GitHub secrets API using libsodium sealed box).
Respect the 100 posts / 24 h limit.
```

## M7 — Analytics + weekly report (½ day)
```text
Implement M7: report/weekly.py pulling YouTube Analytics API (views, CTR, avg view duration,
subs gained, top search terms) and Instagram insights (reach, saves, shares, follows) for the
last 7 days, apply the rules in docs/REACH_PLAYBOOK.md §5, write reports/YYYY-WW.md and send a
Telegram summary. weekly-report.yml runs Sunday 04:30 UTC.
```

## M8 — Night agent + end-to-end dry run (½ day)
**Acceptance:** with `DRY_RUN=true` the whole loop runs: agent writes episode → render → Telegram → approve → publish logs requests (no posting). Then one real test: the channel trailer Short + Reel.

```text
Read docs/NIGHT_AGENT.md. Add scripts the night agent calls (python -m channel_os.agent.next_topic,
.agent.ingest_rejects, .agent.lint_episode) and make sure every step works with DRY_RUN=true.
Then walk me through a full dry run and list anything still blocked on a human step from
docs/SETUP_HUMAN.md.
```
