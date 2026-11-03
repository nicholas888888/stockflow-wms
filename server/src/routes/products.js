// Product & inventory + categories/brands routes.
import { col, findById, insert, update, persist } from "../lib/store.js";
import { HttpError } from "../lib/http.js";
import { authenticate, requirePage } from "../auth.js";
import { bus } from "../lib/ws.js";

const nextProductId = () => (col("products").reduce((m, p) => Math.max(m, p.id), 0) || 0) + 1;

function stockHealth(p) {
  if (p.phys === 0) return "out";
  if (p.avail <= p.safety) return "low";
  return "in";
}

const shape = (p) => ({ ...p, health: stockHealth(p) });

export function register(router) {
  /* ---------------- Products ---------------- */
  router.get("/api/products", (req, res, ctx) => {
    const user = authenticate(req);
    requirePage(user, "products");
    const { q, category, brand, stock, includeDeleted } = ctx.query;
    let list = col("products").filter((p) => includeDeleted === "true" || !p.deleted);
    if (q) {
      const s = q.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(s) ||
          p.sku.toLowerCase().includes(s) ||
          p.ean.includes(s)
      );
    }
    if (category && category !== "all") list = list.filter((p) => p.cat === category);
    if (brand && brand !== "all") list = list.filter((p) => p.brand === brand);
    if (stock && stock !== "all") list = list.filter((p) => stockHealth(p) === stock);
    return { data: list.map(shape), total: list.length };
  });

  router.get("/api/products/:id", (req, res, ctx) => {
    const user = authenticate(req);
    requirePage(user, "products");
    const p = findById("products", Number(ctx.params.id));
    if (!p || p.deleted) throw new HttpError(404, "Product not found");
    return shape(p);
  });

  router.post("/api/products", (req, res, ctx) => {
    const user = authenticate(req);
    requirePage(user, "products");
    const b = ctx.body;
    if (!b.name || !b.sku) throw new HttpError(400, "name and sku are required");
    if (col("products").some((p) => p.sku.toLowerCase() === String(b.sku).toLowerCase()))
      throw new HttpError(409, "SKU must be unique");
    const rec = {
      id: nextProductId(),
      img: b.img || "📦",
      name: b.name,
      sku: b.sku,
      ean: b.ean || "",
      cat: b.cat || "",
      brand: b.brand || "",
      loc: b.loc || "",
      phys: Number(b.phys || 0),
      avail: Number(b.avail ?? b.phys ?? 0),
      reserved: Number(b.reserved || 0),
      transit: Number(b.transit || 0),
      safety: Number(b.safety || 0),
      price: Number(b.price || 0),
      cost: Number(b.cost || 0),
      deleted: false,
    };
    insert("products", rec);
    bus.emit("event", { type: "product.created", icon: "🆕", color: "b-blue", text: `${user.name} created ${rec.sku}`, ts: Date.now() });
    return shape(rec);
  });

  router.put("/api/products/:id", (req, res, ctx) => {
    const user = authenticate(req);
    requirePage(user, "products");
    const id = Number(ctx.params.id);
    const p = findById("products", id);
    if (!p || p.deleted) throw new HttpError(404, "Product not found");
    const b = ctx.body;
    if (b.sku && b.sku.toLowerCase() !== p.sku.toLowerCase() &&
        col("products").some((x) => x.sku.toLowerCase() === b.sku.toLowerCase()))
      throw new HttpError(409, "SKU must be unique");
    const numeric = ["phys", "avail", "reserved", "transit", "safety", "price", "cost"];
    const patch = {};
    for (const k of ["img","name","sku","ean","cat","brand","loc"]) if (k in b) patch[k] = b[k];
    for (const k of numeric) if (k in b) patch[k] = Number(b[k]);
    update("products", id, patch);
    bus.emit("event", { type: "product.updated", icon: "✏️", color: "b-violet", text: `${p.sku} updated & synced to channels`, ts: Date.now() });
    return shape(findById("products", id));
  });

  // Soft delete
  router.delete("/api/products/:id", (req, res, ctx) => {
    const user = authenticate(req);
    requirePage(user, "products");
    const id = Number(ctx.params.id);
    const p = findById("products", id);
    if (!p || p.deleted) throw new HttpError(404, "Product not found");
    update("products", id, { deleted: true });
    bus.emit("event", { type: "product.deleted", icon: "🗑️", color: "b-gray", text: `${p.sku} soft-deleted`, ts: Date.now() });
    return { ok: true, id, softDeleted: true };
  });

  // Stock adjustment (inventory specialist capability)
  router.post("/api/products/:id/adjust", (req, res, ctx) => {
    const user = authenticate(req);
    requirePage(user, "products");
    const id = Number(ctx.params.id);
    const p = findById("products", id);
    if (!p || p.deleted) throw new HttpError(404, "Product not found");
    const delta = Number(ctx.body.delta || 0);
    const reason = ctx.body.reason || "manual adjustment";
    const newPhys = p.phys + delta;
    if (newPhys < 0) throw new HttpError(400, "Adjustment would make physical stock negative");
    update("products", id, { phys: newPhys, avail: Math.max(0, p.avail + delta) });
    bus.emit("event", { type: "stock.adjusted", icon: "📊", color: "b-amber", text: `${user.name} adjusted ${p.sku} by ${delta > 0 ? "+" : ""}${delta} (${reason})`, ts: Date.now() });
    return shape(findById("products", id));
  });

  /* ---------------- Categories ---------------- */
  router.get("/api/categories", (req) => {
    const user = authenticate(req);
    requirePage(user, "categories");
    return { data: col("categories") };
  });
  router.post("/api/categories", (req, res, ctx) => {
    const user = authenticate(req);
    requirePage(user, "categories");
    const b = ctx.body;
    if (!b.name) throw new HttpError(400, "name is required");
    const rec = { id: "CAT-" + String(col("categories").length + 1).padStart(2, "0"), name: b.name, parent: b.parent || null, slug: b.slug || b.name.toLowerCase().replace(/\s+/g, "-"), description: b.description || "", status: b.status || "Active" };
    insert("categories", rec);
    return rec;
  });
  router.put("/api/categories/:id", (req, res, ctx) => {
    const user = authenticate(req);
    requirePage(user, "categories");
    const rec = update("categories", ctx.params.id, ctx.body);
    if (!rec) throw new HttpError(404, "Category not found");
    return rec;
  });
  router.delete("/api/categories/:id", (req, res, ctx) => {
    const user = authenticate(req);
    requirePage(user, "categories");
    const d = col("categories"); const before = d.length;
    const i = d.findIndex((c) => c.id === ctx.params.id);
    if (i < 0) throw new HttpError(404, "Category not found");
    d.splice(i, 1); persist();
    return { ok: true };
  });

  /* ---------------- Brands ---------------- */
  router.get("/api/brands", (req) => {
    const user = authenticate(req);
    requirePage(user, "categories");
    const brandCounts = {};
    col("products").filter((p) => !p.deleted).forEach((p) => (brandCounts[p.brand] = (brandCounts[p.brand] || 0) + 1));
    return { data: col("brands").map((b) => ({ ...b, products: brandCounts[b.name] || 0 })) };
  });
  router.post("/api/brands", (req, res, ctx) => {
    const user = authenticate(req);
    requirePage(user, "categories");
    const b = ctx.body;
    if (!b.name) throw new HttpError(400, "name is required");
    const rec = { id: "BR-" + String(col("brands").length + 1).padStart(2, "0"), name: b.name, slug: b.slug || b.name.toLowerCase(), description: b.description || "", status: b.status || "Active" };
    insert("brands", rec);
    return rec;
  });
  router.put("/api/brands/:id", (req, res, ctx) => {
    const user = authenticate(req);
    requirePage(user, "categories");
    const rec = update("brands", ctx.params.id, ctx.body);
    if (!rec) throw new HttpError(404, "Brand not found");
    return rec;
  });
}
