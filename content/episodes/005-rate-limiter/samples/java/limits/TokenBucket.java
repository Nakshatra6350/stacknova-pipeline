package limits;

/**
 * A token bucket in one process: up to {@code capacity} requests in a burst, refilled at a steady
 * rate. Tokens are added lazily, from the time since the last call, so nothing runs in the
 * background. Episode 005, "Design a rate limiter". Shown in segment s05.
 */
public final class TokenBucket {
    private final double capacity;      // the burst size
    private final double refillPerNano; // the steady rate
    private double tokens;
    private long last;

    public TokenBucket(double capacity, double perSecond) {
        this.capacity = capacity;
        this.refillPerNano = perSecond / 1_000_000_000.0;
        this.tokens = capacity;
        this.last = System.nanoTime();
    }

    public synchronized boolean tryAcquire() {
      long now = System.nanoTime();
      double refill = (now - last) * refillPerNano; // elapsed
      tokens = Math.min(capacity, tokens + refill); // capped
      last = now;
      if (tokens < 1) return false; // empty: reject
      tokens -= 1;                  // one request, one token
      return true;
    }
}
