// Four ways to allow `limit` requests per `windowMs`, kept per key (one key
// per account, never one for everybody). Each takes the time `now` in ms, so
// the tests can run on a virtual clock and give the same answer every time.

// Fixed window: count this minute's requests; start again at 0 each minute.
export class FixedWindow {
  constructor(limit, windowMs) {
    Object.assign(this, { limit, windowMs, keys: new Map() });
  }
  allow(key, now) {
    const window = Math.floor(now / this.windowMs);
    let s = this.keys.get(key);
    if (!s || s.window !== window) {
      s = { window, count: 0 };
      this.keys.set(key, s);
    }
    if (s.count >= this.limit) return false;
    s.count++;
    return true;
  }
}

// Sliding log: keep the time of every request; count the last window's.
export class SlidingLog {
  constructor(limit, windowMs) {
    Object.assign(this, { limit, windowMs, keys: new Map() });
  }
  allow(key, now) {
    const log = this.keys.get(key) ?? [];
    while (log.length && log[0] <= now - this.windowMs) log.shift();
    this.keys.set(key, log);
    if (log.length >= this.limit) return false;
    log.push(now);
    return true;
  }
}

// Sliding counter: this window's count, plus the part of the last window's
// that still falls inside the past 60 seconds (assuming it was spread out).
export class SlidingCounter {
  constructor(limit, windowMs) {
    Object.assign(this, { limit, windowMs, keys: new Map() });
  }
  allow(key, now) {
    const window = Math.floor(now / this.windowMs);
    let s = this.keys.get(key) ?? { window, count: 0, prev: 0 };
    if (s.window !== window) {
      const prev = s.window === window - 1 ? s.count : 0;
      s = { window, count: 0, prev };
    }
    this.keys.set(key, s);
    const left = 1 - (now % this.windowMs) / this.windowMs;
    if (s.prev * left + s.count >= this.limit) return false;
    s.count++;
    return true;
  }
}

// Token bucket: tokens drip in at `limit` per window, up to `burst`, and
// each request takes one. Two numbers per key, whatever the limit.
export class TokenBucket {
  constructor(limit, windowMs, burst = limit) {
    Object.assign(this, { limit, windowMs, burst, keys: new Map() });
  }
  allow(key, now) {
    const b = this.keys.get(key) ?? { tokens: this.burst, at: now };
    const perMs = this.limit / this.windowMs;
    b.tokens = Math.min(this.burst, b.tokens + (now - b.at) * perMs);
    b.at = now;
    this.keys.set(key, b);
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }
  // how long until the next token: what Retry-After should say
  waitMs(key, now) {
    const b = this.keys.get(key);
    if (!b) return 0;
    const perMs = this.limit / this.windowMs;
    const tokens = Math.min(this.burst, b.tokens + (now - b.at) * perMs);
    return tokens >= 1 ? 0 : Math.ceil((1 - tokens) / perMs);
  }
}
