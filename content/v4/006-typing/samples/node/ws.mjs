// A WebSocket server, written out: just enough of RFC 6455 to carry typing
// signals. Node ships a WebSocket client but no server, and writing one shows
// there's no magic: a normal HTTP request, then small binary frames.
import { createHash } from "node:crypto";
import http from "node:http";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

// The handshake's only sum: proves the server really speaks WebSocket.
export const acceptKey = (key) =>
  createHash("sha1").update(key + GUID).digest("base64");

export const TEXT = 0x1, CLOSE = 0x8, PING = 0x9, PONG = 0xa;

// One frame from the server: 2 bytes of header, never masked (section 5.1).
export function frame(payload, opcode = TEXT) {
  const data = Buffer.from(payload);
  const head = data.length < 126
    ? Buffer.from([0x80 | opcode, data.length])
    : Buffer.from([0x80 | opcode, 126, data.length >> 8, data.length & 255]);
  return Buffer.concat([head, data]);
}

// One frame from a client: browsers must mask, with a fresh key each time.
export function maskedFrame(payload, opcode = TEXT) {
  const data = Buffer.from(payload);
  const key = Buffer.from([1, 2, 3, 4].map(() => Math.random() * 256));
  const masked = data.map((b, i) => b ^ key[i % 4]);
  return Buffer.concat([
    Buffer.from([0x80 | opcode, 0x80 | data.length]), key, masked,
  ]);
}

// Cuts complete frames out of whatever the socket has delivered so far.
export function readFrames(buffer, onFrame) {
  let at = 0;
  while (buffer.length - at >= 2) {
    const opcode = buffer[at] & 0x0f;
    const masked = buffer[at + 1] & 0x80;
    let length = buffer[at + 1] & 0x7f, head = 2;
    if (length === 126) {
      if (buffer.length - at < 4) break;
      length = buffer.readUInt16BE(at + 2);
      head = 4;
    }
    const total = head + (masked ? 4 : 0) + length;
    if (buffer.length - at < total) break;
    const body = buffer.subarray(at + total - length, at + total);
    if (masked) {
      const key = buffer.subarray(at + head, at + head + 4);
      for (let i = 0; i < length; i++) body[i] ^= key[i % 4];
    }
    onFrame(opcode, body);
    at += total;
  }
  return buffer.subarray(at);
}

// One open connection, as the server sees it.
export class Conn {
  constructor(socket, req) {
    this.socket = socket;
    this.req = req;
    this.alive = true;
    this.left = Buffer.alloc(0);
  }
  send(text) { this.socket.write(frame(text)); }
  ping() { this.socket.write(frame("", PING)); }
  drop() { this.socket.destroy(); }
}

// An HTTP server that can also turn a request into a socket.
export function wsServer({ allow, onOpen, onMessage, onClose, onRequest }) {
  const server = http.createServer(onRequest ?? ((_, res) => res.end()));
  server.on("upgrade", (req, socket) => {
    if (allow && !allow(req)) {
      socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    socket.setNoDelay(true);
    socket.write(["HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket", "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${acceptKey(req.headers["sec-websocket-key"])}`,
      "", ""].join("\r\n"));
    const conn = new Conn(socket, req);
    onOpen?.(conn);
    socket.on("data", (chunk) => {
      const all = Buffer.concat([conn.left, chunk]);
      conn.left = readFrames(all, (opcode, body) => {
        if (opcode === TEXT) onMessage?.(conn, body.toString());
        if (opcode === PONG) conn.alive = true;
        if (opcode === PING) socket.write(frame(body, PONG));
        if (opcode === CLOSE) socket.end(frame(body, CLOSE));
      });
    });
    socket.on("end", () => socket.end()); // they hung up, so we do too
    socket.on("error", () => {});
    socket.on("close", () => onClose?.(conn));
  });
  return server;
}
