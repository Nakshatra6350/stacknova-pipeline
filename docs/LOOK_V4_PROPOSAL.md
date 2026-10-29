# Look v4: proposal (29 Oct 2026, for the owner's approval)

The owner's brief: views are too few, nobody follows or engages, and the videos feel off. Make a new
style from scratch (nothing from looks v1–v3), faceless with a new AI voice, free tools in November.
Every video: a deep topic, internals, real code, use cases, a real production scenario, a hook that
catches, and "follow + comment KEYWORD for the free guide". Research done with the ECC skills
`market-research` and `competitive-platform-analysis` on branch `look-v4`.

## 1. Where we stand (fact)

Our 21 YouTube Shorts have 0 to 84 views each (public counts, 29 Oct). The titles lead with the
mechanism ("Kafka Exactly-Once: Where It Stops", "Change Data Capture in 35 Seconds"). Earlier data
(22 Oct, Studio and Instagram Insights): 63–83% of viewers swipe away in the first 3 seconds.

## 2. What wins in this niche (public YouTube Shorts counts, 29 Oct 2026)

| Creator | Format | Shorts that won | Views |
|---|---|---|---|
| ByteByteGo (1.44M subs) | face below a clean flat 2D diagram, big centred captions, 47–60 s | Why is Redis so FAST · How Big Tech Ships Code | 1.3M · 1.9M |
| takeUforward / Striver (1.13M) | "Explained" series: something everyone uses → the algorithm inside, 89–100 s | Netflix preview trick (sprite sheets) · Credit card validation (Luhn) | 367K · 280K |
| b001 (328K, **faceless**) | frame 1 is a huge claim card, then real code in an editor with arrows, then a proof chart, 47–60 s | Python OPTIMIZATION Trick · Trick I HAD to share | 2.4M · 1.7M |
| Core Dumped (515K, faceless) | an everyday question, real footage, 46 s | Why Ctrl-C terminates programs? | 419K |
| Arpit Bhayani (221K) | a consequence in production, face + highlighted captions, 56–60 s | When your database ID hits MAX_INT · Postel's Law | 110K · 246K |
| Fireship (4.32M) | analogy and humour, bold meme captions | Big O explained with a deck of cards | 1.5M |
| **Hussein Nasser (524K) — cautionary** | deep internals, talking head, jargon titles, 105–172 s | ring 3 to ring 0 · Copy on Write needs page faults | **2.5K–10K** |

Inference: depth is not what loses viewers; leading with jargon is. The same depth wins when it opens on
something everyone has seen (a button, a ticket queue, Ctrl-C) or on a consequence (an ID running out),
shows real code, and proves it (a benchmark, a terminal). Nobody winning uses 3D worlds or characters.

Platform signals (secondary sources, treat numbers as rules of thumb): Instagram ranks Reels on watch
time, sends per reach (DM shares, the strongest signal for reaching non-followers) and likes per
reach; YouTube shows Shorts' "viewed vs swiped away" and counts a view on every start or loop since
31 March 2025.

## 3. The format: "Behind the Button"

Every video starts from something the viewer has done (tapped Pay, booked the last seat, liked a post,
scanned a QR code) and opens the backend behind it: the mechanism, the real code, the production
incident, the fix.

Reel / Short, 45–55 s:
1. 0–2 s: one huge claim card over the everyday moment ("2 people. 1 seat. Same millisecond.").
2. 2–8 s: the stakes ("Most booking code gives it to both.").
3. 8–30 s: the mechanism as clean flat 2D diagrams, a new visual every 2–3 s.
4. 30–42 s: the real code in an editor: the bug line, then the fix; a terminal run proves it.
5. 42–50 s: the real incident in one line (e.g. Ticketmaster, Nov 2022: 3.5 billion system requests).
6. last 3 s: the payoff line that loops to the start, and the CTA: comment KEYWORD for the free pack;
   "send this to the friend who…" for sends.

Look: "editor-native": everything looks like a real developer's screen (code editor, terminal, simple
diagrams), high contrast, big centred word-by-word captions; the StackNova emblem only. Nothing from
v1–v3. Titles are a question or a consequence with the search phrase in it.

## 4. Free tools (search-first)

| Need | Tool | Licence |
|---|---|---|
| Motion graphics, code, captions | Remotion (React) + its vendored ECC skill | free for individuals and companies of up to 3 people |
| Voice | Kokoro-82M, local | Apache-2.0; best graded voices are female (af_heart A, af_bella A-); male voices top out at C+ |
| Encode | ffmpeg (installed) | — |

## 5. Pilot topics (pick one)

- A. "Two people book the last seat at the same millisecond. Who gets it?" Race condition in SQL;
  `SELECT` then `UPDATE` vs a conditional `UPDATE … WHERE status = 'free'`; row locks; Ticketmaster
  2022. Keyword SEAT. (Recommended: everyone has queued for tickets; real code and a real incident.)
- B. "You tapped Pay twice. Why weren't you charged twice?" Idempotency keys (episode 001, owner's story).
- C. "Why the like count on a viral post is wrong for a few seconds." Counters, Redis INCR, eventual consistency.

## 6. How we judge the pilot (eval-harness)

Pass if, against our current 0–84 views: YouTube "viewed vs swiped away" ≥ 60%, Instagram 3-second hold
above our earlier 17–37%, and at least one send or keyword comment. Post it for a week of daily
"Behind the Button" Reels before deciding.

## 7. Risks

- Faceless ceiling: most winners show a face; the strongest lever we are not using is a human on screen
  or a human voice.
- Instagram said it will favour raw, human content over AI-generated material in 2026; an AI voice is a
  risk. Mitigation: original visuals, real code runs, owner-written scripts.
- A new channel takes 2–4 weeks of daily posts before the feeds test it widely.
- Instagram grids were not readable (not signed in); its creators were judged by their YouTube Shorts.
