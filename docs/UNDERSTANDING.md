# Understanding — lead engineer's read-back

Written 9 October 2026 after reading every spec, config, schema, skill and episode 001.
Nothing is built yet; this is what I think we are building and where the plan is unclear.

## The system

StackNova is a faceless backend-engineering channel run by a pipeline with one human checkpoint.
A nightly Claude task writes and fact-checks an episode as data (`episode.yaml`). GitHub Actions
turn that data into finished media: narration in the owner's cloned voice, Manim diagrams timed
to the narration, word-accurate captions, and the Shorts, Reels, carousels and thumbnails cut
from it. A Telegram bot shows each asset to the owner. Only what the owner approves is posted,
at a UTC slot chosen for a global audience. Rejections come back as reasons the next night's run
must address, and weekly analytics re-rank the backlog. Phase 1 is content only: no selling, no
store or affiliate links.

## The one rule

Nothing is published unless the owner tapped **Approve** on the Telegram preview of that exact
asset (`state = approved` in `state/queue.json`). No flag, retry or test mode bypasses it. On any
error the asset becomes `failed`, the owner is alerted, and nothing is posted.

## Data flow for one episode

1. Night agent (01:00 IST) takes the next backlog topic, writes `content/episodes/<id>/episode.yaml`,
   validates it, sets `status: ready_to_render`, pushes to `main`.
2. `render.yml` builds voice, scenes, assembly and captions into `out/<id>/` plus `manifest.json`.
3. `notify.yml` sends each asset to Telegram and records it as `pending_approval` on branch `state`.
4. `watch-approvals.yml` polls Telegram every 10 min and moves assets to `approved` or `rejected`.
5. `publish.yml` posts approved assets whose slot has arrived, saves the platform ids, replies with links.
6. Rejected assets go back to the night agent, which revises the episode as `version + 1`.

## Milestone order

M0 bootstrap (package, validator, CI) → M1 voice → M2 scenes → M3 assembly, captions, thumbnails,
carousels → M4 Telegram and state machine → M5 YouTube → M6 Instagram → M7 weekly report →
M8 night agent and end-to-end dry run. Each starts only when the previous one's checks pass.

## Assumptions I am making

- Modules the docs call but `CLAUDE.md` §5 omits will exist: `reach/lint.py`, `validate.py`,
  `agent/*`, `telegram/send.py`, `render.py`.
- Private repo layout is `mastery/`, `stories/`, `voice/reference.wav` at the root (some docs say
  `content/stories/`).
- `kind: guide` (APPROVAL_FLOW) is Phase 2 and stays out of Phase 1 code.
- Trial Reels, the Community quiz and YouTube title/thumbnail A/B tests (REACH_PLAYBOOK) have no
  milestone and no API path here, so they stay manual.
- Heavy dependencies (torch, chatterbox, manim) go in optional groups so M0 CI stays fast.
  chatterbox on Python 3.12 is a known install risk to settle in M1.
- Lint blocks `ready_to_render`, not `draft`, so episode 001 can validate with its story placeholder.

## Ambiguities and risks found

- **Public before approved.** The repo is public, so scripts pushed to `main` and rendered files in
  a GitHub Release are world-readable before any approval.
- **Private upload before approval.** ARCHITECTURE uploads the long video to YouTube as private at
  render time; APPROVAL_FLOW says publish code may only touch `approved` or `scheduled` assets.
- **Unaudited YouTube project.** Google's help page says API uploads from an unaudited project are
  locked private, cannot be appealed and must be re-uploaded, so the "tap to make public" fallback
  probably does not work.
- **Episode 001 breaks rules the docs state**: short-5's hook is 7 words (limit 6); titles 3 and 4
  lack the keyword in the first 40 characters; thumbnail text "CHARGED TWICE?" repeats the title;
  localizations cover 4 of the 6 languages.
- **Cadence the schema cannot express**: 3 carousels a week needs two from one episode but
  `carousel` is a single object; 7 stories a week have no content spec, schema field or render step.
- **Two status fields**: `episode.yaml: status` and the asset state machine. Nothing says who
  writes `rendering`, `rendered` or `published` back to `main`.
- **Instagram facts to confirm in M6**: story publishing for Creator accounts, and whether the
  daily limit is 100 posts (our docs) or 50.

## Open questions

1. Does "published" mean only YouTube and Instagram, or should unapproved scripts and renders also
   stay non-public? If the latter, I propose draft GitHub Releases (visible to collaborators only).
2. Is a private YouTube upload before approval allowed? I would make it a separate code path that
   can only ever set `private`.
3. Until the YouTube audit passes, do you upload long videos by hand, or do we hold YouTube
   publishing until it does? Either way the audit should be submitted as early as possible.
4. The public repo names you (`CLAUDE.md`, audit answers) and commits carry your git identity.
   Should commits use a brand identity instead?
5. Which lint rules are hard errors? I propose the three in BUILD_PLAN M0 as errors, the rest as
   warnings on drafts and errors at `ready_to_render` — and fixing episode 001 to pass them.
6. Carousels: change the schema to `carousels[]`, or accept 2 a week?
7. What is a story: a still from the day's Short, a carousel slide, a quiz?
8. Is a Reel its own asset with its own approval, or a second platform on the Short's approval?
   Who picks the "best 7 of 10"?
9. Should `episode.yaml: status` stop at `ready_to_render`, with everything later living only in
   `state/queue.json`? That avoids workflows committing to `main` and re-triggering renders.
