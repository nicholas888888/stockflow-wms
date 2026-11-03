// Users & RBAC, integrations, auth, and dashboard metrics.
import { col, findById, update, insert, remove, get, persist } from "../lib/store.js";
import { HttpError } from "../lib/http.js";
import { authenticate, requirePage, requireRole, login, loginRateState, publicUser } from "../auth.js";
import { hashPassword } from "../lib/crypto.js";
import { newId } from "../lib/crypto.js";
import { bus, clientCount } from "../lib/ws.js";
import { pipelineCounts } from "./orders.js";

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

  // Simulate a channel sync run.
  router.post("/api/integrations/:id/sync", (req, res, ctx) => {
    const user = authenticate(req);
    requirePage(user, "integrations");
    const integ = findById("integrations", ctx.params.id);
    if (!integ) throw new HttpError(404, "Integration not found");
    update("integrations", integ.id, { lastSync: new Date().toISOString() });
    bus.emit("event", { type: "integration.synced", icon: "🔁", color: "b-violet", text: `${integ.name} sync complete`, ts: Date.now() });
    return { ok: true, id: integ.id, lastSync: new Date().toISOString(), ordersPulled: Math.floor(Math.random() * 8) };
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
