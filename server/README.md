# StockFlow WMS — Backend API

A **zero-dependency** Node.js backend for the StockFlow Warehouse Management
System. No `npm install` needed — it uses only the Node standard library
(`http`, `crypto`, `url`, `fs`). Storage is a JSON file; real-time updates use a
hand-rolled RFC 6455 WebSocket server.

> Why no framework/database? The target environment blocks external package
> registries, so the backend is built on the stdlib and a JSON file store. The
> code is structured so swapping the store for Postgres/Mongo later is a
> localized change (`src/lib/store.js`).

## Requirements

- Node.js ≥ 18 (developed on Node 22)

## Run

```bash
cd server
npm run seed     # (optional) create data/db.json from demo data
npm start        # starts on http://localhost:4000
# or: npm run dev   # auto-restart on change (node --watch)
```

The database auto-seeds on first boot if `data/db.json` is missing.

### Environment variables

| Var | Default | Purpose |
|-----|---------|---------|
| `PORT` | `4000` | HTTP/WS port |
| `HOST` | `0.0.0.0` | Bind address |
| `JWT_SECRET` | dev secret | HMAC key for tokens — **set in production** |
| `JWT_TTL` | `28800` | Token lifetime (seconds) |
| `DATA_FILE` | `data/db.json` | JSON store path |
| `CORS_ORIGIN` | `*` | Allowed origin |

## Auth

- `POST /api/auth/login` → `{ token, user }`. Send `{ identifier, password }`
  (identifier = username or email). Rate limited to **5 failed attempts / 15 min**
  (spec requirement) returning `429` on lockout.
- Send `Authorization: Bearer <token>` on all protected routes.
- Tokens are HS256 JWTs signed with `JWT_SECRET`. Passwords are stored as
  `scrypt` hashes and never returned in any response.

Demo accounts (password `demo1234`): `alexm` (Super Admin), `rinak` (Warehouse
Manager), `dimasp` (Operator), `nadiap` (Inventory Specialist).

## Endpoints

### Auth
| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/login` | Issue token |
| GET | `/api/auth/me` | Current user + access matrix |
| POST | `/api/auth/forgot` | Always 200 (no user enumeration) |

### Products & inventory  *(RBAC page: `products`)*
| Method | Path | Notes |
|---|---|---|
| GET | `/api/products` | Query: `q, category, brand, stock(in\|low\|out), includeDeleted` |
| GET | `/api/products/:id` | |
| POST | `/api/products` | Unique SKU enforced (409) |
| PUT | `/api/products/:id` | |
| DELETE | `/api/products/:id` | **Soft delete** |
| POST | `/api/products/:id/adjust` | `{ delta, reason }` stock adjustment |

### Categories & brands  *(page: `categories`)*
`GET/POST/PUT/DELETE /api/categories`, `GET/POST/PUT /api/brands`

### Orders  *(page: `orders`)*
| Method | Path | Notes |
|---|---|---|
| GET | `/api/orders/pipeline` | Stage counters |
| GET | `/api/orders` | Query: `status, courier, delivery, channel, q` |
| GET | `/api/orders/:id` | |
| POST | `/api/orders/:id/process` | Pending → Waiting Picking; **reserves stock (oversell lock)** |
| POST | `/api/orders/:id/print` | Pending → Printed; returns invoice + waybill doc links |
| POST | `/api/orders/bulk` | `{ action: process\|print, ids: [] }` |

### Fulfillment  *(pages: `picking` / `packing` / `outbound`)*
| Method | Path | Notes |
|---|---|---|
| GET | `/api/:mode/queue` | `mode` = picking\|packing; next order + queue length |
| POST | `/api/:mode/sessions` | Start — `{ barcode }` (invoice). 422 on mismatch |
| POST | `/api/:mode/sessions/:orderId/scan` | `{ code }` → `{ result: ok\|unknown\|excess\|complete, audio }` |
| POST | `/api/packing/sessions/:orderId/complete` | `{ weightKg, boxSize }`; requires 100% scanned |
| GET | `/api/outbound/ready` | Orders waiting for outbound |
| POST | `/api/outbound/dispatch` | `{ barcode }` (waybill) → marks Shipped, pushes status |

Scan verification mirrors the spec: correct item increments, unknown barcode and
over-quantity are blocked, and the response `audio` field (`success`/`error`)
drives the client's beep.

### Inbound  *(pages: `inbound` / `returns`)*
| Method | Path | Notes |
|---|---|---|
| GET | `/api/inbound/purchase-orders` | |
| POST | `/api/inbound/receive` | `{ sku, quantity, location?, qc: passed\|partial\|failed, poId? }` → increases stock, "syncs channels" |
| GET | `/api/returns` | Query: `reason` |
| POST | `/api/returns` | Create RMA |
| POST | `/api/returns/:id/disposition` | `{ action: restock\|defective }` |

### Admin  *(page: `users` / `integrations` / `dashboard`)*
| Method | Path | Notes |
|---|---|---|
| GET/POST/PUT/DELETE | `/api/users` `…/:id` | User CRUD (write = super_admin) |
| GET | `/api/rbac` | Permission matrix |
| PUT | `/api/rbac/:role` | `{ page, enabled }` toggle (super_admin) |
| GET | `/api/integrations` | Channels + webhook logs |
| PUT | `/api/integrations/:id` | `{ connected?, status?, intervalMin? }` |
| POST | `/api/integrations/:id/sync` | Trigger a sync run |
| GET | `/api/dashboard` | KPIs, pipeline, charts, alerts, activity |
| GET | `/api/reference` | Couriers, delivery types, channels |
| GET | `/api/health` | Public health check |

## Real-time (WebSocket)

Connect to `ws://localhost:4000/ws`. The server pushes JSON events as things
happen — `order.processed`, `order.shipped`, `inbound.received`,
`pipeline` (fresh stage counts), `activity`, etc. Drives the dashboard's live
feed and throughput widgets.

## Connect the frontend

The UI (repo root) runs on mock data by default. To point it at this backend,
set a global before the app scripts load and reload the page:

```js
// in the browser console, or add to index.html before app.js:
window.WMS_API_BASE = "http://localhost:4000";
```

`api.js` then enables a typed client (`window.WMS_API`) and the login flow
authenticates against the real API.

## Tests

```bash
npm test     # node --test — 18 in-process integration tests
```

Covers auth + rate-limit, RBAC enforcement, product CRUD/soft-delete/unique-SKU,
order processing with stock reservation, the full barcode picking lifecycle
(unknown barcode, over-pick block, completion), inbound QC receiving, return
restock, RBAC toggles, and outbound dispatch.

## Project layout

```
server/
├── package.json
└── src/
    ├── index.js          # HTTP + WS server, request pipeline
    ├── config.js         # env-driven config
    ├── seed.js           # demo data + roles/access matrix
    ├── auth.js           # login, rate limiting, JWT verify, RBAC guards
    ├── lib/
    │   ├── crypto.js     # scrypt hashing + HS256 JWT (stdlib)
    │   ├── store.js      # JSON file store (atomic writes)
    │   ├── http.js       # router, body parse, CORS, errors
    │   └── ws.js         # RFC6455 WebSocket + event bus
    └── routes/
        ├── products.js   # products, categories, brands
        ├── orders.js     # pipeline, process, print, bulk
        ├── fulfillment.js# picking, packing, outbound
        ├── inbound.js    # receiving, returns
        └── admin.js      # auth, users, rbac, integrations, dashboard
```
