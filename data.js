/* =========================================================
   WMS — Mock data (UI demo, no backend)
   ========================================================= */
window.DB = (function () {
  const emoji = { shirt: "👕", glove: "🥊", wrap: "🩹", short: "🩳", shoe: "👟", bag: "🎒", protect: "🛡️", rope: "🪢" };

  const roles = {
    super_admin:   { label: "Super Admin",        home: "dashboard", color: "b-violet" },
    warehouse_mgr: { label: "Warehouse Manager",   home: "dashboard", color: "b-blue" },
    operator:      { label: "Fulfillment Operator",home: "picking",   color: "b-teal" },
    specialist:    { label: "Inventory Specialist",home: "products",  color: "b-amber" },
  };

  // Which pages each role may access
  const access = {
    super_admin:   ["dashboard","products","categories","inbound","returns","orders","picking","packing","outbound","users","integrations"],
    warehouse_mgr: ["dashboard","products","categories","inbound","returns","orders","picking","packing","outbound"],
    operator:      ["picking","packing","outbound"],
    specialist:    ["products","categories","inbound","returns"],
  };

  const brands = [
    { id: "BR-01", name: "Rival",    slug: "rival",    products: 42, status: "Active" },
    { id: "BR-02", name: "Boxraw",   slug: "boxraw",   products: 36, status: "Active" },
    { id: "BR-03", name: "Superare", slug: "superare", products: 28, status: "Active" },
    { id: "BR-04", name: "Venum",    slug: "venum",    products: 51, status: "Active" },
    { id: "BR-05", name: "Hayabusa", slug: "hayabusa", products: 19, status: "Inactive" },
  ];

  const categories = [
    { id: "CAT-01", name: "Apparel",   parent: null,      slug: "apparel",   products: 64, status: "Active" },
    { id: "CAT-02", name: "Shirts",    parent: "Apparel", slug: "shirts",    products: 31, status: "Active" },
    { id: "CAT-03", name: "Shorts",    parent: "Apparel", slug: "shorts",    products: 18, status: "Active" },
    { id: "CAT-04", name: "Equipment", parent: null,      slug: "equipment", products: 92, status: "Active" },
    { id: "CAT-05", name: "Gloves",    parent: "Equipment", slug: "gloves",  products: 40, status: "Active" },
    { id: "CAT-06", name: "Handwraps", parent: "Equipment", slug: "handwraps", products: 22, status: "Active" },
    { id: "CAT-07", name: "Protective",parent: "Equipment", slug: "protective", products: 30, status: "Active" },
  ];

  const products = [
    { id: 1, img: emoji.glove,  name: "Pro Boxing Gloves 16oz",      sku: "RVL-GLV-16-RED", ean: "8991102001234", cat: "Gloves",    brand: "Rival",    loc: "A-02-B", phys: 240, avail: 212, reserved: 24, transit: 50, safety: 40, price: 89.0,  cost: 52.0 },
    { id: 2, img: emoji.wrap,   name: "Hand Wraps 180\" Mexican",     sku: "BXR-WRP-180-BLK",ean: "8991102005678", cat: "Handwraps", brand: "Boxraw",   loc: "A-04-C", phys: 18,  avail: 12,  reserved: 6,  transit: 0,  safety: 30, price: 14.5,  cost: 6.2 },
    { id: 3, img: emoji.shirt,  name: "Training Tee Dri-Fit",         sku: "SUP-TEE-M-NVY",  ean: "8991102009012", cat: "Shirts",    brand: "Superare", loc: "B-01-A", phys: 520, avail: 498, reserved: 22, transit: 120,safety: 80, price: 32.0,  cost: 11.0 },
    { id: 4, img: emoji.short,  name: "Muay Thai Shorts Classic",     sku: "VNM-SHT-L-GLD",  ean: "8991102013456", cat: "Shorts",    brand: "Venum",    loc: "B-03-D", phys: 0,   avail: 0,   reserved: 0,  transit: 80, safety: 25, price: 48.0,  cost: 19.0 },
    { id: 5, img: emoji.protect,name: "Shin Guards Elite",            sku: "HYB-SHN-ML-BLK", ean: "8991102017890", cat: "Protective",brand: "Hayabusa", loc: "C-02-B", phys: 96,  avail: 88,  reserved: 8,  transit: 0,  safety: 20, price: 74.0,  cost: 33.0 },
    { id: 6, img: emoji.glove,  name: "Bag Gloves 12oz",              sku: "RVL-GLV-12-BLU", ean: "8991102021234", cat: "Gloves",    brand: "Rival",    loc: "A-02-C", phys: 34,  avail: 30,  reserved: 4,  transit: 0,  safety: 35, price: 62.0,  cost: 28.0 },
    { id: 7, img: emoji.shirt,  name: "Legacy Hoodie Heavyweight",    sku: "BXR-HOD-XL-GRY", ean: "8991102025678", cat: "Shirts",    brand: "Boxraw",   loc: "B-02-A", phys: 148, avail: 132, reserved: 16, transit: 60, safety: 40, price: 68.0,  cost: 24.0 },
    { id: 8, img: emoji.protect,name: "Mouth Guard Gel Fit",          sku: "SUP-MTH-OS-CLR", ean: "8991102029012", cat: "Protective",brand: "Superare", loc: "C-01-A", phys: 410, avail: 396, reserved: 14, transit: 0,  safety: 60, price: 12.0,  cost: 3.5 },
    { id: 9, img: emoji.short,  name: "Compression Shorts Base",      sku: "VNM-CMP-S-BLK",  ean: "8991102033456", cat: "Shorts",    brand: "Venum",    loc: "B-03-A", phys: 22,  avail: 15,  reserved: 7,  transit: 40, safety: 30, price: 38.0,  cost: 14.0 },
    { id: 10,img: emoji.wrap,   name: "Quick Wraps Gel Padded",       sku: "HYB-QWR-OS-RED", ean: "8991102037890", cat: "Handwraps", brand: "Hayabusa", loc: "A-04-A", phys: 275, avail: 260, reserved: 15, transit: 0,  safety: 50, price: 22.0,  cost: 9.0 },
  ];

  const couriers = ["J&T Express", "JNE", "NinjaVan", "Shopee Express", "AnterAja"];
  const deliveryTypes = ["Instant", "Standard", "Economy"];
  const channels = ["TikTok", "Shopee", "Tokopedia"];

  const orderStatuses = {
    "Pending":            { label: "Waiting for Process", badge: "b-gray",   stage: 0 },
    "Waiting Picking":    { label: "Waiting for Picking", badge: "b-blue",   stage: 1 },
    "Waiting Packing":    { label: "Waiting for Packing", badge: "b-violet", stage: 2 },
    "Waiting Outbound":   { label: "Waiting for Outbound",badge: "b-amber",  stage: 3 },
    "Printed":            { label: "Label Printed",       badge: "b-teal",   stage: 1 },
    "Shipped":            { label: "Shipped / Outbound",  badge: "b-green",  stage: 4 },
  };

  function mkOrder(i) {
    const chan = channels[i % 3];
    const st = ["Pending","Waiting Picking","Waiting Packing","Waiting Outbound","Shipped","Printed"][i % 6];
    const names = ["Andi Pratama","Siti Rahma","Budi Santoso","Dewi Lestari","Eko Wijaya","Fitri Handayani","Gilang Ramadhan","Hana Putri","Irfan Maulana","Joko Susilo"];
    const items = [
      [{ p: products[0], q: 1 }, { p: products[2], q: 2 }],
      [{ p: products[7], q: 3 }],
      [{ p: products[6], q: 1 }, { p: products[9], q: 2 }],
      [{ p: products[4], q: 1 }],
      [{ p: products[2], q: 1 }, { p: products[7], q: 1 }, { p: products[0], q: 1 }],
    ][i % 5];
    return {
      id: "#INV-" + (109200 + i),
      bc: "INV" + (109200 + i),
      channel: chan,
      customer: names[i % names.length],
      date: "2026-11-0" + ((i % 2) + 1) + " " + (9 + (i % 9)) + ":1" + (i % 9),
      courier: couriers[i % couriers.length],
      delivery: deliveryTypes[i % 3],
      waybill: "JX" + (778800 + i * 37),
      items,
      itemCount: items.reduce((a, b) => a + b.q, 0),
      total: items.reduce((a, b) => a + b.q * b.p.price, 0),
      status: st,
    };
  }
  const orders = Array.from({ length: 14 }, (_, i) => mkOrder(i));

  function pipelineCounts() {
    const c = { total: orders.length, Pending: 0, "Waiting Picking": 0, "Waiting Packing": 0, "Waiting Outbound": 0 };
    orders.forEach(o => {
      if (o.status === "Pending") c.Pending++;
      else if (o.status === "Waiting Picking" || o.status === "Printed") c["Waiting Picking"]++;
      else if (o.status === "Waiting Packing") c["Waiting Packing"]++;
      else if (o.status === "Waiting Outbound") c["Waiting Outbound"]++;
    });
    return c;
  }

  const purchaseOrders = [
    { id: "PO-2041", supplier: "Rival Intl. Ltd",    date: "2026-11-01", items: 6, qty: 480, status: "Receiving", eta: "On dock" },
    { id: "PO-2042", supplier: "Boxraw Supply Co",    date: "2026-11-01", items: 3, qty: 220, status: "Pending QC", eta: "Today" },
    { id: "PO-2039", supplier: "Venum Distribution",  date: "2026-10-30", items: 8, qty: 640, status: "Completed", eta: "—" },
    { id: "PO-2043", supplier: "Hayabusa Wholesale",  date: "2026-11-02", items: 2, qty: 150, status: "In Transit", eta: "Nov 04" },
  ];

  const returns = [
    { id: "RMA-5521", order: "#INV-109188", customer: "Maya Sari",   reason: "Wrong Size", sku: "SUP-TEE-M-NVY",  qty: 1, status: "Inspecting",  disp: "—" },
    { id: "RMA-5522", order: "#INV-109177", customer: "Rizky Akbar", reason: "Damaged",    sku: "RVL-GLV-16-RED", qty: 1, status: "Quarantine",  disp: "Defective" },
    { id: "RMA-5519", order: "#INV-109165", customer: "Lia Permata", reason: "Exchange",   sku: "VNM-SHT-L-GLD",  qty: 2, status: "Restocked",   disp: "Restock" },
  ];

  const users = [
    { id: "U-001", name: "Alex Morgan",   email: "alex@wms.io",   username: "alexm",   role: "super_admin",   status: "Active" },
    { id: "U-002", name: "Rina Kartika",  email: "rina@wms.io",   username: "rinak",   role: "warehouse_mgr", status: "Active" },
    { id: "U-003", name: "Dimas Prakoso", email: "dimas@wms.io",  username: "dimasp",  role: "operator",      status: "Active" },
    { id: "U-004", name: "Nadia Putri",   email: "nadia@wms.io",  username: "nadiap",  role: "specialist",    status: "Active" },
    { id: "U-005", name: "Toni Hartono",  email: "toni@wms.io",   username: "tonih",   role: "operator",      status: "Inactive" },
  ];

  const integrations = [
    { id: "tiktok",    name: "TikTok Shop", color: "#111827", abbr: "TK", status: "Connected",    orders: 182, synced: "12s ago", webhooks: 1240, errors: 0, interval: 5 },
    { id: "shopee",    name: "Shopee",      color: "#ee4d2d", abbr: "SP", status: "Connected",    orders: 341, synced: "4s ago",  webhooks: 3105, errors: 2, interval: 2 },
    { id: "tokopedia", name: "Tokopedia",   color: "#42b549", abbr: "TP", status: "Reconnect",    orders: 97,  synced: "6m ago",  webhooks: 880,  errors: 11, interval: 5 },
  ];

  const webhookLogs = [
    { time: "11:42:08", channel: "Shopee",    event: "order.create",  status: "200 OK",  ms: 84 },
    { time: "11:41:55", channel: "TikTok",    event: "order.update",  status: "200 OK",  ms: 112 },
    { time: "11:40:12", channel: "Tokopedia", event: "stock.sync",    status: "429 Retry", ms: 2001 },
    { time: "11:39:47", channel: "Shopee",    event: "label.printed", status: "200 OK",  ms: 66 },
    { time: "11:38:30", channel: "Tokopedia", event: "token.refresh", status: "401 Error", ms: 320 },
    { time: "11:37:02", channel: "TikTok",    event: "order.ship",    status: "200 OK",  ms: 95 },
  ];

  const activity = [
    { ic: "📦", color: "b-blue",   txt: "<b>Rina K.</b> received 50 units of <b>RVL-GLV-16-RED</b>", time: "2 min ago" },
    { ic: "🚚", color: "b-green",  txt: "Order <b>#INV-109204</b> shipped via <b>J&T Express</b>", time: "6 min ago" },
    { ic: "✅", color: "b-teal",   txt: "<b>Dimas P.</b> completed picking for <b>#INV-109201</b>", time: "11 min ago" },
    { ic: "⚠️", color: "b-amber",  txt: "Low stock alert: <b>Hand Wraps 180\"</b> (12 left)", time: "18 min ago" },
    { ic: "🔁", color: "b-violet", txt: "Inventory sync pushed to <b>Shopee</b> · 3 SKUs updated", time: "24 min ago" },
    { ic: "📥", color: "b-pink",   txt: "Return <b>RMA-5522</b> quarantined as <b>Defective</b>", time: "31 min ago" },
    { ic: "🖨️", color: "b-gray",   txt: "<b>12 shipping labels</b> printed in batch", time: "44 min ago" },
  ];

  const revenueSeries = [
    { d: "Mon", rev: 4200, ord: 62 }, { d: "Tue", rev: 5100, ord: 78 },
    { d: "Wed", rev: 4800, ord: 71 }, { d: "Thu", rev: 6300, ord: 95 },
    { d: "Fri", rev: 7200, ord: 112 },{ d: "Sat", rev: 9100, ord: 138 },
    { d: "Sun", rev: 8400, ord: 126 },
  ];

  const channelSplit = [
    { name: "Shopee",    value: 48, color: "#ee4d2d" },
    { name: "TikTok",    value: 33, color: "#111827" },
    { name: "Tokopedia", value: 19, color: "#42b549" },
  ];

  return {
    roles, access, brands, categories, products, couriers, deliveryTypes, channels,
    orderStatuses, orders, pipelineCounts, purchaseOrders, returns, users,
    integrations, webhookLogs, activity, revenueSeries, channelSplit, emoji,
  };
})();
