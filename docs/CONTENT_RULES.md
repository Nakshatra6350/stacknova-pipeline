# Content rules

These rules apply to every script, scene, caption and post. The night agent must
check each one before setting `status: ready_to_render`; `reach/lint.py` enforces the mechanical ones.

## 1. Versions
- Target the current stable/LTS release at script time. As of Oct 2026: **Java 25 LTS**, **Go 1.26**, **Node.js 24 LTS** (move to 26 when it enters LTS), current Spring Boot GA, current PostgreSQL major, Kafka 4.x (KRaft only), Redis 8.
- Before writing, open the official docs/release notes for every API or behaviour you describe; record them in `sources`.
- If the mastery track or a book shows older behaviour, say what changed ("Before Java 21 you'd use a thread pool here; today virtual threads…").

## 2. Originality
- Mastery track and books are background reading. Never copy sentences, code, diagrams or chapter structure.
- Write all code samples fresh. Every sample in `code_samples` must compile/run in CI (`ci.yml` job `samples`).
- Public postmortems: summarise in our own words, link the original, never screenshot.

## 3. Accuracy
- Two-pass fact check: (1) write; (2) re-read as a sceptical senior engineer, list every factual claim in `fact_check[]` with a source URL or "derived from code sample N". Claims without either are removed.
- No invented numbers (latencies, percentages, company stats). Use numbers only from a cited source or from a benchmark we ran.
- Prefer "usually / in most setups" over absolute claims unless the spec guarantees it.

## 4. Episode shape (long form)
1. **Hook** (≤ 15 s): failure, puzzle or stakes.
2. **Naive model**: what most people believe.
3. **Real mechanism**: one diagram that builds step by step.
4. **Production story**: from `content/stories/` (anonymised), clearly framed as experience.
5. **Trade-offs**: when to use, when not, cost.
6. **Recap + next**: one summary diagram; name the next episode.
Target 1,100–2,200 words (≈ 8–15 min at 145 wpm). Depth over length: never pad.

## 5. Voice and style
- Second person, plain English, short sentences. One idea per sentence.
- Define every term the first time (5–10 words), then use it consistently.
- No filler ("in today's video", "without further ado", "smash that like").
- **Global audience** (Americas, Europe, India, SE Asia and beyond): plain international English, many viewers are non-native speakers.
- Examples use US dollars or neutral numbers, metric units, and globally known companies/products; no region-only slang, idioms, holidays or pop-culture references.
- Write dates as "26 October 2026" and times with a time zone. Explain any culture-specific example in one line or swap it for a universal one.

## 6. Safety and compliance
- No employer names, code, products, clients, or data. No real customer data in examples.
- Disclose synthetic voice: set YouTube's altered/synthetic content flag on every upload.
- No medical, legal or financial advice framing — fintech examples are about engineering, not money advice.
