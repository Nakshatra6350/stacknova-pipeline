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
   default you mention (Java 25 LTS, Go 1.27, Node 24 LTS unless newer; check the release page,
   since a version named here can be out of date). Add each to `sources`.
4. Write `segments` in the 6-part shape: hook → naive model → real mechanism → production story
   → trade-offs → recap + next. 1,100–2,200 words. Every segment gets a `visual` with steps whose
   `at` phrases appear verbatim in its narration, and `emphasis` words that appear verbatim.
   **Read `docs/VISUAL_DSL.md` before writing any visual.** Pick the stage that fits what is
   being said (`console` for a request's journey between systems, `sequence` for
   who-tells-whom and races, `cards` for comparisons, checklists and a + b = c, `fanin` for
   many senders, `code` for a short listing), list steps in spoken order, and let something
   change every few seconds: a visual with one step for forty seconds of narration is a slide,
   not an animation. Every standalone Short needs its own `visual` too. Never write page code
   for an episode, and never describe captions, the intro, the outro or transitions: the
   planner adds those. Add top-level `next: {title, teaser}` so the outro can name the next
   episode. A scene that must also work as a Short has to fit a phone screen; the render says
   when it does not.
   The narration is read by a voice model that learns pronunciation from spelling. Write
   numbers the way they are said only when it matters, and when the script uses a word the
   model is known to say wrong, or new jargon, check `config/pronunciation.yaml`: `say` holds
   spellings for the voice, one or a list to try in turn (the script keeps the normal
   spelling), `terms` the jargon the listening check should expect.
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
11. Code samples and walkthroughs. Every long video has 3–4 code walkthroughs
    (`docs/CONTENT_RULES.md` §4): one language per episode, rotating Go / Java / Node.js. Write
    fresh code under `samples/<lang>/` and make it compile (`go vet` and `go build` for Go).
    Each walkthrough is a `code` scene after the diagram it explains (`from:` its first phrase),
    in a segment no Short is cut from. The listing is an excerpt of the sample (at most 10
    lines of 60 characters, written for the screen). The narration takes the viewer through it
    line by line, and the steps follow: `show` the lines as they are reached, `highlight` the
    line being explained, `note` what it does or what breaks without it. List each sample in
    `code_samples` with `shown_in`.
12. Fact-check pass as a sceptical senior engineer: every claim in `fact_check` has a URL or
    "derived from code sample". Delete unsourced claims.
13. Validate: `uv run python -m channel_os.validate content/episodes/<id>/episode.yaml`
    (before M0 exists: validate against the JSON schema with a short Python script).
14. Bump `version` on revisions and log the change in `content/episodes/<id>/CHANGELOG.md`.

Never set `status: published`, never touch `state/`, never publish.
