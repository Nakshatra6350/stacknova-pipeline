// Why "typing..." shows up instantly (look v4 #6): the same signal four ways, what
// happens when a phone dies mid-word, and how a server notices. All real sockets
// on one machine, with no network in between, so the times are the code's own.
//
//   node --expose-gc main.mjs handshake   // the real bytes of the handshake
//   node --expose-gc main.mjs compare     // polling, long polling, SSE, WebSocket
//   node --expose-gc main.mjs stuck       // the "stop" that never comes
//   node --expose-gc main.mjs clears      // a message should clear the indicator
//   node --expose-gc main.mjs throttle    // how often to send, how long to show
//   node --expose-gc main.mjs silent      // sending to a phone that has gone
//   node --expose-gc main.mjs heartbeat   // finding those phones
//   node --expose-gc main.mjs slow        // one slow reader, and what to drop
//   node --expose-gc main.mjs fanout      // one sender, a big room
//   node --expose-gc main.mjs memory      // what an idle connection costs
//   node --expose-gc main.mjs storm       // everyone reconnects at once
//   node --expose-gc main.mjs twoservers  // sender and receiver on two servers
//   node --expose-gc main.mjs flap        // online, offline, online
//   node --expose-gc main.mjs guard       // origin, spoofed names, other rooms
import { fork } from "node:child_process";
import net from "node:net";
import { randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import http from "node:http";
import { TypingSender, TypingView } from "./indicator.mjs";
import { acceptKey, frame, maskedFrame, readFrames, wsServer, TEXT, PING, PONG }
  from "./ws.mjs";

const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const between = (lo, hi) => lo + Math.random() * (hi - lo);
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const pct = (xs, p) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * p)];
const inBatches = async (items, size, f) => {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(f));
  }
};

// The server, in its own process, so its work doesn't blur the timings.
async function startChat(port) {
  const child = fork(new URL("./chat.mjs", import.meta.url), [],
    { execArgv: ["--expose-gc"] });
  const ask = (cmd) => new Promise((done) => {
    child.once("message", done);
    child.send(cmd);
  });
  const { port: p } = await ask({ cmd: "listen", port });
  return { port: p, ask, stop: () => child.kill() };
}

// A plain socket that does the client's half of the handshake by hand.
function rawClient(port, path = "/ws?room=0", headers = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1");
    const key = randomBytes(16).toString("base64");
    const client = { socket, frames: [], onText: null, status: 0, left: null };
    socket.setNoDelay(true);
    socket.on("error", reject);
    socket.once("connect", () => {
      const extra = Object.entries(headers).map(([k, v]) => `${k}: ${v}\r\n`);
      socket.write(`GET ${path} HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\n` +
        `Connection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\n` +
        `Sec-WebSocket-Version: 13\r\n${extra.join("")}\r\n`);
    });
    let head = Buffer.alloc(0);
    const onData = (chunk) => {
      head = Buffer.concat([head, chunk]);
      const end = head.indexOf("\r\n\r\n");
      if (end < 0) return;
      socket.off("data", onData);
      client.status = Number(head.toString().split(" ")[1]);
      client.left = head.subarray(end + 4);
      socket.on("data", (d) => {
        client.left = readFrames(Buffer.concat([client.left, d]), (op, body) => {
          if (op === TEXT) client.onText?.(body.toString());
          if (op === PING && !client.gone) socket.write(maskedFrame(body, PONG));
        });
      });
      resolve(client);
    };
    socket.on("data", onData);
  });
}
const sendText = (client, text) => client.socket.write(maskedFrame(text));
// Gone without a word: no FIN, no close, nothing. Just never heard from again.
const vanish = (client) => { client.gone = true; client.socket.pause(); };

// ------------------------------------------------------------------ handshake
async function handshake() {
  const sample = "dGhlIHNhbXBsZSBub25jZQ==";
  console.log(`RFC 6455's example: ${sample} -> ${acceptKey(sample)}`);
  const server = wsServer({ onMessage: (c, t) => c.send(t) });
  await new Promise((up) => server.listen(0, "127.0.0.1", up));
  const { port } = server.address();
  // first, the real bytes
  const raw = net.connect(port, "127.0.0.1");
  const request = `GET /ws?room=7 HTTP/1.1\r\nHost: chat.example\r\n` +
    `Upgrade: websocket\r\nConnection: Upgrade\r\n` +
    `Sec-WebSocket-Key: ${sample}\r\nSec-WebSocket-Version: 13\r\n\r\n`;
  raw.write(request);
  const reply = await new Promise((done) => raw.once("data", done));
  console.log(`--- client sends (${request.length} bytes)\n${request.trim()}`);
  console.log(`--- server answers (${reply.length} bytes)\n${reply.toString().trim()}`);
  const signal = '{"t":"typing"}';
  const out = maskedFrame(signal), back = frame(signal);
  console.log(`--- the typing signal: ${signal.length} bytes of JSON`);
  console.log(`client to server: ${out.length} bytes, ${out.toString("hex")}`);
  console.log(`server to client: ${back.length} bytes, ${back.toString("hex")}`);
  raw.destroy();
  // then Node's own client, so we know the server really speaks the protocol
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?room=7`);
  await new Promise((up) => { ws.onopen = up; });
  const echoed = await new Promise((done) => {
    ws.onmessage = (e) => done(e.data);
    ws.send(signal);
  });
  console.log(`Node's built-in WebSocket client connected, and got back: ${echoed}`);
  ws.close();
  server.close();
  server.closeAllConnections?.();
}

// -------------------------------------------------------------------- compare
const PAIRS = 500, SECONDS = 15;
const agent = new http.Agent({ keepAlive: true, maxSockets: Infinity });
function request(port, method, path, body) {
  return new Promise((done, fail) => {
    const req = http.request({ port, host: "127.0.0.1", method, path, agent }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (d) => { text += d; });
      res.on("end", () => done(text));
    });
    req.on("error", fail);
    req.end(body);
  });
}

// Each room: one person typing, one watching. A signal every 3 s, at random.
async function runApproach(label, chat, connect, signal) {
  await chat.ask({ cmd: "reset" });
  const latency = [];
  const heard = (text) => {
    for (const m of JSON.parse(`[${text}]`).flat()) {
      latency.push(performance.now() - m.at);
    }
  };
  const stops = [];
  const rooms = Array.from({ length: PAIRS }, (_, i) => i);
  await inBatches(rooms, 50, async (i) => { stops.push(await connect(i, heard)); });
  await chat.ask({ cmd: "stats" }); // start counting from here
  const start = await chat.ask({ cmd: "stats" });
  let sent = 0;
  const timers = rooms.map((i) => {
    const fire = () => {
      sent++;
      signal(i, JSON.stringify({ t: "typing", from: `u${i}`, at: performance.now() }));
    };
    const first = setTimeout(() => {
      fire();
      timers[i].repeat = setInterval(fire, 3000);
    }, between(0, 3000));
    return { first };
  });
  await wait(SECONDS * 1000);
  for (const t of timers) { clearTimeout(t.first); clearInterval(t.repeat); }
  await wait(1200); // anything still on its way
  const end = await chat.ask({ cmd: "stats" });
  for (const stop of stops) stop();
  const reqs = end.requests - start.requests;
  console.log(`${label.padEnd(18)} avg ${avg(latency).toFixed(1).padStart(6)} ms, ` +
    `p99 ${pct(latency, 0.99).toFixed(1).padStart(6)} ms, ` +
    `${(reqs / SECONDS).toFixed(0).padStart(5)} requests/s, ` +
    `${String(((end.emptyReplies - start.emptyReplies) * 100 / Math.max(reqs, 1)).toFixed(0)).padStart(3)}% empty, ` +
    `${((end.bytes - start.bytes) / Math.max(latency.length, 1)).toFixed(0).padStart(5)} bytes a signal ` +
    `(${latency.length} of ${sent} delivered)`);
}

function poller(port, every) {
  return (room, heard) => {
    let on = true;
    const tick = async () => {
      while (on) {
        const text = await request(port, "GET", `/poll?room=${room}`);
        if (text !== "[]") heard(text);
        await wait(every);
      }
    };
    setTimeout(tick, between(0, every));
    return () => { on = false; };
  };
}

async function compare() {
  const chat = await startChat();
  const { port } = chat;
  const post = (i, body) => request(port, "POST", `/typing?room=${i}`, body);
  await runApproach("poll every 1 s", chat, poller(port, 1000), post);
  await runApproach("poll every 250 ms", chat, poller(port, 250), post);
  await runApproach("long polling", chat, (room, heard) => {
    let on = true;
    (async () => {
      while (on) {
        const text = await request(port, "GET", `/wait?room=${room}`);
        if (on && text !== "[]") heard(text);
      }
    })().catch(() => {});
    return () => { on = false; };
  }, post);
  await runApproach("server-sent events", chat, (room, heard) => new Promise((up) => {
    const req = http.get({ port, host: "127.0.0.1", path: `/events?room=${room}`, agent: false }, (res) => {
      res.setEncoding("utf8");
      res.on("data", (d) => {
        for (const part of d.split("\n\n")) {
          if (part.startsWith("data: ")) heard(part.slice(6));
        }
      });
      up(() => req.destroy());
    });
    req.on("error", () => {});
  }), post);
  const senders = [];
  await runApproach("WebSocket", chat, async (room, heard) => {
    const watcher = await rawClient(port, `/ws?room=${room}`);
    const typist = await rawClient(port, `/ws?room=${room}`);
    watcher.onText = heard;
    senders[room] = typist;
    return () => { watcher.socket.destroy(); typist.socket.destroy(); };
  }, (i, body) => sendText(senders[i], body));
  chat.stop();
  agent.destroy();
}

// ---------------------------------------------------------------------- stuck
// A typist leaves three ways; the watcher runs with or without a timer.
async function stuck() {
  const N = 1000;
  const TTL = 5000;
  for (const closeHandler of [false, true]) {
    for (const leave of ["sends stop", "closes the tab", "phone dies"]) {
      const rooms = new Map();
      const server = wsServer({
        onOpen: (c) => {
          c.room = new URL(c.req.url, "http://x").searchParams.get("room");
          if (!rooms.has(c.room)) rooms.set(c.room, new Set());
          rooms.get(c.room).add(c);
        },
        onMessage: (c, t) => {
          for (const o of rooms.get(c.room)) if (o !== c) o.send(t);
        },
        onClose: (c) => {
          rooms.get(c.room).delete(c);
          if (!closeHandler) return;
          for (const o of rooms.get(c.room)) o.send('{"t":"stop"}');
        },
      });
      await new Promise((up) => server.listen(0, "127.0.0.1", up));
      const { port } = server.address();
      const withTimer = [], noTimer = [], typists = [];
      await inBatches(Array.from({ length: N }, (_, i) => i), 50, async (i) => {
        const watch = await rawClient(port, `/ws?room=${i}`);
        const timed = new TypingView({ ttl: TTL });
        const forever = new TypingView({ ttl: Infinity });
        withTimer[i] = timed;
        noTimer[i] = forever;
        watch.onText = (text) => {
          const m = JSON.parse(text);
          if (m.t === "typing") { timed.heard("u"); forever.heard("u"); }
          if (m.t === "stop") { timed.messageFrom("u"); forever.messageFrom("u"); }
        };
        typists[i] = await rawClient(port, `/ws?room=${i}`);
      });
      for (const t of typists) sendText(t, '{"t":"typing"}');
      await wait(300);
      const during = noTimer.filter((v) => v.typing().length).length;
      for (const t of typists) {
        if (leave === "sends stop") sendText(t, '{"t":"stop"}');
        if (leave === "closes the tab") t.socket.end();
        if (leave === "phone dies") vanish(t);
      }
      await wait(TTL + 1000);
      console.log(`close handler ${closeHandler ? "yes" : "no "}, ${leave.padEnd(15)}` +
        `showing while typing ${during}, stuck after ${(TTL + 1000) / 1000} s: ` +
        `no timer ${noTimer.filter((v) => v.typing().length).length}, ` +
        `timer ${withTimer.filter((v) => v.typing().length).length}`);
      server.closeAllConnections?.();
      for (const set of rooms.values()) for (const c of set) c.drop();
      server.close();
    }
  }
}

// --------------------------------------------------------------------- clears
function clears() {
  let clock = 0;
  const now = () => clock;
  let plain = 0, cleared = 0;
  for (let i = 0; i < 1000; i++) {
    const a = new TypingView({ now }), b = new TypingView({ now });
    a.heard("u"); b.heard("u");
    clock += 1000;
    b.messageFrom("u"); // the message arrives; only b clears
    if (a.typing().length) plain++;
    if (b.typing().length) cleared++;
    clock += 10000;
  }
  console.log(`message arrived, still says typing: ${plain} of 1000 without clearing, ` +
    `${cleared} of 1000 with`);
}

// ------------------------------------------------------------------- throttle
// A simulated clock and real indicator code: 1,000 people type for 30 s each.
function session() {
  const keys = [];
  let t = 0;
  while (t < 30000) {
    keys.push(t);
    const r = Math.random();
    t += r < 0.02 ? between(4000, 9000) : r < 0.2 ? between(300, 1200) : 120;
  }
  return keys;
}
function throttle() {
  const sessions = Array.from({ length: 1000 }, session);
  const keys = avg(sessions.map((s) => s.length));
  console.log(`people typing: ${keys.toFixed(0)} keys in 30 s on average`);
  for (const every of [0, 1000, 3000, 5000]) {
    const sent = avg(sessions.map((s) => {
      let clock = 0, n = 0;
      const sender = new TypingSender(() => n++, { every, now: () => clock });
      for (const k of s) { clock = k; sender.onKey(); }
      return n;
    }));
    console.log(`send ${every ? `at most every ${every} ms` : "on every key"}`.padEnd(30) +
      `${sent.toFixed(1).padStart(6)} signals, in a room of 100: ` +
      `${(sent * 99).toFixed(0).padStart(6)} sends, room of 1000: ${(sent * 999).toFixed(0).padStart(7)}`);
  }
  // how long to keep showing it? flicker while typing, against lingering after
  console.log("send every 3 s, network delay 0-200 ms:");
  for (const ttl of [2000, 3000, 4000, 5000, 7000, 10000]) {
    let flickers = 0, shownAfter = 0;
    for (const s of sessions) {
      let clock = 0;
      const heardAt = [];
      const sender = new TypingSender(() => heardAt.push(clock + between(0, 200)),
        { every: 3000, now: () => clock });
      for (const k of s) { clock = k; sender.onKey(); }
      // lit at this key, dark at the next, though the gap was only a short pause
      const litAt = (t) => {
        const last = heardAt.filter((h) => h <= t).at(-1);
        return last !== undefined && t - last <= ttl;
      };
      for (let i = 1; i < s.length; i++) {
        if (s[i] - s[i - 1] < 3000 && litAt(s[i - 1]) && !litAt(s[i])) flickers++;
      }
      shownAfter += Math.max(0, heardAt.at(-1) + ttl - s.at(-1));
    }
    console.log(`  show for ${String(ttl / 1000).padStart(2)} s: ${String(flickers).padStart(5)} dark moments ` +
      `in 1000 sessions, lingers ${(shownAfter / 1000 / 1000).toFixed(1).padStart(4)} s after the last key`);
  }
}

// --------------------------------------------------------------------- silent
async function silent() {
  const N = 1000, FRAMES = 100;
  let errors = 0, accepted = 0;
  const conns = new Set();
  const server = wsServer({ onOpen: (c) => conns.add(c), onClose: (c) => conns.delete(c) });
  await new Promise((up) => server.listen(0, "127.0.0.1", up));
  const { port } = server.address();
  const clients = [];
  await inBatches(Array.from({ length: N }), 50, async () => {
    clients.push(await rawClient(port));
  });
  clients.forEach(vanish);
  await wait(300);
  for (const c of conns) {
    for (let i = 0; i < FRAMES; i++) {
      c.socket.write(frame('{"t":"typing"}'), (err) => { if (err) errors++; else accepted++; });
    }
  }
  await wait(2000);
  console.log(`${N} phones gone. ${N * FRAMES} signals sent to them: ` +
    `${accepted} accepted, ${errors} errors, ${conns.size} connections still "open"`);
  server.closeAllConnections?.();
  for (const c of conns) c.drop();
  server.close();
}

// ------------------------------------------------------------------ heartbeat
// Every few seconds: ping everyone. Whoever didn't answer the last one has gone.
function startHeartbeat(conns, every, onDead) {
  return setInterval(() => {
    for (const c of conns) {
      if (!c.alive) {
        conns.delete(c);
        c.drop();
        onDead(c);
        continue;
      }
      c.alive = false; // a pong sets it back
      c.ping();
    }
  }, every);
}

async function heartbeat() {
  const N = 1000, EVERY = 1000;
  const conns = new Set();
  let deadAt = [], wrongly = 0;
  const gone = new Set();
  const server = wsServer({ onOpen: (c) => conns.add(c), onClose: (c) => conns.delete(c) });
  await new Promise((up) => server.listen(0, "127.0.0.1", up));
  const { port } = server.address();
  const healthy = [], dying = [];
  await inBatches(Array.from({ length: N }, (_, i) => i), 50, async () => {
    dying.push(await rawClient(port));
  });
  // real browsers-style clients: Node's own WebSocket answers pings by itself
  await inBatches(Array.from({ length: N }, (_, i) => i), 50, () => new Promise((up) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    ws.onopen = () => { healthy.push(ws); up(); };
  }));
  const before = process.memoryUsage().rss;
  const started = performance.now();
  dying.forEach(vanish);
  const timer = startHeartbeat(conns, EVERY, () => {
    deadAt.push(performance.now() - started);
  });
  await wait(EVERY * 6);
  clearInterval(timer);
  for (const ws of healthy) if (ws.readyState !== WebSocket.OPEN) wrongly++;
  console.log(`ping every ${EVERY} ms: found ${deadAt.length} of ${N} dead phones, ` +
    `first after ${(Math.min(...deadAt) / 1000).toFixed(1)} s, last after ${(Math.max(...deadAt) / 1000).toFixed(1)} s. ` +
    `Healthy clients dropped: ${wrongly} of ${N}`);
  const ping = frame("", PING).length, pong = maskedFrame("", PONG).length;
  console.log(`one heartbeat: ping ${ping} bytes + pong ${pong} bytes; at 1 every 30 s, ` +
    `${((ping + pong) * 2880 / 1000).toFixed(0)} kB a day per connection, ` +
    `before TCP's own overhead`);
  void before;
  for (const ws of healthy) ws.close();
  for (const c of dying) c.socket.destroy();
  server.closeAllConnections?.();
  for (const c of conns) c.drop();
  server.close();
}

// ----------------------------------------------------------------------- slow
// One reader stops reading. Signals keep coming: 10,000 a second, for 5 s, with a
// real chat message in every 100. Typing can be dropped. Messages can't.
async function slowCase(label, drop) {
  const conns = new Set();
  const server = wsServer({ onOpen: (c) => conns.add(c), onClose: (c) => conns.delete(c) });
  await new Promise((up) => server.listen(0, "127.0.0.1", up));
  const { port } = server.address();
  const slow = await rawClient(port);
  const fine = await rawClient(port);
  let fineGot = 0, slowMsgs = [];
  fine.onText = () => { fineGot++; };
  slow.onText = (t) => {
    if (t.includes('"msg"')) slowMsgs.push(JSON.parse(t).n);
  };
  slow.socket.pause();
  await wait(100);
  const [connSlow, connFine] = [...conns];
  global.gc?.();
  const rss0 = process.memoryUsage().rss;
  const payload = '{"t":"typing","from":"somebody","room":"a-long-room-id-1234"}';
  let peak = 0, dropped = 0, sent = 0, messages = 0;
  const started = performance.now();
  while (performance.now() - started < 5000) {
    for (let i = 0; i < 100; i++, sent++) {
      const isMsg = i === 0;
      const text = isMsg ? JSON.stringify({ t: "msg", n: messages++ }) : payload;
      for (const c of [connSlow, connFine]) {
        // typing is disposable: if this reader is behind, skip it
        if (drop && !isMsg && c.socket.writableLength > 64 * 1024) {
          dropped++;
          continue;
        }
        c.socket.write(frame(text));
      }
    }
    peak = Math.max(peak, connSlow.socket.writableLength);
    await wait(10);
  }
  const rss1 = process.memoryUsage().rss;
  slow.socket.resume();
  await wait(1500);
  const inOrder = slowMsgs.every((n, i) => n === i);
  console.log(`${label.padEnd(24)} peak buffer for the slow reader ${(peak / 1024).toFixed(0).padStart(6)} kB, ` +
    `server grew ${((rss1 - rss0) / 1024 / 1024).toFixed(0).padStart(4)} MB, ${dropped} typing signals dropped; ` +
    `healthy reader got ${fineGot}; slow reader, once back: ${slowMsgs.length} of ${messages} messages, in order: ${inOrder}`);
  void sent;
  server.closeAllConnections?.();
  for (const c of conns) c.drop();
  slow.socket.destroy();
  fine.socket.destroy();
  server.close();
}
async function slow() {
  await slowCase("write everything", false);
  await slowCase("drop typing when behind", true);
}

// --------------------------------------------------------------------- fanout
async function fanout() {
  const chat = await startChat();
  for (const each of [false, true]) {
    await chat.ask({ cmd: "encode", each });
    for (const size of [10, 100, 1000, 5000]) {
      await chat.ask({ cmd: "reset" });
      const clients = [];
      await inBatches(Array.from({ length: size }), 200, async () => {
        clients.push(await rawClient(chat.port, "/ws?room=big"));
      });
      const sender = await rawClient(chat.port, "/ws?room=big");
      await wait(200);
      const last = [], first = [];
      for (let round = 0; round < 20; round++) {
        const times = [];
        let start = 0;
        await new Promise((done) => {
          for (const c of clients) {
            c.onText = () => {
              times.push(performance.now() - start);
              if (times.length === size) done();
            };
          }
          start = performance.now();
          sendText(sender, JSON.stringify({ t: "typing", from: "u", round }));
        });
        first.push(times[0]);
        last.push(times.at(-1));
        await wait(20);
      }
      console.log(`${each ? "encode for each" : "encode once    "} room of ${String(size).padStart(4)}: ` +
        `first ${avg(first).toFixed(1).padStart(6)} ms, last ${avg(last).toFixed(1).padStart(6)} ms`);
      for (const c of clients) c.socket.destroy();
      sender.socket.destroy();
      await wait(100);
    }
  }
  chat.stop();
}

// --------------------------------------------------------------------- memory
async function memory() {
  const chat = await startChat();
  const base = await chat.ask({ cmd: "memory" });
  const clients = [];
  for (const target of [1000, 3000, 5000]) {
    while (clients.length < target) {
      const batch = await Promise.all(Array.from({ length: 200 }, () =>
        rawClient(chat.port, "/ws?room=idle")));
      clients.push(...batch);
    }
    await wait(1000);
    const m = await chat.ask({ cmd: "memory" });
    console.log(`${String(m.conns).padStart(6)} idle connections: server ` +
      `${(m.rss / 1e6).toFixed(0).padStart(4)} MB, ` +
      `${((m.rss - base.rss) / m.conns / 1024).toFixed(1)} kB each`);
  }
  for (const c of clients) c.socket.destroy();
  chat.stop();
}

// ---------------------------------------------------------------------- storm
// The server goes down for 2 s, and all 1,000 clients want back in.
async function storm() {
  const N = 1000, DOWN = 2000;
  const strategies = {
    "retry every 100 ms": () => 100,
    "retry every 1 s": () => 1000,
    "double, with jitter": (tries) => between(0, Math.min(30000, 500 * 2 ** tries)),
  };
  for (const [label, delay] of Object.entries(strategies)) {
    const chat = await startChat();
    const { port } = chat;
    const clients = [];
    await inBatches(Array.from({ length: N }), 100, async () => {
      clients.push(await rawClient(port, "/ws?room=storm"));
    });
    let attempts = 0, refused = 0;
    const backAt = [];
    const start = performance.now();
    const rejoin = async (tries = 0) => {
      await wait(delay(tries));
      attempts++;
      try {
        const c = await rawClient(port, "/ws?room=storm");
        backAt.push(performance.now() - start);
        return c;
      } catch {
        refused++;
        return rejoin(tries + 1);
      }
    };
    for (const c of clients) { c.socket.on("error", () => {}); c.socket.removeAllListeners("error"); c.socket.on("error", () => {}); }
    await chat.ask({ cmd: "kick", port, downFor: DOWN });
    const back = await Promise.all(clients.map(() => rejoin()));
    const buckets = new Map();
    for (const t of backAt) {
      const b = Math.floor(t / 100);
      buckets.set(b, (buckets.get(b) ?? 0) + 1);
    }
    console.log(`${label.padEnd(22)} ${String(attempts).padStart(6)} tries, ${String(refused).padStart(6)} refused, ` +
      `busiest 100 ms: ${String(Math.max(...buckets.values())).padStart(4)} reconnects, ` +
      `everyone back after ${(Math.max(...backAt) / 1000).toFixed(1)} s`);
    for (const c of back) c.socket.destroy();
    chat.stop();
    await wait(300);
  }
}

// ----------------------------------------------------------------- twoservers
async function twoservers() {
  const N = 1000;
  for (const useHub of [false, true]) {
    // a hub in 12 lines, the job Redis Pub/Sub does in production
    const servers = new Set();
    const hub = net.createServer((s) => {
      servers.add(s);
      s.on("data", (d) => { for (const o of servers) if (o !== s) o.write(d); });
      s.on("error", () => {});
      s.on("close", () => servers.delete(s));
    });
    await new Promise((up) => hub.listen(0, "127.0.0.1", up));
    const nodes = await Promise.all([0, 1].map(async () => {
      const rooms = new Map();
      const toHub = useHub ? net.connect(hub.address().port, "127.0.0.1") : null;
      let left = "";
      const localSend = (room, text, except) => {
        for (const c of rooms.get(room) ?? []) if (c !== except) c.send(text);
      };
      toHub?.setNoDelay(true);
      toHub?.on("data", (d) => {
        left += d;
        const lines = left.split("\n");
        left = lines.pop();
        for (const line of lines) {
          const { room, text } = JSON.parse(line);
          localSend(room, text);
        }
      });
      const server = wsServer({
        onOpen: (c) => {
          c.room = new URL(c.req.url, "http://x").searchParams.get("room");
          if (!rooms.has(c.room)) rooms.set(c.room, new Set());
          rooms.get(c.room).add(c);
        },
        onMessage: (c, text) => {
          localSend(c.room, text, c);
          toHub?.write(`${JSON.stringify({ room: c.room, text })}\n`);
        },
        onClose: (c) => rooms.get(c.room)?.delete(c),
      });
      await new Promise((up) => server.listen(0, "127.0.0.1", up));
      return { server, port: server.address().port, toHub, rooms };
    }));
    await wait(200);
    let got = 0;
    const latency = [];
    const senders = [], watchers = [];
    await inBatches(Array.from({ length: N }, (_, i) => i), 50, async (i) => {
      const watcher = await rawClient(nodes[1].port, `/ws?room=${i}`);
      watcher.onText = (t) => { got++; latency.push(performance.now() - JSON.parse(t).at); };
      watchers.push(watcher);
      senders.push(await rawClient(nodes[0].port, `/ws?room=${i}`));
    });
    for (const s of senders) {
      sendText(s, JSON.stringify({ t: "typing", at: performance.now() }));
      await wait(1);
    }
    await wait(500);
    console.log(`${useHub ? "with a hub" : "no hub    "}: typist on server A, watcher on server B: ` +
      `${got} of ${N} arrived${got ? `, average ${avg(latency).toFixed(1)} ms` : ""}`);
    for (const c of [...senders, ...watchers]) c.socket.destroy();
    for (const n of nodes) { n.toHub?.destroy(); n.server.closeAllConnections?.(); n.server.close(); }
    for (const s of servers) s.destroy();
    hub.close();
    await wait(200);
  }
}

// ----------------------------------------------------------------------- flap
// A phone moves from Wi-Fi to mobile data: gone for a moment, then back.
async function flap() {
  const N = 1000, GRACE = 1000, AWAY = 300;
  for (const grace of [0, GRACE]) {
    let offline = 0, online = 0;
    const present = new Map(), pending = new Map();
    const joined = (who) => {
      clearTimeout(pending.get(who));
      pending.delete(who);
      if (!present.get(who)) { present.set(who, true); online++; }
    };
    const left = (who) => {
      const announce = () => { present.set(who, false); offline++; pending.delete(who); };
      if (!grace) announce();
      else pending.set(who, setTimeout(announce, grace));
    };
    for (let i = 0; i < N; i++) joined(i);
    online = 0;
    for (let i = 0; i < N; i++) left(i);
    await wait(AWAY);
    for (let i = 0; i < N; i++) joined(i);
    await wait(GRACE + 200);
    const blips = offline;
    // and someone who really leaves is still announced
    for (let i = 0; i < N; i++) left(i);
    await wait(GRACE + 200);
    console.log(`grace ${grace ? `${grace} ms` : "none   "}: network blip, ${String(blips).padStart(4)} told "offline", ` +
      `${String(online).padStart(4)} told "online" again; really gone: ${offline - blips} of ${N} announced`);
  }
}

// ---------------------------------------------------------------------- guard
async function guard() {
  const N = 1000;
  const TRUSTED = new Set(["https://chat.example"]);
  for (const checked of [false, true]) {
    const members = new Map(); // who may be in which room
    const rooms = new Map();
    const server = wsServer({
      allow: (req) => {
        if (!checked) return true;
        return TRUSTED.has(req.headers.origin);
      },
      onOpen: (c) => {
        const u = new URL(c.req.url, "http://x");
        // in a real app the user comes from the session cookie, not the URL
        c.user = u.searchParams.get("session");
        c.room = u.searchParams.get("room");
        if (checked && !members.get(c.room)?.has(c.user)) {
          c.drop();
          return;
        }
        if (!rooms.has(c.room)) rooms.set(c.room, new Set());
        rooms.get(c.room).add(c);
      },
      onMessage: (c, text) => {
        const m = JSON.parse(text);
        // the server says who sent it; it never believes the client
        const out = checked ? { ...m, from: c.user } : m;
        for (const o of rooms.get(c.room)) if (o !== c) o.send(JSON.stringify(out));
      },
      onClose: (c) => rooms.get(c.room)?.delete(c),
    });
    await new Promise((up) => server.listen(0, "127.0.0.1", up));
    const { port } = server.address();
    const good = "https://chat.example", evil = "https://evil.example";
    let evilIn = 0, goodIn = 0, spoofed = 0, eavesdropped = 0;
    const ids = Array.from({ length: N }, (_, i) => i);
    await inBatches(ids, 50, async (i) => {
      const room = `r${i}`;
      members.set(room, new Set([`alice${i}`, `bob${i}`]));
      const a = await rawClient(port, `/ws?room=${room}&session=alice${i}`, { Origin: evil });
      if (a.status === 101) evilIn++;
      a.socket.destroy();
      const alice = await rawClient(port, `/ws?room=${room}&session=alice${i}`, { Origin: good });
      const bob = await rawClient(port, `/ws?room=${room}&session=bob${i}`, { Origin: good });
      if (alice.status === 101 && bob.status === 101) goodIn++;
      const outsider = await rawClient(port, `/ws?room=${room}&session=mallory`, { Origin: good });
      let saw = false;
      outsider.onText = () => { saw = true; };
      let from = null;
      alice.onText = (t) => { from = JSON.parse(t).from; };
      await wait(20);
      sendText(bob, JSON.stringify({ t: "typing", from: `ceo${i}` }));
      await wait(60);
      if (from === `ceo${i}`) spoofed++;
      if (saw) eavesdropped++;
      for (const c of [alice, bob, outsider]) c.socket.destroy();
    });
    console.log(`${checked ? "checked  " : "unchecked"}: evil origin let in ${evilIn} of ${N}, ` +
      `good origin let in ${goodIn} of ${N}, spoofed name shown ${spoofed}, ` +
      `outsider saw the signal ${eavesdropped}`);
    server.closeAllConnections?.();
    server.close();
  }
}

const modes = { handshake, compare, stuck, clears, throttle, silent, heartbeat,
  slow, fanout, memory, storm, twoservers, flap, guard };
const mode = process.argv[2] ?? "handshake";
if (!modes[mode]) throw new Error(`no mode ${mode}`);
process.on("uncaughtException", (e) => {
  if (!["ECONNRESET", "EPIPE", "ECONNREFUSED"].includes(e.code)) throw e;
});
await modes[mode]();
process.exit(0);
