// A real HTTP API with a limit per account: 100 requests a minute, in
// bursts of up to 100. Over the limit, it answers 429 Too Many Requests and
// says when to come back.
import http from "node:http";
import { TokenBucket } from "./limiters.mjs";

export function startServer(limiter = new TokenBucket(100, 60_000, 100)) {
  const server = http.createServer((req, res) => {
    const account = req.headers["x-api-key"]; // the limit is per account
    if (!account) {
      res.writeHead(401).end();
      return;
    }
    const now = Date.now();
    if (!limiter.allow(account, now)) {
      const wait = Math.ceil(limiter.waitMs(account, now) / 1000);
      res.writeHead(429, {
        "retry-after": String(wait), // seconds, as HTTP defines it
        "x-ratelimit-limit": "100",
        "x-ratelimit-remaining": "0",
      });
      res.end(JSON.stringify({ error: "too many requests",
        retry_after: wait }));
      return;
    }
    const left = Math.floor(limiter.keys.get(account).tokens);
    res.writeHead(200, {
      "x-ratelimit-limit": "100",
      "x-ratelimit-remaining": String(left),
    });
    res.end(JSON.stringify({ ok: true }));
  });
  return new Promise((ready) =>
    server.listen(0, "127.0.0.1", () => ready(server)));
}
