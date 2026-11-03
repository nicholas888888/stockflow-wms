# StockFlow WMS — E-Commerce Inventory & Warehouse Management System

A complete, modern, minimalist **full-stack** multi-channel e-commerce Warehouse
Management System.

- **Frontend** — a zero-dependency static web app (vanilla HTML / CSS / JS), no
  build step. Runs on mock data standalone, or against the live API.
- **Backend** — a zero-dependency Node.js REST + WebSocket API (stdlib only,
  JSON file store). See [`server/README.md`](server/README.md).

## Run the frontend

Open `index.html` in any modern browser. That's it — it runs on in-memory mock
data by default.

## Run the backend (optional)

```bash
cd server
npm start          # http://localhost:4000  (auto-seeds demo data)
npm test           # 18 in-process API integration tests
```

Then point the UI at it by setting a global before the app loads (browser
console, or edit `index.html`):

```js
window.WMS_API_BASE = "http://localhost:4000";
```

Reload — login now authenticates against the real API, with server-side RBAC,
stock reservation (oversell lock), barcode scan verification, and a live
WebSocket feed. Full endpoint list in [`server/README.md`](server/README.md).

> Barcode-scan audio feedback uses the Web Audio API, which requires a user
> interaction first (the login click unlocks it), so beeps play from the
> scanner pages onward.

## Demo accounts (password: `demo1234`)

| Role | Username | Lands on | Access |
|------|----------|----------|--------|
| Super Admin | `alexm` | Dashboard | Everything |
| Warehouse Manager | `rinak` | Dashboard | Products, Inbound, Orders, Fulfillment, Reports |
| Fulfillment Operator | `dimasp` | Picking | Picking, Packing, Outbound only |
| Inventory Specialist | `nadiap` | Products | Products, Inbound, Stock adjustment |

The sidebar reflects **role-based access** — pages a role can't see appear locked.

## Modules implemented

1. **Authentication & Access Control** — login, remember-me, forgot-password,
   5-attempt rate-limit lockout, role-based redirect after sign-in.
2. **Product & Inventory Management** — catalog with search/filter, stock health
   (physical / available / reserved / in-transit), safety thresholds, bin
   locations, pricing, create/edit drawer, soft delete.
3. **Categories & Brands** — hierarchical categories, brand entities, slugs/status.
4. **Inbound — Receiving (PO)** — supplier intake, location assignment, QC,
   auto channel sync. **Customer Returns** — RMA, reasons, restock vs. quarantine.
5. **Order Management** — pipeline counters, multi-channel list (TikTok / Shopee /
   Tokopedia), filters (courier, delivery type, status, search), process &
   print (auto-status to "Printed"), bulk actions.
6. **Barcode-Guided Picking** — scan invoice → verify each SKU, green success /
   blocked errors, over-pick prevention, success/error **audio**, progress ring,
   auto-advance to next order.
7. **Barcode-Guided Packing** — same verification + optional weight/box size.
8. **Outbound & Logistics Handover** — waybill scan, carrier validation, mark
   Shipped, status push-back to marketplace.
9. **Real-Time Dashboard** — revenue/order KPIs & AOV, throughput pipeline,
   stock alerts, live activity log, revenue-vs-volume chart, channel donut.
10. **Users & RBAC** — user CRUD + granular per-page permission matrix.
11. **Integrations** — TikTok/Shopee/Tokopedia connection cards, sync config,
    oversell lock, webhook & error logs.

## File layout

```
index.html   — shell + login markup
styles.css   — design system (tokens, components, responsive)
data.js      — mock data for every module
app.js       — auth, router, shell, audio, toasts, drawer/modal helpers
views.js     — dashboard, products, categories
views2.js    — inbound, returns, orders, picking, packing, outbound, users, integrations
```

> This is a UI demo driven by in-memory mock data; there is no backend. State
> resets on reload.
