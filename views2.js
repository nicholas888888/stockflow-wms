/* =========================================================
   StockFlow WMS — Views Part 2 (inbound, returns, orders,
   picking, packing, outbound, users, integrations)
   ========================================================= */
(function () {
  const W = window.__WMS;
  const { DB, $, $$, esc, money, icon, toast, beep, openDrawer, closeOverlays, openModal, confirmModal, state, go, renderNav } = W;
  const set = (html) => { $("#content").innerHTML = html; };
  const badge = (cls, text, dot) => `<span class="badge ${cls}">${dot ? `<span class="d" style="background:currentColor"></span>` : ""}${text}</span>`;
  const chanTag = (ch) => { const map = { TikTok: ["tiktok", "TK"], Shopee: ["shopee", "SP"], Tokopedia: ["tokopedia", "TP"] }; const [cls, ab] = map[ch]; return `<span class="chan ${cls}"><span class="c">${ab}</span>${ch}</span>`; };
  const statusBadge = (st) => { const s = DB.orderStatuses[st]; return badge(s.badge, s.label, true); };

  /* ============================ INBOUND (PO) ============================ */
  function inbound() {
    const stMap = { Receiving: "b-blue", "Pending QC": "b-amber", Completed: "b-green", "In Transit": "b-violet" };
    set(`
      <div class="page-head"><div><h2>Stock Receiving</h2><p>Receive purchase orders, run QC, and push stock to all channels</p></div>
        <div class="actions"><button class="btn btn--primary btn--sm" id="newPo">+ Receive Stock</button></div></div>
      <div class="grid g-4" style="margin-bottom:18px">
        ${[["Open POs","2","📋","var(--blue-bg)","var(--blue)"],["Awaiting QC","1","🔍","var(--amber-bg)","var(--amber)"],["Units inbound today","700","📦","var(--violet-bg)","var(--violet)"],["Received (7d)","1,490","✅","var(--green-bg)","var(--green)"]].map(k=>`
          <div class="kpi"><div class="top"><div class="ic" style="background:${k[3]};color:${k[4]};font-size:19px">${k[2]}</div></div>
          <div class="val">${k[1]}</div><div class="lbl">${k[0]}</div></div>`).join("")}
      </div>
      <div class="card">
        <div class="card__head"><h3>Purchase Orders</h3><span class="sub">Supplier inbound</span></div>
        <div class="card__body"><div class="table-wrap"><table class="tbl">
          <thead><tr><th>PO #</th><th>Supplier</th><th>Date</th><th class="right">Lines</th><th class="right">Units</th><th>ETA</th><th>Status</th><th></th></tr></thead>
          <tbody>${DB.purchaseOrders.map(po => `<tr>
            <td class="mono"><b>${po.id}</b></td><td>${esc(po.supplier)}</td><td class="muted">${po.date}</td>
            <td class="right">${po.items}</td><td class="right"><b>${po.qty}</b></td><td class="muted">${po.eta}</td>
            <td>${badge(stMap[po.status], po.status, true)}</td>
            <td class="right">${po.status === "Completed" ? '<span class="muted">—</span>' : `<button class="btn btn--primary btn--sm" data-recv="${po.id}">Receive</button>`}</td>
          </tr>`).join("")}</tbody>
        </table></div></div>
      </div>`);
    $("#newPo").onclick = () => receiveDrawer({ id: "New Intake", supplier: "" });
    $$("[data-recv]").forEach(b => b.onclick = () => receiveDrawer(DB.purchaseOrders.find(p => p.id === b.dataset.recv)));
  }
  function receiveDrawer(po) {
    openDrawer(`
      <div class="drawer__head"><div><h3>Receive Stock</h3><p>${esc(po.id)}${po.supplier ? " · " + esc(po.supplier) : ""}</p></div><button class="x-btn" id="dc">✕</button></div>
      <div class="drawer__body">
        <div class="field"><label>Select SKU</label><select class="select" style="width:100%">${DB.products.map(p=>`<option>${p.sku} — ${p.name}</option>`).join("")}</select></div>
        <div class="form-grid cols-2">
          <div class="field"><label>Target location</label><input class="input" value="A-02-B" placeholder="Aisle-Shelf"/></div>
          <div class="field"><label>Received qty</label><input class="input" type="number" value="50"/></div>
        </div>
        <div class="hr mt-18"></div>
        <div class="form-sec-title">Quality Check (QC)</div>
        <div class="field"><label>QC result</label><select class="select" style="width:100%"><option>Passed — add to available</option><option>Partial — quarantine failures</option><option>Failed — reject batch</option></select></div>
        <div class="field"><label>Notes</label><textarea class="input" style="height:76px;padding:10px 14px" placeholder="Batch condition, seal check…"></textarea></div>
        <div class="card" style="background:var(--surface-2);margin-top:4px"><div class="card__body" style="padding:14px">
          <div class="row-between" style="font-size:13px"><span class="muted">Available stock after receive</span><b style="color:var(--green)">+50 units → synced to 3 channels</b></div>
        </div></div>
      </div>
      <div class="drawer__foot"><button class="btn btn--ghost" id="dcc">Cancel</button><button class="btn btn--primary" id="ds">Confirm & Update Inventory</button></div>`);
    $("#dc").onclick = $("#dcc").onclick = closeOverlays;
    $("#ds").onclick = () => { closeOverlays(); toast("Stock received — inventory synced across all channels", "ok"); beep("ok"); };
  }

  /* ============================ RETURNS ============================ */
  function returns() {
    const stMap = { Inspecting: "b-amber", Quarantine: "b-red", Restocked: "b-green" };
    set(`
      <div class="page-head"><div><h2>Customer Returns</h2><p>Process RMAs, decide disposition, and update inventory</p></div>
        <div class="actions"><button class="btn btn--primary btn--sm" id="scanReturn">Scan Return Barcode</button></div></div>
      <div class="card">
        <div class="card__body">
          <div class="toolbar">
            <div class="grow search-sm"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input placeholder="Search Return Order ID or tracking…"/></div>
            <select class="select"><option>All reasons</option><option>Damaged</option><option>Wrong Size</option><option>Exchange</option></select>
          </div>
          <div class="table-wrap"><table class="tbl">
            <thead><tr><th>RMA #</th><th>Order</th><th>Customer</th><th>Reason</th><th>SKU</th><th class="right">Qty</th><th>Status</th><th>Disposition</th></tr></thead>
            <tbody>${DB.returns.map(r => `<tr>
              <td class="mono"><b>${r.id}</b></td><td class="mono muted">${r.order}</td><td>${esc(r.customer)}</td>
              <td>${badge(r.reason==="Damaged"?"b-red":r.reason==="Wrong Size"?"b-amber":"b-blue", r.reason)}</td>
              <td class="mono">${r.sku}</td><td class="right">${r.qty}</td>
              <td>${badge(stMap[r.status], r.status, true)}</td>
              <td>${r.disp === "—" ? `<button class="btn btn--ghost btn--sm" data-disp="${r.id}">Decide</button>` : badge(r.disp==="Restock"?"b-green":"b-red", r.disp)}</td>
            </tr>`).join("")}</tbody>
          </table></div>
        </div>
      </div>`);
    $("#scanReturn").onclick = () => toast("Scan the return tracking barcode to begin", "info");
    $$("[data-disp]").forEach(b => b.onclick = () => dispositionModal(DB.returns.find(r => r.id === b.dataset.disp)));
  }
  function dispositionModal(r) {
    openModal(`<div class="modal__body"><div class="modal__ic" style="background:var(--amber-bg);font-size:24px">📥</div>
      <h3>Disposition — ${r.id}</h3><p>${esc(r.customer)} · ${r.reason} · ${r.sku}</p>
      <div style="display:grid;gap:10px;margin-top:18px;text-align:left">
        <button class="btn btn--ghost" id="restock" style="justify-content:flex-start">♻️ Restock to inventory (+${r.qty} available)</button>
        <button class="btn btn--ghost" id="quarantine" style="justify-content:flex-start">⛔ Mark defective / quarantine</button>
      </div></div>
      <div class="modal__foot"><button class="btn btn--ghost" id="dcancel" style="flex:1">Close</button></div>`);
    $("#dcancel").onclick = closeOverlays;
    $("#restock").onclick = () => { closeOverlays(); toast("Restocked — available stock increased & synced", "ok"); beep("ok"); };
    $("#quarantine").onclick = () => { closeOverlays(); toast("Moved to quarantine as defective", "info"); };
  }

  /* ============================ ORDERS ============================ */
  let orderFilter = { status: "all", courier: "all", delivery: "all", q: "" };
  function orders() {
    const pc = DB.pipelineCounts();
    const stages = [
      { k: "all", n: pc.total, t: "Total Orders", c: "var(--brand)" },
      { k: "Pending", n: pc.Pending, t: "Waiting Process", c: "#64748b" },
      { k: "Waiting Picking", n: pc["Waiting Picking"], t: "Waiting Picking", c: "var(--blue)" },
      { k: "Waiting Packing", n: pc["Waiting Packing"], t: "Waiting Packing", c: "var(--violet)" },
      { k: "Waiting Outbound", n: pc["Waiting Outbound"], t: "Waiting Outbound", c: "var(--amber)" },
    ];
    set(`
      <div class="page-head"><div><h2>Order Management</h2><p>Multi-channel orders across TikTok, Shopee & Tokopedia</p></div>
        <div class="actions">
          <button class="btn btn--ghost btn--sm" id="printBatch">🖨️ Print selected</button>
          <button class="btn btn--primary btn--sm" id="processBatch">Process selected</button>
        </div></div>

      <div class="pipe" style="margin-bottom:18px">
        ${stages.map(s => `<button class="stage" data-stage="${s.k}" style="text-align:left;border:${orderFilter.status===s.k?"2px solid var(--brand)":"1px solid var(--line)"}">
          <div class="n">${s.n}</div><div class="t">${s.t}</div>
          <div class="bar"><i style="width:${Math.min(100,s.n/pc.total*100)}%;background:${s.c}"></i></div></button>`).join("")}
      </div>

      <div class="card"><div class="card__body">
        <div class="toolbar">
          <div class="grow search-sm"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input id="oSearch" placeholder="Search order #, customer, waybill…" value="${esc(orderFilter.q)}"/></div>
          <select class="select" id="oCourier"><option value="all">All couriers</option>${DB.couriers.map(c=>`<option ${orderFilter.courier===c?"selected":""}>${c}</option>`).join("")}</select>
          <select class="select" id="oDelivery"><option value="all">All delivery</option>${DB.deliveryTypes.map(d=>`<option ${orderFilter.delivery===d?"selected":""}>${d}</option>`).join("")}</select>
          <select class="select" id="oDate"><option>All dates</option><option>Today</option><option>Last 7 days</option><option>This month</option></select>
        </div>
        <div class="table-wrap"><table class="tbl" id="oTable"></table></div>
      </div></div>`);
    $$("[data-stage]").forEach(b => b.onclick = () => { orderFilter.status = b.dataset.stage; orders(); });
    $("#oSearch").addEventListener("input", e => { orderFilter.q = e.target.value; renderOrderTable(); });
    $("#oCourier").onchange = e => { orderFilter.courier = e.target.value; renderOrderTable(); };
    $("#oDelivery").onchange = e => { orderFilter.delivery = e.target.value; renderOrderTable(); };
    $("#processBatch").onclick = () => batchAction("process");
    $("#printBatch").onclick = () => batchAction("print");
    renderOrderTable();
  }
  function filteredOrders() {
    const f = orderFilter;
    return DB.orders.filter(o => {
      if (f.status !== "all") {
        const bucket = o.status === "Printed" ? "Waiting Picking" : o.status;
        if (bucket !== f.status && !(f.status === "Waiting Outbound" && o.status === "Waiting Outbound")) return false;
      }
      if (f.courier !== "all" && o.courier !== f.courier) return false;
      if (f.delivery !== "all" && o.delivery !== f.delivery) return false;
      const q = f.q.toLowerCase();
      if (q && !(o.id.toLowerCase().includes(q) || o.customer.toLowerCase().includes(q) || o.waybill.toLowerCase().includes(q))) return false;
      return true;
    });
  }
  function renderOrderTable() {
    const list = filteredOrders(), t = $("#oTable");
    if (!list.length) { t.innerHTML = `<tbody><tr><td><div class="empty"><div class="ic">📭</div>No orders match these filters</div></td></tr></tbody>`; return; }
    t.innerHTML = `
      <thead><tr><th style="width:36px"><input type="checkbox" class="cb" id="oAll"/></th><th>Order</th><th>Channel</th><th>Customer</th><th>Courier</th><th>Delivery</th><th class="right">Items</th><th class="right">Total</th><th>Status</th><th></th></tr></thead>
      <tbody>${list.map(o => `<tr>
        <td><input type="checkbox" class="cb oRow" data-id="${o.id}"/></td>
        <td class="mono"><b>${o.id}</b><div class="muted" style="font-size:11px">${o.date}</div></td>
        <td>${chanTag(o.channel)}</td>
        <td>${esc(o.customer)}</td>
        <td>${esc(o.courier)}<div class="muted" style="font-size:11px">${o.waybill}</div></td>
        <td>${badge(o.delivery==="Instant"?"b-pink":o.delivery==="Standard"?"b-blue":"b-gray", o.delivery)}</td>
        <td class="right">${o.itemCount}</td>
        <td class="right"><b>${money(o.total)}</b></td>
        <td>${statusBadge(o.status)}</td>
        <td class="right nowrap">
          ${o.status==="Pending" ? `<button class="btn btn--primary btn--sm" data-proc="${o.id}">Process</button>` : ""}
          <button class="btn btn--ghost btn--sm btn--icon" data-print="${o.id}" title="Print label/invoice">🖨️</button>
        </td></tr>`).join("")}</tbody>`;
    const all = $("#oAll");
    all.onchange = () => $$(".oRow").forEach(c => c.checked = all.checked);
    $$("[data-proc]").forEach(b => b.onclick = () => {
      const o = DB.orders.find(x => x.id === b.dataset.proc); o.status = "Waiting Picking";
      toast(`${o.id} → Waiting for Picking`, "ok"); renderOrderTable(); renderNav();
    });
    $$("[data-print]").forEach(b => b.onclick = () => {
      const o = DB.orders.find(x => x.id === b.dataset.print);
      if (o.status === "Pending") o.status = "Printed";
      toast(`Invoice + ${o.courier} waybill printed for ${o.id}`, "ok"); renderOrderTable(); renderNav();
    });
  }
  function batchAction(kind) {
    const ids = $$(".oRow:checked").map(c => c.dataset.id);
    if (!ids.length) { toast("Select at least one order", "err"); return; }
    if (kind === "process") { ids.forEach(id => { const o = DB.orders.find(x => x.id === id); if (o.status === "Pending") o.status = "Waiting Picking"; });
      toast(`${ids.length} orders moved to Waiting for Picking`, "ok"); }
    else { ids.forEach(id => { const o = DB.orders.find(x => x.id === id); if (o.status === "Pending") o.status = "Printed"; });
      toast(`Batch printed ${ids.length} invoices + waybills`, "ok"); }
    renderOrderTable(); renderNav();
  }

  /* ============================ PICKING ============================ */
  let pickSession = null;
  function picking() { scanStation("picking"); }
  function packing() { scanStation("packing"); }

  function scanStation(mode) {
    const label = mode === "picking" ? "Picking" : "Packing";
    const next = DB.orders.find(o => mode === "picking" ? (o.status === "Waiting Picking" || o.status === "Printed") : o.status === "Waiting Packing");
    set(`
      <div class="page-head"><div><h2>Barcode ${label} Station</h2><p>Scan invoice to start · scan each SKU to verify · audio feedback enabled 🔊</p></div>
        <div class="actions"><span class="badge b-teal"><span class="d" style="background:currentColor"></span>Scanner ready</span></div></div>
      <div id="scanRoot"></div>`);
    if (!next) {
      $("#scanRoot").innerHTML = `<div class="card"><div class="empty"><div class="ic">🎉</div>
        <b style="color:var(--ink);font-size:16px">Queue clear!</b><p>No orders waiting for ${label.toLowerCase()} right now.</p></div></div>`;
      return;
    }
    startSession(mode, next);
  }

  function startSession(mode, order) {
    pickSession = { mode, order, counts: {}, done: false };
    order.items.forEach(it => pickSession.counts[it.p.sku] = 0);
    renderScanUI(true);
  }

  function renderScanUI(awaitingInvoice) {
    const { mode, order, counts } = pickSession;
    const label = mode === "picking" ? "Picking" : "Packing";
    const totalReq = order.items.reduce((a, b) => a + b.q, 0);
    const totalDone = Object.entries(counts).reduce((a, [sku, n]) => a + n, 0);
    const pct = Math.round(totalDone / totalReq * 100);

    const items = order.items.map(it => {
      const n = counts[it.p.sku], full = n >= it.q;
      return `<div class="pick-item ${full ? "done" : ""}" data-sku="${it.p.sku}">
        <div class="thumb">${it.p.img}</div>
        <div class="info"><b>${esc(it.p.name)}</b><div class="mono muted" style="font-size:12px">${it.p.sku}</div>
          <span class="loc">📍 Bin ${it.p.loc}</span></div>
        <div class="qty"><b class="${full ? "full" : ""}">${n}/${it.q}</b><span>scanned</span></div>
        <div class="tick">✓</div></div>`;
    }).join("");

    $("#scanRoot").innerHTML = `
      <div class="scan-layout">
        <div>
          <div class="scanbox" id="scanbox">
            <div class="laser"></div>
            <div class="ic">${awaitingInvoice ? "🧾" : "📷"}</div>
            <h3 id="scanTitle">${awaitingInvoice ? "Scan invoice barcode to start" : "Scan product SKU barcode"}</h3>
            <p id="scanSub">${awaitingInvoice ? "Order " + order.id : "Verify each item before " + (mode === "picking" ? "picking" : "packing")}</p>
            <div class="scan-input">
              <input id="scanField" placeholder="${awaitingInvoice ? order.bc : "scan or type SKU"}" autocomplete="off"/>
              <button class="btn btn--primary" id="scanBtn">Scan</button>
            </div>
            <div style="margin-top:10px;font-size:12px" class="muted">Tip: try a wrong code to hear the error chime</div>
          </div>
          <div class="card mt-18"><div class="card__head"><h3>Items to ${label.toLowerCase()}</h3>
            <span class="sub">${totalDone}/${totalReq} verified</span></div>
            <div class="card__body">${items}</div></div>
        </div>

        <div class="card">
          <div class="card__head"><h3>Session</h3>${statusBadge(order.status)}</div>
          <div class="card__body">
            <svg class="progress-ring" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="52" fill="none" stroke="#eef0f3" stroke-width="12"/>
              <circle id="ring" cx="60" cy="60" r="52" fill="none" stroke="var(--brand)" stroke-width="12" stroke-linecap="round"
                stroke-dasharray="${2*Math.PI*52}" stroke-dashoffset="${2*Math.PI*52*(1-pct/100)}" transform="rotate(-90 60 60)" style="transition:.4s"/>
            </svg>
            <div class="progress-ring" style="margin-top:-108px;pointer-events:none"><div class="center"><b id="ringPct">${pct}%</b><span>complete</span></div></div>
            <div class="order-meta mt-24">
              <div class="m"><span>Order</span><b class="mono">${order.id}</b></div>
              <div class="m"><span>Channel</span><b>${chanTag(order.channel)}</b></div>
              <div class="m"><span>Customer</span><b>${esc(order.customer)}</b></div>
              <div class="m"><span>Courier</span><b>${esc(order.courier)}</b></div>
              <div class="m"><span>Items</span><b>${totalReq} units</b></div>
            </div>
            ${mode === "packing" ? `<div class="hr mt-18"></div><div class="form-sec-title">Package</div>
              <div class="form-grid cols-2"><div class="field"><label>Weight (kg)</label><input class="input" type="number" value="1.2" step="0.1"/></div>
              <div class="field"><label>Box size</label><select class="select" style="width:100%"><option>Small</option><option selected>Medium</option><option>Large</option></select></div></div>` : ""}
          </div>
        </div>
      </div>`;

    const field = $("#scanField"); field.focus();
    const fire = () => awaitingInvoice ? handleInvoiceScan(field.value.trim()) : handleSkuScan(field.value.trim());
    $("#scanBtn").onclick = fire;
    field.addEventListener("keydown", e => { if (e.key === "Enter") fire(); });
  }

  function flashBox(kind) {
    const b = $("#scanbox"); if (!b) return;
    b.classList.remove("ok", "err"); void b.offsetWidth;
    b.classList.add(kind === "ok" ? "ok" : "err");
    setTimeout(() => b.classList.remove("ok", "err"), 600);
  }

  function handleInvoiceScan(val) {
    const { order } = pickSession;
    if (!val) return;
    if (val.toUpperCase() === order.bc || val === order.id) {
      beep("ok"); flashBox("ok"); toast("Invoice verified — session started", "ok");
      renderScanUI(false);
    } else {
      beep("err"); flashBox("err");
      openModal(errorModal("Invalid invoice", `Scanned <b>${esc(val)}</b> does not match the active order <b>${order.id}</b>.`));
    }
  }

  function handleSkuScan(val) {
    const { order, counts } = pickSession;
    if (!val) return;
    const field = $("#scanField");
    const item = order.items.find(it => it.p.sku.toUpperCase() === val.toUpperCase() || it.p.ean === val);
    if (!item) {
      beep("err"); flashBox("err");
      openModal(errorModal("Unknown barcode", `<b>${esc(val)}</b> is not on this order. Remove the item and scan the correct SKU.`));
      field.value = ""; field.focus(); return;
    }
    if (counts[item.p.sku] >= item.q) {
      beep("err"); flashBox("err");
      openModal(errorModal("Excess quantity", `You already scanned all <b>${item.q}</b> units of <b>${item.p.sku}</b>. Over-pick blocked.`));
      field.value = ""; field.focus(); return;
    }
    counts[item.p.sku]++;
    beep("ok"); flashBox("ok");
    updateScanProgress(item.p.sku);
    field.value = ""; field.focus();

    const totalReq = order.items.reduce((a, b) => a + b.q, 0);
    const totalDone = Object.values(counts).reduce((a, b) => a + b, 0);
    if (totalDone >= totalReq) completeSession();
  }

  function updateScanProgress(sku) {
    const { order, counts } = pickSession;
    const row = document.querySelector(`.pick-item[data-sku="${CSS.escape(sku)}"]`);
    const item = order.items.find(it => it.p.sku === sku);
    const n = counts[sku], full = n >= item.q;
    if (row) {
      row.classList.toggle("done", full);
      const q = row.querySelector(".qty b"); q.textContent = `${n}/${item.q}`; q.classList.toggle("full", full);
    }
    const totalReq = order.items.reduce((a, b) => a + b.q, 0);
    const totalDone = Object.values(counts).reduce((a, b) => a + b, 0);
    const pct = Math.round(totalDone / totalReq * 100);
    const ring = $("#ring"); if (ring) ring.setAttribute("stroke-dashoffset", (2 * Math.PI * 52 * (1 - pct / 100)).toString());
    const rp = $("#ringPct"); if (rp) rp.textContent = pct + "%";
  }

  function completeSession() {
    const { mode, order } = pickSession;
    order.status = mode === "picking" ? "Waiting Packing" : "Waiting Outbound";
    renderNav();
    const nextLabel = mode === "picking" ? "Picked ✓ → sent to Packing" : "Packed ✓ → ready for Outbound";
    openModal(`<div class="modal__body"><div class="modal__ic" style="background:var(--green-bg);font-size:28px">✅</div>
      <h3>${mode === "picking" ? "Picking complete!" : "Packing complete!"}</h3>
      <p>${order.id} — 100% item accuracy. ${nextLabel}.</p></div>
      <div class="modal__foot"><button class="btn btn--ghost" id="cmDone">Finish</button>
      <button class="btn btn--primary" id="cmNext">Next order →</button></div>`);
    beep("ok"); setTimeout(() => beep("ok"), 160);
    $("#cmDone").onclick = closeOverlays;
    $("#cmNext").onclick = () => { closeOverlays(); scanStation(mode); };
  }

  function errorModal(title, body) {
    setTimeout(() => { const b = document.getElementById("errOk"); if (b) b.onclick = closeOverlays; }, 0);
    return `<div class="modal__body"><div class="modal__ic" style="background:var(--red-bg);font-size:26px">🚫</div>
      <h3>${title}</h3><p>${body}</p></div>
      <div class="modal__foot"><button class="btn btn--danger" id="errOk" style="flex:1">Dismiss</button></div>`;
  }

  /* ============================ OUTBOUND ============================ */
  function outbound() {
    const ready = DB.orders.filter(o => o.status === "Waiting Outbound");
    set(`
      <div class="page-head"><div><h2>Outbound & Logistics Handover</h2><p>Scan waybill at dispatch to validate carrier and mark Shipped</p></div></div>
      <div class="scan-layout">
        <div>
          <div class="scanbox" id="obBox">
            <div class="laser"></div><div class="ic">🚚</div>
            <h3>Scan waybill or invoice barcode</h3><p>Courier driver pickup — validate & dispatch</p>
            <div class="scan-input"><input id="obField" placeholder="scan waybill…" autocomplete="off"/>
              <button class="btn btn--primary" id="obBtn">Scan</button></div>
          </div>
          <div class="card mt-18"><div class="card__head"><h3>Ready for Dispatch</h3><span class="sub">${ready.length} orders</span></div>
            <div class="card__body" id="obList">${ready.length ? ready.map(o => `
              <div class="pick-item" style="margin-bottom:8px"><div class="thumb">📦</div>
                <div class="info"><b>${o.id}</b><div class="mono muted" style="font-size:12px">${o.waybill}</div></div>
                <div class="right">${chanTag(o.channel)}<div class="muted" style="font-size:12px;margin-top:4px">${esc(o.courier)}</div></div>
              </div>`).join("") : '<div class="empty"><div class="ic">📭</div>Nothing waiting for outbound</div>'}</div></div>
        </div>
        <div class="card"><div class="card__head"><h3>Today's Handover</h3></div><div class="card__body">
          <div class="order-meta">
            <div class="m"><span>Shipped today</span><b style="color:var(--green)">38 orders</b></div>
            <div class="m"><span>Pending dispatch</span><b>${ready.length} orders</b></div>
            <div class="m"><span>J&T Express</span><b>14</b></div>
            <div class="m"><span>JNE</span><b>9</b></div>
            <div class="m"><span>Shopee Express</span><b>11</b></div>
            <div class="m"><span>NinjaVan</span><b>4</b></div>
          </div>
          <div class="card mt-18" style="background:var(--surface-2)"><div class="card__body" style="padding:14px;font-size:12.5px" class="muted">
            <b>🔁 Status sync:</b> Shipped status + tracking number auto-pushed to the marketplace API in real time.</div></div>
        </div></div>
      </div>`);
    const dispatch = () => {
      const v = $("#obField").value.trim(); if (!v) return;
      const o = DB.orders.find(x => x.waybill.toLowerCase() === v.toLowerCase() || x.bc.toLowerCase() === v.toLowerCase() || x.id.toLowerCase() === v.toLowerCase());
      const box = $("#obBox");
      if (o && o.status === "Waiting Outbound") {
        o.status = "Shipped"; beep("ok"); box.classList.add("ok"); setTimeout(() => box.classList.remove("ok"), 600);
        toast(`${o.id} dispatched via ${o.courier} — status pushed to ${o.channel}`, "ok");
        renderNav(); outbound();
      } else {
        beep("err"); box.classList.add("err"); setTimeout(() => box.classList.remove("err"), 600);
        openModal(errorModal("Not ready for dispatch", `<b>${esc(v)}</b> is not a valid waybill in the outbound queue.`));
      }
    };
    $("#obBtn").onclick = dispatch;
    $("#obField").addEventListener("keydown", e => { if (e.key === "Enter") dispatch(); });
    $("#obField").focus();
  }

  /* ============================ USERS & RBAC ============================ */
  function users() {
    const pages = [["dashboard","Dashboard"],["products","Products"],["inbound","Inbound"],["orders","Orders"],["picking","Picking"],["packing","Packing"],["outbound","Outbound"],["users","Users"],["integrations","Integrations"]];
    const roles = Object.entries(DB.roles);
    set(`
      <div class="page-head"><div><h2>Users & Permissions</h2><p>Manage accounts and role-based access control (RBAC)</p></div>
        <div class="actions"><button class="btn btn--primary btn--sm" id="addUser">+ Add User</button></div></div>
      <div class="card" style="margin-bottom:18px">
        <div class="card__head"><h3>Team Members</h3><span class="sub">${DB.users.length} users</span></div>
        <div class="card__body"><div class="table-wrap"><table class="tbl">
          <thead><tr><th>User</th><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
          <tbody>${DB.users.map(u => `<tr>
            <td><div class="cell-prod"><div class="thumb" style="width:36px;height:36px;font-size:13px;font-weight:800;background:linear-gradient(135deg,#6366f1,#22d3ee);color:#fff">${u.name.split(" ").map(x=>x[0]).join("").slice(0,2)}</div><b>${esc(u.name)}</b></div></td>
            <td class="mono muted">${u.username}</td><td class="muted">${u.email}</td>
            <td>${badge(DB.roles[u.role].color, DB.roles[u.role].label)}</td>
            <td>${badge(u.status==="Active"?"b-green":"b-gray", u.status, true)}</td>
            <td class="right nowrap"><button class="btn btn--ghost btn--sm btn--icon" data-eu="${u.id}">✏️</button>
              <button class="btn btn--ghost btn--sm btn--icon" data-du="${u.id}">🗑️</button></td></tr>`).join("")}</tbody>
        </table></div></div>
      </div>
      <div class="card">
        <div class="card__head"><h3>Page Permissions Matrix</h3><span class="sub">Toggle read/write access per role</span></div>
        <div class="card__body"><div class="table-wrap"><table class="matrix">
          <thead><tr><th>Page</th>${roles.map(([k,r])=>`<th>${r.label}</th>`).join("")}</tr></thead>
          <tbody>${pages.map(([pid,plabel])=>`<tr><td>${plabel}</td>
            ${roles.map(([rk])=>{ const on = DB.access[rk].includes(pid);
              return `<td><label class="switch"><input type="checkbox" ${on?"checked":""} data-perm="${rk}:${pid}"/><span class="sl"></span></label></td>`; }).join("")}
          </tr>`).join("")}</tbody>
        </table></div></div>
      </div>`);
    $("#addUser").onclick = () => userDrawer();
    $$("[data-eu]").forEach(b => b.onclick = () => userDrawer(DB.users.find(u => u.id === b.dataset.eu)));
    $$("[data-du]").forEach(b => b.onclick = () => { const u = DB.users.find(x => x.id === b.dataset.du);
      openModal(confirmModal("🗑️","var(--red-bg)","Remove user?",`“${esc(u.name)}” will lose access immediately.`,"Remove","btn--danger",() => {
        DB.users = DB.users.filter(x => x.id !== u.id); closeOverlays(); users(); toast("User removed","ok"); })); });
    $$("[data-perm]").forEach(cb => cb.onchange = () => toast(`Permission updated: ${cb.dataset.perm.replace(":"," → ")} ${cb.checked?"enabled":"disabled"}`,"info"));
  }
  function userDrawer(u) {
    const edit = !!u; u = u || { name: "", email: "", username: "", role: "operator", status: "Active" };
    openDrawer(`<div class="drawer__head"><div><h3>${edit?"Edit":"New"} User</h3><p>${edit?esc(u.email):"Create an account & assign role"}</p></div><button class="x-btn" id="uc">✕</button></div>
      <div class="drawer__body"><div class="form-grid">
        <div class="field"><label>Full name</label><input class="input" value="${esc(u.name)}" placeholder="Jane Doe"/></div>
        <div class="form-grid cols-2">
          <div class="field"><label>Username</label><input class="input mono" value="${esc(u.username)}" placeholder="janed"/></div>
          <div class="field"><label>Status</label><select class="select" style="width:100%"><option ${u.status==="Active"?"selected":""}>Active</option><option ${u.status==="Inactive"?"selected":""}>Inactive</option></select></div>
        </div>
        <div class="field"><label>Email</label><input class="input" value="${esc(u.email)}" placeholder="jane@wms.io"/></div>
        <div class="field"><label>Password</label><input class="input" type="password" value="demo1234"/></div>
        <div class="field"><label>Assigned role</label><select class="select" style="width:100%">${Object.entries(DB.roles).map(([k,r])=>`<option ${u.role===k?"selected":""}>${r.label}</option>`).join("")}</select></div>
      </div></div>
      <div class="drawer__foot"><button class="btn btn--ghost" id="ucc">Cancel</button><button class="btn btn--primary" id="us">${edit?"Save":"Create user"}</button></div>`);
    $("#uc").onclick = $("#ucc").onclick = closeOverlays;
    $("#us").onclick = () => { closeOverlays(); toast(edit?"User updated":"User created & invite sent","ok"); };
  }

  /* ============================ INTEGRATIONS ============================ */
  function integrations() {
    set(`
      <div class="page-head"><div><h2>Channel Integrations</h2><p>Connect marketplaces, sync orders, inventory & status in real time</p></div></div>
      <div class="grid g-3" style="margin-bottom:18px">
        ${DB.integrations.map(c => `
          <div class="integ">
            <div class="top"><div class="logo" style="background:${c.color}">${c.abbr}</div>
              <div><b>${c.name}</b><br><span>${badge(c.status==="Connected"?"b-green":"b-amber", c.status, true)}</span></div>
              <div style="margin-left:auto"><label class="switch"><input type="checkbox" ${c.status==="Connected"?"checked":""} data-conn="${c.id}"/><span class="sl"></span></label></div>
            </div>
            <div class="stat"><div class="s"><b>${c.orders}</b><span>Orders synced (24h)</span></div>
              <div class="s"><b>${c.webhooks}</b><span>Webhooks received</span></div></div>
            <div class="row-between" style="font-size:12.5px;padding:8px 0;border-top:1px solid var(--line-2)">
              <span class="muted">Last sync</span><b>${c.synced}</b></div>
            <div class="row-between" style="font-size:12.5px;padding:8px 0;border-top:1px solid var(--line-2)">
              <span class="muted">Sync interval</span><b>every ${c.interval} min</b></div>
            <div class="row-between" style="font-size:12.5px;padding:8px 0;border-top:1px solid var(--line-2)">
              <span class="muted">Errors (24h)</span><b style="color:${c.errors?"var(--red)":"var(--green)"}">${c.errors}</b></div>
            <button class="btn ${c.status==="Connected"?"btn--ghost":"btn--primary"} btn--block btn--sm mt-18" data-cfg="${c.id}">
              ${c.status==="Connected"?"Manage connection":"Reconnect via OAuth"}</button>
          </div>`).join("")}
      </div>
      <div class="grid g-2">
        <div class="card"><div class="card__head"><h3>Sync Configuration</h3></div><div class="card__body">
          <div class="order-meta">
            <div class="m"><span>Order sync</span><b>Webhooks + poll every 2 min</b></div>
            <div class="m"><span>Inventory sync</span><b style="color:var(--green)">Auto-deduct on order create</b></div>
            <div class="m"><span>Status sync</span><b>Push tracking on dispatch</b></div>
            <div class="m"><span>Oversell protection</span><b>${badge("b-green","Multi-channel lock ON", true)}</b></div>
            <div class="m"><span>OAuth tokens</span><b class="mono">3 active · auto-refresh</b></div>
          </div>
        </div></div>
        <div class="card"><div class="card__head"><h3>Webhook & Error Logs</h3><div class="live"><span class="pulse"></span> streaming</div></div>
          <div class="card__body"><div class="table-wrap"><table class="tbl">
            <thead><tr><th>Time</th><th>Channel</th><th>Event</th><th>Status</th><th class="right">Latency</th></tr></thead>
            <tbody>${DB.webhookLogs.map(l => `<tr>
              <td class="mono muted">${l.time}</td><td>${chanTag(l.channel)}</td><td class="mono">${l.event}</td>
              <td>${badge(l.status.startsWith("2")?"b-green":l.status.includes("Retry")?"b-amber":"b-red", l.status)}</td>
              <td class="right mono ${l.ms>500?"":""}" style="color:${l.ms>500?"var(--red)":"var(--muted)"}">${l.ms}ms</td></tr>`).join("")}</tbody>
          </table></div></div>
        </div>
      </div>`);
    $$("[data-conn]").forEach(c => c.onchange = () => toast(`${DB.integrations.find(x=>x.id===c.dataset.conn).name} ${c.checked?"connected":"disconnected"}`, c.checked?"ok":"info"));
    $$("[data-cfg]").forEach(b => b.onclick = () => toast(`Opening OAuth config for ${DB.integrations.find(x=>x.id===b.dataset.cfg).name}`, "info"));
  }

  W.registerViews({ inbound, returns, orders, picking, packing, outbound, users, integrations });
})();
