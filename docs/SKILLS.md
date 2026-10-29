# Skills

Skills are folders with a `SKILL.md` that Claude Code loads when a task matches their
description (or when you type `/<skill-name>`). Project skills live in `.claude/skills/` and
are committed, so the night agent and every Claude Code session get them automatically.
They were installed from the original `skills-bundle/` on 9 October 2026; that folder is gone and
`.claude/skills/` is the single source.
Run `/skills` inside Claude Code to see what's loaded; run `/reload-skills` after adding one.

## 1. Already in this repo (vendored — nothing to install)

| Skill | Source (commit) | Licence | Use it for |
|---|---|---|---|
| `write-episode` | ours | — | Writing/revising `episode.yaml` (scripts, shorts, carousel, packaging, localizations) |
| `review-episode` | ours | — | Accuracy + growth review before rendering |
| `render-local` | ours | — | Previewing an episode/asset on your PC, never publishing |
| `fix-pipeline-failure` | ours | — | Turning a Telegram failure alert into a diagnosis and fix |
| `add-skill` | ours | — | Adding/updating skills safely and recording them here |
| `manim-composer` | [adithya-s-k/manim_skill](https://github.com/adithya-s-k/manim_skill) @ cef0450 | MIT | **No longer used.** Scenes stopped being drawn with Manim on 12 October 2026 (look v2). Still vendored; removing it is the owner's call. |
| `manimce-best-practices` | same | MIT | **No longer used**, for the same reason. |
| `frontend-design` | [anthropics/skills](https://github.com/anthropics/skills) @ 683bc88 | Apache-2.0 | The page scenes are drawn on (`src/channel_os/scenes/web/`), and HTML/CSS templates for thumbnails, carousel slides, guide covers |
| `webapp-testing` | same | Apache-2.0 | Playwright scripts — we use Playwright to draw scenes frame by frame and to render thumbnails/carousels to images |
| `skill-creator` | same | Apache-2.0 | Creating and testing new skills of our own |
| `market-research` | [affaan-m/ECC](https://github.com/affaan-m/ECC) @ 25278e7 | MIT | Sourced research on creators, formats and audiences, ending in a decision (look v4, 29 Oct 2026) |
| `competitive-platform-analysis` | same | MIT | Picking and tiering the creators to study (direct, adjacent, aspirational) before comparing them |
| `marketing-campaign` | same | MIT | Positioning, the angle, short-form scripts and the posting calendar |
| `content-engine` | same | MIT | Platform-native scripts and captions for Reels, Shorts and YouTube from one source |
| `brand-voice` | same | MIT | A reusable voice profile so every script sounds like the channel, not generic AI copy |
| `search-first` | same | MIT | Looking for an existing tool or library before building one (e.g. a free voice or video tool) |
| `verification-loop` | same | MIT | Build, lint, tests and diff review before saying work is done |
| `eval-harness` | same | MIT | Pass/fail criteria for a pilot video before making it, graded after |
| `e2e-testing` | same | MIT | Playwright patterns for anything rendered in a browser |

**All 311 ECC skills** are kept in `vendor/ecc/skills/` (owner, 29 Oct 2026: keep every one, use
only what a job needs). They are not loaded; to switch one on, copy it into `.claude/skills/` with
`add-skill`. Not switched on, on purpose: `videodb` (needs an API key; sends video to a cloud
service), `social-publisher` and `crosspost` (publish on their own, against CLAUDE.md rule 1),
`deep-research` (needs paid firecrawl/exa tools), `seo` (websites, not videos). `remotion-video-creation`,
`video-editing` and the `motion-*` skills wait for the owner's approval of a new video style.

## 2. Install once as plugins (run these inside Claude Code)

| Plugin | Commands | Why |
|---|---|---|
| **Superpowers** (obra/superpowers, MIT) | `/plugin install superpowers@claude-plugins-official` — if not found: `/plugin marketplace add obra/superpowers-marketplace` then `/plugin install superpowers@superpowers-marketplace` | Disciplined build workflow: brainstorm → written plan → test-driven implementation → systematic debugging → verification before "done". Ideal for building M0–M8. |
| **Document skills** (anthropics/skills @ 683bc88 — source-available, not open source, so not vendored) | `/plugin marketplace add anthropics/skills` then `/plugin install document-skills@anthropic-agent-skills` | `pdf` skill for the paid guides and free diagram PDFs; `pptx`/`docx` if you ever need them. Installed from the start (owner's decision, 9 October 2026); the paid-guide work it serves is still Phase 2 (`docs/PHASES.md`). |

Plugins install to your user profile (they're not committed), so run them once per machine.
Both are installed on the owner's PC (checked with `claude plugin list`, 9 October 2026).
From a terminal the same installs are `claude plugin marketplace add …` and `claude plugin install …`.
For the night agent (cloud), the vendored project skills are what it can rely on.

## 3. Considered and not added

| Skill | Why not |
|---|---|
| Remotion skills (remotion-dev/skills) | Excellent for React-based video and captions, but our scenes are plain HTML/CSS/JS with no framework and no build step, driven from Python; adding React and a bundler for the same result doubles maintenance. Revisit only if we move to Remotion. |
| `manimgl-best-practices` | We do not use Manim of either kind any more. |
| Generic "YouTube growth" skills from unknown authors | Unverified advice and unknown scripts; our reach rules live in `docs/REACH_PLAYBOOK.md`. |

## 4. When Claude Code should use which skill

- Building pipeline code → Superpowers workflow (plan → TDD → verify), plus `frontend-design` + `webapp-testing` for the scene page (`src/channel_os/scenes/web/`), `assemble/thumbnails.py` and `assemble/carousel.py`.
- Planning a new visual explanation → pick stages from `docs/VISUAL_DSL.md`, then encode the plan into `episode.yaml` visuals.
- Content → `write-episode`, then `review-episode`.
- Paid guides / PDFs (Phase 2) → `pdf` (document-skills plugin).
- Failures → `fix-pipeline-failure`.
- New skills → `add-skill` (uses `skill-creator` for our own).

## 5. Updating vendored skills

`pwsh scripts/update-skills.ps1` re-clones the upstream repos and copies the listed skill
folders over the vendored ones. Review the diff (`git diff .claude/skills`) before committing.
