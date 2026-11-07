// Ingest an external marketplace order into the WMS as a native order.
// Shared by the sync job and the webhook receiver.
import { col, insert, update, findById } from "../lib/store.js";
import { bus } from "../lib/ws.js";

const CHANNEL_NAME = { shopee: "Shopee", tiktok: "TikTok", tokopedia: "Tokopedia" };

function nextInvoiceNumber() {
  const max = col("orders").reduce((m, o) => {
    const n = parseInt(String(o.id).replace(/[^0-9]/g, ""), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 109200);
  return max + 1;
}

// extOrder: { externalId, customer, courier, items:[{sku, qty}], createdAt }
export function ingestExternalOrder(channelId, extOrder, { reserve = true } = {}) {
  const channel = CHANNEL_NAME[channelId] || channelId;

  // De-dupe by external id.
  const existing = col("orders").find((o) => o.externalId === extOrder.externalId);
  if (existing) return { order: existing, duplicate: true };

  const n = nextInvoiceNumber();
  const items = (extOrder.items || []).map((line) => {
    const p = col("products").find((x) => x.sku.toLowerCase() === String(line.sku).toLowerCase());
    return {
      sku: line.sku,
      name: p ? p.name : line.sku,
      img: p ? p.img : "📦",
      ean: p ? p.ean : "",
      loc: p ? p.loc : "",
      price: p ? p.price : Number(line.price || 0),
      qty: Number(line.qty || 1),
    };
  });

  const order = {
    id: "#INV-" + n,
    barcode: "INV" + n,
    externalId: extOrder.externalId,
    channel,
    customer: extOrder.customer || "Marketplace Customer",
    date: extOrder.createdAt || new Date().toISOString(),
    courier: extOrder.courier || "J&T Express",
    delivery: "Standard",
    waybill: "JX" + (700000 + Math.floor(Math.random() * 99999)),
    items,
    itemCount: items.reduce((a, b) => a + b.qty, 0),
    total: items.reduce((a, b) => a + b.qty * b.price, 0),
    status: "Pending",
  };

  insert("orders", order);

  // Auto-deduct available inventory to prevent overselling across channels.
  if (reserve) {
    for (const line of items) {
      const p = col("products").find((x) => x.sku === line.sku);
      if (p) update("products", p.id, { avail: Math.max(0, p.avail - line.qty), reserved: p.reserved + line.qty });
    }
  }

  bus.emit("event", { type: "order.imported", icon: "📥", color: "b-pink", text: `New ${channel} order ${order.id} imported (${order.itemCount} items)`, ts: Date.now() });
  return { order, duplicate: false };
}
