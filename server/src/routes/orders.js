// Order management: list/filter, pipeline counts, process & print transitions.
import { col, findById, update } from "../lib/store.js";
import { HttpError } from "../lib/http.js";
import { authenticate, requirePage } from "../auth.js";
import { bus } from "../lib/ws.js";

export function pipelineCounts() {
  const orders = col("orders");
  const c = { total: orders.length, Pending: 0, "Waiting Picking": 0, "Waiting Packing": 0, "Waiting Outbound": 0, Shipped: 0 };
  for (const o of orders) {
    if (o.status === "Pending") c.Pending++;
    else if (o.status === "Waiting Picking" || o.status === "Printed") c["Waiting Picking"]++;
    else if (o.status === "Waiting Packing") c["Waiting Packing"]++;
    else if (o.status === "Waiting Outbound") c["Waiting Outbound"]++;
    else if (o.status === "Shipped") c.Shipped++;
  }
  return c;
}

export function register(router) {
  router.get("/api/orders/pipeline", (req) => {
    const user = authenticate(req);
    requirePage(user, "orders");
    return pipelineCounts();
  });

  router.get("/api/orders", (req, res, ctx) => {
    const user = authenticate(req);
    requirePage(user, "orders");
    const { status, courier, delivery, channel, q } = ctx.query;
    let list = col("orders").slice();
    if (status && status !== "all") {
      list = list.filter((o) => {
        const bucket = o.status === "Printed" ? "Waiting Picking" : o.status;
        return bucket === status;
      });
    }
    if (courier && courier !== "all") list = list.filter((o) => o.courier === courier);
    if (delivery && delivery !== "all") list = list.filter((o) => o.delivery === delivery);
    if (channel && channel !== "all") list = list.filter((o) => o.channel === channel);
    if (q) {
      const s = q.toLowerCase();
      list = list.filter(
        (o) => o.id.toLowerCase().includes(s) || o.customer.toLowerCase().includes(s) || o.waybill.toLowerCase().includes(s)
      );
    }
    return { data: list, total: list.length };
  });

  router.get("/api/orders/:id", (req, res, ctx) => {
    const user = authenticate(req);
    requirePage(user, "orders");
    const o = findById("orders", decodeURIComponent(ctx.params.id));
    if (!o) throw new HttpError(404, "Order not found");
    return o;
  });

  // Process: Pending -> Waiting Picking (reserves stock = oversell lock)
  router.post("/api/orders/:id/process", (req, res, ctx) => {
    const user = authenticate(req);
    requirePage(user, "orders");
    const o = findById("orders", ctx.params.id);
    if (!o) throw new HttpError(404, "Order not found");
    if (o.status !== "Pending") throw new HttpError(409, `Order is '${o.status}', cannot process`);
    reserveStock(o);
    update("orders", o.id, { status: "Waiting Picking" });
    bus.emit("event", { type: "order.processed", icon: "📋", color: "b-blue", text: `${o.id} → Waiting for Picking`, ts: Date.now() });
    bus.emit("event", { type: "pipeline", ...pipelineCounts() });
    return { ...o, status: "Waiting Picking" };
  });

  // Print invoice + waybill. Pending -> Printed (auto-status per spec).
  router.post("/api/orders/:id/print", (req, res, ctx) => {
    const user = authenticate(req);
    requirePage(user, "orders");
    const o = findById("orders", ctx.params.id);
    if (!o) throw new HttpError(404, "Order not found");
    if (o.status === "Pending") update("orders", o.id, { status: "Printed" });
    bus.emit("event", { type: "order.printed", icon: "🖨️", color: "b-teal", text: `Invoice + ${o.courier} waybill printed for ${o.id}`, ts: Date.now() });
    return {
      ok: true,
      orderId: o.id,
      documents: [
        { type: "invoice", url: `/api/orders/${encodeURIComponent(o.id)}/documents/invoice.pdf` },
        { type: "waybill", url: `/api/orders/${encodeURIComponent(o.id)}/documents/waybill.pdf`, courier: o.courier },
      ],
      status: o.status === "Pending" ? "Printed" : o.status,
    };
  });

  // Bulk actions
  router.post("/api/orders/bulk", (req, res, ctx) => {
    const user = authenticate(req);
    requirePage(user, "orders");
    const { action, ids } = ctx.body;
    if (!Array.isArray(ids) || !ids.length) throw new HttpError(400, "ids[] required");
    let affected = 0;
    for (const id of ids) {
      const o = findById("orders", id);
      if (!o) continue;
      if (action === "process" && o.status === "Pending") { reserveStock(o); update("orders", id, { status: "Waiting Picking" }); affected++; }
      else if (action === "print" && o.status === "Pending") { update("orders", id, { status: "Printed" }); affected++; }
    }
    bus.emit("event", { type: "pipeline", ...pipelineCounts() });
    return { ok: true, action, affected };
  });
}

// Reserve stock for an order (prevents overselling across channels).
function reserveStock(order) {
  for (const line of order.items) {
    const p = col("products").find((x) => x.sku === line.sku);
    if (!p) continue;
    if (p.avail < line.qty) {
      throw new HttpError(409, `Oversell blocked: only ${p.avail} of ${p.sku} available (need ${line.qty})`);
    }
  }
  // apply after validating all lines
  for (const line of order.items) {
    const p = col("products").find((x) => x.sku === line.sku);
    if (!p) continue;
    update("products", p.id, { avail: p.avail - line.qty, reserved: p.reserved + line.qty });
  }
}
