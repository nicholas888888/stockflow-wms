// Inbound: PO receiving with QC, and customer returns with disposition.
import { col, findById, update, insert } from "../lib/store.js";
import { HttpError } from "../lib/http.js";
import { authenticate, requirePage } from "../auth.js";
import { bus } from "../lib/ws.js";

export function register(router) {
  /* ---------------- Purchase orders ---------------- */
  router.get("/api/inbound/purchase-orders", (req) => {
    const user = authenticate(req);
    requirePage(user, "inbound");
    return { data: col("purchaseOrders") };
  });

  // Receive stock against a PO + QC → increases inventory, syncs channels.
  router.post("/api/inbound/receive", (req, res, ctx) => {
    const user = authenticate(req);
    requirePage(user, "inbound");
    const { sku, quantity, location, qc, poId } = ctx.body;
    if (!sku || !quantity) throw new HttpError(400, "sku and quantity are required");
    const p = col("products").find((x) => x.sku.toLowerCase() === String(sku).toLowerCase());
    if (!p) throw new HttpError(404, "Unknown SKU");
    const qty = Number(quantity);
    if (qty <= 0) throw new HttpError(400, "quantity must be positive");

    const result = String(qc || "passed").toLowerCase();
    let added = 0;
    if (result === "passed") added = qty;
    else if (result === "partial") added = Math.floor(qty / 2);
    else added = 0; // failed → nothing added

    // Capture target values BEFORE mutating (update() mutates `p` in place).
    const newPhys = p.phys + added;
    const newAvail = p.avail + added;
    const patch = { phys: newPhys, avail: newAvail };
    if (location) patch.loc = location;
    update("products", p.id, patch);

    if (poId) {
      const po = findById("purchaseOrders", poId);
      if (po) update("purchaseOrders", poId, { status: "Completed" });
    }

    bus.emit("event", { type: "inbound.received", icon: "📦", color: "b-blue", text: `${user.name} received ${added} units of ${p.sku}`, ts: Date.now() });
    bus.emit("event", { type: "inventory.synced", icon: "🔁", color: "b-violet", text: `Inventory sync pushed to 3 channels · ${p.sku}`, ts: Date.now() });
    return { ok: true, sku: p.sku, qcResult: result, unitsAdded: added, newPhysical: newPhys, newAvailable: newAvail, channelsSynced: ["TikTok", "Shopee", "Tokopedia"] };
  });

  /* ---------------- Returns ---------------- */
  router.get("/api/returns", (req, res, ctx) => {
    const user = authenticate(req);
    requirePage(user, "returns");
    let list = col("returns");
    const { reason } = ctx.query;
    if (reason && reason !== "all") list = list.filter((r) => r.reason === reason);
    return { data: list };
  });

  router.post("/api/returns", (req, res, ctx) => {
    const user = authenticate(req);
    requirePage(user, "returns");
    const b = ctx.body;
    if (!b.sku || !b.reason) throw new HttpError(400, "sku and reason are required");
    const rec = { id: "RMA-" + Math.floor(5500 + Math.random() * 500), order: b.order || "", customer: b.customer || "Unknown", reason: b.reason, sku: b.sku, qty: Number(b.qty || 1), status: "Inspecting", disposition: null };
    insert("returns", rec);
    return rec;
  });

  // Disposition decision: restock (increase stock) vs. defective/quarantine.
  router.post("/api/returns/:id/disposition", (req, res, ctx) => {
    const user = authenticate(req);
    requirePage(user, "returns");
    const r = findById("returns", ctx.params.id);
    if (!r) throw new HttpError(404, "Return not found");
    const action = String(ctx.body.action || "").toLowerCase();
    if (action === "restock") {
      const p = col("products").find((x) => x.sku === r.sku);
      if (p) update("products", p.id, { phys: p.phys + r.qty, avail: p.avail + r.qty });
      update("returns", r.id, { status: "Restocked", disposition: "Restock" });
      bus.emit("event", { type: "return.restocked", icon: "♻️", color: "b-green", text: `${r.id} restocked (+${r.qty} ${r.sku})`, ts: Date.now() });
    } else if (action === "defective" || action === "quarantine") {
      update("returns", r.id, { status: "Quarantine", disposition: "Defective" });
      bus.emit("event", { type: "return.quarantined", icon: "⛔", color: "b-pink", text: `${r.id} quarantined as Defective`, ts: Date.now() });
    } else {
      throw new HttpError(400, "action must be 'restock' or 'defective'");
    }
    return findById("returns", r.id);
  });
}
