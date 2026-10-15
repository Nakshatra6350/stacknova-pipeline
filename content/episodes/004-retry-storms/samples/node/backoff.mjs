// Retries with a deadline per attempt, exponential backoff and full jitter, spending each retry
// from a budget. Episode 004 — "Retry storms". Shown in segments s04 and s05.
import { setTimeout as sleep } from 'node:timers/promises';

// Worth another try: no answer at all, overload (503), or "too many requests" (429).
const RETRYABLE = new Set([429, 503]);

export async function callWithBackoff(url, init, budget, opts = {}) {
  const { tries = 4, base = 100, cap = 2_000, timeout = 1_000 } = opts;
  for (let attempt = 0; ; attempt++) {
    let answer;
    try {
      const signal = AbortSignal.timeout(timeout); // deadline
      answer = await fetch(url, { ...init, signal });
      if (!RETRYABLE.has(answer.status)) {
        budget.onSuccess();
        return answer; // an answer we should not repeat
      }
    } catch (err) {
      answer = err; // no answer: a timeout or a network error
    }
    if (attempt + 1 >= tries || !budget.canRetry()) {
      if (answer instanceof Error) throw answer;
      return answer; // out of tries or budget: fail fast
    }
    const ceiling = Math.min(cap, base * 2 ** attempt);
    await sleep(Math.random() * ceiling); // full jitter
  }
}
