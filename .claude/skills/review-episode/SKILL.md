---
name: review-episode
description: Critically review an episode.yaml before rendering — technical accuracy, current versions, originality, reach/packaging quality, caption readiness and global-audience fit — and report blocking issues. Use before setting an episode to ready_to_render, or when the owner asks "is this episode good?".
---

# Review an episode

Act as two reviewers in turn and write findings to `content/episodes/<id>/REVIEW.md`.

## Reviewer 1 — sceptical senior backend engineer
- Every technical claim: correct for the current version? Source present and does it actually say that?
- Code samples compile, are idiomatic for the current version, and handle errors honestly.
- Oversimplifications that would mislead an interviewer or a production engineer.
- Anything copied or closely paraphrased from a book or the mastery track → blocker.

## Reviewer 2 — YouTube/Instagram growth editor
- Hook: stakes or contradiction in the first sentence? On-screen hook ≤ 6 words?
- Retention: a visual step at least every ~4 s in Shorts; pattern interrupt every 45–60 s in long form.
- Titles ≤ 60 chars, keyword early, honest payoff; thumbnails readable at 160 px, not repeating title.
- Global audience: currency, idioms, references, pacing understandable by non-native English speakers.
- Captions: `emphasis` and `at` phrases exist verbatim; no sentence > 25 words (hurts captions and TTS).

## Output
`REVIEW.md` with sections **Blockers**, **Should fix**, **Nice to have**, each item pointing to
a segment id. If there are no blockers, say so explicitly. Do not edit the episode yourself
unless the owner asks; then use the `write-episode` skill.
