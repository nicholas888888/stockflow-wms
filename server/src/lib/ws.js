// Minimal RFC6455 WebSocket server (text frames only) — zero dependencies.
import crypto from "node:crypto";
import { EventEmitter } from "node:events";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

export const bus = new EventEmitter();
const clients = new Set();

export function handleUpgrade(req, socket) {
  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }
  const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  clients.add(socket);
  send(socket, { type: "hello", msg: "StockFlow WMS live stream connected", ts: Date.now() });

  socket.on("data", (buf) => {
    // We only need to detect close frames; ignore inbound payloads otherwise.
    const opcode = buf[0] & 0x0f;
    if (opcode === 0x8) {
      clients.delete(socket);
      try { socket.end(); } catch {}
    }
  });
  socket.on("close", () => clients.delete(socket));
  socket.on("error", () => clients.delete(socket));
}

function encodeFrame(str) {
  const payload = Buffer.from(str);
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function send(socket, obj) {
  try {
    socket.write(encodeFrame(JSON.stringify(obj)));
  } catch {
    clients.delete(socket);
  }
}

export function broadcast(event) {
  const frame = encodeFrame(JSON.stringify(event));
  for (const s of clients) {
    try {
      s.write(frame);
    } catch {
      clients.delete(s);
    }
  }
}

export function clientCount() {
  return clients.size;
}

// Any module can emit an event onto the bus; it's fanned out to all WS clients.
bus.on("event", (evt) => broadcast(evt));
