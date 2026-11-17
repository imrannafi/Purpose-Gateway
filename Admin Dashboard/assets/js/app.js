/* =========================================================
   Purpose Gateway — Admin Dashboard (UI controller)
   ========================================================= */
(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nfIN = new Intl.NumberFormat('en-IN');
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const icon = (id) => `<svg><use href="#i-${id}"/></svg>`;

  const state = { range: '30d', chartPeriod: 'month', chart: null };

  /* ---------- formatting ---------- */
  function timeAgo(iso) {
    const s = Math.max(1, Math.round((Date.now() - new Date(iso)) / 1000));
    if (s < 60) return 'just now';
    const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60); if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`;
    const d = Math.round(h / 24); return `${d} day${d > 1 ? 's' : ''} ago`;
  }
  function fmtDateTime(iso) {
    // Display in Asia/Dhaka as "Nov 30, 2025 – 14:32"
    const d = new Date(iso);
    const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Dhaka' });
    const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Dhaka' });
    return `${date} – ${time}`;
  }

  /* ---------- provider marks (simplified brand glyphs) ---------- */
  const LOGOS = {
    bkash: `<svg viewBox="0 0 48 44"><path d="M4 8l20 9-6 18z" fill="#e2136e"/><path d="M24 17 44 4l-9 27z" fill="#c4105f"/><path d="M18 35l6-18 11 14z" fill="#f04d93"/><path d="M18 35l-4 8 9-6z" fill="#e2136e"/></svg>`,
    nagad: `<svg viewBox="0 0 48 44"><circle cx="24" cy="23" r="17" fill="#f15a29"/><circle cx="24" cy="23" r="12" fill="#fff"/><circle cx="24" cy="23" r="9" fill="#f7941d"/><path d="M24 14a9 9 0 0 1 9 9h-5a4 4 0 0 0-4-4z" fill="#ed1c24"/><circle cx="24" cy="23" r="3.2" fill="#fff"/><path d="M30 4c4 2 6 5 6 8-3-2-6-3-9-3z" fill="#ed1c24"/></svg>`,
    rocket: `<svg viewBox="0 0 64 44"><path d="M40 6l14-4-4 14-6 2-6-6z" fill="#8c3494"/><path d="M38 14l6 6-3 3-6-6z" fill="#b04aa8"/><text x="32" y="36" text-anchor="middle" font-family="Inter,Arial" font-weight="800" font-size="15" fill="#8c3494" letter-spacing="-.5">ROCKET</text><text x="12" y="16" font-family="Inter,Arial" font-weight="700" font-size="6" fill="#8c3494">ROCKET</text></svg>`,
    visa: `<svg viewBox="0 0 64 44"><text x="32" y="30" text-anchor="middle" font-family="Arial Black,Inter,Arial" font-weight="900" font-style="italic" font-size="22" style="fill:var(--visa-ink)" letter-spacing="-1">VISA</text></svg>`,
    mastercard: `<svg viewBox="0 0 48 44"><circle cx="17" cy="22" r="13" fill="#eb001b"/><circle cx="31" cy="22" r="13" fill="#f79e1b"/><path d="M24 11a13 13 0 0 1 0 22 13 13 0 0 1 0-22z" fill="#ff5f00"/></svg>`,
  };

  /* ---------- renderers ---------- */
  async function renderKpis() {
    const box = $('#kpis');
    box.innerHTML = '<div class="kpi skeleton"></div>'.repeat(4);
    const k = await DataService.getKpis(state.range);
    const cards = [
      { cls: 'primary', icon: 'card',   label: 'Total Transactions', value: nfIN.format(k.totalTransactions), delta: k.txDelta,      spark: k.sparks.totalTransactions, color: '#ffffff' },
      { cls: 'green',   icon: 'check',  label: 'Success Rate',       value: k.successRate + '%',             delta: k.successDelta, spark: k.sparks.successRate,       color: '#16b364' },
      { cls: 'blue',    icon: 'dollar', label: 'Total Revenue',      value: '৳ ' + nfIN.format(k.totalRevenue), delta: k.revenueDelta, spark: k.sparks.totalRevenue,    color: '#2563eb' },
      { cls: 'red',     icon: 'excl',   label: 'Risk Alerts',        value: nfIN.format(k.riskAlerts),       delta: k.riskDelta,    spark: k.sparks.riskAlerts,        color: '#ef2b4a', alert: true },
    ];
    box.innerHTML = '';
    cards.forEach((c) => {
      const up = c.delta >= 0;
      const node = document.createElement('article');
      node.className = `kpi kpi--${c.cls}`;
      node.innerHTML = `
        <span class="kpi__ico">${c.alert ? `<svg viewBox="0 0 24 24"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" fill="#fff"/><path d="M12 9v4M12 17h.01" stroke="#e11d48" stroke-width="2.4" stroke-linecap="round"/></svg>` : icon(c.icon)}</span>
        <div class="kpi__body">
          <div class="kpi__label">${c.label}</div>
          <div class="kpi__value">${c.value}</div>
          <div class="kpi__delta">${icon(up ? 'up' : 'down')}${Math.abs(c.delta).toFixed(1)}%</div>
        </div>`;
      Charts.sparkline(node, c.spark, c.color);
      box.appendChild(node);
    });
  }

  async function renderProviders() {
    const box = $('#providers');
    box.innerHTML = '<div class="provider skeleton" style="height:140px"></div>'.repeat(5);
    const list = await DataService.getProviders();
    box.innerHTML = list.map((p) => `
      <div class="provider" title="Success ${p.successRate}% · Avg latency ${p.avgLatencyMs}ms">
        <div class="provider__logo">${LOGOS[p.code] || ''}</div>
        <div class="provider__name">${esc(p.name)}</div>
        <div class="provider__status ${p.status === 'online' ? '' : p.status === 'degraded' ? 'is-degraded' : 'is-down'}">${p.status[0].toUpperCase() + p.status.slice(1)}</div>
        <div class="provider__uptime">${p.uptime}%</div>
      </div>`).join('');
    const healthy = list.every((p) => p.status === 'online');
    const st = $('#providersStatus');
    st.classList.toggle('is-warn', !healthy);
    st.innerHTML = `<span class="tick">${icon(healthy ? 'check' : 'excl')}</span>${healthy ? 'All Payment Providers are Healthy' : 'Some providers need attention'}`;
  }

  async function renderChart() {
    const box = $('#txChart');
    const data = await DataService.getTransactionSeries(state.chartPeriod);
    if (state.chart) state.chart.destroy();
    state.chart = Charts.areaChart(box, data, [
      { key: 'successful', name: 'Successful', color: cssVar('--series-success'), fill: true, fillOpacity: 0.22, width: 2.4 },
      { key: 'pending',    name: 'Pending',    color: cssVar('--series-pending'), fill: true, fillOpacity: 0.14 },
      { key: 'failed',     name: 'Failed',     color: cssVar('--series-failed'),  fill: true, fillOpacity: 0.12 },
    ], { highlightIndex: state.chartPeriod === 'month' ? 20 : data.length - 1 });
  }

  async function renderMerchants() {
    const s = await DataService.getMerchantStats();
    $('#merchantTotal').textContent = `Total Merchants: ${nfIN.format(s.total)}`;
    $('#merchantStats').innerHTML = `
      <div class="mstat mstat--blue"><span class="mstat__ico">${icon('user')}</span><strong>${nfIN.format(s.total)}</strong><span>Total</span></div>
      <div class="mstat mstat--green"><span class="mstat__ico">${icon('check')}</span><strong>${nfIN.format(s.active)}</strong><span>Active</span></div>
      <div class="mstat mstat--red"><span class="mstat__ico">${icon('pause')}</span><strong>${nfIN.format(s.suspended)}</strong><span>Suspended</span></div>`;
  }

  async function renderRisk() {
    const r = await DataService.getRiskSummary();
    $('#riskCount').textContent = r.openCount;
    $('#riskList').innerHTML = r.byType.map((t) => `<li class="sev-${t.severity}">${esc(t.label)}</li>`).join('');
  }

  const ACT_ICON = {
    transaction: ['green', 'plus'],
    routing: ['blue', 'cog'],
    risk: ['red', 'excl'],
    merchant: ['violet', 'user'],
  };
  async function renderActivity() {
    const list = await DataService.getRecentActivity(4);
    $('#activity').innerHTML = list.map((a) => {
      const [c, i] = ACT_ICON[a.kind] || ['blue', 'pulse'];
      return `<li>
        <span class="act-ico act-ico--${c}">${icon(i)}</span>
        <div class="act-main"><strong>${esc(a.title)}</strong>${a.meta ? `<small>${esc(a.meta)}</small>` : ''}</div>
        <span class="act-time">${timeAgo(a.createdAt)}</span>
        <span class="badge badge--${a.status}">${a.status[0].toUpperCase() + a.status.slice(1)}</span>
      </li>`;
    }).join('');
  }

  async function renderAudit() {
    const list = await DataService.getAuditLogs(4);
    $('#auditTable tbody').innerHTML = list.map((l) => `
      <tr>
        <td data-label="Time">${fmtDateTime(l.createdAt)}</td>
        <td data-label="Action">${esc(l.action)}</td>
        <td data-label="Performed By">${esc(l.actorName)}</td>
        <td data-label="IP Address">${esc(l.ipAddress)}</td>
      </tr>`).join('');
  }

  async function renderNotifications() {
    const list = await DataService.getNotifications();
    const unread = list.filter((n) => !n.read).length;
    const badge = $('#notifCount');
    badge.textContent = unread; badge.hidden = unread === 0;
    const colors = { danger: 'var(--red)', warning: 'var(--orange)', info: 'var(--blue)' };
    $('#notifList').innerHTML = list.map((n) => `
      <li class="${n.read ? '' : 'unread'}"><span class="n-dot" style="background:${colors[n.level]}"></span>
        <div><p>${esc(n.title)}</p><small>${timeAgo(n.createdAt)}</small></div></li>`).join('');
  }

  /* ---------- UI: toast ---------- */
  let toastT;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2600);
  }

  /* ---------- UI: dropdown menus ---------- */
  function bindDropdown(btn, menu, onOpen) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = menu.hidden;
      closeMenus();
      if (open) { menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); onOpen && onOpen(); }
    });
    menu.addEventListener('click', (e) => e.stopPropagation());
  }
  function closeMenus() {
    $$('.menu').forEach((m) => (m.hidden = true));
    $$('[aria-expanded="true"]').forEach((b) => b.id !== 'menuBtn' && b.setAttribute('aria-expanded', 'false'));
  }
  document.addEventListener('click', closeMenus);

  bindDropdown($('#notifBtn'), $('#notifMenu'));
  bindDropdown($('#profileBtn'), $('#profileMenu'));
  bindDropdown($('#userMenuBtn'), $('#profileMenu'));
  bindDropdown($('#rangeBtn'), $('#rangeMenu'));
  bindDropdown($('#chartRangeBtn'), $('#chartRangeMenu'));

  $('#markRead').addEventListener('click', async () => { await DataService.markAllNotificationsRead(); renderNotifications(); });

  $$('#rangeMenu [data-range]').forEach((b) => b.addEventListener('click', () => {
    $$('#rangeMenu [data-range]').forEach((x) => x.classList.toggle('is-selected', x === b));
    state.range = b.dataset.range; $('#rangeLabel').textContent = b.textContent;
    closeMenus(); renderKpis();
  }));
  $$('#chartRangeMenu [data-chart]').forEach((b) => b.addEventListener('click', () => {
    $$('#chartRangeMenu [data-chart]').forEach((x) => x.classList.toggle('is-selected', x === b));
    state.chartPeriod = b.dataset.chart; $('#chartRangeLabel').textContent = b.textContent;
    closeMenus(); renderChart();
  }));

  /* ---------- UI: sidebar drawer (mobile/tablet) ---------- */
  const sidebar = $('#sidebar'), scrim = $('#scrim'), menuBtn = $('#menuBtn');
  function setDrawer(open) {
    sidebar.classList.toggle('is-open', open);
    scrim.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  }
  menuBtn.addEventListener('click', (e) => { e.stopPropagation(); setDrawer(true); });
  $('#sidebarClose').addEventListener('click', () => setDrawer(false));
  scrim.addEventListener('click', () => setDrawer(false));
  matchMedia('(min-width: 1025px)').addEventListener('change', (e) => e.matches && setDrawer(false));

  /* ---------- UI: navigation (hash routing) ---------- */
  const PAGE_TITLES = {
    providers: 'Payment Providers', routing: 'Smart Routing', merchants: 'Merchants', risk: 'Risk Alerts',
    audit: 'Audit Logs', settings: 'Settings', monitor: 'System Monitor', activity: 'Recent Activity',
  };
  function route() {
    const page = (location.hash || '#dashboard').slice(1);
    if (page === 'logout') { toast('Signed out (demo)'); history.replaceState(null, '', '#dashboard'); return route(); }
    const isDash = page === 'dashboard' || !PAGE_TITLES[page];
    $$('.nav__item').forEach((a) => a.classList.toggle('is-active', a.dataset.page === (isDash ? 'dashboard' : page)));
    $('#view-dashboard').hidden = !isDash;
    $('#view-module').hidden = isDash;
    if (!isDash) $('#moduleTitle').textContent = PAGE_TITLES[page];
    document.title = `${isDash ? 'Dashboard' : PAGE_TITLES[page]} · Purpose Gateway Admin`;
    if (isDash && state.chart) requestAnimationFrame(() => state.chart.rerender());
    setDrawer(false); closeMenus();
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }
  window.addEventListener('hashchange', route);

  /* ---------- UI: theme ---------- */
  const themeBtn = $('#themeBtn');
  function syncThemeIcon() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    themeBtn.innerHTML = icon(dark ? 'moon' : 'sun');
    themeBtn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  }
  themeBtn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('pg-theme', next); } catch (e) {}
    syncThemeIcon(); renderChart();
  });

  /* ---------- UI: global search ---------- */
  const input = $('#globalSearch'), results = $('#searchResults');
  let focusIdx = -1, current = [];
  async function doSearch() {
    current = await DataService.search(input.value);
    focusIdx = -1;
    if (!input.value.trim()) { results.hidden = true; return; }
    results.innerHTML = current.length
      ? current.map((r, i) => `<button type="button" role="option" data-i="${i}">${icon('search')}<span>${esc(r.label)}</span><small>${esc(r.type)}</small></button>`).join('')
      : '<div class="empty-row">No results found</div>';
    results.hidden = false;
  }
  function pick(i) {
    const r = current[i]; if (!r) return;
    results.hidden = true; input.value = ''; input.blur();
    location.hash = r.page; toast(`Opened ${r.type.toLowerCase()}: ${r.label}`);
  }
  input.addEventListener('input', doSearch);
  input.addEventListener('focus', () => input.value && doSearch());
  input.addEventListener('keydown', (e) => {
    const btns = $$('button', results);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusIdx = (focusIdx + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % (btns.length || 1);
      btns.forEach((b, i) => b.classList.toggle('is-focus', i === focusIdx));
    } else if (e.key === 'Enter') { pick(focusIdx < 0 ? 0 : focusIdx); }
    else if (e.key === 'Escape') { results.hidden = true; input.blur(); }
  });
  results.addEventListener('mousedown', (e) => { const b = e.target.closest('button'); if (b) { e.preventDefault(); pick(+b.dataset.i); } });
  input.addEventListener('blur', () => setTimeout(() => (results.hidden = true), 120));
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.focus(); }
    if (e.key === 'Escape') { closeMenus(); setDrawer(false); }
  });
  $('.search kbd').textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K';

  /* ---------- boot ---------- */
  syncThemeIcon();
  route();
  Promise.all([renderKpis(), renderProviders(), renderChart(), renderMerchants(), renderRisk(), renderActivity(), renderAudit(), renderNotifications()])
    .catch((err) => { console.error(err); toast('Failed to load dashboard data'); });
})();
