# Review — episode 001, version 2 (14 October 2026)

Scope: the four Go walkthroughs added to the long video (s04, s05, s07, s08) and their samples
under `samples/go/`. The rest of the episode was reviewed with version 1.

## Blockers

None left. One was found and fixed before the render:

- **s05** said "Go's standard library has no UUID type". Go 1.27, released on 19 August 2026,
  added the `uuid` package (go.dev/doc/go1.27), so the claim was false for the current
  version, and the docs still named Go 1.26. Fixed: the client listing uses
  `uuid.NewV4().String()`, the narration says Go 1.27 added the package, `go.mod` and
  `target_versions` say 1.27, and CLAUDE.md, CONTENT_RULES and write-episode name Go 1.27.

## Should fix

- **s08**: one new sentence ran to 26 words (limit 25 for captions and the voice). Fixed: split
  in two.
- **s05, s06, s10** (from version 1): the key table has `key` as its primary key on its own.
  A production table scopes keys by account (`PRIMARY KEY (account_id, key)`), so one client's
  key can never replay another client's saved response; Stripe scopes keys per account. The
  fingerprint check limits the damage but does not remove it: the same body under a
  colliding key would replay someone else's answer. Add one sentence and the composite key.
  Not done: it changes s06, which Short 2 is cut from, so it waits for the owner's word.
- **s05 `client.go`**: `req, _ := http.NewRequest(...)` drops an error. It can only fail on a
  malformed method or URL, and the sample says so, but a viewer could copy the habit.
  Acceptable for a ten-line listing; the narration does not claim otherwise.

## Nice to have

- **s08**: the background job that asks the gateway what happened is described, not shown. A
  later episode on reconciliation could show it.
- **s05**: the loop retries only on silence. The sample's comment says real clients also retry
  409 and 503 with the same key; the narration could say so in one sentence.

## Checked and fine

- Four walkthroughs, all Go, each an excerpt of a sample listed in `code_samples` with
  `shown_in`, each explained line by line with `show`, `highlight` and `note` steps. None of
  s04, s05, s07, s08 is cut into a Short, so the Shorts are unchanged.
- Samples: `go vet` and `go build` were clean on Go 1.24 before the switch to `uuid`; CI's
  samples job builds them on the current Go (1.27), since this machine has 1.24.
- Claims with sources: `http.Client.Do` returns no error for a non-2xx answer and the
  Transport closes the request body (pkg.go.dev/net/http#Client.Do); `uuid.NewV4` is a random
  version 4 UUID (pkg.go.dev/uuid#NewV4).
- Every `at` and `emphasis` phrase is in its narration (the validator checks); all listing
  lines are within 10 lines of 60 characters; each code scene draws inside the landscape
  content area.
- Narration 1,429 words, about 10 minutes, inside the 1,100–2,200 target.
