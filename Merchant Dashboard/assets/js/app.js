/**
 * Merchant Dashboard UI. Talks only to window.PG_API.
 */
(function () {
  const api = window.PG_API;
  const charts = window.PG_CHARTS;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
  function openDrawer() { sidebar.classList.add("is-open"); scrim.hidden = false; menuBtn.setAttribute("aria-expanded", "true"); document.body.style.overflow = "hidden"; $(".nav__item.is-active", sidebar).focus(); }
  function closeDrawer() { sidebar.classList.remove("is-open"); scrim.hidden = true; menuBtn.setAttribute("aria-expanded", "false"); document.body.style.overflow = ""; }
  menuBtn.addEventListener("click", openDrawer);
  $("#sidebarClose").addEventListener("click", () => { closeDrawer(); menuBtn.focus(); });
  scrim.addEventListener("click", closeDrawer);
  window.matchMedia("(min-width: 1101px)").addEventListener("change", (e) => e.matches && closeDrawer());

  /* ================================================================ routing */
  const SECTIONS = {
    dashboard: null,
    transactions: { title: "Transactions", sub: "Every payment that came through your gateways." },
    "payment-links": { title: "Payment Links", sub: "Share a link and get paid without a website.", icon: "i-link", text: "Create, share and track payment links. Use Quick Actions → Create Payment Link to make one now." },
    analytics: { title: "Analytics", sub: "Trends across revenue, methods and customers.", icon: "i-bars", text: "Deeper reports (method mix, conversion, cohort retention) are coming in the next phase." },
    payouts: { title: "Payouts", sub: "Move your balance to your bank or wallet.", icon: "i-payout", text: "Payout history and schedules are coming next. You can already withdraw from the Available Balance card." },
    settings: { title: "Settings", sub: "Business profile, gateways, API keys and webhooks.", icon: "i-gear", text: "Business profile, team members, API keys and webhook settings will live here." },
    support: { title: "Support", sub: "We're here to help.", icon: "i-help", text: "Open a ticket or chat with our team. Support tickets arrive in the next phase." },
  };

  function route() {
    const key = (location.hash.slice(1) || "dashboard");
    const name = key in SECTIONS ? key : "dashboard";
    $$(".nav__item").forEach((a) => a.classList.toggle("is-active", a.dataset.nav === name));
    $$(".nav__item").forEach((a) => a.dataset.nav === name ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
    const viewName = name === "dashboard" || name === "transactions" ? name : "placeholder";
    $$(".view").forEach((v) => v.classList.toggle("is-active", v.dataset.view === viewName));
    $("#rangeDropdown").hidden = name !== "dashboard";

    if (name === "dashboard") {
      $("#pageTitle").innerHTML = `Welcome back, <span id="firstName">${esc(state.firstName)}</span>! <span class="wave" aria-hidden="true">👋</span>`;
      $("#pageSubtitle").textContent = "Here's what's happening with your payments today.";
    } else {
      const s = SECTIONS[name];
      $("#pageTitle").textContent = s.title;
      $("#pageSubtitle").textContent = s.sub;
      if (viewName === "placeholder") {
        $("#phTitle").textContent = s.title;
        $("#phText").textContent = s.text;
        $("#phIcon").innerHTML = `<use href="#${s.icon}"/>`;
      }
      if (name === "transactions") loadAllTransactions();
    }
    document.title = (name === "dashboard" ? "Merchant Dashboard" : SECTIONS[name].title) + " · Purpose Gateway";
    closeDrawer();
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
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
  };
  try { state.hideBalance = localStorage.getItem("pg.hideBalance") === "1"; } catch {}

  /* ================================================================ session / profile */
  async function loadSession() {
    const { user } = await api.getSession();
    state.firstName = user.full_name.split(" ")[0];
    $("#profileName").textContent = user.full_name;
    $("#profileRole").textContent = user.display_title;
    $("#profileAvatar").textContent = ((n) => (n[0][0] + (n.length > 1 ? n[n.length - 1][0] : "")).toUpperCase())(user.full_name.trim().split(/\s+/));
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
        <span class="gw__logo">${g.logo_url ? `<img src="${esc(g.logo_url)}" alt="">` : LOGOS[g.code] || ""}<span class="gw__status ${g.status === "active" ? "" : "is-warn"}"></span></span>
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
            <div class="success-box__icon" style="background:var(--surface-2)"><span class="gw__logo" style="width:40px;height:40px">${LOGOS[g.code] || ""}</span></div>
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
            ${list.map((g) => `<li><div class="gw"><span class="gw__logo">${LOGOS[g.code] || ""}<span class="gw__status ${g.status === "active" ? "" : "is-warn"}"></span></span>${esc(g.name)}</div></li>`).join("")}
          </ul>
          <button class="btn btn--ghost btn--block" data-close>Close</button>`);
      }
    };
  }

  /* ================================================================ transactions */
  function methodCell(t) {
    const isVisa = t.provider_code === "visa";
    return `<span class="method"><span class="method__logo ${isVisa ? "method__logo--visa" : ""}">${LOGOS[t.provider_code] || ""}</span>${esc(t.provider_name)}</span>`;
  }
  function txRow(t) {
    return `<tr>
      <td class="td-id" data-col="id">#${esc(t.public_id)}</td>
      <td data-col="customer">${esc(t.customer_name)}</td>
      <td class="td-amount" data-col="amount">${moneyTight(t.amount_minor)}</td>
      <td data-col="method">${methodCell(t)}</td>
      <td data-col="status"><span class="status status--${esc(t.status)}">${STATUS_LABEL[t.status] || esc(t.status)}</span></td>
      <td class="td-date" data-col="date">${dateTime(t.created_at)}</td>
      <td data-col="actions"><button class="icon-btn row-btn" data-row="${esc(t.public_id)}" data-status="${esc(t.status)}" aria-label="Actions for ${esc(t.public_id)}" aria-haspopup="menu" aria-expanded="false">${icon("i-dots")}</button></td>
    </tr>`;
  }
  async function loadRecent() {
    const { data } = await api.listTransactions({ page: 1, page_size: 4 });
    $("#recentTable tbody").innerHTML = data.map(txRow).join("") || `<tr><td class="table__empty" colspan="7">No transactions yet.</td></tr>`;
  }

  let txReq = 0;
  async function loadAllTransactions() {
    const my = ++txReq;
    const { search, status, page, page_size } = state.tx;
    const res = await api.listTransactions({ search, status, page, page_size });
    if (my !== txReq) return; // a newer request won
    state.tx.total = res.total;
    const pages = Math.max(1, Math.ceil(res.total / page_size));
    $("#allTable tbody").innerHTML = res.data.map(txRow).join("") || `<tr><td class="table__empty" colspan="7">No transactions match your filters.</td></tr>`;
    const from = res.total ? (page - 1) * page_size + 1 : 0;
    $("#txCount").textContent = `Showing ${from}–${Math.min(page * page_size, res.total)} of ${res.total}`;
    $("#txPage").textContent = `${page} / ${pages}`;
    $("#txPrev").disabled = page <= 1;
    $("#txNext").disabled = page >= pages;
  }
  let searchTimer;
  $("#txSearch").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.tx.search = e.target.value; state.tx.page = 1; loadAllTransactions(); }, 220);
  });
  $("#txFilter").addEventListener("click", (e) => {
    const b = e.target.closest("[data-status]"); if (!b) return;
    $$(".seg__btn", $("#txFilter")).forEach((x) => { x.classList.toggle("is-active", x === b); x.setAttribute("aria-selected", x === b ? "true" : "false"); });
    state.tx.status = b.dataset.status; state.tx.page = 1; loadAllTransactions();
  });
  $("#txPrev").addEventListener("click", () => { state.tx.page--; loadAllTransactions(); });
  $("#txNext").addEventListener("click", () => { state.tx.page++; loadAllTransactions(); });

  // row action menu
  const rowMenu = $("#rowMenu");
  let rowCtx = null;
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-row]");
    if (!btn) return;
    e.stopPropagation();
    rowCtx = { id: btn.dataset.row, status: btn.dataset.status };
    $("[data-row-action='refund']", rowMenu).setAttribute("aria-disabled", rowCtx.status === "success" ? "false" : "true");
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
        ${t.failure_message ? `<dt>Reason</dt><dd>${esc(t.failure_message)}</dd>` : ""}
      </dl>
      <div class="form-actions">
        <button class="btn btn--ghost" data-copy="${esc(t.public_id)}">${icon("i-copy")}Copy ID</button>
        ${t.status === "success" ? `<button class="btn btn--primary" data-refund="${esc(t.public_id)}">Refund</button>` : ""}
      </div>`, (body) => {
      body.addEventListener("click", (e) => {
        const c = e.target.closest("[data-copy]"); if (c) copyText(c.dataset.copy, `Copied ${c.dataset.copy}`);
        const r = e.target.closest("[data-refund]"); if (r) openRefund(r.dataset.refund);
      });
    });
  }

  async function openRefund(id) {
    const t = await api.getTransaction(id);
    openModal(`Refund #${t.public_id}`, `
      <form id="refundForm" novalidate>
        <div class="field">
          <label for="rfAmount">Refund amount</label>
          <div class="amount-input"><span>৳</span><input id="rfAmount" inputmode="decimal" value="${(t.amount_minor / 100).toFixed(2)}" autocomplete="off" /></div>
          <span class="field__hint">Up to ${money(t.amount_minor, true)} paid by ${esc(t.customer_name)}.</span>
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
        const minor = Math.round(parseFloat(input.value.replace(/,/g, "")) * 100);
        const err = !minor || minor <= 0 ? "Enter an amount." : minor > t.amount_minor ? "Can't refund more than was paid." : "";
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

  // CSV export of the current filter
  async function exportCsv() {
    const { data } = await api.listTransactions({ search: state.tx.search, status: state.tx.status, page: 1, page_size: 10000 });
    const head = ["transaction_id", "customer", "amount_bdt", "fee_bdt", "net_bdt", "method", "status", "created_at"];
    const rows = data.map((t) => [t.public_id, t.customer_name, (t.amount_minor / 100).toFixed(2), (t.fee_minor / 100).toFixed(2), (t.net_minor / 100).toFixed(2), t.provider_name, t.status, t.created_at]);
    const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(`Exported ${data.length} transactions`);
  }

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
        const link = await api.createPaymentLink({ title, amount_minor: minor, description: $("#plDesc", body).value.trim() });
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
      });
    });
  }

  function openUpgrade() {
    openModal("Upgrade to Pro", `
      <p class="muted" style="margin-bottom:14px">You're on the <b>Starter</b> plan. Pro gives growing businesses room to scale.</p>
      <dl class="kv">
        <dt>Monthly volume</dt><dd>৳5 lakh → <b>৳50 lakh</b></dd>
        <dt>MFS fee</dt><dd>1.5% → <b>1.2%</b></dd>
        <dt>Payment links</dt><dd>20 → <b>Unlimited</b></dd>
        <dt>Team members</dt><dd>2 → <b>10</b></dd>
        <dt>Payouts</dt><dd>Next day → <b>Same day</b></dd>
      </dl>
      <div class="form-actions"><button class="btn btn--ghost" data-close>Not now</button><button class="btn btn--primary" id="confirmUpgrade">Upgrade · ৳1,499/mo</button></div>`, (body) => {
      $("#confirmUpgrade", body).addEventListener("click", () => { closeModal(); toast("Thanks! Our team will contact you to activate Pro."); });
    });
  }

  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-action]"); if (!a) return;
    const act = a.dataset.action;
    closePop();
    if (act === "withdraw") openWithdraw();
    if (act === "create-link") openCreateLink();
    if (act === "upgrade") openUpgrade();
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
