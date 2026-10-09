# Reach playbook

Audience: **global** English-speaking engineers — Americas, Europe, India, SE Asia, Africa, Middle East. Slots, examples and languages are chosen for that mix (see `config/schedule.yaml`).

Goal: maximise qualified reach (engineers who stay, watch and subscribe) — not raw views.
Every rule below is something the night agent or pipeline does automatically, and is checked
by `src/channel_os/reach/lint.py` before an episode can move to `ready_to_render`.

## 1. Packaging (decides whether anyone clicks)

| Item | Rule |
|---|---|
| Long title | ≤ 60 chars; primary keyword in the first 40; a curiosity gap or stakes in the rest. Generate 5, score with vidIQ, keep top 2 for YouTube's built-in A/B title test. |
| Thumbnail | 3 variants from the template: one diagram fragment + 2–4 words that do NOT repeat the title; readable at 160 px wide; face-free; brand accent. A/B test via YouTube "Test & compare". |
| Short title | Problem-first ≤ 50 chars + `#Shorts` in description; no clickbait the video doesn't pay off. |
| Description | Line 1–2: the problem + keyword (shows in search). Then chapters, related episodes in the series, sources. Phase 1: no store or affiliate links (`docs/PHASES.md`). |
| Tags | 10–15: exact keyword, 3–4 long-tail variants (vidIQ), pillar, language. |
| Hashtags (IG) | 5–8 specific ones from `config/reach.yaml: hashtag_sets[pillar]`. Never 30 generic. |

## 2. Hooks and retention

- **Shorts/Reels**: the first 2 s must state stakes or a contradiction ("This line charges your customer twice."). On-screen hook text in frame 1. No logo intro. No "In this video…".
- Visual change at least every 4 s (diagram step, zoom, highlight, code line).
- One idea per Short. 30–50 s target. End on a line that loops back into the opening sentence.
- **Long videos**: hook within 15 s that promises a concrete payoff; open loop ("by the end you'll see why exactly-once is a lie"); pattern interrupt every 45–60 s (new diagram, question to viewer, production story).
- Chapters on every long video (from `segments[].title`).
- End screen: next episode in the series + subscribe; pinned comment with a question to spark replies.

## 3. Captions and languages (biggest cheap reach lever)

- Burned-in word-by-word captions on every Short/Reel — see `CAPTIONS_SPEC.md`.
- Exact English SRT on every long video (better than auto-captions for search and accessibility).
- Translated subtitles + localized titles/descriptions in: Hindi, Spanish, Portuguese, Indonesian, Vietnamese, Arabic (`config/reach.yaml`). India and Vietnam appear among the top markets for "system design" searches in vidIQ data (Oct 2026); the others are large developer populations to test. Keep a language only if its views justify it after 8 weeks. Technical terms stay English.
- Phase 2 (after 1,000 subs): multi-language audio tracks for the top 3 videos using the multilingual voice model in the owner's cloned voice — only if the owner approves the voice quality per language.

## 4. Distribution

| Surface | What | Cadence |
|---|---|---|
| YouTube long | Deep dive (8–12 min) | 2/week, Tue + Sat 14:00 UTC (morning Americas, afternoon Europe, evening India) |
| YouTube Shorts | 5 per episode (3 cut from the deep dive + 2 standalone) | 10/week: daily 13:00 UTC + Mon/Wed/Fri 23:00 UTC (US evening) |
| Instagram Reels | Best 7 of the week's Shorts, IG-specific caption | daily 14:30 UTC |
| Instagram carousels | Deep-dive diagrams, 8–10 slides, last slide = CTA | 3/week, Tue/Thu/Sat 12:00 UTC |
| Instagram Trial Reels | New hooks tested on non-followers first | 2/week |
| Community tab | Quiz from the week's episode | 1/week |

## 5. Feedback loop (weekly, automatic)

- Pull: CTR, avg view duration, retention curve, Shorts viewed-vs-swiped, subs per 1k views, top search terms, IG reach/saves/shares.
- Rules: CTR < 4 % after 72 h → swap thumbnail/title; retention drop > 15 % in one segment → add that segment type to `content/lessons.md` "don't" list; Short beating channel median ×2 → promote topic to a long video next week; pillar with best subs/1k views gets +1 slot next month.
- Every change is logged in `reports/YYYY-WW.md` and summarised on Telegram.

## 6. What we never do

- Sub-for-sub, bought views, engagement pods, misleading thumbnails, reuploaded third-party clips, trending audio we don't have rights to, mass-produced near-identical videos.
