# Kickoff prompt for Claude Code

**How to use:** open PowerShell → `cd $HOME\Desktop\channel-os` → `claude` →
first run the two plugin installs from `docs/SKILLS.md` §2 (optional but recommended) →
then paste everything inside the box below as your first message.

---

```text
You are joining the channel-os project as its lead engineer. I'm Nakshatra, the owner.
This folder contains the complete plan and specs for StackNova ("Light up your whole stack."),
an automated, global, backend-engineering YouTube channel + Instagram page.
We are in Phase 1: content only — no selling, no store or affiliate links (docs/PHASES.md).
Cadence: 2 deep dives/week (Tue + Sat) + daily Shorts and Reels (config/schedule.yaml). Nothing here is built yet except the plan, the first episode
and the skills.

PART 0 — Install the project skills
0. Run `powershell -ExecutionPolicy Bypass -File scripts/install-skills.ps1` (copies skills-bundle/*
   into .claude/skills/). Then tell me to run /reload-skills and /skills, and confirm all 10 skills
   are listed: write-episode, review-episode, render-local, fix-pipeline-failure, add-skill,
   manim-composer, manimce-best-practices, frontend-design, webapp-testing, skill-creator.
   Once confirmed, delete skills-bundle/ so .claude/skills is the single source.

PART 1 — Understand the plan end to end (read, don't build yet)
1. Read, in this order: README.md, CLAUDE.md, docs/PHASES.md, config/brand.yaml, docs/ARCHITECTURE.md, docs/APPROVAL_FLOW.md,
   docs/CAPTIONS_SPEC.md, docs/REACH_PLAYBOOK.md, docs/CONTENT_RULES.md, docs/SKILLS.md,
   docs/SECRETS.md, docs/SETUP_HUMAN.md, docs/BUILD_PLAN.md, docs/NIGHT_AGENT.md,
   schemas/episode.schema.json, all of config/, content/backlog.yaml and
   content/episodes/001-idempotency/ (episode.yaml + samples).
2. List the skills in .claude/skills/ (installed in step 0) and read each SKILL.md's frontmatter so you know when to
   use them. Tell me which plugins from docs/SKILLS.md §2 are not installed in this session and
   give me the exact commands to run.
3. Write docs/UNDERSTANDING.md (max ~1 page): the system in your own words, the one rule that
   overrides everything, the data flow for one episode, the order of milestones, and every
   assumption or ambiguity you found. Put open questions at the end as a numbered list.

PART 2 — Get the repos in place
4. Ask me for my GitHub username and the two repo names (expected: stacknova-pipeline public,
   stacknova-content private — see config/brand.yaml).
5. If this folder is not a git repo: git init, set the remote to the pipeline repo, commit
   everything with message "Add channel-os plan, specs, skills and episode 001", push to main.
   Confirm .gitignore excludes .env, *.wav, *.mp4, .local/ and out/ before the first commit.
6. Set up the private content repo from my local study material:
   source = C:\Users\PC\Desktop\claude-specs\mastery
   Copy it into a local clone of the content repo under mastery/, EXCLUDING node_modules/,
   target/, pdf/ bundles over 50 MB, and any .env files. Add a README listing what's inside.
   Show me the file count and total size, then wait for my OK before pushing.
   Do NOT copy anything from C:\Users\PC\Documents\New folder (third-party books — reference only).

PART 3 — Prepare to build
7. Check my machine: git, Python 3.12 (or uv can install it), uv, ffmpeg, Node (for Playwright),
   gh CLI. For anything missing, give me the one-line install command for Windows; don't install
   system software without asking.
8. Read docs/SETUP_HUMAN.md and tell me which human steps are still open, in the order that
   unblocks you fastest.
9. Propose the plan for milestone M0 from docs/BUILD_PLAN.md (use the Superpowers planning
   workflow if installed). Wait for my approval before writing code.

Rules for the whole project:
- Never publish anything. Publishing only happens through the approved-state pipeline in
  docs/APPROVAL_FLOW.md, and only after I tap Approve on Telegram.
- Never ask me to paste secrets into chat; secrets go into GitHub repository secrets.
- Audience is global: follow CONTENT_RULES and config/schedule.yaml (UTC slots).
- When you finish a milestone, run tests/lint/types, show me the acceptance checklist with
  each item ticked or explained, then commit.
```
