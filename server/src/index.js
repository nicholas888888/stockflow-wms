// StockFlow WMS backend entry point.
import http from "node:http";
import { URL } from "node:url";
import { config } from "./config.js";
import { Router, json, applyCors, readBody, HttpError } from "./lib/http.js";
import { load, init } from "./lib/store.js";
import { buildSeed } from "./seed.js";
import { handleUpgrade, bus, clientCount } from "./lib/ws.js";
import { serveUpload } from "./lib/uploads.js";

import * as products from "./routes/products.js";
import * as orders from "./routes/orders.js";
import * as fulfillment from "./routes/fulfillment.js";
import * as inbound from "./routes/inbound.js";
import * as admin from "./routes/admin.js";

// --- Boot store ---
if (!load()) {
  init(buildSeed());
  console.log("• No database found — seeded fresh demo data.");
}

// --- Routes ---
const router = new Router();
products.register(router);
orders.register(router);
fulfillment.register(router);
inbound.register(router);
admin.register(router);

// --- Server ---
const server = http.createServer(async (req, res) => {
  applyCors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // Root info
  if (pathname === "/" && req.method === "GET") {
    return json(res, 200, {
      name: "StockFlow WMS API",
      version: "1.1.0",
      docs: "/api/health · see server/README.md for the full endpoint list",
      wsClients: clientCount(),
    });
  }

  // Serve uploaded images: GET /uploads/<file>
  if (req.method === "GET" && pathname.startsWith("/uploads/")) {
    return serveUpload(res, pathname.slice("/uploads/".length));
  }

  const matched = router.match(req.method, pathname);
  if (!matched) {
    return json(res, 404, { error: "Not found", path: pathname });
  }

  try {
    const isMultipart = (req.headers["content-type"] || "").startsWith("multipart/form-data");
    // For multipart uploads, hand the raw stream to the handler (don't JSON-parse).
    const body = (!isMultipart && ["POST", "PUT", "PATCH"].includes(req.method)) ? await readBody(req) : {};
    const query = Object.fromEntries(url.searchParams.entries());
    const ctx = { params: matched.params, query, body, url };

    let result;
    for (const handler of matched.handlers) {
      result = await handler(req, res, ctx);
    }
    if (!res.writableEnded) {
      json(res, result && result.__status ? result.__status : 200, result ?? { ok: true });
    }
  } catch (err) {
    if (err instanceof HttpError) {
      return json(res, err.status, { error: err.message, ...(err.details ? { details: err.details } : {}) });
    }
    console.error("Unhandled error:", err);
    return json(res, 500, { error: "Internal server error" });
  }
});

// --- WebSocket upgrade ---
server.on("upgrade", (req, socket) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/ws") {
    handleUpgrade(req, socket);
  } else {
    socket.destroy();
  }
});

// --- Heartbeat: keep the live feed moving for demos ---
const demoEvents = [
  { icon: "🔁", color: "b-violet", text: "Inventory sync pushed to Shopee · 3 SKUs updated" },
  { icon: "🖨️", color: "b-gray", text: "12 shipping labels printed in batch" },
  { icon: "⚠️", color: "b-amber", text: "Low stock alert: Hand Wraps 180\" (12 left)" },
];
let hb = 0;
setInterval(() => {
  if (clientCount() === 0) return;
  const e = demoEvents[hb++ % demoEvents.length];
  bus.emit("event", { type: "activity", ...e, ts: Date.now() });
}, config.wsHeartbeatMs);

server.listen(config.port, config.host, () => {
  console.log(`\n  StockFlow WMS API`);
  console.log(`  ➜  http://${config.host}:${config.port}`);
  console.log(`  ➜  WebSocket: ws://${config.host}:${config.port}/ws`);
  console.log(`  ➜  Demo login: alexm / demo1234\n`);
});
