# Episode 001 — changes

## Version 2 (14 October 2026)

The owner: "right now everything is theoritical, add code snippets also and explain them to
properly understand the concept" (long videos only). Four Go walkthroughs, each explained line
by line, in segments no Short is cut from, so the five Shorts are unchanged:

- s04 `naive.go`: the create-payment handler most of us write first, and the check it lacks.
- s05 `client.go`: one key made before the retry loop, the same key on every attempt; the
  request built again each time; retry only on silence.
- s07 `idempotency.go`: the replay, in the order the handler checks it (422 for a reused key,
  409 while the first request runs, else the saved answer).
- s08 `idempotency.go`: the key passed to the gateway, and what to do when its outcome is
  unknown.

The existing SQL listing in s06 stays. New samples `naive.go` and `client.go`; `idempotency.go`
reordered so each listing is a contiguous excerpt. Sources and fact-check entries for
`crypto/rand.Text` and `http.Client.Do`. Narration 1,434 words (was about 1,110).

## Version 1

The first draft, in the night agent's format.
