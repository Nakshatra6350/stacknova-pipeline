# CLAUDE.md — channel-os

You are working on **channel-os**: the automation system behind **StackNova** ("Light up your whole stack."),
a faceless, English-language YouTube channel + Instagram page that teaches **backend engineering in depth** (Java, Go,
Node.js, databases, Kafka, Redis, distributed systems, system design). Owner: Nakshatra.
**Audience: global** (Americas, Europe, India, SE Asia and beyond) — international English,
USD/neutral examples, UTC scheduling, subtitles in 6 extra languages.

Read this file fully before any task. Then read the doc the task points to in `docs/`.

---

## 1. The one rule that overrides everything

**Nothing is ever published without the owner's explicit approval.**
Approval = the owner tapped **Approve** on the Telegram preview for that exact asset
(`state = approved` in `state/queue.json`). No code path, flag, retry or "test mode" may
publish an asset whose state is not `approved`. If you are unsure, do not publish.

## 1b. Phase 1 scope (read `docs/PHASES.md`)

Phase 1 = content only, on YouTube + Instagram. **No selling, no store links, no affiliate links,
no paid guides/notes/projects** anywhere in code, descriptions or posts. Cadence: 2 deep dives/week
(Tue + Sat) + 10 Shorts + 7 Reels + 3 carousels + daily stories (`config/schedule.yaml`).
One exception (owner, 23 Oct 2026): from 2 Nov 2026 every Instagram post offers a **free** PDF pack
for "follow + comment KEYWORD": an automated DM asks for an email and sends the PDF. Free only, never a price or store link;
see `docs/PHASES.md`.

## 2. What the system does (one paragraph)

A **night agent** (a Claude scheduled task in the cloud, 01:00 IST) picks a topic, writes and
fact-checks an episode (`content/episodes/<id>/episode.yaml`) and pushes it. **GitHub Actions**
render it: cloned voice (Chatterbox) → animated scenes (an HTML page drawn frame by frame in a
headless browser) → assembly (ffmpeg) →
captions (faster-whisper alignment + ASS) → long video, Shorts, Reels, carousel images,
thumbnails. A **Telegram bot** sends each asset with Approve / Reject buttons. A workflow
polls Telegram every 10 min; on Approve it **publishes** to YouTube and Instagram at the
scheduled slot and reports links back. On Reject it records the reason for the next night.
Full detail: `docs/ARCHITECTURE.md`.

## 3. Repos

| Repo | Visibility | Holds |
|---|---|---|
| `stacknova-pipeline` (this repo) | **public** (free Actions minutes) | code, workflows, episodes, rendered-asset manifests, `state/` on branch `state` |
| `stacknova-content` | **private** | mastery track (source material), story bank, voice sample (paid guides only in Phase 2) |

Never copy private-repo material into this repo except what an approved episode script quotes
from the owner's own notes. Never commit the voice sample or secrets here.

## 4. Tech stack (pin these)

- Python **3.12**, dependency manager **uv** (`pyproject.toml` + `uv.lock`). Single language for the pipeline.
- Video: scenes are **HTML/CSS/JS** (`src/channel_os/scenes/web/`, no framework, no build step) captured
  frame by frame with **Playwright** in the Chrome or Edge already installed; **ffmpeg** (assembly,
  loudness, encode), **libass** (captions). The owner chose this over Manim on 12 Oct 2026
  (`docs/superpowers/specs/2026-10-12-look-v2-design.md`).
- Voice: **chatterbox-tts** (MIT), reference clip from the private repo, CPU on `ubuntu-latest`.
- Alignment: **faster-whisper** (`small.en`, word timestamps), matched against the known script text.
  The voice stage uses the same recogniser to listen to each chunk it synthesises and to read
  again what was said wrong (`voice/listen.py`).
- APIs: `google-api-python-client` (YouTube Data API v3), plain `httpx` for Telegram Bot API and Instagram Graph API.
- Config/data: YAML for humans/agents (`config/`, `content/`), JSON for machine state (`state/`).
- Tests: `pytest`; lint: `ruff`; types: `mypy --strict` on `src/channel_os/`.

## 5. Layout

```
config/            brand.yaml, platforms.yaml, schedule.yaml, reach.yaml, voice.yaml, themes.yaml,
                   pronunciation.yaml (words respelled for the voice model)
assets/fonts/      Inter and JetBrains Mono (OFL), the only faces scenes are drawn in
content/
  backlog.yaml     ranked topic queue (night agent reads/writes)
  episodes/<id>/   episode.yaml (+ samples/, generated assets manifest)
schemas/           episode.schema.json  (validate every episode.yaml against it)
src/channel_os/
  voice/           tts.py (chatterbox), loudness.py, reference.py, chunking.py, narrate.py,
                   polish.py (pace + clarity), wavio.py, settings.py, lexicon.py (respelling),
                   listen.py (speech recognition hears every chunk; missed words are read again)
  scenes/          episode.yaml `visual` -> animation (docs/VISUAL_DSL.md). No browser: theme.py,
                   formats.py, phrases.py, vocabulary.py, spec.py, plan.py (adds captions, intro,
                   outro, transitions) and each stage's <name>_model.py (console, sequence,
                   cards, fanin, code). Browser: browser.py (Playwright), preview.py.
    web/           the page scenes are drawn on: index.html, stage.css, stages.css, runtime.js,
                   one <stage>.js per stage, brand.js (logo intro and outro)
  brand/           sound.py (the channel's own synthesised sounds)
  assemble/        timeline.py, ffmpeg.py, cuts.py (shorts/reels), thumbnails.py, carousel.py
  captions/        align.py (whisper→script words), ass.py (burned-in), srt.py (upload track)
  publish/         youtube.py, instagram.py, pages_host.py (temporary public URLs)
  telegram/        bot.py (send preview, parse callbacks), approvals.py
  state/           queue.py (state machine, see docs/APPROVAL_FLOW.md)
  report/          weekly.py
  reach/           lint.py (mechanical content + reach rules, run by validate)
  validate.py      CLI: python -m channel_os.validate <episode.yaml> (schema + reach lint)
  render.py        CLI: python -m channel_os.render --episode <id> --stage voice|scenes
                   (voice needs --reference <wav>; scenes reads the voice stage's output)
  kit.py           CLI: python -m channel_os.kit --episode <id> [--images]: the upload kit
                   (subtitles, chapters, texts to paste, thumbnails, carousel) for posting by hand
scripts/           render-voice.sh and render-scenes.sh (the two jobs of render.yml),
                   install-skills.ps1, update-skills.ps1
.github/workflows/ render.yml, notify.yml, watch-approvals.yml, publish.yml,
                   refresh-tokens.yml, weekly-report.yml, ci.yml, kit.yml,
                   upload-test.yml (one private test upload, for the YouTube API audit)
docs/              specs — the source of truth for behaviour
```

## 6. Conventions

- Episode id: `NNN-slug` (e.g. `001-idempotency`). Asset ids: `<episode>/<kind>-<n>` e.g. `001-idempotency/short-1`.
- All times stored in UTC ISO-8601; schedule config is written in IST and converted.
- Every function that talks to an external API takes a `dry_run: bool` and logs the exact request it would make.
- Secrets only via env vars (names in `docs/SECRETS.md`). Never print them; mask in logs.
- Idempotent jobs: every workflow can be re-run safely. Publishing checks `state` first and records platform ids, so a re-run never double-posts.
- Fail closed: on any error, set the asset to `failed` with the reason, send a Telegram alert, publish nothing.

## 7. Content rules (summary — full text in `docs/CONTENT_RULES.md`)

- Teach **current** versions: Java 25 LTS, Go 1.27 (released 19 August 2026), Node 24 LTS (Node 26 when it becomes LTS), Spring Boot current GA, PostgreSQL current major. Verify against official docs/release notes at script time; call out version differences explicitly.
- Source material (mastery track, books) is for ideas only. **Never** copy sentences, figures or code from books. All scripts, diagrams and guides are original.
- No employer names, code, clients or data. Owner stories come only from `content/stories/` (private repo) and are already anonymised.
- Every episode includes: a hook (first 2 s), the naive model, the real mechanism, a production story, trade-offs, recap + next episode.

## 8. Reach rules (summary — full text in `docs/REACH_PLAYBOOK.md`)

- Audience is global: publish slots come from `config/schedule.yaml` (UTC); examples avoid region-specific references.
- Every Short/Reel has **burned-in word-by-word captions** (spec: `docs/CAPTIONS_SPEC.md`).
- Every long video uploads an **exact English SRT** + translated subtitle tracks and localized title/description (`config/reach.yaml` lists languages).
- Visual change at least every 4 s in Shorts/Reels; hook text on screen in frame 1; loopable endings.

## 9. How to work in this repo

- Build in the milestone order of `docs/BUILD_PLAN.md`. Do not start a milestone until the previous one's acceptance checks pass.
- Before writing code for a milestone, restate its acceptance criteria and list files you will touch.
- Run `uv run pytest && uv run ruff check && uv run mypy src` before saying a milestone is done.
- If a spec is ambiguous, ask the owner; do not invent product behaviour. Write the question in the PR/commit message too.
- Human-only steps (accounts, secrets, OAuth consent, audit forms) are in `docs/SETUP_HUMAN.md`. Never attempt them; tell the owner which step is needed.

## 10. Skills (read `docs/SKILLS.md`)

Project skills in `.claude/skills/` load automatically. Use them:

| Task | Skill |
|---|---|
| Write or revise an episode | `write-episode`, then `review-episode` |
| Plan a visual explanation | choose stages from `docs/VISUAL_DSL.md`, then encode it in `episode.yaml` visuals |
| Scene page code (`src/channel_os/scenes/web/`) | `frontend-design` + `webapp-testing` (Playwright) |
| Thumbnail / carousel / guide-cover templates | `frontend-design` + `webapp-testing` (Playwright rendering) |
| Preview renders | `render-local` |
| A failed workflow or Telegram alert | `fix-pipeline-failure` |
| Adding or updating skills | `add-skill` (uses `skill-creator` for our own) |
| Paid guide PDFs (**Phase 2 only**) | `pdf` from the document-skills plugin |
| Building milestones | Superpowers plugin workflow if installed: brainstorm → plan → TDD → verify |
| Research, positioning, scripts, testing for a new video style (look v4) | ECC: `market-research`, `competitive-platform-analysis`, `marketing-campaign`, `content-engine`, `brand-voice`, `search-first`, `verification-loop`, `eval-harness`, `e2e-testing`; all 311 ECC skills wait unloaded in `vendor/ecc/` |

If a skill you need isn't installed, say so and give the owner the exact command from `docs/SKILLS.md`.
`manim-composer` and `manimce-best-practices` are still vendored but no longer apply: scenes are not
drawn with Manim.
