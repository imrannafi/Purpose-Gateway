/* =========================================================
   Purpose Gateway — Data Service (mock layer)
   ---------------------------------------------------------
   This is the ONLY file the UI reads data from. Every method
   is async and returns plain objects shaped like the API DTOs
   documented in database/API_CONTRACT.md.

   Phase 2 (database integration): set `USE_MOCK = false` and
   point `API_BASE` at the backend. Each method already names
   the REST endpoint it maps to, so no UI code needs to change.
   ========================================================= */
(function (global) {
  'use strict';

  const USE_MOCK = true;
  const API_BASE = '/api/v1';
  const MOCK_LATENCY = 250; // ms, simulates network so loading states are exercised

  /* ---------- helpers ---------- */
  const delay = (v) => new Promise((r) => setTimeout(() => r(structuredCloneSafe(v)), MOCK_LATENCY));
  function structuredCloneSafe(v) { return JSON.parse(JSON.stringify(v)); }

  async function http(path, params) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    const res = await fetch(API_BASE + path + qs, { headers: { Accept: 'application/json' }, credentials: 'include' });
    if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
    return res.json();
  }

  // Deterministic pseudo-random so the mock chart looks the same on each load
  function seeded(seed) {
    let s = seed % 2147483647; if (s <= 0) s += 2147483646;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  }

  /* ---------- mock fixtures (mirror DB rows) ---------- */
  const KPIS = {
    '7d':  { totalTransactions: 29840,  txDelta: 4.1,  successRate: 98.9, successDelta: 0.2, totalRevenue: 592400,  revenueDelta: 6.4,  riskAlerts: 4,  riskDelta: -12.0 },
    '30d': { totalTransactions: 124850, txDelta: 12.5, successRate: 98.7, successDelta: 0.3, totalRevenue: 2475320, revenueDelta: 18.2, riskAlerts: 12, riskDelta: -20.0 },
    '90d': { totalTransactions: 351200, txDelta: 21.3, successRate: 98.4, successDelta: 0.6, totalRevenue: 7120880, revenueDelta: 27.9, riskAlerts: 37, riskDelta: -8.5 },
  };

  const SPARKS = {
    totalTransactions: [12, 14, 13, 17, 15, 19, 18, 24, 21, 26, 30, 28, 34],
    successRate:       [10, 12, 11, 13, 12, 15, 14, 16, 18, 17, 22, 24, 25],
    totalRevenue:      [10, 11, 13, 12, 14, 13, 16, 15, 18, 17, 20, 22, 26],
    riskAlerts:        [12, 13, 12, 15, 14, 18, 16, 15, 19, 17, 22, 20, 24],
  };

  const PROVIDERS = [
    { id: 'prv_bkash',      code: 'bkash',      name: 'bKash',      type: 'mfs',  status: 'online', uptime: 99.9, successRate: 99.1, avgLatencyMs: 412 },
    { id: 'prv_nagad',      code: 'nagad',      name: 'Nagad',      type: 'mfs',  status: 'online', uptime: 99.8, successRate: 98.6, avgLatencyMs: 455 },
    { id: 'prv_rocket',     code: 'rocket',     name: 'Rocket',     type: 'mfs',  status: 'online', uptime: 99.7, successRate: 98.2, avgLatencyMs: 520 },
    { id: 'prv_visa',       code: 'visa',       name: 'Visa',       type: 'card', status: 'online', uptime: 99.9, successRate: 99.3, avgLatencyMs: 380 },
    { id: 'prv_mastercard', code: 'mastercard', name: 'Mastercard', type: 'card', status: 'online', uptime: 99.8, successRate: 99.0, avgLatencyMs: 395 },
  ];

  const MERCHANT_STATS = { total: 2350, active: 2280, suspended: 70, pending: 0 };

  const RISK_SUMMARY = {
    openCount: 12,
    byType: [
      { type: 'suspicious_transaction', label: 'Suspicious Transaction', count: 5, severity: 'high' },
      { type: 'unusual_activity',       label: 'Unusual Activity',       count: 4, severity: 'high' },
      { type: 'multiple_failures',      label: 'Multiple Failures',      count: 3, severity: 'medium' },
    ],
  };

  const ACTIVITY = [
    { id: 'act_1', kind: 'transaction', title: 'New transaction from Rahim Ahmed', meta: '৳ 2,500 via bKash', status: 'success', createdAt: minutesAgo(2) },
    { id: 'act_2', kind: 'routing',     title: 'Routing rule updated: High Value Rule', meta: 'by Admin', status: 'updated', createdAt: minutesAgo(5) },
    { id: 'act_3', kind: 'risk',        title: 'Risk alert: Unusual transaction pattern', meta: '৳ 87,000 via Nagad', status: 'flagged', createdAt: minutesAgo(8) },
    { id: 'act_4', kind: 'merchant',    title: 'New merchant registered: Alpha Store', meta: '', status: 'active', createdAt: minutesAgo(120) },
  ];

  const AUDIT_LOGS = [
    { id: 'aud_1', createdAt: '2025-11-30T14:32:00+06:00', action: 'Updated Routing Rule',    actorName: 'Admin', ipAddress: '103.110.45.67' },
    { id: 'aud_2', createdAt: '2025-11-30T14:20:00+06:00', action: 'Suspended Merchant',      actorName: 'Admin', ipAddress: '103.110.45.67' },
    { id: 'aud_3', createdAt: '2025-11-30T13:55:00+06:00', action: 'Updated Provider Config', actorName: 'Admin', ipAddress: '103.110.45.67' },
    { id: 'aud_4', createdAt: '2025-11-30T13:40:00+06:00', action: 'Viewed Risk Alerts',      actorName: 'Admin', ipAddress: '103.110.45.67' },
  ];

  const NOTIFICATIONS = [
    { id: 'ntf_1', title: '3 high-severity risk alerts need review', createdAt: minutesAgo(8),   level: 'danger',  read: false },
    { id: 'ntf_2', title: 'Rocket latency above 500ms threshold',    createdAt: minutesAgo(22),  level: 'warning', read: false },
    { id: 'ntf_3', title: 'Monthly settlement report is ready',      createdAt: minutesAgo(180), level: 'info',    read: false },
  ];

  const SEARCH_INDEX = [
    { type: 'Merchant', label: 'Alpha Store', page: 'merchants' },
    { type: 'Merchant', label: 'Daraz Express', page: 'merchants' },
    { type: 'Merchant', label: 'Shohoz Tickets', page: 'merchants' },
    { type: 'Rule', label: 'High Value Rule', page: 'routing' },
    { type: 'Rule', label: 'Low Latency Fallback', page: 'routing' },
    { type: 'Provider', label: 'bKash', page: 'providers' },
    { type: 'Provider', label: 'Nagad', page: 'providers' },
    { type: 'Provider', label: 'Rocket', page: 'providers' },
    { type: 'Provider', label: 'Visa', page: 'providers' },
    { type: 'Provider', label: 'Mastercard', page: 'providers' },
    { type: 'Transaction', label: 'TXN-8F21A9 · ৳ 2,500 · Rahim Ahmed', page: 'dashboard' },
    { type: 'Transaction', label: 'TXN-77C0D2 · ৳ 87,000 · flagged', page: 'risk' },
    { type: 'Page', label: 'Audit Logs', page: 'audit' },
    { type: 'Page', label: 'System Monitor', page: 'monitor' },
    { type: 'Page', label: 'Settings', page: 'settings' },
  ];

  function minutesAgo(m) { return new Date(Date.now() - m * 60000).toISOString(); }

  /* Time-series generator: shaped to match the reference design */
  function buildSeries(range) {
    const cfg = {
      week:    { points: 7,  label: (d) => d.toLocaleDateString('en-US', { weekday: 'short' }), seed: 7 },
      month:   { points: 30, label: (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), seed: 30 },
      quarter: { points: 13, label: (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), seed: 90 },
    }[range] || {};
    const rnd = seeded(cfg.seed);
    const start = new Date(2025, 10, 1); // Nov 1, 2025
    const step = range === 'quarter' ? 7 : 1;
    const out = [];
    for (let i = 0; i < cfg.points; i++) {
      const t = i / (cfg.points - 1);
      const d = new Date(start); d.setDate(start.getDate() + i * step);
      // successful: S-curve rise (≈38k → ≈80k) with a small dip around 25–35%
      const base = 38 + 42 / (1 + Math.exp(-(t - .45) * 9)) - 5 * Math.exp(-Math.pow((t - .3) / .08, 2));
      const successful = Math.round((base + (rnd() - .5) * 5) * 1000);
      const pending = Math.round((20 + 12 * t + 5 * Math.sin(t * 9) + (rnd() - .5) * 4) * 1000);
      const failed = Math.round((11 + 6 * t + 3 * Math.sin(t * 11 + 1) + (rnd() - .5) * 3) * 1000);
      out.push({ date: d.toISOString().slice(0, 10), label: cfg.label(d), successful, failed, pending });
    }
    // Pin the highlighted value from the design (Nov 21 → 82.4k)
    if (range === 'month') {
      out[20].successful = 82400;
      out[19].successful = Math.round((out[18].successful + 82400) / 2);
      out[21].successful = Math.round((out[22].successful + 82400) / 2);
    }
    return out;
  }

  /* ---------- public API ---------- */
  const DataService = {
    /** GET /dashboard/kpis?range=30d */
    getKpis(range = '30d') {
      return USE_MOCK ? delay({ ...KPIS[range], sparks: SPARKS }) : http('/dashboard/kpis', { range });
    },
    /** GET /providers/health */
    getProviders() {
      return USE_MOCK ? delay(PROVIDERS) : http('/providers/health');
    },
    /** GET /analytics/transactions?period=month */
    getTransactionSeries(period = 'month') {
      return USE_MOCK ? delay(buildSeries(period)) : http('/analytics/transactions', { period });
    },
    /** GET /merchants/stats */
    getMerchantStats() {
      return USE_MOCK ? delay(MERCHANT_STATS) : http('/merchants/stats');
    },
    /** GET /risk-alerts/summary */
    getRiskSummary() {
      return USE_MOCK ? delay(RISK_SUMMARY) : http('/risk-alerts/summary');
    },
    /** GET /activity?limit=4 */
    getRecentActivity(limit = 4) {
      return USE_MOCK ? delay(ACTIVITY.slice(0, limit)) : http('/activity', { limit });
    },
    /** GET /audit-logs?limit=4 */
    getAuditLogs(limit = 4) {
      return USE_MOCK ? delay(AUDIT_LOGS.slice(0, limit)) : http('/audit-logs', { limit });
    },
    /** GET /notifications */
    getNotifications() {
      return USE_MOCK ? delay(NOTIFICATIONS) : http('/notifications');
    },
    /** POST /notifications/read-all */
    async markAllNotificationsRead() {
      if (USE_MOCK) { NOTIFICATIONS.forEach((n) => (n.read = true)); return delay({ ok: true }); }
      const res = await fetch(API_BASE + '/notifications/read-all', { method: 'POST', credentials: 'include' });
      return res.json();
    },
    /** GET /search?q= */
    search(q) {
      if (!USE_MOCK) return http('/search', { q });
      const s = q.trim().toLowerCase();
      return Promise.resolve(s ? SEARCH_INDEX.filter((r) => r.label.toLowerCase().includes(s) || r.type.toLowerCase().includes(s)).slice(0, 8) : []);
    },
  };

  global.DataService = DataService;
})(window);
