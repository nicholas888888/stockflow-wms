/* =========================================================
   StockFlow WMS — Sync layer
   ---------------------------------------------------------
   Bridges the UI's synchronous DB cache with the async backend.
   When window.WMS_API.enabled is true, this hydrates DB.* from
   the server and exposes helpers the view handlers call to
   mutate data through the API (then re-hydrate + re-render).
   When the API is disabled, everything stays on mock data.
   ========================================================= */
(function () {
  const API = window.WMS_API;
  const DB = window.DB;
  const apiMode = !!(API && API.enabled);

  /* ---------- shape normalizers (server -> UI) ---------- */
  // UI order.items want { p: <product>, q } ; server gives flat line items.
  function normalizeOrder(o) {
    const items = (o.items || []).map((it) => ({
      p: {
        id: it.sku, img: it.img, name: it.name, sku: it.sku, ean: it.ean,
        loc: it.loc, price: it.price,
      },
      q: it.qty,
    }));
    return {
      ...o,
      bc: o.barcode || o.bc,
      items,
      itemCount: o.itemCount != null ? o.itemCount : items.reduce((a, b) => a + b.q, 0),
      total: o.total != null ? o.total : items.reduce((a, b) => a + b.q * b.p.price, 0),
    };
  }

  /* ---------- hydration ---------- */
  async function hydrateAll() {
    if (!apiMode) return;
    const [prod, cats, brands, orders, users, integ] = await Promise.all([
      API.products().catch(() => null),
      API.categories().catch(() => null),
      API.brands().catch(() => null),
      API.orders().catch(() => null),
      API.users().catch(() => null),
      API.integrations().catch(() => null),
    ]);
    if (prod) DB.products = prod.data;
    if (cats) DB.categories = cats.data;
    if (brands) DB.brands = brands.data;
    if (orders) DB.orders = orders.data.map(normalizeOrder);
    if (users) DB.users = users.data;
    if (integ) { DB.integrations = integ.data; DB.webhookLogs = integ.webhookLogs || DB.webhookLogs; }
    // auxiliary (best-effort; ignore access failures by role)
    try { const po = await API.purchaseOrders(); DB.purchaseOrders = po.data; } catch {}
    try { const r = await API.returns(); DB.returns = r.data.map(mapReturn); } catch {}
  }

  function mapReturn(r) { return { ...r, disp: r.disposition || "—" }; }

  async function refresh(kind) {
    if (!apiMode) return;
    try {
      if (kind === "products") DB.products = (await API.products()).data;
      else if (kind === "orders") DB.orders = (await API.orders()).data.map(normalizeOrder);
      else if (kind === "categories") DB.categories = (await API.categories()).data;
      else if (kind === "brands") DB.brands = (await API.brands()).data;
      else if (kind === "users") DB.users = (await API.users()).data;
      else if (kind === "returns") DB.returns = (await API.returns()).data.map(mapReturn);
      else if (kind === "purchaseOrders") DB.purchaseOrders = (await API.purchaseOrders()).data;
      else if (kind === "integrations") { const i = await API.integrations(); DB.integrations = i.data; DB.webhookLogs = i.webhookLogs || DB.webhookLogs; }
    } catch (e) { /* keep stale cache on failure */ }
  }

  window.WMS_SYNC = { apiMode, hydrateAll, refresh, normalizeOrder, mapReturn };
})();
