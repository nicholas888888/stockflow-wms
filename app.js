/* =========================================================
   StockFlow WMS — SPA (vanilla JS, no build)
   ========================================================= */
(function () {
  "use strict";
  const DB = window.DB;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // Indonesian Rupiah: "Rp" prefix, thousands grouping with ".", no decimals.
  const money = (n) => "Rp" + Number(n || 0).toLocaleString("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const state = { user: null, route: "dashboard" };

  /* ---------- Audio feedback (Web Audio) ---------- */
  let audioCtx;
  function beep(type) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.connect(g); g.connect(audioCtx.destination);
      const now = audioCtx.currentTime;
      if (type === "ok") { o.frequency.value = 1180; o.type = "sine"; }
      else if (type === "err") { o.frequency.value = 180; o.type = "square"; }
      else { o.frequency.value = 660; o.type = "triangle"; }
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.25, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + (type === "err" ? 0.32 : 0.16));
      o.start(now); o.stop(now + (type === "err" ? 0.33 : 0.18));
      if (type === "err") { // double low buzz
        const o2 = audioCtx.createOscillator(), g2 = audioCtx.createGain();
        o2.connect(g2); g2.connect(audioCtx.destination); o2.type = "square"; o2.frequency.value = 150;
        g2.gain.setValueAtTime(0.0001, now + 0.16); g2.gain.exponentialRampToValueAtTime(0.2, now + 0.18);
        g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.34); o2.start(now + 0.16); o2.stop(now + 0.35);
      }
    } catch (e) {}
  }

  /* ---------- Toast ---------- */
  function toast(msg, kind = "info") {
    const el = document.createElement("div");
    el.className = "toast " + kind;
    const icons = {
      ok: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
      err: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
      info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    };
    el.innerHTML = (icons[kind] || icons.info) + "<span>" + msg + "</span>";
    $("#toasts").appendChild(el);
    setTimeout(() => { el.style.transition = ".3s"; el.style.opacity = "0"; el.style.transform = "translateX(40px)"; setTimeout(() => el.remove(), 300); }, 2600);
  }

  /* ---------- Drawer & Modal ---------- */
  function openDrawer(html) {
    $("#drawer").innerHTML = html;
    $("#drawer").classList.add("show"); $("#overlay").classList.add("show");
  }
  function closeOverlays() {
    $("#drawer").classList.remove("show"); $("#modal").classList.remove("show"); $("#overlay").classList.remove("show");
  }
  function openModal(html) { $("#modal").innerHTML = html; $("#modal").classList.add("show"); $("#overlay").classList.add("show"); }
  $("#overlay").addEventListener("click", closeOverlays);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeOverlays(); });

  /* ---------- Icons ---------- */
  const ICONS = {
    dashboard: '<path d="M3 3h7v9H3z"/><path d="M14 3h7v5h-7z"/><path d="M14 12h7v9h-7z"/><path d="M3 16h7v5H3z"/>',
    products: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
    categories: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    inbound: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="7.5 4.21 12 6.81 16.5 4.21"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22" x2="12" y2="12"/>',
    returns: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
    orders: '<path d="M9 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-6-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    picking: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 2v4"/><path d="M16 2v4"/><path d="M8 14l2 2 4-4"/>',
    packing: '<path d="M12.89 1.45l8 4A2 2 0 0 1 22 7.24v9.53a2 2 0 0 1-1.11 1.79l-8 4a2 2 0 0 1-1.79 0l-8-4a2 2 0 0 1-1.1-1.8V7.24a2 2 0 0 1 1.11-1.79l8-4a2 2 0 0 1 1.78 0z"/><polyline points="2.32 6.16 12 11 21.68 6.16"/><line x1="12" y1="22.76" x2="12" y2="11"/>',
    outbound: '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    integrations: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  };
  const icon = (n, size = 18) => `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ""}</svg>`;

  const NAV = [
    { group: "Overview", items: [{ id: "dashboard", label: "Dashboard" }] },
    { group: "Inventory", items: [
      { id: "products", label: "Products" },
      { id: "categories", label: "Categories & Brands" },
    ]},
    { group: "Inbound", items: [
      { id: "inbound", label: "Receiving (PO)" },
      { id: "returns", label: "Customer Returns" },
    ]},
    { group: "Fulfillment", items: [
      { id: "orders", label: "Orders", count: () => DB.pipelineCounts().total },
      { id: "picking", label: "Picking", count: () => DB.pipelineCounts()["Waiting Picking"] },
      { id: "packing", label: "Packing", count: () => DB.pipelineCounts()["Waiting Packing"] },
      { id: "outbound", label: "Outbound", count: () => DB.pipelineCounts()["Waiting Outbound"] },
    ]},
    { group: "Administration", items: [
      { id: "users", label: "Users & RBAC" },
      { id: "integrations", label: "Integrations" },
    ]},
  ];
  const PAGE_TITLES = {
    dashboard: ["Overview", "Dashboard"], products: ["Inventory", "Product Catalog"],
    categories: ["Inventory", "Categories & Brands"], inbound: ["Inbound", "Stock Receiving"],
    returns: ["Inbound", "Customer Returns"], orders: ["Fulfillment", "Order Management"],
    picking: ["Fulfillment", "Barcode Picking"], packing: ["Fulfillment", "Barcode Packing"],
    outbound: ["Fulfillment", "Outbound & Handover"], users: ["Administration", "Users & Permissions"],
    integrations: ["Administration", "Channel Integrations"],
  };

  /* ---------- Auth ---------- */
  const loginAttempts = { count: 0, lockUntil: 0 };
  function initLogin() {
    $("#togglePass").addEventListener("click", () => {
      const p = $("#loginPass"); p.type = p.type === "password" ? "text" : "password";
    });
    $$(".roles-hint .r").forEach(r => r.addEventListener("click", () => {
      $("#loginUser").value = r.dataset.user; $("#loginPass").value = "demo1234";
    }));
    $("#forgot").addEventListener("click", e => { e.preventDefault(); toast("Password reset link sent to your email", "info"); });
    $("#loginForm").addEventListener("submit", e => {
      e.preventDefault();
      const alert = $("#loginAlert"), txt = $("#loginAlertText");

      // --- API-backed login when a backend is configured ---
      if (window.WMS_API && window.WMS_API.enabled) {
        alert.classList.remove("show");
        window.WMS_API.login($("#loginUser").value.trim(), $("#loginPass").value)
          .then(({ token, user }) => {
            window.WMS_API.setToken(token);
            // Hydrate the local role maps from the server's response set is already
            // in DB (same shape); sign in with the returned user.
            signIn(user);
          })
          .catch(err => {
            const d = err.details || {};
            txt.textContent =
              err.status === 429 ? (d.retryInMinutes ? `Locked for ${d.retryInMinutes} min.` : "Too many attempts. Locked for 15 minutes.")
              : err.status === 403 ? "This account is inactive. Contact an administrator."
              : d.attemptsRemaining != null ? `Invalid credentials. ${d.attemptsRemaining} attempt${d.attemptsRemaining === 1 ? "" : "s"} remaining before lockout.`
              : (err.message || "Login failed");
            alert.classList.add("show"); beep("err");
          });
        return;
      }

      const now = Date.now();
      if (now < loginAttempts.lockUntil) {
        const mins = Math.ceil((loginAttempts.lockUntil - now) / 60000);
        txt.textContent = `Account temporarily locked. Try again in ${mins} min.`; alert.classList.add("show"); return;
      }
      const u = $("#loginUser").value.trim().toLowerCase(), p = $("#loginPass").value;
      const found = DB.users.find(x => x.username === u || x.email.toLowerCase() === u);
      if (!found || p !== "demo1234") {
        loginAttempts.count++;
        const left = 5 - loginAttempts.count;
        if (loginAttempts.count >= 5) {
          loginAttempts.lockUntil = now + 15 * 60000; loginAttempts.count = 0;
          txt.textContent = "Too many failed attempts. Locked for 15 minutes.";
        } else {
          txt.textContent = `Invalid credentials. ${left} attempt${left === 1 ? "" : "s"} remaining before lockout.`;
        }
        alert.classList.add("show"); beep("err"); return;
      }
      if (found.status !== "Active") { txt.textContent = "This account is inactive. Contact an administrator."; alert.classList.add("show"); return; }
      loginAttempts.count = 0; alert.classList.remove("show");
      signIn(found);
    });
  }

  async function signIn(user) {
    state.user = user;
    $("#authView").style.display = "none";
    $("#appView").classList.add("show");
    // In API mode, pull live data into DB before first render, and open the live stream.
    if (window.WMS_SYNC && window.WMS_SYNC.apiMode) {
      try { await window.WMS_SYNC.hydrateAll(); } catch (e) {}
      connectLiveStream();
    }
    renderNav();
    renderSidebarUser();
    // role-based redirect
    go(DB.roles[user.role].home);
    toast(`Signed in as ${user.name} · ${DB.roles[user.role].label}`, "ok");
  }

  let liveSocket = null;
  function connectLiveStream() {
    if (!window.WMS_API || !window.WMS_API.enabled || liveSocket) return;
    liveSocket = window.WMS_API.connectLive((evt) => {
      // push server activity into the dashboard feed + refresh pipeline counts
      if (evt && evt.text) {
        DB.activity = DB.activity || [];
        DB.activity.unshift({ id: "live-" + Date.now(), icon: evt.icon || "🔔", color: evt.color || "b-blue", text: evt.text, ts: evt.ts || Date.now() });
        DB.activity = DB.activity.slice(0, 20);
        if (state.route === "dashboard") VIEWS.dashboard();
      }
      if (evt && evt.type === "pipeline") renderNav();
    });
  }
  function signOut() {
    state.user = null;
    $("#appView").classList.remove("show");
    $("#authView").style.display = "grid";
  }

  /* ---------- Sidebar ---------- */
  function renderNav() {
    const allowed = DB.access[state.user.role];
    $("#nav").innerHTML = NAV.map(g => {
      const items = g.items.map(it => {
        const locked = !allowed.includes(it.id);
        const cnt = it.count && !locked ? `<span class="cnt">${it.count()}</span>` : "";
        const lockIco = locked ? `<span class="lock">${icon("lock", 14)}</span>` : "";
        return `<button class="nav__item ${state.route === it.id ? "active" : ""} ${locked ? "locked" : ""}" data-route="${it.id}" ${locked ? "disabled" : ""}>
          ${icon(it.id)}<span>${it.label}</span>${cnt}${lockIco}</button>`;
      }).join("");
      return `<div class="nav__group"><div class="lbl">${g.group}</div>${items}</div>`;
    }).join("");
    $$("#nav .nav__item:not(.locked)").forEach(b => b.addEventListener("click", () => { go(b.dataset.route); $("#sidebar").classList.remove("open"); }));
  }
  function renderSidebarUser() {
    const u = state.user, initials = u.name.split(" ").map(x => x[0]).join("").slice(0, 2);
    $("#sidebarUser").innerHTML = `
      <div class="av">${initials}</div>
      <div class="meta"><b>${esc(u.name)}</b><span>${DB.roles[u.role].label}</span></div>
      <button class="out" id="logoutBtn" title="Sign out">${icon("logout", 18)}</button>`;
    $("#logoutBtn").addEventListener("click", signOut);
  }

  $("#burger").addEventListener("click", () => $("#sidebar").classList.toggle("open"));

  /* ---------- Router ---------- */
  function go(route) {
    if (!DB.access[state.user.role].includes(route)) { toast("You don't have access to that page", "err"); return; }
    state.route = route;
    const [crumb, title] = PAGE_TITLES[route];
    $("#crumb").textContent = crumb; $("#topTitle").textContent = title;
    $$("#nav .nav__item").forEach(b => b.classList.toggle("active", b.dataset.route === route));
    $("#content").scrollTop = 0;
    (VIEWS[route] || VIEWS.dashboard)();
    window.scrollTo(0, 0);
  }

  function confirmModal(ic, bg, title, body, actionLabel, actionClass, onConfirm) {
    const id = "cm" + Math.random().toString(36).slice(2);
    setTimeout(() => {
      const btn = document.getElementById(id);
      if (btn) btn.onclick = onConfirm;
      const cancel = document.getElementById(id + "c");
      if (cancel) cancel.onclick = closeOverlays;
    }, 0);
    return `<div class="modal__body"><div class="modal__ic" style="background:${bg};font-size:26px">${ic}</div>
      <h3>${title}</h3><p>${body}</p></div>
      <div class="modal__foot"><button class="btn btn--ghost" id="${id}c">Cancel</button>
      <button class="btn ${actionClass}" id="${id}">${actionLabel}</button></div>`;
  }

  /* ---------- Theme (explicit Light / Night option) ---------- */
  function applyTheme(theme) {
    const dark = theme === "dark";
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    try { localStorage.setItem("wms_theme", dark ? "dark" : "light"); } catch (e) {}
    // highlight the active option in every Light/Night segmented control
    $$(".theme-seg [data-theme-choice]").forEach(b =>
      b.classList.toggle("active", b.dataset.themeChoice === (dark ? "dark" : "light")));
    // redraw canvas charts so they re-read theme colors
    if (state.user && state.route === "dashboard" && VIEWS.dashboard) VIEWS.dashboard();
  }
  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem("wms_theme"); } catch (e) {}
    if (!saved && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) saved = "dark";
    applyTheme(saved || "light");
    $$(".theme-seg [data-theme-choice]").forEach(b =>
      b.addEventListener("click", () => applyTheme(b.dataset.themeChoice)));
  }

  // expose for view modules
  window.__WMS = { DB, $, $$, esc, money, icon, toast, beep, openDrawer, closeOverlays, openModal, confirmModal, state, go, renderNav };

  /* ---------- Views registry (filled in views.js sections below) ---------- */
  const VIEWS = {};
  window.__WMS.VIEWS = VIEWS;

  /* ---------- boot ---------- */
  initLogin();
  initTheme();
  // Views are attached in app.views.js (loaded via same file below)
  window.__WMS.registerViews = (v) => Object.assign(VIEWS, v);
})();
