// Barcode-guided picking, packing, and outbound dispatch.
import { col, findById, update, get, persist } from "../lib/store.js";
import { HttpError } from "../lib/http.js";
import { authenticate, requirePage } from "../auth.js";
import { bus } from "../lib/ws.js";
import { pipelineCounts } from "./orders.js";

// In-memory scan sessions keyed by `${mode}:${orderId}`.
const sessions = new Map();

function sessionKey(mode, orderId) { return `${mode}:${orderId}`; }

function startSession(mode, order) {
  const counts = {};
  order.items.forEach((it) => (counts[it.sku] = 0));
  const s = { mode, orderId: order.id, counts, startedAt: Date.now() };
  sessions.set(sessionKey(mode, order.id), s);
  return s;
}

function sessionView(order, s) {
  const items = order.items.map((it) => ({
    sku: it.sku, name: it.name, img: it.img, loc: it.loc, ean: it.ean,
    required: it.qty, scanned: s.counts[it.sku] || 0, done: (s.counts[it.sku] || 0) >= it.qty,
  }));
  const required = order.items.reduce((a, b) => a + b.qty, 0);
  const scanned = Object.values(s.counts).reduce((a, b) => a + b, 0);
  return { orderId: order.id, mode: s.mode, items, required, scanned, percent: Math.round((scanned / required) * 100), complete: scanned >= required };
}

function nextOrderFor(mode) {
  return col("orders").find((o) =>
    mode === "picking" ? (o.status === "Waiting Picking" || o.status === "Printed") : o.status === "Waiting Packing"
  );
}

export function register(router) {
  /* ---------------- Queue ---------------- */
  router.get("/api/:mode/queue", (req, res, ctx) => {
    const mode = ctx.params.mode;
    if (!["picking", "packing"].includes(mode)) throw new HttpError(404, "Unknown station");
    const user = authenticate(req);
    requirePage(user, mode);
    const next = nextOrderFor(mode);
    return { next: next ? { id: next.id, barcode: next.barcode, channel: next.channel, customer: next.customer, courier: next.courier, items: next.items, status: next.status } : null, queueLength: col("orders").filter((o) => mode === "picking" ? (o.status === "Waiting Picking" || o.status === "Printed") : o.status === "Waiting Packing").length };
  });

  /* ---------------- Start session (scan invoice) ---------------- */
  router.post("/api/:mode/sessions", (req, res, ctx) => {
    const mode = ctx.params.mode;
    if (!["picking", "packing"].includes(mode)) throw new HttpError(404, "Unknown station");
    const user = authenticate(req);
    requirePage(user, mode);
    const { barcode } = ctx.body;
    if (!barcode) throw new HttpError(400, "Scan an invoice barcode to start");
    const order = col("orders").find((o) => o.barcode === String(barcode).toUpperCase() || o.id === barcode);
    if (!order) throw new HttpError(422, "Invalid invoice — no matching order", { scanned: barcode });
    const expected = mode === "picking" ? ["Waiting Picking", "Printed"] : ["Waiting Packing"];
    if (!expected.includes(order.status))
      throw new HttpError(409, `Order ${order.id} is '${order.status}', not ready for ${mode}`);
    const s = startSession(mode, order);
    bus.emit("event", { type: `${mode}.started`, icon: "📷", color: "b-blue", text: `${user.name} started ${mode} for ${order.id}`, ts: Date.now() });
    return sessionView(order, s);
  });

  /* ---------------- Scan an item SKU ---------------- */
  router.post("/api/:mode/sessions/:orderId/scan", (req, res, ctx) => {
    const mode = ctx.params.mode;
    if (!["picking", "packing"].includes(mode)) throw new HttpError(404, "Unknown station");
    const user = authenticate(req);
    requirePage(user, mode);
    const orderId = ctx.params.orderId;
    const order = findById("orders", orderId);
    const s = sessions.get(sessionKey(mode, orderId));
    if (!order || !s) throw new HttpError(404, "No active session for this order");
    const code = String(ctx.body.code || "").trim();
    if (!code) throw new HttpError(400, "code required");

    const line = order.items.find((it) => it.sku.toUpperCase() === code.toUpperCase() || it.ean === code);
    if (!line) {
      // audio: error — unknown barcode
      return { result: "unknown", audio: "error", message: `${code} is not on this order`, session: sessionView(order, s) };
    }
    if (s.counts[line.sku] >= line.qty) {
      // audio: error — over-pick
      return { result: "excess", audio: "error", message: `All ${line.qty} units of ${line.sku} already scanned`, session: sessionView(order, s) };
    }
    s.counts[line.sku] += 1;
    const view = sessionView(order, s);

    if (view.complete) {
      finishSession(mode, order, user);
      return { result: "complete", audio: "success", message: `${mode === "picking" ? "Picking" : "Packing"} complete`, session: sessionView(order, s), order: findById("orders", orderId) };
    }
    // audio: success
    return { result: "ok", audio: "success", message: `Verified ${line.sku}`, session: view };
  });

  /* ---------------- Finalize packing with package dims ---------------- */
  router.post("/api/packing/sessions/:orderId/complete", (req, res, ctx) => {
    const user = authenticate(req);
    requirePage(user, "packing");
    const orderId = ctx.params.orderId;
    const order = findById("orders", orderId);
    const s = sessions.get(sessionKey("packing", orderId));
    if (!order || !s) throw new HttpError(404, "No active packing session");
    const view = sessionView(order, s);
    if (!view.complete) throw new HttpError(409, "Cannot close — not all items verified (100% required)");
    const { weightKg, boxSize } = ctx.body;
    update("orders", order.id, { packageWeightKg: Number(weightKg || 0), boxSize: boxSize || "Medium" });
    return findById("orders", orderId);
  });

  /* ---------------- Outbound dispatch ---------------- */
  router.get("/api/outbound/ready", (req) => {
    const user = authenticate(req);
    requirePage(user, "outbound");
    return { data: col("orders").filter((o) => o.status === "Waiting Outbound") };
  });

  router.post("/api/outbound/dispatch", (req, res, ctx) => {
    const user = authenticate(req);
    requirePage(user, "outbound");
    const code = String(ctx.body.barcode || "").trim();
    if (!code) throw new HttpError(400, "Scan a waybill or invoice barcode");
    const order = col("orders").find(
      (o) => o.waybill.toLowerCase() === code.toLowerCase() || o.barcode.toLowerCase() === code.toLowerCase() || o.id.toLowerCase() === code.toLowerCase()
    );
    if (!order) return { result: "error", audio: "error", message: `No order matches '${code}'` };
    if (order.status !== "Waiting Outbound")
      return { result: "error", audio: "error", message: `${order.id} is '${order.status}', not ready for outbound` };

    // deduct reserved stock permanently (leaves the warehouse)
    for (const line of order.items) {
      const p = col("products").find((x) => x.sku === line.sku);
      if (p) update("products", p.id, { phys: Math.max(0, p.phys - line.qty), reserved: Math.max(0, p.reserved - line.qty) });
    }
    update("orders", order.id, { status: "Shipped", shippedAt: new Date().toISOString() });
    bus.emit("event", { type: "order.shipped", icon: "🚚", color: "b-green", text: `${order.id} shipped via ${order.courier} — status pushed to ${order.channel}`, ts: Date.now() });
    bus.emit("event", { type: "pipeline", ...pipelineCounts() });
    return { result: "shipped", audio: "success", message: `${order.id} dispatched via ${order.courier}`, order: findById("orders", order.id), channelPush: { channel: order.channel, tracking: order.waybill, status: "shipped" } };
  });
}

function finishSession(mode, order, user) {
  const nextStatus = mode === "picking" ? "Waiting Packing" : "Waiting Outbound";
  update("orders", order.id, { status: nextStatus });
  sessions.delete(sessionKey(mode, order.id));
  bus.emit("event", { type: `${mode}.completed`, icon: "✅", color: "b-teal", text: `${user.name} completed ${mode} for ${order.id}`, ts: Date.now() });
  bus.emit("event", { type: "pipeline", ...pipelineCounts() });
}
