/* =========================================================
   StockFlow WMS — Views (dashboard, products, categories, inbound…)
   ========================================================= */
(function () {
  const W = window.__WMS;
  const { DB, $, $$, esc, money, icon, toast, beep, openDrawer, closeOverlays, openModal, confirmModal, state, go, renderNav } = W;
  const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; };
  const set = (html) => { $("#content").innerHTML = html; };
  const API = window.WMS_API;
  const SYNC = window.WMS_SYNC || { apiMode: false, refresh: async () => {} };
  const apiMode = SYNC.apiMode;
  // Wrap an API mutation with error-to-toast handling; returns true on success.
  async function apiDo(promise, okMsg) {
    try { const r = await promise; if (okMsg) toast(okMsg, "ok"); return r || true; }
    catch (e) { toast(e.message || "Request failed", "err"); return false; }
  }

  const badge = (cls, text, dot) => `<span class="badge ${cls}">${dot ? `<span class="d" style="background:currentColor"></span>` : ""}${text}</span>`;
  const chanTag = (ch) => {
    const map = { TikTok: ["tiktok", "TK"], Shopee: ["shopee", "SP"], Tokopedia: ["tokopedia", "TP"] };
    const [cls, ab] = map[ch]; return `<span class="chan ${cls}"><span class="c">${ab}</span>${ch}</span>`;
  };
  const statusBadge = (st) => { const s = DB.orderStatuses[st]; return badge(s.badge, s.label, true); };
  const stockColor = (p) => p.phys === 0 ? "#dc2626" : p.avail <= p.safety ? "#d97706" : "#16a34a";
  const stockLabel = (p) => p.phys === 0 ? badge("b-red", "Out of stock", true) : p.avail <= p.safety ? badge("b-amber", "Low stock", true) : badge("b-green", "In stock", true);
  // Render a real uploaded image when present, else the emoji placeholder.
  const thumbHtml = (p, cls = "thumb") => {
    const src = p.imageUrl && API && API.imageSrc ? API.imageSrc(p.imageUrl) : null;
    return src
      ? `<div class="${cls}" style="background-image:url('${src}');background-size:cover;background-position:center"></div>`
      : `<div class="${cls}">${p.img || "📦"}</div>`;
  };

  /* ============================ DASHBOARD ============================ */
  function dashboard() {
    const pc = DB.pipelineCounts();
    const totalRev = DB.revenueSeries.reduce((a, b) => a + b.rev, 0);
    const totalOrd = DB.revenueSeries.reduce((a, b) => a + b.ord, 0);
    const aov = totalRev / totalOrd;
    const low = DB.products.filter(p => p.phys > 0 && p.avail <= p.safety);
    const out = DB.products.filter(p => p.phys === 0);

    const kpis = [
      { ic: "💰", bg: "var(--green-bg)", c: "var(--green)", val: money(totalRev), lbl: "Revenue (7d)", t: "+12.4%", up: true },
      { ic: "🧾", bg: "var(--blue-bg)", c: "var(--blue)", val: totalOrd.toString(), lbl: "Orders (7d)", t: "+8.1%", up: true },
      { ic: "📊", bg: "var(--violet-bg)", c: "var(--violet)", val: money(aov), lbl: "Avg. Order Value", t: "+3.2%", up: true },
      { ic: "⚠️", bg: "var(--amber-bg)", c: "var(--amber)", val: (low.length + out.length).toString(), lbl: "Stock Alerts", t: out.length + " OOS", up: false },
    ];
    const kpiCards = kpis.map(k => `
      <div class="kpi">
        <div class="top">
          <div class="ic" style="background:${k.bg};color:${k.c};font-size:20px">${k.ic}</div>
          <span class="trend ${k.up ? "up" : "down"}">${k.up ? "▲" : "▼"} ${k.t}</span>
        </div>
        <div class="val">${k.val}</div><div class="lbl">${k.lbl}</div>
      </div>`).join("");

    const stages = [
      { k: "total", n: pc.total, t: "Total Orders", c: "var(--brand)" },
      { k: "p", n: pc.Pending, t: "Waiting Process", c: "#64748b" },
      { k: "pk", n: pc["Waiting Picking"], t: "Waiting Picking", c: "var(--blue)" },
      { k: "pa", n: pc["Waiting Packing"], t: "Waiting Packing", c: "var(--violet)" },
      { k: "ob", n: pc["Waiting Outbound"], t: "Waiting Outbound", c: "var(--amber)" },
    ];
    const pipe = stages.map(s => `
      <div class="stage"><div class="n">${s.n}</div><div class="t">${s.t}</div>
      <div class="bar"><i style="width:${Math.min(100, s.n / pc.total * 100)}%;background:${s.c}"></i></div></div>`).join("");

    const alerts = [...out, ...low].slice(0, 5).map(p => `
      <div class="pick-item" style="margin-bottom:8px;padding:11px 14px">
        <div class="thumb" style="width:40px;height:40px;font-size:18px">${p.img}</div>
        <div class="info"><b style="font-size:13px">${esc(p.name)}</b><span class="mono muted">${p.sku}</span></div>
        <div class="right">${stockLabel(p)}<div class="muted" style="font-size:11.5px;margin-top:3px">${p.avail} / ${p.safety} safety</div></div>
      </div>`).join("");

    const relTime = (a) => {
      if (a.time) return a.time;
      if (!a.ts) return "";
      const s = Math.max(1, Math.round((Date.now() - a.ts) / 1000));
      if (s < 60) return s + "s ago";
      const m = Math.round(s / 60); if (m < 60) return m + " min ago";
      const h = Math.round(m / 60); return h + "h ago";
    };
    const feed = DB.activity.map(a => `
      <div class="ev"><div class="dot ${a.color}">${a.ic || a.icon || "🔔"}</div>
      <div class="txt">${a.txt || a.text || ""}<div class="t">${relTime(a)}</div></div></div>`).join("");

    set(`
      <div class="page-head">
        <div><h2>Welcome back, ${esc(state.user.name.split(" ")[0])} 👋</h2>
        <p>Here's what's happening across your warehouse today — Monday, Nov 2, 2026.</p></div>
        <div class="actions"><button class="btn btn--ghost btn--sm" id="dExport">Export report</button>
        <button class="btn btn--primary btn--sm" data-nav="orders">View orders</button></div>
      </div>

      <div class="grid g-4" style="margin-bottom:18px">${kpiCards}</div>

      <div class="card" style="margin-bottom:18px">
        <div class="card__head"><h3>Fulfillment Throughput <span class="sub">— real-time pipeline</span></h3>
          <div class="live"><span class="pulse"></span> updating every 3s</div></div>
        <div class="card__body"><div class="pipe">${pipe}</div></div>
      </div>

      <div class="grid g-3" style="grid-template-columns:1.3fr 1fr">
        <div class="card">
          <div class="card__head"><h3>Revenue vs. Order Volume</h3><span class="sub">Last 7 days</span></div>
          <div class="card__body"><canvas id="revChart" height="260"></canvas>
            <div class="legend"><div class="l"><span class="sw" style="background:var(--brand)"></span>Revenue</div>
            <div class="l"><span class="sw" style="background:#22d3ee"></span>Orders</div></div></div>
        </div>
        <div class="card">
          <div class="card__head"><h3>Channel Breakdown</h3><span class="sub">By sales volume</span></div>
          <div class="card__body"><div class="donut-wrap"><canvas id="donut" width="150" height="150"></canvas>
            <div style="flex:1">${DB.channelSplit.map(c => `
              <div class="row-between" style="padding:7px 0;border-bottom:1px solid var(--line-2)">
                <span class="chan ${c.name.toLowerCase()}"><span class="c">${c.name.slice(0,2).toUpperCase()}</span>${c.name}</span>
                <b>${c.value}%</b></div>`).join("")}</div></div></div>
        </div>
      </div>

      <div class="grid g-3 mt-18" style="grid-template-columns:1fr 1.3fr">
        <div class="card">
          <div class="card__head"><h3>Stock & Inventory Alerts</h3><span class="sub">${low.length + out.length} items</span></div>
          <div class="card__body">${alerts || '<div class="empty">All good 🎉</div>'}</div>
        </div>
        <div class="card">
          <div class="card__head"><h3>Activity Log</h3><div class="live"><span class="pulse"></span> live feed</div></div>
          <div class="card__body"><div class="feed">${feed}</div></div>
        </div>
      </div>`);

    $("#dExport").addEventListener("click", () => toast("Dashboard report exported as PDF", "ok"));
    $$("[data-nav]").forEach(b => b.addEventListener("click", () => go(b.dataset.nav)));
    drawRevChart(); drawDonut();
  }

  function drawRevChart() {
    const cv = $("#revChart"); if (!cv) return;
    const dpr = window.devicePixelRatio || 1; const w = cv.clientWidth, h = 260;
    cv.width = w * dpr; cv.height = h * dpr; cv.style.height = h + "px";
    const x = cv.getContext("2d"); x.scale(dpr, dpr);
    const data = DB.revenueSeries, pad = 36, bw = (w - pad * 2) / data.length;
    const maxR = Math.max(...data.map(d => d.rev)), maxO = Math.max(...data.map(d => d.ord));
    // grid
    x.strokeStyle = "#eef0f3"; x.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const yy = pad + (h - pad * 1.6) * i / 4; x.beginPath(); x.moveTo(pad, yy); x.lineTo(w - pad, yy); x.stroke(); }
    // bars (revenue)
    data.forEach((d, i) => {
      const bh = (d.rev / maxR) * (h - pad * 1.8);
      const bx = pad + i * bw + bw * 0.22, by = h - pad * 0.8 - bh, bwi = bw * 0.56;
      const grad = x.createLinearGradient(0, by, 0, by + bh); grad.addColorStop(0, "#6366f1"); grad.addColorStop(1, "#a5b4fc");
      x.fillStyle = grad; roundRect(x, bx, by, bwi, bh, 5); x.fill();
      x.fillStyle = "#94a3b8"; x.font = "11px Inter"; x.textAlign = "center"; x.fillText(d.d, pad + i * bw + bw / 2, h - 10);
    });
    // line (orders)
    x.strokeStyle = "#22d3ee"; x.lineWidth = 2.5; x.beginPath();
    data.forEach((d, i) => { const px = pad + i * bw + bw / 2, py = h - pad * 0.8 - (d.ord / maxO) * (h - pad * 1.8); i ? x.lineTo(px, py) : x.moveTo(px, py); });
    x.stroke();
    data.forEach((d, i) => { const px = pad + i * bw + bw / 2, py = h - pad * 0.8 - (d.ord / maxO) * (h - pad * 1.8);
      x.fillStyle = "#fff"; x.beginPath(); x.arc(px, py, 4, 0, 7); x.fill(); x.strokeStyle = "#06b6d4"; x.lineWidth = 2.5; x.stroke(); });
  }
  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function drawDonut() {
    const cv = $("#donut"); if (!cv) return; const x = cv.getContext("2d"); const cx = 75, cy = 75, r = 60;
    let a = -Math.PI / 2; const tot = DB.channelSplit.reduce((s, c) => s + c.value, 0);
    DB.channelSplit.forEach(c => { const slice = c.value / tot * Math.PI * 2;
      x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, r, a, a + slice); x.closePath(); x.fillStyle = c.color; x.fill(); a += slice; });
    x.beginPath(); x.arc(cx, cy, 36, 0, 7); x.fillStyle = "#fff"; x.fill();
    x.fillStyle = "#0f172a"; x.font = "700 20px Inter"; x.textAlign = "center"; x.fillText("621", cx, cy - 2);
    x.fillStyle = "#94a3b8"; x.font = "10px Inter"; x.fillText("orders", cx, cy + 13);
  }

  /* ============================ PRODUCTS ============================ */
  let prodFilter = { q: "", cat: "all", brand: "all", stock: "all" };
  function products() {
    const cats = ["all", ...new Set(DB.products.map(p => p.cat))];
    const brands = ["all", ...new Set(DB.products.map(p => p.brand))];
    set(`
      <div class="page-head">
        <div><h2>Product Catalog</h2><p>${DB.products.length} SKUs · manage stock, locations & pricing</p></div>
        <div class="actions">
          <button class="btn btn--ghost btn--sm" id="pImport">Import CSV</button>
          <button class="btn btn--primary btn--sm" id="pAdd">+ Add Product</button>
        </div>
      </div>
      <div class="card">
        <div class="card__body">
          <div class="toolbar">
            <div class="grow search-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input id="pSearch" placeholder="Search name, SKU or barcode…" value="${esc(prodFilter.q)}" />
            </div>
            <select class="select" id="pCat">${cats.map(c => `<option value="${c}" ${prodFilter.cat === c ? "selected" : ""}>${c === "all" ? "All categories" : c}</option>`).join("")}</select>
            <select class="select" id="pBrand">${brands.map(b => `<option value="${b}" ${prodFilter.brand === b ? "selected" : ""}>${b === "all" ? "All brands" : b}</option>`).join("")}</select>
            <select class="select" id="pStock">
              <option value="all">All stock</option><option value="in">In stock</option>
              <option value="low">Low stock</option><option value="out">Out of stock</option>
            </select>
          </div>
          <div class="table-wrap"><table class="tbl" id="pTable"></table></div>
        </div>
      </div>`);
    const rebind = () => renderProdTable();
    $("#pSearch").addEventListener("input", e => { prodFilter.q = e.target.value; rebind(); });
    $("#pCat").addEventListener("change", e => { prodFilter.cat = e.target.value; rebind(); });
    $("#pBrand").addEventListener("change", e => { prodFilter.brand = e.target.value; rebind(); });
    $("#pStock").value = prodFilter.stock;
    $("#pStock").addEventListener("change", e => { prodFilter.stock = e.target.value; rebind(); });
    $("#pAdd").addEventListener("click", () => productDrawer());
    $("#pImport").addEventListener("click", () => toast("CSV import — map columns in the next step", "info"));
    renderProdTable();
  }
  function renderProdTable() {
    const f = prodFilter;
    let list = DB.products.filter(p => {
      const q = f.q.toLowerCase();
      if (q && !(p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.ean.includes(q))) return false;
      if (f.cat !== "all" && p.cat !== f.cat) return false;
      if (f.brand !== "all" && p.brand !== f.brand) return false;
      if (f.stock === "in" && !(p.avail > p.safety)) return false;
      if (f.stock === "low" && !(p.phys > 0 && p.avail <= p.safety)) return false;
      if (f.stock === "out" && p.phys !== 0) return false;
      return true;
    });
    const t = $("#pTable");
    if (!list.length) { t.innerHTML = `<tbody><tr><td><div class="empty"><div class="ic">🔍</div>No products match your filters</div></td></tr></tbody>`; return; }
    t.innerHTML = `
      <thead><tr><th>Product</th><th>Category / Brand</th><th>Location</th><th>Stock health</th><th class="right">Price</th><th></th></tr></thead>
      <tbody>${list.map(p => `
        <tr>
          <td><div class="cell-prod">${thumbHtml(p)}
            <div><b>${esc(p.name)}</b><span class="mono">${p.sku}</span></div></div></td>
          <td>${esc(p.cat)}<div class="muted" style="font-size:12px">${esc(p.brand)}</div></td>
          <td><span class="badge b-gray" style="font-family:var(--font)">📍 ${p.loc}</span></td>
          <td style="min-width:170px">
            <div class="row-between" style="margin-bottom:4px">${stockLabel(p)}<b>${p.avail}</b></div>
            <div class="stockbar"><i style="width:${Math.min(100, p.phys ? p.avail / (p.phys) * 100 : 0)}%;background:${stockColor(p)}"></i></div>
            <div class="stock-nums"><span>Phys <b>${p.phys}</b></span><span>Rsv <b>${p.reserved}</b></span><span>Transit <b>${p.transit}</b></span></div>
          </td>
          <td class="right"><b>${money(p.price)}</b><div class="muted" style="font-size:12px">cost ${money(p.cost)}</div></td>
          <td class="right nowrap">
            <button class="btn btn--ghost btn--sm btn--icon" data-edit="${p.id}" title="Edit">✏️</button>
            <button class="btn btn--ghost btn--sm btn--icon" data-del="${p.id}" title="Delete">🗑️</button>
          </td>
        </tr>`).join("")}</tbody>`;
    $$("[data-edit]", t).forEach(b => b.addEventListener("click", () => productDrawer(DB.products.find(p => p.id == b.dataset.edit))));
    $$("[data-del]", t).forEach(b => b.addEventListener("click", () => {
      const p = DB.products.find(x => x.id == b.dataset.del);
      openModal(confirmModal("🗑️", "var(--red-bg)", "Delete product?", `“${esc(p.name)}” will be soft-deleted and hidden from channels. You can restore it from the trash.`, "Delete", "btn--danger", async () => {
        if (apiMode) {
          const ok = await apiDo(API.deleteProduct(p.id), "Product soft-deleted");
          if (!ok) return;
          await SYNC.refresh("products");
        } else {
          DB.products = DB.products.filter(x => x.id != p.id);
          toast("Product soft-deleted", "ok");
        }
        closeOverlays(); renderProdTable(); renderNav();
      }));
    }));
  }
  function productDrawer(p) {
    const edit = !!p; p = p || { img: "📦", name: "", sku: "", ean: "", cat: "Gloves", brand: "Rival", loc: "", phys: 0, avail: 0, reserved: 0, transit: 0, safety: 0, price: 0, cost: 0 };
    openDrawer(`
      <div class="drawer__head"><div><h3>${edit ? "Edit" : "New"} Product</h3><p>${edit ? esc(p.sku) : "Create a catalog item"}</p></div>
        <button class="x-btn" id="dClose">✕</button></div>
      <div class="drawer__body">
        <div class="form-sec-title">Media</div>
        <input type="file" id="fImageInput" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" style="display:none"/>
        <div class="upload" id="fUpload">⬆️ Click to upload a primary image (PNG, JPG, GIF, WEBP · max 8MB)</div>
        <div class="gallery">
          <div class="g" id="fPreview" style="overflow:hidden;background-size:cover;background-position:center">${p.imageUrl ? "" : p.img}</div>
        </div>
        <div class="hr mt-18"></div>
        <div class="form-sec-title">Details</div>
        <div class="form-grid">
          <div class="field"><label>Product name</label><input class="input" id="fName" value="${esc(p.name)}" placeholder="Pro Boxing Gloves 16oz"/></div>
          <div class="form-grid cols-2">
            <div class="field"><label>SKU (unique)</label><input class="input mono" id="fSku" value="${esc(p.sku)}" placeholder="RVL-GLV-16-RED"/></div>
            <div class="field"><label>EAN / Barcode</label><input class="input mono" id="fEan" value="${esc(p.ean)}" placeholder="899…"/></div>
          </div>
          <div class="form-grid cols-2">
            <div class="field"><label>Category</label><select class="select" id="fCat" style="width:100%">${[...new Set(DB.products.map(x=>x.cat))].map(c=>`<option ${c===p.cat?"selected":""}>${c}</option>`).join("")}</select></div>
            <div class="field"><label>Brand</label><select class="select" id="fBrand" style="width:100%">${DB.brands.map(b=>`<option ${b.name===p.brand?"selected":""}>${b.name}</option>`).join("")}</select></div>
          </div>
          <div class="field"><label>Bin / Warehouse location</label><input class="input" id="fLoc" value="${esc(p.loc)}" placeholder="Aisle-02-Shelf-B"/></div>
        </div>
        <div class="hr mt-18"></div>
        <div class="form-sec-title">Stock levels</div>
        <div class="form-grid cols-2">
          <div class="field"><label>Physical stock</label><input class="input" id="fPhys" type="number" value="${p.phys}"/></div>
          <div class="field"><label>Available stock</label><input class="input" id="fAvail" type="number" value="${p.avail}"/></div>
          <div class="field"><label>Reserved stock</label><input class="input" id="fReserved" type="number" value="${p.reserved}"/></div>
          <div class="field"><label>In-transit stock</label><input class="input" id="fTransit" type="number" value="${p.transit}"/></div>
          <div class="field"><label>Safety threshold</label><input class="input" id="fSafety" type="number" value="${p.safety}"/></div>
        </div>
        <div class="hr mt-18"></div>
        <div class="form-sec-title">Pricing</div>
        <div class="form-grid cols-2">
          <div class="field"><label>Sale price ($)</label><input class="input" id="fPrice" type="number" step="0.01" value="${p.price}"/></div>
          <div class="field"><label>Cost price ($)</label><input class="input" id="fCost" type="number" step="0.01" value="${p.cost}"/></div>
        </div>
      </div>
      <div class="drawer__foot"><button class="btn btn--ghost" id="dCancel">Cancel</button>
        <button class="btn btn--primary" id="dSave">${edit ? "Save changes" : "Create product"}</button></div>`);
    $("#dClose").onclick = $("#dCancel").onclick = closeOverlays;

    // --- image upload wiring ---
    let uploadedUrl = p.imageUrl || null;
    let uploadInFlight = null;     // Promise while an upload is running
    const preview = $("#fPreview");
    const uploadBox = $("#fUpload");
    if (uploadedUrl && apiMode && API.imageSrc) preview.style.backgroundImage = `url("${API.imageSrc(uploadedUrl)}")`;
    const fileInput = $("#fImageInput");
    uploadBox.onclick = () => fileInput.click();
    fileInput.onchange = () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) { toast("Image exceeds 8MB", "err"); return; }
      // local preview immediately
      const reader = new FileReader();
      reader.onload = (e) => { preview.textContent = ""; preview.style.backgroundImage = `url("${e.target.result}")`; };
      reader.readAsDataURL(file);

      if (!apiMode) {
        toast("⚠️ Backend not connected — image preview only, won't be saved", "err");
        return;
      }
      // upload now (track the promise so Save can await it)
      uploadBox.textContent = "⏳ Uploading…";
      uploadInFlight = (async () => {
        try {
          const r = edit ? await API.uploadProductImage(p.id, file) : await API.uploadImage(file);
          uploadedUrl = r.imageUrl || r.url || uploadedUrl;
          if (edit) await SYNC.refresh("products");
          uploadBox.textContent = "✅ Image uploaded — click to replace";
          toast("Image uploaded", "ok");
        } catch (e) {
          uploadBox.textContent = "⬆️ Click to upload a primary image";
          toast(e.message || "Upload failed", "err");
        } finally { uploadInFlight = null; }
      })();
    };

    $("#dSave").onclick = async () => {
      // If an image is still uploading, wait so its URL is included.
      if (uploadInFlight) { toast("Waiting for image upload…", "info"); await uploadInFlight; }
      const num = (id) => Number($("#" + id).value || 0);
      const payload = {
        img: p.img || "📦",
        name: $("#fName").value.trim(),
        sku: $("#fSku").value.trim(),
        ean: $("#fEan").value.trim(),
        cat: $("#fCat").value,
        brand: $("#fBrand").value,
        loc: $("#fLoc").value.trim(),
        phys: num("fPhys"), avail: num("fAvail"), reserved: num("fReserved"),
        transit: num("fTransit"), safety: num("fSafety"), price: num("fPrice"), cost: num("fCost"),
      };
      if (uploadedUrl) payload.imageUrl = uploadedUrl;
      if (!payload.name || !payload.sku) { toast("Name and SKU are required", "err"); return; }
      if (apiMode) {
        const ok = await apiDo(edit ? API.updateProduct(p.id, payload) : API.createProduct(payload),
          edit ? "Product updated — synced to all channels" : "Product created");
        if (!ok) return;
        await SYNC.refresh("products");
      } else {
        if (edit) { Object.assign(DB.products.find(x => x.id === p.id), payload); }
        else { DB.products.push({ id: Math.max(0, ...DB.products.map(x => x.id)) + 1, deleted: false, ...payload }); }
        toast(edit ? "Product updated — synced to all channels" : "Product created", "ok");
      }
      closeOverlays(); renderProdTable(); renderNav();
    };
  }

  /* ============================ CATEGORIES & BRANDS ============================ */
  function categories() {
    set(`
      <div class="page-head"><div><h2>Categories & Brands</h2><p>Organize your catalog hierarchy and brand entities</p></div></div>
      <div class="grid g-2">
        <div class="card">
          <div class="card__head"><h3>Product Categories</h3><button class="btn btn--primary btn--sm" id="addCat">+ Category</button></div>
          <div class="card__body"><div class="table-wrap"><table class="tbl">
            <thead><tr><th>Category</th><th>Slug</th><th class="right">Products</th><th>Status</th></tr></thead>
            <tbody>${DB.categories.map(c => `<tr>
              <td>${c.parent ? `<span class="muted">${esc(c.parent)} ›</span> ` : ""}<b>${esc(c.name)}</b></td>
              <td class="mono muted">${c.slug}</td><td class="right">${c.products != null ? c.products : "—"}</td>
              <td>${badge(c.status === "Active" ? "b-green" : "b-gray", c.status, true)}</td></tr>`).join("")}</tbody>
          </table></div></div>
        </div>
        <div class="card">
          <div class="card__head"><h3>Brands</h3><button class="btn btn--primary btn--sm" id="addBrand">+ Brand</button></div>
          <div class="card__body"><div class="table-wrap"><table class="tbl">
            <thead><tr><th>Brand</th><th>Slug</th><th class="right">Products</th><th>Status</th></tr></thead>
            <tbody>${DB.brands.map(b => `<tr>
              <td><div class="cell-prod"><div class="thumb" style="width:34px;height:34px;font-size:13px;font-weight:800;background:var(--brand-50);color:var(--brand)">${b.name.slice(0,2).toUpperCase()}</div><b>${esc(b.name)}</b></div></td>
              <td class="mono muted">${b.slug}</td><td class="right">${b.products}</td>
              <td>${badge(b.status === "Active" ? "b-green" : "b-gray", b.status, true)}</td></tr>`).join("")}</tbody>
          </table></div></div>
        </div>
      </div>`);
    $("#addCat").onclick = () => catBrandDrawer("category");
    $("#addBrand").onclick = () => catBrandDrawer("brand");
  }

  function catBrandDrawer(kind) {
    const isCat = kind === "category";
    openDrawer(`
      <div class="drawer__head"><div><h3>New ${isCat ? "Category" : "Brand"}</h3><p>${isCat ? "Add a catalog category" : "Add a brand entity"}</p></div><button class="x-btn" id="cbClose">✕</button></div>
      <div class="drawer__body"><div class="form-grid">
        <div class="field"><label>Name</label><input class="input" id="cbName" placeholder="${isCat ? "e.g. Headgear" : "e.g. Twins"}"/></div>
        ${isCat ? `<div class="field"><label>Parent category (optional)</label><select class="select" id="cbParent" style="width:100%"><option value="">— None (top level) —</option>${DB.categories.filter(c=>!c.parent).map(c=>`<option value="${esc(c.name)}">${esc(c.name)}</option>`).join("")}</select></div>` : ""}
        <div class="field"><label>Slug</label><input class="input mono" id="cbSlug" placeholder="auto-generated if blank"/></div>
        <div class="field"><label>Description</label><textarea class="input" id="cbDesc" style="height:72px;padding:10px 14px"></textarea></div>
        <div class="field"><label>Status</label><select class="select" id="cbStatus" style="width:100%"><option>Active</option><option>Inactive</option></select></div>
      </div></div>
      <div class="drawer__foot"><button class="btn btn--ghost" id="cbCancel">Cancel</button><button class="btn btn--primary" id="cbSave">Create ${isCat ? "category" : "brand"}</button></div>`);
    $("#cbClose").onclick = $("#cbCancel").onclick = closeOverlays;
    $("#cbSave").onclick = async () => {
      const name = $("#cbName").value.trim();
      if (!name) { toast("Name is required", "err"); return; }
      const payload = { name, slug: $("#cbSlug").value.trim() || name.toLowerCase().replace(/\s+/g, "-"), description: $("#cbDesc").value.trim(), status: $("#cbStatus").value };
      if (isCat) payload.parent = $("#cbParent").value || null;
      if (apiMode) {
        const ok = await apiDo(isCat ? API.createCategory(payload) : API.createBrand(payload), `${isCat ? "Category" : "Brand"} created`);
        if (!ok) return;
        await SYNC.refresh(isCat ? "categories" : "brands");
      } else {
        if (isCat) DB.categories.push({ id: "CAT-" + (DB.categories.length + 1), products: 0, ...payload });
        else DB.brands.push({ id: "BR-" + (DB.brands.length + 1), products: 0, ...payload });
        toast(`${isCat ? "Category" : "Brand"} created`, "ok");
      }
      closeOverlays(); categories();
    };
  }

  W.registerViews({ dashboard, products, categories });
  // Part 2 registers the rest
  W._part1Ready = true;
})();
