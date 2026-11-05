// A shared store a millisecond away, standing in for Redis on another
// machine: every call is one round trip, and every app server sees the same
// counts. (Simulated in this process, so the tests need nothing installed.)
export class Store {
  constructor(latencyMs = 1) {
    Object.assign(this, { latencyMs, data: new Map(), calls: 0 });
  }
  #trip() {
    this.calls++;
    return new Promise((done) => setTimeout(done, this.latencyMs));
  }
  async get(key) {
    await this.#trip();
    return this.data.get(key) ?? 0;
  }
  async set(key, value) {
    await this.#trip();
    this.data.set(key, value);
  }
  // Add one and return the new count, in one step on the store, like Redis
  // INCR: two callers can never both see the same count.
  async incr(key) {
    await this.#trip();
    const count = (this.data.get(key) ?? 0) + 1;
    this.data.set(key, count);
    return count;
  }
}

// A fixed window kept in the store, the obvious way: read, check, write.
// Two round trips, and between them other servers read the same count.
export async function readThenWrite(store, key, limit) {
  const count = await store.get(key);
  if (count >= limit) return false;
  await store.set(key, count + 1);
  return true;
}

// The same window in one atomic step: count first, then check the answer.
export async function incrThenCheck(store, key, limit) {
  return (await store.incr(key)) <= limit;
}
