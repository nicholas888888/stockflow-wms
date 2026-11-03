// Seed the JSON store with demo data. Idempotent: running again re-seeds.
import { init, flushNow } from "./lib/store.js";
import { hashPassword } from "./lib/crypto.js";

export const ROLES = {
  super_admin: { label: "Super Admin", home: "dashboard" },
  warehouse_mgr: { label: "Warehouse Manager", home: "dashboard" },
  operator: { label: "Fulfillment Operator", home: "picking" },
  specialist: { label: "Inventory Specialist", home: "products" },
};

// page access matrix (RBAC)
export const ACCESS = {
  super_admin: ["dashboard","products","categories","inbound","returns","orders","picking","packing","outbound","users","integrations"],
  warehouse_mgr: ["dashboard","products","categories","inbound","returns","orders","picking","packing","outbound"],
  operator: ["picking","packing","outbound"],
  specialist: ["products","categories","inbound","returns"],
};

export function buildSeed() {
  const pw = hashPassword("demo1234");

  const users = [
    { id: "U-001", name: "Alex Morgan",   email: "alex@wms.io",  username: "alexm",  role: "super_admin",   status: "Active", password: pw },
    { id: "U-002", name: "Rina Kartika",  email: "rina@wms.io",  username: "rinak",  role: "warehouse_mgr", status: "Active", password: pw },
    { id: "U-003", name: "Dimas Prakoso", email: "dimas@wms.io", username: "dimasp", role: "operator",      status: "Active", password: pw },
    { id: "U-004", name: "Nadia Putri",   email: "nadia@wms.io", username: "nadiap", role: "specialist",    status: "Active", password: pw },
    { id: "U-005", name: "Toni Hartono",  email: "toni@wms.io",  username: "tonih",  role: "operator",      status: "Inactive", password: pw },
  ];

  const brands = [
    { id: "BR-01", name: "Rival",    slug: "rival",    description: "Boxing & combat gear", status: "Active" },
    { id: "BR-02", name: "Boxraw",   slug: "boxraw",   description: "Lifestyle boxing apparel", status: "Active" },
    { id: "BR-03", name: "Superare", slug: "superare", description: "Premium training wear", status: "Active" },
    { id: "BR-04", name: "Venum",    slug: "venum",    description: "MMA & Muay Thai", status: "Active" },
    { id: "BR-05", name: "Hayabusa", slug: "hayabusa", description: "Protective equipment", status: "Inactive" },
  ];

  const categories = [
    { id: "CAT-01", name: "Apparel",    parent: null,        slug: "apparel",    description: "Wearables", status: "Active" },
    { id: "CAT-02", name: "Shirts",     parent: "CAT-01",    slug: "shirts",     description: "Tops & tees", status: "Active" },
    { id: "CAT-03", name: "Shorts",     parent: "CAT-01",    slug: "shorts",     description: "Shorts", status: "Active" },
    { id: "CAT-04", name: "Equipment",  parent: null,        slug: "equipment",  description: "Gear", status: "Active" },
    { id: "CAT-05", name: "Gloves",     parent: "CAT-04",    slug: "gloves",     description: "Boxing gloves", status: "Active" },
    { id: "CAT-06", name: "Handwraps",  parent: "CAT-04",    slug: "handwraps",  description: "Hand wraps", status: "Active" },
    { id: "CAT-07", name: "Protective", parent: "CAT-04",    slug: "protective", description: "Guards", status: "Active" },
  ];

  const products = [
    { id: 1,  img: "🥊", name: "Pro Boxing Gloves 16oz",   sku: "RVL-GLV-16-RED", ean: "8991102001234", cat: "Gloves",     brand: "Rival",    loc: "A-02-B", phys: 240, avail: 212, reserved: 24, transit: 50,  safety: 40, price: 89.0, cost: 52.0, deleted: false },
    { id: 2,  img: "🩹", name: "Hand Wraps 180\" Mexican",  sku: "BXR-WRP-180-BLK",ean: "8991102005678", cat: "Handwraps",  brand: "Boxraw",   loc: "A-04-C", phys: 18,  avail: 12,  reserved: 6,  transit: 0,   safety: 30, price: 14.5, cost: 6.2,  deleted: false },
    { id: 3,  img: "👕", name: "Training Tee Dri-Fit",      sku: "SUP-TEE-M-NVY",  ean: "8991102009012", cat: "Shirts",     brand: "Superare", loc: "B-01-A", phys: 520, avail: 498, reserved: 22, transit: 120, safety: 80, price: 32.0, cost: 11.0, deleted: false },
    { id: 4,  img: "🩳", name: "Muay Thai Shorts Classic",  sku: "VNM-SHT-L-GLD",  ean: "8991102013456", cat: "Shorts",     brand: "Venum",    loc: "B-03-D", phys: 0,   avail: 0,   reserved: 0,  transit: 80,  safety: 25, price: 48.0, cost: 19.0, deleted: false },
    { id: 5,  img: "🛡️", name: "Shin Guards Elite",         sku: "HYB-SHN-ML-BLK", ean: "8991102017890", cat: "Protective", brand: "Hayabusa", loc: "C-02-B", phys: 96,  avail: 88,  reserved: 8,  transit: 0,   safety: 20, price: 74.0, cost: 33.0, deleted: false },
    { id: 6,  img: "🥊", name: "Bag Gloves 12oz",           sku: "RVL-GLV-12-BLU", ean: "8991102021234", cat: "Gloves",     brand: "Rival",    loc: "A-02-C", phys: 34,  avail: 30,  reserved: 4,  transit: 0,   safety: 35, price: 62.0, cost: 28.0, deleted: false },
    { id: 7,  img: "👕", name: "Legacy Hoodie Heavyweight",  sku: "BXR-HOD-XL-GRY", ean: "8991102025678", cat: "Shirts",     brand: "Boxraw",   loc: "B-02-A", phys: 148, avail: 132, reserved: 16, transit: 60,  safety: 40, price: 68.0, cost: 24.0, deleted: false },
    { id: 8,  img: "🛡️", name: "Mouth Guard Gel Fit",        sku: "SUP-MTH-OS-CLR", ean: "8991102029012", cat: "Protective", brand: "Superare", loc: "C-01-A", phys: 410, avail: 396, reserved: 14, transit: 0,   safety: 60, price: 12.0, cost: 3.5,  deleted: false },
    { id: 9,  img: "🩳", name: "Compression Shorts Base",    sku: "VNM-CMP-S-BLK",  ean: "8991102033456", cat: "Shorts",     brand: "Venum",    loc: "B-03-A", phys: 22,  avail: 15,  reserved: 7,  transit: 40,  safety: 30, price: 38.0, cost: 14.0, deleted: false },
    { id: 10, img: "🩹", name: "Quick Wraps Gel Padded",     sku: "HYB-QWR-OS-RED", ean: "8991102037890", cat: "Handwraps",  brand: "Hayabusa", loc: "A-04-A", phys: 275, avail: 260, reserved: 15, transit: 0,   safety: 50, price: 22.0, cost: 9.0,  deleted: false },
  ];

  const couriers = ["J&T Express", "JNE", "NinjaVan", "Shopee Express", "AnterAja"];
  const deliveryTypes = ["Instant", "Standard", "Economy"];
  const channels = ["TikTok", "Shopee", "Tokopedia"];
  const names = ["Andi Pratama","Siti Rahma","Budi Santoso","Dewi Lestari","Eko Wijaya","Fitri Handayani","Gilang Ramadhan","Hana Putri","Irfan Maulana","Joko Susilo"];
  const itemSets = [
    [{ sku: "RVL-GLV-16-RED", q: 1 }, { sku: "SUP-TEE-M-NVY", q: 2 }],
    [{ sku: "SUP-MTH-OS-CLR", q: 3 }],
    [{ sku: "BXR-HOD-XL-GRY", q: 1 }, { sku: "HYB-QWR-OS-RED", q: 2 }],
    [{ sku: "SHN-SHN-ML-BLK", q: 1 }],
    [{ sku: "SUP-TEE-M-NVY", q: 1 }, { sku: "BXR-HOD-XL-GRY", q: 1 }, { sku: "RVL-GLV-16-RED", q: 1 }],
  ];
  const statuses = ["Pending","Waiting Picking","Waiting Packing","Waiting Outbound","Shipped","Printed"];

  const orders = Array.from({ length: 14 }, (_, i) => {
    const items = itemSets[i % 5].map((it) => {
      const p = products.find((x) => x.sku === it.sku) || products[4];
      return { sku: p.sku, name: p.name, img: p.img, ean: p.ean, loc: p.loc, price: p.price, qty: it.q };
    });
    return {
      id: "#INV-" + (109200 + i),
      barcode: "INV" + (109200 + i),
      channel: channels[i % 3],
      customer: names[i % names.length],
      date: "2026-11-0" + ((i % 2) + 1) + "T" + String(9 + (i % 9)).padStart(2, "0") + ":1" + (i % 9) + ":00Z",
      courier: couriers[i % couriers.length],
      delivery: deliveryTypes[i % 3],
      waybill: "JX" + (778800 + i * 37),
      items,
      itemCount: items.reduce((a, b) => a + b.qty, 0),
      total: items.reduce((a, b) => a + b.qty * b.price, 0),
      status: statuses[i % 6],
    };
  });

  const purchaseOrders = [
    { id: "PO-2041", supplier: "Rival Intl. Ltd",   date: "2026-11-01", lines: 6, qty: 480, status: "Receiving",  eta: "On dock" },
    { id: "PO-2042", supplier: "Boxraw Supply Co",   date: "2026-11-01", lines: 3, qty: 220, status: "Pending QC", eta: "Today" },
    { id: "PO-2039", supplier: "Venum Distribution", date: "2026-10-30", lines: 8, qty: 640, status: "Completed",  eta: "—" },
    { id: "PO-2043", supplier: "Hayabusa Wholesale", date: "2026-11-02", lines: 2, qty: 150, status: "In Transit", eta: "Nov 04" },
  ];

  const returns = [
    { id: "RMA-5521", order: "#INV-109188", customer: "Maya Sari",   reason: "Wrong Size", sku: "SUP-TEE-M-NVY",  qty: 1, status: "Inspecting", disposition: null },
    { id: "RMA-5522", order: "#INV-109177", customer: "Rizky Akbar", reason: "Damaged",    sku: "RVL-GLV-16-RED", qty: 1, status: "Quarantine", disposition: "Defective" },
    { id: "RMA-5519", order: "#INV-109165", customer: "Lia Permata", reason: "Exchange",   sku: "VNM-SHT-L-GLD",  qty: 2, status: "Restocked",  disposition: "Restock" },
  ];

  const integrations = [
    { id: "tiktok",    name: "TikTok Shop", status: "Connected", orders24h: 182, webhooks: 1240, errors24h: 0,  lastSync: new Date().toISOString(), intervalMin: 5, oauth: { connected: true,  tokenExpiresIn: 3600 } },
    { id: "shopee",    name: "Shopee",      status: "Connected", orders24h: 341, webhooks: 3105, errors24h: 2,  lastSync: new Date().toISOString(), intervalMin: 2, oauth: { connected: true,  tokenExpiresIn: 7200 } },
    { id: "tokopedia", name: "Tokopedia",   status: "Reconnect", orders24h: 97,  webhooks: 880,  errors24h: 11, lastSync: new Date(Date.now() - 6 * 60000).toISOString(), intervalMin: 5, oauth: { connected: false, tokenExpiresIn: 0 } },
  ];

  const webhookLogs = [
    { id: "WH-1", time: "11:42:08", channel: "Shopee",    event: "order.create",  status: "200 OK",    ms: 84 },
    { id: "WH-2", time: "11:41:55", channel: "TikTok",    event: "order.update",  status: "200 OK",    ms: 112 },
    { id: "WH-3", time: "11:40:12", channel: "Tokopedia", event: "stock.sync",    status: "429 Retry", ms: 2001 },
    { id: "WH-4", time: "11:39:47", channel: "Shopee",    event: "label.printed", status: "200 OK",    ms: 66 },
    { id: "WH-5", time: "11:38:30", channel: "Tokopedia", event: "token.refresh", status: "401 Error", ms: 320 },
    { id: "WH-6", time: "11:37:02", channel: "TikTok",    event: "order.ship",    status: "200 OK",    ms: 95 },
  ];

  const activity = [
    { id: "A-1", icon: "📦", color: "b-blue",   text: "Rina K. received 50 units of RVL-GLV-16-RED", ts: Date.now() - 2 * 60000 },
    { id: "A-2", icon: "🚚", color: "b-green",  text: "Order #INV-109204 shipped via J&T Express",   ts: Date.now() - 6 * 60000 },
    { id: "A-3", icon: "✅", color: "b-teal",   text: "Dimas P. completed picking for #INV-109201",  ts: Date.now() - 11 * 60000 },
  ];

  return {
    meta: { seededAt: new Date().toISOString(), version: 1 },
    roles: ROLES,
    access: ACCESS,
    users,
    brands,
    categories,
    products,
    orders,
    purchaseOrders,
    returns,
    integrations,
    webhookLogs,
    activity,
    reference: { couriers, deliveryTypes, channels },
  };
}

// Run directly: `node src/seed.js`
if (import.meta.url === `file://${process.argv[1]}`) {
  init(buildSeed());
  flushNow();
  console.log("✓ Database seeded.");
}
