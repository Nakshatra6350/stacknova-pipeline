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

VIEWS went out under another name, "One more view, and the counter goes negative": a Google spokesman said
nothing actually broke at YouTube (its engineers had already moved to 64 bits), so the video doesn't say it
broke. Its real outage is Basecamp, 2018, and its demo is Java + Postgres.

NAME went out as "A billion usernames, and it opens four pages", with Spotify's own write-up as its real
case. I found no primary source that Instagram or Google uses a Bloom filter for usernames, so the video
doesn't say so. Its demo is Go + Postgres on 10 million names; 4 pages at a billion is an estimate, marked
as one, and the Bloom filter was really loaded with a billion names.

TYPING (Tue 3 Nov) went out as "Typing is a real message, and it's built to get lost", with Telegram's and
Discord's own docs as its evidence for the timer, and a WebSocket server written by hand in Node. RESET
(Wed 4 Nov) went out as "Every password was hashed, and every account was still stolen", with GitLab's
CVE-2023-7028 as its real case, in Go + Postgres. That finishes the seven in this table.

Next week's candidates: 10,000 PS5s and no oversell (atomic stock), the nearest driver in
milliseconds (geohash), stories that vanish after 24 h (TTL), the 2021 Facebook outage (BGP, DNS),
why Netflix doesn't buffer (adaptive bitrate).

Platform split: the Instagram Reel ends on "comment KEYWORD for the free guide"; the YouTube Short
gets the same video with a follow ending (YouTube has no comment-to-DM), and its title leads with
the search phrase (e.g. "Race Condition in SQL: Who Gets the Last Seat?").

After the seven: two from that list. DRIVER (Thu 5 Nov) goes out as "Your nearest driver is in the
wrong square": geohash cells, the edge problem and an outward search that's always right, degrees that
shrink (Oslo), and a GiST index on ll_to_earth, in Java + Postgres on 1,000,000 made-up drivers around
five real cities. Uber's own H3 post is its real case (hexagons, surge pricing), and the title says
"apps", not Uber, because the video doesn't show Uber's dispatch. BUFFER (Fri 6 Nov) goes out as
"Netflix tested a player that mostly ignores your internet speed": a bitrate ladder made with ffmpeg
and a player in Go, on simulated connections (said in the video), with Netflix's own A/B test
(SIGCOMM 2014, 10 to 20% fewer rebuffers) as the real-world number.

Then three more from the list, or close to it (owner, 5 Nov: "start making content for 7, 8, 9 Nov"):
CACHE (Sat 7 Nov) "One key expired, and the database got 1,000 queries": a cache stampede on a real
Postgres in Go, with one-request-loads and serve-the-old-value as the fixes, and Facebook's own write-up
of its 2010 outage as the real case. RATE (Sun 8 Nov) "My limit was 100 a minute. 200 got through":
four rate limiters in Node on a virtual clock, a real 429 server, and Stripe's and GitHub's own docs;
the shared store in the race test is simulated, and the guide says so. PAGE (Mon 9 Nov) "Page 1 is
instant. Page 100,000 isn't": OFFSET against keyset in Java on 2,000,000 posts, with Slack's own
write-up as the real case. Atomic stock was dropped as too close to SEAT; TTL stories and the 2021
Facebook outage are still open.
