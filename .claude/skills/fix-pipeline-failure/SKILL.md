---
name: fix-pipeline-failure
description: Diagnose and fix a failed GitHub Actions run of the channel pipeline (render, notify, watch-approvals, publish, refresh-tokens, weekly-report), usually starting from a Telegram failure alert the owner pastes. Use when a workflow failed, a post didn't go out, or Telegram reported an error.
---

# Fix a pipeline failure

1. Identify the run: `gh run list --limit 10` and match the workflow/time in the alert; then `gh run view <id> --log-failed`.
2. Classify:
   - **Credentials** (401/403, invalid_grant, OAuthException) → do NOT try to fix in code. Tell the owner which Setup guide step to redo (6d for YouTube, 7.4–7.5 for Instagram, 5 for Telegram) and which secret to update. Stop.
   - **Platform policy/limit** (quota, rate limit, private-until-audit) → follow `docs/ARCHITECTURE.md`; usually wait or mark `published_manual_pending`.
   - **Content/data** (schema, missing story, caption alignment) → fix the episode via `write-episode`, re-validate.
   - **Code bug** → reproduce locally with `DRY_RUN=true`, write a failing test first, fix, run `uv run pytest && uv run ruff check && uv run mypy src`.
3. Re-run safely: `gh run rerun <id> --failed`. Publishing is idempotent by design — verify `state/queue.json` before re-running publish so nothing double-posts.
4. Write a short entry in `docs/INCIDENTS.md`: date, symptom, cause, fix, prevention.
5. Never bypass the approval check, never edit `state/` by hand to force a publish.
