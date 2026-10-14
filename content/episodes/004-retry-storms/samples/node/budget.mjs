// A retry budget: a bucket of tokens. Every retry spends one; every success puts back a tenth of
// one. While calls succeed the bucket stays full; when everything fails it empties, and the
// client stops retrying instead of multiplying the load. Keep one budget per downstream service,
// so a noisy caller can't spend everyone's retries.
// Tokens are counted in tenths, as whole numbers: ten additions of 0.1 make 0.9999999999999999,
// and a budget that never quite refills is a bug.
// Episode 004 — "Retry storms". Shown in segment s06.
export class RetryBudget {
  #tenths;
  #max;

  constructor(tokens = 10) {
    this.#max = tokens * 10;
    this.#tenths = this.#max;
  }

  canRetry() {
    if (this.#tenths < 10) return false; // empty: fail fast
    this.#tenths -= 10; // a retry costs a token
    return true;
  }

  onSuccess() {
    const refilled = this.#tenths + 1; // a tenth back
    this.#tenths = Math.min(this.#max, refilled);
  }
}
