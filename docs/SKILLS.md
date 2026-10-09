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
| `manim-composer` | [adithya-s-k/manim_skill](https://github.com/adithya-s-k/manim_skill) @ cef0450 | MIT | Planning an explainer video scene by scene before writing Manim code |
| `manimce-best-practices` | same | MIT | Writing correct Manim Community scenes (our animation engine) |
| `frontend-design` | [anthropics/skills](https://github.com/anthropics/skills) @ 683bc88 | Apache-2.0 | HTML/CSS templates for thumbnails, carousel slides, guide covers |
| `webapp-testing` | same | Apache-2.0 | Playwright scripts — we use Playwright to render thumbnails/carousels to images |
| `skill-creator` | same | Apache-2.0 | Creating and testing new skills of our own |

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
| Remotion skills (remotion-dev/skills) | Excellent for React-based video and captions, but our engine is Manim (Python); mixing two engines doubles maintenance. Revisit only if we move to Remotion. |
| `manimgl-best-practices` | We use Manim Community, not ManimGL. |
| Generic "YouTube growth" skills from unknown authors | Unverified advice and unknown scripts; our reach rules live in `docs/REACH_PLAYBOOK.md`. |

## 4. When Claude Code should use which skill

- Building pipeline code → Superpowers workflow (plan → TDD → verify), plus `manimce-best-practices` for anything in `src/channel_os/scenes/`, `frontend-design` + `webapp-testing` for `assemble/thumbnails.py` and `assemble/carousel.py`.
- Planning a new visual explanation → `manim-composer`, then encode the plan into `episode.yaml` visuals.
- Content → `write-episode`, then `review-episode`.
- Paid guides / PDFs (Phase 2) → `pdf` (document-skills plugin).
- Failures → `fix-pipeline-failure`.
- New skills → `add-skill` (uses `skill-creator` for our own).

## 5. Updating vendored skills

`pwsh scripts/update-skills.ps1` re-clones the upstream repos and copies the listed skill
folders over the vendored ones. Review the diff (`git diff .claude/skills`) before committing.
