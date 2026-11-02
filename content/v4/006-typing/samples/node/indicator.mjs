// The typing indicator itself: one small class on each side. The clock is passed
// in, so the tests can run a day of typing in a moment.

// The person typing: tell the room, at most once every few seconds.
export class TypingSender {
  constructor(send, { every = 3000, now = Date.now } = {}) {
    this.send = send;
    this.every = every;
    this.now = now;
    this.last = -Infinity;
  }
  onKey() {
    const t = this.now();
    if (t - this.last < this.every) return; // they already know
    this.last = t;
    this.send({ t: "typing" });
  }
  onMessageSent() {
    this.last = -Infinity; // the next key starts fresh
  }
}

// Everyone else: a name stays on screen only while its timer runs.
export class TypingView {
  constructor({ ttl = 5000, now = Date.now } = {}) {
    this.ttl = ttl;
    this.now = now;
    this.until = new Map();
  }
  heard(who) {
    this.until.set(who, this.now() + this.ttl);
  }
  messageFrom(who) {
    this.until.delete(who); // the message is here: stop saying "typing"
  }
  typing() {
    const t = this.now();
    for (const [who, until] of this.until) {
      if (until <= t) this.until.delete(who); // no word for too long: gone
    }
    return [...this.until.keys()];
  }
}
