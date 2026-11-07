// A simulated marketplace so the integration flow (OAuth → sync → webhook →
// order ingest) works end-to-end without real Shopee/TikTok credentials.
// When real credentials are configured, the routes use the real clients instead.
import crypto from "node:crypto";

const SAMPLE = {
  shopee: { customers: ["Putri A.", "Gilang R.", "Sari W."], courier: "Shopee Express" },
  tiktok: { customers: ["Dani K.", "Mega S.", "Rizal T."], courier: "J&T Express" },
  tokopedia: { customers: ["Nina P.", "Yoga H.", "Lia M."], courier: "AnterAja" },
};

const SKUS = ["RVL-GLV-16-RED", "SUP-TEE-M-NVY", "BXR-HOD-XL-GRY", "SUP-MTH-OS-CLR", "HYB-QWR-OS-RED"];

// Simulate "connecting" an account — returns a fake but well-formed token set.
export function mockConnect(channel) {
  return {
    access_token: "mock_at_" + crypto.randomBytes(8).toString("hex"),
    refresh_token: "mock_rt_" + crypto.randomBytes(8).toString("hex"),
    expires_in: 3600,
    shop_id: "SHOP-" + channel.toUpperCase(),
    connectedAt: new Date().toISOString(),
  };
}

// Simulate pulling new orders from the channel.
export function mockPullOrders(channel, count = 2) {
  const s = SAMPLE[channel] || SAMPLE.shopee;
  const orders = [];
  for (let i = 0; i < count; i++) {
    const sku = SKUS[Math.floor(Math.random() * SKUS.length)];
    const qty = 1 + Math.floor(Math.random() * 3);
    orders.push({
      externalId: channel.toUpperCase() + "-" + crypto.randomBytes(3).toString("hex").toUpperCase(),
      customer: s.customers[Math.floor(Math.random() * s.customers.length)],
      courier: s.courier,
      items: [{ sku, qty }],
      createdAt: new Date().toISOString(),
    });
  }
  return orders;
}

// Simulate a webhook payload the channel would POST to our receiver.
export function mockWebhookPayload(channel, event = "order.create") {
  return {
    channel,
    event,
    timestamp: Date.now(),
    data: event === "order.create" ? mockPullOrders(channel, 1)[0] : { note: "status update" },
  };
}
