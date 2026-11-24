/**
 * Merchant Dashboard UI. Talks only to window.PG_API.
 */
(function () {
  const api = window.PG_API;
  const charts = window.PG_CHARTS;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const PROFILE_PICTURE_MAX_BYTES = 1024 * 1024;
  let profilePictureData = null;

  /* ================================================================ format */
  const TZ = "Asia/Dhaka";
  const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const nf2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = (minor, decimals = false) => "৳ " + (decimals ? nf2 : nf0).format(minor / 100);
  const moneyTight = (minor) => "৳" + nf0.format(minor / 100);
  const dtDate = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric", year: "numeric" });
  const dtTime = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
  const dateTime = (iso) => `${dtDate.format(new Date(iso))} • ${dtTime.format(new Date(iso))}`;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const icon = (id) => `<svg aria-hidden="true"><use href="#${id}"/></svg>`;
  const STATUS_LABEL = { success: "Success", failed: "Failed", pending: "Pending", processing: "Processing", refunded: "Refunded", partially_refunded: "Partly refunded", cancelled: "Cancelled" };

  function timeAgo(iso) {
    const s = Math.max(0, (window.PG_NOW() - new Date(iso)) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + " min ago";
    if (s < 86400) return Math.floor(s / 3600) + " h ago";
    const d = Math.floor(s / 86400);
    return d === 1 ? "yesterday" : d < 30 ? d + " days ago" : dtDate.format(new Date(iso));
  }

  /* ================================================================ brand marks
     Simple stand-in marks. Swap for official assets via payment_providers.logo_url. */
  const LOGOS = {
    bkash: `<svg viewBox="0 0 24 24"><path fill="#E2136E" d="M2.5 4.5 12 11 8 21.5z"/><path fill="#B80E58" d="M12 11 21.5 3 18 16z"/><path fill="#F25A97" d="M12 11l6 5-10 5.5z"/></svg>`,
    nagad: `<svg viewBox="0 0 24 24"><circle cx="12" cy="13.2" r="8.6" fill="#F26522"/><path d="M12 8a5.2 5.2 0 1 0 5.2 5.2" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round"/><path d="M12 11a2.2 2.2 0 1 0 2.2 2.2" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round"/><path d="M8.3 3.6c2.4-1.6 5.3-1.4 7.4.6" stroke="#ED1C24" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`,
    rocket: `<svg viewBox="0 0 24 24"><path fill="#8C3494" d="M2 19 6.4 7h3.1L5.1 19zM8 19l4.4-12h3.1L11.1 19z"/><path fill="#5B2C83" d="M14 19l4.4-12h3.1L17.1 19z"/><path fill="#F7941D" d="M18.4 7 22 3.5l-.5 3.5z"/></svg>`,
    card: `<svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="3.5" fill="#2B5CF6"/><rect x="2" y="8.5" width="20" height="2.6" fill="#0B1433" opacity=".55"/><rect x="5" y="14" width="6" height="2" rx="1" fill="#fff"/><circle cx="17.5" cy="15" r="1.6" fill="#93C5FD"/></svg>`,
    upay: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="#FFC20E"/><path d="M8 8v4.5a4 4 0 0 0 8 0V8" fill="none" stroke="#0A3D91" stroke-width="2.6" stroke-linecap="round"/></svg>`,
    bank: `<svg viewBox="0 0 24 24"><path fill="#0F766E" d="M12 2.5 21.5 7.5v1.5h-19V7.5z"/><path fill="#14B8A6" d="M4.5 10.5h2.5v7H4.5zm6.25 0h2.5v7h-2.5zm6.25 0h2.5v7H17z"/><rect x="2.5" y="18.5" width="19" height="2.5" rx="1" fill="#0F766E"/></svg>`,
    visa: `<svg viewBox="0 0 48 16"><text x="24" y="14" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-style="italic" font-size="16" fill="#1A1F71" letter-spacing="-.5">VISA</text></svg>`,
    mastercard: `<svg viewBox="0 0 24 24"><circle cx="9" cy="12" r="6" fill="#EB001B"/><circle cx="15" cy="12" r="6" fill="#F79E1B" fill-opacity=".9"/><path d="M12 6.8a6 6 0 0 1 0 10.4 6 6 0 0 1 0-10.4z" fill="#FF5F00"/></svg>`,
  };
  const ORIGINAL_LOGOS = {
    bkash: "assets/images/payment-providers/bkash.jpg",
    nagad: "assets/images/payment-providers/nagad.png",
    rocket: "assets/images/payment-providers/rocket.png",
    upay: "assets/images/payment-providers/upay.jpg",
  };
  function logoMark(code, className = "") {
    const src = ORIGINAL_LOGOS[code];
    if (src) return `<img class="brand-logo brand-logo--${esc(code)} ${esc(className)}" src="${src}" alt="" loading="lazy" decoding="async">`;
    return LOGOS[code] || "";
  }

  /* ================================================================ toast */
  function toast(msg, type = "ok") {
    const t = document.createElement("div");
    t.className = "toast" + (type === "error" ? " is-error" : "");
    t.innerHTML = icon(type === "error" ? "i-alert" : "i-check") + `<span>${esc(msg)}</span>`;
    $("#toasts").appendChild(t);
    setTimeout(() => { t.classList.add("is-leaving"); setTimeout(() => t.remove(), 220); }, 3200);
  }

  async function copyText(text, label = "Copied to clipboard") {
    try { await navigator.clipboard.writeText(text); toast(label); }
    catch { toast("Couldn't copy. Please copy it manually.", "error"); }
  }

  function animateNumber(node, to, fmt, ms = 700) {
    if (reduceMotion) { node.textContent = fmt(to); return; }
    const from = 0, t0 = performance.now();
    const step = (t) => {
      const p = Math.max(0, Math.min(1, (t - t0) / ms));
      const e = 1 - Math.pow(1 - p, 3);
      node.textContent = fmt(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    setTimeout(() => { node.textContent = fmt(to); }, ms + 150); // in case rAF is throttled (background tab)
  }

  /* ================================================================ popovers (dropdowns, menus) */
  let openPop = null; // { trigger, panel, onClose }
  function closePop() {
    if (!openPop) return;
    openPop.panel.hidden = true;
    openPop.trigger.setAttribute("aria-expanded", "false");
    const p = openPop; openPop = null;
    p.onClose && p.onClose();
  }
  function togglePop(trigger, panel, onOpen) {
    if (openPop && openPop.panel === panel) return closePop();
    closePop();
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    openPop = { trigger, panel };
    onOpen && onOpen();
    const first = panel.querySelector(".is-selected, .menu__item:not([aria-disabled='true'])");
    first && first.setAttribute("tabindex", "-1");
  }
  document.addEventListener("click", (e) => {
    if (!openPop) return;
    if (openPop.panel.contains(e.target) || openPop.trigger.contains(e.target)) return;
    closePop();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!$("#modal").hidden) return closeModal();
      if (openPop) { const t = openPop.trigger; closePop(); t.focus(); return; }
      if ($("#sidebar").classList.contains("is-open")) closeDrawer();
    }
    // arrow navigation inside an open menu
    if (openPop && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      const items = $$(".menu__item:not([aria-disabled='true'])", openPop.panel);
      if (!items.length) return;
      e.preventDefault();
      items.forEach((i) => i.tabIndex = -1);
      const idx = items.indexOf(document.activeElement);
      const next = items[(idx + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
      next.focus();
    }
    if (openPop && e.key === "Enter" && document.activeElement && document.activeElement.matches("li.menu__item")) {
      e.preventDefault(); document.activeElement.click();
    }
  });

  function selectInMenu(menu, item) {
    $$(".menu__item", menu).forEach((li) => { li.classList.toggle("is-selected", li === item); li.setAttribute("aria-selected", li === item ? "true" : "false"); });
  }

  /* ================================================================ drawer nav */
  const sidebar = $("#sidebar"), scrim = $("#scrim"), menuBtn = $("#menuBtn");
  function openDrawer() { sidebar.classList.add("is-open"); scrim.hidden = false; menuBtn.setAttribute("aria-expanded", "true"); document.body.style.overflow = "hidden"; $("#sidebarClose").focus(); }
  function closeDrawer() { sidebar.classList.remove("is-open"); scrim.hidden = true; menuBtn.setAttribute("aria-expanded", "false"); document.body.style.overflow = ""; }
  menuBtn.addEventListener("click", openDrawer);
  $("#sidebarClose").addEventListener("click", () => { closeDrawer(); menuBtn.focus(); });
  scrim.addEventListener("click", closeDrawer);
  window.matchMedia("(min-width: 1101px)").addEventListener("change", (e) => e.matches && closeDrawer());

  /* ================================================================ routing */
  const SECTIONS = {
    dashboard: null,
    transactions: { title: "Transactions", sub: "Every payment that came through your gateways." },
    refunds: { title: "Refund Management", sub: "Initiate refunds, review refund reasons, and track their status." },
    reconciliation: { title: "Reconciliation Center", sub: "Compare provider statements with your internal transaction records." },
    "payment-links": { title: "Payment Links", sub: "Share a link and get paid without a website." },
    analytics: { title: "Analytics", sub: "Explore revenue trends and your payment method mix." },
    payouts: { title: "Payouts", sub: "Track withdrawals and manage where funds are sent." },
    "payment-methods": { title: "Payment Management", sub: "Connect providers and manage your payment options." },
    profile: { title: "Business Profile", sub: "Manage your business details and merchant contact information." },
    settings: { title: "Settings", sub: "Manage company, payment accounts, team access, notifications and security." },
    support: { title: "Support", sub: "Get help from our team and track your requests." },
  };

  function route() {
    const key = (location.hash.slice(1) || "dashboard");
    const name = key in SECTIONS ? key : "dashboard";
    $$(".nav__item").forEach((a) => a.classList.toggle("is-active", a.dataset.nav === name));
    $$(".nav__item").forEach((a) => a.dataset.nav === name ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
    const viewName = name;
    $$(".view").forEach((v) => v.classList.toggle("is-active", v.dataset.view === viewName));
    $("#rangeDropdown").hidden = name !== "dashboard";

    if (name === "dashboard") {
      $("#pageTitle").innerHTML = `Welcome back, <span id="firstName">${esc(state.firstName)}</span>! <span class="wave" aria-hidden="true">👋</span>`;
      $("#pageSubtitle").textContent = "Here's what's happening with your payments today.";
    } else {
      const s = SECTIONS[name];
      $("#pageTitle").textContent = s.title;
      $("#pageSubtitle").textContent = s.sub;
      if (name === "transactions") loadAllTransactions();
      if (name === "refunds") loadRefundManagement();
      if (name === "reconciliation") loadReconciliationRecords();
      if (name === "payment-links") loadPaymentLinks();
      if (name === "analytics") loadAnalytics();
      if (name === "payouts") loadPayoutPage();
      if (name === "payment-methods") loadPaymentManagement();
      if (name === "profile") loadProfile();
      if (name === "settings") loadSettings();
      if (name === "support") loadSupportTickets();
    }
    document.title = (name === "dashboard" ? "Merchant Dashboard" : SECTIONS[name].title) + " · Purpose Gateway";
    syncTransactionPolling();
    syncRefundPolling();
    closeDrawer();
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  document.addEventListener("click", (e) => {
    const nav = e.target.closest("[data-nav]");
    if (!nav) return;
    e.preventDefault();
    closePop();
    if (!$("#modal").hidden) closeModal();
    const target = "#" + nav.dataset.nav;
    if (location.hash === target || (!location.hash && target === "#dashboard")) route();
    else location.hash = target;
  });
  window.addEventListener("hashchange", route);

  /* ================================================================ state */
  const state = {
    firstName: "Imran",
    range: "last_30_days",
    period: "this_month",
    hideBalance: false,
    balance: null,
    tx: { search: "", status: "all", page: 1, page_size: 10, total: 0 },
    analyticsPeriod: "this_month",
    merchant: null,
    user: null,
  };
  try { state.hideBalance = localStorage.getItem("pg.hideBalance") === "1"; } catch {}

  /* ================================================================ session / profile */
  function initials(name) {
    return String(name || "Merchant").trim().split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "M";
  }

  function profilePictureKey(user) {
    return `pg.profilePicture.${encodeURIComponent(user.id || user.email || "current")}`;
  }

  function renderProfilePicture() {
    const name = state.user && state.user.full_name;
    ["#profileAvatar", "#profilePicturePreview"].forEach((selector) => {
      const avatar = $(selector);
      if (!avatar) return;
      avatar.replaceChildren();
      if (profilePictureData) {
        const image = document.createElement("img");
        image.src = profilePictureData;
        image.alt = "";
        image.decoding = "async";
        avatar.appendChild(image);
      } else {
        avatar.textContent = initials(name);
      }
    });
  }

  function loadProfilePicture(user) {
    try {
      const stored = localStorage.getItem(profilePictureKey(user));
      profilePictureData = stored && /^data:image\/(?:jpeg|png|webp);base64,/i.test(stored) && stored.length <= 1_500_000 ? stored : null;
    } catch (err) {
      console.error(err);
      profilePictureData = null;
      toast("Couldn't load your saved profile picture.", "error");
    }
  }

  async function loadSession() {
    const { merchant, user } = await api.getSession();
    state.merchant = merchant;
    state.user = user;
    state.firstName = user.full_name.split(" ")[0];
    $("#profileName").textContent = user.full_name;
    $("#profileRole").textContent = user.display_title;
    loadProfilePicture(user);
    renderProfilePicture();
    const fn = $("#firstName"); if (fn) fn.textContent = state.firstName;
  }
  $("#profileBtn").addEventListener("click", () => togglePop($("#profileBtn"), $("#profileMenu")));

  /* ================================================================ KPIs */
  const KPI_DEF = [
    { key: "revenue", label: "Total Revenue", tone: "blue", icon: "i-wallet", color: "#2b5cf6", value: (s) => s.total_revenue_minor, fmt: (v) => moneyTight(v).replace("৳", "৳ "), delta: (s) => s.revenue_change_pct, higherIsBetter: true },
    { key: "success_rate", label: "Success Rate", tone: "green", icon: "i-check", color: "#22c55e", value: (s) => s.success_rate_pct, fmt: (v) => v.toFixed(1) + "%", delta: (s) => s.success_rate_change_pct, higherIsBetter: true },
    { key: "transactions", label: "Total Transactions", tone: "purple", icon: "i-swap", color: "#8b5cf6", value: (s) => s.total_transactions, fmt: (v) => nf0.format(v), delta: (s) => s.transactions_change_pct, higherIsBetter: true },
    { key: "failed", label: "Failed Payments", tone: "red", icon: "i-alert", color: "#f05252", value: (s) => s.failed_payments, fmt: (v) => nf0.format(v), delta: (s) => s.failed_change_pct, higherIsBetter: false },
  ];

  async function loadKpis() {
    const s = await api.getDashboardSummary(state.range);
    const grid = $("#kpiGrid");
    grid.innerHTML = KPI_DEF.map((k) => {
      const d = k.delta(s);
      const good = k.higherIsBetter ? d >= 0 : d <= 0;
      return `
        <article class="card kpi kpi--${k.tone}">
          <div class="kpi__icon"><span>${icon(k.icon)}</span></div>
          <div class="kpi__body">
            <h3 class="kpi__label">${k.label}</h3>
            <p class="kpi__value" data-kpi="${k.key}">${k.fmt(0)}</p>
            <p class="kpi__delta ${good ? "is-good" : "is-bad"}" aria-label="${d >= 0 ? "Up" : "Down"} ${Math.abs(d)} percent versus previous period">
              ${icon(d >= 0 ? "i-arrow-up" : "i-arrow-down")}${Math.abs(d).toFixed(1)}%
            </p>
          </div>
          <svg class="kpi__spark" data-spark="${k.key}" aria-hidden="true"></svg>
        </article>`;
    }).join("");
    KPI_DEF.forEach((k) => {
      animateNumber($(`[data-kpi="${k.key}"]`, grid), k.value(s), k.fmt);
      charts.sparkline($(`[data-spark="${k.key}"]`, grid), s.sparklines[k.key], k.color);
    });
  }

  $("#rangeBtn").addEventListener("click", () => togglePop($("#rangeBtn"), $("#rangeMenu")));
  $("#rangeMenu").addEventListener("click", (e) => {
    const li = e.target.closest("[data-range]"); if (!li) return;
    state.range = li.dataset.range;
    $("#rangeLabel").textContent = li.textContent;
    selectInMenu($("#rangeMenu"), li);
    closePop();
    $("#rangeBtn").focus();
    loadKpis();
  });

  /* ================================================================ revenue chart */
  let revenueChart = null;
  const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const longDate = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const monthShort = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
  const monthLong = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const COMPARE = { this_month: "vs last month", last_month: "vs prior month", this_year: "vs last year" };

  async function loadRevenue() {
    const r = await api.getRevenueSeries(state.period);
    animateNumber($("#revTotal"), r.total_minor, (v) => money(v));
    const chip = $("#revChange");
    const up = r.change_pct >= 0;
    chip.className = "chip " + (up ? "chip--up" : "chip--down");
    chip.innerHTML = `${icon(up ? "i-arrow-up" : "i-arrow-down")}<b>${Math.abs(r.change_pct).toFixed(1)}%</b> <span>${COMPARE[r.period]}</span>`;

    const points = r.points.map((p) => {
      const d = new Date(p.date.length === 7 ? p.date + "-01T00:00:00Z" : p.date + "T00:00:00Z");
      return r.granularity === "month"
        ? { label: monthShort.format(d), full: monthLong.format(d), value: p.value_minor }
        : { label: shortDate.format(d), full: longDate.format(d), value: p.value_minor };
    });
    const opts = {
      points,
      formatValue: (v) => moneyTight(v),
      formatTick: (v) => { const t = v / 100; return t >= 1e6 ? +(t / 1e6).toFixed(1) + "M" : t >= 1000 ? +(t / 1000).toFixed(1) + "k" : t === 0 ? "0k" : String(t); },
      defaultIndex: Math.round((points.length - 1) * 0.75),
      ariaLabel: `Revenue ${$("#periodLabel").textContent}: total ${money(r.total_minor)}. Use left and right arrow keys to inspect each ${r.granularity}.`,
    };
    if (!revenueChart) { revenueChart = charts.areaChart($("#revenueChart"), opts); $("#revenueChart").setAttribute("aria-label", opts.ariaLabel); }
    else revenueChart.update(opts);
  }

  $("#periodBtn").addEventListener("click", () => togglePop($("#periodBtn"), $("#periodMenu")));
  $("#periodMenu").addEventListener("click", (e) => {
    const li = e.target.closest("[data-period]"); if (!li) return;
    state.period = li.dataset.period;
    $("#periodLabel").textContent = li.textContent;
    selectInMenu($("#periodMenu"), li);
    closePop();
    $("#periodBtn").focus();
    loadRevenue();
  });

  /* ================================================================ balance */
  function paintBalance() {
    const b = state.balance; if (!b) return;
    $("#balAmount").textContent = state.hideBalance ? "৳ ••••••" : money(b.available_minor, true);
    $("#balPending").textContent = state.hideBalance ? "" : b.pending_minor ? `${money(b.pending_minor, true)} pending settlement` : "";
    const t = $("#toggleBalance");
    t.setAttribute("aria-pressed", String(state.hideBalance));
    t.setAttribute("aria-label", state.hideBalance ? "Show balance" : "Hide balance");
    t.innerHTML = icon(state.hideBalance ? "i-eye-off" : "i-eye");
  }
  async function loadBalance() { state.balance = await api.getBalance(); paintBalance(); }
  $("#toggleBalance").addEventListener("click", () => {
    state.hideBalance = !state.hideBalance;
    try { localStorage.setItem("pg.hideBalance", state.hideBalance ? "1" : "0"); } catch {}
    paintBalance();
  });

  /* ================================================================ gateways */
  async function loadGateways() {
    const list = await api.getConnectedGateways();
    const SHOW = 4;
    const html = list.slice(0, SHOW).map((g) => `
      <li><button class="gw" data-gateway="${esc(g.code)}" title="${esc(g.name)} · ${g.status === "active" ? "Active" : "Pending activation"}">
        <span class="gw__logo">${g.logo_url ? `<img class="brand-logo" src="${esc(g.logo_url)}" alt="" loading="lazy" decoding="async">` : logoMark(g.code)}<span class="gw__status ${g.status === "active" ? "" : "is-warn"}"></span></span>
        ${esc(g.name)}
      </button></li>`).join("");
    const rest = list.slice(SHOW);
    $("#gwList").innerHTML = html + (rest.length
      ? `<li><button class="gw gw--more" data-gateway-more aria-label="${rest.length} more gateways: ${esc(rest.map((g) => g.name).join(", "))}">+${rest.length}</button></li>` : "");
    $("#gwList").onclick = (e) => {
      const b = e.target.closest("[data-gateway]");
      if (b) {
        const g = list.find((x) => x.code === b.dataset.gateway);
        openModal(`${g.name}`, `
          <div class="success-box" style="padding-top:0">
            <div class="success-box__icon" style="background:var(--surface-2)"><span class="gw__logo" style="width:40px;height:40px">${logoMark(g.code)}</span></div>
          </div>
          <dl class="kv">
            <dt>Status</dt><dd><span class="status status--${g.status === "active" ? "success" : "pending"}">${g.status === "active" ? "Active" : "Pending"}</span></dd>
            <dt>Method</dt><dd>${esc(g.method_code.replace("_", " "))}</dd>
            <dt>Environment</dt><dd>${esc(g.environment)}</dd>
            <dt>Connected</dt><dd>${g.connected_at ? dtDate.format(new Date(g.connected_at)) : "Not yet"}</dd>
          </dl>
          <button class="btn btn--ghost btn--block" data-close>Close</button>`);
        return;
      }
      if (e.target.closest("[data-gateway-more]")) {
        openModal("All connected gateways", `
          <ul class="gw-list" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-bottom:18px">
            ${list.map((g) => `<li><div class="gw"><span class="gw__logo">${g.logo_url ? `<img class="brand-logo" src="${esc(g.logo_url)}" alt="" loading="lazy" decoding="async">` : logoMark(g.code)}<span class="gw__status ${g.status === "active" ? "" : "is-warn"}"></span></span>${esc(g.name)}</div></li>`).join("")}
          </ul>
          <button class="btn btn--ghost btn--block" data-close>Close</button>`);
      }
    };
  }

  /* ================================================================ transactions */
  function methodCell(t) {
    const isVisa = t.provider_code === "visa";
    return `<span class="method"><span class="method__logo ${isVisa ? "method__logo--visa" : ""}">${logoMark(t.provider_code)}</span>${esc(t.provider_name)}</span>`;
  }
  function txRow(t) {
    return `<tr>
      <td class="td-id" data-col="id">#${esc(t.public_id)}</td>
      <td data-col="customer">${esc(t.customer_name)}</td>
      <td class="td-amount" data-col="amount">${moneyTight(t.amount_minor)}</td>
      <td data-col="method">${methodCell(t)}</td>
      <td data-col="status"><span class="status status--${esc(t.status)}">${STATUS_LABEL[t.status] || esc(t.status)}</span>${t.is_duplicate ? `<small class="duplicate-flag" title="${t.duplicate_of ? `Similar to ${esc(t.duplicate_of)}` : "Similar payment attempt detected"}">${icon("i-alert")}Possible duplicate</small>` : ""}</td>
      <td class="td-date" data-col="date">${dateTime(t.created_at)}</td>
      <td data-col="actions"><button class="icon-btn row-btn" data-row="${esc(t.public_id)}" data-status="${esc(t.status)}" aria-label="Actions for ${esc(t.public_id)}" aria-haspopup="menu" aria-expanded="false">${icon("i-dots")}</button></td>
    </tr>`;
  }
  async function loadRecent() {
    const { data } = await api.listTransactions({ page: 1, page_size: 4 });
    $("#recentTable tbody").innerHTML = data.map(txRow).join("") || `<tr><td class="table__empty" colspan="7">No transactions yet.</td></tr>`;
  }

  let txReq = 0;
  let txLoading = false;
  let txRefreshQueued = false;
  let txRefreshTimer = null;
  const TX_REFRESH_MS = 15000;

  function getTransactionFilters() {
    const minValue = $("#txAmountMin").value;
    const maxValue = $("#txAmountMax").value;
    return {
      date_from: $("#txDateFrom").value || undefined,
      date_to: $("#txDateTo").value || undefined,
      min_amount_minor: minValue === "" ? undefined : Math.round(Number(minValue) * 100),
      max_amount_minor: maxValue === "" ? undefined : Math.round(Number(maxValue) * 100),
      method: $("#txMethod").value,
      duplicates_only: $("#txDuplicatesOnly").checked,
    };
  }

  function validateTransactionFilters(filters) {
    if (filters.date_from && filters.date_to && filters.date_from > filters.date_to) return "Start date must be on or before end date.";
    if (filters.min_amount_minor != null && (!Number.isFinite(filters.min_amount_minor) || filters.min_amount_minor < 0)) return "Enter a valid minimum amount.";
    if (filters.max_amount_minor != null && (!Number.isFinite(filters.max_amount_minor) || filters.max_amount_minor < 0)) return "Enter a valid maximum amount.";
    if (filters.min_amount_minor != null && filters.max_amount_minor != null && filters.min_amount_minor > filters.max_amount_minor) return "Minimum amount can't exceed maximum amount.";
    return "";
  }

  async function loadAllTransactions(quiet = false) {
    if (txLoading) { txRefreshQueued = true; return; }
    const filters = getTransactionFilters();
    const validationError = validateTransactionFilters(filters);
    $("#txFilterError").textContent = validationError;
    if (validationError) return;
    const my = ++txReq;
    txLoading = true;
    if (!quiet) $("#txLiveStatus").textContent = "Refreshing transactions…";
    const { search, status, page, page_size } = state.tx;
    try {
      const res = await api.listTransactions({ search, status, page, page_size, ...filters });
      if (my !== txReq) return;
      state.tx.total = res.total;
      const pages = Math.max(1, Math.ceil(res.total / page_size));
      if (state.tx.page > pages) {
        state.tx.page = pages;
        txLoading = false;
        return loadAllTransactions(quiet);
      }
      $("#allTable tbody").innerHTML = res.data.map(txRow).join("") || `<tr><td class="table__empty" colspan="7">No transactions match your filters.</td></tr>`;
      const from = res.total ? (state.tx.page - 1) * page_size + 1 : 0;
      $("#txCount").textContent = `Showing ${from}–${Math.min(state.tx.page * page_size, res.total)} of ${res.total}`;
      $("#txPage").textContent = `${state.tx.page} / ${pages}`;
      $("#txPrev").disabled = state.tx.page <= 1;
      $("#txNext").disabled = state.tx.page >= pages;
      $("#txLastUpdated").textContent = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date());
      $("#txLiveStatus").textContent = "Live updates · status checked every 15 seconds while this page is open.";
    } catch (err) {
      console.error(err);
      $("#txLiveStatus").textContent = "Couldn't refresh transactions. Will retry automatically.";
      if (!quiet) toast(err.message || "Couldn't load transactions.", "error");
    } finally {
      txLoading = false;
      if (txRefreshQueued) {
        txRefreshQueued = false;
        loadAllTransactions(true);
      }
    }
  }
  let searchTimer;
  $("#txSearch").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.tx.search = e.target.value; state.tx.page = 1; loadAllTransactions(); }, 220);
  });
  function applyTransactionFilters() { state.tx.page = 1; loadAllTransactions(); }
  ["txDateFrom", "txDateTo", "txAmountMin", "txAmountMax", "txMethod", "txDuplicatesOnly"].forEach((id) => {
    const control = $("#" + id);
    control.addEventListener(control.type === "number" ? "input" : "change", applyTransactionFilters);
  });
  $("#txClearFilters").addEventListener("click", () => {
    $("#txDateFrom").value = "";
    $("#txDateTo").value = "";
    $("#txAmountMin").value = "";
    $("#txAmountMax").value = "";
    $("#txMethod").value = "all";
    $("#txDuplicatesOnly").checked = false;
    $("#txSearch").value = "";
    state.tx.search = "";
    state.tx.status = "all";
    $$(".seg__btn", $("#txFilter")).forEach((button) => {
      const active = button.dataset.status === "all";
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    applyTransactionFilters();
  });
  $("#txRefresh").addEventListener("click", () => loadAllTransactions());
  $("#txFilter").addEventListener("click", (e) => {
    const b = e.target.closest("[data-status]"); if (!b) return;
    $$(".seg__btn", $("#txFilter")).forEach((x) => { x.classList.toggle("is-active", x === b); x.setAttribute("aria-selected", x === b ? "true" : "false"); });
    state.tx.status = b.dataset.status; state.tx.page = 1; loadAllTransactions();
  });
  $("#txPrev").addEventListener("click", () => { state.tx.page = Math.max(1, state.tx.page - 1); loadAllTransactions(); });
  $("#txNext").addEventListener("click", () => { state.tx.page++; loadAllTransactions(); });

  function syncTransactionPolling() {
    if (txRefreshTimer) clearInterval(txRefreshTimer);
    txRefreshTimer = null;
    if (location.hash !== "#transactions") return;
    txRefreshTimer = setInterval(() => {
      if (!document.hidden) loadAllTransactions(true);
    }, TX_REFRESH_MS);
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && location.hash === "#transactions") loadAllTransactions(true);
  });

  // row action menu
  const rowMenu = $("#rowMenu");
  let rowCtx = null;
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-row]");
    if (!btn) return;
    e.stopPropagation();
    rowCtx = { id: btn.dataset.row, status: btn.dataset.status };
    const refundable = ["success", "partially_refunded"].includes(rowCtx.status);
    $("[data-row-action='refund']", rowMenu).setAttribute("aria-disabled", refundable ? "false" : "true");
    togglePop(btn, rowMenu, () => {
      const r = btn.getBoundingClientRect();
      const mw = rowMenu.offsetWidth, mh = rowMenu.offsetHeight;
      let left = r.right - mw, top = r.bottom + 6;
      if (top + mh > window.innerHeight - 8) top = r.top - mh - 6;
      rowMenu.style.left = Math.max(8, left) + "px";
      rowMenu.style.top = Math.max(8, top) + "px";
    });
  });
  window.addEventListener("scroll", () => openPop && openPop.panel === rowMenu && closePop(), { passive: true });
  rowMenu.addEventListener("click", (e) => {
    const a = e.target.closest("[data-row-action]"); if (!a || !rowCtx) return;
    const { id } = rowCtx;
    closePop();
    if (a.dataset.rowAction === "copy") copyText(id, `Copied ${id}`);
    if (a.dataset.rowAction === "view") showTransaction(id);
    if (a.dataset.rowAction === "refund") openRefund(id);
  });

  async function showTransaction(id) {
    const t = await api.getTransaction(id);
    openModal(`Transaction #${t.public_id}`, `
      <dl class="kv">
        <dt>Status</dt><dd><span class="status status--${esc(t.status)}">${STATUS_LABEL[t.status] || esc(t.status)}</span></dd>
        <dt>Amount</dt><dd>${money(t.amount_minor, true)}</dd>
        <dt>Fee</dt><dd>${money(t.fee_minor, true)}</dd>
        <dt>Net</dt><dd>${money(t.net_minor, true)}</dd>
        ${t.refunded_minor ? `<dt>Refunded</dt><dd>${money(t.refunded_minor, true)}</dd>` : ""}
        <dt>Customer</dt><dd>${esc(t.customer_name)}<br><span class="muted">${esc(t.customer_email || "")}</span></dd>
        <dt>Method</dt><dd>${esc(t.provider_name)} ${t.card_last4 ? "•••• " + esc(t.card_last4) : esc(t.payer_account_masked || "")}</dd>
        <dt>Reference</dt><dd>${esc(t.provider_reference || "—")}</dd>
        <dt>Date</dt><dd>${dateTime(t.created_at)}</dd>
        ${t.is_duplicate ? `<dt>Duplicate check</dt><dd><span class="duplicate-detail">${icon("i-alert")}Potential duplicate${t.duplicate_of ? ` of ${esc(t.duplicate_of)}` : " payment attempt"}</span></dd>` : ""}
        ${t.failure_message ? `<dt>Reason</dt><dd>${esc(t.failure_message)}</dd>` : ""}
      </dl>
      <div class="form-actions">
        <button class="btn btn--ghost" data-copy="${esc(t.public_id)}">${icon("i-copy")}Copy ID</button>
        ${["success", "partially_refunded"].includes(t.status) ? `<button class="btn btn--primary" data-refund="${esc(t.public_id)}">${t.refunded_minor ? "Refund remaining" : "Issue refund"}</button>` : ""}
      </div>`, (body) => {
      body.addEventListener("click", (e) => {
        const c = e.target.closest("[data-copy]"); if (c) copyText(c.dataset.copy, `Copied ${c.dataset.copy}`);
        const r = e.target.closest("[data-refund]"); if (r) openRefund(r.dataset.refund);
      });
    });
  }

  async function openRefund(id) {
    const t = await api.getTransaction(id);
    const remainingMinor = t.amount_minor - (t.refunded_minor || 0);
    if (!["success", "partially_refunded"].includes(t.status) || remainingMinor <= 0) {
      toast("This transaction has no refundable amount.", "error");
      return;
    }
    openModal(`Refund #${t.public_id}`, `
      <form id="refundForm" novalidate>
        <div class="field">
          <label for="rfAmount">Refund amount</label>
          <div class="amount-input"><span>৳</span><input id="rfAmount" inputmode="decimal" value="${(remainingMinor / 100).toFixed(2)}" autocomplete="off" /></div>
          <span class="field__hint">Up to ${money(remainingMinor, true)} remains refundable for ${esc(t.customer_name)}.</span>
          <span class="field__error" id="rfErr" role="alert"></span>
        </div>
        <div class="field">
          <label for="rfReason">Reason</label>
          <select id="rfReason"><option value="requested_by_customer">Requested by customer</option><option value="duplicate">Duplicate payment</option><option value="fraudulent">Suspected fraud</option><option value="other">Other</option></select>
        </div>
        <div class="form-actions"><button type="button" class="btn btn--ghost" data-close>Cancel</button><button class="btn btn--primary" type="submit">Refund</button></div>
      </form>`, (body) => {
      $("#refundForm", body).addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = $("#rfAmount", body);
        const amountText = input.value.trim().replace(/,/g, "");
        const minor = Math.round(Number(amountText) * 100);
        const err = !/^\d+(\.\d{1,2})?$/.test(amountText) || !Number.isSafeInteger(minor) || minor <= 0 ? "Enter a valid amount with up to 2 decimal places." : minor > remainingMinor ? "Can't refund more than the remaining refundable amount." : "";
        $("#rfErr", body).textContent = err; input.setAttribute("aria-invalid", err ? "true" : "false");
        if (err) return input.focus();
        const btn = e.submitter || $("button[type=submit]", body); btn.disabled = true; btn.textContent = "Processing…";
        try {
          await api.createRefund(t.public_id, { amount_minor: minor, reason: $("#rfReason", body).value });
          closeModal(); toast(`Refund of ${money(minor, true)} started`);
          loadRecent(); loadBalance(); if ($('[data-view="transactions"]').classList.contains("is-active")) loadAllTransactions();
        } catch (ex) { $("#rfErr", body).textContent = ex.message; btn.disabled = false; btn.textContent = "Refund"; }
      });
    });
  }

  /* ========================================================== refund management */
  const REFUND_STATUS = { pending: "Pending", processing: "Processing", succeeded: "Completed", failed: "Failed" };
  const REFUND_REASON = {
    requested_by_customer: "Requested by customer",
    duplicate: "Duplicate payment",
    fraudulent: "Suspected fraud",
    other: "Other",
  };
  const refundState = { all: [], status: "all", search: "" };
  let refundRefreshTimer = null;
  let refundSearchTimer = null;

  function filteredRefunds() {
    const query = refundState.search.trim().toLowerCase();
    return refundState.all.filter((refund) => {
      const matchesStatus = refundState.status === "all" || refund.status === refundState.status;
      const matchesSearch = !query || [
        refund.id, refund.transaction_public_id, refund.customer_name, REFUND_REASON[refund.reason] || refund.reason,
      ].some((value) => String(value || "").toLowerCase().includes(query));
      return matchesStatus && matchesSearch;
    });
  }

  function renderRefundManagement() {
    const refunds = filteredRefunds();
    const totalAmount = refundState.all.reduce((sum, refund) => sum + refund.amount_minor, 0);
    const pending = refundState.all.filter((refund) => ["pending", "processing"].includes(refund.status)).length;
    $("#refundSummary").innerHTML = `
      <article class="card payment-method-stat"><span class="eyebrow">Total requests</span><strong>${refundState.all.length}</strong><span class="muted">refunds submitted</span></article>
      <article class="card payment-method-stat"><span class="eyebrow">In progress</span><strong>${pending}</strong><span class="muted">pending or processing</span></article>
      <article class="card payment-method-stat"><span class="eyebrow">Refunded amount</span><strong>${money(totalAmount)}</strong><span class="muted">all refund requests</span></article>`;
    $("#refundsTable tbody").innerHTML = refunds.map((refund) => {
      const statusClass = refund.status === "succeeded" ? "success" : refund.status === "failed" ? "failed" : "pending";
      return `<tr data-refund-view="${esc(refund.id)}" tabindex="0" aria-label="View refund ${esc(refund.id)} details">
        <td class="td-id">${esc(refund.id)}</td><td>${esc(refund.transaction_public_id || refund.transaction_id)}</td>
        <td class="td-amount">${money(refund.amount_minor, true)}</td><td>${esc(REFUND_REASON[refund.reason] || refund.reason || "—")}</td>
        <td><span class="status status--${statusClass}">${esc(REFUND_STATUS[refund.status] || refund.status)}</span></td>
        <td class="td-date">${dateTime(refund.requested_at)}</td>
      </tr>`;
    }).join("");
    const hasRefunds = refunds.length > 0;
    $("#refundsTable").hidden = !hasRefunds;
    $("#refundsEmpty").hidden = hasRefunds;
    $("#refundsEmpty").textContent = refundState.all.length
      ? "No refund requests match your search or status filter."
      : "No refund requests yet. Initiate a refund to start tracking it here.";
  }

  async function loadRefundManagement(quiet = false) {
    try {
      refundState.all = await api.listRefunds();
      renderRefundManagement();
      $("#refundLiveStatus").textContent = `Refund statuses refreshed at ${dtTime.format(new Date())}. Updates depend on the provider/backend.`;
    } catch (err) {
      console.error(err);
      $("#refundLiveStatus").textContent = "Couldn't refresh refund requests. Try again.";
      if (!quiet) toast(err.message || "Couldn't load refund requests.", "error");
    }
  }

  function syncRefundPolling() {
    if (refundRefreshTimer) clearInterval(refundRefreshTimer);
    refundRefreshTimer = null;
    if (location.hash !== "#refunds") return;
    refundRefreshTimer = setInterval(() => {
      if (!document.hidden) loadRefundManagement(true);
    }, 15000);
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && location.hash === "#refunds") loadRefundManagement(true);
  });
  $("#refundRefresh").addEventListener("click", () => loadRefundManagement());
  $("#refundSearch").addEventListener("input", (e) => {
    clearTimeout(refundSearchTimer);
    refundSearchTimer = setTimeout(() => {
      refundState.search = e.target.value;
      renderRefundManagement();
    }, 140);
  });
  $("#refundFilter").addEventListener("click", (e) => {
    const button = e.target.closest("[data-refund-status]");
    if (!button) return;
    refundState.status = button.dataset.refundStatus;
    $$(".seg__btn", $("#refundFilter")).forEach((item) => {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-selected", String(active));
    });
    renderRefundManagement();
  });
  async function initiateRefund() {
    try {
      const { data } = await api.listTransactions({ page: 1, page_size: 10000 });
      const refundable = data.filter((tx) => ["success", "partially_refunded"].includes(tx.status) && tx.amount_minor > (tx.refunded_minor || 0));
      if (!refundable.length) {
        toast("There are no transactions with a refundable balance.", "error");
        return;
      }
      openModal("Initiate a refund", `
        <form id="refundRequestForm" novalidate>
          <div class="field"><label for="refundTransaction">Transaction</label>
            <select id="refundTransaction" required>${refundable.map((tx) => `<option value="${esc(tx.public_id)}" data-remaining="${tx.amount_minor - (tx.refunded_minor || 0)}">#${esc(tx.public_id)} · ${esc(tx.customer_name)} · ${money(tx.amount_minor - (tx.refunded_minor || 0), true)} refundable</option>`).join("")}</select>
          </div>
          <div class="field"><label for="refundRequestAmount">Refund amount</label>
            <div class="amount-input"><span>৳</span><input id="refundRequestAmount" inputmode="decimal" autocomplete="off" /></div>
            <span class="field__hint" id="refundRemainingHint"></span><span class="field__error" id="refundRequestError" role="alert"></span>
          </div>
          <div class="field"><label for="refundRequestReason">Reason</label>
            <select id="refundRequestReason" required><option value="requested_by_customer">Requested by customer</option><option value="duplicate">Duplicate payment</option><option value="fraudulent">Suspected fraud</option><option value="other">Other</option></select>
          </div>
          <div class="form-actions"><button type="button" class="btn btn--ghost" data-close>Cancel</button><button class="btn btn--primary" type="submit">Submit refund</button></div>
        </form>`, (body) => {
        const form = $("#refundRequestForm", body);
        const transactionSelect = $("#refundTransaction", body);
        const amountInput = $("#refundRequestAmount", body);
        const updateAmountHint = () => {
          const option = transactionSelect.selectedOptions[0];
          const remaining = Number(option.dataset.remaining);
          amountInput.value = (remaining / 100).toFixed(2);
          $("#refundRemainingHint", body).textContent = `Maximum refundable balance: ${money(remaining, true)}.`;
        };
        transactionSelect.addEventListener("change", updateAmountHint);
        updateAmountHint();
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const amountText = amountInput.value.trim().replace(/,/g, "");
          const amountMinor = Math.round(Number(amountText) * 100);
          const remaining = Number(transactionSelect.selectedOptions[0].dataset.remaining);
          const error = !/^\d+(\.\d{1,2})?$/.test(amountText) || !Number.isSafeInteger(amountMinor) || amountMinor <= 0
            ? "Enter a valid amount with up to 2 decimal places."
            : amountMinor > remaining ? "Refund amount exceeds the remaining refundable balance." : "";
          $("#refundRequestError", body).textContent = error;
          if (error) return amountInput.focus();
          const submit = $("button[type=submit]", form);
          submit.disabled = true;
          submit.textContent = "Submitting…";
          try {
            const result = await api.createRefund(transactionSelect.value, {
              amount_minor: amountMinor,
              reason: $("#refundRequestReason", body).value,
            });
            closeModal();
            toast(`Refund ${result.id} submitted`);
            await loadRefundManagement();
            loadRecent();
            loadBalance();
            if (location.hash === "#transactions") loadAllTransactions();
          } catch (err) {
            console.error(err);
            $("#refundRequestError", body).textContent = err.message || "Couldn't submit refund.";
            submit.disabled = false;
            submit.textContent = "Submit refund";
          }
        });
      });
    } catch (err) {
      console.error(err);
      toast(err.message || "Couldn't load refundable transactions.", "error");
    }
  }
  $("#refundCreate").addEventListener("click", initiateRefund);
  $("#refundsTable tbody").addEventListener("click", (event) => {
    const row = event.target.closest("[data-refund-view]");
    if (!row) return;
    const refund = refundState.all.find((item) => item.id === row.dataset.refundView);
    if (!refund) return;
    const statusClass = refund.status === "succeeded" ? "success" : refund.status === "failed" ? "failed" : "pending";
    openModal(`Refund ${refund.id}`, `
      <dl class="kv">
        <dt>Status</dt><dd><span class="status status--${statusClass}">${esc(REFUND_STATUS[refund.status] || refund.status)}</span></dd>
        <dt>Transaction</dt><dd>${esc(refund.transaction_public_id || refund.transaction_id)}</dd>
        <dt>Customer</dt><dd>${esc(refund.customer_name || "Guest")}</dd>
        <dt>Amount</dt><dd>${money(refund.amount_minor, true)}</dd>
        <dt>Reason</dt><dd>${esc(REFUND_REASON[refund.reason] || refund.reason || "—")}</dd>
        <dt>Requested</dt><dd>${dateTime(refund.requested_at)}</dd>
        <dt>Last updated</dt><dd>${dateTime(refund.updated_at || refund.requested_at)}</dd>
      </dl>
      ${refund.failure_message ? `<p class="field__error">${esc(refund.failure_message)}</p>` : ""}
      <div class="form-actions"><button class="btn btn--ghost" data-close>Close</button></div>`);
  });
  $("#refundsTable tbody").addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      const row = event.target.closest("[data-refund-view]");
      if (row) { event.preventDefault(); row.click(); }
    }
  });
  $("#refundExport").addEventListener("click", () => {
    const refunds = filteredRefunds();
    const head = ["refund_id", "transaction_id", "customer", "amount_bdt", "reason", "status", "requested_at", "updated_at"];
    const rows = refunds.map((refund) => [
      refund.id, refund.transaction_public_id || refund.transaction_id, refund.customer_name || "",
      (refund.amount_minor / 100).toFixed(2), REFUND_REASON[refund.reason] || refund.reason || "",
      REFUND_STATUS[refund.status] || refund.status, refund.requested_at, refund.updated_at || "",
    ]);
    const csv = [head, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    anchor.download = `refunds-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
    toast(`Exported ${refunds.length} refund requests`);
  });

  /* ========================================================== reconciliation */
  const reconciliationState = {
    internal: [],
    statementRows: [],
    results: [],
    filename: "",
  };
  const reconciliationProvider = $("#reconciliationProvider");
  const RECONCILIATION_FILE_LIMIT = 10 * 1024 * 1024;
  const RECONCILIATION_ROW_LIMIT = 20000;

  async function getAllInternalTransactions() {
    const pageSize = 100;
    const records = [];
    let page = 1;
    let total = Infinity;
    while (records.length < total) {
      const response = await api.listTransactions({ page, page_size: pageSize });
      records.push(...response.data);
      total = response.total;
      if (!response.data.length || records.length >= total) break;
      page++;
    }
    return records;
  }

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let value = "";
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quoted) {
        if (char === '"' && text[i + 1] === '"') { value += '"'; i++; }
        else if (char === '"') quoted = false;
        else value += char;
      } else if (char === '"') {
        if (value.length) throw new Error("CSV contains an unexpected quote.");
        quoted = true;
      } else if (char === ",") {
        row.push(value); value = "";
      } else if (char === "\n" || char === "\r") {
        if (char === "\r" && text[i + 1] === "\n") i++;
        row.push(value); value = "";
        if (row.some((cell) => cell.trim())) rows.push(row);
        row = [];
      } else value += char;
    }
    if (quoted) throw new Error("CSV has an unclosed quoted field.");
    row.push(value);
    if (row.some((cell) => cell.trim())) rows.push(row);
    return rows;
  }

  function normalizeReconciliationReference(value) {
    return String(value || "").trim().replace(/^#/, "").toLowerCase();
  }

  function parseStatementAmount(value, isMinor) {
    const raw = String(value || "").trim().replace(/[৳$,\s]/g, "");
    if (isMinor) {
      if (!/^\d+$/.test(raw)) return null;
      const amount = Number(raw);
      return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
    const amount = Math.round(Number(raw) * 100);
    return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
  }

  function readStatementRows(text) {
    const rows = parseCSV(text.replace(/^\uFEFF/, ""));
    if (rows.length < 2) throw new Error("CSV must include a header row and at least one transaction.");
    if (rows.length - 1 > RECONCILIATION_ROW_LIMIT) throw new Error(`CSV exceeds the ${RECONCILIATION_ROW_LIMIT.toLocaleString()} row limit.`);
    const headers = rows[0].map((header) => header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
    const findHeader = (aliases) => headers.findIndex((header) => aliases.includes(header));
    const referenceIndex = findHeader([
      "transaction_id", "transactionid", "transaction_reference", "provider_reference",
      "provider_transaction_id", "provider_txn_id", "gateway_reference", "merchant_reference",
      "merchant_txn_id", "reference", "ref", "txn_id", "payment_id",
    ]);
    const minorIndex = findHeader(["amount_minor", "amount_in_minor"]);
    const amountIndex = minorIndex >= 0 ? minorIndex : findHeader(["amount", "amount_bdt", "amount_taka", "transaction_amount", "payment_amount", "gross_amount"]);
    if (referenceIndex < 0) throw new Error("CSV needs a transaction reference column (transaction_id, provider_reference, or reference).");
    if (amountIndex < 0) throw new Error("CSV needs an amount column (amount, amount_bdt, or amount_minor).");
    const normalizedRows = [];
    const errors = [];
    rows.slice(1).forEach((cells, index) => {
      const reference = String(cells[referenceIndex] || "").trim();
      const amount = parseStatementAmount(cells[amountIndex], minorIndex >= 0);
      if (!reference || amount == null) {
        errors.push(`Row ${index + 2}: ${!reference ? "missing transaction reference" : "invalid non-negative amount"}`);
        return;
      }
      normalizedRows.push({ reference, amount_minor: amount, line: index + 2 });
    });
    if (errors.length) throw new Error(`Could not import statement. ${errors.slice(0, 5).join("; ")}${errors.length > 5 ? `; and ${errors.length - 5} more row error(s)` : ""}.`);
    return normalizedRows;
  }

  function selectedInternalTransactions() {
    const provider = reconciliationProvider.value;
    return !provider || provider === "all" ? reconciliationState.internal
      : reconciliationState.internal.filter((transaction) => transaction.provider_code === provider);
  }

  function reconcileStatement() {
    if (!reconciliationState.filename) {
      reconciliationState.results = [];
      return;
    }
    const internal = selectedInternalTransactions();
    const byReference = new Map();
    internal.forEach((transaction) => {
      [transaction.public_id, transaction.provider_reference, transaction.id].forEach((ref) => {
        const key = normalizeReconciliationReference(ref);
        if (!key) return;
        if (!byReference.has(key)) byReference.set(key, []);
        const matches = byReference.get(key);
        if (!matches.includes(transaction)) matches.push(transaction);
      });
    });
    const matchedTransactions = new Set();
    const results = reconciliationState.statementRows.map((statement) => {
      const candidates = byReference.get(normalizeReconciliationReference(statement.reference)) || [];
      if (candidates.length > 1) {
        return { result: "ambiguous", statement, internal: null, difference_minor: null };
      }
      if (!candidates.length) {
        return { result: "missing_internal", statement, internal: null, difference_minor: null };
      }
      const transaction = candidates[0];
      if (matchedTransactions.has(transaction.public_id)) {
        return { result: "duplicate_statement", statement, internal: transaction, difference_minor: statement.amount_minor - transaction.amount_minor };
      }
      matchedTransactions.add(transaction.public_id);
      const difference = statement.amount_minor - transaction.amount_minor;
      return { result: difference ? "amount_mismatch" : "matched", statement, internal: transaction, difference_minor: difference };
    });
    internal.forEach((transaction) => {
      if (!matchedTransactions.has(transaction.public_id)) results.push({ result: "missing_statement", statement: null, internal: transaction, difference_minor: null });
    });
    reconciliationState.results = results;
  }

  const RECONCILIATION_LABEL = {
    matched: "Matched",
    amount_mismatch: "Amount mismatch",
    missing_internal: "Missing internal record",
    missing_statement: "Missing in provider statement",
    duplicate_statement: "Duplicate statement reference",
    ambiguous: "Ambiguous reference",
  };
  const RECONCILIATION_CLASS = {
    matched: "success",
    amount_mismatch: "failed",
    missing_internal: "pending",
    missing_statement: "pending",
    duplicate_statement: "failed",
    ambiguous: "failed",
  };

  function renderReconciliation() {
    reconcileStatement();
    const results = reconciliationState.results;
    const count = (kind) => results.filter((result) => result.result === kind).length;
    $("#reconciliationSummary").innerHTML = `
      <article class="card payment-method-stat"><span class="eyebrow">Matched</span><strong>${count("matched")}</strong><span class="muted">amounts and references agree</span></article>
      <article class="card payment-method-stat"><span class="eyebrow">Amount mismatches</span><strong>${count("amount_mismatch")}</strong><span class="muted">require review</span></article>
      <article class="card payment-method-stat"><span class="eyebrow">Missing in statement</span><strong>${count("missing_statement")}</strong><span class="muted">internal transactions unmatched</span></article>
      <article class="card payment-method-stat"><span class="eyebrow">Missing internally</span><strong>${count("missing_internal")}</strong><span class="muted">provider rows with no internal record</span></article>`;
    $("#reconciliationTable tbody").innerHTML = results.map((result) => {
      const transaction = result.internal;
      const statement = result.statement;
      const difference = result.difference_minor;
      return `<tr>
        <td>${esc(statement ? statement.reference : "—")}</td>
        <td>${transaction ? esc(transaction.public_id) : "—"}</td>
        <td>${transaction ? money(transaction.amount_minor, true) : "—"}</td>
        <td>${statement ? money(statement.amount_minor, true) : "—"}</td>
        <td>${difference == null ? "—" : `${difference > 0 ? "+" : ""}${money(difference, true)}`}</td>
        <td><span class="status status--${RECONCILIATION_CLASS[result.result]}">${RECONCILIATION_LABEL[result.result]}</span></td>
      </tr>`;
    }).join("");
    const imported = reconciliationState.filename.length > 0;
    $("#reconciliationTable").hidden = !imported || results.length === 0;
    $("#reconciliationEmpty").hidden = imported && results.length > 0;
    $("#reconciliationEmpty").textContent = imported ? "No transactions to reconcile for this provider." : "Import a provider CSV statement to compare transactions.";
    $("#reconciliationReport").disabled = !imported;
    $("#reconciliationFileName").textContent = imported
      ? `${reconciliationState.filename} · ${reconciliationState.statementRows.length} provider statement rows imported.`
      : "No provider statement imported.";

    const internalRows = selectedInternalTransactions();
    $("#reconciliationInternalTable tbody").innerHTML = internalRows.map((transaction) => `
      <tr><td class="td-id">${esc(transaction.public_id)}</td><td>${esc(transaction.provider_reference || "—")}</td>
        <td>${esc(transaction.customer_name || "Guest")}</td><td class="td-amount">${money(transaction.amount_minor, true)}</td>
        <td><span class="status status--${transaction.status === "success" ? "success" : transaction.status === "failed" ? "failed" : "pending"}">${esc(STATUS_LABEL[transaction.status] || transaction.status)}</span></td>
        <td class="td-date">${dateTime(transaction.created_at)}</td></tr>`).join("");
    $("#reconciliationInternalTable").hidden = !internalRows.length;
    $("#reconciliationInternalEmpty").hidden = internalRows.length > 0;
  }

  async function loadReconciliationRecords() {
    $("#reconciliationError").textContent = "";
    try {
      reconciliationState.internal = await getAllInternalTransactions();
      renderReconciliation();
    } catch (err) {
      console.error(err);
      $("#reconciliationError").textContent = err.message || "Couldn't load internal transaction records.";
    }
  }

  $("#reconciliationProvider").addEventListener("change", renderReconciliation);
  $("#reconciliationRefresh").addEventListener("click", loadReconciliationRecords);
  $("#reconciliationFile").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    $("#reconciliationError").textContent = "";
    if (!reconciliationProvider.value) {
      $("#reconciliationError").textContent = "Select the provider covered by this statement first.";
      event.target.value = "";
      return;
    }
    if (file.size > RECONCILIATION_FILE_LIMIT) {
      $("#reconciliationError").textContent = "CSV file must be 10 MB or smaller.";
      event.target.value = "";
      return;
    }
    try {
      const rows = readStatementRows(await file.text());
      reconciliationState.statementRows = rows;
      reconciliationState.filename = file.name;
      renderReconciliation();
    } catch (err) {
      console.error(err);
      $("#reconciliationError").textContent = err.message || "Couldn't read provider statement.";
    }
  });
  $("#reconciliationReport").addEventListener("click", () => {
    if (!reconciliationState.filename) return;
    const headers = ["result", "provider_reference", "internal_transaction_id", "provider_amount_bdt", "internal_amount_bdt", "difference_bdt"];
    const rows = reconciliationState.results.map((result) => [
      RECONCILIATION_LABEL[result.result],
      result.statement ? result.statement.reference : "",
      result.internal ? result.internal.public_id : "",
      result.statement ? (result.statement.amount_minor / 100).toFixed(2) : "",
      result.internal ? (result.internal.amount_minor / 100).toFixed(2) : "",
      result.difference_minor == null ? "" : (result.difference_minor / 100).toFixed(2),
    ]);
    const csvCell = (value) => {
      let text = String(value);
      if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    anchor.download = `reconciliation-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
    toast(`Downloaded reconciliation report · ${reconciliationState.results.length} rows`);
  });

  // CSV export of the current filter
  async function exportCsv() {
    try {
      const filters = getTransactionFilters();
      const validationError = validateTransactionFilters(filters);
      if (validationError) {
        $("#txFilterError").textContent = validationError;
        return toast(validationError, "error");
      }
      const { data } = await api.listTransactions({
        ...state.tx, ...filters, page: 1, page_size: 10000,
      });
      const head = ["transaction_id", "customer", "amount_bdt", "fee_bdt", "net_bdt", "method", "status", "created_at", "possible_duplicate", "duplicate_of"];
      const rows = data.map((t) => [
        t.public_id, t.customer_name, (t.amount_minor / 100).toFixed(2),
        (t.fee_minor / 100).toFixed(2), (t.net_minor / 100).toFixed(2),
        t.provider_name, t.status, t.created_at, t.is_duplicate ? "yes" : "no", t.duplicate_of || "",
      ]);
      const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
      a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast(`Exported ${data.length} transactions`);
    } catch (err) {
      console.error(err);
      toast(err.message || "Couldn't export transactions.", "error");
    }
  }

  /* ================================================================ payment links */
  const linkState = { all: [], status: "all", search: "" };

  function renderPaymentLinks() {
    const query = linkState.search.trim().toLowerCase();
    const filtered = linkState.all.filter((link) => {
      const matchesStatus = linkState.status === "all" || link.status === linkState.status;
      const matchesQuery = !query || [link.title, link.slug, link.description, link.url]
        .some((value) => String(value || "").toLowerCase().includes(query));
      return matchesStatus && matchesQuery;
    });
    $("#linkAllCount").textContent = linkState.all.length;
    $("#linkActiveCount").textContent = linkState.all.filter((link) => link.status === "active").length;
    $("#linkPausedCount").textContent = linkState.all.filter((link) => link.status === "paused").length;
    $("#linksTable tbody").innerHTML = filtered.map((link) => `
      <tr>
        <td data-col="title"><strong>${esc(link.title)}</strong><small class="table-sub">${esc(link.slug)}</small></td>
        <td data-col="amount">${link.amount_minor == null ? "Customer chooses" : money(link.amount_minor, true)}</td>
        <td data-col="status"><span class="status status--${link.status === "active" ? "success" : "pending"}">${link.status === "active" ? "Active" : "Paused"}</span></td>
        <td data-col="uses">${nf0.format(link.uses_count || 0)} ${link.uses_count === 1 ? "payment" : "payments"}<small class="table-sub">${dateTime(link.created_at)}</small></td>
        <td data-col="actions"><div class="table-actions">
          <button class="icon-btn icon-btn--bordered" data-link-copy="${esc(link.url)}" aria-label="Copy ${esc(link.title)} link">${icon("i-copy")}</button>
          <button class="btn btn--ghost btn--sm" data-link-manage="${esc(link.id)}">Manage</button>
        </div></td>
      </tr>`).join("");
    const hasLinks = filtered.length > 0;
    $("#linksTable").hidden = !hasLinks;
    $("#linksEmpty").hidden = hasLinks;
    $("#linksEmptyTitle").textContent = linkState.all.length ? "No matching payment links" : "No payment links yet";
    $("#linksEmptyText").textContent = linkState.all.length
      ? "Try a different search or status filter, or add a new payment link."
      : "Create a link to start collecting payments without a website.";
  }

  async function loadPaymentLinks() {
    try {
      linkState.all = await api.listPaymentLinks();
      renderPaymentLinks();
    } catch (err) {
      console.error(err);
      toast("Couldn't load payment links.", "error");
    }
  }

  let linkSearchTimer;
  $("#linkSearch").addEventListener("input", (e) => {
    clearTimeout(linkSearchTimer);
    linkSearchTimer = setTimeout(() => {
      linkState.search = e.target.value;
      renderPaymentLinks();
    }, 140);
  });
  $("#linkFilter").addEventListener("click", (e) => {
    const button = e.target.closest("[data-link-filter]");
    if (!button) return;
    linkState.status = button.dataset.linkFilter;
    $$(".seg__btn", $("#linkFilter")).forEach((item) => {
      item.classList.toggle("is-active", item === button);
      item.setAttribute("aria-selected", item === button ? "true" : "false");
    });
    renderPaymentLinks();
  });

  function openPaymentLinkDetails(id) {
    const link = linkState.all.find((item) => item.id === id);
    if (!link) return toast("Payment link not found. Refresh and try again.", "error");
    openModal(link.title, `
      <p class="muted">${esc(link.description || "No description added.")}</p>
      <dl class="kv link-details">
        <dt>Status</dt><dd><span class="status status--${link.status === "active" ? "success" : "pending"}">${link.status === "active" ? "Active" : "Paused"}</span></dd>
        <dt>Amount</dt><dd>${link.amount_minor == null ? "Customer chooses" : money(link.amount_minor, true)}</dd>
        <dt>Payments</dt><dd>${nf0.format(link.uses_count || 0)}</dd>
        <dt>Created</dt><dd>${dateTime(link.created_at)}</dd>
      </dl>
      <div class="field"><label for="linkUrl">Shareable payment URL</label><div class="copy-row"><input id="linkUrl" readonly value="${esc(link.url)}" /><button class="btn btn--primary btn--sm" type="button" data-copy-payment-link>${icon("i-copy")}Copy</button></div></div>
      <div class="form-actions"><button class="btn btn--ghost" type="button" data-close>Close</button><button class="btn ${link.status === "active" ? "btn--ghost" : "btn--primary"}" type="button" data-manage-toggle="${esc(link.id)}" data-status="${esc(link.status)}">${link.status === "active" ? "Pause link" : "Resume link"}</button></div>`, (body) => {
      $("[data-copy-payment-link]", body).addEventListener("click", () => copyText(link.url, "Payment link copied"));
      $("[data-manage-toggle]", body).addEventListener("click", async (e) => {
        const button = e.currentTarget;
        button.disabled = true;
        try {
          const nextStatus = button.dataset.status === "active" ? "paused" : "active";
          await api.updatePaymentLinkStatus(link.id, nextStatus);
          await loadPaymentLinks();
          toast(nextStatus === "paused" ? "Payment link paused" : "Payment link resumed");
          closeModal();
        } catch (err) {
          console.error(err);
          toast(err.message || "Couldn't update payment link.", "error");
          button.disabled = false;
        }
      });
    });
  }

  $("#linksTable").addEventListener("click", async (e) => {
    const copy = e.target.closest("[data-link-copy]");
    if (copy) return copyText(copy.dataset.linkCopy, "Payment link copied");
    const manage = e.target.closest("[data-link-manage]");
    if (manage) openPaymentLinkDetails(manage.dataset.linkManage);
  });

  /* ================================================================ analytics */
  let analyticsChart = null;
  const ANALYTICS_PERIOD_LABEL = { this_month: "This Month", last_month: "Last Month", this_year: "This Year" };
  async function loadAnalytics() {
    try {
      const [summary, revenue, txResult] = await Promise.all([
        api.getDashboardSummary("last_30_days"),
        api.getRevenueSeries(state.analyticsPeriod),
        api.listTransactions({ page: 1, page_size: 10000 }),
      ]);
      $("#analyticsStats").innerHTML = `
        <article class="card stat-card"><span class="eyebrow">Revenue · last 30 days</span><strong>${money(summary.total_revenue_minor)}</strong></article>
        <article class="card stat-card"><span class="eyebrow">Successful payment rate</span><strong>${summary.success_rate_pct.toFixed(1)}%</strong></article>
        <article class="card stat-card"><span class="eyebrow">Transactions · last 30 days</span><strong>${nf0.format(summary.total_transactions)}</strong></article>
        <article class="card stat-card"><span class="eyebrow">Failed payments</span><strong>${nf0.format(summary.failed_payments)}</strong></article>`;

      const successful = txResult.data.filter((tx) => tx.status === "success" || tx.status === "refunded" || tx.status === "partially_refunded");
      const methods = successful.reduce((acc, tx) => {
        const key = tx.provider_name || tx.provider_code;
        acc[key] = (acc[key] || 0) + tx.amount_minor;
        return acc;
      }, {});
      const methodRows = Object.entries(methods).sort((a, b) => b[1] - a[1]);
      const maxMethod = methodRows.length ? methodRows[0][1] : 0;
      $("#methodBreakdown").innerHTML = methodRows.map(([name, value]) => `
        <li class="breakdown-item"><div class="breakdown-item__head"><strong>${esc(name)}</strong><span>${money(value)}</span></div>
          <div class="breakdown-bar"><span style="width:${maxMethod ? Math.max(4, value / maxMethod * 100) : 0}%"></span></div></li>`).join("")
        || `<li class="muted">No successful payments to summarize yet.</li>`;

      const points = revenue.points.map((point) => {
        const date = new Date(point.date.length === 7 ? point.date + "-01T00:00:00Z" : point.date + "T00:00:00Z");
        return revenue.granularity === "month"
          ? { label: monthShort.format(date), full: monthLong.format(date), value: point.value_minor }
          : { label: shortDate.format(date), full: longDate.format(date), value: point.value_minor };
      });
      const opts = {
        points,
        formatValue: moneyTight,
        formatTick: (v) => { const amount = v / 100; return amount >= 1e6 ? +(amount / 1e6).toFixed(1) + "M" : amount >= 1000 ? +(amount / 1000).toFixed(1) + "k" : String(amount); },
        defaultIndex: Math.max(0, Math.round((points.length - 1) * .75)),
        ariaLabel: `Revenue trend: ${ANALYTICS_PERIOD_LABEL[state.analyticsPeriod]}`,
      };
      if (!analyticsChart) analyticsChart = charts.areaChart($("#analyticsChart"), opts);
      else analyticsChart.update(opts);
    } catch (err) {
      console.error(err);
      toast("Couldn't load analytics.", "error");
    }
  }
  $("#analyticsPeriodBtn").addEventListener("click", () => togglePop($("#analyticsPeriodBtn"), $("#analyticsPeriodMenu")));
  $("#analyticsPeriodMenu").addEventListener("click", (e) => {
    const item = e.target.closest("[data-analytics-period]");
    if (!item) return;
    state.analyticsPeriod = item.dataset.analyticsPeriod;
    $("#analyticsPeriodLabel").textContent = item.textContent;
    selectInMenu($("#analyticsPeriodMenu"), item);
    closePop();
    loadAnalytics();
  });

  /* ================================================================ payouts */
  async function loadPayoutPage() {
    try {
      const [balance, payouts, accountData] = await Promise.all([
        api.getBalance(), api.listPayouts(), api.listPayoutAccounts(),
      ]);
      $("#payoutBalance").textContent = money(balance.available_minor, true);
      $("#payoutPending").textContent = balance.pending_minor ? `${money(balance.pending_minor, true)} pending settlement` : "No pending settlement";
      const accountById = Object.fromEntries(accountData.accounts.map((account) => [account.id, account]));
      $("#payoutsTable tbody").innerHTML = payouts.map((payout) => {
        const account = accountById[payout.payout_account_id];
        const status = payout.status || "processing";
        return `<tr><td class="td-id">${esc(payout.public_id)}</td><td>${esc(account ? account.label : "Unknown account")}</td>
          <td class="td-amount">${money(payout.amount_minor, true)}</td><td>${money(payout.fee_minor || 0, true)}</td>
          <td><span class="status status--${status === "completed" || status === "settled" ? "success" : status === "failed" ? "failed" : "processing"}">${esc(STATUS_LABEL[status] || status)}</span></td>
          <td class="td-date">${dateTime(payout.requested_at)}</td></tr>`;
      }).join("");
      $("#payoutsEmpty").hidden = payouts.length > 0;
      $("#payoutsTable").hidden = payouts.length === 0;
      $("#payoutAccounts").innerHTML = accountData.accounts.map((account) => `
        <div class="account-row"><div><strong>${esc(account.label)}</strong><small>${esc(account.bank_name)} · ${esc(account.status)}</small></div>
          <button class="btn ${account.is_default ? "btn--primary" : "btn--ghost"} btn--sm" data-default-account="${esc(account.id)}" ${account.is_default ? "disabled" : ""}>
            ${account.is_default ? "Default" : "Set as default"}</button></div>`).join("")
        || `<p class="muted">No payout accounts are connected.</p>`;
    } catch (err) {
      console.error(err);
      toast("Couldn't load payout information.", "error");
    }
  }
  $("#payoutAccounts").addEventListener("click", async (e) => {
    const button = e.target.closest("[data-default-account]");
    if (!button) return;
    button.disabled = true;
    try {
      await api.setDefaultPayoutAccount(button.dataset.defaultAccount);
      await loadPayoutPage();
      toast("Default payout account updated");
    } catch (err) {
      console.error(err);
      toast(err.message || "Couldn't update payout account.", "error");
      button.disabled = false;
    }
  });

  /* ================================================================ settings */
  let settingsSnapshot = null;
  const profileFields = ["businessName", "legalName", "businessType", "businessIndustry", "businessEmail", "businessPhone", "businessWebsite", "ownerName", "ownerEmail", "businessAddress", "businessCity", "businessPostal"];
  const profileForm = $("#profileForm");
  const preferencesForm = $("#preferencesForm");

  function readProfileForm() {
    return {
      businessName: $("#businessName").value.trim(),
      legalName: $("#legalName").value.trim(),
      businessType: $("#businessType").value,
      businessIndustry: $("#businessIndustry").value.trim(),
      businessEmail: $("#businessEmail").value.trim(),
      ownerName: $("#ownerName").value.trim(),
      ownerEmail: $("#ownerEmail").value.trim(),
      businessPhone: $("#businessPhone").value.trim(),
      businessWebsite: $("#businessWebsite").value.trim(),
      businessAddress: $("#businessAddress").value.trim(),
      businessCity: $("#businessCity").value.trim(),
      businessPostal: $("#businessPostal").value.trim(),
    };
  }

  function readPreferencesForm() {
    return {
      payout_schedule: $("#payoutSchedule").value,
      notify_email: Object.fromEntries($$("[data-pref-email]", preferencesForm).map((input) => [input.name, input.checked])),
      notify_sms: Object.fromEntries($$("[data-pref-sms]", preferencesForm).map((input) => [input.name, input.checked])),
    };
  }

  function updateSettingsSaveButtons() {
    const profileChanged = settingsSnapshot && settingsSnapshot.profile && JSON.stringify(readProfileForm()) !== JSON.stringify(settingsSnapshot.profile);
    const pictureChanged = settingsSnapshot && profilePictureData !== settingsSnapshot.profilePicture;
    const preferencesChanged = settingsSnapshot && settingsSnapshot.preferences && JSON.stringify(readPreferencesForm()) !== JSON.stringify(settingsSnapshot.preferences);
    $("button[type=submit]", profileForm).disabled = !(profileChanged || pictureChanged);
    $("button[type=submit]", preferencesForm).disabled = !preferencesChanged;
  }

  async function loadProfile() {
    try {
      const { merchant, user } = await api.getSession();
      state.merchant = merchant;
      state.user = user;
      $("#businessName").value = merchant.business_name || "";
      $("#legalName").value = merchant.legal_name || "";
      $("#businessType").value = merchant.business_type || "sole_proprietorship";
      $("#businessIndustry").value = merchant.industry || "";
      $("#businessEmail").value = merchant.email || "";
      $("#ownerName").value = user.full_name || "";
      $("#ownerEmail").value = user.email || "";
      $("#businessPhone").value = merchant.phone || "";
      $("#businessWebsite").value = merchant.website_url || "";
      $("#businessAddress").value = merchant.address_line1 || "";
      $("#businessCity").value = merchant.city || "";
      $("#businessPostal").value = merchant.postal_code || "";
      renderProfilePicture();
      $("#kycStatus").textContent = merchant.kyc_status === "verified" ? "Verified" : merchant.kyc_status.replace(/_/g, " ");
      $("#kycStatus").className = "status " + (merchant.kyc_status === "verified" ? "status--success" : "status--pending");
      $("#businessMeta").innerHTML = `<span><small>Country</small><strong>${esc(merchant.country_code || "—")}</strong></span><span><small>Currency</small><strong>${esc(merchant.default_currency || "BDT")}</strong></span><span><small>Timezone</small><strong>${esc(merchant.timezone || "Asia/Dhaka")}</strong></span><span><small>Merchant status</small><strong>${esc(merchant.status || "active")}</strong></span>`;
      settingsSnapshot = { ...settingsSnapshot, profile: readProfileForm(), profilePicture: profilePictureData };
      updateSettingsSaveButtons();
    } catch (err) {
      console.error(err);
      toast("Couldn't load your business profile.", "error");
    }
  }

  async function loadSettings() {
    try {
      const [preferences, session, accountData, team, security] = await Promise.all([
        api.getMerchantSettings(),
        api.getSession(),
        api.listPayoutAccounts(),
        api.listTeamMembers(),
        api.getTwoFactorStatus(),
      ]);
      $("#payoutSchedule").value = preferences.payout_schedule;
      $$("[data-pref-email]", preferencesForm).forEach((input) => { input.checked = Boolean(preferences.notify_email[input.name]); });
      $$("[data-pref-sms]", preferencesForm).forEach((input) => { input.checked = Boolean(preferences.notify_sms[input.name]); });
      settingsSnapshot = { ...settingsSnapshot, preferences: readPreferencesForm() };
      renderSettingsCompany(session.merchant);
      renderSettingsAccounts(accountData.accounts);
      renderTeamMembers(team);
      renderTwoFactorStatus(security);
      updateSettingsSaveButtons();
    } catch (err) {
      console.error(err);
      toast("Couldn't load settings.", "error");
    }
  }

  function renderSettingsCompany(merchant) {
    $("#settingsCompanyInfo").innerHTML = `
      <span><small>Business name</small><strong>${esc(merchant.business_name || "—")}</strong></span>
      <span><small>Legal name</small><strong>${esc(merchant.legal_name || "—")}</strong></span>
      <span><small>Business type</small><strong>${esc(String(merchant.business_type || "—").replace(/_/g, " "))}</strong></span>
      <span><small>Industry</small><strong>${esc(merchant.industry || "—")}</strong></span>
      <span><small>Business email</small><strong>${esc(merchant.email || "—")}</strong></span>
      <span><small>Phone</small><strong>${esc(merchant.phone || "—")}</strong></span>
      <span><small>Country / currency</small><strong>${esc(merchant.country_code || "—")} · ${esc(merchant.default_currency || "BDT")}</strong></span>
      <span><small>Verification</small><strong>${esc(String(merchant.kyc_status || "unknown").replace(/_/g, " "))}</strong></span>`;
  }

  function renderSettingsAccounts(accounts) {
    $("#settingsAccounts").innerHTML = accounts.map((account) => `
      <div class="account-row"><div>
        <strong>${esc(account.label || account.bank_name || "Payment account")}${account.is_default ? ' <span class="status status--success">Default</span>' : ""}</strong>
        <small>${esc(account.bank_name || account.account_type || "Payment provider")} · ${esc(account.account_name || "Merchant account")} · ${esc(account.status || "unknown")}</small>
      </div></div>`).join("") || `<p class="muted">No payment accounts are connected.</p>`;
  }

  const TEAM_ROLE_LABEL = { owner: "Owner", admin: "Admin", finance: "Finance", developer: "Developer", support: "Support", viewer: "Viewer" };
  function renderTeamMembers(members) {
    $("#teamTable tbody").innerHTML = members.map((member) => `
      <tr><td>${esc(member.full_name || member.email)}${member.full_name ? `<span class="table-sub">${esc(member.email)}</span>` : ""}</td>
        <td>${esc(TEAM_ROLE_LABEL[member.role] || member.role)}</td>
        <td><span class="status status--${member.status === "active" ? "success" : "pending"}">${esc(member.status === "invited" ? "Invitation sent" : member.status)}</span></td>
        <td>${member.role === "owner" ? "" : `<button class="btn btn--ghost btn--sm" type="button" data-team-remove="${esc(member.id)}" aria-label="Remove ${esc(member.email)}">Remove</button>`}</td></tr>`).join("");
    $("#teamTable").hidden = members.length === 0;
    $("#teamEmpty").hidden = members.length > 0;
  }

  function renderTwoFactorStatus(settings) {
    const enabled = Boolean(settings.two_factor_enabled);
    $("#twoFactorStatus").textContent = enabled ? "Enabled" : "Not enabled";
    $("#twoFactorStatus").className = "status " + (enabled ? "status--success" : "status--pending");
    $("#twoFactorAction").textContent = enabled ? "Turn off 2FA" : "Set up 2FA";
    $("#twoFactorAction").dataset.enabled = String(enabled);
  }

  $("#teamInviteForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const submit = $("button[type=submit]", form);
    submit.disabled = true;
    try {
      await api.inviteTeamMember({ email: $("#teamEmail").value, role: $("#teamRole").value });
      $("#teamEmail").value = "";
      renderTeamMembers(await api.listTeamMembers());
      toast("Team invitation sent");
    } catch (err) {
      console.error(err);
      toast(err.message || "Couldn't invite team member.", "error");
    } finally { submit.disabled = false; }
  });
  $("#teamTable tbody").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-team-remove]");
    if (!button) return;
    button.disabled = true;
    try {
      await api.removeTeamMember(button.dataset.teamRemove);
      renderTeamMembers(await api.listTeamMembers());
      toast("Team member removed");
    } catch (err) {
      console.error(err);
      toast(err.message || "Couldn't remove team member.", "error");
      button.disabled = false;
    }
  });

  $("#passwordForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const currentPassword = $("#currentPassword").value;
    const newPassword = $("#newPassword").value;
    const confirmation = $("#confirmPassword").value;
    if (newPassword !== confirmation) {
      $("#confirmPassword").setCustomValidity("Passwords do not match.");
      $("#confirmPassword").reportValidity();
      return;
    }
    $("#confirmPassword").setCustomValidity("");
    if (currentPassword === newPassword) {
      $("#newPassword").setCustomValidity("Choose a password different from your current password.");
      $("#newPassword").reportValidity();
      return;
    }
    $("#newPassword").setCustomValidity("");
    const submit = $("button[type=submit]", form);
    submit.disabled = true;
    try {
      await api.changePassword({ current_password: currentPassword, new_password: newPassword });
      form.reset();
      toast("Password changed");
    } catch (err) {
      console.error(err);
      toast(err.message || "Couldn't change password.", "error");
    } finally { submit.disabled = false; }
  });

  $("#twoFactorAction").addEventListener("click", async (event) => {
    const enabled = event.currentTarget.dataset.enabled === "true";
    try {
      const setup = enabled ? null : await api.startTwoFactorSetup();
      openModal(enabled ? "Turn off two-factor authentication" : "Set up two-factor authentication", `
        <p class="muted">${enabled ? "Enter the 6-digit code from your authenticator app to disable 2FA." : "Add this setup key to your authenticator app, then verify the 6-digit code."}</p>
        ${setup ? `<div class="security-setup-key"><small>Authenticator setup URI</small><code>${esc(setup.setup_uri)}</code></div>${setup.demo_only ? `<p class="field__hint">Sandbox demo code: <strong>${esc(setup.demo_code)}</strong>. This is not a real authenticator credential.</p>` : ""}` : ""}
        <form id="twoFactorForm" class="section-card">
          <div class="field"><label for="twoFactorCode">Verification code</label><input id="twoFactorCode" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" required placeholder="6-digit code" /><span class="field__error" id="twoFactorError" role="alert"></span></div>
          <div class="form-actions"><button type="button" class="btn btn--ghost" data-close>Cancel</button><button type="submit" class="btn btn--primary">${enabled ? "Disable 2FA" : "Verify and enable"}</button></div>
        </form>`, (body) => {
        $("#twoFactorForm", body).addEventListener("submit", async (submitEvent) => {
          submitEvent.preventDefault();
          const button = $("button[type=submit]", body);
          button.disabled = true;
          try {
            const result = enabled
              ? await api.disableTwoFactor($("#twoFactorCode", body).value)
              : await api.confirmTwoFactor($("#twoFactorCode", body).value);
            renderTwoFactorStatus(result);
            closeModal();
            toast(enabled ? "Two-factor authentication disabled" : "Two-factor authentication enabled");
          } catch (err) {
            console.error(err);
            $("#twoFactorError", body).textContent = err.message || "Couldn't update two-factor authentication.";
            button.disabled = false;
          }
        });
      });
    } catch (err) {
      console.error(err);
      toast(err.message || "Couldn't start two-factor setup.", "error");
    }
  });
  profileFields.forEach((id) => $("#" + id).addEventListener("input", updateSettingsSaveButtons));
  const profilePictureInput = $("#profilePictureInput");
  $("#chooseProfilePicture").addEventListener("click", () => profilePictureInput.click());
  profilePictureInput.addEventListener("change", () => {
    const file = profilePictureInput.files && profilePictureInput.files[0];
    if (!file) return;
    const error = $("#profilePictureError");
    error.textContent = "";
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      error.textContent = "Choose a JPG, PNG or WebP image.";
      profilePictureInput.value = "";
      return;
    }
    if (file.size > PROFILE_PICTURE_MAX_BYTES) {
      error.textContent = "The image must be 1 MB or smaller.";
      profilePictureInput.value = "";
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string" || !/^data:image\/(?:jpeg|png|webp);base64,/i.test(reader.result)) {
        error.textContent = "Couldn't read this image. Please choose another file.";
        return;
      }
      profilePictureData = reader.result;
      renderProfilePicture();
      updateSettingsSaveButtons();
    });
    reader.addEventListener("error", () => {
      console.error(reader.error);
      error.textContent = "Couldn't read this image. Please choose another file.";
    });
    reader.readAsDataURL(file);
  });
  $("#removeProfilePicture").addEventListener("click", () => {
    profilePictureData = null;
    profilePictureInput.value = "";
    $("#profilePictureError").textContent = "";
    renderProfilePicture();
    updateSettingsSaveButtons();
  });
  profileForm.addEventListener("reset", () => requestAnimationFrame(() => {
    if (!settingsSnapshot) return;
    const values = settingsSnapshot.profile;
    $("#businessName").value = values.businessName;
    $("#legalName").value = values.legalName;
    $("#businessType").value = values.businessType;
    $("#businessIndustry").value = values.businessIndustry;
    $("#businessEmail").value = values.businessEmail;
    $("#ownerName").value = values.ownerName;
    $("#ownerEmail").value = values.ownerEmail;
    $("#businessPhone").value = values.businessPhone;
    $("#businessWebsite").value = values.businessWebsite;
    $("#businessAddress").value = values.businessAddress;
    $("#businessCity").value = values.businessCity;
    $("#businessPostal").value = values.businessPostal;
    profilePictureData = settingsSnapshot.profilePicture;
    profilePictureInput.value = "";
    $("#profilePictureError").textContent = "";
    renderProfilePicture();
    updateSettingsSaveButtons();
  }));
  preferencesForm.addEventListener("input", updateSettingsSaveButtons);
  preferencesForm.addEventListener("change", updateSettingsSaveButtons);
  preferencesForm.addEventListener("reset", () => requestAnimationFrame(() => {
    if (!settingsSnapshot) return;
    $("#payoutSchedule").value = settingsSnapshot.preferences.payout_schedule;
    $$("[data-pref-email]", preferencesForm).forEach((input) => { input.checked = Boolean(settingsSnapshot.preferences.notify_email[input.name]); });
    $$("[data-pref-sms]", preferencesForm).forEach((input) => { input.checked = Boolean(settingsSnapshot.preferences.notify_sms[input.name]); });
    updateSettingsSaveButtons();
  }));

  profileForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!form.reportValidity()) return;
    const button = $("button[type=submit]", form);
    button.disabled = true;
    try {
      const result = await api.updateProfile({
        business_name: $("#businessName").value,
        legal_name: $("#legalName").value,
        business_type: $("#businessType").value,
        industry: $("#businessIndustry").value,
        business_email: $("#businessEmail").value,
        full_name: $("#ownerName").value,
        email: $("#ownerEmail").value,
        phone: $("#businessPhone").value,
        website_url: $("#businessWebsite").value,
        address_line1: $("#businessAddress").value,
        city: $("#businessCity").value,
        postal_code: $("#businessPostal").value,
      });
      state.merchant = result.merchant;
      state.user = result.user;
      state.firstName = result.user.full_name.split(/\s+/)[0];
      $("#profileName").textContent = result.user.full_name;
      $("#profileRole").textContent = result.user.display_title;
      renderProfilePicture();
      let profilePictureSaved = true;
      try {
        const key = profilePictureKey(result.user);
        if (profilePictureData) localStorage.setItem(key, profilePictureData);
        else localStorage.removeItem(key);
        settingsSnapshot.profilePicture = profilePictureData;
        $("#profilePictureError").textContent = "";
      } catch (err) {
        console.error(err);
        profilePictureSaved = false;
        $("#profilePictureError").textContent = "Profile details saved, but the photo couldn't be saved in this browser.";
      }
      if (location.hash === "#dashboard" || !location.hash) {
        $("#pageTitle").innerHTML = `Welcome back, <span id="firstName">${esc(state.firstName)}</span>! <span class="wave" aria-hidden="true">👋</span>`;
      }
      settingsSnapshot.profile = readProfileForm();
      updateSettingsSaveButtons();
      toast(profilePictureSaved ? "Business profile saved" : "Business details saved; profile picture not saved", profilePictureSaved ? "ok" : "error");
    } catch (err) {
      console.error(err);
      toast(err.message || "Couldn't save your profile.", "error");
    } finally { updateSettingsSaveButtons(); }
  });
  preferencesForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!form.reportValidity()) return;
    const button = $("button[type=submit]", form);
    button.disabled = true;
    try {
      settingsSnapshot.preferences = await api.updateMerchantSettings(readPreferencesForm());
      settingsSnapshot.preferences = {
        payout_schedule: settingsSnapshot.preferences.payout_schedule,
        notify_email: { ...settingsSnapshot.preferences.notify_email },
        notify_sms: { ...settingsSnapshot.preferences.notify_sms },
      };
      toast("Payout and notification preferences saved");
    } catch (err) {
      console.error(err);
      toast(err.message || "Couldn't save your preferences.", "error");
    } finally { updateSettingsSaveButtons(); }
  });
  /* ========================================================== payment methods */
  const PAYMENT_CATEGORIES = {
    mobile_banking: "Mobile banking",
    card: "Card",
    bank_transfer: "Bank transfer",
  };
  const paymentPreferencesForm = $("#paymentPreferencesForm");
  let paymentPreferencesSnapshot = null;
  let paymentProviders = [];

  function feeText(provider) {
    const percent = Number(provider.fee_percent);
    const rate = Number.isFinite(percent) ? `${percent.toFixed(percent % 1 ? 2 : 1)}%` : "Not listed";
    const fixed = Number(provider.fixed_fee_minor) > 0 ? ` + ${money(provider.fixed_fee_minor, true)}` : "";
    return rate + fixed;
  }

  function renderPaymentProviders(providers) {
    paymentProviders = providers;
    const connected = providers.filter((provider) => Boolean(provider.status)).length;
    const enabled = providers.filter((provider) => provider.status === "active").length;
    $("#paymentMethodSummary").innerHTML = `
      <article class="card payment-method-stat"><span class="eyebrow">Connected</span><strong>${connected}</strong><span class="muted">providers</span></article>
      <article class="card payment-method-stat"><span class="eyebrow">Enabled</span><strong>${enabled}</strong><span class="muted">accepting payments</span></article>
      <article class="card payment-method-stat"><span class="eyebrow">Available</span><strong>${providers.filter((provider) => provider.availability === "available").length}</strong><span class="muted">providers operational</span></article>`;
    $("#paymentProviders").innerHTML = providers.map((provider) => {
      const connectedProvider = Boolean(provider.status);
      const active = provider.status === "active";
      const available = provider.availability === "available";
      const statusText = !available ? (provider.availability_label || "Unavailable")
        : provider.status === "pending" ? "Setup pending"
          : active ? "Enabled" : connectedProvider ? "Disabled" : "Not connected";
      const statusClass = !available || provider.status === "pending" ? "status--pending" : active ? "status--success" : "";
      const action = !connectedProvider
        ? `<button class="btn btn--primary btn--sm" type="button" data-connect-gateway="${esc(provider.code)}" ${available ? "" : "disabled"}>Connect</button>`
        : provider.status === "pending"
          ? `<button class="btn btn--primary btn--sm" type="button" data-connect-gateway="${esc(provider.code)}" ${available ? "" : "disabled"}>Complete setup</button>`
          : `<button class="switch ${active ? "is-on" : ""}" type="button" role="switch" aria-checked="${active}" aria-label="${active ? "Disable" : "Enable"} ${esc(provider.name)}" data-gateway-toggle="${esc(provider.code)}" data-status="${esc(provider.status)}" ${available ? "" : "disabled"}><span></span></button>`;
      return `<article class="payment-provider card">
        <div class="payment-provider__head"><span class="gw__logo">${provider.logo_url ? `<img class="brand-logo" src="${esc(provider.logo_url)}" alt="" loading="lazy" decoding="async">` : logoMark(provider.code)}</span><span class="payment-provider__status status ${statusClass}">${esc(statusText)}</span></div>
        <h3>${esc(provider.name)}</h3>
        <p class="muted payment-provider__type">${esc(PAYMENT_CATEGORIES[provider.method_code] || provider.method_code || "Payment method")}</p>
        <dl class="payment-provider__details"><div><dt>Availability</dt><dd><span class="availability-dot ${available ? "is-available" : ""}"></span>${esc(provider.availability_label || (available ? "Operational" : "Unavailable"))}</dd></div>
          <div><dt>Transaction fee</dt><dd>${esc(feeText(provider))}</dd></div>
          ${provider.availability_note ? `<div class="payment-provider__note">${esc(provider.availability_note)}</div>` : ""}
        </dl>
        <div class="payment-provider__actions">${action}</div>
      </article>`;
    }).join("") || `<p class="muted">No payment providers are available.</p>`;
    renderPaymentPreferenceFields(providers);
  }

  function renderPaymentPreferenceFields(providers) {
    const activeProviders = providers.filter((provider) => provider.status === "active" && provider.availability === "available");
    $("#paymentPreferenceFields").innerHTML = Object.entries(PAYMENT_CATEGORIES).map(([category, label]) => {
      const options = activeProviders.filter((provider) => provider.method_code === category);
      const selected = paymentPreferencesSnapshot && paymentPreferencesSnapshot[category] || "";
      return `<div class="field"><label for="preferred-${esc(category)}">Preferred ${esc(label.toLowerCase())} provider</label>
        <select id="preferred-${esc(category)}" name="${esc(category)}" ${options.length ? "" : "disabled"}>
          <option value="">No preference</option>${options.map((provider) => `<option value="${esc(provider.code)}" ${provider.code === selected ? "selected" : ""}>${esc(provider.name)}</option>`).join("")}
        </select><span class="field__hint">${options.length ? "Used as the default option for this payment type." : "Connect and enable an available provider to set a preference."}</span></div>`;
    }).join("");
    updatePaymentPreferenceButtons();
  }

  function readPaymentPreferences() {
    return Object.fromEntries(Object.keys(PAYMENT_CATEGORIES).map((category) => [
      category, $(`#preferred-${category}`).value,
    ]));
  }

  function updatePaymentPreferenceButtons() {
    if (!paymentPreferencesSnapshot) return;
    $("button[type=submit]", paymentPreferencesForm).disabled =
      JSON.stringify(readPaymentPreferences()) === JSON.stringify(paymentPreferencesSnapshot);
  }

  async function loadPaymentManagement() {
    try {
      const [providers, preferences] = await Promise.all([
        api.getPaymentProviders(), api.getPaymentPreferences(),
      ]);
      paymentPreferencesSnapshot = { ...preferences };
      renderPaymentProviders(providers);
    } catch (err) {
      console.error(err);
      toast("Couldn't load payment methods.", "error");
    }
  }

  paymentPreferencesForm.addEventListener("input", updatePaymentPreferenceButtons);
  paymentPreferencesForm.addEventListener("change", updatePaymentPreferenceButtons);
  paymentPreferencesForm.addEventListener("reset", () => requestAnimationFrame(() => {
    if (!paymentPreferencesSnapshot) return;
    renderPaymentPreferenceFields(paymentProviders);
  }));
  paymentPreferencesForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!paymentPreferencesForm.reportValidity()) return;
    const button = $("button[type=submit]", paymentPreferencesForm);
    button.disabled = true;
    try {
      paymentPreferencesSnapshot = { ...await api.updatePaymentPreferences(readPaymentPreferences()) };
      renderPaymentPreferenceFields(paymentProviders);
      toast("Payment preferences saved");
    } catch (err) {
      console.error(err);
      toast(err.message || "Couldn't save payment preferences.", "error");
      button.disabled = false;
    }
  });

  $("#paymentProviders").addEventListener("click", async (e) => {
    const toggle = e.target.closest("[data-gateway-toggle]");
    const connect = e.target.closest("[data-connect-gateway]");
    if (!toggle && !connect) return;
    const button = toggle || connect;
    button.disabled = true;
    try {
      if (connect) {
        await api.connectGateway(connect.dataset.connectGateway);
        toast("Payment provider connected");
      } else {
        await api.updateGatewayStatus(toggle.dataset.gatewayToggle, toggle.dataset.status === "active" ? "inactive" : "active");
        toast(toggle.dataset.status === "active" ? "Payment method disabled" : "Payment method enabled");
      }
      await Promise.all([loadPaymentManagement(), loadGateways()]);
    } catch (err) {
      console.error(err);
      toast(err.message || "Couldn't update payment provider.", "error");
      button.disabled = false;
    }
  });

  /* ================================================================ support */
  const ticketState = { all: [], status: "all", search: "" };
  const TICKET_STATUS = { open: "Open", pending_support: "With support", pending_merchant: "Waiting on you", resolved: "Resolved", closed: "Closed" };
  const TICKET_CATEGORY = { payments: "Payments", payouts: "Payouts", integration: "Integrations & gateways", account: "Account settings", billing: "Billing", general: "Other" };

  function renderSupportTickets() {
    const query = ticketState.search.trim().toLowerCase();
    const tickets = ticketState.all.filter((ticket) => {
      const matchesStatus = ticketState.status === "all" || ticket.status === ticketState.status;
      const matchesQuery = !query || [ticket.public_id, ticket.subject, ticket.category]
        .some((value) => String(value || "").toLowerCase().includes(query));
      return matchesStatus && matchesQuery;
    });
    $("#ticketsTable tbody").innerHTML = tickets.map((ticket) => `
      <tr data-ticket-view="${esc(ticket.public_id)}" tabindex="0" aria-label="View support request ${esc(ticket.public_id)}">
        <td class="td-id">${esc(ticket.public_id)}</td><td>${esc(ticket.subject)}</td>
        <td>${esc(TICKET_CATEGORY[ticket.category] || ticket.category)}</td>
        <td><span class="status status--${ticket.status === "resolved" || ticket.status === "closed" ? "success" : ticket.status === "open" ? "pending" : "processing"}">${esc(TICKET_STATUS[ticket.status] || ticket.status)}</span></td>
        <td class="td-date">${dateTime(ticket.created_at)}</td>
      </tr>`).join("");
    const hasTickets = tickets.length > 0;
    $("#ticketsEmpty").hidden = hasTickets;
    $("#ticketsTable").hidden = !hasTickets;
    $("#ticketsEmpty").textContent = ticketState.all.length
      ? "No support requests match your search or status filter."
      : "No support requests yet.";
  }

  async function loadSupportTickets() {
    try {
      ticketState.all = await api.listSupportTickets();
      renderSupportTickets();
    } catch (err) {
      console.error(err);
      toast("Couldn't load support requests.", "error");
    }
  }
  let ticketSearchTimer;
  $("#ticketSearch").addEventListener("input", (e) => {
    clearTimeout(ticketSearchTimer);
    ticketSearchTimer = setTimeout(() => {
      ticketState.search = e.target.value;
      renderSupportTickets();
    }, 140);
  });
  $("#ticketFilter").addEventListener("click", (e) => {
    const button = e.target.closest("[data-ticket-status]");
    if (!button) return;
    ticketState.status = button.dataset.ticketStatus;
    $$(".seg__btn", $("#ticketFilter")).forEach((item) => {
      item.classList.toggle("is-active", item === button);
      item.setAttribute("aria-selected", item === button ? "true" : "false");
    });
    renderSupportTickets();
  });
  async function showSupportTicket(publicId) {
    try {
      const ticket = await api.getSupportTicket(publicId);
      const messages = ticket.messages || [{ author_type: "merchant_user", author_name: state.user.full_name, body: ticket.message, created_at: ticket.created_at }];
      openModal(`${ticket.public_id} · ${ticket.subject}`, `
        <div class="ticket-detail-meta"><span class="status status--${ticket.status === "resolved" || ticket.status === "closed" ? "success" : ticket.status === "open" ? "pending" : "processing"}">${esc(TICKET_STATUS[ticket.status] || ticket.status)}</span><span class="muted">${esc(TICKET_CATEGORY[ticket.category] || ticket.category)} · ${dateTime(ticket.created_at)}</span></div>
        ${ticket.related_transaction_public_id ? `<p class="ticket-reference">Related transaction: <strong>${esc(ticket.related_transaction_public_id)}</strong></p>` : ""}
        <div class="ticket-thread">${messages.map((message) => `<article class="ticket-message ${message.author_type === "merchant_user" ? "ticket-message--merchant" : ""}"><div class="ticket-message__head"><strong>${esc(message.author_name || (message.author_type === "merchant_user" ? "You" : "Purpose Gateway Support"))}</strong><time>${dateTime(message.created_at)}</time></div><p>${esc(message.body)}</p></article>`).join("")}</div>
        <div class="ticket-note muted">You’ll receive an update when our team replies.</div>`);
    } catch (err) {
      console.error(err);
      toast(err.message || "Couldn't load that support request.", "error");
    }
  }
  $("#ticketsTable").addEventListener("click", (e) => {
    const row = e.target.closest("[data-ticket-view]");
    if (row) showSupportTicket(row.dataset.ticketView);
  });
  $("#ticketsTable").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const row = e.target.closest("[data-ticket-view]");
    if (!row) return;
    e.preventDefault();
    showSupportTicket(row.dataset.ticketView);
  });
  $("#supportMessage").addEventListener("input", (e) => {
    $("#supportCharCount").textContent = e.target.value.length;
  });
  $("#supportForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!form.reportValidity()) return;
    const button = $("button[type=submit]", form);
    button.disabled = true;
    try {
      const ticket = await api.createSupportTicket({
        category: $("#supportCategory").value,
        subject: $("#supportSubject").value,
        related_transaction_id: $("#supportTransaction").value.trim(),
        message: $("#supportMessage").value,
      });
      form.reset();
      $("#supportCharCount").textContent = "0";
      await loadSupportTickets();
      toast(`Message sent · ${ticket.public_id}`);
    } catch (err) {
      console.error(err);
      toast(err.message || "Couldn't send your message.", "error");
    } finally { button.disabled = false; }
  });

  /* ================================================================ notifications */
  async function loadNotifications() {
    const list = await api.listNotifications();
    const unread = list.filter((n) => !n.read_at).length;
    $("#bellDot").hidden = unread === 0;
    $("#bellBtn").setAttribute("aria-label", unread ? `Notifications, ${unread} unread` : "Notifications");
    const TONE = { payout: ["i-payout", "var(--green-50)", "var(--green)"], payment_failed: ["i-alert", "var(--red-50)", "var(--red)"], gateway: ["i-link", "var(--amber-50)", "var(--amber)"], system: ["i-bars", "var(--primary-50)", "var(--primary)"] };
    $("#notifList").innerHTML = list.map((n) => {
      const [ic, bg, fg] = TONE[n.type] || TONE.system;
      return `<li class="notif ${n.read_at ? "" : "is-unread"}">
        <span class="notif__icon" style="background:${bg};color:${fg}">${icon(ic)}</span>
        <div><div class="notif__title">${esc(n.title)}</div><div class="notif__body">${esc(n.body)}</div><div class="notif__time">${timeAgo(n.created_at)}</div></div>
      </li>`;
    }).join("") || `<li class="notif muted">You're all caught up.</li>`;
  }
  $("#bellBtn").addEventListener("click", () => togglePop($("#bellBtn"), $("#notifPanel")));
  $("#markAllRead").addEventListener("click", async () => { await api.markAllNotificationsRead(); loadNotifications(); });

  /* ================================================================ modal */
  const modal = $("#modal");
  let lastFocus = null;
  function openModal(title, html, onMount) {
    closePop();
    lastFocus = document.activeElement;
    $("#modalTitle").textContent = title;
    const body = $("#modalBody");
    body.innerHTML = html;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    onMount && onMount(body);
    const f = body.querySelector("input, select, textarea, button");
    (f || $(".modal__head [data-close]")).focus();
  }
  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = sidebar.classList.contains("is-open") ? "hidden" : "";
    lastFocus && document.contains(lastFocus) && lastFocus.focus();
  }
  modal.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeModal(); });
  modal.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const f = $$("button, input, select, textarea, a[href]", modal).filter((x) => !x.disabled && x.offsetParent !== null);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });

  /* ================================================================ actions */
  async function openWithdraw() {
    const [{ accounts, rules }, bal] = await Promise.all([api.listPayoutAccounts(), api.getBalance()]);
    const max = bal.available_minor;
    openModal("Withdraw funds", `
      <form id="wdForm" novalidate>
        <div class="field">
          <label for="wdAmount">Amount</label>
          <div class="amount-input"><span>৳</span><input id="wdAmount" inputmode="decimal" placeholder="0.00" autocomplete="off" aria-describedby="wdHint wdErr" /></div>
          <div class="quick-amts">
            <button type="button" data-pct="25">25%</button><button type="button" data-pct="50">50%</button><button type="button" data-pct="100">Max</button>
          </div>
          <span class="field__hint" id="wdHint">Available ${money(max, true)} · minimum ${money(rules.min_payout_minor)}</span>
          <span class="field__error" id="wdErr" role="alert"></span>
        </div>
        <div class="field">
          <label for="wdAcc">Send to</label>
          <select id="wdAcc">${accounts.map((a) => `<option value="${esc(a.id)}" ${a.is_default ? "selected" : ""}>${esc(a.label)}</option>`).join("")}</select>
        </div>
        <div class="form-actions"><button type="button" class="btn btn--ghost" data-close>Cancel</button><button class="btn btn--primary" type="submit">Withdraw ${icon("i-send")}</button></div>
      </form>`, (body) => {
      const input = $("#wdAmount", body);
      body.addEventListener("click", (e) => {
        const q = e.target.closest("[data-pct]"); if (!q) return;
        input.value = (Math.floor((max * +q.dataset.pct) / 100) / 100).toFixed(2);
        input.dispatchEvent(new Event("input"));
      });
      input.addEventListener("input", () => { input.value = input.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"); $("#wdErr", body).textContent = ""; input.removeAttribute("aria-invalid"); });
      $("#wdForm", body).addEventListener("submit", async (e) => {
        e.preventDefault();
        const minor = Math.round(parseFloat(input.value || "0") * 100);
        const err = !minor ? "Enter an amount to withdraw." : minor < rules.min_payout_minor ? `Minimum payout is ${money(rules.min_payout_minor)}.` : minor > max ? "That's more than your available balance." : "";
        if (err) { $("#wdErr", body).textContent = err; input.setAttribute("aria-invalid", "true"); input.focus(); return; }
        const btn = $("button[type=submit]", body); btn.disabled = true; btn.textContent = "Processing…";
        try {
          const po = await api.createPayout({ payout_account_id: $("#wdAcc", body).value, amount_minor: minor });
          const acc = accounts.find((a) => a.id === po.payout_account_id);
          if (location.hash === "#payouts") loadPayoutPage();
          body.innerHTML = `
            <div class="success-box">
              <div class="success-box__icon">${icon("i-check")}</div>
              <h3 style="font-size:18px">Withdrawal requested</h3>
              <p class="muted" style="margin:6px 0 18px">${money(minor, true)} is on its way to ${esc(acc.label)}. It usually arrives within 1 business day.</p>
            </div>
            <dl class="kv"><dt>Payout ID</dt><dd>${esc(po.public_id)}</dd><dt>Status</dt><dd><span class="status status--processing">Processing</span></dd></dl>
            <button class="btn btn--primary btn--block" data-close>Done</button>`;
          $("button", body).focus();
          loadBalance();
        } catch (ex) { $("#wdErr", body).textContent = ex.message; btn.disabled = false; btn.innerHTML = `Withdraw ${icon("i-send")}`; }
      });
    });
  }

  function openCreateLink() {
    openModal("Create payment link", `
      <form id="plForm" novalidate>
        <div class="field">
          <label for="plTitle">Title</label>
          <input id="plTitle" maxlength="80" placeholder="e.g. Eid Collection Order" autocomplete="off" />
          <span class="field__error" id="plTitleErr" role="alert"></span>
        </div>
        <div class="field">
          <label for="plAmount">Amount</label>
          <div class="amount-input"><span>৳</span><input id="plAmount" inputmode="decimal" placeholder="0.00" autocomplete="off" /></div>
          <label style="display:flex;gap:8px;align-items:center;font-weight:500;font-size:13px;margin-top:4px"><input type="checkbox" id="plOpen" style="width:16px;height:16px" /> Let the customer enter the amount</label>
          <span class="field__error" id="plAmtErr" role="alert"></span>
        </div>
        <div class="field">
          <label for="plDesc">Description <span class="muted" style="font-weight:400">(optional)</span></label>
          <textarea id="plDesc" maxlength="300" placeholder="What is the customer paying for?"></textarea>
        </div>
        <div class="form-actions"><button type="button" class="btn btn--ghost" data-close>Cancel</button><button class="btn btn--primary" type="submit">Create link</button></div>
      </form>`, (body) => {
      const amt = $("#plAmount", body), open = $("#plOpen", body);
      open.addEventListener("change", () => { amt.disabled = open.checked; if (open.checked) { amt.value = ""; $("#plAmtErr", body).textContent = ""; } });
      amt.addEventListener("input", () => { amt.value = amt.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"); });
      $("#plForm", body).addEventListener("submit", async (e) => {
        e.preventDefault();
        const title = $("#plTitle", body).value.trim();
        const minor = open.checked ? null : Math.round(parseFloat(amt.value || "0") * 100);
        const tErr = title ? "" : "Give the link a title.";
        const aErr = open.checked ? "" : !minor ? "Enter an amount, or let the customer choose." : minor < 1000 ? "Minimum amount is ৳10." : "";
        $("#plTitleErr", body).textContent = tErr; $("#plAmtErr", body).textContent = aErr;
        $("#plTitle", body).setAttribute("aria-invalid", tErr ? "true" : "false"); amt.setAttribute("aria-invalid", aErr ? "true" : "false");
        if (tErr) return $("#plTitle", body).focus();
        if (aErr) return amt.focus();
        const btn = $("button[type=submit]", body); btn.disabled = true; btn.textContent = "Creating…";
        try {
          const link = await api.createPaymentLink({ title, amount_minor: minor, description: $("#plDesc", body).value.trim() });
          if (location.hash === "#payment-links") loadPaymentLinks();
          body.innerHTML = `
          <div class="success-box">
            <div class="success-box__icon">${icon("i-link")}</div>
            <h3 style="font-size:18px">Your link is ready</h3>
            <p class="muted" style="margin-top:6px">${esc(link.title)} · ${link.amount_minor ? money(link.amount_minor, true) : "Customer sets amount"}</p>
          </div>
          <div class="copy-row"><input readonly value="${esc(link.url)}" aria-label="Payment link URL" /><button class="btn btn--primary btn--sm" data-copy-link>${icon("i-copy")}Copy</button></div>
          <button class="btn btn--ghost btn--block" data-close>Done</button>`;
          $("[data-copy-link]", body).addEventListener("click", () => copyText(link.url, "Payment link copied"));
          $("[data-copy-link]", body).focus();
        } catch (err) {
          console.error(err);
          $("#plAmtErr", body).textContent = err.message || "Couldn't create your payment link.";
          btn.disabled = false;
          btn.textContent = "Create link";
        }
      });
    });
  }

  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-action]"); if (!a) return;
    const act = a.dataset.action;
    closePop();
    if (act === "withdraw") openWithdraw();
    if (act === "create-link") openCreateLink();
    if (act === "export") exportCsv();
    if (act === "logout") toast("You've been logged out (demo).");
  });

  /* ================================================================ boot */
  (async function init() {
    try {
      await loadSession();
      route();
      await Promise.all([loadKpis(), loadRevenue(), loadBalance(), loadGateways(), loadRecent(), loadNotifications()]);
    } catch (err) {
      console.error(err);
      toast("Something went wrong loading your dashboard.", "error");
    }
  })();
})();
