# Phases

Build only what the current phase needs. Anything marked Phase 2/3 must not appear in Phase 1
code, workflows, descriptions or posts.

## Phase 1 — Content engine (now)
- Platforms: **YouTube** (deep dives + Shorts) and **Instagram** (Reels, carousels, stories). Nothing else.
- Cadence: 2 deep dives/week (Tue + Sat), 10 Shorts/week, 7 Reels/week, 3 carousels/week, daily stories (`config/schedule.yaml`).
- Fully automated with Telegram approval; global audience.
- **No selling and no monetization links**: no paid guides, notes, projects, courses, store links or affiliate links.
- **Free packs (owner, 23 Oct 2026), from Instagram posts of 2 Nov 2026 on:** every Instagram post
  offers one free PDF pack: follow @stacknova.dev and comment a keyword, and an automated DM
  (comment-to-DM tool on Meta's official API, with a follow check) asks for the person's email and
  sends the PDF itself in the same chat (no hosted link). Emails are used only to announce new packs;
  the DM says so. Free only: no price, no checkout, no store link anywhere. Packs are original,
  sourced like the episode they come from, and built by `studio/scripts/pack.py` from
  `content/episodes/<id>/pack.yaml`. At the end of November the owner reviews the demand (comments,
  emails, followers gained) and decides on Phase 2.
- Income: YouTube Partner Program once eligible; inbound brand collaborations handled by the owner.
- Exit criteria to start Phase 2: pipeline runs 4 consecutive weeks with no manual fixes, and the channel has a steady weekly audience (owner decides).

## Phase 2 — Products (later)
- Paid written guides from the private mastery repo (updated to current versions), sold via Gumroad/Topmate, USD pricing with regional discounts.
- Affiliate links (relevant books/courses/hosting only). (Free PDF packs moved to Phase 1, 2 Nov 2026.)
- Adds: guide PDFs built with the `pdf` document skill (plugin already installed), store links in descriptions, sales in the weekly report.

## Phase 3 — Expansion (later)
- Project build guides / cohort course, LinkedIn and X distribution, multi-language audio dubbing, newsletter.
