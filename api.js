/* =========================================================
   StockFlow WMS — optional API client
   ---------------------------------------------------------
   The UI runs standalone on in-memory mock data by default.
   To drive it from the real backend instead, set:
     window.WMS_API_BASE = "http://localhost:4000";
   (e.g. in the browser console, or edit index.html) and reload.
   This module exposes window.WMS_API with typed helpers; wiring
   individual views to it is incremental and optional.
   ========================================================= */
(function () {
  const BASE = window.WMS_API_BASE || "";
  const enabled = !!BASE;
  let token = localStorage.getItem("wms_token") || null;

  async function req(method, path, body) {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { status: res.status, details: data.details });
    return data;
  }

  const API = {
    enabled,
    base: BASE,
    get token() { return token; },
    setToken(t) { token = t; t ? localStorage.setItem("wms_token", t) : localStorage.removeItem("wms_token"); },

    // auth
    login: (identifier, password) => req("POST", "/api/auth/login", { identifier, password }),
    me: () => req("GET", "/api/auth/me"),
    forgot: (email) => req("POST", "/api/auth/forgot", { email }),

    // products
    products: (q = {}) => req("GET", "/api/products?" + new URLSearchParams(q)),
    createProduct: (p) => req("POST", "/api/products", p),
    updateProduct: (id, p) => req("PUT", "/api/products/" + id, p),
    deleteProduct: (id) => req("DELETE", "/api/products/" + id),
    adjustStock: (id, delta, reason) => req("POST", `/api/products/${id}/adjust`, { delta, reason }),

    // catalog
    categories: () => req("GET", "/api/categories"),
    brands: () => req("GET", "/api/brands"),

    // orders
    pipeline: () => req("GET", "/api/orders/pipeline"),
    orders: (q = {}) => req("GET", "/api/orders?" + new URLSearchParams(q)),
    processOrder: (id) => req("POST", `/api/orders/${encodeURIComponent(id)}/process`),
    printOrder: (id) => req("POST", `/api/orders/${encodeURIComponent(id)}/print`),
    bulkOrders: (action, ids) => req("POST", "/api/orders/bulk", { action, ids }),

    // fulfillment
    queue: (mode) => req("GET", `/api/${mode}/queue`),
    startSession: (mode, barcode) => req("POST", `/api/${mode}/sessions`, { barcode }),
    scan: (mode, orderId, code) => req("POST", `/api/${mode}/sessions/${encodeURIComponent(orderId)}/scan`, { code }),
    completePacking: (orderId, dims) => req("POST", `/api/packing/sessions/${encodeURIComponent(orderId)}/complete`, dims),
    outboundReady: () => req("GET", "/api/outbound/ready"),
    dispatch: (barcode) => req("POST", "/api/outbound/dispatch", { barcode }),

    // inbound
    purchaseOrders: () => req("GET", "/api/inbound/purchase-orders"),
    receive: (payload) => req("POST", "/api/inbound/receive", payload),
    returns: (q = {}) => req("GET", "/api/returns?" + new URLSearchParams(q)),
    disposition: (id, action) => req("POST", `/api/returns/${id}/disposition`, { action }),

    // admin
    users: () => req("GET", "/api/users"),
    createUser: (u) => req("POST", "/api/users", u),
    updateUser: (id, u) => req("PUT", "/api/users/" + id, u),
    deleteUser: (id) => req("DELETE", "/api/users/" + id),
    rbac: () => req("GET", "/api/rbac"),
    setPermission: (role, page, enabled) => req("PUT", "/api/rbac/" + role, { page, enabled }),
    integrations: () => req("GET", "/api/integrations"),
    updateIntegration: (id, patch) => req("PUT", "/api/integrations/" + id, patch),
    syncIntegration: (id) => req("POST", `/api/integrations/${id}/sync`),
    dashboard: () => req("GET", "/api/dashboard"),

    // live stream
    connectLive(onEvent) {
      if (!enabled) return null;
      const wsUrl = BASE.replace(/^http/, "ws") + "/ws";
      try {
        const ws = new WebSocket(wsUrl);
        ws.onmessage = (e) => { try { onEvent(JSON.parse(e.data)); } catch {} };
        return ws;
      } catch { return null; }
    },
  };

  window.WMS_API = API;
  if (enabled) console.info("[WMS] API client enabled →", BASE);
})();
