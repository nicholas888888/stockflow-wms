// TikTok Shop Partner API client scaffolding.
// ---------------------------------------------------------------------------
// Real integration code: TikTok Shop OpenAPI endpoints, HMAC-SHA256 signing,
// and the OAuth authorization URL. Inert until you supply real credentials and
// a public HTTPS callback — TikTok will not call localhost.
//
//   TIKTOK_APP_KEY       (TikTok Shop Partner Center)
//   TIKTOK_APP_SECRET    (used for signing)
//   TIKTOK_REDIRECT_URL  (public https callback)
//
// Docs: https://partner.tiktokshop.com/docv2
// ---------------------------------------------------------------------------
import crypto from "node:crypto";

const HOST = process.env.TIKTOK_HOST || "https://open-api.tiktokglobalshop.com";
const AUTH_HOST = process.env.TIKTOK_AUTH_HOST || "https://auth.tiktok-shops.com";

export const tiktokConfig = {
  appKey: process.env.TIKTOK_APP_KEY || null,
  appSecret: process.env.TIKTOK_APP_SECRET || null,
  redirectUrl: process.env.TIKTOK_REDIRECT_URL || null,
  configured() {
    return !!(this.appKey && this.appSecret && this.redirectUrl);
  },
};

// TikTok signs the sorted query params (excluding sign/access_token) wrapped by the path + secret.
function sign(path, params) {
  const keys = Object.keys(params).filter((k) => k !== "sign" && k !== "access_token").sort();
  let base = path;
  for (const k of keys) base += k + params[k];
  base = tiktokConfig.appSecret + base + tiktokConfig.appSecret;
  return crypto.createHmac("sha256", tiktokConfig.appSecret || "").update(base).digest("hex");
}

// Step 1: merchant authorization URL.
export function authUrl(state = "stockflow") {
  if (!tiktokConfig.configured()) {
    return { error: "TikTok not configured — set TIKTOK_APP_KEY / TIKTOK_APP_SECRET / TIKTOK_REDIRECT_URL" };
  }
  const q = new URLSearchParams({
    app_key: tiktokConfig.appKey,
    state,
    redirect_uri: tiktokConfig.redirectUrl,
  });
  return { url: `${AUTH_HOST}/oauth/authorize?${q}` };
}

// Step 2: exchange auth code for tokens.
export async function exchangeToken({ code }) {
  if (!tiktokConfig.configured()) throw new Error("TikTok not configured");
  const q = new URLSearchParams({
    app_key: tiktokConfig.appKey,
    app_secret: tiktokConfig.appSecret,
    auth_code: code,
    grant_type: "authorized_code",
  });
  const res = await fetch(`${AUTH_HOST}/api/v2/token/get?${q}`);
  return res.json(); // { access_token, refresh_token, access_token_expire_in, ... }
}

// Example signed call: list orders.
export async function getOrderList({ accessToken, shopCipher, timeFrom }) {
  if (!tiktokConfig.configured()) throw new Error("TikTok not configured");
  const path = "/order/202309/orders/search";
  const params = {
    app_key: tiktokConfig.appKey,
    timestamp: String(Math.floor(Date.now() / 1000)),
    shop_cipher: shopCipher || "",
  };
  params.sign = sign(path, params);
  const q = new URLSearchParams(params);
  const res = await fetch(`${HOST}${path}?${q}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-tts-access-token": accessToken },
    body: JSON.stringify({ create_time_ge: timeFrom, page_size: 50 }),
  });
  return res.json();
}

// Push shipping/tracking status back to TikTok.
export async function updateTracking({ accessToken, shopCipher, orderId, tracking, provider }) {
  if (!tiktokConfig.configured()) throw new Error("TikTok not configured");
  const path = "/fulfillment/202309/orders/ship";
  const params = { app_key: tiktokConfig.appKey, timestamp: String(Math.floor(Date.now() / 1000)), shop_cipher: shopCipher || "" };
  params.sign = sign(path, params);
  const q = new URLSearchParams(params);
  const res = await fetch(`${HOST}${path}?${q}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-tts-access-token": accessToken },
    body: JSON.stringify({ order_id: orderId, tracking_number: tracking, shipping_provider: provider }),
  });
  return res.json();
}
