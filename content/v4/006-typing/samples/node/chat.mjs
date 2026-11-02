// The chat server the tests talk to, in a process of its own. It answers the same
// typing signal four ways (polling, long polling, server-sent events, WebSocket)
// and counts every byte on the wire. Commands arrive from the test by IPC.
import { wsServer, frame } from "./ws.mjs";

const rooms = new Map();
const room = (id) => {
  if (!rooms.has(id)) {
    rooms.set(id, { conns: new Set(), queue: [], waiters: [], streams: [] });
  }
  return rooms.get(id);
};

let requests = 0, emptyReplies = 0, bytes = 0, encodeEach = false;
const sockets = new Set();
const live = new Set();

function deliver(id, text) {
  const r = room(id);
  // WebSocket: straight down every open socket
  if (encodeEach) {
    for (const c of r.conns) c.send(text);
  } else if (r.conns.size) {
    const bytes = frame(text); // encode once, however many receive it
    for (const c of r.conns) c.socket.write(bytes);
  }
  // server-sent events: the same, in text
  for (const res of r.streams) res.write(`data: ${text}\n\n`);
  // long polling: answer whoever is waiting, or keep it for the next one
  if (r.waiters.length) {
    for (const res of r.waiters.splice(0)) res.end(`[${text}]`);
  } else if (!r.conns.size && !r.streams.length) {
    r.queue.push(text);
  }
}

const url = (req) => new URL(req.url, "http://x");

const server = wsServer({
  onOpen(conn) {
    live.add(conn);
    conn.room = url(conn.req).searchParams.get("room") ?? "0";
    room(conn.room).conns.add(conn);
  },
  onMessage(conn, text) {
    // relay to everyone else in the room
    const r = room(conn.room);
    if (encodeEach) {
      for (const c of r.conns) if (c !== conn) c.send(text);
    } else {
      const bytes = frame(text);
      for (const c of r.conns) if (c !== conn) c.socket.write(bytes);
    }
    for (const res of r.streams) res.write(`data: ${text}\n\n`);
  },
  onClose(conn) {
    live.delete(conn);
    room(conn.room).conns.delete(conn);
  },
  onRequest(req, res) {
    requests++;
    const u = url(req), id = u.searchParams.get("room");
    if (u.pathname === "/typing") {
      let body = "";
      req.on("data", (d) => { body += d; });
      req.on("end", () => { deliver(id, body); res.statusCode = 204; res.end(); });
    } else if (u.pathname === "/poll") {
      const q = room(id).queue.splice(0);
      if (!q.length) emptyReplies++;
      res.end(`[${q.join(",")}]`);
    } else if (u.pathname === "/wait") {
      const r = room(id);
      if (r.queue.length) res.end(`[${r.queue.splice(0).join(",")}]`);
      else r.waiters.push(res);
    } else if (u.pathname === "/events") {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(":\n\n");
      room(id).streams.push(res);
    } else res.end();
  },
});

server.on("connection", (s) => {
  sockets.add(s);
  s.on("close", () => {
    bytes += s.bytesRead + s.bytesWritten;
    sockets.delete(s);
  });
});

const counted = () =>
  bytes + [...sockets].reduce((n, s) => n + s.bytesRead + s.bytesWritten, 0);

let heartbeat = null;
process.on("message", (m) => {
  if (m.cmd === "listen") {
    server.listen(m.port ?? 0, "127.0.0.1", () =>
      process.send({ port: server.address().port }));
  } else if (m.cmd === "reset") {
    requests = 0; emptyReplies = 0; bytes = 0;
    for (const s of sockets) s.destroy();
    rooms.clear();
    setTimeout(() => process.send({ ok: true }), 200);
  } else if (m.cmd === "stats") {
    process.send({ requests, emptyReplies, bytes: counted() });
  } else if (m.cmd === "encode") {
    encodeEach = m.each;
    process.send({ ok: true });
  } else if (m.cmd === "memory") {
    global.gc?.();
    process.send({ ...process.memoryUsage(), conns: live.size });
  } else if (m.cmd === "kick") {
    // the server goes down: every socket dies, nothing answers for a while
    server.close();
    for (const s of sockets) s.destroy();
    setTimeout(() => server.listen(m.port, "127.0.0.1"), m.downFor);
    process.send({ ok: true });
  } else if (m.cmd === "conns") {
    process.send({ conns: live.size });
  }
});
