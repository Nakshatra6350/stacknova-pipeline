# ECC skills (vendored, not loaded)

All 311 skills of [affaan-m/ECC](https://github.com/affaan-m/ECC) at commit
`25278e7d7b6cf6e6a4e7a6c8e10f14ff22f0eb5b` (26 Oct 2026), MIT (`LICENSE`). Owner's request of
29 Oct 2026: keep every ECC skill available, use only the ones a job needs.

Claude Code only loads skills from `.claude/skills/`, so the folders here cost nothing per
session. To switch one on, copy it there with the `add-skill` workflow (read its SKILL.md
fully first; reject skills that publish on their own, need secrets, or run remote scripts),
add `LICENSE-upstream.txt`, and record it in `docs/SKILLS.md`.

Only skills were taken: no ECC hooks, rules, agents, commands or MCP configs.
Refresh with `scripts/update-skills.ps1`.
