// Why the 101st request gets a 429, and why some limits let 200 through
// (look v4 #11). Every number in the video and the guide comes from here:
//
//   node main.mjs boundary   // 100 just before the minute ends, 100 just after
//   node main.mjs worst      // a client that never stops: the most let through
//   node main.mjs noisy      // one loud account against 100 quiet ones
//   node main.mjs servers    // 4 app servers, each counting on its own
//   node main.mjs race       // 50 requests at once on the last request left
//   node main.mjs memory     // what each limiter keeps, for 100,000 accounts
//   node main.mjs http       // a real server answering 429
//
// Node 22, nothing to install. Every test but http runs on a virtual clock.
import { FixedWindow, SlidingCounter, SlidingLog, TokenBucket } from "./limiters.mjs";
import { Store, incrThenCheck, readThenWrite } from "./store.mjs";
import { startServer } from "./server.mjs";

const MINUTE = 60_000;
const limiters = () => [
  ["fixed window", new FixedWindow(100, MINUTE)],
  ["sliding log", new SlidingLog(100, MINUTE)],
  ["sliding counter", new SlidingCounter(100, MINUTE)],
  ["token bucket, burst 100", new TokenBucket(100, MINUTE, 100)],
  ["token bucket, burst 10", new TokenBucket(100, MINUTE, 10)],
];
const fmt = (n) => n.toLocaleString("en-US");

// 100 requests in the last second of a minute, 100 in the first of the next.
function boundary() {
  for (const [name, l] of limiters()) {
    let ok = 0;
    for (let i = 0; i < 100; i++) ok += l.allow("acme", 59_000 + i * 10);
    for (let i = 0; i < 100; i++) ok += l.allow("acme", 60_000 + i * 10);
    console.log(`${name.padEnd(24)} let ${ok} of 200 through in 2 seconds`);
  }
}

// A client that tries every millisecond for 10 minutes. What's the most each
// limiter lets through in any 2 seconds, and in any 60?
function worst() {
  for (const [name, l] of limiters()) {
    const times = [];
    for (let t = 30_000; t < 30_000 + 10 * MINUTE; t++) {
      if (l.allow("acme", t)) times.push(t);
    }
    const most = (span) => {
      let best = 0;
      for (let i = 0, j = 0; j < times.length; j++) {
        while (times[j] - times[i] >= span) i++;
        best = Math.max(best, j - i + 1);
      }
      return best;
    };
    console.log(`${name.padEnd(24)} most in any 2 s: ${String(most(2000)).padStart(3)}` +
      `   in any 60 s: ${String(most(MINUTE)).padStart(3)}   in 10 min: ${fmt(times.length)}`);
  }
}

// 100 quiet accounts send one request every 2 seconds (30 a minute each).
// One loud account sends 100 a second. The API can take 5,000 a minute.
function noisy() {
  const run = (name, allow) => {
    let quietSent = 0, quietRefused = 0, loudSent = 0, loudOk = 0;
    for (let t = 0; t < 5 * MINUTE; t += 10) {
      if (t % 20 === 0) { // the quiet ones take turns: each once in 2 s
        const who = `quiet-${(t / 20) % 100}`;
        quietSent++;
        if (!allow(who, t)) quietRefused++;
      }
      loudSent++; // the loud one, every 10 ms
      if (allow("loud", t)) loudOk++;
    }
    console.log(`${name.padEnd(30)} quiet accounts refused ${fmt(quietRefused)} of ` +
      `${fmt(quietSent)} (${(100 * quietRefused / quietSent).toFixed(1)}%); ` +
      `loud let through ${fmt(loudOk)} of ${fmt(loudSent)}`);
  };
  const global = new FixedWindow(5000, MINUTE);
  run("one limit for everybody", (who, t) => global.allow("everyone", t));
  const each = new FixedWindow(100, MINUTE);
  const all = new FixedWindow(5000, MINUTE);
  run("100 a minute per account", (who, t) => each.allow(who, t) && all.allow("everyone", t));
}

// 4 app servers behind a load balancer. A client sends 1,000 requests in one
// minute, round robin. Counting on each server, then in one shared store.
async function servers() {
  const own = [0, 1, 2, 3].map(() => new FixedWindow(100, MINUTE));
  let ok = 0;
  for (let i = 0; i < 1000; i++) ok += own[i % 4].allow("acme", i * 50);
  console.log(`each server counts alone: ${ok} of 1,000 let through (limit 100)`);
  const store = new Store(1);
  ok = 0;
  for (let i = 0; i < 1000; i++) ok += await incrThenCheck(store, "acme:0", 100);
  console.log(`one shared count:         ${ok} of 1,000 let through (limit 100)`);
}

// 99 of 100 used. 50 requests arrive at once on different servers. Read then
// write lets many through; one atomic step lets exactly one.
async function race() {
  for (const [name, allow] of [["read, check, write", readThenWrite],
    ["one atomic increment", incrThenCheck]]) {
    const through = [];
    for (let trial = 0; trial < 100; trial++) {
      const store = new Store(1);
      store.data.set("acme:0", 99);
      const answers = await Promise.all(
        Array.from({ length: 50 }, () => allow(store, "acme:0", 100)));
      through.push(answers.filter(Boolean).length);
    }
    const min = Math.min(...through), max = Math.max(...through);
    console.log(`${name.padEnd(22)} 1 request left, 50 at once: ${min === max ? min :
      `${min} to ${max}`} let through (100 trials)`);
  }
}

// 100,000 accounts, each at 100 requests this minute. What does each limiter
// keep in memory? (Run with --expose-gc for a clean measure.)
function memory() {
  for (const [name, make] of [["fixed window", () => new FixedWindow(100, MINUTE)],
    ["sliding log", () => new SlidingLog(100, MINUTE)],
    ["sliding counter", () => new SlidingCounter(100, MINUTE)],
    ["token bucket", () => new TokenBucket(100, MINUTE, 100)]]) {
    globalThis.gc?.();
    const before = process.memoryUsage().heapUsed;
    const l = make();
    for (let a = 0; a < 100_000; a++) {
      for (let i = 0; i < 100; i++) l.allow(`account-${a}`, 1000 + i);
    }
    globalThis.gc?.();
    const bytes = process.memoryUsage().heapUsed - before;
    console.log(`${name.padEnd(16)} ${(bytes / 1e6).toFixed(1).padStart(6)} MB for ` +
      `100,000 accounts (${Math.round(bytes / 100_000)} bytes each)`);
    l.keys.clear();
  }
}

// A real server on localhost. acme sends 150 requests as fast as it can,
// then beta sends 10. Who gets a 429?
async function http() {
  const server = await startServer();
  const url = `http://127.0.0.1:${server.address().port}/v1/orders`;
  const send = (account) => fetch(url, { headers: { "x-api-key": account } });
  for (const [account, n] of [["acme", 150], ["beta", 10]]) {
    const codes = {};
    let refused;
    for (let i = 0; i < n; i++) {
      const res = await send(account);
      codes[res.status] = (codes[res.status] ?? 0) + 1;
      if (res.status === 429 && !refused) {
        refused = { request: i + 1, retryAfter: res.headers.get("retry-after"),
          body: await res.text() };
      } else {
        await res.text();
      }
    }
    console.log(`${account}: ${n} requests -> ${JSON.stringify(codes)}` +
      (refused ? `; first 429 was request ${refused.request}, Retry-After: ` +
        `${refused.retryAfter}, body ${refused.body}` : ""));
  }
  server.close();
}

const modes = { boundary, worst, noisy, servers, race, memory, http };
const mode = modes[process.argv[2] ?? "boundary"];
if (!mode) throw new Error(`modes: ${Object.keys(modes).join(", ")}`);
await mode();
