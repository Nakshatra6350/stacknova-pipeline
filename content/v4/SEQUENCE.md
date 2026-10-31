# Look v4: posting order from 1 November 2026 (proposal for the owner)

The owner's direction (29 Oct 2026): post daily from 1 November; each video covers one whole topic,
so its free PDF (keyword in the comments → automated DM) can be offered the same day. Topics alternate
areas so no two days feel alike, and each opens on something the viewer has done or seen. Every
claim is fact-checked and every code demo is run before its video is made.

| Day | Behind the button | What it teaches | Real code + proof | Real case | Keyword |
|---|---|---|---|---|---|
| Sun 1 Nov | Two people book the last seat | race conditions, row locks, conditional UPDATE | Go + Postgres: 999/1,000 sold twice → 0 | Ticketmaster Eras Tour presale, Nov 2022 | SEAT |
| Mon 2 Nov | You tapped Pay twice, charged once | idempotency keys, unique constraints | Go: a retried charge, with and without a key | Stripe's Idempotency-Key header | PAY |
| Tue 3 Nov | Why your OTP dies in 30 seconds | TOTP (RFC 6238): HMAC + a time step | 15 lines that match an authenticator app | — | OTP |
| Wed 4 Nov | The view counter that broke at 2,147,483,647 | int32 overflow, BIGINT, choosing ID types | Java: an int counter wrapping negative | YouTube, Gangnam Style, Dec 2014 | VIEWS |
| Thu 5 Nov | "Username taken" in 1 ms among a billion | B-tree unique index, Bloom filters | a Bloom filter in ~20 lines, false-positive rate | — | NAME |
| Fri 6 Nov | Why "typing…" shows up instantly | WebSockets, presence, heartbeats | Node: a typing indicator over a socket | — | TYPING |
| Sat 7 Nov | The password-reset link that only works once | single-use tokens, hashing, expiry | Go: store the hash, not the token | — | RESET |

What actually happened: the owner started early, so the dates above moved up. SEAT went out on 29 Oct,
PAY on 30 Oct, and OTP is posted on Sat 31 Oct. At one a day, the rest follow: VIEWS Sun 1 Nov, NAME Mon 2 Nov,
TYPING Tue 3 Nov, RESET Wed 4 Nov.

Next week's candidates: 10,000 PS5s and no oversell (atomic stock), the nearest driver in
milliseconds (geohash), stories that vanish after 24 h (TTL), the 2021 Facebook outage (BGP, DNS),
why Netflix doesn't buffer (adaptive bitrate).

Platform split: the Instagram Reel ends on "comment KEYWORD for the free guide"; the YouTube Short
gets the same video with a follow ending (YouTube has no comment-to-DM), and its title leads with
the search phrase (e.g. "Race Condition in SQL: Who Gets the Last Seat?").
