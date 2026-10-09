---
name: write-episode
description: Write or revise a channel episode (content/episodes/<id>/episode.yaml) — long-form script, Shorts, carousel, packaging, localizations, sources and fact-check — following the channel's content and reach rules. Use when asked to create, draft, extend or revise an episode or topic for the YouTube/Instagram channel.
---

# Write an episode

Inputs: an episode id from `content/backlog.yaml` (or a topic the owner names) and, for
revisions, the reject reason from `state/queue.json` or the owner's message.

## Steps

1. Read `CLAUDE.md`, `docs/CONTENT_RULES.md`, `docs/REACH_PLAYBOOK.md`, `schemas/episode.schema.json`,
   and `content/episodes/001-idempotency/episode.yaml` as the gold-standard example.
2. Read the backlog item's `mastery_source` (private content repo) for **ideas only**. Do not copy text.
3. Research current behaviour: open official docs / release notes for every API, version or
   default you mention (Java 25 LTS, Go 1.26, Node 24 LTS unless newer). Add each to `sources`.
4. Write `segments` in the 6-part shape: hook → naive model → real mechanism → production story
   → trade-offs → recap + next. 1,100–2,200 words. Every segment gets a `visual` with steps whose
   `at` phrases appear verbatim in its narration, and `emphasis` words that appear verbatim.
5. Production story: use only a story file from the private repo `stories/` with
   `approved_by_owner: true`. If none fits, leave `[STORY:<slug>]` and keep `status: draft`.
6. Global audience: US dollars or neutral numbers in examples, metric units, no region-only
   references or idioms, dates written as "26 October 2026".
7. Shorts: exactly 5 — 3 cut from segments + 2 standalone (cadence needs 10 Shorts/week from 2 episodes); each hook ≤ 6 words, 30–50 s, loops back to its opening.
8. Carousel: 1–2 per episode (3/week needed), 8–10 slides, one idea each, last slide = CTA.
   Phase 1: no store, guide or affiliate links anywhere (`docs/PHASES.md`).
9. Packaging: 5 titles ≤ 60 chars (keyword in first 40), 3 thumbnail texts that don't repeat the
   title, description template, 10–15 tags, pinned comment question.
10. Localizations for every language in `config/reach.yaml`, keeping `keep_in_english` terms.
11. Code samples: write fresh code under `samples/<lang>/`, make it compile/run, reference lines in visuals.
12. Fact-check pass as a sceptical senior engineer: every claim in `fact_check` has a URL or
    "derived from code sample". Delete unsourced claims.
13. Validate: `uv run python -m channel_os.validate content/episodes/<id>/episode.yaml`
    (before M0 exists: validate against the JSON schema with a short Python script).
14. Bump `version` on revisions and log the change in `content/episodes/<id>/CHANGELOG.md`.

Never set `status: published`, never touch `state/`, never publish.
