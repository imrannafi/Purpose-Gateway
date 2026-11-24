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

  const state = {
    range: '30d', chartPeriod: 'month', chart: null, volumeChart: null, currentPage: null,
    merchantQuery: '', merchantStatus: 'all', merchantSearchTimer: null,
    providerModalId: null,
    financialFilters: { range: '30d', status: 'all', providerId: '', merchantId: '', discrepanciesOnly: false },
    refundFilters: { status: 'all', disputeStatus: 'all', q: '' },
    refundDetailId: null,
    transactionFilters: { id: '', merchantId: '', providerId: '', status: 'all', from: '', to: '', amountMin: '', amountMax: '', duplicatesOnly: false },
    riskFilters: { status: 'all', severity: 'all', type: 'all', q: '' },
    riskDetailId: null,
    reconciliationFilters: { batchId: '', exceptionType: 'all', reviewStatus: 'all', q: '' },
    systemMonitorFilters: { level: 'all', q: '' },
    adminUserFilters: { status: 'all', q: '' },
    adminUserDialogId: null,
    securityAuditFilters: { category: 'all', outcome: 'all', q: '', from: '', to: '' },
    alertFilters: { category: 'all', status: 'all', q: '' },
    adminSettings: { timeZone: 'Asia/Dhaka', dateFormat: 'medium', defaultRange: '30d' },
  };

  /* ---------- formatting ---------- */
  function timeAgo(iso) {
    const s = Math.max(1, Math.round((Date.now() - new Date(iso)) / 1000));
    if (s < 60) return 'just now';
    const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60); if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`;
    const d = Math.round(h / 24); return `${d} day${d > 1 ? 's' : ''} ago`;
  }
  function fmtDateTime(iso) {
    const d = new Date(iso);
    const timeZone = state.adminSettings.timeZone;
    const dateOptions = state.adminSettings.dateFormat === 'numeric'
      ? { day: '2-digit', month: '2-digit', year: 'numeric' }
      : state.adminSettings.dateFormat === 'iso'
        ? { year: 'numeric', month: '2-digit', day: '2-digit' }
        : { month: 'short', day: 'numeric', year: 'numeric' };
    const locale = state.adminSettings.dateFormat === 'iso' ? 'en-CA' : state.adminSettings.dateFormat === 'numeric' ? 'en-GB' : 'en-US';
    const date = d.toLocaleDateString(locale, { ...dateOptions, timeZone });
    const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone });
    return `${date} · ${time}`;
  }

  function applyDashboardRange(range) {
    state.range = range;
    state.chartPeriod = range === '7d' ? 'week' : range === '90d' ? 'quarter' : 'month';
    const rangeLabels = { '7d': 'Last 7 Days', '30d': 'Last 30 Days', '90d': 'Last 90 Days' };
    const chartLabels = { week: 'This Week', month: 'This Month', quarter: 'This Quarter' };
    $('#rangeLabel').textContent = rangeLabels[range];
    $('#chartRangeLabel').textContent = chartLabels[state.chartPeriod];
    $$('#rangeMenu [data-range]').forEach((button) => button.classList.toggle('is-selected', button.dataset.range === range));
    $$('#chartRangeMenu [data-chart]').forEach((button) => button.classList.toggle('is-selected', button.dataset.chart === state.chartPeriod));
  }

  function readProfileImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Unable to read the selected profile picture'));
      reader.readAsDataURL(file);
    });
  }

  function profilePictureSource(profile) {
    const picture = profile.avatarDataUrl || profile.avatarUrl || '';
    return /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(picture)
      ? picture
      : (/^https:\/\//i.test(picture) || (picture.startsWith('/') && !picture.startsWith('//')) ? picture : '');
  }

  function applyAdminIdentity(profile) {
    const name = String(profile.name || 'Admin');
    const safePicture = profilePictureSource(profile);
    const avatarMarkup = safePicture
      ? `<img src="${esc(safePicture)}" alt="">`
      : esc(name.trim().slice(0, 1).toUpperCase());
    $('#profileBtn .avatar').innerHTML = avatarMarkup;
    $('#profileBtn .profile-btn__name').textContent = name;
    $('#userMenuBtn .avatar').innerHTML = avatarMarkup;
    $('.user-chip__text strong').textContent = name;
  }

  async function renderAdminProfile() {
    const root = $('#adminProfileManagement');
    root.hidden = false;
    root.innerHTML = '<div class="card skeleton" style="height:280px"></div>';
    const profile = await DataService.getMyAdminProfile();
    applyAdminIdentity(profile);
    const picture = profilePictureSource(profile);
    const avatarMarkup = picture
      ? `<img src="${esc(picture)}" alt="${esc(profile.name)} profile picture">`
      : `<span>${esc(String(profile.name || 'A').trim().slice(0, 1).toUpperCase())}</span>`;
    root.innerHTML = `
      <header class="provider-page-head admin-profile-page-head">
        <div><p class="merchant-eyebrow">ACCOUNT</p><h1>My Admin Profile</h1><p>Manage your personal information and profile picture.</p></div>
        <span class="merchant-demo-note">${icon('shield')} Role and permissions are managed by an administrator</span>
      </header>
      <form id="myAdminProfileForm" class="card admin-profile-card">
        <section class="admin-profile-photo-section">
          <div class="admin-profile-photo" id="adminProfilePreview">${avatarMarkup}</div>
          <div class="admin-profile-photo-info"><h2>Profile picture</h2><p>Use a JPEG, PNG, or WebP image up to 2 MB. Your picture is visible to dashboard administrators.</p>
            <div class="admin-profile-photo-actions"><label class="merchant-btn" for="adminProfilePhoto">${icon('user')} Choose picture</label><input id="adminProfilePhoto" name="avatar" type="file" accept="image/jpeg,image/png,image/webp" hidden>${picture ? '<button type="button" class="merchant-btn merchant-btn--subtle" data-profile-action="remove-picture">Remove picture</button>' : ''}</div>
            <small class="admin-profile-photo-error" id="adminProfilePhotoError" role="alert"></small>
          </div>
        </section>
        <section class="admin-settings-section admin-profile-details">
          <div class="admin-section-heading"><div><h2>Personal information</h2><p>Keep your administrator contact details up to date.</p></div></div>
          <div class="admin-form-grid">
            <label>Full name<input name="name" required maxlength="100" autocomplete="name" value="${esc(profile.name || '')}"></label>
            <label>Work email<input type="email" name="email" required maxlength="254" autocomplete="email" value="${esc(profile.email || '')}"></label>
            <label>Job title<input name="jobTitle" maxlength="100" autocomplete="organization-title" value="${esc(profile.jobTitle || '')}" placeholder="e.g. Platform Administrator"></label>
            <label>Phone number<input type="tel" name="phone" maxlength="24" autocomplete="tel" value="${esc(profile.phone || '')}" placeholder="e.g. +880 1XXXXXXXXX"></label>
            <label>Admin role<input value="${esc(profile.role)}" readonly></label>
            <label>Account status<input value="${esc(profile.status === 'active' ? 'Active' : 'Inactive')}" readonly></label>
          </div>
        </section>
        <div class="admin-profile-save-bar"><p>Your role and permissions cannot be changed from your own profile.</p><button type="submit" class="merchant-btn merchant-btn--primary">Save profile</button></div>
      </form>
      <p class="admin-profile-footnote">${DataService.isDemoMode() ? 'Demo changes apply in memory and reset when the page is reloaded.' : 'Profile changes are saved to your administrator account.'}</p>`;
    const form = $('#myAdminProfileForm', root);
    const photoInput = $('#adminProfilePhoto', root);
    const photoError = $('#adminProfilePhotoError', root);
    let selectedAvatar = null;
    let removeAvatar = false;
    photoInput.addEventListener('change', async () => {
      const file = photoInput.files?.[0];
      if (!file) return;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
        photoInput.value = '';
        photoError.textContent = 'Choose a JPEG, PNG, or WebP image no larger than 2 MB.';
        return;
      }
      try {
        selectedAvatar = await readProfileImage(file);
        removeAvatar = false;
        photoError.textContent = '';
        $('#adminProfilePreview', root).innerHTML = `<img src="${esc(selectedAvatar)}" alt="Selected profile picture preview">`;
        root.querySelector('[data-profile-action="remove-picture"]')?.remove();
      } catch (error) {
        console.error(error);
        photoError.textContent = error.message || 'Unable to preview this picture.';
      }
    });
    root.onclick = (event) => {
      if (!event.target.closest('[data-profile-action="remove-picture"]')) return;
      selectedAvatar = '';
      removeAvatar = true;
      photoInput.value = '';
      photoError.textContent = '';
      $('#adminProfilePreview', root).innerHTML = `<span>${esc(String(form.elements.name.value || 'A').trim().slice(0, 1).toUpperCase())}</span>`;
      event.target.closest('[data-profile-action="remove-picture"]').remove();
    };
    form.onsubmit = async (event) => {
      event.preventDefault();
      const changes = {
        name: form.elements.name.value,
        email: form.elements.email.value,
        jobTitle: form.elements.jobTitle.value,
        phone: form.elements.phone.value,
      };
      if (selectedAvatar !== null || removeAvatar) changes.avatarDataUrl = selectedAvatar || '';
      try {
        const updated = await DataService.updateMyAdminProfile(changes);
        applyAdminIdentity(updated);
        await renderAdminProfile();
        toast(DataService.isDemoMode() ? 'Profile saved for this demo session' : 'Profile updated');
      } catch (error) {
        console.error(error);
        toast(error.message || 'Unable to save admin profile');
      }
    };
  }

  async function renderAdminSettings() {
    const root = $('#adminSettingsManagement');
    root.hidden = false;
    root.innerHTML = '<div class="card skeleton" style="height:280px"></div>';
    const [data, profile] = await Promise.all([DataService.getAdminSettings(), DataService.getMyAdminProfile()]);
    state.adminSettings = data.settings;
    const { timeZones, dateFormats, ranges } = data.options;
    const formatPreview = fmtDateTime(new Date().toISOString());
    const securityStatus = profile.twoFactorEnabled
      ? '<span class="settings-security-status is-secure">Two-factor authentication enabled</span>'
      : '<span class="settings-security-status is-warning">Two-factor authentication not enabled</span>';
    root.innerHTML = `
      <header class="provider-page-head admin-settings-page-head">
        <div><p class="merchant-eyebrow">PREFERENCES &amp; SECURITY</p><h1>Settings</h1><p>Personalize your dashboard and review important account controls.</p></div>
        <button type="button" class="merchant-btn" data-settings-action="theme">${icon(document.documentElement.getAttribute('data-theme') === 'dark' ? 'moon' : 'sun')} Switch to ${document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'} theme</button>
      </header>
      <form id="adminSettingsForm">
        <section class="card admin-settings-card">
          <header class="card__head"><div><h2>${icon('gear')} Dashboard preferences</h2><p class="card__sub">Choose how dates and reporting periods are displayed across the dashboard.</p></div></header>
          <div class="admin-settings-preference-grid">
            <label>Time zone<select name="timeZone" required>${timeZones.map((option) => `<option value="${esc(option.value)}" ${data.settings.timeZone === option.value ? 'selected' : ''}>${esc(option.label)}</option>`).join('')}</select><small>Displayed dates use this time zone.</small></label>
            <label>Date format<select name="dateFormat" required>${dateFormats.map((option) => `<option value="${esc(option.value)}" ${data.settings.dateFormat === option.value ? 'selected' : ''}>${esc(option.label)}</option>`).join('')}</select><small>Example: <span data-settings-preview>${esc(formatPreview)}</span></small></label>
            <label>Default dashboard period<select name="defaultRange" required>${ranges.map((option) => `<option value="${esc(option.value)}" ${data.settings.defaultRange === option.value ? 'selected' : ''}>${esc(option.label)}</option>`).join('')}</select><small>Applied when opening the dashboard.</small></label>
          </div>
          <div class="admin-settings-save-bar"><p>Preferences are saved in this browser in demo mode.</p><button type="submit" class="merchant-btn merchant-btn--primary">Save settings</button></div>
        </section>
      </form>
      <section class="card admin-settings-card">
        <header class="card__head"><div><h2>${icon('shield')} Account security</h2><p class="card__sub">Review security controls managed by your administrator account.</p></div></header>
        <div class="admin-settings-security-grid">
          <article><span class="admin-settings-security-icon">${icon('user')}</span><div><strong>Two-factor authentication</strong><small>${securityStatus}</small></div><a class="merchant-btn merchant-btn--subtle" href="#admin-users" data-page="admin-users">Manage account security</a></article>
          <article><span class="admin-settings-security-icon">${icon('monitor')}</span><div><strong>Sign-in and access history</strong><small>Review recent sign-ins and approved-network settings.</small></div><a class="merchant-btn merchant-btn--subtle" href="#admin-users" data-page="admin-users">Review admins</a></article>
          <article><span class="admin-settings-security-icon">${icon('file')}</span><div><strong>Security audit trail</strong><small>Review administrative and authentication events.</small></div><a class="merchant-btn merchant-btn--subtle" href="#audit" data-page="audit">Open security center</a></article>
        </div>
        <p class="admin-settings-security-note">Password changes, session revocation, sign-in restrictions, and two-factor enrollment must be performed by the authenticated identity backend; they are not simulated here.</p>
      </section>
      <section class="card admin-settings-card admin-settings-shortcuts">
        <header class="card__head"><div><h2>${icon('pulse')} Account &amp; operations</h2><p class="card__sub">Open the dedicated modules for controls that affect your profile or payment operations.</p></div></header>
        <div><a class="quick-action" href="#profile" data-page="profile"><span class="quick-action__icon quick-action__icon--violet">${icon('user')}</span><span>Update admin profile</span>${icon('arrow')}</a><a class="quick-action" href="#alerts" data-page="alerts"><span class="quick-action__icon quick-action__icon--blue">${icon('bell')}</span><span>Notification preferences</span>${icon('arrow')}</a><a class="quick-action" href="#monitor" data-page="monitor"><span class="quick-action__icon quick-action__icon--amber">${icon('pulse')}</span><span>System health monitoring</span>${icon('arrow')}</a></div>
      </section>
      <p class="admin-settings-footnote">${data.demo ? 'Dashboard preferences persist in this browser only. They are not shared across devices.' : 'Dashboard preferences are associated with your admin account.'}</p>`;

    const form = $('#adminSettingsForm', root);
    form.elements.dateFormat.addEventListener('change', () => {
      const current = state.adminSettings;
      state.adminSettings = { ...current, dateFormat: form.elements.dateFormat.value };
      $('[data-settings-preview]', root).textContent = fmtDateTime(new Date().toISOString());
      state.adminSettings = current;
    });
    form.elements.timeZone.addEventListener('change', () => {
      const current = state.adminSettings;
      state.adminSettings = { ...current, timeZone: form.elements.timeZone.value };
      $('[data-settings-preview]', root).textContent = fmtDateTime(new Date().toISOString());
      state.adminSettings = current;
    });
    form.onsubmit = async (event) => {
      event.preventDefault();
      const changes = {
        timeZone: form.elements.timeZone.value,
        dateFormat: form.elements.dateFormat.value,
        defaultRange: form.elements.defaultRange.value,
      };
      try {
        const result = await DataService.saveAdminSettings(changes);
        state.adminSettings = result.settings;
        applyDashboardRange(result.settings.defaultRange);
        if (state.currentPage === 'dashboard') {
          await Promise.all([renderKpis(), renderChart(), renderPaymentDistribution()]);
        } else {
          route();
        }
        toast(result.demo ? 'Settings saved in this browser' : 'Settings saved');
      } catch (error) {
        console.error(error);
        toast(error.message || 'Unable to save settings');
      }
    };
    root.onclick = (event) => {
      if (!event.target.closest('[data-settings-action="theme"]')) return;
      themeBtn.click();
      const label = root.querySelector('[data-settings-action="theme"]');
      label.innerHTML = `${icon(document.documentElement.getAttribute('data-theme') === 'dark' ? 'moon' : 'sun')} Switch to ${document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'} theme`;
    };
  }

  /* ---------- provider marks (simplified brand glyphs) ---------- */
  const LOGOS = {
    bkash: `<svg viewBox="0 0 48 44"><path d="M4 8l20 9-6 18z" fill="#e2136e"/><path d="M24 17 44 4l-9 27z" fill="#c4105f"/><path d="M18 35l6-18 11 14z" fill="#f04d93"/><path d="M18 35l-4 8 9-6z" fill="#e2136e"/></svg>`,
    nagad: `<svg viewBox="0 0 48 44"><circle cx="24" cy="23" r="17" fill="#f15a29"/><circle cx="24" cy="23" r="12" fill="#fff"/><circle cx="24" cy="23" r="9" fill="#f7941d"/><path d="M24 14a9 9 0 0 1 9 9h-5a4 4 0 0 0-4-4z" fill="#ed1c24"/><circle cx="24" cy="23" r="3.2" fill="#fff"/><path d="M30 4c4 2 6 5 6 8-3-2-6-3-9-3z" fill="#ed1c24"/></svg>`,
    rocket: `<svg viewBox="0 0 64 44"><path d="M40 6l14-4-4 14-6 2-6-6z" fill="#8c3494"/><path d="M38 14l6 6-3 3-6-6z" fill="#b04aa8"/><text x="32" y="36" text-anchor="middle" font-family="Inter,Arial" font-weight="800" font-size="15" fill="#8c3494" letter-spacing="-.5">ROCKET</text><text x="12" y="16" font-family="Inter,Arial" font-weight="700" font-size="6" fill="#8c3494">ROCKET</text></svg>`,
    visa: `<svg viewBox="0 0 64 44"><text x="32" y="30" text-anchor="middle" font-family="Arial Black,Inter,Arial" font-weight="900" font-style="italic" font-size="22" style="fill:var(--visa-ink)" letter-spacing="-1">VISA</text></svg>`,
    mastercard: `<svg viewBox="0 0 48 44"><circle cx="17" cy="22" r="13" fill="#eb001b"/><circle cx="31" cy="22" r="13" fill="#f79e1b"/><path d="M24 11a13 13 0 0 1 0 22 13 13 0 0 1 0-22z" fill="#ff5f00"/></svg>`,
  };
  const OFFICIAL_LOGOS = {
    bkash: 'assets/images/payment-providers/bkash.jpg',
    nagad: 'assets/images/payment-providers/nagad.png',
    rocket: 'assets/images/payment-providers/rocket.webp',
    upay: 'assets/images/payment-providers/upay.webp',
  };
  function providerLogo(code, className = '') {
    const src = OFFICIAL_LOGOS[code];
    return src
      ? `<img class="provider-logo ${className}" src="${src}" alt="" loading="lazy" decoding="async">`
      : LOGOS[code] || '';
  }

  /* ---------- renderers ---------- */
  async function renderKpis() {
    const box = $('#kpis');
    box.innerHTML = '<div class="kpi skeleton"></div>'.repeat(10);
    const [k, merchants, providers] = await Promise.all([
      DataService.getKpis(state.range),
      DataService.getMerchantStats(),
      DataService.getProviders(),
    ]);
    const cards = [
      { cls: 'blue',    icon: 'users', label: 'Total Registered Merchants', value: nfIN.format(merchants.total) },
      { cls: 'green',   icon: 'user',  label: 'Active Merchants', value: nfIN.format(merchants.active) },
      { cls: 'primary', icon: 'card',  label: 'Total Transactions', value: nfIN.format(k.totalTransactions) },
      { cls: 'blue',    icon: 'dollar',label: 'Total Transaction Volume (BDT)', value: '৳ ' + nfIN.format(k.totalVolume) },
      { cls: 'green',   icon: 'check', label: 'Successful Transactions', value: nfIN.format(k.successfulTransactions) },
      { cls: 'red',     icon: 'excl',  label: 'Failed Transactions', value: nfIN.format(k.failedTransactions) },
      { cls: 'amber',   icon: 'clock', label: 'Pending Transactions', value: nfIN.format(k.pendingTransactions) },
      { cls: 'green',   icon: 'pulse', label: 'Overall Payment Success Rate', value: k.successRate + '%' },
      { cls: 'violet',  icon: 'shield',label: 'Active Payment Providers', value: nfIN.format(providers.length) },
      { cls: 'red',     icon: 'dollar',label: 'Total Refunds', value: nfIN.format(k.totalRefunds) },
    ];
    box.innerHTML = '';
    cards.forEach((c) => {
      const node = document.createElement('article');
      node.className = `kpi kpi--${c.cls}`;
      node.innerHTML = `
        <span class="kpi__ico">${icon(c.icon)}</span>
        <div class="kpi__body">
          <div class="kpi__label">${c.label}</div>
          <div class="kpi__value">${c.value}</div>
        </div>`;
      box.appendChild(node);
    });
  }

  async function renderProviders() {
    const box = $('#providers');
    box.innerHTML = '<div class="provider skeleton" style="height:140px"></div>'.repeat(5);
    const list = await DataService.getProviders();
    box.innerHTML = list.map((p) => `
      <div class="provider" title="Success ${p.successRate}% · Avg latency ${p.avgLatencyMs}ms">
        <div class="provider__logo">${providerLogo(p.code)}</div>
        <div class="provider__name">${esc(p.name)}</div>
        <div class="provider__status ${p.status === 'online' ? '' : p.status === 'degraded' ? 'is-degraded' : 'is-down'}">${p.status[0].toUpperCase() + p.status.slice(1)}</div>
        <div class="provider__uptime">${p.uptime}%</div>
      </div>`).join('');
    const healthy = list.length > 0 && list.every((p) => p.status === 'online');
    const st = $('#providersStatus');
    st.classList.toggle('is-warn', !healthy);
    st.innerHTML = `<span class="tick">${icon(healthy ? 'check' : 'excl')}</span>${healthy ? 'All Payment Providers are Healthy' : list.length ? 'Some providers need attention' : 'No Payment Providers are Enabled'}`;
    renderProviderComparison(list);
  }

  async function renderChart() {
    const box = $('#txChart');
    const data = await DataService.getTransactionSeries(state.chartPeriod);
    if (state.chart) state.chart.destroy();
    if (state.volumeChart) state.volumeChart.destroy();
    const maxTransactions = Math.max(1000, Math.ceil(Math.max(...data.map((day) => day.successful)) / 1000) * 1000);
    const maxFailedTransactions = Math.max(10, Math.ceil(Math.max(...data.map((day) => day.failed)) / 10) * 10);
    state.chart = Charts.areaChart(box, data, [
      { key: 'successful', name: 'Successful', color: cssVar('--series-success'), fill: true, fillOpacity: 0.22, width: 2.4 },
      { key: 'failed', name: 'Failed', color: cssVar('--series-failed'), fill: true, fillOpacity: 0.12, axis: 'right' },
    ], {
      yMax: maxTransactions,
      yTicks: [0, maxTransactions * .25, maxTransactions * .5, maxTransactions * .75, maxTransactions],
      rightYMax: maxFailedTransactions,
      rightYTicks: [0, maxFailedTransactions * .25, maxFailedTransactions * .5, maxFailedTransactions * .75, maxFailedTransactions],
      format: (value) => value >= 1000 ? `${(value / 1000).toFixed(value % 1000 ? 1 : 0)}k` : nfIN.format(Math.round(value)),
    });

    const volumeBox = $('#volumeChart');
    const maxVolume = Math.ceil(Math.max(...data.map((day) => day.volume)) / 1000000) * 1000000;
    state.volumeChart = Charts.areaChart(volumeBox, data, [
      { key: 'volume', name: 'Volume', color: cssVar('--primary'), fill: true, fillOpacity: 0.2, width: 2.4 },
    ], {
      yMax: maxVolume,
      yTicks: [0, maxVolume * .25, maxVolume * .5, maxVolume * .75, maxVolume],
      format: (value) => `৳${(value / 1000000).toFixed(1)}m`,
    });
  }

  async function renderPaymentDistribution() {
    const [methods, kpis] = await Promise.all([
      DataService.getPaymentMethodDistribution(state.range),
      DataService.getKpis(state.range),
    ]);
    const total = methods.reduce((sum, method) => sum + method.count, 0);
    let angle = 0;
    const segments = methods.map((method) => {
      const percent = total ? (method.count / total) * 100 : 0;
      const start = angle;
      angle += percent;
      return { ...method, percent, start, end: angle };
    });
    const gradient = segments.map((segment) => `${segment.color} ${segment.start}% ${segment.end}%`).join(', ');
    $('#paymentDistribution').innerHTML = `
      <div class="distribution__donut" style="--distribution-gradient:conic-gradient(${gradient})" aria-hidden="true">
        <div><strong>${nfIN.format(kpis.totalTransactions)}</strong><span>transactions</span></div>
      </div>
      <ul class="distribution__legend">${segments.map((method) => `
        <li><span class="distribution__logo">${providerLogo(method.code)}</span><span>${esc(method.name)}</span><strong>${method.percent.toFixed(1)}%</strong></li>
      `).join('')}</ul>`;
  }

  function renderProviderComparison(providers) {
    $('#providerComparison').innerHTML = providers.map((provider) => {
      const rate = Math.max(0, Math.min(100, Number(provider.successRate) || 0));
      const latency = Math.max(0, Number(provider.avgLatencyMs) || 0);
      const relativeRate = Math.max(0, Math.min(100, (rate - 95) * 20));
      return `<div class="provider-compare">
        <div class="provider-compare__head"><strong class="provider-compare__identity">${providerLogo(provider.code)}${esc(provider.name)}</strong><span>${rate.toFixed(1)}% success</span></div>
        <div class="provider-compare__track" role="img" aria-label="${esc(provider.name)} success rate ${rate.toFixed(1)} percent; chart baseline 95 percent"><span style="width:${relativeRate}%"></span></div>
        <small>${latency ? `${nfIN.format(latency)} ms avg latency` : 'Latency unavailable'}</small>
      </div>`;
    }).join('') + '<p class="comparison-note">Success-rate bars use a 95% baseline.</p>';
  }

  async function renderDailyActivity() {
    const days = await DataService.getDailyActivity();
    const max = Math.max(1, ...days.map((day) => day.total));
    $('#dailyActivity').innerHTML = days.map((day) => {
      const height = Math.max(6, Math.round(day.total / max * 100));
      return `<div class="daily-activity__item" title="${esc(day.label)}: ${nfIN.format(day.total)} transactions">
        <span class="daily-activity__value">${nfIN.format(day.total)}</span>
        <span class="daily-activity__bar"><i style="height:${height}%"></i></span>
        <span class="daily-activity__label">${esc(day.label)}</span>
      </div>`;
    }).join('');
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
    $('#navRiskBadge').textContent = nfIN.format(r.openCount);
    $('#navRiskBadge').hidden = !r.openCount;
  }

  const RISK_TYPES = [
    ['repeated_failed_transactions', 'Repeated failed transactions', 'Repeated declines or failed retries in a short time window.'],
    ['possible_duplicate_payment', 'Possible duplicate payments', 'Matching order, amount, and payment attempts requiring settlement review.'],
    ['unusual_transaction_amount', 'Unusual transaction amounts', 'Amounts that exceed a merchant-specific baseline or configured threshold.'],
    ['unusual_transaction_frequency', 'Unusual transaction frequency', 'Attempt rates that deviate from a merchant or customer baseline.'],
    ['suspicious_merchant_activity', 'Suspicious merchant activity', 'Abrupt changes in merchant payment outcomes or activity patterns.'],
    ['unusual_login_attempts', 'Unusual login attempts', 'Repeated or anomalous authentication failures requiring account review.'],
  ];
  const riskTypeLabel = (type) => RISK_TYPES.find(([key]) => key === type)?.[1] || type;
  const riskSeverityLabel = (severity) => ({ critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' }[severity] || severity);
  const riskStatusLabel = (status) => ({ open: 'Open', investigating: 'Investigating', resolved: 'Resolved', dismissed: 'Dismissed' }[status] || status);

  async function renderRiskManagement() {
    const root = $('#riskManagement');
    root.hidden = false;
    root.innerHTML = '<div class="card skeleton" style="height:280px"></div>';
    const [allAlerts, alerts] = await Promise.all([
      DataService.getRiskAlerts(),
      DataService.getRiskAlerts(state.riskFilters),
    ]);
    const activeAlerts = allAlerts.filter((alert) => alert.status === 'open' || alert.status === 'investigating');
    $('#navRiskBadge').textContent = nfIN.format(activeAlerts.length);
    $('#navRiskBadge').hidden = !activeAlerts.length;
    const stats = {
      active: activeAlerts.length,
      critical: activeAlerts.filter((alert) => alert.severity === 'critical').length,
      investigating: activeAlerts.filter((alert) => alert.status === 'investigating').length,
      closed: allAlerts.filter((alert) => alert.status === 'resolved' || alert.status === 'dismissed').length,
    };
    const signalCounts = RISK_TYPES.map(([type, label, description]) => ({
      type, label, description, count: activeAlerts.filter((alert) => alert.type === type).length,
    }));
    const selected = state.riskDetailId ? allAlerts.find((alert) => alert.id === state.riskDetailId) : null;
    const rows = alerts.map((alert) => `<tr class="${alert.severity === 'critical' ? 'risk-row--critical' : ''}">
      <td data-label="Alert"><strong>${esc(alert.id)}</strong><small>${esc(fmtDateTime(alert.createdAt))}</small></td>
      <td data-label="Signal">${esc(riskTypeLabel(alert.type))}</td>
      <td data-label="Severity"><span class="risk-severity-badge risk-severity-badge--${esc(alert.severity)}">${esc(riskSeverityLabel(alert.severity))}</span></td>
      <td data-label="Merchant">${esc(alert.merchantName)}</td>
      <td data-label="Transaction">${alert.transactionId ? esc(alert.transactionId) : '—'}</td>
      <td data-label="Amount">${alert.amount ? merchantMoney.format(alert.amount) : '—'}</td>
      <td data-label="Status"><span class="risk-status-badge risk-status-badge--${esc(alert.status)}">${esc(riskStatusLabel(alert.status))}</span></td>
      <td data-label="Review"><button type="button" class="merchant-btn merchant-btn--subtle" data-risk-action="details" data-risk-id="${esc(alert.id)}">${alert.status === 'open' ? 'Review' : 'Details'}</button></td>
    </tr>`).join('');
    root.innerHTML = `
      <header class="merchant-page-head risk-page-head">
        <div><p class="merchant-eyebrow">PAYMENT SECURITY</p><h1>Risk &amp; Fraud Monitoring</h1><p>Review suspicious transaction, merchant, and login activity. Alerts are investigation signals, not proof of fraud.</p></div>
        <span class="merchant-demo-note">${icon('alert')} Demo workspace · sample alerts</span>
      </header>
      <div class="merchant-summary risk-summary">
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--red">${icon('alert')}</span><div><small>Active alerts</small><strong>${nfIN.format(stats.active)}</strong></div></article>
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--red">${icon('excl')}</span><div><small>Critical priority</small><strong>${nfIN.format(stats.critical)}</strong></div></article>
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--amber">${icon('clock')}</span><div><small>Under investigation</small><strong>${nfIN.format(stats.investigating)}</strong></div></article>
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--green">${icon('check')}</span><div><small>Closed alerts</small><strong>${nfIN.format(stats.closed)}</strong></div></article>
      </div>
      <section class="risk-signal-grid" aria-label="Monitored risk signals">
        ${signalCounts.map((signal) => `<article class="card risk-signal-card"><div><span class="risk-signal-count">${nfIN.format(signal.count)}</span><small>active alerts</small></div><h2>${esc(signal.label)}</h2><p>${esc(signal.description)}</p></article>`).join('')}
      </section>
      <section class="card risk-alerts-panel">
        <header class="card__head"><div><h2><svg class="h-ico h-ico--red"><use href="#i-alert"/></svg>Flagged activity</h2><p class="card__sub">Review alert evidence and record an investigation outcome.</p></div></header>
        <form id="riskFilters" class="risk-filters">
          <label>Status<select name="status"><option value="all">All statuses</option>${['open', 'investigating', 'resolved', 'dismissed'].map((status) => `<option value="${status}" ${state.riskFilters.status === status ? 'selected' : ''}>${riskStatusLabel(status)}</option>`).join('')}</select></label>
          <label>Severity<select name="severity"><option value="all">All priorities</option>${['critical', 'high', 'medium', 'low'].map((severity) => `<option value="${severity}" ${state.riskFilters.severity === severity ? 'selected' : ''}>${riskSeverityLabel(severity)}</option>`).join('')}</select></label>
          <label>Signal<select name="type"><option value="all">All signals</option>${RISK_TYPES.map(([type, label]) => `<option value="${type}" ${state.riskFilters.type === type ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label>
          <label>Search<input type="search" name="q" value="${esc(state.riskFilters.q)}" placeholder="Alert, merchant, transaction..." /></label>
          <div class="risk-filter-actions"><button type="submit" class="merchant-btn merchant-btn--primary">Apply filters</button><button type="button" class="merchant-btn" data-risk-action="clear">Clear</button></div>
        </form>
        <div class="merchant-table-wrap risk-table-wrap"><table class="merchant-table risk-alert-table"><thead><tr><th>Alert</th><th>Signal</th><th>Severity</th><th>Merchant / account</th><th>Transaction</th><th>Amount</th><th>Status</th><th>Review</th></tr></thead><tbody>${rows || '<tr><td class="merchant-empty-cell" colspan="8">No flagged activity matches these filters.</td></tr>'}</tbody></table></div>
        <p class="risk-footnote">Risk flags are review signals. Duplicate-payment indicators must be checked against provider settlement records before action; the demo does not automatically block payments or accounts.</p>
      </section>
      ${selected ? renderRiskDetails(selected) : ''}`;
    bindRiskEvents(root);
    if (selected) $('#riskDetailsDialog', root)?.focus();
  }

  function renderRiskDetails(alert) {
    const canTriage = alert.status === 'open' || alert.status === 'investigating';
    const actions = canTriage
      ? `${alert.status === 'open' ? `<button type="button" class="merchant-btn merchant-btn--primary" data-risk-action="investigate" data-risk-id="${esc(alert.id)}">${icon('pulse')} Mark investigating</button>` : ''}<button type="button" class="merchant-btn merchant-btn--approve" data-risk-action="resolve" data-risk-id="${esc(alert.id)}">${icon('check')} Resolve alert</button><button type="button" class="merchant-btn merchant-btn--reject" data-risk-action="dismiss" data-risk-id="${esc(alert.id)}">${icon('x')} Dismiss alert</button>`
      : '';
    return `<div class="merchant-dialog-backdrop risk-dialog-backdrop" data-risk-action="close-details">
      <section class="merchant-profile-dialog risk-details-dialog" id="riskDetailsDialog" role="dialog" aria-modal="true" aria-labelledby="riskDetailsTitle" tabindex="-1">
        <header class="merchant-profile-head"><div class="merchant-profile-identity"><span class="merchant-summary-icon merchant-summary-icon--red">${icon('alert')}</span><div><p class="merchant-eyebrow">RISK INVESTIGATION</p><h2 id="riskDetailsTitle">${esc(alert.id)}</h2><span class="merchant-profile-meta">${esc(fmtDateTime(alert.createdAt))}</span></div></div><button type="button" class="merchant-icon-action" data-risk-action="close-details" aria-label="Close risk alert details">${icon('x')}</button></header>
        <div class="merchant-profile-content risk-detail-content">
          <section class="merchant-detail-card"><div class="risk-detail-heading"><h3>${esc(alert.title)}</h3><span class="risk-severity-badge risk-severity-badge--${esc(alert.severity)}">${esc(riskSeverityLabel(alert.severity))}</span></div><p>${esc(alert.summary)}</p><dl class="merchant-details refund-detail-grid">
            <div><dt>Current status</dt><dd><span class="risk-status-badge risk-status-badge--${esc(alert.status)}">${esc(riskStatusLabel(alert.status))}</span></dd></div>
            <div><dt>Merchant / account</dt><dd>${esc(alert.merchantName)}</dd></div>
            <div><dt>Transaction</dt><dd>${alert.transactionId ? esc(alert.transactionId) : 'Not transaction-related'}</dd></div>
            <div><dt>Payment method</dt><dd>${esc(alert.paymentMethod)}</dd></div>
            <div><dt>Amount</dt><dd>${alert.amount ? merchantMoney.format(alert.amount) : '—'}</dd></div>
          </dl></section>
          <section class="merchant-detail-card"><h3>Detection evidence</h3><ul class="risk-evidence-list">${alert.evidence.map((item) => `<li>${esc(item)}</li>`).join('')}</ul></section>
          <section class="merchant-detail-card"><h3>Suggested review</h3><p>${esc(alert.recommendation)}</p><p class="risk-footnote">This recommendation is informational. Confirm findings using trusted provider, transaction, or authentication records.</p></section>
          ${alert.transactionId ? `<a class="merchant-btn merchant-btn--subtle risk-transaction-link" href="#transactions" data-risk-action="transaction" data-transaction-id="${esc(alert.transactionId)}">Open transaction monitoring ${icon('arrow')}</a>` : ''}
          ${alert.reviewHistory?.length ? `<section class="merchant-detail-card"><h3>Review history</h3><ol class="transaction-timeline">${[...alert.reviewHistory].reverse().map((review) => `<li class="transaction-timeline__item transaction-timeline__item--pending"><span class="transaction-timeline__mark"></span><div><strong>${esc(riskStatusLabel(review.previousStatus))} → ${esc(riskStatusLabel(review.status))}</strong><p>${esc(review.note || 'Status updated without an additional note.')}</p><time>${esc(review.actor)} · ${esc(fmtDateTime(review.at))}</time></div></li>`).join('')}</ol></section>` : ''}
          ${actions ? `<section class="risk-review-actions"><label for="riskReviewNote">Investigation note${alert.status === 'open' ? ' (required to dismiss)' : ''}<textarea id="riskReviewNote" rows="3" maxlength="500" placeholder="Record evidence reviewed or next steps"></textarea><small>Do not enter passwords, credentials, full payment details, or raw provider payloads.</small></label><div>${actions}</div></section>` : ''}
        </div>
      </section>
    </div>`;
  }

  function bindRiskEvents(root) {
    if (root.dataset.eventsBound) return;
    root.dataset.eventsBound = 'true';
    root.addEventListener('submit', (event) => {
      if (event.target.id !== 'riskFilters') return;
      event.preventDefault();
      const form = event.target;
      state.riskFilters = {
        status: form.elements.status.value, severity: form.elements.severity.value,
        type: form.elements.type.value, q: form.elements.q.value.trim(),
      };
      state.riskDetailId = null;
      renderRiskManagement().catch((error) => { console.error(error); toast('Unable to filter risk alerts'); });
    });
    root.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-risk-action]');
      if (!button) return;
      const action = button.dataset.riskAction;
      const id = button.dataset.riskId;
      if (action === 'close-details' && event.target !== button && !button.classList.contains('merchant-icon-action')) return;
      if (action === 'close-details') {
        state.riskDetailId = null;
        renderRiskManagement().catch((error) => { console.error(error); toast('Unable to close risk alert details'); });
        return;
      }
      if (action === 'clear') {
        state.riskFilters = { status: 'all', severity: 'all', type: 'all', q: '' };
        state.riskDetailId = null;
        renderRiskManagement().catch((error) => { console.error(error); toast('Unable to clear risk filters'); });
        return;
      }
      if (action === 'details') {
        state.riskDetailId = id;
        renderRiskManagement().catch((error) => { console.error(error); toast('Unable to load risk alert details'); });
        return;
      }
      if (action === 'transaction') {
        state.transactionFilters = { ...state.transactionFilters, id: button.dataset.transactionId, duplicatesOnly: false };
        return;
      }
      if (['investigate', 'resolve', 'dismiss'].includes(action)) {
        const status = { investigate: 'investigating', resolve: 'resolved', dismiss: 'dismissed' }[action];
        const note = $('#riskReviewNote', root)?.value.trim() || '';
        try {
          await DataService.updateRiskAlert(id, status, note);
          toast(`Risk alert ${riskStatusLabel(status).toLowerCase()}`);
          await Promise.all([renderRiskManagement(), renderRisk()]);
        } catch (error) {
          console.error(error);
          toast(error.message || 'Unable to update risk alert');
        }
      }
    });
  }

  const ACT_ICON = {
    transaction: ['green', 'plus'],
    routing: ['blue', 'cog'],
    risk: ['red', 'excl'],
    merchant: ['violet', 'user'],
    refund: ['red', 'dollar'],
    provider: ['blue', 'pulse'],
  };
  async function renderActivity() {
    const list = await DataService.getRecentActivity(6);
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

  const merchantMoney = new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT', maximumFractionDigits: 0 });
  const merchantStatusLabel = (value) => ({
    active: 'Active', suspended: 'Suspended', pending: 'Pending review', rejected: 'Rejected',
  }[value] || value);
  const verificationLabel = (value) => value === 'verified' ? 'Verified' : 'Needs review';
  const integrationLabel = (value) => ({
    connected: 'Connected', attention: 'Needs attention', pending: 'Setup pending',
    disconnected: 'Disconnected', not_started: 'Not started',
  }[value] || value);

  const routingMethodMeta = {
    any: { label: 'Any payment method', type: '' },
    bkash: { label: 'bKash', type: 'mfs' },
    nagad: { label: 'Nagad', type: 'mfs' },
    rocket: { label: 'Rocket', type: 'mfs' },
    upay: { label: 'Upay', type: 'mfs' },
    visa: { label: 'Visa', type: 'card' },
    mastercard: { label: 'Mastercard', type: 'card' },
  };

  function routingProviderOptions(providers, selected, type = '') {
    return `<option value="">${type ? 'Select provider' : 'No fallback'}</option>${providers
      .filter((provider) => !type || provider.type === type)
      .map((provider) => `<option value="${esc(provider.id)}" ${provider.id === selected ? 'selected' : ''}>${esc(provider.name)}</option>`).join('')}`;
  }

  function renderRoutingRule(rule, providers, index, total) {
    const meta = routingMethodMeta[rule.method] || routingMethodMeta.any;
    const candidates = meta.type ? providers.filter((provider) => provider.type === meta.type) : providers;
    return `<article class="routing-rule-row" data-routing-rule="${esc(rule.id || `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)}">
      <label>Payment method<select name="method">${Object.entries(routingMethodMeta).map(([value, item]) => `<option value="${value}" ${rule.method === value ? 'selected' : ''}>${item.label}</option>`).join('')}</select></label>
      <label>Minimum (BDT)<input name="minAmount" type="number" min="0" step="1" required value="${esc(rule.minAmount ?? 0)}" /></label>
      <label>Maximum (BDT)<input name="maxAmount" type="number" min="0" step="1" value="${esc(rule.maxAmount ?? '')}" placeholder="No upper limit" /></label>
      <label>Primary provider<select name="primaryProviderId" required>${routingProviderOptions(candidates, rule.primaryProviderId, meta.type)}</select></label>
      <label>Fallback provider<select name="fallbackProviderId">${routingProviderOptions(candidates, rule.fallbackProviderId, meta.type)}</select></label>
      <div class="routing-rule-actions">
        <button type="button" class="merchant-icon-action" data-routing-action="move-up" aria-label="Move routing rule up" ${index === 0 ? 'disabled' : ''}>${icon('up')}</button>
        <button type="button" class="merchant-icon-action" data-routing-action="move-down" aria-label="Move routing rule down" ${index === total - 1 ? 'disabled' : ''}>${icon('down')}</button>
        <button type="button" class="merchant-icon-action routing-rule-remove" data-routing-action="remove-rule" aria-label="Remove routing rule">${icon('x')}</button>
      </div>
    </article>`;
  }

  async function renderSmartRouting() {
    const root = $('#smartRoutingManagement');
    root.hidden = false;
    root.innerHTML = '<div class="card skeleton" style="height:280px"></div>';
    const { config, providers, decisions, analytics } = await DataService.getRoutingConfig();
    const enabled = providers.filter((provider) => provider.isEnabled);
    const types = [
      { type: 'mfs', title: 'Mobile financial services' },
      { type: 'card', title: 'Card networks' },
      { type: 'wallet', title: 'Digital wallets' },
      { type: 'bank', title: 'Bank transfers' },
    ];
    const priorityGroups = types.map(({ type, title }) => {
      const group = enabled.filter((provider) => provider.type === type);
      if (!group.length) return '';
      const primary = group.find((provider) => provider.priority === 'primary') || group[0];
      const fallback = group.find((provider) => provider.id === primary.fallbackProviderId)
        || group.find((provider) => provider.id !== primary.id && provider.priority === 'fallback');
      return `<article class="routing-priority-group" data-route-type="${type}">
        <h3>${title}</h3>
        <label>Primary provider<select name="priorityPrimary">${routingProviderOptions(group, primary.id, type)}</select></label>
        <label>Fallback provider<select name="priorityFallback">${routingProviderOptions(group, fallback?.id || '', type)}</select></label>
      </article>`;
    }).join('');
    const providerLimits = enabled.map((provider) => `<tr data-provider-type="${esc(provider.type)}">
      <td><span class="routing-provider-cell">${providerLogo(provider.code)}<strong>${esc(provider.name)}</strong></span></td>
      <td><label class="sr-only" for="routing-tx-${esc(provider.id)}">${esc(provider.name)} per-transaction limit</label><input id="routing-tx-${esc(provider.id)}" name="transactionLimit" type="number" min="1" step="1" required value="${esc(provider.transactionLimit)}" data-provider-id="${esc(provider.id)}" /></td>
      <td><label class="sr-only" for="routing-daily-${esc(provider.id)}">${esc(provider.name)} daily limit</label><input id="routing-daily-${esc(provider.id)}" name="dailyLimit" type="number" min="1" step="1" required value="${esc(provider.dailyLimit)}" data-provider-id="${esc(provider.id)}" /></td>
    </tr>`).join('');
    const ruleMarkup = config.rules.map((rule, index) => renderRoutingRule(rule, enabled, index, config.rules.length)).join('');
    root.innerHTML = `
      <header class="provider-page-head routing-page-head">
        <div><p class="merchant-eyebrow">PAYMENT OPERATIONS</p><h1>Smart Routing Management</h1><p>Set provider priorities and rules, manage failover, and monitor routing performance.</p></div>
        <span class="merchant-demo-note">${icon('alert')} Demo workspace · sample decisions and metrics</span>
      </header>
      <div class="merchant-summary routing-summary">
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--blue">${icon('route')}</span><div><small>Routed transactions</small><strong>${nfIN.format(analytics.routedTransactions)}</strong></div></article>
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--green">${icon('check')}</span><div><small>Routing success rate</small><strong>${Number(analytics.successRate).toFixed(1)}%</strong></div></article>
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--violet">${icon('pulse')}</span><div><small>Automatic failovers</small><strong>${nfIN.format(analytics.failovers)}</strong></div></article>
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--amber">${icon('clock')}</span><div><small>Average decision time</small><strong>${nfIN.format(analytics.avgDecisionMs)} ms</strong></div></article>
      </div>
      <form id="smartRoutingForm">
        <section class="card routing-config-panel">
          <header class="card__head"><div><h2><svg class="h-ico h-ico--violet"><use href="#i-route"/></svg>Provider priorities</h2><p class="card__sub">Choose a primary and optional fallback provider by provider type.</p></div></header>
          <div class="routing-priority-grid">${priorityGroups || '<p class="provider-empty">Enable providers to configure priorities.</p>'}</div>
          <label class="routing-failover-toggle"><input type="checkbox" name="autoFailover" ${config.autoFailover ? 'checked' : ''} /><span><strong>Enable automatic failover</strong><small>Route eligible retries to the configured fallback when the primary provider is unavailable.</small></span></label>
        </section>
        <section class="card routing-config-panel">
          <header class="card__head"><div><h2><svg class="h-ico h-ico--blue"><use href="#i-card"/></svg>Payment method and amount rules</h2><p class="card__sub">Rules are evaluated from top to bottom; place specific conditions before broad ones.</p></div><button type="button" class="merchant-btn" data-routing-action="add-rule">${icon('plus')} Add rule</button></header>
          <div class="routing-rule-list">${ruleMarkup || '<p class="provider-empty">No routing rules yet. Add a rule to route payments.</p>'}</div>
        </section>
        <section class="card routing-config-panel">
          <header class="card__head"><div><h2><svg class="h-ico h-ico--violet"><use href="#i-dollar"/></svg>Provider-specific transaction limits</h2><p class="card__sub">Set maximum transaction and daily volume per enabled provider in BDT.</p></div></header>
          <div class="merchant-table-wrap"><table class="merchant-table routing-limits-table"><thead><tr><th>Provider</th><th>Per-transaction limit (BDT)</th><th>Daily limit (BDT)</th></tr></thead><tbody>${providerLimits || '<tr><td class="merchant-empty-cell" colspan="3">Enable a provider to configure its limits.</td></tr>'}</tbody></table></div>
        </section>
        <div class="routing-save-bar"><span>Changes apply to demo routing configuration only.</span><button type="submit" class="merchant-btn merchant-btn--primary">Save routing configuration</button></div>
      </form>
      <section class="card routing-analytics-panel">
        <header class="card__head"><div><h2><svg class="h-ico h-ico--green"><use href="#i-bars"/></svg>Routing performance analytics</h2><p class="card__sub">Sample platform routing outcomes and recent provider decisions.</p></div></header>
        <div class="routing-analytics-grid">
          <article><span>Primary provider selections</span><strong>${nfIN.format(analytics.primarySelections)}</strong></article>
          <article><span>Failover success rate</span><strong>${Number(analytics.failoverSuccessRate).toFixed(1)}%</strong></article>
          <article><span>Automatic failovers</span><strong>${nfIN.format(analytics.failovers)}</strong></article>
          <article><span>Routing success rate</span><strong>${Number(analytics.successRate).toFixed(1)}%</strong></article>
        </div>
        <div class="merchant-table-wrap"><table class="merchant-table routing-decisions-table"><thead><tr><th>Time</th><th>Transaction</th><th>Payment method</th><th>Amount</th><th>Primary</th><th>Selected provider</th><th>Decision</th></tr></thead><tbody>${decisions.map((decision) => `<tr><td data-label="Time">${esc(fmtDateTime(decision.at))}</td><td data-label="Transaction">${esc(decision.transactionId)}</td><td data-label="Payment method">${esc(decision.method)}</td><td data-label="Amount">${merchantMoney.format(decision.amount)}</td><td data-label="Primary">${esc(decision.primaryProvider)}</td><td data-label="Selected provider">${esc(decision.selectedProvider)}</td><td data-label="Decision">${esc(decision.outcome)}</td></tr>`).join('')}</tbody></table></div>
      </section>`;
    bindSmartRoutingEvents(root, enabled);
  }

  function bindSmartRoutingEvents(root, enabledProviders) {
    if (root.dataset.eventsBound) return;
    root.dataset.eventsBound = 'true';
    root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-routing-action]');
      if (!button) return;
      if (button.dataset.routingAction === 'remove-rule') {
        const row = button.closest('.routing-rule-row');
        row.remove();
        const rows = $$('.routing-rule-row', root);
        rows.forEach((item, index) => {
          item.querySelector('[data-routing-action="move-up"]').disabled = index === 0;
          item.querySelector('[data-routing-action="move-down"]').disabled = index === rows.length - 1;
        });
        if (!rows.length) $('.routing-rule-list', root).innerHTML = '<p class="provider-empty">No routing rules yet. Add a rule to route payments.</p>';
        return;
      }
      if (button.dataset.routingAction === 'move-up' || button.dataset.routingAction === 'move-down') {
        const row = button.closest('.routing-rule-row');
        if (button.dataset.routingAction === 'move-up' && row.previousElementSibling) row.parentElement.insertBefore(row, row.previousElementSibling);
        if (button.dataset.routingAction === 'move-down' && row.nextElementSibling) row.parentElement.insertBefore(row.nextElementSibling, row);
        $$('.routing-rule-row', root).forEach((item, index, rows) => {
          item.querySelector('[data-routing-action="move-up"]').disabled = index === 0;
          item.querySelector('[data-routing-action="move-down"]').disabled = index === rows.length - 1;
        });
        return;
      }
      if (button.dataset.routingAction === 'add-rule') {
        const list = $('.routing-rule-list', root);
        if (!list.querySelector('.routing-rule-row')) list.innerHTML = '';
        list.insertAdjacentHTML('beforeend', renderRoutingRule({
          method: 'any', minAmount: 0, maxAmount: null, primaryProviderId: '', fallbackProviderId: '',
        }, enabledProviders, list.querySelectorAll('.routing-rule-row').length, list.querySelectorAll('.routing-rule-row').length + 1));
        $$('.routing-rule-row', root).forEach((item, index, rows) => {
          item.querySelector('[data-routing-action="move-up"]').disabled = index === 0;
          item.querySelector('[data-routing-action="move-down"]').disabled = index === rows.length - 1;
        });
      }
    });
    root.addEventListener('change', (event) => {
      if (event.target.name !== 'method') return;
      const row = event.target.closest('.routing-rule-row');
      const type = routingMethodMeta[event.target.value]?.type || '';
      const compatible = type ? enabledProviders.filter((provider) => provider.type === type) : enabledProviders;
      row.querySelector('[name="primaryProviderId"]').innerHTML = routingProviderOptions(compatible, '', type);
      row.querySelector('[name="fallbackProviderId"]').innerHTML = routingProviderOptions(compatible, '', type);
    });
    root.addEventListener('submit', async (event) => {
      if (event.target.id !== 'smartRoutingForm') return;
      event.preventDefault();
      const form = event.target;
      try {
        const providersData = await DataService.getProviderRecords();
        const providerTypeById = new Map(providersData.map((provider) => [provider.id, provider.type]));
        const rules = $$('.routing-rule-row', form).map((row, index) => {
          const method = row.querySelector('[name="method"]').value;
          return {
            id: row.dataset.routingRule.startsWith('new-') ? `route_${Date.now()}_${index}` : row.dataset.routingRule,
            method, methodType: routingMethodMeta[method]?.type || '',
            minAmount: Number(row.querySelector('[name="minAmount"]').value),
            maxAmount: row.querySelector('[name="maxAmount"]').value === '' ? null : Number(row.querySelector('[name="maxAmount"]').value),
            primaryProviderId: row.querySelector('[name="primaryProviderId"]').value,
            fallbackProviderId: row.querySelector('[name="fallbackProviderId"]').value,
          };
        });
        const priorityRoutes = $$('.routing-priority-group', form).map((group) => ({
          type: group.dataset.routeType,
          primaryProviderId: group.querySelector('[name="priorityPrimary"]').value,
          fallbackProviderId: group.querySelector('[name="priorityFallback"]').value,
        }));
        priorityRoutes.forEach((route) => {
          if (!route.primaryProviderId || (route.fallbackProviderId && route.fallbackProviderId === route.primaryProviderId)) throw new Error('Choose a primary and a different fallback provider');
        });
        rules.forEach((rule) => {
          if (rule.method !== 'any' && providerTypeById.get(rule.primaryProviderId) !== rule.methodType) throw new Error(`${routingMethodMeta[rule.method].label} must use a compatible provider`);
          if (rule.fallbackProviderId === rule.primaryProviderId) throw new Error('Primary and fallback providers must be different');
          if (rule.fallbackProviderId && rule.method !== 'any' && providerTypeById.get(rule.fallbackProviderId) !== rule.methodType) throw new Error(`${routingMethodMeta[rule.method].label} must use a compatible fallback provider`);
          if (rule.maxAmount !== null && rule.maxAmount < rule.minAmount) throw new Error('Maximum amount cannot be less than minimum amount');
        });
        const providerLimits = [...form.querySelectorAll('[name="transactionLimit"]')].map((input) => ({
          id: input.dataset.providerId,
          transactionLimit: Number(input.value),
          dailyLimit: Number(form.querySelector(`[name="dailyLimit"][data-provider-id="${input.dataset.providerId}"]`).value),
        }));
        await DataService.saveRoutingConfig({
          autoFailover: form.elements.autoFailover.checked, priorityRoutes, rules, providerLimits,
        });
        toast('Smart routing configuration saved');
        await renderSmartRouting();
      } catch (error) {
        console.error(error);
        toast(error.message || 'Unable to save routing configuration');
      }
    });
  }

  const financialStatusLabel = (status) => ({
    settled: 'Settled', pending: 'Pending', processing: 'Processing', discrepancy: 'Discrepancy',
  }[status] || status);
  const financialStatusClass = (status) => ({
    settled: 'active', pending: 'pending', processing: 'processing', discrepancy: 'rejected',
  }[status] || 'pending');

  async function renderFinancialManagement() {
    const root = $('#financialManagement');
    root.hidden = false;
    root.innerHTML = '<div class="card skeleton" style="height:280px"></div>';
    const filters = state.financialFilters;
    const [financialData, providers, merchants] = await Promise.all([
      DataService.getFinancialData(filters),
      DataService.getProviderRecords(),
      DataService.getMerchants(),
    ]);
    const { summary, settlements } = financialData;
    const discrepancyCount = settlements.filter((item) => item.status === 'discrepancy').length;
    const pendingCount = settlements.filter((item) => ['pending', 'processing'].includes(item.status)).length;
    const providerTotals = settlements.reduce((totals, item) => {
      const current = totals.get(item.providerId) || { name: item.providerName, volume: 0, fees: 0, settlements: 0 };
      current.volume += item.processedVolume;
      current.fees += item.providerFee;
      current.settlements += 1;
      totals.set(item.providerId, current);
      return totals;
    }, new Map());
    const providerRows = [...providerTotals.values()].sort((a, b) => b.fees - a.fees).map((provider) => `<tr>
      <td data-label="Provider">${esc(provider.name)}</td>
      <td data-label="Processed volume">${merchantMoney.format(provider.volume)}</td>
      <td data-label="Processing fees">${merchantMoney.format(provider.fees)}</td>
      <td data-label="Settlement batches">${nfIN.format(provider.settlements)}</td>
    </tr>`).join('');
    const settlementRows = settlements.map((settlement) => {
      const difference = settlement.settledAmount - settlement.expectedAmount;
      return `<tr class="${settlement.status === 'discrepancy' ? 'financial-row--discrepancy' : ''}">
        <td data-label="Settlement"><strong>${esc(settlement.id)}</strong><small>${esc(settlement.period)}</small></td>
        <td data-label="Merchant">${esc(settlement.merchantName)}</td>
        <td data-label="Provider">${esc(settlement.providerName)}</td>
        <td data-label="Processed">${merchantMoney.format(settlement.processedVolume)}</td>
        <td data-label="Merchant payable">${merchantMoney.format(settlement.payableAmount)}</td>
        <td data-label="Refunds">${merchantMoney.format(settlement.refundAmount)}</td>
        <td data-label="Expected">${merchantMoney.format(settlement.expectedAmount)}</td>
        <td data-label="Settled">${settlement.status === 'pending' || settlement.status === 'processing' ? '—' : merchantMoney.format(settlement.settledAmount)}</td>
        <td data-label="Status"><span class="merchant-status transaction-status--${financialStatusClass(settlement.status)}">${esc(financialStatusLabel(settlement.status))}</span>${settlement.status === 'discrepancy' ? `<small class="financial-difference">${difference > 0 ? '+' : ''}${merchantMoney.format(difference)}</small>` : ''}</td>
        <td data-label="Reconciliation">${settlement.discrepancyReason ? `<span class="financial-discrepancy-note">${icon('alert')}${esc(settlement.discrepancyReason)}</span>` : `<span class="financial-reconciled">${icon('check')} No discrepancy reported</span>`}</td>
      </tr>`;
    }).join('');
    root.innerHTML = `
      <header class="provider-page-head financial-page-head">
        <div><p class="merchant-eyebrow">PAYMENT OPERATIONS</p><h1>Financial Management &amp; Settlement Monitoring</h1><p>Monitor payment volume, fees, merchant payables, refunds, settlement progress, and reconciliation discrepancies.</p></div>
        <div class="financial-page-actions"><span class="merchant-demo-note">${icon('alert')} Demo workspace · sample financial data</span><button type="button" class="merchant-btn merchant-btn--primary" data-finance-action="export">${icon('file')} Generate financial report</button></div>
      </header>
      <section class="financial-summary-panel">
        <header class="card__head"><div><h2><svg class="h-ico h-ico--violet"><use href="#i-bars"/></svg>Financial overview</h2><p class="card__sub">Aggregate sample totals for the selected period.</p></div>
          <label class="financial-period-select">Reporting period<select name="range" form="financialFilters">
            <option value="7d" ${filters.range === '7d' ? 'selected' : ''}>Last 7 days</option>
            <option value="30d" ${filters.range === '30d' ? 'selected' : ''}>Last 30 days</option>
            <option value="90d" ${filters.range === '90d' ? 'selected' : ''}>Last 90 days</option>
          </select></label>
        </header>
        <div class="merchant-summary financial-summary">
          <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--blue">${icon('card')}</span><div><small>Total processed volume</small><strong>${merchantMoney.format(summary.processedVolume)}</strong></div></article>
          <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--violet">${icon('dollar')}</span><div><small>Platform transaction fees</small><strong>${merchantMoney.format(summary.platformFees)}</strong></div></article>
          <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--amber">${icon('pulse')}</span><div><small>Provider processing fees</small><strong>${merchantMoney.format(summary.providerFees)}</strong></div></article>
          <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--green">${icon('check')}</span><div><small>Merchant payable amounts</small><strong>${merchantMoney.format(summary.merchantPayables)}</strong></div></article>
          <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--red">${icon('dollar')}</span><div><small>Refund amounts</small><strong>${merchantMoney.format(summary.refundAmount)}</strong></div></article>
          <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--amber">${icon('clock')}</span><div><small>Pending settlement value</small><strong>${merchantMoney.format(summary.pendingSettlementAmount)}</strong></div></article>
        </div>
      </section>
      <section class="card financial-settlements-panel">
        <header class="card__head"><div><h2><svg class="h-ico h-ico--blue"><use href="#i-clock"/></svg>Settlement monitoring</h2><p class="card__sub">Compare provider settlement amounts against calculated merchant payables.</p></div>
          <div class="financial-status-counts"><span>${nfIN.format(pendingCount)} pending</span><span class="${discrepancyCount ? 'has-discrepancy' : ''}">${nfIN.format(discrepancyCount)} discrepancies</span></div>
        </header>
        <form id="financialFilters" class="financial-filters">
          <label>Settlement status<select name="status"><option value="all">All statuses</option>${['settled', 'pending', 'processing', 'discrepancy'].map((status) => `<option value="${status}" ${filters.status === status ? 'selected' : ''}>${financialStatusLabel(status)}</option>`).join('')}</select></label>
          <label>Payment provider<select name="providerId"><option value="">All providers</option>${providers.map((provider) => `<option value="${esc(provider.id)}" ${filters.providerId === provider.id ? 'selected' : ''}>${esc(provider.name)}</option>`).join('')}</select></label>
          <label>Merchant<select name="merchantId"><option value="">All merchants</option>${merchants.map((merchant) => `<option value="${esc(merchant.id)}" ${filters.merchantId === merchant.id ? 'selected' : ''}>${esc(merchant.name)}</option>`).join('')}</select></label>
          <label class="financial-discrepancy-filter"><input type="checkbox" name="discrepanciesOnly" ${filters.discrepanciesOnly ? 'checked' : ''} /> Discrepancies only</label>
          <div class="financial-filter-actions"><button type="submit" class="merchant-btn merchant-btn--primary">Apply filters</button><button type="button" class="merchant-btn" data-finance-action="clear">Clear filters</button></div>
        </form>
        <div class="merchant-table-wrap financial-table-wrap"><table class="merchant-table financial-settlement-table"><thead><tr><th>Settlement</th><th>Merchant</th><th>Provider</th><th>Processed</th><th>Merchant payable</th><th>Refunds</th><th>Expected</th><th>Settled</th><th>Status</th><th>Reconciliation</th></tr></thead><tbody>${settlementRows || '<tr><td class="merchant-empty-cell" colspan="10">No settlement records match these filters.</td></tr>'}</tbody></table></div>
        <p class="financial-table-footnote">Pending amounts are not yet reported as paid. Discrepancies require review against provider settlement statements.</p>
      </section>
      <section class="card financial-provider-fees-panel">
        <header class="card__head"><div><h2><svg class="h-ico h-ico--violet"><use href="#i-server"/></svg>Provider processing fee breakdown</h2><p class="card__sub">Provider fees by matched settlement records in the current result set.</p></div></header>
        <div class="merchant-table-wrap financial-table-wrap"><table class="merchant-table financial-provider-fees-table"><thead><tr><th>Provider</th><th>Processed volume</th><th>Provider processing fees</th><th>Settlement batches</th></tr></thead><tbody>${providerRows || '<tr><td class="merchant-empty-cell" colspan="4">No provider fee records match these filters.</td></tr>'}</tbody></table></div>
      </section>`;
    bindFinancialEvents(root);
  }

  const refundStatusLabel = (status) => ({
    requested: 'Needs review', approved: 'Approved', processing: 'Processing',
    failed: 'Failed', completed: 'Completed', rejected: 'Rejected',
  }[status] || status);
  const refundStatusClass = (status) => ({
    requested: 'pending', approved: 'processing', processing: 'processing',
    failed: 'rejected', completed: 'active', rejected: 'refunded',
  }[status] || 'pending');
  const disputeStatusLabel = (status) => ({
    none: 'No dispute', open: 'Open', under_review: 'Under review', resolved: 'Resolved',
  }[status] || status);

  async function renderRefundManagement() {
    const root = $('#refundManagement');
    root.hidden = false;
    root.innerHTML = '<div class="card skeleton" style="height:280px"></div>';
    const [refunds, audit] = await Promise.all([
      DataService.getRefunds(state.refundFilters),
      DataService.getRefundAudit(30),
    ]);
    const allRefunds = await DataService.getRefunds();
    const stats = allRefunds.reduce((result, refund) => {
      result.total += 1;
      result[refund.status] = (result[refund.status] || 0) + 1;
      if (refund.status === 'requested') result.amount += refund.amount;
      if (refund.dispute.status === 'open' || refund.dispute.status === 'under_review') result.disputes += 1;
      return result;
    }, { total: 0, amount: 0, disputes: 0 });
    const selected = state.refundDetailId ? refunds.find((refund) => refund.id === state.refundDetailId) || allRefunds.find((refund) => refund.id === state.refundDetailId) : null;
    const rows = refunds.map((refund) => `<tr class="${refund.status === 'failed' ? 'refund-row--failed' : ''}">
      <td data-label="Refund"><strong>${esc(refund.id)}</strong><small>${esc(fmtDateTime(refund.requestedAt))}</small></td>
      <td data-label="Transaction">${esc(refund.transactionId)}</td>
      <td data-label="Merchant">${esc(refund.merchantName)}</td>
      <td data-label="Customer">${esc(refund.customer)}</td>
      <td data-label="Provider">${esc(refund.providerName)}</td>
      <td data-label="Amount">${merchantMoney.format(refund.amount)}</td>
      <td data-label="Reason">${esc(refund.reason)}</td>
      <td data-label="Status"><span class="merchant-status transaction-status--${refundStatusClass(refund.status)}">${esc(refundStatusLabel(refund.status))}</span></td>
      <td data-label="Dispute"><span class="refund-dispute-badge refund-dispute-badge--${esc(refund.dispute.status)}">${esc(disputeStatusLabel(refund.dispute.status))}</span></td>
      <td data-label="Action"><button type="button" class="merchant-btn merchant-btn--subtle" data-refund-action="details" data-refund-id="${esc(refund.id)}">${refund.status === 'requested' ? 'Review' : 'Details'}</button></td>
    </tr>`).join('');
    const auditRows = audit.map((entry) => `<tr>
      <td data-label="Time">${esc(fmtDateTime(entry.at))}</td>
      <td data-label="Refund">${esc(entry.refundId)}</td>
      <td data-label="Transaction">${esc(entry.transactionId)}</td>
      <td data-label="Action">${esc(entry.action)}</td>
      <td data-label="Performed by">${esc(entry.actor)}</td>
      <td data-label="Record">${esc(entry.note)}</td>
    </tr>`).join('');
    root.innerHTML = `
      <header class="provider-page-head refund-page-head">
        <div><p class="merchant-eyebrow">PAYMENT OPERATIONS</p><h1>Refund &amp; Dispute Management</h1><p>Review refund requests, monitor provider processing, investigate disputes, and maintain an auditable history.</p></div>
        <span class="merchant-demo-note">${icon('alert')} Demo workspace · sample requests</span>
      </header>
      <div class="merchant-summary refund-summary">
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--blue">${icon('clipboard')}</span><div><small>Refund requests</small><strong>${nfIN.format(stats.total)}</strong></div></article>
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--amber">${icon('clock')}</span><div><small>Awaiting review</small><strong>${nfIN.format(stats.requested || 0)}</strong></div></article>
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--red">${icon('excl')}</span><div><small>Failed refunds</small><strong>${nfIN.format(stats.failed || 0)}</strong></div></article>
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--violet">${icon('dollar')}</span><div><small>Refund value under review</small><strong>${merchantMoney.format(stats.amount)}</strong></div></article>
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--red">${icon('alert')}</span><div><small>Active disputes</small><strong>${nfIN.format(stats.disputes)}</strong></div></article>
      </div>
      <section class="card refund-requests-panel">
        <header class="card__head"><div><h2><svg class="h-ico h-ico--blue"><use href="#i-clipboard"/></svg>Refund requests</h2><p class="card__sub">Review reasons and follow each request through provider processing.</p></div></header>
        <form id="refundFilters" class="refund-filters">
          <label>Refund status<select name="status"><option value="all">All statuses</option>${['requested', 'approved', 'processing', 'failed', 'completed', 'rejected'].map((status) => `<option value="${status}" ${state.refundFilters.status === status ? 'selected' : ''}>${refundStatusLabel(status)}</option>`).join('')}</select></label>
          <label>Dispute status<select name="disputeStatus"><option value="all">All disputes</option>${['open', 'under_review', 'resolved', 'none'].map((status) => `<option value="${status}" ${state.refundFilters.disputeStatus === status ? 'selected' : ''}>${disputeStatusLabel(status)}</option>`).join('')}</select></label>
          <label>Search<input type="search" name="q" value="${esc(state.refundFilters.q)}" placeholder="Refund, transaction, merchant..." /></label>
          <div class="refund-filter-actions"><button type="submit" class="merchant-btn merchant-btn--primary">Apply filters</button><button type="button" class="merchant-btn" data-refund-action="clear">Clear</button></div>
        </form>
        <div class="merchant-table-wrap refund-table-wrap"><table class="merchant-table refund-table"><thead><tr><th>Refund</th><th>Transaction</th><th>Merchant</th><th>Customer</th><th>Provider</th><th>Amount</th><th>Reason</th><th>Status</th><th>Dispute</th><th>Action</th></tr></thead><tbody>${rows || '<tr><td class="merchant-empty-cell" colspan="10">No refund requests match these filters.</td></tr>'}</tbody></table></div>
      </section>
      <section class="card refund-audit-panel">
        <header class="card__head"><div><h2><svg class="h-ico h-ico--violet"><use href="#i-shield"/></svg>Refund audit history</h2><p class="card__sub">Recent decisions, provider updates, dispute actions, and investigation notes.</p></div></header>
        <div class="merchant-table-wrap refund-table-wrap"><table class="merchant-table refund-audit-table"><thead><tr><th>Time</th><th>Refund</th><th>Transaction</th><th>Action</th><th>Performed by</th><th>Audit record</th></tr></thead><tbody>${auditRows || '<tr><td class="merchant-empty-cell" colspan="6">No refund audit records.</td></tr>'}</tbody></table></div>
      </section>
      ${selected ? renderRefundDetails(selected) : ''}`;
    bindRefundEvents(root);
    if (selected) $('#refundDetailsDialog', root)?.focus();
  }

  function renderRefundDetails(refund) {
    const history = [...refund.history].sort((a, b) => new Date(a.at) - new Date(b.at));
    const actions = refund.status === 'requested'
      ? `<button type="button" class="merchant-btn merchant-btn--approve" data-refund-action="approve" data-refund-id="${esc(refund.id)}">${icon('check')} Approve refund</button><button type="button" class="merchant-btn merchant-btn--reject" data-refund-action="reject" data-refund-id="${esc(refund.id)}">${icon('x')} Reject refund</button>`
      : refund.status === 'approved' || refund.status === 'failed'
        ? `<button type="button" class="merchant-btn merchant-btn--primary" data-refund-action="process" data-refund-id="${esc(refund.id)}">${icon('pulse')} ${refund.status === 'failed' ? 'Retry refund' : 'Submit for processing'}</button>`
        : refund.status === 'processing'
          ? `<button type="button" class="merchant-btn merchant-btn--approve" data-refund-action="complete" data-refund-id="${esc(refund.id)}">${icon('check')} Mark completed</button><button type="button" class="merchant-btn merchant-btn--reject" data-refund-action="fail" data-refund-id="${esc(refund.id)}">${icon('excl')} Mark failed</button>`
          : '';
    return `<div class="merchant-dialog-backdrop refund-dialog-backdrop" data-refund-action="close-details">
      <section class="merchant-profile-dialog refund-details-dialog" id="refundDetailsDialog" role="dialog" aria-modal="true" aria-labelledby="refundDetailsTitle" tabindex="-1">
        <header class="merchant-profile-head"><div class="merchant-profile-identity"><span class="merchant-summary-icon merchant-summary-icon--violet">${icon('clipboard')}</span><div><p class="merchant-eyebrow">REFUND REVIEW</p><h2 id="refundDetailsTitle">${esc(refund.id)}</h2><span class="merchant-profile-meta">${esc(refund.transactionId)} · ${esc(fmtDateTime(refund.requestedAt))}</span></div></div><button type="button" class="merchant-icon-action" data-refund-action="close-details" aria-label="Close refund details">${icon('x')}</button></header>
        <div class="merchant-profile-content refund-detail-content">
          <section class="merchant-detail-card"><h3>Request details</h3><dl class="merchant-details refund-detail-grid">
            <div><dt>Status</dt><dd><span class="merchant-status transaction-status--${refundStatusClass(refund.status)}">${esc(refundStatusLabel(refund.status))}</span></dd></div>
            <div><dt>Amount</dt><dd>${merchantMoney.format(refund.amount)} ${esc(refund.currency)}</dd></div>
            <div><dt>Merchant</dt><dd>${esc(refund.merchantName)}</dd></div>
            <div><dt>Provider</dt><dd>${esc(refund.providerName)}</dd></div>
            <div><dt>Customer</dt><dd>${esc(refund.customer)}</dd></div>
            <div><dt>Reason</dt><dd>${esc(refund.reason)}</dd></div>
          </dl></section>
          <section class="merchant-detail-card refund-dispute-card"><header><h3>Customer dispute</h3><span class="refund-dispute-badge refund-dispute-badge--${esc(refund.dispute.status)}">${esc(disputeStatusLabel(refund.dispute.status))}</span></header>
            <p>${esc(refund.dispute.reason || 'No dispute has been reported for this refund.')}</p>
            <form class="refund-dispute-form" data-refund-id="${esc(refund.id)}">
              <label>Update dispute status<select name="disputeStatus">${['none', 'open', 'under_review', 'resolved'].map((status) => `<option value="${status}" ${refund.dispute.status === status ? 'selected' : ''}>${disputeStatusLabel(status)}</option>`).join('')}</select></label>
              <label>Investigation update<textarea name="disputeNote" rows="2" maxlength="500" placeholder="Add findings or resolution details"></textarea></label>
              <button type="submit" class="merchant-btn">Save dispute update</button>
            </form>
          </section>
          <section class="merchant-detail-card"><h3>Investigation notes</h3>
            ${refund.notes.length ? `<ul class="refund-note-list">${refund.notes.map((note) => `<li><p>${esc(note.text)}</p><small>${esc(note.actor)} · ${esc(fmtDateTime(note.at))}</small></li>`).join('')}</ul>` : '<p class="refund-empty-note">No investigation notes have been added.</p>'}
            <form class="refund-note-form" data-refund-id="${esc(refund.id)}"><label for="refundNoteInput">Add investigation note</label><textarea id="refundNoteInput" name="note" rows="3" maxlength="1000" required placeholder="Record review findings or next steps"></textarea><button type="submit" class="merchant-btn merchant-btn--primary">Add note</button></form>
          </section>
          ${actions ? `<section class="refund-review-actions"><label for="refundDecisionNote">Decision note${refund.status === 'requested' ? ' (required for rejection)' : ''}</label><textarea id="refundDecisionNote" rows="2" maxlength="500" placeholder="Add a reason or processing update"></textarea><div>${actions}</div></section>` : ''}
          <section class="merchant-detail-card transaction-history-card"><h3>Refund history</h3><ol class="transaction-timeline">${history.map((entry) => `<li class="transaction-timeline__item transaction-timeline__item--${entry.action.toLowerCase().includes('failed') || entry.action.toLowerCase().includes('rejected') ? 'rejected' : entry.action.toLowerCase().includes('completed') ? 'active' : 'pending'}"><span class="transaction-timeline__mark"></span><div><strong>${esc(entry.action)}</strong><p>${esc(entry.note)}</p><time>${esc(entry.actor)} · ${esc(fmtDateTime(entry.at))}</time></div></li>`).join('')}</ol></section>
        </div>
      </section>
    </div>`;
  }

  function bindRefundEvents(root) {
    if (root.dataset.eventsBound) return;
    root.dataset.eventsBound = 'true';
    root.addEventListener('submit', async (event) => {
      if (event.target.id === 'refundFilters') {
        event.preventDefault();
        const form = event.target;
        state.refundFilters = { status: form.elements.status.value, disputeStatus: form.elements.disputeStatus.value, q: form.elements.q.value.trim() };
        state.refundDetailId = null;
        renderRefundManagement().catch((error) => { console.error(error); toast('Unable to filter refund requests'); });
        return;
      }
      const noteForm = event.target.closest('.refund-note-form');
      const disputeForm = event.target.closest('.refund-dispute-form');
      if (!noteForm && !disputeForm) return;
      event.preventDefault();
      try {
        if (noteForm) {
          await DataService.addRefundNote(noteForm.dataset.refundId, noteForm.elements.note.value);
          toast('Investigation note added to refund audit');
        } else {
          await DataService.updateRefundDispute(disputeForm.dataset.refundId, disputeForm.elements.disputeStatus.value, disputeForm.elements.disputeNote.value);
          toast('Dispute status updated');
        }
        await renderRefundManagement();
      } catch (error) {
        console.error(error);
        toast(error.message || 'Unable to save refund investigation');
      }
    });
    root.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-refund-action]');
      if (!button) return;
      const action = button.dataset.refundAction;
      const id = button.dataset.refundId;
      if (action === 'close-details' && event.target !== button && !button.classList.contains('merchant-icon-action')) return;
      if (action === 'close-details') {
        state.refundDetailId = null;
        renderRefundManagement().catch((error) => { console.error(error); toast('Unable to close refund details'); });
        return;
      }
      if (action === 'clear') {
        state.refundFilters = { status: 'all', disputeStatus: 'all', q: '' };
        state.refundDetailId = null;
        renderRefundManagement().catch((error) => { console.error(error); toast('Unable to clear refund filters'); });
        return;
      }
      if (action === 'details') {
        state.refundDetailId = id;
        renderRefundManagement().catch((error) => { console.error(error); toast('Unable to load refund details'); });
        return;
      }
      if (['approve', 'reject', 'process', 'complete', 'fail'].includes(action)) {
        const note = $('#refundDecisionNote', root)?.value.trim() || '';
        try {
          await DataService.updateRefund(id, action, note);
          const actionMessage = { approve: 'approved', reject: 'rejected', process: 'submitted for processing', complete: 'marked completed', fail: 'marked failed' }[action];
          toast(`Refund ${actionMessage}`);
          await renderRefundManagement();
        } catch (error) {
          console.error(error);
          toast(error.message || 'Unable to update refund status');
        }
      }
    });
  }

  const reconciliationExceptionLabel = (type) => ({
    matched: 'Matched', missing_internal: 'Missing internal transaction',
    missing_provider: 'Missing provider record', amount_mismatch: 'Amount mismatch',
    duplicate: 'Duplicate provider record',
  }[type] || type);
  const reconciliationStatusLabel = (status) => ({
    review_required: 'Review required', reconciled: 'Reconciled', processing: 'Processing',
  }[status] || status);

  const adminUserStatusLabel = (admin) => admin.invitationStatus === 'pending'
    ? 'Invitation pending' : admin.status === 'active' ? 'Active' : 'Deactivated';

  function defaultAdminPermissions(role) {
    const rolePermissions = {
      'Super Admin': ['manage_admins', 'manage_merchants', 'manage_providers', 'view_transactions', 'manage_refunds', 'manage_finance', 'manage_risk', 'view_audit_logs'],
      'Operations Admin': ['manage_merchants', 'manage_providers', 'view_transactions', 'manage_risk', 'view_audit_logs'],
      'Finance Admin': ['view_transactions', 'manage_refunds', 'manage_finance', 'view_audit_logs'],
      'Support Admin': ['view_transactions', 'manage_refunds', 'manage_risk'],
      'Read-only Analyst': ['view_transactions', 'view_audit_logs'],
    };
    return rolePermissions[role] || [];
  }

  function validIPv4Range(value) {
    const [address, prefix] = value.split('/');
    const octets = address.split('.');
    return octets.length === 4
      && octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255)
      && (prefix === undefined || (/^\d{1,2}$/.test(prefix) && Number(prefix) <= 32));
  }

  const auditCategoryLabel = (category) => ({
    authentication: 'Authentication', merchant: 'Merchant', provider: 'Provider',
    routing: 'Routing', refund: 'Refund', reconciliation: 'Reconciliation',
    admin: 'Admin access', security: 'Security',
  }[category] || category);

  async function renderSecurityCenter() {
    const root = $('#auditManagement');
    root.hidden = false;
    root.innerHTML = '<div class="card skeleton" style="height:280px"></div>';
    const { logs, summary, total, demo } = await DataService.getSecurityAuditLogs(state.securityAuditFilters);
    const rows = logs.map((entry) => {
      const changes = (entry.changes || []).map((change) => `<div class="security-audit-change">
        <strong>${esc(change.field)}</strong>
        <span><small>Previous</small><code>${esc(JSON.stringify(change.previousValue ?? '—'))}</code></span>
        <span><small>Updated</small><code>${esc(JSON.stringify(change.updatedValue ?? '—'))}</code></span>
      </div>`).join('');
      return `<tr>
        <td data-label="Timestamp">${esc(fmtDateTime(entry.createdAt))}<small>${esc(timeAgo(entry.createdAt))}</small></td>
        <td data-label="Event"><span class="security-audit-category security-audit-category--${esc(entry.category)}">${esc(auditCategoryLabel(entry.category))}</span><strong class="security-audit-action">${esc(entry.action)}</strong><small>${esc(entry.eventType)}</small></td>
        <td data-label="Actor"><strong>${esc(entry.actorName)}</strong><small>${esc(entry.actorId || '—')}</small></td>
        <td data-label="Target">${esc(entry.target || '—')}</td>
        <td data-label="Outcome"><span class="security-audit-outcome security-audit-outcome--${esc(entry.outcome)}">${esc(entry.outcome)}</span></td>
        <td data-label="Configuration">${changes ? `<details class="security-audit-details"><summary>View ${entry.changes.length} change${entry.changes.length === 1 ? '' : 's'}</summary><div class="security-audit-diff">${changes}</div></details>` : '<span class="security-audit-no-change">No configuration change</span>'}</td>
        <td data-label="Source IP">${esc(entry.ipAddress || '—')}</td>
      </tr>`;
    }).join('');
    root.innerHTML = `
      <header class="merchant-page-head security-center-head">
        <div><p class="merchant-eyebrow">COMPLIANCE · SECURITY</p><h1>Audit Logs &amp; Security Center</h1><p>Review administrative and authentication events, including prior and updated configuration values.</p></div>
        <div class="security-center-actions"><span class="merchant-demo-note">${icon('shield')} ${demo ? 'Demo workspace · sample and session events' : 'Security audit events'}</span><button type="button" class="merchant-btn merchant-btn--primary" data-security-audit-action="export">${icon('file')} Export CSV</button></div>
      </header>
      <div class="merchant-summary security-audit-summary">
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--blue">${icon('file')}</span><div><small>Matching audit events</small><strong>${nfIN.format(total)}</strong></div></article>
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--green">${icon('pulse')}</span><div><small>Authentication events</small><strong>${nfIN.format(summary.authEvents)}</strong></div></article>
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--red">${icon('alert')}</span><div><small>Failed / denied events</small><strong>${nfIN.format(summary.failed)}</strong></div></article>
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--violet">${icon('users')}</span><div><small>Admin access changes</small><strong>${nfIN.format(summary.adminChanges)}</strong></div></article>
      </div>
      <section class="card merchant-panel security-audit-panel">
        <header class="card__head"><div><h2>${icon('shield')} Security event ledger</h2><p class="card__sub">Append-only records with actor, timestamp, outcome, and before/after values where applicable.</p></div></header>
        <form class="security-audit-filters" id="securityAuditFilters">
          <label>Event category<select name="category">${['all', 'authentication', 'merchant', 'provider', 'routing', 'refund', 'reconciliation', 'admin', 'security'].map((category) => `<option value="${category}" ${state.securityAuditFilters.category === category ? 'selected' : ''}>${category === 'all' ? 'All categories' : esc(auditCategoryLabel(category))}</option>`).join('')}</select></label>
          <label>Outcome<select name="outcome">${['all', 'success', 'failure', 'denied'].map((outcome) => `<option value="${outcome}" ${state.securityAuditFilters.outcome === outcome ? 'selected' : ''}>${outcome === 'all' ? 'All outcomes' : esc(outcome[0].toUpperCase() + outcome.slice(1))}</option>`).join('')}</select></label>
          <label>From<input type="date" name="from" value="${esc(state.securityAuditFilters.from)}"></label>
          <label>To<input type="date" name="to" value="${esc(state.securityAuditFilters.to)}"></label>
          <label class="security-audit-search">Search<input type="search" name="q" value="${esc(state.securityAuditFilters.q)}" placeholder="Action, actor, target, ID"></label>
          <button type="submit" class="merchant-btn">${icon('search')} Apply filters</button>
        </form>
        <p class="security-audit-result-note">Showing ${nfIN.format(logs.length)} of ${nfIN.format(total)} matching records · timestamps shown in Asia/Dhaka · actor IP addresses are masked.</p>
        <div class="merchant-table-wrap security-audit-table-wrap"><table class="merchant-table security-audit-table"><thead><tr><th>Timestamp</th><th>Event</th><th>Actor</th><th>Target</th><th>Outcome</th><th>Previous / updated values</th><th>Source IP</th></tr></thead><tbody>${rows || '<tr><td class="merchant-empty-cell" colspan="7">No audit records match these filters.</td></tr>'}</tbody></table></div>
        <p class="security-audit-safety-note">Secrets, passwords, MFA recovery material, authorization headers, and raw payment data must never be recorded. Production audit storage must be immutable and populated server-side.</p>
      </section>`;
    if (!root.dataset.auditEventsBound) {
      root.dataset.auditEventsBound = 'true';
      root.addEventListener('submit', (event) => {
        if (event.target.id !== 'securityAuditFilters') return;
        event.preventDefault();
        const form = new FormData(event.target);
        const from = String(form.get('from') || '');
        const to = String(form.get('to') || '');
        if (from && to && from > to) {
          toast('Start date must be on or before end date');
          return;
        }
        state.securityAuditFilters = {
          category: String(form.get('category') || 'all'),
          outcome: String(form.get('outcome') || 'all'),
          from, to, q: String(form.get('q') || '').trim(),
        };
        renderSecurityCenter().catch((error) => {
          console.error(error);
          toast('Failed to filter security audit events');
        });
      });
      root.addEventListener('click', async (event) => {
        if (!event.target.closest('[data-security-audit-action="export"]')) return;
        try {
          const result = await DataService.getSecurityAuditLogs(state.securityAuditFilters);
          const headers = ['Timestamp', 'Event Type', 'Category', 'Action', 'Actor', 'Actor ID', 'Target', 'Outcome', 'Source IP', 'Changes'];
          const lines = result.logs.map((entry) => [
            entry.createdAt, entry.eventType, entry.category, entry.action, entry.actorName, entry.actorId,
            entry.target, entry.outcome, entry.ipAddress,
            (entry.changes || []).map((change) => `${change.field}: ${JSON.stringify(change.previousValue ?? '—')} -> ${JSON.stringify(change.updatedValue ?? '—')}`).join('; '),
          ]);
          const url = URL.createObjectURL(new Blob(['\uFEFF', [headers, ...lines].map((row) => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
          const link = document.createElement('a');
          link.href = url;
          link.download = `security-audit-${new Date().toISOString().slice(0, 10)}.csv`;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          toast(`Exported ${result.logs.length} audit events`);
        } catch (error) {
          console.error(error);
          toast('Failed to export security audit events');
        }
      });
    }
  }

  async function renderAdminUserManagement(dialogId = state.adminUserDialogId) {
    const root = $('#adminUserManagement');
    root.hidden = false;
    root.innerHTML = '<div class="card skeleton" style="height:280px"></div>';
    const [allAdmins, users, options] = await Promise.all([
      DataService.getAdminUsers(),
      DataService.getAdminUsers(state.adminUserFilters),
      DataService.getAdminAccessOptions(),
    ]);
    const activeCount = allAdmins.filter((admin) => admin.status === 'active').length;
    const protectedCount = allAdmins.filter((admin) => admin.twoFactorEnabled).length;
    const adminsNeeding2FA = allAdmins.filter((admin) => admin.status === 'active' && !admin.twoFactorEnabled).length;
    const selectedAdmin = dialogId && dialogId !== 'new' ? await DataService.getAdminUser(dialogId) : null;
    const isCreating = dialogId === 'new';
    const permissions = options.permissions.map((permission) => {
      const checked = selectedAdmin ? selectedAdmin.permissions.includes(permission.key) : defaultAdminPermissions('Support Admin').includes(permission.key);
      return `<label class="admin-permission-option"><input type="checkbox" name="permission" value="${esc(permission.key)}" ${checked ? 'checked' : ''}><span>${esc(permission.label)}</span></label>`;
    }).join('');
    const historyRows = selectedAdmin?.loginHistory?.length ? selectedAdmin.loginHistory.map((entry) => {
      const maskedIp = String(entry.ipAddress || '—').replace(/(\.\d{1,3})$/, '.**');
      return `<tr><td>${esc(timeAgo(entry.at))}<small>${esc(fmtDateTime(entry.at))}</small></td><td>${esc(entry.location)}</td><td>${esc(maskedIp)}</td><td>${esc(entry.device)}</td><td><span class="admin-login-result ${entry.outcome.startsWith('Success') ? 'is-success' : 'is-failed'}">${esc(entry.outcome)}</span></td><td>${entry.twoFactor ? 'Verified' : 'Not used'}</td></tr>`;
    }).join('') : '<tr><td colspan="6" class="merchant-empty-cell">No login events are available.</td></tr>';
    const rows = users.map((admin) => `<tr>
      <td data-label="Admin"><div class="merchant-identity"><span class="merchant-avatar">${esc(admin.name.slice(0, 1))}</span><span><strong>${esc(admin.name)}${admin.id === 'adm_1001' ? ' <small class="admin-current-label">You</small>' : ''}</strong><small>${esc(admin.email)} · ${esc(admin.id)}</small></span></div></td>
      <td data-label="Role"><span class="admin-role-badge">${esc(admin.role)}</span></td>
      <td data-label="Permissions">${nfIN.format(admin.permissions.length)} permissions</td>
      <td data-label="Two-factor"><span class="admin-security-badge ${admin.twoFactorEnabled ? 'is-enabled' : 'is-disabled'}">${admin.twoFactorEnabled ? 'Enabled' : 'Not enabled'}</span></td>
      <td data-label="Last login">${admin.loginHistory?.length ? esc(timeAgo(admin.loginHistory[0].at)) : 'Never'}</td>
      <td data-label="Status"><span class="merchant-status merchant-status--${admin.invitationStatus === 'pending' ? 'pending' : admin.status === 'active' ? 'active' : 'suspended'}">${esc(adminUserStatusLabel(admin))}</span></td>
      <td data-label="Actions"><div class="merchant-row-actions">
        <button type="button" class="merchant-btn merchant-btn--subtle" data-admin-action="manage" data-admin-id="${esc(admin.id)}">Manage</button>
        <button type="button" class="merchant-btn ${admin.status === 'active' ? 'merchant-btn--reject' : 'merchant-btn--approve'}" data-admin-action="toggle-status" data-admin-id="${esc(admin.id)}" ${admin.id === 'adm_1001' ? 'disabled title="You cannot deactivate your own account"' : admin.invitationStatus === 'pending' ? 'disabled title="The admin must accept their invitation before activation"' : ''}>${admin.invitationStatus === 'pending' ? 'Invite pending' : admin.status === 'active' ? 'Deactivate' : 'Activate'}</button>
      </div></td>
    </tr>`).join('');
    const roleOptions = options.roles.map((role) => `<option value="${esc(role)}" ${(selectedAdmin?.role || 'Support Admin') === role ? 'selected' : ''}>${esc(role)}</option>`).join('');
    const modal = dialogId ? `<div class="merchant-dialog-backdrop admin-users-backdrop" data-admin-action="backdrop">
      <section class="merchant-profile-dialog admin-user-dialog" role="dialog" aria-modal="true" aria-labelledby="adminUserDialogTitle" tabindex="-1">
        <header class="merchant-profile-head"><div class="merchant-profile-identity"><span class="merchant-avatar merchant-avatar--large">${esc(selectedAdmin?.name?.slice(0, 1) || '＋')}</span><div><h2 id="adminUserDialogTitle">${isCreating ? 'Create admin account' : `Manage ${esc(selectedAdmin.name)}`}</h2><p class="merchant-profile-meta">${isCreating ? 'Invite an administrator and configure access.' : `${esc(selectedAdmin.email)} · ${esc(selectedAdmin.id)}`}</p></div></div><button type="button" class="merchant-icon-action" aria-label="Close dialog" data-admin-action="close">${icon('x')}</button></header>
        <div class="merchant-profile-content admin-user-dialog-content">
          <form id="adminUserForm" data-admin-user-form="${isCreating ? 'create' : 'update'}" ${selectedAdmin ? `data-admin-id="${esc(selectedAdmin.id)}"` : ''}>
            <section class="admin-settings-section"><h3>Admin profile</h3><div class="admin-form-grid">
              <label>Full name<input name="name" required maxlength="100" autocomplete="name" value="${esc(selectedAdmin?.name || '')}" placeholder="Enter full name"></label>
              <label>Work email<input type="email" name="email" required maxlength="254" autocomplete="email" value="${esc(selectedAdmin?.email || '')}" placeholder="admin@example.com"></label>
              <label>Role<select name="role" id="adminRoleSelect" required>${roleOptions}</select></label>
              ${isCreating ? '<p class="admin-invite-note">An invitation will be prepared by the backend. No password is collected or stored in this dashboard.</p>' : ''}
            </div></section>
            <section class="admin-settings-section"><div class="admin-section-heading"><div><h3>Permissions</h3><p>Role assignment is not a substitute for server-side authorization.</p></div></div><div class="admin-permissions-grid">${permissions}</div></section>
            <section class="admin-settings-section"><div class="admin-section-heading"><div><h3>Access restrictions</h3><p>Limit sign-in to approved IPv4 addresses or CIDR ranges.</p></div></div>
              <label class="admin-check-option"><input type="checkbox" name="requireApprovedNetwork" ${selectedAdmin?.requireApprovedNetwork ? 'checked' : ''}><span>Require sign-in from an approved network</span></label>
              <label class="admin-form-label">Allowed IPv4 addresses / CIDR ranges<textarea name="allowedIpRanges" rows="3" placeholder="One per line, e.g. 203.0.113.0/24">${esc((selectedAdmin?.allowedIpRanges || []).join('\n'))}</textarea></label>
            </section>
            <section class="admin-settings-section admin-security-section"><div class="admin-section-heading"><div><h3>Account security</h3><p>Two-factor enrollment must be enforced and verified by the identity backend.</p></div></div>
              <label class="admin-check-option"><input type="checkbox" name="${isCreating ? 'twoFactorRequired' : 'twoFactorEnabled'}" ${selectedAdmin?.twoFactorEnabled || isCreating ? 'checked' : ''}><span>${isCreating ? 'Require two-factor enrollment before access' : 'Two-factor authentication enrolled'}</span></label>
              <p class="admin-safety-note">${isCreating ? 'New accounts remain inactive until the invitee accepts the invitation and completes required enrollment.' : 'This demo changes the enrollment state only. It does not enroll a real authenticator or generate recovery codes.'}</p>
            </section>
            <div class="admin-form-actions"><button type="button" class="merchant-btn" data-admin-action="close">Cancel</button><button type="submit" class="merchant-btn merchant-btn--primary">${isCreating ? 'Create admin &amp; invite' : 'Save admin settings'}</button></div>
          </form>
          ${selectedAdmin ? `<section class="admin-settings-section admin-login-history"><div class="admin-section-heading"><div><h3>Recent login history</h3><p>IP addresses are masked in this view.</p></div><span class="merchant-count">${selectedAdmin.loginHistory.length} events</span></div><div class="merchant-table-wrap"><table class="merchant-table"><thead><tr><th>Time</th><th>Location</th><th>IP address</th><th>Device</th><th>Result</th><th>2FA</th></tr></thead><tbody>${historyRows}</tbody></table></div></section>` : ''}
        </div>
      </section>
    </div>` : '';
    root.innerHTML = `
      <header class="merchant-page-head admin-users-page-head">
        <div><p class="merchant-eyebrow">SECURITY &amp; ACCESS CONTROL</p><h1>Admin User &amp; Role Management</h1><p>Create administrator accounts, assign least-privilege access, and review authentication activity.</p></div>
        <div class="admin-users-header-actions"><span class="merchant-demo-note">${icon('alert')} Demo workspace · changes reset on reload</span><button type="button" class="merchant-btn merchant-btn--primary" data-admin-action="create">${icon('plus')} Add admin</button></div>
      </header>
      <div class="merchant-summary admin-user-summary">
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--blue">${icon('users')}</span><div><small>Admin accounts</small><strong>${nfIN.format(allAdmins.length)}</strong></div></article>
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--green">${icon('check')}</span><div><small>Active</small><strong>${nfIN.format(activeCount)}</strong></div></article>
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--violet">${icon('shield')}</span><div><small>2FA protected</small><strong>${nfIN.format(protectedCount)} / ${nfIN.format(allAdmins.length)}</strong></div></article>
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--amber">${icon('alert')}</span><div><small>Active accounts without 2FA</small><strong>${nfIN.format(adminsNeeding2FA)}</strong></div></article>
      </div>
      <section class="card merchant-panel admin-users-panel">
        <header class="card__head"><div><h2>${icon('users')} Administrator accounts</h2><p class="card__sub">Review roles, account status, security posture, and recent sign-ins.</p></div></header>
        <form class="merchant-toolbar admin-users-toolbar" id="adminUserFilters">
          <label class="merchant-search">${icon('search')}<input type="search" name="q" placeholder="Search name, email, role or ID" value="${esc(state.adminUserFilters.q)}"></label>
          <label class="merchant-filter"><span>Status</span><select name="status">${['all', 'active', 'inactive'].map((status) => `<option value="${status}" ${state.adminUserFilters.status === status ? 'selected' : ''}>${status === 'all' ? 'All statuses' : status === 'active' ? 'Active' : 'Inactive / invitation pending'}</option>`).join('')}</select></label>
          <button type="submit" class="merchant-btn">${icon('search')} Search</button>
        </form>
        <div class="merchant-table-wrap"><table class="merchant-table admin-user-table"><thead><tr><th>Administrator</th><th>Role</th><th>Permissions</th><th>Two-factor</th><th>Last login</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows || '<tr><td class="merchant-empty-cell" colspan="7">No admin accounts match your filters.</td></tr>'}</tbody></table></div>
        <p class="merchant-record-note">Showing ${users.length} of ${allAdmins.length} demo admin accounts. Administrative changes must be audited and enforced by the backend.</p>
      </section>
      <p class="admin-users-safety-note">Demo controls do not create real credentials or enforce access policies. In production, require server-side role checks, verified MFA enrollment, invitation expiry, session revocation on deactivation, and immutable login/audit records.</p>
      ${modal}`;
    if (!root.dataset.adminEventsBound) {
      root.dataset.adminEventsBound = 'true';
      root.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-admin-action]');
        if (!button) return;
        const action = button.dataset.adminAction;
        const id = button.dataset.adminId;
        if (action === 'backdrop' && event.target !== button) return;
        try {
          if (action === 'create') {
            state.adminUserDialogId = 'new';
            await renderAdminUserManagement();
          } else if (action === 'manage') {
            state.adminUserDialogId = id;
            await renderAdminUserManagement();
          } else if (action === 'close' || action === 'backdrop') {
            state.adminUserDialogId = null;
            await renderAdminUserManagement();
          } else if (action === 'toggle-status') {
            const admin = await DataService.getAdminUser(id);
            const nextStatus = admin.status === 'active' ? 'inactive' : 'active';
            if (admin.id === 'adm_1001' && nextStatus === 'inactive') {
              toast('You cannot deactivate your own account');
              return;
            }
            if (admin.invitationStatus === 'pending') {
              toast('The admin must accept their invitation before activation');
              return;
            }
            if (nextStatus === 'inactive' && !window.confirm(`Deactivate ${admin.name}'s admin account? Their sessions should be revoked.`)) return;
            await DataService.updateAdminUser(id, { status: nextStatus });
            toast(`Admin account ${nextStatus === 'active' ? 'activated' : 'deactivated'}`);
            await renderAdminUserManagement();
          }
        } catch (error) {
          console.error(error);
          toast(error.message || 'Unable to complete admin account action');
        }
      });
      root.addEventListener('change', (event) => {
        if (event.target.id !== 'adminRoleSelect') return;
        const defaults = new Set(defaultAdminPermissions(event.target.value));
        root.querySelectorAll('input[name="permission"]').forEach((input) => { input.checked = defaults.has(input.value); });
      });
      root.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && event.target.closest('.admin-user-dialog')) {
          state.adminUserDialogId = null;
          renderAdminUserManagement().catch((error) => { console.error(error); toast('Unable to close admin settings'); });
        }
      });
      root.addEventListener('submit', async (event) => {
        if (event.target.id === 'adminUserFilters') {
          event.preventDefault();
          const form = new FormData(event.target);
          state.adminUserFilters = { q: String(form.get('q') || '').trim(), status: String(form.get('status') || 'all') };
          renderAdminUserManagement(null).catch((error) => { console.error(error); toast('Unable to filter admin accounts'); });
          return;
        }
        if (event.target.id !== 'adminUserForm') return;
        event.preventDefault();
        const form = event.target;
        const values = new FormData(form);
        const allowedIpRanges = String(values.get('allowedIpRanges') || '').split(/\r?\n/).map((range) => range.trim()).filter(Boolean);
        if (allowedIpRanges.some((range) => !validIPv4Range(range))) {
          toast('Enter valid IPv4 addresses or CIDR ranges, one per line');
          return;
        }
        if (values.has('requireApprovedNetwork') && allowedIpRanges.length === 0) {
          toast('Add at least one approved network before requiring network restrictions');
          return;
        }
        const adminInput = {
          name: String(values.get('name') || '').trim(),
          email: String(values.get('email') || '').trim(),
          role: String(values.get('role') || ''),
          permissions: [...form.querySelectorAll('input[name="permission"]:checked')].map((input) => input.value),
          requireApprovedNetwork: values.has('requireApprovedNetwork'),
          allowedIpRanges,
          twoFactorEnabled: values.has('twoFactorEnabled'),
        };
        if (form.dataset.adminUserForm === 'create') adminInput.twoFactorRequired = values.has('twoFactorRequired');
        try {
          if (form.dataset.adminUserForm === 'create') {
            await DataService.createAdminUser(adminInput);
            toast('Admin account created; invitation is pending backend delivery');
          } else {
            await DataService.updateAdminUser(form.dataset.adminId, adminInput);
            toast('Admin profile and access settings saved');
          }
          state.adminUserDialogId = null;
          await renderAdminUserManagement();
        } catch (error) {
          console.error(error);
          toast(error.message || 'Unable to save admin account');
        }
      });
    }
    if (dialogId) {
      root.querySelector('.admin-user-dialog')?.focus();
    }
  }

  const healthStatusLabel = (status) => ({
    green: 'Healthy', yellow: 'Degraded', red: 'Critical',
  }[status] || status);

  async function renderSystemMonitor() {
    const root = $('#systemMonitor');
    root.hidden = false;
    root.innerHTML = '<div class="card skeleton" style="height:280px"></div>';
    const data = await DataService.getSystemHealth(state.systemMonitorFilters);
    const providersOnline = data.providers.filter((provider) => provider.status === 'green').length;
    const worstStatus = data.status;
    const worstStatusLabel = healthStatusLabel(worstStatus);
    const statusBadge = (status) => `<span class="system-health-badge system-health-badge--${esc(status)}"><i></i>${esc(healthStatusLabel(status))}</span>`;
    const performanceMax = Math.max(...data.performance.map((point) => point.responseMs));
    const logs = data.errorLogs.map((log) => `<tr>
      <td data-label="Time">${esc(timeAgo(log.at))}<small>${esc(fmtDateTime(log.at))}</small></td>
      <td data-label="Level">${statusBadge(log.level === 'critical' || log.level === 'error' ? 'red' : 'yellow')}<small>${esc(log.level.toUpperCase())}</small></td>
      <td data-label="Service">${esc(log.service)}</td>
      <td data-label="Message">${esc(log.message)}<small>Reference: ${esc(log.requestId)}</small></td>
    </tr>`).join('');
    root.innerHTML = `
      <header class="provider-page-head system-monitor-head">
        <div><p class="merchant-eyebrow">PLATFORM OPERATIONS</p><h1>System Monitoring &amp; API Health</h1><p>Monitor API performance, payment providers, delivery pipelines, and platform infrastructure.</p></div>
        <div class="system-monitor-actions"><span class="merchant-demo-note">${icon('alert')} ${data.demo ? 'Demo workspace · sample telemetry' : 'Live monitoring data'}</span><button type="button" class="merchant-btn merchant-btn--primary" data-system-action="refresh">${icon('pulse')} Refresh</button></div>
      </header>
      <section class="system-health-overview system-health-overview--${esc(worstStatus)}">
        <div class="system-health-overview__status"><span class="system-health-pulse"></span><div><small>SYSTEM HEALTH OVERVIEW</small><h2>${esc(worstStatusLabel)}${worstStatus === 'yellow' ? ' · Attention recommended' : worstStatus === 'red' ? ' · Immediate attention required' : ''}</h2><p>Last updated ${esc(fmtDateTime(data.capturedAt))} · Status reflects the most severe monitored component.</p></div></div>
        <div class="system-health-overview__legend"><span class="system-health-legend system-health-legend--green">Green <small>Normal</small></span><span class="system-health-legend system-health-legend--yellow">Yellow <small>Degraded</small></span><span class="system-health-legend system-health-legend--red">Red <small>Critical</small></span></div>
      </section>
      <div class="merchant-summary system-monitor-summary">
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--green">${icon('pulse')}</span><div><small>Core API uptime</small><strong>${nfIN.format(data.api.uptime)}%</strong><span>${nfIN.format(data.api.averageResponseMs)} ms avg response</span></div></article>
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--blue">${icon('server')}</span><div><small>API requests / min</small><strong>${nfIN.format(data.api.requestsPerMinute)}</strong><span>${nfIN.format(data.api.failedRequests24h)} failed in 24h</span></div></article>
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--violet">${icon('card')}</span><div><small>Providers available</small><strong>${providersOnline} / ${data.providers.length}</strong><span>Healthy payment integrations</span></div></article>
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--amber">${icon('alert')}</span><div><small>Webhook delivery</small><strong>${nfIN.format(data.webhook.deliveryRate)}%</strong><span>${nfIN.format(data.webhook.pending)} awaiting delivery</span></div></article>
      </div>
      <div class="system-monitor-grid">
        <section class="card system-monitor-panel">
          <header class="card__head"><div><h2>${icon('pulse')} Performance analytics</h2><p class="card__sub">Core API average response time across the last 24 hours</p></div>${statusBadge(data.api.status)}</header>
          <div class="system-performance-chart" role="img" aria-label="Average API response time by time of day">${data.performance.map((point) => `<div class="system-performance-column" title="${esc(point.label)} · ${nfIN.format(point.responseMs)} ms response · ${nfIN.format(point.errorRate)}% errors"><span>${nfIN.format(point.responseMs)} ms</span><div class="system-performance-bar" style="height:${Math.max(14, Math.round((point.responseMs / performanceMax) * 100))}%"></div><small>${esc(point.label)}</small></div>`).join('')}</div>
          <div class="system-performance-meta"><span>p95 response <strong>${nfIN.format(data.api.p95ResponseMs)} ms</strong></span><span>Database replication lag <strong>${nfIN.format(data.database.replicationLagMs)} ms</strong></span></div>
        </section>
        <section class="card system-monitor-panel">
          <header class="card__head"><div><h2>${icon('server')} Platform components</h2><p class="card__sub">Availability and capacity indicators</p></div></header>
          <div class="system-component-list">${[
            { ...data.api, name: 'Core API', detail: `${nfIN.format(data.api.uptime)}% uptime · ${nfIN.format(data.api.averageResponseMs)} ms avg` },
            { ...data.database, name: 'Primary database', detail: `${nfIN.format(data.database.connections)} / ${nfIN.format(data.database.connectionLimit)} connections · ${nfIN.format(data.database.replicationLagMs)} ms replication lag` },
            { ...data.webhook, name: 'Webhook delivery', detail: `${nfIN.format(data.webhook.pending)} pending · ${nfIN.format(data.webhook.failed24h)} failed in 24h` },
            { ...data.jobs, name: 'Background jobs', detail: `${nfIN.format(data.jobs.queued)} queued · ${nfIN.format(data.jobs.failed24h)} failed in 24h` },
          ].map((component) => `<div class="system-component-row"><span class="system-component-indicator system-component-indicator--${esc(component.status)}"></span><div><strong>${esc(component.name)}</strong><small>${esc(component.detail)}</small></div>${statusBadge(component.status)}</div>`).join('')}</div>
        </section>
      </div>
      <section class="card system-monitor-panel system-provider-panel">
        <header class="card__head"><div><h2>${icon('card')} Payment provider availability</h2><p class="card__sub">Provider health checks, response time, and transaction success rates</p></div></header>
        <div class="table-wrap system-monitor-table-wrap"><table class="data-table"><thead><tr><th>Provider</th><th>Status</th><th>Uptime</th><th>Avg response</th><th>Success rate</th><th>Failure rate</th></tr></thead><tbody>${data.providers.map((provider) => `<tr><td>${esc(provider.name)}</td><td>${statusBadge(provider.status)}</td><td>${nfIN.format(provider.uptime)}%</td><td>${nfIN.format(provider.averageResponseMs)} ms</td><td>${nfIN.format(provider.successRate)}%</td><td>${nfIN.format(provider.failureRate)}%</td></tr>`).join('')}</tbody></table></div>
      </section>
      <div class="system-monitor-grid">
        <section class="card system-monitor-panel">
          <header class="card__head"><div><h2>${icon('server')} Server health</h2><p class="card__sub">Compute resource utilization by node</p></div></header>
          <div class="system-server-list">${data.servers.map((server) => `<article class="system-server-card"><div class="system-server-card__head"><strong>${esc(server.name)}</strong>${statusBadge(server.status)}</div>${[['CPU', server.cpuPercent], ['Memory', server.memoryPercent], ['Disk', server.diskPercent]].map(([label, value]) => `<div class="system-resource"><div><span>${label}</span><strong>${nfIN.format(value)}%</strong></div><div class="system-resource-track"><span class="system-resource-fill ${value >= 80 ? 'is-high' : ''}" style="width:${Math.min(value, 100)}%"></span></div></div>`).join('')}</article>`).join('')}</div>
        </section>
        <section class="card system-monitor-panel">
          <header class="card__head"><div><h2>${icon('gear')} Background jobs</h2><p class="card__sub">${nfIN.format(data.jobs.running)} running · ${nfIN.format(data.jobs.queued)} queued · oldest job ${nfIN.format(data.jobs.oldestQueuedMinutes)} min</p></div></header>
          <div class="table-wrap system-monitor-table-wrap"><table class="data-table"><thead><tr><th>Job</th><th>Queue</th><th>Status</th><th>Last run</th></tr></thead><tbody>${data.backgroundJobs.map((job) => `<tr><td>${esc(job.name)}<small>${esc(job.id)}</small></td><td>${esc(job.queue)}</td><td><span class="system-job-status system-job-status--${esc(job.status)}">${esc(job.status)}</span></td><td>${esc(timeAgo(job.lastRunAt))}</td></tr>`).join('')}</tbody></table></div>
        </section>
      </div>
      <div class="system-monitor-grid">
        <section class="card system-monitor-panel">
          <header class="card__head"><div><h2>${icon('alert')} Failed API requests</h2><p class="card__sub">${nfIN.format(data.failedRequests.length)} recent failed requests · 24-hour total ${nfIN.format(data.api.failedRequests24h)}</p></div></header>
          <div class="table-wrap system-monitor-table-wrap"><table class="data-table"><thead><tr><th>Time</th><th>Method / route</th><th>HTTP</th><th>Duration</th><th>Summary</th></tr></thead><tbody>${data.failedRequests.map((request) => `<tr><td>${esc(timeAgo(request.at))}<small>${esc(request.id)}</small></td><td><span class="system-method">${esc(request.method)}</span> ${esc(request.route)}</td><td><span class="system-http-code">${nfIN.format(request.statusCode)}</span></td><td>${nfIN.format(request.durationMs)} ms</td><td>${esc(request.message)}</td></tr>`).join('')}</tbody></table></div>
        </section>
        <section class="card system-monitor-panel">
          <header class="card__head"><div><h2>${icon('pulse')} Webhook deliveries</h2><p class="card__sub">${nfIN.format(data.webhook.failed24h)} failed in 24 hours · ${nfIN.format(data.webhook.averageDeliveryMs)} ms average delivery</p></div></header>
          <div class="table-wrap system-monitor-table-wrap"><table class="data-table"><thead><tr><th>Event</th><th>Destination</th><th>Status</th><th>Attempts</th></tr></thead><tbody>${data.webhooks.map((webhook) => `<tr><td>${esc(webhook.event)}<small>${esc(webhook.id)} · ${esc(timeAgo(webhook.updatedAt))}</small></td><td>${esc(webhook.destination)}</td><td><span class="system-job-status system-job-status--${webhook.status === 'delivered' ? 'completed' : esc(webhook.status)}">${esc(webhook.status)}</span></td><td>${nfIN.format(webhook.attempts)}</td></tr>`).join('')}</tbody></table></div>
        </section>
      </div>
      <section class="card system-monitor-panel system-error-panel">
        <header class="card__head"><div><h2>${icon('alert')} Redacted error logs</h2><p class="card__sub">Secrets, credentials, request bodies, and payment data are excluded from these log entries.</p></div></header>
        <form class="system-log-filters" id="systemLogFilters">
          <label>Severity<select name="level"><option value="all" ${state.systemMonitorFilters.level === 'all' ? 'selected' : ''}>All levels</option>${['critical', 'error', 'warning'].map((level) => `<option value="${level}" ${state.systemMonitorFilters.level === level ? 'selected' : ''}>${level[0].toUpperCase() + level.slice(1)}</option>`).join('')}</select></label>
          <label>Search logs<input type="search" name="q" value="${esc(state.systemMonitorFilters.q)}" placeholder="Service, message, or request ID" /></label>
          <button type="submit" class="merchant-btn">${icon('search')} Apply filters</button>
        </form>
        <div class="table-wrap system-monitor-table-wrap"><table class="data-table"><thead><tr><th>Time</th><th>Level</th><th>Service</th><th>Sanitized message</th></tr></thead><tbody>${logs || '<tr><td colspan="4" class="system-empty-state">No logs match these filters.</td></tr>'}</tbody></table></div>
      </section>
      <p class="system-monitor-footnote">Monitoring data is ${data.demo ? 'illustrative demo telemetry' : 'provided by the monitoring backend'} and was captured at ${esc(fmtDateTime(data.capturedAt))}. Status thresholds are defined by the platform health-check service.</p>`;
    const healthCard = $('#systemHealth');
    const healthTitle = worstStatus === 'green' ? 'System Healthy' : worstStatus === 'yellow' ? 'System Degraded' : 'System Critical';
    $('[data-health-title]', healthCard).textContent = healthTitle;
    $('[data-health-description]', healthCard).textContent = `${providersOnline} of ${data.providers.length} providers healthy · ${nfIN.format(data.api.averageResponseMs)} ms API response`;
    healthCard.dataset.status = worstStatus;

    root.onclick = (event) => {
      if (!event.target.closest('[data-system-action="refresh"]')) return;
      renderSystemMonitor().catch((error) => {
        console.error(error);
        toast('Failed to refresh system health data');
      });
    };
    root.onsubmit = (event) => {
      if (event.target.id !== 'systemLogFilters') return;
      event.preventDefault();
      const form = new FormData(event.target);
      state.systemMonitorFilters = { level: String(form.get('level') || 'all'), q: String(form.get('q') || '').trim() };
      renderSystemMonitor().catch((error) => {
        console.error(error);
        toast('Failed to filter system logs');
      });
    };
  }

  async function renderReconciliationManagement() {
    const root = $('#reconciliationManagement');
    root.hidden = false;
    root.innerHTML = '<div class="card skeleton" style="height:280px"></div>';
    const [data, providers] = await Promise.all([
      DataService.getReconciliationData(state.reconciliationFilters),
      DataService.getProviderRecords(),
    ]);
    const { batches, selectedBatch, rows, summary } = data;
    const filteredSummary = rows.reduce((result, row) => {
      result.records += 1;
      if (row.exceptionType === 'matched') result.matched += 1;
      else {
        result.exceptions += 1;
        if (row.reviewStatus !== 'reviewed') result.pendingReview += 1;
      }
      return result;
    }, { records: 0, matched: 0, exceptions: 0, pendingReview: 0 });
    const tableRows = rows.map((row) => `<tr class="${row.exceptionType === 'matched' ? '' : `reconciliation-row--${esc(row.exceptionType)}`}">
      <td data-label="Source">${row.source === 'provider' ? 'Provider statement' : 'Internal ledger'}<small>${esc(row.id)}</small></td>
      <td data-label="Provider reference">${esc(row.providerReference || '—')}</td>
      <td data-label="Transaction">${esc(row.transactionId || '—')}</td>
      <td data-label="Provider amount">${row.source === 'provider' ? merchantMoney.format(row.amount) : '—'}</td>
      <td data-label="Internal amount">${row.internalTransaction ? merchantMoney.format(row.internalTransaction.amount) : '—'}</td>
      <td data-label="Provider status">${esc(row.providerStatus || '—')}</td>
      <td data-label="Match result"><span class="reconciliation-result reconciliation-result--${esc(row.exceptionType)}">${esc(reconciliationExceptionLabel(row.exceptionType))}</span></td>
      <td data-label="Review">${row.exceptionType === 'matched'
        ? '<span class="reconciliation-review-badge reconciliation-review-badge--reviewed">Matched</span>'
        : row.reviewStatus === 'reviewed'
          ? `<span class="reconciliation-review-badge reconciliation-review-badge--reviewed">Reviewed</span>${row.review ? `<small class="reconciliation-review-note">${esc(row.review.actor)} · ${esc(fmtDateTime(row.review.at))}${row.review.note ? `<br>${esc(row.review.note)}` : ''}</small>` : ''}`
          : `<button type="button" class="merchant-btn merchant-btn--subtle" data-reconciliation-action="review" data-batch-id="${esc(selectedBatch.id)}" data-record-id="${esc(row.id)}">Mark reviewed</button>`}</td>
    </tr>`).join('');
    root.innerHTML = `
      <header class="provider-page-head reconciliation-page-head">
        <div><p class="merchant-eyebrow">FINANCIAL OPERATIONS · HIGH PRIORITY</p><h1>Reconciliation Management</h1><p>Import provider statements, match records against the internal transaction ledger, and resolve exceptions.</p></div>
        <div class="reconciliation-page-actions"><span class="merchant-demo-note">${icon('alert')} Demo workspace · sample ledger</span><button type="button" class="merchant-btn merchant-btn--primary" data-reconciliation-action="report" ${selectedBatch ? '' : 'disabled'}>${icon('file')} Generate report</button></div>
      </header>
      <div class="merchant-summary reconciliation-summary">
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--blue">${icon('file')}</span><div><small>Statement batches</small><strong>${nfIN.format(summary.batches)}</strong></div></article>
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--violet">${icon('bars')}</span><div><small>Provider records</small><strong>${nfIN.format(summary.providerRecords)}</strong></div></article>
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--green">${icon('check')}</span><div><small>Matched records</small><strong>${nfIN.format(summary.matched)}</strong></div></article>
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--red">${icon('alert')}</span><div><small>Exceptions to review</small><strong>${nfIN.format(summary.pendingReview)}</strong></div></article>
      </div>
      <section class="card reconciliation-import-panel">
        <header class="card__head"><div><h2><svg class="h-ico h-ico--blue"><use href="#i-file"/></svg>Import provider statement</h2><p class="card__sub">Upload a CSV with provider_reference or transaction_id, amount, and optional currency, status, settled_at columns.</p></div><button type="button" class="merchant-btn" data-reconciliation-action="template">${icon('file')} Download CSV template</button></header>
        <form id="reconciliationImportForm" class="reconciliation-import-form">
          <label>Payment provider<select name="providerId" required><option value="">Select provider</option>${providers.map((provider) => `<option value="${esc(provider.id)}">${esc(provider.name)}</option>`).join('')}</select></label>
          <label class="reconciliation-file-field">Provider CSV statement<input name="statement" type="file" accept=".csv,text/csv" required /><small>CSV only · maximum 5 MB and 5,000 transaction rows</small></label>
          <button type="submit" class="merchant-btn merchant-btn--primary">${icon('plus')} Import &amp; reconcile</button>
        </form>
        <p class="reconciliation-safety-note">Imported statements in this demo stay in memory and are cleared on reload. Real provider files must be uploaded over an authenticated, encrypted backend workflow and stored with access controls.</p>
      </section>
      <section class="card reconciliation-results-panel">
        <header class="card__head"><div><h2><svg class="h-ico h-ico--violet"><use href="#i-bars"/></svg>Statement comparison</h2><p class="card__sub">${selectedBatch ? `Comparing ${esc(selectedBatch.filename)} from ${esc(selectedBatch.providerName)}.` : 'Import a provider statement to start reconciliation.'}</p></div>
          ${selectedBatch ? `<span class="reconciliation-batch-status reconciliation-batch-status--${esc(selectedBatch.status)}">${esc(reconciliationStatusLabel(selectedBatch.status))}</span>` : ''}
        </header>
        ${selectedBatch ? `<div class="reconciliation-batch-meta"><span><strong>Batch:</strong> ${esc(selectedBatch.id)}</span><span><strong>Imported:</strong> ${esc(fmtDateTime(selectedBatch.importedAt))}</span><span><strong>Statement rows:</strong> ${nfIN.format(selectedBatch.recordCount)}</span><span><strong>Matched:</strong> ${nfIN.format(selectedBatch.matchedCount)}</span><span><strong>Exceptions:</strong> ${nfIN.format(selectedBatch.exceptionCount)}</span></div>` : ''}
        <form id="reconciliationFilters" class="reconciliation-filters">
          <label>Statement batch<select name="batchId">${batches.map((batch) => `<option value="${esc(batch.id)}" ${selectedBatch?.id === batch.id ? 'selected' : ''}>${esc(batch.id)} · ${esc(batch.providerName)} · ${esc(reconciliationStatusLabel(batch.status))}</option>`).join('')}</select></label>
          <label>Match result<select name="exceptionType"><option value="all">All results</option>${['matched', 'missing_internal', 'missing_provider', 'amount_mismatch', 'duplicate'].map((type) => `<option value="${type}" ${state.reconciliationFilters.exceptionType === type ? 'selected' : ''}>${reconciliationExceptionLabel(type)}</option>`).join('')}</select></label>
          <label>Review status<select name="reviewStatus"><option value="all">All review states</option><option value="open" ${state.reconciliationFilters.reviewStatus === 'open' ? 'selected' : ''}>Needs review</option><option value="reviewed" ${state.reconciliationFilters.reviewStatus === 'reviewed' ? 'selected' : ''}>Reviewed</option></select></label>
          <label>Search<input type="search" name="q" value="${esc(state.reconciliationFilters.q)}" placeholder="Reference or transaction ID" /></label>
          <div class="reconciliation-filter-actions"><button type="submit" class="merchant-btn merchant-btn--primary">Apply filters</button><button type="button" class="merchant-btn" data-reconciliation-action="clear">Clear</button></div>
        </form>
        <div class="reconciliation-filter-summary">Showing ${nfIN.format(filteredSummary.records)} rows · ${nfIN.format(filteredSummary.matched)} matched · ${nfIN.format(filteredSummary.exceptions)} exceptions · ${nfIN.format(filteredSummary.pendingReview)} awaiting review</div>
        <div class="merchant-table-wrap reconciliation-table-wrap"><table class="merchant-table reconciliation-table"><thead><tr><th>Source</th><th>Provider reference</th><th>Transaction</th><th>Provider amount</th><th>Internal amount</th><th>Provider status</th><th>Match result</th><th>Review status</th></tr></thead><tbody>${tableRows || '<tr><td class="merchant-empty-cell" colspan="8">No reconciliation rows match these filters.</td></tr>'}</tbody></table></div>
        <p class="reconciliation-safety-note">Automatic matching uses provider reference or transaction ID. Amount differences, duplicate provider references, provider-only rows, and successful internal payments absent from the statement require human review. Matching is not proof of settlement.</p>
      </section>`;
    bindReconciliationEvents(root);
  }

  function bindReconciliationEvents(root) {
    if (root.dataset.eventsBound) return;
    root.dataset.eventsBound = 'true';
    root.addEventListener('change', (event) => {
      if (event.target.name !== 'batchId') return;
      state.reconciliationFilters.batchId = event.target.value;
      renderReconciliationManagement().catch((error) => { console.error(error); toast('Unable to load reconciliation batch'); });
    });
    root.addEventListener('submit', async (event) => {
      if (event.target.id === 'reconciliationFilters') {
        event.preventDefault();
        const form = event.target;
        state.reconciliationFilters = {
          ...state.reconciliationFilters, batchId: form.elements.batchId.value,
          exceptionType: form.elements.exceptionType.value,
          reviewStatus: form.elements.reviewStatus.value, q: form.elements.q.value.trim(),
        };
        renderReconciliationManagement().catch((error) => { console.error(error); toast('Unable to filter reconciliation records'); });
        return;
      }
      if (event.target.id !== 'reconciliationImportForm') return;
      event.preventDefault();
      const form = event.target;
      const file = form.elements.statement.files[0];
      if (!file) { toast('Select a provider CSV statement'); return; }
      if (!/\.csv$/i.test(file.name) || (file.type && !['text/csv', 'application/vnd.ms-excel', 'application/csv'].includes(file.type))) {
        toast('Upload a CSV statement file');
        return;
      }
      if (file.size > 5 * 1024 * 1024) { toast('Statement file must be 5 MB or smaller'); return; }
      try {
        const records = parseReconciliationCsv(await file.text());
        const batch = await DataService.importReconciliationStatement(form.elements.providerId.value, file, records);
        state.reconciliationFilters = { batchId: batch.id, exceptionType: 'all', reviewStatus: 'all', q: '' };
        await renderReconciliationManagement();
        toast(`Imported ${nfIN.format(batch.recordCount)} rows; ${nfIN.format(batch.exceptionCount)} exceptions found`);
      } catch (error) {
        console.error(error);
        toast(error.message || 'Unable to import provider statement');
      }
    });
    root.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-reconciliation-action]');
      if (!button) return;
      const action = button.dataset.reconciliationAction;
      if (action === 'clear') {
        state.reconciliationFilters = { batchId: state.reconciliationFilters.batchId, exceptionType: 'all', reviewStatus: 'all', q: '' };
        renderReconciliationManagement().catch((error) => { console.error(error); toast('Unable to clear reconciliation filters'); });
        return;
      }
      if (action === 'template') {
        const template = [
          ['provider_reference', 'transaction_id', 'amount', 'currency', 'status', 'settled_at'],
          ['PROVIDER-REFERENCE-001', 'TXN-EXAMPLE-001', '100.00', 'BDT', 'settled', '2026-11-24T12:00:00Z'],
        ].map((row) => row.map(csvCell).join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob(['\uFEFF', template], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url; link.download = 'provider-reconciliation-template.csv';
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
      }
      if (action === 'report') {
        try {
          const data = await DataService.getReconciliationData(state.reconciliationFilters);
          const batch = data.selectedBatch;
          if (!batch) throw new Error('Select an imported statement before generating a report');
          const headers = ['Batch ID', 'Provider', 'Imported at', 'Source', 'Provider reference', 'Transaction ID', 'Provider amount (BDT)', 'Internal amount (BDT)', 'Provider status', 'Match result', 'Review status'];
          const lines = [headers, ...data.rows.map((row) => [
            batch.id, batch.providerName, batch.importedAt, row.source, row.providerReference, row.transactionId,
            row.source === 'provider' ? row.amount : '', row.internalTransaction?.amount ?? '',
            row.providerStatus, reconciliationExceptionLabel(row.exceptionType), row.reviewStatus,
          ])].map((row) => row.map(csvCell).join(','));
          const url = URL.createObjectURL(new Blob(['\uFEFF', lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
          const link = document.createElement('a');
          link.href = url; link.download = `${batch.id.toLowerCase()}-reconciliation-report.csv`;
          document.body.appendChild(link); link.click(); link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          toast(`Generated reconciliation report for ${nfIN.format(data.rows.length)} rows`);
        } catch (error) {
          console.error(error);
          toast(error.message || 'Unable to generate reconciliation report');
        }
        return;
      }
      if (action === 'review') {
        try {
          await DataService.reviewReconciliationRecord(button.dataset.batchId, button.dataset.recordId);
          await renderReconciliationManagement();
          toast('Reconciliation exception marked reviewed');
        } catch (error) {
          console.error(error);
          toast(error.message || 'Unable to update reconciliation review');
        }
      }
    });
  }

  function bindFinancialEvents(root) {
    if (root.dataset.eventsBound) return;
    root.dataset.eventsBound = 'true';
    root.addEventListener('change', (event) => {
      if (event.target.name !== 'range') return;
      state.financialFilters.range = event.target.value;
      renderFinancialManagement().catch((error) => {
        console.error(error);
        toast('Unable to load financial overview');
      });
    });
    root.addEventListener('submit', (event) => {
      if (event.target.id !== 'financialFilters') return;
      event.preventDefault();
      const form = event.target;
      state.financialFilters = {
        ...state.financialFilters,
        status: form.elements.status.value,
        providerId: form.elements.providerId.value,
        merchantId: form.elements.merchantId.value,
        discrepanciesOnly: form.elements.discrepanciesOnly.checked,
      };
      renderFinancialManagement().catch((error) => {
        console.error(error);
        toast('Unable to filter settlement records');
      });
    });
    root.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-finance-action]');
      if (!button) return;
      if (button.dataset.financeAction === 'clear') {
        state.financialFilters = { range: state.financialFilters.range, status: 'all', providerId: '', merchantId: '', discrepanciesOnly: false };
        renderFinancialManagement().catch((error) => {
          console.error(error);
          toast('Unable to reset settlement filters');
        });
        return;
      }
      if (button.dataset.financeAction === 'export') {
        try {
          const { settlements } = await DataService.getFinancialData(state.financialFilters);
          const headers = ['Settlement ID', 'Date', 'Merchant', 'Provider', 'Processed volume (BDT)', 'Platform fee (BDT)', 'Provider fee (BDT)', 'Refund amount (BDT)', 'Merchant payable (BDT)', 'Expected settlement (BDT)', 'Settled amount (BDT)', 'Status', 'Discrepancy'];
          const rows = settlements.map((item) => [
            item.id, item.period, item.merchantName, item.providerName, item.processedVolume,
            item.platformFee, item.providerFee, item.refundAmount, item.payableAmount,
            item.expectedAmount, item.settledAmount, financialStatusLabel(item.status), item.discrepancyReason,
          ]);
          const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
          const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `financial-settlements-${state.financialFilters.range}-${new Date().toISOString().slice(0, 10)}.csv`;
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          toast(`Generated report for ${nfIN.format(settlements.length)} settlement records`);
        } catch (error) {
          console.error(error);
          toast('Unable to generate financial report');
        }
      }
    });
  }

  async function renderMerchantManagement(openMerchantId = null) {
    const root = $('#merchantManagement');
    const restoreSearchFocus = document.activeElement?.id === 'merchantSearch';
    root.hidden = false;
    root.innerHTML = '<div class="card skeleton" style="height:280px"></div>';
    const [merchants, visible] = await Promise.all([
      DataService.getMerchants(),
      DataService.getMerchants({ status: state.merchantStatus, q: state.merchantQuery }),
    ]);
    const counts = merchants.reduce((result, merchant) => {
      result[merchant.status] = (result[merchant.status] || 0) + 1;
      return result;
    }, {});
    const applications = merchants.filter((merchant) => merchant.applicationStatus === 'pending');
    const merchantRows = visible.map((merchant) => `
      <tr>
        <td data-label="Merchant"><div class="merchant-identity"><span class="merchant-avatar">${esc(merchant.name.slice(0, 1))}</span><span><strong>${esc(merchant.name)}</strong><small>${esc(merchant.id)}</small></span></div></td>
        <td data-label="Owner">${esc(merchant.owner)}</td>
        <td data-label="Business">${esc(merchant.category)}</td>
        <td data-label="Joined">${esc(merchant.joinedAt)}</td>
        <td data-label="Status"><span class="merchant-status merchant-status--${esc(merchant.status)}">${esc(merchantStatusLabel(merchant.status))}</span></td>
        <td data-label="Actions"><div class="merchant-row-actions">
          <button type="button" class="merchant-btn merchant-btn--subtle" data-merchant-action="profile" data-merchant-id="${esc(merchant.id)}">View profile</button>
          ${merchant.status === 'active' ? `<button type="button" class="merchant-icon-action" aria-label="Suspend ${esc(merchant.name)}" title="Suspend account" data-merchant-action="toggle-status" data-merchant-id="${esc(merchant.id)}">${icon('pause')}</button>` : merchant.status === 'suspended' ? `<button type="button" class="merchant-icon-action merchant-icon-action--activate" aria-label="Activate ${esc(merchant.name)}" title="Activate account" data-merchant-action="toggle-status" data-merchant-id="${esc(merchant.id)}">${icon('check')}</button>` : ''}
        </div></td>
      </tr>`).join('');
    const applicationRows = applications.map((merchant) => `
      <tr>
        <td data-label="Merchant"><div class="merchant-identity"><span class="merchant-avatar merchant-avatar--pending">${esc(merchant.name.slice(0, 1))}</span><span><strong>${esc(merchant.name)}</strong><small>${esc(merchant.id)}</small></span></div></td>
        <td data-label="Owner">${esc(merchant.owner)}</td>
        <td data-label="Business">${esc(merchant.category)}<small class="merchant-secondary">${esc(merchant.businessId)}</small></td>
        <td data-label="Applied">${esc(merchant.joinedAt)}</td>
        <td data-label="Verification"><span class="merchant-status merchant-status--pending">${esc(verificationLabel(merchant.verificationStatus))}</span></td>
        <td data-label="Review"><div class="merchant-row-actions">
          <button type="button" class="merchant-btn merchant-btn--subtle" data-merchant-action="profile" data-merchant-id="${esc(merchant.id)}">Review</button>
          <button type="button" class="merchant-btn merchant-btn--approve" data-merchant-action="approve" data-merchant-id="${esc(merchant.id)}" ${merchant.verificationStatus !== 'verified' ? 'disabled title="Verify business information before approval"' : ''}>Approve</button>
          <button type="button" class="merchant-btn merchant-btn--reject" data-merchant-action="reject" data-merchant-id="${esc(merchant.id)}">Reject</button>
        </div></td>
      </tr>`).join('');

    root.innerHTML = `
      <header class="merchant-page-head">
        <div><p class="merchant-eyebrow">MERCHANT OPERATIONS</p><h1>Merchant Management</h1><p>Review applications, monitor account health, and manage merchant access.</p></div>
        <span class="merchant-demo-note">${icon('alert')} Demo workspace · changes reset on reload</span>
      </header>
      <div class="merchant-summary">
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--blue">${icon('users')}</span><div><small>Merchant records</small><strong>${nfIN.format(merchants.length)}</strong></div></article>
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--green">${icon('check')}</span><div><small>Active</small><strong>${nfIN.format(counts.active || 0)}</strong></div></article>
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--amber">${icon('clock')}</span><div><small>Applications to review</small><strong>${nfIN.format(applications.length)}</strong></div></article>
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--red">${icon('pause')}</span><div><small>Suspended</small><strong>${nfIN.format(counts.suspended || 0)}</strong></div></article>
      </div>
      <section class="card merchant-panel">
        <header class="card__head"><div><h2><svg class="h-ico h-ico--amber"><use href="#i-clock"/></svg>New Merchant Applications</h2><p class="card__sub">Verify submitted business information before deciding on an application.</p></div><span class="merchant-count">${applications.length} awaiting review</span></header>
        ${applications.length ? `<div class="merchant-table-wrap"><table class="merchant-table"><thead><tr><th>Merchant</th><th>Owner</th><th>Business details</th><th>Applied</th><th>Verification</th><th>Review actions</th></tr></thead><tbody>${applicationRows}</tbody></table></div>` : '<div class="merchant-empty">No merchant applications are awaiting review.</div>'}
      </section>
      <section class="card merchant-panel">
        <header class="card__head"><div><h2><svg class="h-ico h-ico--blue"><use href="#i-store"/></svg>Registered Merchants</h2><p class="card__sub">Search accounts and open a profile to manage activity and access.</p></div></header>
        <div class="merchant-toolbar">
          <label class="merchant-search">${icon('search')}<input type="search" id="merchantSearch" placeholder="Search name, owner, email or ID" value="${esc(state.merchantQuery)}" /></label>
          <label class="merchant-filter"><span>Status</span><select id="merchantStatusFilter">
            ${['all', 'active', 'suspended', 'pending', 'rejected'].map((status) => `<option value="${status}" ${state.merchantStatus === status ? 'selected' : ''}>${status === 'all' ? 'All statuses' : esc(merchantStatusLabel(status))}</option>`).join('')}
          </select></label>
        </div>
        <div class="merchant-table-wrap"><table class="merchant-table"><thead><tr><th>Merchant</th><th>Owner</th><th>Business</th><th>Joined</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>${merchantRows || '<tr><td class="merchant-empty-cell" colspan="6">No merchants match your search.</td></tr>'}</tbody></table></div>
        <p class="merchant-record-note">Showing ${visible.length} of ${merchants.length} demo merchant records.</p>
      </section>
      ${openMerchantId ? await renderMerchantProfile(openMerchantId) : ''}`;
    bindMerchantEvents(root);
    if (restoreSearchFocus) {
      const restoredSearch = $('#merchantSearch', root);
      restoredSearch.focus();
      restoredSearch.setSelectionRange(restoredSearch.value.length, restoredSearch.value.length);
    }
    if (openMerchantId) $('#merchantProfileDialog', root)?.focus();
  }

  async function renderMerchantProfile(id) {
    const merchant = await DataService.getMerchant(id);
    const permissionOptions = [
      ['view_transactions', 'View transactions', 'See payment records and transaction details.'],
      ['accept_payments', 'Accept payments', 'Allow payment processing for this merchant.'],
      ['issue_refunds', 'Issue refunds', 'Allow refund requests through the merchant account.'],
      ['manage_webhooks', 'Manage integrations', 'Manage webhook and API integration settings.'],
    ];
    const transactions = merchant.transactions.length ? merchant.transactions.map((transaction) => `
      <tr><td data-label="Reference">${esc(transaction.id)}</td><td data-label="Date">${esc(fmtDateTime(transaction.date))}</td><td data-label="Method">${esc(transaction.method)}</td><td data-label="Amount">${merchantMoney.format(transaction.amount)}</td><td data-label="Status"><span class="merchant-status merchant-status--${transaction.status === 'successful' ? 'active' : 'rejected'}">${esc(transaction.status)}</span></td></tr>`).join('') : '<tr><td colspan="5" class="merchant-empty-cell">No transactions recorded for this account yet.</td></tr>';
    return `
      <div class="merchant-dialog-backdrop" data-merchant-action="close-profile">
        <section class="merchant-profile-dialog" id="merchantProfileDialog" role="dialog" aria-modal="true" aria-labelledby="merchantProfileTitle" tabindex="-1">
          <header class="merchant-profile-head">
            <div class="merchant-profile-identity"><span class="merchant-avatar merchant-avatar--large">${esc(merchant.name.slice(0, 1))}</span><div><p class="merchant-eyebrow">MERCHANT PROFILE · ${esc(merchant.id)}</p><h2 id="merchantProfileTitle">${esc(merchant.name)}</h2><span class="merchant-profile-meta">${esc(merchant.category)} · Joined ${esc(merchant.joinedAt)}</span></div></div>
            <button type="button" class="merchant-icon-action" data-merchant-action="close-profile" aria-label="Close merchant profile">${icon('x')}</button>
          </header>
          <div class="merchant-profile-content">
            ${merchant.applicationStatus === 'pending' ? `<div class="merchant-review-banner">${icon('alert')} Application is awaiting review. Confirm the business details and verification status before making a decision.</div>` : ''}
            <div class="merchant-profile-grid">
              <article class="merchant-detail-card"><h3>Business information</h3><dl class="merchant-details">
                <div><dt>Business owner</dt><dd>${esc(merchant.owner)}</dd></div><div><dt>Contact email</dt><dd>${esc(merchant.email)}</dd></div>
                <div><dt>Phone</dt><dd>${esc(merchant.phone)}</dd></div><div><dt>Registration ID</dt><dd>${esc(merchant.businessId)}</dd></div>
                <div><dt>Business verification</dt><dd><span class="merchant-status merchant-status--${merchant.verificationStatus === 'verified' ? 'active' : 'pending'}">${esc(verificationLabel(merchant.verificationStatus))}</span></dd></div>
                <div><dt>Account status</dt><dd><span class="merchant-status merchant-status--${esc(merchant.status)}">${esc(merchantStatusLabel(merchant.status))}</span></dd></div>
              </dl><div class="merchant-profile-actions">
                ${merchant.verificationStatus !== 'verified' ? `<button type="button" class="merchant-btn merchant-btn--approve" data-merchant-action="verify" data-merchant-id="${esc(merchant.id)}">Mark business verified</button>` : ''}
                ${merchant.applicationStatus === 'pending' ? `<button type="button" class="merchant-btn merchant-btn--approve" data-merchant-action="approve" data-merchant-id="${esc(merchant.id)}" ${merchant.verificationStatus !== 'verified' ? 'disabled title="Verify business information before approval"' : ''}>Approve application</button><button type="button" class="merchant-btn merchant-btn--reject" data-merchant-action="reject" data-merchant-id="${esc(merchant.id)}">Reject application</button>` : ''}
                ${merchant.status === 'active' ? `<button type="button" class="merchant-btn merchant-btn--reject" data-merchant-action="toggle-status" data-merchant-id="${esc(merchant.id)}">Suspend account</button>` : merchant.status === 'suspended' ? `<button type="button" class="merchant-btn merchant-btn--approve" data-merchant-action="toggle-status" data-merchant-id="${esc(merchant.id)}">Activate account</button>` : ''}
              </div></article>
              <article class="merchant-detail-card"><h3>Payment performance</h3><div class="merchant-performance">
                <div><small>Transactions</small><strong>${nfIN.format(merchant.performance.transactions)}</strong></div>
                <div><small>Transaction volume</small><strong>${merchantMoney.format(merchant.performance.volume)}</strong></div>
                <div><small>Success rate</small><strong>${merchant.performance.successRate}%</strong></div>
              </div><div class="merchant-integration"><span><small>Integration status</small><strong>${esc(integrationLabel(merchant.integrationStatus))}</strong></span><i class="merchant-integration-dot merchant-integration-dot--${esc(merchant.integrationStatus)}"></i></div></article>
            </div>
            <article class="merchant-detail-card merchant-config-card"><h3>Transaction limits</h3><p class="merchant-help">Set per-transaction and daily processing limits in BDT.</p>
              <form class="merchant-config-form" data-merchant-form="limits" data-merchant-id="${esc(merchant.id)}">
                <label>Per-transaction limit (BDT)<input type="number" name="transactionLimit" min="1" step="1" required value="${merchant.transactionLimit}" /></label>
                <label>Daily limit (BDT)<input type="number" name="dailyLimit" min="1" step="1" required value="${merchant.dailyLimit}" /></label>
                <button type="submit" class="merchant-btn merchant-btn--primary">Save limits</button>
              </form>
            </article>
            <article class="merchant-detail-card merchant-config-card"><h3>Merchant permissions</h3><p class="merchant-help">Choose which payment capabilities are available to this account.</p>
              <form class="merchant-permission-form" data-merchant-form="permissions" data-merchant-id="${esc(merchant.id)}">
                <div class="merchant-permission-grid">${permissionOptions.map(([key, title, description]) => `
                  <label class="merchant-permission"><input type="checkbox" name="permission" value="${key}" ${merchant.permissions.includes(key) ? 'checked' : ''} /><span><strong>${title}</strong><small>${description}</small></span></label>`).join('')}</div>
                <button type="submit" class="merchant-btn merchant-btn--primary">Save permissions</button>
              </form>
            </article>
            <article class="merchant-detail-card"><h3>Recent transaction history</h3><div class="merchant-table-wrap"><table class="merchant-table merchant-transactions"><thead><tr><th>Reference</th><th>Date</th><th>Method</th><th>Amount</th><th>Status</th></tr></thead><tbody>${transactions}</tbody></table></div></article>
          </div>
        </section>
      </div>`;
  }

  function bindMerchantEvents(root) {
    if (root.dataset.eventsBound) return;
    root.dataset.eventsBound = 'true';
    root.addEventListener('input', (event) => {
      if (event.target.id !== 'merchantSearch') return;
      state.merchantQuery = event.target.value;
      clearTimeout(state.merchantSearchTimer);
      state.merchantSearchTimer = setTimeout(() => renderMerchantManagement().catch((err) => {
        console.error(err); toast('Failed to search merchant records');
      }), 180);
    });
    root.addEventListener('change', (event) => {
      if (event.target.id !== 'merchantStatusFilter') return;
      state.merchantStatus = event.target.value;
      renderMerchantManagement().catch((err) => {
        console.error(err); toast('Failed to filter merchant records');
      });
    });
    root.addEventListener('click', async (event) => {
      const target = event.target.closest('[data-merchant-action]');
      if (!target) return;
      const action = target.dataset.merchantAction;
      const id = target.dataset.merchantId;
      if (action === 'close-profile' && event.target !== target && !target.classList.contains('merchant-icon-action')) return;
      if (action === 'close-profile') {
        renderMerchantManagement().catch((err) => { console.error(err); toast('Unable to close merchant profile'); });
        return;
      }
      if (action === 'profile') {
        renderMerchantManagement(id).catch((err) => { console.error(err); toast('Unable to load merchant profile'); });
        return;
      }
      try {
        const merchant = id ? await DataService.getMerchant(id) : null;
        if (action === 'reject' && !window.confirm(`Reject the application for ${merchant.name}?`)) return;
        if (action === 'approve' && merchant.verificationStatus !== 'verified') {
          toast('Verify business information before approving this application');
          return;
        }
        if (action === 'approve') await DataService.updateMerchant(id, { applicationStatus: 'approved', status: 'active' });
        if (action === 'reject') await DataService.updateMerchant(id, { applicationStatus: 'rejected', status: 'rejected' });
        if (action === 'verify') await DataService.updateMerchant(id, { verificationStatus: 'verified' });
        if (action === 'toggle-status') await DataService.updateMerchant(id, { status: merchant.status === 'active' ? 'suspended' : 'active' });
        if (['approve', 'reject', 'verify', 'toggle-status'].includes(action)) {
          const messages = { approve: 'Merchant application approved', reject: 'Merchant application rejected', verify: 'Business information verified', 'toggle-status': merchant.status === 'active' ? 'Merchant account suspended' : 'Merchant account activated' };
          toast(messages[action]);
          await renderMerchantManagement(root.querySelector('#merchantProfileDialog') ? id : null);
        }
      } catch (err) {
        console.error(err);
        toast('Unable to complete merchant action');
      }
    });
    root.addEventListener('submit', async (event) => {
      const form = event.target.closest('[data-merchant-form]');
      if (!form) return;
      event.preventDefault();
      try {
        const id = form.dataset.merchantId;
        if (form.dataset.merchantForm === 'limits') {
          const transactionLimit = Number(form.elements.transactionLimit.value);
          const dailyLimit = Number(form.elements.dailyLimit.value);
          if (!Number.isFinite(transactionLimit) || !Number.isFinite(dailyLimit) || transactionLimit <= 0 || dailyLimit <= 0 || dailyLimit < transactionLimit) {
            toast('Daily limit must be at least the per-transaction limit');
            return;
          }
          await DataService.updateMerchant(id, { transactionLimit, dailyLimit });
          toast('Transaction limits saved');
        } else {
          const permissions = [...form.querySelectorAll('input[name="permission"]:checked')].map((input) => input.value);
          await DataService.updateMerchant(id, { permissions });
          toast('Merchant permissions saved');
        }
        await renderMerchantManagement(id);
      } catch (err) {
        console.error(err);
        toast('Unable to save merchant settings');
      }
    });
  }

  const providerTypeLabel = (type) => ({ mfs: 'Mobile financial service', card: 'Card network', wallet: 'Digital wallet', bank: 'Bank transfer' }[type] || type);
  const providerStatusLabel = (status) => ({ online: 'Available', degraded: 'Degraded', offline: 'Unavailable', unknown: 'Not monitored' }[status] || status);
  const providerStatusClass = (status) => ({ online: 'online', degraded: 'degraded', offline: 'offline', unknown: 'unknown' }[status] || 'unknown');
  function providerSelectOptions(providers, selected, omit = '', includeNone = true) {
    return `${includeNone ? '<option value="">No fallback</option>' : ''}${providers.filter((provider) => provider.id !== omit).map((provider) => `<option value="${esc(provider.id)}" ${provider.id === selected ? 'selected' : ''}>${esc(provider.name)}</option>`).join('')}`;
  }

  async function renderProviderManagement() {
    const root = $('#providerManagement');
    root.hidden = false;
    root.innerHTML = '<div class="card skeleton" style="height:280px"></div>';
    const providers = await DataService.getProviderRecords();
    const enabled = providers.filter((provider) => provider.isEnabled);
    const measured = enabled.filter((provider) => provider.transactionCount > 0);
    const totals = providers.reduce((summary, provider) => ({
      transactions: summary.transactions + provider.transactionCount,
      volume: summary.volume + provider.transactionVolume,
      latency: summary.latency + (provider.isEnabled && provider.transactionCount > 0 ? provider.avgLatencyMs : 0),
      success: summary.success + (provider.isEnabled && provider.transactionCount > 0 ? provider.successRate : 0),
      failure: summary.failure + (provider.isEnabled && provider.transactionCount > 0 ? provider.failureRate : 0),
    }), { transactions: 0, volume: 0, latency: 0, success: 0, failure: 0 });
    const avgLatency = measured.length ? Math.round(totals.latency / measured.length) : 0;
    const avgSuccess = measured.length ? (totals.success / measured.length).toFixed(1) : '0.0';
    const avgFailure = measured.length ? (totals.failure / measured.length).toFixed(1) : '0.0';
    const providerCards = providers.map((provider) => {
      const badge = provider.isEnabled ? providerStatusLabel(provider.status) : 'Disabled';
      const isPrimary = provider.priority === 'primary';
      return `
        <article class="provider-manage-card">
          <div class="provider-manage-card__head">
            <div class="provider-manage-identity"><span class="provider-manage-logo">${providerLogo(provider.code) || esc(provider.name.slice(0, 1))}</span><span><strong>${esc(provider.name)}</strong><small>${esc(providerTypeLabel(provider.type))} · ${esc(provider.code)}</small></span></div>
            <span class="provider-health-badge provider-health-badge--${provider.isEnabled ? providerStatusClass(provider.status) : 'disabled'}"><i></i>${esc(badge)}</span>
          </div>
          <div class="provider-manage-route"><span class="provider-route-badge ${isPrimary ? 'provider-route-badge--primary' : ''}">${isPrimary ? 'Primary route' : 'Fallback provider'}</span><span class="provider-credentials ${provider.credentialsConfigured ? 'is-configured' : ''}">${icon(provider.credentialsConfigured ? 'shield' : 'excl')}${provider.credentialsConfigured ? 'Credentials configured' : 'Credentials missing'}</span></div>
          <div class="provider-metrics">
            <div><small>Transactions (30d)</small><strong>${nfIN.format(provider.transactionCount)}</strong></div>
            <div><small>Volume (30d)</small><strong>${merchantMoney.format(provider.transactionVolume)}</strong></div>
            <div><small>Success</small><strong>${provider.successRate}%</strong></div>
            <div><small>Failures</small><strong>${provider.failureRate}%</strong></div>
          </div>
          <div class="provider-latency"><span>API response time</span><strong>${provider.avgLatencyMs ? `${provider.avgLatencyMs} ms` : 'No data'}</strong></div>
          <div class="provider-manage-actions">
            <button type="button" class="merchant-btn merchant-btn--subtle" data-provider-action="configure" data-provider-id="${esc(provider.id)}">Edit configuration</button>
            <button type="button" class="merchant-btn ${provider.isEnabled ? 'merchant-btn--reject' : 'merchant-btn--approve'}" data-provider-action="toggle" data-provider-id="${esc(provider.id)}">${provider.isEnabled ? 'Disable' : 'Enable'}</button>
          </div>
          <details class="provider-log-details"><summary>Integration logs <span>${provider.logs.length}</span></summary>
            <ul class="provider-log-list">${provider.logs.length ? provider.logs.slice(0, 5).map((log) => `<li><i class="provider-log-dot provider-log-dot--${esc(log.level)}"></i><span>${esc(log.message)}</span><time>${esc(fmtDateTime(log.at))}</time></li>`).join('') : '<li class="provider-log-empty">No integration events have been recorded.</li>'}</ul>
          </details>
        </article>`;
    }).join('');
    const routeGroups = [
      { type: 'mfs', title: 'Mobile financial services' },
      { type: 'card', title: 'Card networks' },
      { type: 'wallet', title: 'Digital wallets' },
      { type: 'bank', title: 'Bank transfers' },
    ].map(({ type, title }) => {
      const group = enabled.filter((provider) => provider.type === type);
      if (!group.length) return '';
      const primary = group.find((provider) => provider.priority === 'primary') || group[0];
      const fallback = group.find((provider) => provider.id === primary.fallbackProviderId)
        || group.find((provider) => provider.id !== primary.id && provider.priority === 'fallback');
      return `<div class="provider-route-group" data-route-type="${type}">
        <h3>${title}</h3>
        <label>Primary provider<select name="primaryProvider">${providerSelectOptions(group, primary.id, '', false)}</select></label>
        <label>Fallback provider<select name="fallbackProvider">${providerSelectOptions(group, fallback?.id || '', primary.id)}</select></label>
      </div>`;
    }).join('');

    root.innerHTML = `
      <header class="provider-page-head">
        <div><p class="merchant-eyebrow">PAYMENT OPERATIONS</p><h1>Payment Provider Management</h1><p>Configure provider connections, routing, limits, and integration health.</p></div>
        <div class="provider-page-actions"><span class="merchant-demo-note">${icon('alert')} Demo workspace · changes reset on reload</span><button type="button" class="merchant-btn merchant-btn--primary provider-add-button" data-provider-action="add">${icon('plus')} Add provider</button></div>
      </header>
      <div class="merchant-summary provider-summary">
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--blue">${icon('server')}</span><div><small>Enabled providers</small><strong>${nfIN.format(enabled.length)} / ${nfIN.format(providers.length)}</strong></div></article>
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--green">${icon('card')}</span><div><small>Provider transactions</small><strong>${nfIN.format(totals.transactions)}</strong></div></article>
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--violet">${icon('pulse')}</span><div><small>Average response time</small><strong>${avgLatency} ms</strong></div></article>
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--amber">${icon('check')}</span><div><small>Success / failure</small><strong>${avgSuccess}% / ${avgFailure}%</strong></div></article>
      </div>
      <section class="card provider-routing-panel">
        <header class="card__head"><div><h2><svg class="h-ico h-ico--violet"><use href="#i-route"/></svg>Primary and Fallback Routing</h2><p class="card__sub">Choose an enabled primary provider and an optional fallback for each payment type.</p></div></header>
        <form id="providerRoutingForm" class="provider-routing-form">${routeGroups || '<p class="provider-empty">Enable providers to configure routing priorities.</p>'}
          ${routeGroups ? '<button type="submit" class="merchant-btn merchant-btn--primary">Save routing</button>' : ''}
        </form>
      </section>
      <section class="provider-card-list" aria-label="Payment provider configuration">${providerCards || '<div class="card provider-empty">No providers configured yet. Add one to get started.</div>'}</section>
      <section class="card provider-add-panel" id="providerAddPanel" hidden>
        <header class="card__head"><div><h2><svg class="h-ico h-ico--blue"><use href="#i-plus"/></svg>Add a payment provider</h2><p class="card__sub">New providers start disabled until configuration and connectivity are verified.</p></div><button type="button" class="merchant-icon-action" data-provider-action="close-add" aria-label="Close add provider form">${icon('x')}</button></header>
        <form class="provider-config-form" data-provider-form="create">
          <label>Provider name<input name="name" required maxlength="60" placeholder="e.g. Example Pay" /></label>
          <label>Provider code<input name="code" required maxlength="24" pattern="[a-z0-9_]+" placeholder="example_pay" /></label>
          <label>Payment type<select name="type" required><option value="mfs">Mobile financial service</option><option value="card">Card network</option><option value="wallet">Digital wallet</option><option value="bank">Bank transfer</option></select></label>
          <label>API base URL<input name="apiBaseUrl" type="url" pattern="https://.+" title="Use an HTTPS provider endpoint" required placeholder="https://api.provider.example" /></label>
          <label>API client ID<input name="clientId" type="password" autocomplete="new-password" placeholder="Enter client ID (optional)" /></label>
          <label>API secret<input name="clientSecret" type="password" autocomplete="new-password" placeholder="Enter secret (optional)" /></label>
          <label>Per-transaction limit (BDT)<input name="transactionLimit" type="number" min="1" step="1" required value="100000" /></label>
          <label>Daily limit (BDT)<input name="dailyLimit" type="number" min="1" step="1" required value="500000" /></label>
          <div class="provider-form-actions"><button type="submit" class="merchant-btn merchant-btn--primary">Add provider</button><button type="button" class="merchant-btn" data-provider-action="close-add">Cancel</button></div>
        </form>
      </section>
      ${state.providerModalId ? await renderProviderConfig(state.providerModalId) : ''}`;
    bindProviderEvents(root);
    if (state.providerModalId) $('#providerConfigDialog', root)?.focus();
  }

  async function renderProviderConfig(id) {
    const provider = await DataService.getProvider(id);
    return `<div class="merchant-dialog-backdrop" data-provider-action="close-config">
      <section class="merchant-profile-dialog provider-config-dialog" id="providerConfigDialog" role="dialog" aria-modal="true" aria-labelledby="providerConfigTitle" tabindex="-1">
        <header class="merchant-profile-head"><div class="merchant-profile-identity"><span class="provider-manage-logo provider-manage-logo--large">${providerLogo(provider.code) || esc(provider.name.slice(0, 1))}</span><div><p class="merchant-eyebrow">PROVIDER CONFIGURATION</p><h2 id="providerConfigTitle">${esc(provider.name)}</h2><span class="merchant-profile-meta">${esc(providerTypeLabel(provider.type))} · ${esc(provider.code)}</span></div></div><button type="button" class="merchant-icon-action" data-provider-action="close-config" aria-label="Close configuration">${icon('x')}</button></header>
        <div class="merchant-profile-content">
          <p class="provider-secret-note">${icon('shield')} Credentials are write-only. Existing secret values are never shown. Leave a credential blank to keep it unchanged.</p>
          <form class="provider-config-form" data-provider-form="edit" data-provider-id="${esc(provider.id)}">
            <label>Provider name<input name="name" required maxlength="60" value="${esc(provider.name)}" /></label>
            <label class="provider-form-span">API base URL<input name="apiBaseUrl" type="url" pattern="https://.+" title="Use an HTTPS provider endpoint" required value="${esc(provider.apiBaseUrl || '')}" placeholder="https://api.provider.example" /></label>
            <label>API client ID<input name="clientId" type="password" autocomplete="new-password" placeholder="${provider.credentialsConfigured ? 'Configured · enter to replace' : 'Not configured'}" /></label>
            <label>API secret<input name="clientSecret" type="password" autocomplete="new-password" placeholder="${provider.credentialsConfigured ? 'Configured · enter to replace' : 'Not configured'}" /></label>
            <label>Per-transaction limit (BDT)<input name="transactionLimit" type="number" min="1" step="1" required value="${provider.transactionLimit}" /></label>
            <label>Daily limit (BDT)<input name="dailyLimit" type="number" min="1" step="1" required value="${provider.dailyLimit}" /></label>
            <label class="provider-enabled-field"><input name="isEnabled" type="checkbox" ${provider.isEnabled ? 'checked' : ''} /> Enable provider</label>
            <div class="provider-form-actions provider-form-span"><button type="submit" class="merchant-btn merchant-btn--primary">Save configuration</button><button type="button" class="merchant-btn" data-provider-action="close-config">Cancel</button></div>
          </form>
        </div>
      </section>
    </div>`;
  }

  function bindProviderEvents(root) {
    if (root.dataset.eventsBound) return;
    root.dataset.eventsBound = 'true';
    root.addEventListener('click', async (event) => {
      const target = event.target.closest('[data-provider-action]');
      if (!target) return;
      const action = target.dataset.providerAction;
      const id = target.dataset.providerId;
      if (action === 'close-config' && event.target !== target && !target.classList.contains('merchant-icon-action')) return;
      if (action === 'close-config') {
        state.providerModalId = null;
        renderProviderManagement().catch((err) => { console.error(err); toast('Unable to close provider configuration'); });
        return;
      }
      if (action === 'add') { $('#providerAddPanel').hidden = false; $('#providerAddPanel').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('#providerAddPanel [name="name"]').focus(); return; }
      if (action === 'close-add') { $('#providerAddPanel').hidden = true; return; }
      if (action === 'configure') {
        state.providerModalId = id;
        renderProviderManagement().catch((err) => { console.error(err); toast('Unable to load provider configuration'); });
        return;
      }
      if (action === 'toggle') {
        try {
          const provider = await DataService.getProvider(id);
          if (provider.isEnabled && provider.priority === 'primary') {
            toast('Select another primary provider before disabling this one');
            return;
          }
          if (!provider.isEnabled && !provider.credentialsConfigured) {
            toast('Configure API credentials before enabling this provider');
            return;
          }
          if (provider.isEnabled && !window.confirm(`Disable ${provider.name}? Payments will no longer be routed to this provider.`)) return;
          await DataService.saveProvider(id, { isEnabled: !provider.isEnabled });
          toast(`Provider ${provider.isEnabled ? 'disabled' : 'enabled'}`);
          await renderProviderManagement();
          await Promise.all([renderProviders(), renderKpis()]);
        } catch (err) {
          console.error(err); toast('Unable to update provider availability');
        }
      }
    });
    root.addEventListener('submit', async (event) => {
      const form = event.target.closest('[data-provider-form], #providerRoutingForm');
      if (!form) return;
      event.preventDefault();
      try {
        if (form.id === 'providerRoutingForm') {
          const routes = [...form.querySelectorAll('.provider-route-group')].map((group) => {
            const primaryProviderId = group.querySelector('[name="primaryProvider"]').value;
            const fallbackProviderId = group.querySelector('[name="fallbackProvider"]').value;
            if (fallbackProviderId && fallbackProviderId === primaryProviderId) throw new Error('Primary and fallback providers must be different');
            return { type: group.dataset.routeType, primaryProviderId, fallbackProviderId };
          });
          await DataService.saveProviderRouting(routes);
          toast('Primary and fallback routing saved');
          await renderProviderManagement();
          return;
        }
        const values = new FormData(form);
        const transactionLimit = Number(values.get('transactionLimit'));
        const dailyLimit = Number(values.get('dailyLimit'));
        if (!Number.isFinite(transactionLimit) || !Number.isFinite(dailyLimit) || transactionLimit <= 0 || dailyLimit < transactionLimit) {
          toast('Daily limit must be at least the per-transaction limit');
          return;
        }
        const name = String(values.get('name') || '').trim();
        const code = form.dataset.providerForm === 'create' ? String(values.get('code') || '').trim().toLowerCase() : undefined;
        if (form.dataset.providerForm === 'create' && !/^[a-z0-9_]{2,24}$/.test(code)) {
          toast('Provider code must be 2–24 letters, numbers, or underscores');
          return;
        }
        const clientId = String(values.get('clientId') || '').trim();
        const clientSecret = String(values.get('clientSecret') || '').trim();
        if ((clientId || clientSecret) && !(clientId && clientSecret)) {
          toast('Enter both API client ID and secret together');
          return;
        }
        const existingProvider = form.dataset.providerId ? await DataService.getProvider(form.dataset.providerId) : null;
        const changes = {
          name, type: existingProvider ? existingProvider.type : String(values.get('type')), apiBaseUrl: String(values.get('apiBaseUrl')).trim(),
          transactionLimit, dailyLimit, credentials: { clientId, clientSecret },
        };
        if (form.dataset.providerForm === 'create') {
          const existing = await DataService.getProviderRecords();
          if (existing.some((provider) => provider.code.toLowerCase() === code)) {
            toast('A provider with this code already exists');
            return;
          }
          changes.code = code;
          await DataService.saveProvider(null, changes);
          toast('Provider added in disabled state');
          await renderProviderManagement();
        } else {
          const provider = existingProvider;
          const isEnabled = form.elements.isEnabled.checked;
          if (isEnabled && !provider.credentialsConfigured && !(clientId && clientSecret)) {
            toast('Configure API credentials before enabling this provider');
            return;
          }
          if (provider.isEnabled && !isEnabled && provider.priority === 'primary') {
            toast('Select another primary provider before disabling this one');
            return;
          }
          changes.isEnabled = isEnabled;
          await DataService.saveProvider(form.dataset.providerId, changes);
          toast('Provider configuration saved');
          state.providerModalId = null;
          await renderProviderManagement();
          await Promise.all([renderProviders(), renderKpis()]);
        }
      } catch (err) {
        console.error(err);
        toast(err.message === 'Primary and fallback providers must be different' ? err.message : 'Unable to save provider configuration');
      }
    });
  }

  const transactionStatusLabel = (status) => ({
    successful: 'Successful', failed: 'Failed', pending: 'Pending', processing: 'Processing', refunded: 'Refunded',
  }[status] || status);
  const transactionStatusClass = (status) => ({
    successful: 'active', failed: 'rejected', pending: 'pending', processing: 'processing', refunded: 'refunded',
  }[status] || 'pending');

  function identifyDuplicateAttempts(transactions) {
    const keyFor = (transaction) => transaction.duplicateGroup
      || `${transaction.merchantId}|${transaction.reference}|${transaction.amount}`;
    const attempts = transactions.reduce((groups, transaction) => {
      const key = keyFor(transaction);
      groups[key] = (groups[key] || 0) + 1;
      return groups;
    }, {});
    return transactions.map((transaction) => ({
      ...transaction,
      duplicateDetected: attempts[keyFor(transaction)] > 1,
      duplicateAttempts: attempts[keyFor(transaction)],
    }));
  }

  async function renderTransactionMonitoring(detailId = null) {
    const root = $('#transactionMonitoring');
    root.hidden = false;
    root.innerHTML = '<div class="card skeleton" style="height:280px"></div>';
    const [allTransactions, allMerchants, providers] = await Promise.all([
      DataService.getTransactions(),
      DataService.getMerchants(),
      DataService.getProviderRecords(),
    ]);
    const filters = state.transactionFilters;
    const filtered = await DataService.getTransactions({
      id: filters.id,
      merchantId: filters.merchantId,
      providerId: filters.providerId,
      status: filters.status,
      from: filters.from,
      to: filters.to,
      amountMin: filters.amountMin,
      amountMax: filters.amountMax,
      duplicatesOnly: filters.duplicatesOnly,
    });
    const annotated = identifyDuplicateAttempts(allTransactions);
    const filteredIds = new Set(filtered.map((transaction) => transaction.id));
    const visible = annotated.filter((transaction) => filteredIds.has(transaction.id));
    const failedCount = allTransactions.filter((transaction) => transaction.status === 'failed').length;
    const pendingCount = allTransactions.filter((transaction) => ['pending', 'processing'].includes(transaction.status)).length;
    const duplicateCount = annotated.filter((transaction) => transaction.duplicateDetected).length;
    const merchants = [...new Map(allMerchants.map((merchant) => [merchant.id, merchant])).values()];
    const availableProviders = providers;
    const rows = visible.map((transaction) => `
      <tr class="${transaction.status === 'failed' ? 'transaction-row--failed' : ''}">
        <td data-label="Transaction"><div class="transaction-identity"><strong>${esc(transaction.id)}</strong>${transaction.duplicateDetected ? `<span class="transaction-duplicate-flag">${icon('copy')} Duplicate attempt · ${transaction.duplicateAttempts}</span>` : ''}</div></td>
        <td data-label="Merchant">${esc(transaction.merchantName)}</td>
        <td data-label="Provider"><span class="transaction-provider">${providerLogo(transaction.providerName.toLowerCase())}${esc(transaction.providerName)}</span></td>
        <td data-label="Amount">${merchantMoney.format(transaction.amount)}</td>
        <td data-label="Date">${esc(fmtDateTime(transaction.createdAt))}</td>
        <td data-label="Status"><span class="merchant-status transaction-status--${transactionStatusClass(transaction.status)}">${esc(transactionStatusLabel(transaction.status))}</span></td>
        <td data-label="Actions"><button type="button" class="merchant-btn merchant-btn--subtle" data-transaction-action="details" data-transaction-id="${esc(transaction.id)}">${transaction.status === 'failed' ? 'Investigate' : 'Details'}</button></td>
      </tr>`).join('');
    root.innerHTML = `
      <header class="transaction-page-head">
        <div><p class="merchant-eyebrow">PAYMENT OPERATIONS</p><h1>Global Transaction Monitoring</h1><p>Search and investigate platform-wide payment activity, lifecycle events, and duplicate attempts.</p></div>
        <div class="transaction-page-actions"><span class="merchant-demo-note">${icon('alert')} Demo workspace · sample records</span><button type="button" class="merchant-btn merchant-btn--primary" data-transaction-action="export">${icon('file')} Export CSV</button></div>
      </header>
      <div class="merchant-summary transaction-summary">
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--blue">${icon('card')}</span><div><small>Platform transactions</small><strong>${nfIN.format(allTransactions.length)}</strong></div></article>
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--red">${icon('excl')}</span><div><small>Failed transactions</small><strong>${nfIN.format(failedCount)}</strong></div></article>
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--amber">${icon('clock')}</span><div><small>Pending / processing</small><strong>${nfIN.format(pendingCount)}</strong></div></article>
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--violet">${icon('copy')}</span><div><small>Duplicate attempts</small><strong>${nfIN.format(duplicateCount)}</strong></div></article>
      </div>
      <section class="card transaction-filters-panel">
        <header class="card__head"><div><h2><svg class="h-ico h-ico--blue"><use href="#i-search"/></svg>Find transactions</h2><p class="card__sub">Combine filters to narrow the platform transaction list.</p></div></header>
        <form id="transactionFilters" class="transaction-filters">
          <label>Transaction ID<input name="id" type="search" placeholder="Search transaction ID" value="${esc(filters.id)}" /></label>
          <label>Merchant<select name="merchantId"><option value="">All merchants</option>${merchants.map((merchant) => `<option value="${esc(merchant.id)}" ${filters.merchantId === merchant.id ? 'selected' : ''}>${esc(merchant.name)}</option>`).join('')}</select></label>
          <label>Payment provider<select name="providerId"><option value="">All providers</option>${availableProviders.map((provider) => `<option value="${esc(provider.id)}" ${filters.providerId === provider.id ? 'selected' : ''}>${esc(provider.name)}</option>`).join('')}</select></label>
          <label>Status<select name="status"><option value="all">All statuses</option>${['successful', 'failed', 'pending', 'processing', 'refunded'].map((status) => `<option value="${status}" ${filters.status === status ? 'selected' : ''}>${transactionStatusLabel(status)}</option>`).join('')}</select></label>
          <label>From date<input name="from" type="date" value="${esc(filters.from)}" /></label>
          <label>To date<input name="to" type="date" value="${esc(filters.to)}" /></label>
          <label>Minimum amount (BDT)<input name="amountMin" type="number" min="0" step="1" placeholder="No minimum" value="${esc(filters.amountMin)}" /></label>
          <label>Maximum amount (BDT)<input name="amountMax" type="number" min="0" step="1" placeholder="No maximum" value="${esc(filters.amountMax)}" /></label>
          <label class="transaction-duplicate-filter"><input name="duplicatesOnly" type="checkbox" ${filters.duplicatesOnly ? 'checked' : ''} /> Show duplicate attempts only</label>
          <div class="transaction-filter-actions"><button type="submit" class="merchant-btn merchant-btn--primary">Apply filters</button><button type="button" class="merchant-btn" data-transaction-action="clear">Clear filters</button></div>
        </form>
      </section>
      <section class="card transaction-results-panel">
        <header class="card__head"><div><h2><svg class="h-ico h-ico--violet"><use href="#i-bars"/></svg>Platform transactions</h2><p class="card__sub">Showing ${nfIN.format(visible.length)} of ${nfIN.format(allTransactions.length)} sample records${filters.duplicatesOnly ? ' · duplicate attempts' : ''}.</p></div><span class="transaction-result-count">${nfIN.format(visible.length)} results</span></header>
        ${visible.some((transaction) => transaction.duplicateDetected) ? `<div class="transaction-duplicate-notice">${icon('copy')} Duplicate attempts are grouped by merchant, order reference, and amount. Review the lifecycle before taking action.</div>` : ''}
        <div class="merchant-table-wrap"><table class="merchant-table transaction-table"><thead><tr><th>Transaction ID</th><th>Merchant</th><th>Provider</th><th>Amount</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows || '<tr><td class="merchant-empty-cell" colspan="7">No transactions match these filters.</td></tr>'}</tbody></table></div>
      </section>
      ${detailId ? await renderTransactionDetails(detailId, annotated) : ''}`;
    bindTransactionEvents(root);
    if (detailId) $('#transactionDetailsDialog', root)?.focus();
  }

  async function renderTransactionDetails(id, knownTransactions) {
    const transaction = await DataService.getTransaction(id);
    const annotated = identifyDuplicateAttempts(knownTransactions || await DataService.getTransactions());
    const selected = annotated.find((item) => item.id === transaction.id) || transaction;
    const duplicates = selected.duplicateDetected
      ? annotated.filter((item) => item.id !== selected.id && item.duplicateDetected && item.merchantId === selected.merchantId && item.reference === selected.reference && item.amount === selected.amount)
      : [];
    const history = [...transaction.history].sort((a, b) => new Date(a.at) - new Date(b.at));
    const investigation = transaction.status === 'failed' ? (transaction.investigation || {}) : null;
    const apiAttempts = Array.isArray(investigation?.apiAttempts) ? investigation.apiAttempts : [];
    const initiatedAt = investigation?.initiatedAt || transaction.createdAt;
    const retryAttempts = Number.isInteger(investigation?.retryAttempts) && investigation.retryAttempts >= 0
      ? investigation.retryAttempts
      : Math.max(apiAttempts.length - 1, 0);
    return `<div class="merchant-dialog-backdrop transaction-dialog-backdrop" data-transaction-action="close-details">
      <section class="merchant-profile-dialog transaction-details-dialog" id="transactionDetailsDialog" role="dialog" aria-modal="true" aria-labelledby="transactionDetailsTitle" tabindex="-1">
        <header class="merchant-profile-head"><div class="transaction-details-heading"><span class="merchant-summary-icon ${transaction.status === 'failed' ? 'merchant-summary-icon--red' : 'merchant-summary-icon--blue'}">${icon(transaction.status === 'failed' ? 'excl' : 'card')}</span><div><p class="merchant-eyebrow">${transaction.status === 'failed' ? 'FAILED PAYMENT INVESTIGATION' : 'TRANSACTION DETAILS'}</p><h2 id="transactionDetailsTitle">${esc(transaction.id)}</h2><span class="merchant-profile-meta">${esc(fmtDateTime(transaction.createdAt))}</span></div></div><button type="button" class="merchant-icon-action" data-transaction-action="close-details" aria-label="Close transaction details">${icon('x')}</button></header>
        <div class="merchant-profile-content">
          ${investigation ? `<section class="transaction-investigation" aria-labelledby="transactionInvestigationTitle">
            <header><h3 id="transactionInvestigationTitle">${icon('alert')} Transaction Investigation Center</h3><span class="merchant-status transaction-status--rejected">Failed payment</span></header>
            <dl class="transaction-investigation__summary">
              <div><dt>Transaction initiation time</dt><dd>${esc(fmtDateTime(initiatedAt))}</dd></div>
              <div><dt>Selected payment provider</dt><dd>${esc(investigation.selectedProvider || transaction.providerName)}</dd></div>
              <div><dt>Retry attempts</dt><dd>${nfIN.format(retryAttempts)}</dd></div>
              <div><dt>Final transaction status</dt><dd><span class="merchant-status transaction-status--${transactionStatusClass(transaction.status)}">${esc(transactionStatusLabel(transaction.status))}</span></dd></div>
            </dl>
            <h4>Provider API request and response status</h4>
            ${apiAttempts.length ? `<ol class="transaction-api-attempts">${apiAttempts.map((attempt) => `<li>
              <div class="transaction-api-attempt__head"><strong>Attempt ${esc(attempt.attempt)}</strong><time>${esc(fmtDateTime(attempt.at))}</time></div>
              <div class="transaction-api-attempt__statuses">
                <div><span>Request</span><strong>${esc(attempt.requestStatus || 'Not recorded')}</strong><small>${esc(attempt.requestHttpStatus || 'HTTP status not recorded')}</small></div>
                <div><span>Response</span><strong>${esc(attempt.responseStatus || 'Not recorded')}</strong><small>${esc(attempt.responseHttpStatus || 'HTTP status not recorded')}</small></div>
                <div><span>Latency</span><strong>${Number.isFinite(attempt.latencyMs) ? `${nfIN.format(attempt.latencyMs)} ms` : 'Not recorded'}</strong></div>
              </div>
            </li>`).join('')}</ol>` : '<p class="transaction-api-empty">No provider API attempt statuses were recorded.</p>'}
            <p class="transaction-log-safety">${icon('check')} Only status metadata is shown. Credentials, authorization headers, raw payloads, card numbers, and bank details must be excluded from investigation logs.</p>
            <p class="transaction-investigation__reason"><strong>Failure reason</strong><span>${esc(transaction.failureReason || 'Provider reported a failed payment without a reason.')}</span></p>
          </section>` : ''}
          ${selected.duplicateDetected ? `<section class="transaction-duplicate-notice transaction-duplicate-detail">${icon('copy')}<span><strong>Possible duplicate attempt group · ${selected.duplicateAttempts} attempts</strong><small>Same merchant, order reference, and amount. Check provider settlement before resolving.</small></span></section>` : ''}
          ${duplicates.length ? `<section class="transaction-related"><h3>Related attempts</h3>${duplicates.map((item) => `<button type="button" class="transaction-related-item" data-transaction-action="details" data-transaction-id="${esc(item.id)}"><span>${esc(item.id)} · ${esc(transactionStatusLabel(item.status))}</span><strong>${merchantMoney.format(item.amount)}</strong></button>`).join('')}</section>` : ''}
          <section class="merchant-detail-card"><h3>Payment and merchant information</h3><dl class="merchant-details transaction-detail-grid">
            <div><dt>Status</dt><dd><span class="merchant-status transaction-status--${transactionStatusClass(transaction.status)}">${esc(transactionStatusLabel(transaction.status))}</span></dd></div>
            <div><dt>Amount</dt><dd>${merchantMoney.format(transaction.amount)} ${esc(transaction.currency)}</dd></div>
            <div><dt>Merchant</dt><dd>${esc(transaction.merchantName)}</dd></div>
            <div><dt>Payment provider</dt><dd>${esc(transaction.providerName)}</dd></div>
            <div><dt>Payment method</dt><dd>${esc(transaction.paymentMethod)}</dd></div>
            <div><dt>Order reference</dt><dd>${esc(transaction.reference || '—')}</dd></div>
            <div><dt>Customer</dt><dd>${esc(transaction.customer)}</dd></div>
            <div><dt>Contact</dt><dd>${esc(transaction.customerPhone)}</dd></div>
            <div><dt>Provider reference</dt><dd>${esc(transaction.providerReference || '—')}</dd></div>
          </dl></section>
          <section class="merchant-detail-card transaction-history-card"><h3>Transaction lifecycle and status history</h3><ol class="transaction-timeline">${history.map((event) => `<li class="transaction-timeline__item transaction-timeline__item--${transactionStatusClass(event.status)}"><span class="transaction-timeline__mark"></span><div><strong>${esc(transactionStatusLabel(event.status))}</strong><p>${esc(event.note)}</p><time>${esc(fmtDateTime(event.at))}</time></div></li>`).join('')}</ol></section>
        </div>
      </section>
    </div>`;
  }

  function csvCell(value) {
    let text = String(value == null ? '' : value);
    if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function parseReconciliationCsv(text) {
    const records = [];
    let row = [], cell = '', quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (quoted) {
        if (character === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
        else if (character === '"') quoted = false;
        else cell += character;
      } else if (character === '"' && !cell) quoted = true;
      else if (character === ',') { row.push(cell); cell = ''; }
      else if (character === '\n' || character === '\r') {
        if (character === '\r' && text[index + 1] === '\n') index += 1;
        row.push(cell); cell = '';
        if (row.some((value) => value.trim())) records.push(row);
        row = [];
      } else cell += character;
    }
    if (quoted) throw new Error('Statement CSV contains an unclosed quoted field');
    row.push(cell);
    if (row.some((value) => value.trim())) records.push(row);
    if (records.length < 2) throw new Error('Statement CSV needs a header and at least one transaction row');
    const header = records.shift().map((value) => value.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[\s-]+/g, '_'));
    const column = (name) => header.indexOf(name);
    const referenceIndex = column('provider_reference');
    const transactionIndex = column('transaction_id');
    const amountIndex = column('amount');
    if (referenceIndex < 0 && transactionIndex < 0) throw new Error('CSV must include provider_reference or transaction_id');
    if (amountIndex < 0) throw new Error('CSV must include an amount column');
    const value = (cells, index) => index < 0 ? '' : String(cells[index] || '').trim();
    const parsed = records.map((cells, index) => {
      const providerReference = value(cells, referenceIndex);
      const transactionId = value(cells, transactionIndex);
      const rawAmount = value(cells, amountIndex);
      const hasGroupedThousands = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(rawAmount);
      const hasPlainAmount = /^\d+(?:\.\d+)?$/.test(rawAmount);
      const amount = Number(hasGroupedThousands ? rawAmount.replace(/,/g, '') : rawAmount);
      if ((!providerReference && !transactionId) || (!hasGroupedThousands && !hasPlainAmount) || !Number.isFinite(amount) || amount <= 0) {
        throw new Error(`Invalid reference or amount on CSV row ${index + 2}`);
      }
      return {
        providerReference, transactionId, amount,
        currency: (value(cells, column('currency')) || 'BDT').toUpperCase(),
        status: value(cells, column('status')) || 'settled',
        settledAt: value(cells, column('settled_at')),
      };
    });
    if (parsed.length > 5000) throw new Error('A statement can contain at most 5,000 transaction rows');
    return parsed;
  }

  async function exportTransactionReport() {
    const filters = state.transactionFilters;
    const data = await DataService.getTransactions({
      id: filters.id, merchantId: filters.merchantId, providerId: filters.providerId,
      status: filters.status, from: filters.from, to: filters.to,
      amountMin: filters.amountMin, amountMax: filters.amountMax, duplicatesOnly: filters.duplicatesOnly,
    });
    const annotated = identifyDuplicateAttempts(data);
    const headers = ['Transaction ID', 'Merchant', 'Provider', 'Payment method', 'Amount', 'Currency', 'Status', 'Created at', 'Order reference', 'Provider reference', 'Failure reason', 'Duplicate attempt'];
    const lines = [headers, ...annotated.map((transaction) => [
      transaction.id, transaction.merchantName, transaction.providerName, transaction.paymentMethod,
      transaction.amount, transaction.currency, transactionStatusLabel(transaction.status),
      transaction.createdAt, transaction.reference, transaction.providerReference,
      transaction.failureReason, transaction.duplicateDetected ? 'Yes' : 'No',
    ])].map((row) => row.map(csvCell).join(','));
    const blob = new Blob(['\uFEFF', lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `platform-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Exported ${nfIN.format(data.length)} transaction records`);
  }

  function bindTransactionEvents(root) {
    const filterForm = $('#transactionFilters', root);
    filterForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const form = event.target;
      const values = new FormData(form);
      const next = Object.fromEntries(['id', 'merchantId', 'providerId', 'status', 'from', 'to', 'amountMin', 'amountMax'].map((key) => [key, String(values.get(key) || '').trim()]));
      next.status = next.status || 'all';
      next.duplicatesOnly = form.elements.duplicatesOnly.checked;
      if (next.from && next.to && next.from > next.to) { toast('From date must be on or before the To date'); return; }
      if (next.amountMin && next.amountMax && Number(next.amountMin) > Number(next.amountMax)) { toast('Minimum amount cannot exceed maximum amount'); return; }
      state.transactionFilters = next;
      renderTransactionMonitoring().catch((err) => { console.error(err); toast('Unable to filter transactions'); });
    });
    if (root.dataset.eventsBound) return;
    root.dataset.eventsBound = 'true';
    root.addEventListener('click', async (event) => {
      const target = event.target.closest('[data-transaction-action]');
      if (!target) return;
      const action = target.dataset.transactionAction;
      const id = target.dataset.transactionId;
      if (action === 'export') {
        try { await exportTransactionReport(); } catch (err) { console.error(err); toast('Unable to export transaction report'); }
        return;
      }
      if (action === 'clear') {
        state.transactionFilters = { id: '', merchantId: '', providerId: '', status: 'all', from: '', to: '', amountMin: '', amountMax: '', duplicatesOnly: false };
        renderTransactionMonitoring().catch((err) => { console.error(err); toast('Unable to reset transaction filters'); });
        return;
      }
      if (action === 'close-details' && event.target !== target && !target.classList.contains('merchant-icon-action')) return;
      if (action === 'close-details') {
        renderTransactionMonitoring().catch((err) => { console.error(err); toast('Unable to close transaction details'); });
        return;
      }
      if (action === 'details') renderTransactionMonitoring(id).catch((err) => {
        console.error(err); toast('Unable to load transaction details');
      });
    });
  }

  async function renderNotifications() {
    const list = await DataService.getNotifications();
    const unread = list.filter((n) => !n.read).length;
    const badge = $('#notifCount');
    badge.textContent = unread; badge.hidden = unread === 0;
    const colors = { danger: 'var(--red)', warning: 'var(--orange)', info: 'var(--blue)' };
    $('#notifList').innerHTML = list.map((n) => `
      <li class="${n.read ? '' : 'unread'}"><span class="n-dot" style="background:${colors[n.level] || colors.info}"></span>
        <div><p>${esc(n.title)}</p><small>${esc(timeAgo(n.createdAt))}</small></div></li>`).join('');
  }

  async function renderAlertManagement() {
    const root = $('#alertManagement');
    root.hidden = false;
    root.innerHTML = '<div class="card skeleton" style="height:280px"></div>';
    const [data, allNotifications] = await Promise.all([
      DataService.getAlertPreferences(),
      DataService.getNotifications(),
    ]);
    const { preferences, rules } = data;
    const alerts = allNotifications.filter((item) => {
      const matchesCategory = state.alertFilters.category === 'all' || item.category === state.alertFilters.category;
      const matchesStatus = state.alertFilters.status === 'all' || (state.alertFilters.status === 'unread' ? !item.read : item.read);
      const query = state.alertFilters.q.toLowerCase();
      return matchesCategory && matchesStatus && (!query || `${item.title} ${rules[item.category]?.label || ''}`.toLowerCase().includes(query));
    });
    const unreadCount = allNotifications.filter((item) => !item.read).length;
    const preferenceCards = Object.entries(rules).map(([key, rule]) => {
      const config = preferences[key];
      const thresholdInputs = [rule.threshold, rule.secondaryThreshold].filter(Boolean).map((threshold) => `
        <label class="alert-threshold"><span>${esc(threshold.label)}</span>
          <span class="alert-threshold__input"><input type="number" name="${esc(key)}.${esc(threshold.field)}" min="${threshold.min}" max="${threshold.max}" step="${threshold.step}" value="${esc(config[threshold.field])}" required><small>${esc(threshold.unit)}</small></span>
        </label>`).join('');
      return `<article class="alert-preference-card">
        <div class="alert-preference-card__heading"><div><h3>${esc(rule.label)}</h3><p>${esc(rule.description)}</p></div>
          <label class="alert-toggle"><input type="checkbox" name="enabled:${esc(key)}" ${config.enabled ? 'checked' : ''}><span>Enabled</span></label></div>
        ${thresholdInputs ? `<div class="alert-thresholds">${thresholdInputs}</div>` : ''}
        <div class="alert-delivery"><span>Delivery</span>
          <label class="alert-toggle"><input type="checkbox" name="inApp:${esc(key)}" ${config.inApp ? 'checked' : ''}><span>In-app</span></label>
          <label class="alert-toggle"><input type="checkbox" name="email:${esc(key)}" ${config.email ? 'checked' : ''}><span>Email</span></label>
        </div>
      </article>`;
    }).join('');
    const rows = alerts.map((item) => `<tr class="${item.read ? '' : 'alert-row--unread'}">
      <td data-label="Alert"><strong>${esc(item.title)}</strong><small>${esc(rules[item.category]?.description || 'Platform notification')}</small></td>
      <td data-label="Category">${esc(rules[item.category]?.label || item.category)}</td>
      <td data-label="Severity"><span class="alert-severity alert-severity--${esc(item.level)}">${esc(item.level)}</span></td>
      <td data-label="Received">${esc(timeAgo(item.createdAt))}<small>${esc(fmtDateTime(item.createdAt))}</small></td>
      <td data-label="Status"><span class="merchant-status merchant-status--${item.read ? 'active' : 'pending'}">${item.read ? 'Read' : 'Unread'}</span></td>
      <td data-label="Action"><div class="merchant-row-actions"><a class="merchant-btn merchant-btn--subtle" href="#${esc(item.page || 'alerts')}" data-page="${esc(item.page || 'alerts')}">Open</a>${item.read ? '' : `<button type="button" class="merchant-btn" data-alert-action="read" data-alert-id="${esc(item.id)}">Mark read</button>`}</div></td>
    </tr>`).join('');
    const categoryOptions = Object.entries(rules).map(([key, rule]) => `<option value="${esc(key)}" ${state.alertFilters.category === key ? 'selected' : ''}>${esc(rule.label)}</option>`).join('');
    root.innerHTML = `
      <header class="provider-page-head alert-page-head">
        <div><p class="merchant-eyebrow">PLATFORM OPERATIONS</p><h1>Notification &amp; Alert Management</h1><p>Configure operational alert preferences and thresholds, then review recent platform notifications.</p></div>
        <span class="merchant-demo-note">${icon('bell')} ${data.demo || DataService.isDemoMode() ? 'Demo workspace · preferences reset on reload' : 'Preferences are managed by your account'}</span>
      </header>
      <div class="merchant-summary alert-summary">
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--violet">${icon('bell')}</span><div><small>Recent alerts</small><strong>${nfIN.format(allNotifications.length)}</strong><span>Across configured categories</span></div></article>
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--amber">${icon('alert')}</span><div><small>Unread alerts</small><strong>${nfIN.format(unreadCount)}</strong><span>Require review</span></div></article>
        <article class="merchant-summary-card"><span class="merchant-summary-icon merchant-summary-icon--green">${icon('check')}</span><div><small>Alert categories</small><strong>${nfIN.format(Object.keys(rules).length)}</strong><span>Configured for this admin</span></div></article>
      </div>
      <form id="alertPreferencesForm">
        <section class="card alert-preferences-panel">
          <header class="card__head"><div><h2>${icon('gear')} Alert preferences &amp; thresholds</h2><p class="card__sub">Choose which event types to receive and where they should be delivered.</p></div></header>
          <div class="alert-preference-grid">${preferenceCards}</div>
          <div class="alert-save-bar"><p>Thresholds are evaluated by the backend alerting service. This dashboard does not send email or monitor live transactions.</p><button type="submit" class="merchant-btn merchant-btn--primary">Save preferences</button></div>
        </section>
      </form>
      <section class="card alert-inbox-panel">
        <header class="card__head"><div><h2>${icon('bell')} Recent notifications</h2><p class="card__sub">${nfIN.format(alerts.length)} of ${nfIN.format(allNotifications.length)} alerts · ${nfIN.format(unreadCount)} unread</p></div><button type="button" class="merchant-btn" data-alert-action="read-all" ${unreadCount ? '' : 'disabled'}>Mark all read</button></header>
        <form id="alertFilters" class="alert-filters">
          <label>Category<select name="category"><option value="all">All categories</option>${categoryOptions}</select></label>
          <label>Status<select name="status"><option value="all" ${state.alertFilters.status === 'all' ? 'selected' : ''}>All alerts</option><option value="unread" ${state.alertFilters.status === 'unread' ? 'selected' : ''}>Unread</option><option value="read" ${state.alertFilters.status === 'read' ? 'selected' : ''}>Read</option></select></label>
          <label class="alert-filter-search">Search<input type="search" name="q" value="${esc(state.alertFilters.q)}" placeholder="Search alert title or category"></label>
          <button type="submit" class="merchant-btn">${icon('search')} Filter</button>
        </form>
        <div class="merchant-table-wrap alert-table-wrap"><table class="merchant-table alert-table"><thead><tr><th>Alert</th><th>Category</th><th>Severity</th><th>Received</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="merchant-empty-cell">No notifications match these filters.</td></tr>'}</tbody></table></div>
        <p class="alert-safety-note">This list contains sample notifications in demo mode. Production alert generation, delivery, escalation, and retention must be handled by authenticated backend services.</p>
      </section>`;

    root.onsubmit = async (event) => {
      if (event.target.id === 'alertPreferencesForm') {
        event.preventDefault();
        const formData = new FormData(event.target);
        const next = Object.fromEntries(Object.keys(rules).map((key) => {
          const value = { enabled: formData.has(`enabled:${key}`), inApp: formData.has(`inApp:${key}`), email: formData.has(`email:${key}`) };
          for (const threshold of [rules[key].threshold, rules[key].secondaryThreshold].filter(Boolean)) {
            value[threshold.field] = Number(formData.get(`${key}.${threshold.field}`));
          }
          return [key, value];
        }));
        try {
          const result = await DataService.saveAlertPreferences(next);
          await renderAlertManagement();
          toast(result.demo ? 'Alert preferences saved for this demo session' : 'Alert preferences saved');
        } catch (error) {
          console.error(error);
          toast(error.message || 'Unable to save alert preferences');
        }
      } else if (event.target.id === 'alertFilters') {
        event.preventDefault();
        const formData = new FormData(event.target);
        state.alertFilters = {
          category: String(formData.get('category') || 'all'),
          status: String(formData.get('status') || 'all'),
          q: String(formData.get('q') || '').trim(),
        };
        renderAlertManagement().catch((error) => {
          console.error(error);
          toast('Unable to filter notifications');
        });
      }
    };
    root.onclick = async (event) => {
      const button = event.target.closest('[data-alert-action]');
      if (!button) return;
      try {
        if (button.dataset.alertAction === 'read') await DataService.markNotificationRead(button.dataset.alertId);
        else if (button.dataset.alertAction === 'read-all') await DataService.markAllNotificationsRead();
        else return;
        await Promise.all([renderAlertManagement(), renderNotifications()]);
        toast(button.dataset.alertAction === 'read-all' ? 'All notifications marked as read' : 'Notification marked as read');
      } catch (error) {
        console.error(error);
        toast(error.message || 'Unable to update notification status');
      }
    };
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

  $('#markRead').addEventListener('click', async () => {
    try {
      await DataService.markAllNotificationsRead();
      await renderNotifications();
      if (state.currentPage === 'alerts') await renderAlertManagement();
    } catch (error) {
      console.error(error);
      toast('Unable to mark notifications as read');
    }
  });

  $$('#rangeMenu [data-range]').forEach((b) => b.addEventListener('click', () => {
    $$('#rangeMenu [data-range]').forEach((x) => x.classList.toggle('is-selected', x === b));
    state.range = b.dataset.range; $('#rangeLabel').textContent = b.textContent;
    state.chartPeriod = state.range === '7d' ? 'week' : state.range === '90d' ? 'quarter' : 'month';
    const chartLabels = { week: 'This Week', month: 'This Month', quarter: 'This Quarter' };
    $('#chartRangeLabel').textContent = chartLabels[state.chartPeriod];
    $$('#chartRangeMenu [data-chart]').forEach((chartButton) => chartButton.classList.toggle('is-selected', chartButton.dataset.chart === state.chartPeriod));
    closeMenus();
    renderKpis();
    renderChart();
    renderPaymentDistribution();
  }));
  $$('#chartRangeMenu [data-chart]').forEach((b) => b.addEventListener('click', () => {
    $$('#chartRangeMenu [data-chart]').forEach((x) => x.classList.toggle('is-selected', x === b));
    state.chartPeriod = b.dataset.chart; $('#chartRangeLabel').textContent = b.textContent;
    state.range = state.chartPeriod === 'week' ? '7d' : state.chartPeriod === 'quarter' ? '90d' : '30d';
    $$('#rangeMenu [data-range]').forEach((rangeButton) => rangeButton.classList.toggle('is-selected', rangeButton.dataset.range === state.range));
    $('#rangeLabel').textContent = state.range === '7d' ? 'Last 7 Days' : state.range === '90d' ? 'Last 90 Days' : 'Last 30 Days';
    closeMenus();
    renderKpis();
    renderChart();
    renderPaymentDistribution();
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
    providers: 'Payment Provider Management', routing: 'Smart Routing', finance: 'Financial Management & Settlement Monitoring', reconciliation: 'Reconciliation Management', refunds: 'Refund & Dispute Management', merchants: 'Merchant Management', risk: 'Risk & Fraud Monitoring',
    transactions: 'Global Transaction Monitoring', approvals: 'Pending Approvals', 'admin-users': 'Admin User & Role Management',
    audit: 'Audit Logs & Security Center', alerts: 'Notification & Alert Management', profile: 'My Admin Profile', settings: 'Settings', monitor: 'System Monitor', activity: 'Recent Activity',
  };
  const PAGE_DESCRIPTIONS = {
    providers: 'Configure providers, routing, API credentials, transaction limits, and integration health.',
    merchants: 'Review merchant accounts and manage merchant onboarding.',
    routing: 'Configure provider priorities, payment method and amount rules, failover, and review routing performance.',
    finance: 'Monitor processed volume, fees, merchant payables, refunds, settlements, and reconciliation discrepancies.',
    reconciliation: 'Import provider transaction statements, compare records against the internal ledger, and resolve exceptions.',
    refunds: 'Review refund requests and reasons, monitor processing, investigate customer disputes, and maintain refund audit history.',
    risk: 'Monitor suspicious payment and login signals, investigate flagged activity, and record risk review outcomes.',
    transactions: 'Search, filter, and investigate platform transaction activity.',
    monitor: 'Review API availability, provider health, delivery pipelines, infrastructure, and sanitized operational logs.',
    'admin-users': 'Create admin accounts, assign least-privilege roles and permissions, configure access restrictions, and review sign-in security.',
    audit: 'Review administrative and authentication events, including prior and updated configuration values.',
    alerts: 'Configure alert categories, delivery preferences, and thresholds, then review recent notifications.',
    profile: 'Update your administrator profile information and profile picture.',
    settings: 'Manage dashboard display preferences and review important administrator security controls.',
    approvals: 'Review merchant and payment-provider items awaiting approval.',
  };
  function route() {
    const page = (location.hash || '#dashboard').slice(1);
    if (page === 'logout') {
      const finishLogout = () => {
        toast(DataService.isDemoMode() ? 'Signed out (demo)' : 'Signed out');
        history.replaceState(null, '', '#dashboard');
        route();
      };
      if (DataService.isDemoMode()) {
        DataService.recordAdminAuthEvent('logout').then(finishLogout).catch((error) => {
          console.error(error);
          toast('Unable to record admin sign-out');
        });
      } else finishLogout();
      return;
    }
    const previousPage = state.currentPage;
    state.currentPage = page;
    if (previousPage === 'risk' && page !== 'risk') state.riskDetailId = null;
    const isDash = page === 'dashboard' || !PAGE_TITLES[page];
    $$('.nav__item').forEach((a) => a.classList.toggle('is-active', a.dataset.page === (isDash ? 'dashboard' : page)));
    $('#view-dashboard').hidden = !isDash;
    $('#view-module').hidden = isDash;
    if (!isDash) {
      $('#moduleTitle').textContent = PAGE_TITLES[page];
      $('#moduleDescription').textContent = PAGE_DESCRIPTIONS[page] || 'This module is part of the next build phase. Its data model is already defined in database/.';
    }
    const isMerchantPage = page === 'merchants';
    const isProviderPage = page === 'providers';
    const isRoutingPage = page === 'routing';
    const isFinancePage = page === 'finance';
    const isReconciliationPage = page === 'reconciliation';
    const isRefundPage = page === 'refunds';
    const isTransactionPage = page === 'transactions';
    const isRiskPage = page === 'risk';
    const isSystemMonitorPage = page === 'monitor';
    const isAdminUsersPage = page === 'admin-users';
    const isAuditPage = page === 'audit';
    const isAlertsPage = page === 'alerts';
    const isAdminProfilePage = page === 'profile';
    const isSettingsPage = page === 'settings';
    $('#merchantManagement').hidden = !isMerchantPage;
    $('#providerManagement').hidden = !isProviderPage;
    $('#smartRoutingManagement').hidden = !isRoutingPage;
    $('#financialManagement').hidden = !isFinancePage;
    $('#reconciliationManagement').hidden = !isReconciliationPage;
    $('#refundManagement').hidden = !isRefundPage;
    $('#transactionMonitoring').hidden = !isTransactionPage;
    $('#riskManagement').hidden = !isRiskPage;
    $('#systemMonitor').hidden = !isSystemMonitorPage;
    $('#adminUserManagement').hidden = !isAdminUsersPage;
    $('#auditManagement').hidden = !isAuditPage;
    $('#alertManagement').hidden = !isAlertsPage;
    $('#adminProfileManagement').hidden = !isAdminProfilePage;
    $('#adminSettingsManagement').hidden = !isSettingsPage;
    $('.empty', $('#view-module')).hidden = isMerchantPage || isProviderPage || isRoutingPage || isFinancePage || isReconciliationPage || isRefundPage || isTransactionPage || isRiskPage || isSystemMonitorPage || isAdminUsersPage || isAuditPage || isAlertsPage || isAdminProfilePage || isSettingsPage;
    if (isMerchantPage) renderMerchantManagement().catch((err) => {
      console.error(err);
      toast('Failed to load merchant records');
    });
    if (isProviderPage) renderProviderManagement().catch((err) => {
      console.error(err);
      toast('Failed to load payment provider data');
    });
    if (isRoutingPage) renderSmartRouting().catch((err) => {
      console.error(err);
      toast('Failed to load smart routing configuration');
    });
    if (isFinancePage) renderFinancialManagement().catch((err) => {
      console.error(err);
      toast('Failed to load financial data');
    });
    if (isReconciliationPage) renderReconciliationManagement().catch((err) => {
      console.error(err);
      toast('Failed to load reconciliation data');
    });
    if (isRefundPage) renderRefundManagement().catch((err) => {
      console.error(err);
      toast('Failed to load refund and dispute data');
    });
    if (isTransactionPage) renderTransactionMonitoring().catch((err) => {
      console.error(err);
      toast('Failed to load transaction records');
    });
    if (isRiskPage) renderRiskManagement().catch((err) => {
      console.error(err);
      toast('Failed to load risk alerts');
    });
    if (isSystemMonitorPage) renderSystemMonitor().catch((err) => {
      console.error(err);
      toast('Failed to load system health data');
    });
    if (isAdminUsersPage) renderAdminUserManagement().catch((err) => {
      console.error(err);
      toast('Failed to load admin accounts');
    });
    if (isAuditPage) renderSecurityCenter().catch((err) => {
      console.error(err);
      toast('Failed to load security audit events');
    });
    if (isAlertsPage) renderAlertManagement().catch((err) => {
      console.error(err);
      toast('Failed to load notification and alert settings');
    });
    if (isAdminProfilePage) renderAdminProfile().catch((err) => {
      console.error(err);
      toast('Failed to load admin profile');
    });
    if (isSettingsPage) renderAdminSettings().catch((err) => {
      console.error(err);
      toast('Failed to load admin settings');
    });
    document.title = `${isDash ? 'Dashboard' : PAGE_TITLES[page]} · Purpose Gateway Admin`;
    if (isDash && state.chart) requestAnimationFrame(() => {
      state.chart.rerender();
      state.volumeChart && state.volumeChart.rerender();
    });
    if (isDash && previousPage && previousPage !== page) renderAudit().catch((err) => {
      console.error(err); toast('Failed to load audit log');
    });
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
    if (e.key === 'Escape') {
      closeMenus(); setDrawer(false);
      if ($('#merchantProfileDialog')) renderMerchantManagement().catch((err) => {
        console.error(err); toast('Unable to close merchant profile');
      });
      if ($('#providerConfigDialog')) {
        state.providerModalId = null;
        renderProviderManagement().catch((err) => {
          console.error(err); toast('Unable to close provider configuration');
        });
      }
      if ($('#transactionDetailsDialog')) renderTransactionMonitoring().catch((err) => {
        console.error(err); toast('Unable to close transaction details');
      });
      if ($('#refundDetailsDialog')) {
        state.refundDetailId = null;
        renderRefundManagement().catch((err) => {
          console.error(err); toast('Unable to close refund details');
        });
      }
      if ($('#riskDetailsDialog')) {
        state.riskDetailId = null;
        renderRiskManagement().catch((err) => {
          console.error(err); toast('Unable to close risk alert details');
        });
      }
    }
  });
  $('.search kbd').textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K';

  /* ---------- boot ---------- */
  syncThemeIcon();
  const loadDashboardData = () => Promise.all([renderKpis(), renderProviders(), renderChart(), renderPaymentDistribution(), renderDailyActivity(), renderMerchants(), renderRisk(), renderActivity(), renderAudit(), renderNotifications()]);
  const startDashboard = async () => {
    if (DataService.isDemoMode()) await DataService.recordAdminAuthEvent('login');
    try {
      const settings = await DataService.getAdminSettings();
      state.adminSettings = settings.settings;
      applyDashboardRange(settings.settings.defaultRange);
    } catch (error) {
      console.error(error);
      applyDashboardRange(state.adminSettings.defaultRange);
      toast('Unable to load saved preferences; using default display settings');
    }
    const adminProfile = await DataService.getMyAdminProfile();
    applyAdminIdentity(adminProfile);
    route();
    await loadDashboardData();
  };
  startDashboard()
    .catch((err) => { console.error(err); toast('Failed to load dashboard data'); });
})();
