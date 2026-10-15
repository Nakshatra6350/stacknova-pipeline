// A circuit breaker. After `threshold` failures in a row the circuit opens: calls fail at once,
// without reaching the struggling service, until the cooldown ends. Then one call goes through
// as a probe: success closes the circuit, failure opens it again.
// Episode 004 — "Retry storms". Shown in segment s07.
export class Breaker {
  #failures = 0;
  #openedAt = 0;
  #probing = false;

  constructor({ threshold = 5, cooldownMs = 10_000 } = {}) {
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
  }

  async call(fn) {
    if (this.#failures >= this.threshold) {
      const waited = Date.now() - this.#openedAt;
      if (waited < this.cooldownMs || this.#probing) {
        throw new Error('circuit open: failing fast');
      }
      this.#probing = true; // half-open: one probe
    }
    try {
      const result = await fn();
      this.#failures = 0; // closed again
      return result;
    } catch (err) {
      this.#failures += 1;
      if (this.#failures >= this.threshold) {
        this.#openedAt = Date.now(); // open
      }
      throw err;
    } finally {
      this.#probing = false;
    }
  }
}
