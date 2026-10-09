# channel-os — StackNova

*Light up your whole stack.*

Automation for a backend-engineering YouTube channel + Instagram page:
a night agent writes episodes, GitHub Actions render them in the owner's cloned voice with
word-by-word captions, a Telegram bot asks the owner to approve, and approved posts publish
themselves to YouTube and Instagram.

**Nothing publishes without the owner's Telegram approval.**

## Start here

| You are | Read |
|---|---|
| The owner, first time in Claude Code | `KICKOFF_PROMPT.md` — paste it as your first message |
| Claude Code (building) | `CLAUDE.md`, then `docs/BUILD_PLAN.md` |
| The night agent | `docs/NIGHT_AGENT.md` |
| The owner | The roadmap doc (Setup guide + First video tabs), `docs/SETUP_HUMAN.md` |

## Map

- `CLAUDE.md` — rules, stack, layout, conventions
- `docs/ARCHITECTURE.md` — components, data flow, limits
- `docs/APPROVAL_FLOW.md` — Telegram + state machine
- `docs/CAPTIONS_SPEC.md` — burned-in captions + subtitle tracks
- `docs/REACH_PLAYBOOK.md` — packaging, hooks, languages, distribution, feedback loop
- `docs/CONTENT_RULES.md` — versions, originality, accuracy, episode shape
- `docs/PHASES.md` — what's in Phase 1 (content only) vs Phase 2/3
- `docs/SECRETS.md` — secret names and where they come from
- `docs/SKILLS.md` — skills in `.claude/skills/` + plugins to install
- `.claude/skills/` — project skills (5 ours, 5 open-source vendored)
- `scripts/update-skills.ps1` — refresh vendored skills
- `schemas/episode.schema.json` — the contract between the night agent and the renderer
- `content/episodes/001-idempotency/` — the first episode (full script, shorts, carousel, Go sample)
- `config/` — brand, schedule, reach, platforms
