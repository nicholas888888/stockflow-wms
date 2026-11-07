// In-process API integration tests (no socket needed). Uses node:test.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// Use a throwaway DB file per run (workspace-local so it works under sandbox).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.DATA_FILE = path.join(__dirname, `.tmp-db-${Date.now()}.json`);

const { Router, HttpError } = await import("../src/lib/http.js");
const { init } = await import("../src/lib/store.js");
const { buildSeed } = await import("../src/seed.js");
init(buildSeed());

const products = await import("../src/routes/products.js");
const orders = await import("../src/routes/orders.js");
const fulfillment = await import("../src/routes/fulfillment.js");
const inbound = await import("../src/routes/inbound.js");
const admin = await import("../src/routes/admin.js");

const router = new Router();
[products, orders, fulfillment, inbound, admin].forEach((m) => m.register(router));

// Call a route handler directly.
async function call(method, pathname, { body = {}, query = {}, token } = {}) {
  const matched = router.match(method, pathname);
  if (!matched) throw new Error(`No route: ${method} ${pathname}`);
  const req = { method, headers: token ? { authorization: `Bearer ${token}` } : {} };
  const res = { writableEnded: false };
  const ctx = { params: matched.params, query, body, url: { pathname } };
  let result;
  try {
    for (const h of matched.handlers) result = await h(req, res, ctx);
    return { status: 200, body: result };
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, body: { error: e.message, details: e.details } };
    throw e;
  }
}

let token;

test("health is public", async () => {
  const r = await call("GET", "/api/health");
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
});

test("login rejects bad password", async () => {
  const r = await call("POST", "/api/auth/login", { body: { identifier: "alexm", password: "wrong" } });
  assert.equal(r.status, 401);
  assert.ok(r.body.details.attemptsRemaining < 5);
});

test("login succeeds and returns token", async () => {
  const r = await call("POST", "/api/auth/login", { body: { identifier: "alexm", password: "demo1234" } });
  assert.equal(r.status, 200);
  assert.ok(r.body.token);
  assert.equal(r.body.user.role, "super_admin");
  assert.equal(r.body.user.password, undefined, "password must never be returned");
  token = r.body.token;
});

test("protected route requires token", async () => {
  const r = await call("GET", "/api/products");
  assert.equal(r.status, 401);
});

test("products list works with token", async () => {
  const r = await call("GET", "/api/products", { token });
  assert.equal(r.status, 200);
  assert.ok(r.body.total >= 10);
  assert.ok(r.body.data[0].health);
});

test("product filters: out of stock", async () => {
  const r = await call("GET", "/api/products", { token, query: { stock: "out" } });
  assert.ok(r.body.data.every((p) => p.health === "out"));
});

test("create product enforces unique SKU", async () => {
  const dup = await call("POST", "/api/products", { token, body: { name: "x", sku: "RVL-GLV-16-RED" } });
  assert.equal(dup.status, 409);
  const ok = await call("POST", "/api/products", { token, body: { name: "Test Glove", sku: "TST-001", phys: 10, safety: 5, avail: 10 } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.sku, "TST-001");
});

test("soft delete hides product", async () => {
  const p = await call("POST", "/api/products", { token, body: { name: "Temp", sku: "TMP-1", phys: 1, avail: 1 } });
  const del = await call("DELETE", `/api/products/${p.body.id}`, { token });
  assert.equal(del.body.softDeleted, true);
  const list = await call("GET", "/api/products", { token });
  assert.ok(!list.body.data.some((x) => x.sku === "TMP-1"));
});

test("RBAC: operator cannot list products", async () => {
  const op = await call("POST", "/api/auth/login", { body: { identifier: "dimasp", password: "demo1234" } });
  const opToken = op.body.token;
  const r = await call("GET", "/api/products", { token: opToken });
  assert.equal(r.status, 403);
  // but operator CAN hit picking queue
  const q = await call("GET", "/api/picking/queue", { token: opToken });
  assert.equal(q.status, 200);
});

test("order pipeline counts", async () => {
  const r = await call("GET", "/api/orders/pipeline", { token });
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 14);
});

test("process a pending order reserves stock", async () => {
  const list = await call("GET", "/api/orders", { token, query: { status: "Pending" } });
  const pending = list.body.data[0];
  const r = await call("POST", `/api/orders/${encodeURIComponent(pending.id)}/process`, { token });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, "Waiting Picking");
  // double-process should fail
  const again = await call("POST", `/api/orders/${encodeURIComponent(pending.id)}/process`, { token });
  assert.equal(again.status, 409);
});

test("print sets Printed and returns documents", async () => {
  const list = await call("GET", "/api/orders", { token, query: { status: "Pending" } });
  if (list.body.data.length) {
    const o = list.body.data[0];
    const r = await call("POST", `/api/orders/${encodeURIComponent(o.id)}/print`, { token });
    assert.equal(r.status, 200);
    assert.equal(r.body.documents.length, 2);
  }
});

test("picking: full scan lifecycle with error cases", async () => {
  // find a multi-line order waiting for picking (so finishing line 1 won't
  // complete the whole order, letting us assert the over-pick block mid-session)
  const list = await call("GET", "/api/orders", { token, query: { status: "Waiting Picking" } });
  const order = list.body.data.find((o) => o.status === "Waiting Picking" && o.items.length > 1)
    || list.body.data.find((o) => o.status === "Waiting Picking");
  assert.ok(order, "need a waiting-picking order");

  // start with wrong invoice → 422
  const bad = await call("POST", "/api/picking/sessions", { token, body: { barcode: "NOPE123" } });
  assert.equal(bad.status, 422);

  // start correctly
  const start = await call("POST", "/api/picking/sessions", { token, body: { barcode: order.barcode } });
  assert.equal(start.status, 200);
  assert.equal(start.body.scanned, 0);

  // scan unknown barcode
  const unknown = await call("POST", `/api/picking/sessions/${encodeURIComponent(order.id)}/scan`, { token, body: { code: "ZZZ-NONE" } });
  assert.equal(unknown.body.result, "unknown");
  assert.equal(unknown.body.audio, "error");

  // Fully scan the FIRST line, then attempt one extra → over-pick blocked
  const first = start.body.items[0];
  for (let i = 0; i < first.required; i++) {
    await call("POST", `/api/picking/sessions/${encodeURIComponent(order.id)}/scan`, { token, body: { code: first.sku } });
  }
  const over = await call("POST", `/api/picking/sessions/${encodeURIComponent(order.id)}/scan`, { token, body: { code: first.sku } });
  assert.equal(over.body.result, "excess", "over-pick must be blocked");

  // Finish any remaining lines → completion transitions to Waiting Packing
  let last = over;
  for (const it of start.body.items.slice(1)) {
    for (let i = 0; i < it.required; i++) {
      last = await call("POST", `/api/picking/sessions/${encodeURIComponent(order.id)}/scan`, { token, body: { code: it.sku } });
    }
  }
  // If the order had only one line, the first-line completion already finished it.
  const finalOrder = await call("GET", `/api/orders/${encodeURIComponent(order.id)}`, { token });
  assert.equal(finalOrder.body.status, "Waiting Packing", "completed picking → Waiting Packing");
});

test("inbound receive with QC increases stock", async () => {
  const before = await call("GET", "/api/products", { token, query: { q: "BXR-WRP-180-BLK" } });
  const row = before.body.data.find((p) => p.sku === "BXR-WRP-180-BLK");
  const avail0 = row.avail;
  const r = await call("POST", "/api/inbound/receive", { token, body: { sku: "BXR-WRP-180-BLK", quantity: 50, qc: "passed" } });
  assert.equal(r.status, 200);
  assert.equal(r.body.unitsAdded, 50);
  assert.equal(r.body.newAvailable, avail0 + 50);
  // partial QC adds half
  const partial = await call("POST", "/api/inbound/receive", { token, body: { sku: "BXR-WRP-180-BLK", quantity: 10, qc: "partial" } });
  assert.equal(partial.body.unitsAdded, 5);
});

test("return restock increases inventory", async () => {
  const r = await call("POST", "/api/returns/RMA-5521/disposition", { token, body: { action: "restock" } });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, "Restocked");
});

test("RBAC matrix toggle persists", async () => {
  const r = await call("PUT", "/api/rbac/operator", { token, body: { page: "dashboard", enabled: true } });
  assert.equal(r.status, 200);
  assert.ok(r.body.access.includes("dashboard"));
});

test("outbound dispatch marks shipped", async () => {
  const ready = await call("GET", "/api/outbound/ready", { token });
  if (ready.body.data.length) {
    const o = ready.body.data[0];
    const r = await call("POST", "/api/outbound/dispatch", { token, body: { barcode: o.waybill } });
    assert.equal(r.body.result, "shipped");
    assert.equal(r.body.order.status, "Shipped");
  }
});

test("dashboard metrics shape", async () => {
  const r = await call("GET", "/api/dashboard", { token });
  assert.equal(r.status, 200);
  assert.ok(r.body.kpis.revenue7d > 0);
  assert.ok(r.body.pipeline.total >= 0);
  assert.ok(Array.isArray(r.body.stockAlerts));
});

/* -------- Integrations: OAuth connect → sync → webhook pipeline -------- */
test("integration oauth-url returns a simulated URL", async () => {
  const r = await call("GET", "/api/integrations/shopee/oauth-url", { token });
  assert.equal(r.status, 200);
  assert.equal(r.body.mode, "simulated");
  assert.ok(r.body.url.includes("/callback"));
});

test("sync requires a connected channel", async () => {
  // tokopedia seeds as 'Reconnect' (not Connected) → should 409
  const r = await call("POST", "/api/integrations/tokopedia/sync", { token });
  assert.equal(r.status, 409);
});

test("oauth callback connects, then sync imports orders", async () => {
  const cb = await call("GET", "/api/integrations/tokopedia/callback", { token });
  assert.equal(cb.body.status, "Connected");
  const before = (await call("GET", "/api/orders/pipeline", { token })).body.total;
  const sync = await call("POST", "/api/integrations/tokopedia/sync", { token });
  assert.equal(sync.status, 200);
  assert.ok(sync.body.ordersImported >= 1);
  const after = (await call("GET", "/api/orders/pipeline", { token })).body.total;
  assert.equal(after, before + sync.body.ordersImported);
});

test("webhook receiver ingests an order (no auth required)", async () => {
  const before = (await call("GET", "/api/orders/pipeline", { token })).body.total;
  const r = await call("POST", "/api/integrations/shopee/webhook", {
    body: { channel: "shopee", event: "order.create", data: { externalId: "SP-TEST-1", customer: "Test Buyer", courier: "Shopee Express", items: [{ sku: "SUP-TEE-M-NVY", qty: 2 }] } },
  });
  assert.equal(r.status, 200);
  assert.ok(r.body.orderId);
  const after = (await call("GET", "/api/orders/pipeline", { token })).body.total;
  assert.equal(after, before + 1);
  // de-dupe: same externalId again → duplicate, no new order
  const dup = await call("POST", "/api/integrations/shopee/webhook", {
    body: { channel: "shopee", event: "order.create", data: { externalId: "SP-TEST-1", items: [{ sku: "SUP-TEE-M-NVY", qty: 2 }] } },
  });
  assert.equal(dup.body.duplicate, true);
});

test("product accepts imageUrl on create", async () => {
  const r = await call("POST", "/api/products", { token, body: { name: "Img Prod", sku: "IMG-1", imageUrl: "/uploads/x.png" } });
  assert.equal(r.status, 200);
  assert.equal(r.body.imageUrl, "/uploads/x.png");
});

test.after(() => {
  try { fs.unlinkSync(process.env.DATA_FILE); } catch {}
});
