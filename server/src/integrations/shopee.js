// Shopee Open Platform client scaffolding.
// ---------------------------------------------------------------------------
// This is REAL integration code: correct endpoints, HMAC-SHA256 request signing,
// and the OAuth authorization URL builder per Shopee's Open API v2. It is
// inert until you provide real credentials via environment variables AND expose
// a public HTTPS callback URL — Shopee will not talk to localhost.
//
//   SHOPEE_PARTNER_ID      (from Shopee Open Platform console)
//   SHOPEE_PARTNER_KEY     (partner secret, used for signing)
//   SHOPEE_REDIRECT_URL    (your public https callback, e.g. https://app.me/cb)
//   SHOPEE_REGION          (optional; defaults to the global host)
//
// Docs: https://open.shopee.com/documents
// ---------------------------------------------------------------------------
import crypto from "node:crypto";

const HOST = process.env.SHOPEE_HOST || "https://partner.shopeemobile.com";

export const shopeeConfig = {
  partnerId: process.env.SHOPEE_PARTNER_ID || null,
  partnerKey: process.env.SHOPEE_PARTNER_KEY || null,
  redirectUrl: process.env.SHOPEE_REDIRECT_URL || null,
  host: HOST,
  configured() {
    return !!(this.partnerId && this.partnerKey && this.redirectUrl);
  },
};

// HMAC-SHA256 base string signing (shop-level APIs).
function sign(path, timestamp, accessToken = "", shopId = "") {
  const base = `${shopeeConfig.partnerId}${path}${timestamp}${accessToken}${shopId}`;
  return crypto.createHmac("sha256", shopeeConfig.partnerKey || "").update(base).digest("hex");
}

// Step 1 of OAuth: URL the merchant visits to authorize your app.
export function authUrl() {
  if (!shopeeConfig.configured()) {
    return { error: "Shopee not configured — set SHOPEE_PARTNER_ID / SHOPEE_PARTNER_KEY / SHOPEE_REDIRECT_URL" };
  }
  const path = "/api/v2/shop/auth_partner";
  const ts = Math.floor(Date.now() / 1000);
  const sig = sign(path, ts);
  const q = new URLSearchParams({
    partner_id: shopeeConfig.partnerId,
    timestamp: String(ts),
    sign: sig,
    redirect: shopeeConfig.redirectUrl,
  });
  return { url: `${HOST}${path}?${q}` };
}

// Step 2: exchange the `code` from the callback for access/refresh tokens.
export async function exchangeToken({ code, shopId }) {
  if (!shopeeConfig.configured()) throw new Error("Shopee not configured");
  const path = "/api/v2/auth/token/get";
  const ts = Math.floor(Date.now() / 1000);
  const sig = sign(path, ts);
  const url = `${HOST}${path}?partner_id=${shopeeConfig.partnerId}&timestamp=${ts}&sign=${sig}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, shop_id: Number(shopId), partner_id: Number(shopeeConfig.partnerId) }),
  });
  return res.json(); // { access_token, refresh_token, expire_in, ... }
}

// Example signed shop-level call: pull recent orders.
export async function getOrderList({ accessToken, shopId, timeFrom, timeTo }) {
  if (!shopeeConfig.configured()) throw new Error("Shopee not configured");
  const path = "/api/v2/order/get_order_list";
  const ts = Math.floor(Date.now() / 1000);
  const sig = sign(path, ts, accessToken, String(shopId));
  const q = new URLSearchParams({
    partner_id: shopeeConfig.partnerId, timestamp: String(ts), sign: sig,
    access_token: accessToken, shop_id: String(shopId),
    time_range_field: "create_time",
    time_from: String(timeFrom), time_to: String(timeTo),
    page_size: "50",
  });
  const res = await fetch(`${HOST}${path}?${q}`);
  return res.json();
}

// Push a stock update back to Shopee (inventory sync).
export async function updateStock({ accessToken, shopId, itemId, stock }) {
  if (!shopeeConfig.configured()) throw new Error("Shopee not configured");
  const path = "/api/v2/product/update_stock";
  const ts = Math.floor(Date.now() / 1000);
  const sig = sign(path, ts, accessToken, String(shopId));
  const url = `${HOST}${path}?partner_id=${shopeeConfig.partnerId}&timestamp=${ts}&sign=${sig}&access_token=${accessToken}&shop_id=${shopId}`;
  const res = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item_id: itemId, stock_list: [{ seller_stock: [{ stock }] }] }),
  });
  return res.json();
}
