// Users & RBAC, integrations, auth, and dashboard metrics.
import { col, findById, update, insert, remove, get, persist } from "../lib/store.js";
import { HttpError } from "../lib/http.js";
import { authenticate, requirePage, requireRole, login, loginRateState, publicUser } from "../auth.js";
import { hashPassword } from "../lib/crypto.js";
import { newId } from "../lib/crypto.js";
import { bus, clientCount } from "../lib/ws.js";
import { pipelineCounts } from "./orders.js";
import { ingestExternalOrder } from "../integrations/ingest.js";
import { mockConnect, mockPullOrders, mockWebhookPayload } from "../integrations/mock-marketplace.js";
import { shopeeConfig, authUrl as shopeeAuthUrl } from "../integrations/shopee.js";
import { tiktokConfig, authUrl as tiktokAuthUrl } from "../integrations/tiktok.js";

// Prepend a webhook log entry (keep the most recent 40).
function logWebhook(channel, event, status, ms) {
  const logs = col("webhookLogs");
  const time = new Date().toTimeString().slice(0, 8);
  logs.unshift({ id: newId("WH"), time, channel, event, status, ms });
  if (logs.length > 40) logs.length = 40;
  persist();
}

export function register(router) {
  /* ---------------- Auth ---------------- */
  router.post("/api/auth/login", (req, res, ctx) => {
    const { identifier, username, email, password } = ctx.body;
    return login({ identifier: identifier || username || email, password });
  });

  router.get("/api/auth/me", (req) => {
    const user = authenticate(req);
    return { user: publicUser(user), access: get().access[user.role], role: get().roles[user.role] };
  });

  router.post("/api/auth/forgot", (req, res, ctx) => {
    // Always 200 to avoid user enumeration.
    return { ok: true, message: "If that account exists, a reset link has been sent." };
  });

  /* ---------------- Users (RBAC) ---------------- */
  router.get("/api/users", (req) => {
    const user = authenticate(req);
    requirePage(user, "users");
    return { data: col("users").map(publicUser), roles: get().roles };
  });

  router.post("/api/users", (req, res, ctx) => {
    const user = authenticate(req);
    requirePage(user, "users");
    requireRole(user, "super_admin");
    const b = ctx.body;
    if (!b.name || !b.username || !b.email || !b.role) throw new HttpError(400, "name, username, email, role required");
    if (col("users").some((u) => u.username.toLowerCase() === b.username.toLowerCase())) throw new HttpError(409, "Username taken");
    if (!get().roles[b.role]) throw new HttpError(400, "Unknown role");
    const rec = { id: newId("U"), name: b.name, email: b.email, username: b.username, role: b.role, status: b.status || "Active", password: hashPassword(b.password || "demo1234") };
    insert("users", rec);
    return publicUser(rec);
  });

  router.put("/api/users/:id", (req, res, ctx) => {
    const user = authenticate(req);
    requirePage(user, "users");
    requireRole(user, "super_admin");
    const target = findById("users", ctx.params.id);
    if (!target) throw new HttpError(404, "User not found");
    const b = ctx.body;
    const patch = {};
    for (const k of ["name", "email", "username", "role", "status"]) if (k in b) patch[k] = b[k];
    if (b.password) patch.password = hashPassword(b.password);
    if (patch.role && !get().roles[patch.role]) throw new HttpError(400, "Unknown role");
    update("users", target.id, patch);
    return publicUser(findById("users", target.id));
  });

  router.delete("/api/users/:id", (req, res, ctx) => {
    const user = authenticate(req);
    requirePage(user, "users");
    requireRole(user, "super_admin");
    if (user.id === ctx.params.id) throw new HttpError(400, "You cannot delete your own account");
    if (!remove("users", ctx.params.id)) throw new HttpError(404, "User not found");
    return { ok: true };
  });

  /* ---------------- RBAC permission matrix ---------------- */
  router.get("/api/rbac", (req) => {
    const user = authenticate(req);
    requirePage(user, "users");
    return { access: get().access, roles: get().roles };
  });

  // Toggle a page permission for a role.
  router.put("/api/rbac/:role", (req, res, ctx) => {
    const user = authenticate(req);
    requirePage(user, "users");
    requireRole(user, "super_admin");
    const role = ctx.params.role;
    const access = get().access;
    if (!access[role]) throw new HttpError(404, "Unknown role");
    const { page, enabled } = ctx.body;
    if (!page) throw new HttpError(400, "page required");
    const set = new Set(access[role]);
    if (enabled) set.add(page); else set.delete(page);
    access[role] = Array.from(set);
    persist();
    return { role, access: access[role] };
  });

  /* ---------------- Integrations ---------------- */
  router.get("/api/integrations", (req) => {
    const user = authenticate(req);
    requirePage(user, "integrations");
    return { data: col("integrations"), webhookLogs: col("webhookLogs") };
  });

  router.put("/api/integrations/:id", (req, res, ctx) => {
    const user = authenticate(req);
    requirePage(user, "integrations");
    const integ = findById("integrations", ctx.params.id);
    if (!integ) throw new HttpError(404, "Integration not found");
    const b = ctx.body;
    const patch = {};
    if ("status" in b) patch.status = b.status;
    if ("intervalMin" in b) patch.intervalMin = Number(b.intervalMin);
    if ("connected" in b) { patch.status = b.connected ? "Connected" : "Disconnected"; patch.oauth = { ...integ.oauth, connected: !!b.connected }; }
    update("integrations", integ.id, patch);
    bus.emit("event", { type: "integration.updated", icon: "🔌", color: "b-violet", text: `${integ.name} ${patch.status || "updated"}`, ts: Date.now() });
    return findById("integrations", integ.id);
  });

  // OAuth: get the authorization URL for a channel. Uses the real client when
  // credentials are configured, otherwise returns a simulated connect URL.
  router.get("/api/integrations/:id/oauth-url", (req, res, ctx) => {
    const user = authenticate(req);
    requirePage(user, "integrations");
    const id = ctx.params.id;
    if (id === "shopee" && shopeeConfig.configured()) return { mode: "live", ...shopeeAuthUrl() };
    if (id === "tiktok" && tiktokConfig.configured()) return { mode: "live", ...tiktokAuthUrl() };
    // simulated: a URL that points back at our own callback with a fake code
    const base = `${ctx.url.protocol}//${req.headers.host}`;
    return { mode: "simulated", url: `${base}/api/integrations/${id}/callback?code=mock_${Date.now()}`, note: "Set real credentials (see server/README.md) to use the live OAuth flow." };
  });

  // OAuth callback — completes the connect. In simulated mode this stores a
  // mock token set; in live mode you would exchange the code via the client.
  router.get("/api/integrations/:id/callback", (req, res, ctx) => {
    const id = ctx.params.id;
    const integ = findById("integrations", id);
    if (!integ) throw new HttpError(404, "Integration not found");
    const tokens = mockConnect(id);
    update("integrations", id, { status: "Connected", oauth: { connected: true, tokenExpiresIn: tokens.expires_in, shopId: tokens.shop_id, obtainedAt: tokens.connectedAt } });
    bus.emit("event", { type: "integration.connected", icon: "🔗", color: "b-green", text: `${integ.name} connected via OAuth`, ts: Date.now() });
    return { ok: true, id, status: "Connected", tokenPreview: tokens.access_token.slice(0, 12) + "…" };
  });

  // Sync run — pulls orders from the channel and ingests them into the WMS.
  router.post("/api/integrations/:id/sync", (req, res, ctx) => {
    const user = authenticate(req);
    requirePage(user, "integrations");
    const integ = findById("integrations", ctx.params.id);
    if (!integ) throw new HttpError(404, "Integration not found");
    if (integ.status !== "Connected") throw new HttpError(409, `${integ.name} is not connected — connect it first`);

    const pulled = mockPullOrders(integ.id, 1 + Math.floor(Math.random() * 3));
    let imported = 0;
    for (const ext of pulled) {
      const { duplicate } = ingestExternalOrder(integ.id, ext);
      if (!duplicate) imported++;
    }
    const now = new Date().toISOString();
    update("integrations", integ.id, { lastSync: now, orders24h: (integ.orders24h || 0) + imported });
    logWebhook(integ.name, "order.sync", "200 OK", 90 + Math.floor(Math.random() * 60));
    bus.emit("event", { type: "integration.synced", icon: "🔁", color: "b-violet", text: `${integ.name} sync pulled ${imported} new order(s)`, ts: Date.now() });
    bus.emit("event", { type: "pipeline", ...pipelineCounts() });
    return { ok: true, id: integ.id, lastSync: now, ordersPulled: pulled.length, ordersImported: imported };
  });

  // Webhook receiver — the endpoint a marketplace POSTs events to.
  // Public (no auth): real marketplaces authenticate via a signature header.
  router.post("/api/integrations/:id/webhook", (req, res, ctx) => {
    const id = ctx.params.id;
    const integ = findById("integrations", id);
    if (!integ) throw new HttpError(404, "Unknown channel");
    const payload = ctx.body && ctx.body.event ? ctx.body : mockWebhookPayload(id);
    const started = Date.now();
    let result = { handled: payload.event };
    if (payload.event === "order.create" && payload.data) {
      const { order, duplicate } = ingestExternalOrder(id, payload.data);
      result.orderId = order.id;
      result.duplicate = duplicate;
      bus.emit("event", { type: "pipeline", ...pipelineCounts() });
    }
    logWebhook(integ.name, payload.event, "200 OK", Date.now() - started || 42);
    update("integrations", id, { webhooks: (integ.webhooks || 0) + 1 });
    return { ok: true, ...result };
  });

  // Convenience: simulate an inbound webhook (for the UI "test webhook" button).
  router.post("/api/integrations/:id/simulate-webhook", (req, res, ctx) => {
    const user = authenticate(req);
    requirePage(user, "integrations");
    const integ = findById("integrations", ctx.params.id);
    if (!integ) throw new HttpError(404, "Integration not found");
    const payload = mockWebhookPayload(integ.id, "order.create");
    const { order } = ingestExternalOrder(integ.id, payload.data);
    logWebhook(integ.name, payload.event, "200 OK", 48);
    update("integrations", integ.id, { webhooks: (integ.webhooks || 0) + 1 });
    bus.emit("event", { type: "pipeline", ...pipelineCounts() });
    return { ok: true, event: payload.event, orderId: order.id };
  });

  /* ---------------- Dashboard metrics ---------------- */
  router.get("/api/dashboard", (req) => {
    const user = authenticate(req);
    requirePage(user, "dashboard");
    const products = col("products").filter((p) => !p.deleted);
    const low = products.filter((p) => p.phys > 0 && p.avail <= p.safety);
    const out = products.filter((p) => p.phys === 0);
    const revenueSeries = [
      { d: "Mon", rev: 4200, ord: 62 }, { d: "Tue", rev: 5100, ord: 78 },
      { d: "Wed", rev: 4800, ord: 71 }, { d: "Thu", rev: 6300, ord: 95 },
      { d: "Fri", rev: 7200, ord: 112 }, { d: "Sat", rev: 9100, ord: 138 },
      { d: "Sun", rev: 8400, ord: 126 },
    ];
    const totalRev = revenueSeries.reduce((a, b) => a + b.rev, 0);
    const totalOrd = revenueSeries.reduce((a, b) => a + b.ord, 0);
    return {
      kpis: { revenue7d: totalRev, orders7d: totalOrd, aov: +(totalRev / totalOrd).toFixed(2), stockAlerts: low.length + out.length, outOfStock: out.length },
      pipeline: pipelineCounts(),
      revenueSeries,
      channelSplit: [
        { name: "Shopee", value: 48, color: "#ee4d2d" },
        { name: "TikTok", value: 33, color: "#111827" },
        { name: "Tokopedia", value: 19, color: "#42b549" },
      ],
      stockAlerts: [...out, ...low].slice(0, 6).map((p) => ({ sku: p.sku, name: p.name, img: p.img, avail: p.avail, safety: p.safety, health: p.phys === 0 ? "out" : "low" })),
      activity: col("activity").slice().sort((a, b) => b.ts - a.ts),
      liveClients: clientCount(),
    };
  });

  /* ---------------- Reference data & health ---------------- */
  router.get("/api/reference", (req) => {
    authenticate(req);
    return get().reference;
  });

  router.get("/api/health", () => ({ ok: true, ts: Date.now(), wsClients: clientCount() }));
}
