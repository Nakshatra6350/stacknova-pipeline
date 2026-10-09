---
name: add-skill
description: Add, update or remove a Claude Code skill for this project — vendoring an open-source skill from GitHub into .claude/skills, or registering a plugin — and record it in docs/SKILLS.md and CLAUDE.md. Use when the owner asks to add/install/update a skill or when a task would clearly benefit from one.
---

# Add a skill

1. Check the source: repo exists, licence allows redistribution (MIT, Apache-2.0, BSD). If the
   licence is "source-available" or missing, do not vendor it — install it as a plugin instead, or skip.
2. Read the skill's SKILL.md fully. Reject skills that run unknown remote scripts, request
   secrets, or conflict with `CLAUDE.md` rule 1 (no publishing without approval).
3. Vendor: copy the skill folder to `.claude/skills/<name>/`, keep its LICENSE file
   (copy the repo-root LICENSE as `LICENSE-upstream.txt` if the folder has none).
4. Record it in `docs/SKILLS.md` (name, source repo + commit, licence, when to use) and in
   `scripts/update-skills.ps1` so it can be refreshed.
5. If it changes how work is done (e.g. a new rendering approach), add one line to `CLAUDE.md` §10.
6. Tell the owner to run `/reload-skills` if the skill doesn't show up in `/skills`.
7. Plugins (with hooks, e.g. superpowers) can't be vendored this way — give the owner the
   `/plugin …` commands from `docs/SKILLS.md` to run.
