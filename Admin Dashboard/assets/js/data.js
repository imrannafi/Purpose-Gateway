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
  function isValidIPv4Range(value) {
    const [address, prefix] = String(value).split('/');
    const octets = address.split('.');
    return octets.length === 4
      && octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255)
      && (prefix === undefined || (/^\d{1,2}$/.test(prefix) && Number(prefix) <= 32));
  }

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
    '7d':  { totalTransactions: 29840,  successfulTransactions: 29407, failedTransactions: 323,  pendingTransactions: 110,  totalVolume: 14824500,  totalRefunds: 237,  txDelta: 4.1,  successRate: 98.9, successDelta: 0.2, totalRevenue: 592400,  revenueDelta: 6.4,  riskAlerts: 4,  riskDelta: -12.0 },
    '30d': { totalTransactions: 124850, successfulTransactions: 122844, failedTransactions: 1606, pendingTransactions: 400,  totalVolume: 61920750,  totalRefunds: 984,  txDelta: 12.5, successRate: 98.7, successDelta: 0.3, totalRevenue: 2475320, revenueDelta: 18.2, riskAlerts: 12, riskDelta: -20.0 },
    '90d': { totalTransactions: 351200, successfulTransactions: 344489, failedTransactions: 5511, pendingTransactions: 1200, totalVolume: 178520300, totalRefunds: 2682, txDelta: 21.3, successRate: 98.4, successDelta: 0.6, totalRevenue: 7120880, revenueDelta: 27.9, riskAlerts: 37, riskDelta: -8.5 },
  };

  const SPARKS = {
    totalTransactions: [12, 14, 13, 17, 15, 19, 18, 24, 21, 26, 30, 28, 34],
    successRate:       [10, 12, 11, 13, 12, 15, 14, 16, 18, 17, 22, 24, 25],
    totalRevenue:      [10, 11, 13, 12, 14, 13, 16, 15, 18, 17, 20, 22, 26],
    riskAlerts:        [12, 13, 12, 15, 14, 18, 16, 15, 19, 17, 22, 20, 24],
  };

  const PROVIDERS = [
    { id: 'prv_bkash', code: 'bkash', name: 'bKash', type: 'mfs', status: 'online', isEnabled: true, uptime: 99.9, successRate: 99.1, failureRate: 0.9, avgLatencyMs: 412, transactionCount: 40218, transactionVolume: 18542000, credentialsConfigured: true, apiBaseUrl: 'https://api.bkash.com', transactionLimit: 200000, dailyLimit: 5000000, priority: 'primary', fallbackProviderId: 'prv_nagad', logs: [{ at: '2026-11-25T00:22:00+06:00', level: 'success', message: 'Health check succeeded · 412 ms' }, { at: '2026-11-24T23:58:00+06:00', level: 'info', message: 'Credential validation completed' }] },
    { id: 'prv_nagad', code: 'nagad', name: 'Nagad', type: 'mfs', status: 'online', isEnabled: true, uptime: 99.8, successRate: 98.6, failureRate: 1.4, avgLatencyMs: 455, transactionCount: 28642, transactionVolume: 13267000, credentialsConfigured: true, apiBaseUrl: 'https://api.mynagad.com', transactionLimit: 200000, dailyLimit: 4000000, priority: 'fallback', fallbackProviderId: 'prv_rocket', logs: [{ at: '2026-11-25T00:20:00+06:00', level: 'success', message: 'Health check succeeded · 455 ms' }, { at: '2026-11-24T22:17:00+06:00', level: 'warning', message: 'Elevated response time detected · 690 ms' }] },
    { id: 'prv_rocket', code: 'rocket', name: 'Rocket', type: 'mfs', status: 'degraded', isEnabled: true, uptime: 99.7, successRate: 98.2, failureRate: 1.8, avgLatencyMs: 520, transactionCount: 15190, transactionVolume: 7642000, credentialsConfigured: true, apiBaseUrl: 'https://api.dutchbanglabank.com', transactionLimit: 150000, dailyLimit: 3000000, priority: 'fallback', fallbackProviderId: 'prv_upay', logs: [{ at: '2026-11-25T00:15:00+06:00', level: 'warning', message: 'Provider response degraded · 520 ms average' }, { at: '2026-11-24T21:36:00+06:00', level: 'error', message: 'Temporary upstream timeout · recovered' }] },
    { id: 'prv_upay', code: 'upay', name: 'Upay', type: 'mfs', status: 'online', isEnabled: true, uptime: 99.6, successRate: 98.8, failureRate: 1.2, avgLatencyMs: 468, transactionCount: 10280, transactionVolume: 4285000, credentialsConfigured: true, apiBaseUrl: 'https://api.upay.systems', transactionLimit: 150000, dailyLimit: 2500000, priority: 'fallback', fallbackProviderId: '', logs: [{ at: '2026-11-25T00:10:00+06:00', level: 'success', message: 'Health check succeeded · 468 ms' }] },
    { id: 'prv_visa', code: 'visa', name: 'Visa', type: 'card', status: 'online', isEnabled: true, uptime: 99.9, successRate: 99.3, failureRate: 0.7, avgLatencyMs: 380, transactionCount: 18760, transactionVolume: 20842000, credentialsConfigured: true, apiBaseUrl: 'https://api.visa.com', transactionLimit: 1000000, dailyLimit: 25000000, priority: 'primary', fallbackProviderId: 'prv_mastercard', logs: [{ at: '2026-11-25T00:25:00+06:00', level: 'success', message: 'Health check succeeded · 380 ms' }] },
    { id: 'prv_mastercard', code: 'mastercard', name: 'Mastercard', type: 'card', status: 'online', isEnabled: true, uptime: 99.8, successRate: 99.0, failureRate: 1, avgLatencyMs: 395, transactionCount: 17410, transactionVolume: 19675000, credentialsConfigured: true, apiBaseUrl: 'https://api.mastercard.com', transactionLimit: 1000000, dailyLimit: 25000000, priority: 'fallback', fallbackProviderId: '', logs: [{ at: '2026-11-25T00:18:00+06:00', level: 'success', message: 'Health check succeeded · 395 ms' }] },
  ];

  const ROUTING_CONFIG = {
    autoFailover: true,
    rules: [
      { id: 'route_bkash', method: 'bkash', minAmount: 0, maxAmount: 50000, primaryProviderId: 'prv_bkash', fallbackProviderId: 'prv_nagad' },
      { id: 'route_bkash_high', method: 'bkash', minAmount: 50001, maxAmount: null, primaryProviderId: 'prv_bkash', fallbackProviderId: 'prv_nagad' },
      { id: 'route_nagad', method: 'nagad', minAmount: 0, maxAmount: null, primaryProviderId: 'prv_nagad', fallbackProviderId: 'prv_rocket' },
      { id: 'route_rocket', method: 'rocket', minAmount: 0, maxAmount: null, primaryProviderId: 'prv_rocket', fallbackProviderId: 'prv_upay' },
      { id: 'route_upay', method: 'upay', minAmount: 0, maxAmount: null, primaryProviderId: 'prv_upay', fallbackProviderId: 'prv_rocket' },
      { id: 'route_visa', method: 'visa', minAmount: 0, maxAmount: null, primaryProviderId: 'prv_visa', fallbackProviderId: 'prv_mastercard' },
      { id: 'route_mastercard', method: 'mastercard', minAmount: 0, maxAmount: null, primaryProviderId: 'prv_mastercard', fallbackProviderId: 'prv_visa' },
    ],
  };
  const ROUTING_DECISIONS = [
    { at: '2026-11-25T00:44:00+06:00', transactionId: 'TXN-8F21A9', method: 'bKash', amount: 2500, primaryProvider: 'bKash', selectedProvider: 'bKash', outcome: 'Primary selected' },
    { at: '2026-11-25T00:41:00+06:00', transactionId: 'TXN-77C0D2', method: 'Nagad', amount: 87000, primaryProvider: 'Nagad', selectedProvider: 'Nagad', outcome: 'Primary selected' },
    { at: '2026-11-25T00:38:00+06:00', transactionId: 'TXN-4EF200', method: 'Visa', amount: 31200, primaryProvider: 'Visa', selectedProvider: 'Visa', outcome: 'Provider declined' },
    { at: '2026-11-25T00:35:00+06:00', transactionId: 'TXN-26C180', method: 'Rocket', amount: 5400, primaryProvider: 'Rocket', selectedProvider: 'Rocket', outcome: 'Fallback available' },
    { at: '2026-11-25T00:31:00+06:00', transactionId: 'TXN-921B70', method: 'Visa', amount: 54900, primaryProvider: 'Visa', selectedProvider: 'Visa', outcome: 'Primary selected' },
  ];

  const FINANCIAL_SUMMARY = {
    '7d': { processedVolume: 18425000, platformFees: 184250, providerFees: 276375, merchantPayables: 17679875, refundAmount: 284500, pendingSettlementAmount: 4280000 },
    '30d': { processedVolume: 76284000, platformFees: 762840, providerFees: 1144260, merchantPayables: 73092400, refundAmount: 1284500, pendingSettlementAmount: 9625000 },
    '90d': { processedVolume: 218475000, platformFees: 2184750, providerFees: 3277125, merchantPayables: 209165625, refundAmount: 3847500, pendingSettlementAmount: 18420000 },
  };
  const SETTLEMENTS = [
    { id: 'STL-20261125-014', merchantId: 'mrc_1001', merchantName: 'Alpha Store', providerId: 'prv_bkash', providerName: 'bKash', period: '2026-11-25', processedVolume: 842500, platformFee: 8425, providerFee: 12638, refundAmount: 12500, payableAmount: 816562, status: 'pending', expectedAmount: 816562, settledAmount: 0, discrepancyReason: '' },
    { id: 'STL-20261125-013', merchantId: 'mrc_1002', merchantName: 'Daraz Express', providerId: 'prv_nagad', providerName: 'Nagad', period: '2026-11-25', processedVolume: 1240000, platformFee: 12400, providerFee: 18600, refundAmount: 0, payableAmount: 1209000, status: 'pending', expectedAmount: 1209000, settledAmount: 0, discrepancyReason: '' },
    { id: 'STL-20261124-027', merchantId: 'mrc_1003', merchantName: 'Shohoz Tickets', providerId: 'prv_rocket', providerName: 'Rocket', period: '2026-11-24', processedVolume: 628400, platformFee: 6284, providerFee: 9426, refundAmount: 8400, payableAmount: 604290, status: 'discrepancy', expectedAmount: 604290, settledAmount: 596290, discrepancyReason: 'Provider settlement is BDT 8,000 below the expected merchant payable.' },
    { id: 'STL-20261124-026', merchantId: 'mrc_1004', merchantName: 'Green Basket', providerId: 'prv_bkash', providerName: 'bKash', period: '2026-11-24', processedVolume: 518200, platformFee: 5182, providerFee: 7773, refundAmount: 0, payableAmount: 505245, status: 'settled', expectedAmount: 505245, settledAmount: 505245, discrepancyReason: '' },
    { id: 'STL-20261124-025', merchantId: 'mrc_1005', merchantName: 'Pixel Point', providerId: 'prv_visa', providerName: 'Visa', period: '2026-11-24', processedVolume: 975000, platformFee: 9750, providerFee: 19500, refundAmount: 32000, payableAmount: 893750, status: 'settled', expectedAmount: 893750, settledAmount: 893750, discrepancyReason: '' },
    { id: 'STL-20261123-019', merchantId: 'mrc_1002', merchantName: 'Daraz Express', providerId: 'prv_mastercard', providerName: 'Mastercard', period: '2026-11-23', processedVolume: 1462000, platformFee: 14620, providerFee: 29240, refundAmount: 0, payableAmount: 1418140, status: 'settled', expectedAmount: 1418140, settledAmount: 1418140, discrepancyReason: '' },
    { id: 'STL-20261123-018', merchantId: 'mrc_1003', merchantName: 'Shohoz Tickets', providerId: 'prv_rocket', providerName: 'Rocket', period: '2026-11-23', processedVolume: 384600, platformFee: 3846, providerFee: 5769, refundAmount: 15400, payableAmount: 359585, status: 'processing', expectedAmount: 359585, settledAmount: 0, discrepancyReason: '' },
    { id: 'STL-20261122-011', merchantId: 'mrc_1001', merchantName: 'Alpha Store', providerId: 'prv_bkash', providerName: 'bKash', period: '2026-11-22', processedVolume: 692000, platformFee: 6920, providerFee: 10380, refundAmount: 0, payableAmount: 674700, status: 'discrepancy', expectedAmount: 674700, settledAmount: 684700, discrepancyReason: 'Provider settlement is BDT 10,000 above the expected merchant payable.' },
    { id: 'STL-20261121-008', merchantId: 'mrc_1005', merchantName: 'Pixel Point', providerId: 'prv_visa', providerName: 'Visa', period: '2026-11-21', processedVolume: 1245000, platformFee: 12450, providerFee: 24900, refundAmount: 0, payableAmount: 1207650, status: 'settled', expectedAmount: 1207650, settledAmount: 1207650, discrepancyReason: '' },
    { id: 'STL-20261120-004', merchantId: 'mrc_1004', merchantName: 'Green Basket', providerId: 'prv_upay', providerName: 'Upay', period: '2026-11-20', processedVolume: 286400, platformFee: 2864, providerFee: 4296, refundAmount: 6400, payableAmount: 272840, status: 'pending', expectedAmount: 272840, settledAmount: 0, discrepancyReason: '' },
  ];

  const REFUNDS = [
    { id: 'RFD-20261125-081', transactionId: 'TXN-8F21A9', merchantId: 'mrc_1001', merchantName: 'Alpha Store', providerName: 'bKash', customer: 'Rahim Ahmed', amount: 1250, currency: 'BDT', reason: 'Duplicate charge reported by customer', status: 'requested', requestedAt: minutesAgo(18), dispute: { status: 'open', reason: 'Customer says two debits appear on the wallet statement.' }, notes: [], history: [{ at: minutesAgo(18), actor: 'Merchant', action: 'Refund requested', note: 'Partial refund requested for duplicate charge.' }] },
    { id: 'RFD-20261125-080', transactionId: 'TXN-77C0D2', merchantId: 'mrc_1002', merchantName: 'Daraz Express', providerName: 'Nagad', customer: 'Nusrat Jahan', amount: 87000, currency: 'BDT', reason: 'Order cancelled before fulfillment', status: 'requested', requestedAt: minutesAgo(42), dispute: { status: 'none', reason: '' }, notes: [], history: [{ at: minutesAgo(42), actor: 'Merchant', action: 'Refund requested', note: 'Merchant reports order cancelled before shipment.' }] },
    { id: 'RFD-20261125-078', transactionId: 'TXN-555D91', merchantId: 'mrc_1002', merchantName: 'Daraz Express', providerName: 'Mastercard', customer: 'Farzana Islam', amount: 12900, currency: 'BDT', reason: 'Item not received', status: 'processing', requestedAt: minutesAgo(225), dispute: { status: 'under_review', reason: 'Cardholder dispute received; delivery confirmation requested.' }, notes: [{ at: minutesAgo(60), actor: 'Admin', text: 'Requested shipping confirmation from merchant.' }], history: [{ at: minutesAgo(225), actor: 'Merchant', action: 'Refund requested', note: 'Customer reports the order was not delivered.' }, { at: minutesAgo(190), actor: 'Admin', action: 'Refund approved', note: 'Approved after initial review.' }, { at: minutesAgo(185), actor: 'System', action: 'Refund processing', note: 'Submitted to provider; awaiting confirmation.' }] },
    { id: 'RFD-20261124-066', transactionId: 'TXN-4EF200', merchantId: 'mrc_1003', merchantName: 'Shohoz Tickets', providerName: 'Visa', customer: 'Nabila Karim', amount: 31200, currency: 'BDT', reason: 'Service cancelled by merchant', status: 'failed', requestedAt: minutesAgo(390), dispute: { status: 'open', reason: 'Issuer requested proof of cancellation and refund.' }, notes: [{ at: minutesAgo(240), actor: 'Admin', text: 'Provider response indicated a temporary reversal failure; retry after settlement window.' }], history: [{ at: minutesAgo(390), actor: 'Merchant', action: 'Refund requested', note: 'Service cancelled; full refund requested.' }, { at: minutesAgo(360), actor: 'Admin', action: 'Refund approved', note: 'Cancellation verified.' }, { at: minutesAgo(355), actor: 'System', action: 'Refund failed', note: 'Provider could not complete reversal; manual review required.' }] },
    { id: 'RFD-20261124-061', transactionId: 'TXN-921B70', merchantId: 'mrc_1005', merchantName: 'Pixel Point', providerName: 'Visa', customer: 'Sakib Chowdhury', amount: 54900, currency: 'BDT', reason: 'Customer returned purchase', status: 'completed', requestedAt: minutesAgo(720), dispute: { status: 'none', reason: '' }, notes: [], history: [{ at: minutesAgo(720), actor: 'Merchant', action: 'Refund requested', note: 'Return received and inspected.' }, { at: minutesAgo(700), actor: 'Admin', action: 'Refund approved', note: 'Return policy requirements met.' }, { at: minutesAgo(680), actor: 'System', action: 'Refund completed', note: 'Provider confirmed refund.' }] },
    { id: 'RFD-20261123-052', transactionId: 'TXN-11A4F8', merchantId: 'mrc_1004', merchantName: 'Green Basket', providerName: 'bKash', customer: 'Maliha Akter', amount: 1850, currency: 'BDT', reason: 'Incorrect item supplied', status: 'rejected', requestedAt: minutesAgo(1320), dispute: { status: 'none', reason: '' }, notes: [], history: [{ at: minutesAgo(1320), actor: 'Merchant', action: 'Refund requested', note: 'Merchant evidence showed the delivered item matched the order.' }, { at: minutesAgo(1290), actor: 'Admin', action: 'Refund rejected', note: 'Insufficient evidence for refund under merchant policy.' }] },
    { id: 'RFD-20261122-044', transactionId: 'TXN-330A65', merchantId: 'mrc_1005', merchantName: 'Pixel Point', providerName: 'Nagad', customer: 'Adnan Hossain', amount: 2400, currency: 'BDT', reason: 'Order partially fulfilled', status: 'approved', requestedAt: minutesAgo(2880), dispute: { status: 'none', reason: '' }, notes: [], history: [{ at: minutesAgo(2880), actor: 'Merchant', action: 'Refund requested', note: 'Partial refund requested for an unavailable item.' }, { at: minutesAgo(2800), actor: 'Admin', action: 'Refund approved', note: 'Inventory shortage confirmed.' }] },
  ];
  const REFUND_AUDIT = REFUNDS.flatMap((refund) => refund.history.map((entry, index) => ({
    id: `${refund.id}-${index}`, refundId: refund.id, transactionId: refund.transactionId,
    at: entry.at, actor: entry.actor, action: entry.action, note: entry.note,
  }))).sort((a, b) => new Date(b.at) - new Date(a.at));

  const MERCHANT_STATS = { total: 2350, active: 2280, suspended: 70, pending: 0 };

  const ADMIN_ROLES = ['Super Admin', 'Operations Admin', 'Finance Admin', 'Support Admin', 'Read-only Analyst'];
  const ADMIN_PERMISSIONS = [
    { key: 'manage_admins', label: 'Manage admin accounts' },
    { key: 'manage_merchants', label: 'Manage merchants' },
    { key: 'manage_providers', label: 'Manage payment providers' },
    { key: 'view_transactions', label: 'View transactions' },
    { key: 'manage_refunds', label: 'Manage refunds and disputes' },
    { key: 'manage_finance', label: 'Manage settlements and finance' },
    { key: 'manage_risk', label: 'Review risk alerts' },
    { key: 'view_audit_logs', label: 'View audit logs and system health' },
  ];
  const ADMIN_USERS = [
    {
      id: 'adm_1001', name: 'Ayesha Rahman', email: 'ayesha.rahman@purposepay.bd', role: 'Super Admin',
      jobTitle: 'Platform Administrator', phone: '', avatarDataUrl: '',
      status: 'active', twoFactorEnabled: true, requireApprovedNetwork: true, allowedIpRanges: ['103.110.45.0/24'],
      permissions: ADMIN_PERMISSIONS.map((permission) => permission.key),
      loginHistory: [
        { at: minutesAgo(12), location: 'Dhaka, Bangladesh', ipAddress: '103.110.45.**', device: 'Chrome · Windows', outcome: 'Success', twoFactor: true },
        { at: minutesAgo(740), location: 'Dhaka, Bangladesh', ipAddress: '103.110.45.**', device: 'Chrome · Windows', outcome: 'Success', twoFactor: true },
        { at: minutesAgo(2160), location: 'Chattogram, Bangladesh', ipAddress: '103.110.45.**', device: 'Safari · iPhone', outcome: 'Failed · invalid password', twoFactor: false },
      ],
    },
    {
      id: 'adm_1002', name: 'Nabil Hasan', email: 'nabil.hasan@purposepay.bd', role: 'Operations Admin',
      status: 'active', twoFactorEnabled: true, requireApprovedNetwork: false, allowedIpRanges: [],
      permissions: ['manage_merchants', 'manage_providers', 'view_transactions', 'manage_risk', 'view_audit_logs'],
      loginHistory: [
        { at: minutesAgo(48), location: 'Dhaka, Bangladesh', ipAddress: '103.110.46.**', device: 'Edge · Windows', outcome: 'Success', twoFactor: true },
        { at: minutesAgo(1980), location: 'Dhaka, Bangladesh', ipAddress: '103.110.46.**', device: 'Edge · Windows', outcome: 'Success', twoFactor: true },
      ],
    },
    {
      id: 'adm_1003', name: 'Farhana Islam', email: 'farhana.islam@purposepay.bd', role: 'Finance Admin',
      status: 'active', twoFactorEnabled: false, requireApprovedNetwork: true, allowedIpRanges: ['103.110.45.0/24'],
      permissions: ['view_transactions', 'manage_refunds', 'manage_finance', 'view_audit_logs'],
      loginHistory: [
        { at: minutesAgo(156), location: 'Dhaka, Bangladesh', ipAddress: '103.110.45.**', device: 'Chrome · macOS', outcome: 'Success', twoFactor: false },
        { at: minutesAgo(3030), location: 'Dhaka, Bangladesh', ipAddress: '103.110.45.**', device: 'Chrome · macOS', outcome: 'Success', twoFactor: false },
      ],
    },
    {
      id: 'adm_1004', name: 'Tanvir Ahmed', email: 'tanvir.ahmed@purposepay.bd', role: 'Support Admin',
      status: 'inactive', twoFactorEnabled: true, requireApprovedNetwork: false, allowedIpRanges: [],
      permissions: ['view_transactions', 'manage_refunds', 'manage_risk'],
      loginHistory: [
        { at: minutesAgo(11200), location: 'Sylhet, Bangladesh', ipAddress: '103.110.48.**', device: 'Chrome · Android', outcome: 'Success', twoFactor: true },
      ],
    },
    {
      id: 'adm_1005', name: 'Maliha Akter', email: 'maliha.akter@purposepay.bd', role: 'Read-only Analyst',
      status: 'active', twoFactorEnabled: true, requireApprovedNetwork: false, allowedIpRanges: [],
      permissions: ['view_transactions', 'view_audit_logs'],
      loginHistory: [
        { at: minutesAgo(260), location: 'Dhaka, Bangladesh', ipAddress: '103.110.49.**', device: 'Firefox · Linux', outcome: 'Success', twoFactor: true },
      ],
    },
  ];

  const MERCHANTS = [
    {
      id: 'mrc_1001', name: 'Alpha Store', category: 'Retail', owner: 'Ayesha Rahman',
      email: 'accounts@alphastore.bd', phone: '+880 17•• ••• 241', businessId: 'RJSC-2024-01842',
      joinedAt: '2025-08-12', status: 'active', applicationStatus: 'approved', verificationStatus: 'verified',
      integrationStatus: 'connected', transactionLimit: 500000, dailyLimit: 2000000,
      permissions: ['view_transactions', 'accept_payments', 'issue_refunds'],
      performance: { transactions: 1284, volume: 2846500, successRate: 98.6 },
      transactions: [
        { id: 'TXN-A81F20', date: '2025-11-24T11:42:00+06:00', amount: 12500, method: 'bKash', status: 'successful' },
        { id: 'TXN-A81E91', date: '2025-11-23T16:08:00+06:00', amount: 4200, method: 'Visa', status: 'failed' },
        { id: 'TXN-A81D48', date: '2025-11-22T09:18:00+06:00', amount: 7800, method: 'Nagad', status: 'successful' },
      ],
    },
    {
      id: 'mrc_1002', name: 'Daraz Express', category: 'E-commerce', owner: 'Nabil Hasan',
      email: 'finance@darazexpress.bd', phone: '+880 18•• ••• 506', businessId: 'RJSC-2023-00917',
      joinedAt: '2025-05-04', status: 'active', applicationStatus: 'approved', verificationStatus: 'verified',
      integrationStatus: 'connected', transactionLimit: 1000000, dailyLimit: 5000000,
      permissions: ['view_transactions', 'accept_payments', 'issue_refunds', 'manage_webhooks'],
      performance: { transactions: 9832, volume: 18420300, successRate: 99.2 },
      transactions: [
        { id: 'TXN-D27C82', date: '2025-11-24T13:22:00+06:00', amount: 36500, method: 'Mastercard', status: 'successful' },
        { id: 'TXN-D27B14', date: '2025-11-23T19:41:00+06:00', amount: 8900, method: 'bKash', status: 'successful' },
        { id: 'TXN-D279A0', date: '2025-11-22T10:52:00+06:00', amount: 15300, method: 'Nagad', status: 'failed' },
      ],
    },
    {
      id: 'mrc_1003', name: 'Shohoz Tickets', category: 'Travel', owner: 'Farhan Kabir',
      email: 'payments@shohoztickets.bd', phone: '+880 16•• ••• 118', businessId: 'RJSC-2022-04103',
      joinedAt: '2025-03-19', status: 'active', applicationStatus: 'approved', verificationStatus: 'pending',
      integrationStatus: 'pending', transactionLimit: 250000, dailyLimit: 1000000,
      permissions: ['view_transactions', 'accept_payments'],
      performance: { transactions: 3487, volume: 7264000, successRate: 96.8 },
      transactions: [
        { id: 'TXN-S55B20', date: '2025-11-24T08:18:00+06:00', amount: 2200, method: 'Rocket', status: 'successful' },
        { id: 'TXN-S55A07', date: '2025-11-23T15:22:00+06:00', amount: 18700, method: 'Visa', status: 'failed' },
        { id: 'TXN-S559E1', date: '2025-11-22T12:06:00+06:00', amount: 6500, method: 'bKash', status: 'successful' },
      ],
    },
    {
      id: 'mrc_1004', name: 'Green Basket', category: 'Grocery', owner: 'Samira Islam',
      email: 'hello@greenbasket.bd', phone: '+880 19•• ••• 883', businessId: 'RJSC-2024-02775',
      joinedAt: '2025-09-10', status: 'suspended', applicationStatus: 'approved', verificationStatus: 'verified',
      integrationStatus: 'disconnected', transactionLimit: 100000, dailyLimit: 500000,
      permissions: ['view_transactions'],
      performance: { transactions: 642, volume: 928400, successRate: 94.1 },
      transactions: [
        { id: 'TXN-G19A34', date: '2025-11-20T14:12:00+06:00', amount: 1350, method: 'Nagad', status: 'successful' },
        { id: 'TXN-G19911', date: '2025-11-19T10:08:00+06:00', amount: 4200, method: 'bKash', status: 'failed' },
      ],
    },
    {
      id: 'mrc_1005', name: 'Pixel Point', category: 'Electronics', owner: 'Imran Chowdhury',
      email: 'ops@pixelpoint.bd', phone: '+880 15•• ••• 792', businessId: 'RJSC-2023-03651',
      joinedAt: '2025-07-28', status: 'active', applicationStatus: 'approved', verificationStatus: 'verified',
      integrationStatus: 'attention', transactionLimit: 400000, dailyLimit: 1500000,
      permissions: ['view_transactions', 'accept_payments', 'manage_webhooks'],
      performance: { transactions: 2156, volume: 5186000, successRate: 97.4 },
      transactions: [
        { id: 'TXN-P04D52', date: '2025-11-24T17:02:00+06:00', amount: 54900, method: 'Visa', status: 'successful' },
        { id: 'TXN-P04C18', date: '2025-11-23T14:33:00+06:00', amount: 11200, method: 'Mastercard', status: 'failed' },
      ],
    },
    {
      id: 'mrc_1006', name: 'Nirapod Health', category: 'Healthcare', owner: 'Dr. Tania Sultana',
      email: 'admin@nirapodhealth.bd', phone: '+880 13•• ••• 469', businessId: 'RJSC-2025-00614',
      joinedAt: '2025-11-22', status: 'pending', applicationStatus: 'pending', verificationStatus: 'pending',
      integrationStatus: 'not_started', transactionLimit: 100000, dailyLimit: 300000,
      permissions: ['view_transactions', 'accept_payments'],
      performance: { transactions: 0, volume: 0, successRate: 0 }, transactions: [],
    },
    {
      id: 'mrc_1007', name: 'Riverstone Cafe', category: 'Food & Beverage', owner: 'Mahmud Karim',
      email: 'team@riverstonecafe.bd', phone: '+880 14•• ••• 923', businessId: 'RJSC-2025-00629',
      joinedAt: '2025-11-24', status: 'pending', applicationStatus: 'pending', verificationStatus: 'pending',
      integrationStatus: 'not_started', transactionLimit: 100000, dailyLimit: 300000,
      permissions: ['view_transactions', 'accept_payments'],
      performance: { transactions: 0, volume: 0, successRate: 0 }, transactions: [],
    },
  ];

  const RISK_ALERTS = [
    { id: 'RSK-20261125-014', type: 'repeated_failed_transactions', title: 'Repeated failed transactions', severity: 'high', status: 'open', createdAt: minutesAgo(6), merchantId: 'mrc_1003', merchantName: 'Shohoz Tickets', transactionId: 'TXN-26C180', amount: 5400, paymentMethod: 'Rocket', summary: 'Multiple payment attempts for the same order failed in a short period.', evidence: ['4 failed attempts for order ORD-S6124 within 12 minutes.', 'Two attempts share the same amount and payment method.', 'Latest provider response: insufficient funds.'], recommendation: 'Review the failed attempts and confirm whether retries are expected before contacting the merchant.' },
    { id: 'RSK-20261125-013', type: 'possible_duplicate_payment', title: 'Possible duplicate payment', severity: 'critical', status: 'open', createdAt: minutesAgo(14), merchantId: 'mrc_1003', merchantName: 'Shohoz Tickets', transactionId: 'TXN-26C181', amount: 5400, paymentMethod: 'Rocket', summary: 'Two transactions share a merchant order reference and amount; settlement is not yet confirmed.', evidence: ['Transactions TXN-26C180 and TXN-26C181 match order ORD-S6124.', 'Both attempts are for BDT 5,400 using Rocket.', 'One attempt is failed and one remains pending.'], recommendation: 'Check provider settlement records and transaction lifecycle before deciding whether a customer was charged twice.' },
    { id: 'RSK-20261125-012', type: 'unusual_transaction_amount', title: 'Unusual transaction amount', severity: 'high', status: 'investigating', createdAt: minutesAgo(27), merchantId: 'mrc_1002', merchantName: 'Daraz Express', transactionId: 'TXN-77C0D2', amount: 87000, paymentMethod: 'Nagad', summary: 'Transaction amount is substantially above this merchant’s recent typical range.', evidence: ['Amount is BDT 87,000.', 'Amount is 4.2× the merchant’s 30-day median.', 'Provider authorization timed out; payment outcome requires confirmation.'], recommendation: 'Verify the order and compare against the merchant’s transaction and settlement history.' },
    { id: 'RSK-20261125-011', type: 'unusual_transaction_frequency', title: 'Unusual transaction frequency', severity: 'medium', status: 'open', createdAt: minutesAgo(39), merchantId: 'mrc_1001', merchantName: 'Alpha Store', transactionId: 'TXN-8F21A9', amount: 2500, paymentMethod: 'bKash', summary: 'Transaction attempts from a masked customer identifier are arriving more frequently than usual.', evidence: ['9 attempts observed in 5 minutes.', 'Recent baseline is 2 attempts per 5-minute window.', 'Attempts include both successful and failed outcomes.'], recommendation: 'Review the linked activity and contact the merchant if this pattern is not expected.' },
    { id: 'RSK-20261125-010', type: 'suspicious_merchant_activity', title: 'Suspicious merchant activity', severity: 'high', status: 'open', createdAt: minutesAgo(53), merchantId: 'mrc_1005', merchantName: 'Pixel Point', transactionId: 'TXN-921B70', amount: 54900, paymentMethod: 'Visa', summary: 'Merchant payment performance has changed sharply compared with its recent baseline.', evidence: ['Failure rate increased from 2.6% to 11.8% over the latest hour.', 'Several high-value attempts occurred outside the merchant’s typical pattern.', 'No account restriction has been applied automatically.'], recommendation: 'Review merchant profile, recent transactions, and integration status before taking account action.' },
    { id: 'RSK-20261125-009', type: 'unusual_login_attempts', title: 'Unusual login attempts', severity: 'critical', status: 'open', createdAt: minutesAgo(68), merchantId: 'mrc_1004', merchantName: 'Green Basket', transactionId: '', amount: 0, paymentMethod: 'Admin portal', summary: 'Repeated unsuccessful sign-in attempts were detected for a merchant account.', evidence: ['12 unsuccessful sign-in attempts within 8 minutes.', 'Attempts originated from multiple network locations.', 'Account remains active; no automatic lock was applied by this demo.'], recommendation: 'Verify the account owner through the approved support process and review authentication logs.' },
    { id: 'RSK-20261124-008', type: 'possible_duplicate_payment', title: 'Possible duplicate payment', severity: 'medium', status: 'resolved', createdAt: minutesAgo(980), merchantId: 'mrc_1004', merchantName: 'Green Basket', transactionId: 'TXN-11A4F8', amount: 1850, paymentMethod: 'bKash', summary: 'Repeated order reference was reviewed against provider settlement records.', evidence: ['Two requests shared the same order reference.', 'Provider settlement confirmed one captured payment only.', 'Merchant confirmed the second request was a retry.'], recommendation: 'No further action required; retain the alert for audit history.' },
  ];

  const SYSTEM_HEALTH = {
    api: { name: 'Core API', status: 'green', uptime: 99.98, averageResponseMs: 186, p95ResponseMs: 342, requestsPerMinute: 1842, failedRequests24h: 24 },
    database: { name: 'Primary database', status: 'green', uptime: 99.99, connections: 42, connectionLimit: 100, replicationLagMs: 38 },
    webhook: { name: 'Webhook delivery', status: 'yellow', deliveryRate: 98.7, pending: 14, failed24h: 6, averageDeliveryMs: 428 },
    jobs: { name: 'Background jobs', status: 'yellow', queued: 8, running: 3, failed24h: 2, oldestQueuedMinutes: 7 },
    backgroundJobs: [
      { id: 'job_201', name: 'Settlement reconciliation', queue: 'finance', status: 'running', lastRunAt: minutesAgo(2), durationMs: 842 },
      { id: 'job_198', name: 'Webhook retry dispatcher', queue: 'delivery', status: 'queued', lastRunAt: minutesAgo(5), durationMs: 0 },
      { id: 'job_193', name: 'Provider health probe', queue: 'monitoring', status: 'completed', lastRunAt: minutesAgo(7), durationMs: 318 },
      { id: 'job_188', name: 'Daily merchant summary', queue: 'reports', status: 'failed', lastRunAt: minutesAgo(22), durationMs: 5021 },
    ],
    servers: [
      { id: 'app-node-01', name: 'Application node 01', status: 'green', cpuPercent: 38, memoryPercent: 61, diskPercent: 44 },
      { id: 'app-node-02', name: 'Application node 02', status: 'yellow', cpuPercent: 76, memoryPercent: 82, diskPercent: 49 },
      { id: 'worker-node-01', name: 'Worker node 01', status: 'green', cpuPercent: 42, memoryPercent: 58, diskPercent: 37 },
    ],
    failedRequests: [
      { id: 'req_01JCS8F2', at: minutesAgo(4), method: 'POST', route: '/api/v1/transactions', statusCode: 502, durationMs: 1204, requestId: 'req_01JCS8F2', message: 'Upstream provider timeout' },
      { id: 'req_01JCS7D1', at: minutesAgo(19), method: 'GET', route: '/api/v1/providers/health', statusCode: 503, durationMs: 892, requestId: 'req_01JCS7D1', message: 'Provider health check unavailable' },
      { id: 'req_01JCS6A9', at: minutesAgo(46), method: 'POST', route: '/api/v1/webhooks/dispatch', statusCode: 504, durationMs: 5000, requestId: 'req_01JCS6A9', message: 'Delivery attempt exceeded timeout' },
      { id: 'req_01JCS4B6', at: minutesAgo(92), method: 'POST', route: '/api/v1/refunds', statusCode: 502, durationMs: 1340, requestId: 'req_01JCS4B6', message: 'Provider connection reset' },
    ],
    webhooks: [
      { id: 'wh_8041', event: 'payment.succeeded', destination: 'merchant-•••-01', status: 'delivered', attempts: 1, durationMs: 214, updatedAt: minutesAgo(2) },
      { id: 'wh_8038', event: 'refund.updated', destination: 'merchant-•••-14', status: 'retrying', attempts: 3, durationMs: 5000, updatedAt: minutesAgo(11) },
      { id: 'wh_8029', event: 'payment.failed', destination: 'merchant-•••-07', status: 'failed', attempts: 5, durationMs: 5000, updatedAt: minutesAgo(33) },
      { id: 'wh_8025', event: 'settlement.completed', destination: 'merchant-•••-03', status: 'delivered', attempts: 1, durationMs: 186, updatedAt: minutesAgo(51) },
    ],
    errorLogs: [
      { id: 'ERR-9001', at: minutesAgo(4), level: 'error', service: 'transaction-api', message: 'Provider request timed out before response classification.', requestId: 'req_01JCS8F2' },
      { id: 'ERR-8998', at: minutesAgo(11), level: 'warning', service: 'webhook-worker', message: 'Webhook delivery attempt 3 failed; retry scheduled with backoff.', requestId: 'wh_8038' },
      { id: 'ERR-8991', at: minutesAgo(22), level: 'error', service: 'report-worker', message: 'Merchant summary job failed after retry limit.', requestId: 'job_188' },
      { id: 'ERR-8986', at: minutesAgo(33), level: 'critical', service: 'webhook-worker', message: 'Webhook delivery exhausted retry policy; operator review required.', requestId: 'wh_8029' },
      { id: 'ERR-8977', at: minutesAgo(46), level: 'warning', service: 'provider-monitor', message: 'Health check returned a gateway timeout; next probe scheduled.', requestId: 'req_01JCS6A9' },
    ],
    performance: [
      { label: '00:00', responseMs: 172, errorRate: 0.6, requestsPerMinute: 1630 },
      { label: '04:00', responseMs: 184, errorRate: 0.9, requestsPerMinute: 1120 },
      { label: '08:00', responseMs: 166, errorRate: 0.5, requestsPerMinute: 1920 },
      { label: '12:00', responseMs: 212, errorRate: 1.4, requestsPerMinute: 2410 },
      { label: '16:00', responseMs: 198, errorRate: 1.1, requestsPerMinute: 2180 },
      { label: '20:00', responseMs: 186, errorRate: 0.8, requestsPerMinute: 1842 },
    ],
  };

  const ACTIVITY = [
    { id: 'act_1', kind: 'transaction', title: 'New transaction from Rahim Ahmed', meta: '৳ 2,500 via bKash', status: 'success', createdAt: minutesAgo(2) },
    { id: 'act_2', kind: 'routing',     title: 'Routing rule updated: High Value Rule', meta: 'by Admin', status: 'updated', createdAt: minutesAgo(5) },
    { id: 'act_3', kind: 'risk',        title: 'Risk alert: Unusual transaction pattern', meta: '৳ 87,000 via Nagad', status: 'flagged', createdAt: minutesAgo(8) },
    { id: 'act_4', kind: 'merchant',    title: 'New merchant registered: Alpha Store', meta: '', status: 'active', createdAt: minutesAgo(120) },
    { id: 'act_5', kind: 'refund',      title: 'Refund completed for TXN-41B82C', meta: '৳ 1,200 via Visa', status: 'success', createdAt: minutesAgo(185) },
    { id: 'act_6', kind: 'provider',    title: 'Provider health check completed', meta: 'All providers operational', status: 'updated', createdAt: minutesAgo(240) },
  ];

  const PAYMENT_METHODS = [
    { code: 'bkash', name: 'bKash', color: '#e2136e', share: 0.32 },
    { code: 'nagad', name: 'Nagad', color: '#f26522', share: 0.22 },
    { code: 'rocket', name: 'Rocket', color: '#8c3494', share: 0.12 },
    { code: 'upay', name: 'Upay', color: '#2563eb', share: 0.12 },
    { code: 'visa', name: 'Visa', color: '#1a1f71', share: 0.12 },
    { code: 'mastercard', name: 'Mastercard', color: '#f59e0b', share: 0.10 },
  ];

  const TRANSACTIONS = [
    { id: 'TXN-8F21A9', merchantId: 'mrc_1001', merchantName: 'Alpha Store', providerId: 'prv_bkash', providerName: 'bKash', amount: 2500, currency: 'BDT', status: 'successful', paymentMethod: 'bKash', createdAt: minutesAgo(12), reference: 'ORD-A1008', customer: 'Rahim Ahmed', customerPhone: '+880 17•• ••• 241', duplicateGroup: '', failureReason: '', providerReference: 'BK-901872', history: [{ status: 'created', at: minutesAgo(12), note: 'Payment request received' }, { status: 'processing', at: minutesAgo(12), note: 'Request sent to bKash' }, { status: 'successful', at: minutesAgo(11), note: 'Provider confirmed payment' }] },
    { id: 'TXN-77C0D2', merchantId: 'mrc_1002', merchantName: 'Daraz Express', providerId: 'prv_nagad', providerName: 'Nagad', amount: 87000, currency: 'BDT', status: 'failed', paymentMethod: 'Nagad', createdAt: minutesAgo(34), reference: 'ORD-D7781', customer: 'Nusrat Jahan', customerPhone: '+880 18•• ••• 506', duplicateGroup: '', failureReason: 'Provider timeout after authorization request', providerReference: 'NG-663281', investigation: { initiatedAt: minutesAgo(34), selectedProvider: 'Nagad', retryAttempts: 1, apiAttempts: [{ attempt: 1, at: minutesAgo(34), requestStatus: 'Sent', requestHttpStatus: '202 Accepted', responseStatus: 'Timed out', responseHttpStatus: 'No response', latencyMs: 5000 }, { attempt: 2, at: minutesAgo(33.5), requestStatus: 'Sent', requestHttpStatus: '202 Accepted', responseStatus: 'Timed out', responseHttpStatus: 'No response', latencyMs: 5000 }] }, history: [{ status: 'created', at: minutesAgo(34), note: 'Payment request received' }, { status: 'processing', at: minutesAgo(34), note: 'Request sent to Nagad' }, { status: 'failed', at: minutesAgo(33), note: 'Provider did not respond before timeout' }] },
    { id: 'TXN-26C180', merchantId: 'mrc_1003', merchantName: 'Shohoz Tickets', providerId: 'prv_rocket', providerName: 'Rocket', amount: 5400, currency: 'BDT', status: 'failed', paymentMethod: 'Rocket', createdAt: minutesAgo(51), reference: 'ORD-S6124', customer: 'Tanvir Hasan', customerPhone: '+880 16•• ••• 118', duplicateGroup: 'DUP-ORD-S6124', failureReason: 'Insufficient funds', providerReference: 'RK-440182', investigation: { initiatedAt: minutesAgo(51), selectedProvider: 'Rocket', retryAttempts: 0, apiAttempts: [{ attempt: 1, at: minutesAgo(51), requestStatus: 'Sent', requestHttpStatus: '200 OK', responseStatus: 'Declined', responseHttpStatus: '200 OK', latencyMs: 842 }] }, history: [{ status: 'created', at: minutesAgo(51), note: 'Payment request received' }, { status: 'processing', at: minutesAgo(50), note: 'Request sent to Rocket' }, { status: 'failed', at: minutesAgo(49), note: 'Provider declined: insufficient funds' }] },
    { id: 'TXN-26C181', merchantId: 'mrc_1003', merchantName: 'Shohoz Tickets', providerId: 'prv_rocket', providerName: 'Rocket', amount: 5400, currency: 'BDT', status: 'pending', paymentMethod: 'Rocket', createdAt: minutesAgo(48), reference: 'ORD-S6124', customer: 'Tanvir Hasan', customerPhone: '+880 16•• ••• 118', duplicateGroup: 'DUP-ORD-S6124', failureReason: '', providerReference: 'RK-440196', history: [{ status: 'created', at: minutesAgo(48), note: 'Retry received for existing order reference' }, { status: 'processing', at: minutesAgo(47), note: 'Retry sent to Rocket; response pending' }] },
    { id: 'TXN-11A4F8', merchantId: 'mrc_1004', merchantName: 'Green Basket', providerId: 'prv_bkash', providerName: 'bKash', amount: 1850, currency: 'BDT', status: 'successful', paymentMethod: 'bKash', createdAt: minutesAgo(87), reference: 'ORD-G3018', customer: 'Maliha Akter', customerPhone: '+880 19•• ••• 883', duplicateGroup: '', failureReason: '', providerReference: 'BK-901301', history: [{ status: 'created', at: minutesAgo(87), note: 'Payment request received' }, { status: 'processing', at: minutesAgo(86), note: 'Request sent to bKash' }, { status: 'successful', at: minutesAgo(85), note: 'Provider confirmed payment' }] },
    { id: 'TXN-921B70', merchantId: 'mrc_1005', merchantName: 'Pixel Point', providerId: 'prv_visa', providerName: 'Visa', amount: 54900, currency: 'BDT', status: 'successful', paymentMethod: 'Visa', createdAt: minutesAgo(132), reference: 'ORD-P8042', customer: 'Sakib Chowdhury', customerPhone: '+880 15•• ••• 792', duplicateGroup: '', failureReason: '', providerReference: 'VS-778310', history: [{ status: 'created', at: minutesAgo(132), note: 'Payment request received' }, { status: 'processing', at: minutesAgo(131), note: 'Authorization requested from Visa' }, { status: 'successful', at: minutesAgo(130), note: 'Authorization approved and captured' }] },
    { id: 'TXN-555D91', merchantId: 'mrc_1002', merchantName: 'Daraz Express', providerId: 'prv_mastercard', providerName: 'Mastercard', amount: 12900, currency: 'BDT', status: 'refunded', paymentMethod: 'Mastercard', createdAt: minutesAgo(245), reference: 'ORD-D7752', customer: 'Farzana Islam', customerPhone: '+880 18•• ••• 506', duplicateGroup: '', failureReason: '', providerReference: 'MC-330184', history: [{ status: 'created', at: minutesAgo(245), note: 'Payment request received' }, { status: 'successful', at: minutesAgo(243), note: 'Payment captured' }, { status: 'refunded', at: minutesAgo(208), note: 'Refund completed by merchant' }] },
    { id: 'TXN-8A199C', merchantId: 'mrc_1001', merchantName: 'Alpha Store', providerId: 'prv_upay', providerName: 'Upay', amount: 7300, currency: 'BDT', status: 'processing', paymentMethod: 'Upay', createdAt: minutesAgo(7), reference: 'ORD-A1012', customer: 'Nafis Mahmud', customerPhone: '+880 17•• ••• 241', duplicateGroup: '', failureReason: '', providerReference: 'UP-612982', history: [{ status: 'created', at: minutesAgo(7), note: 'Payment request received' }, { status: 'processing', at: minutesAgo(6), note: 'Waiting for provider confirmation' }] },
    { id: 'TXN-4EF200', merchantId: 'mrc_1003', merchantName: 'Shohoz Tickets', providerId: 'prv_visa', providerName: 'Visa', amount: 31200, currency: 'BDT', status: 'failed', paymentMethod: 'Visa', createdAt: minutesAgo(316), reference: 'ORD-S6103', customer: 'Nabila Karim', customerPhone: '+880 16•• ••• 118', duplicateGroup: '', failureReason: 'Card issuer declined authorization', providerReference: 'VS-777112', investigation: { initiatedAt: minutesAgo(316), selectedProvider: 'Visa', retryAttempts: 0, apiAttempts: [{ attempt: 1, at: minutesAgo(316), requestStatus: 'Sent', requestHttpStatus: '200 OK', responseStatus: 'Declined', responseHttpStatus: '200 OK', latencyMs: 612 }] }, history: [{ status: 'created', at: minutesAgo(316), note: 'Payment request received' }, { status: 'processing', at: minutesAgo(315), note: 'Authorization requested from Visa' }, { status: 'failed', at: minutesAgo(314), note: 'Issuer returned decline code 05' }] },
    { id: 'TXN-330A65', merchantId: 'mrc_1005', merchantName: 'Pixel Point', providerId: 'prv_nagad', providerName: 'Nagad', amount: 4800, currency: 'BDT', status: 'successful', paymentMethod: 'Nagad', createdAt: minutesAgo(520), reference: 'ORD-P8018', customer: 'Adnan Hossain', customerPhone: '+880 15•• ••• 792', duplicateGroup: '', failureReason: '', providerReference: 'NG-662420', history: [{ status: 'created', at: minutesAgo(520), note: 'Payment request received' }, { status: 'processing', at: minutesAgo(519), note: 'Request sent to Nagad' }, { status: 'successful', at: minutesAgo(518), note: 'Provider confirmed payment' }] },
    { id: 'TXN-105B22', merchantId: 'mrc_1004', merchantName: 'Green Basket', providerId: 'prv_rocket', providerName: 'Rocket', amount: 950, currency: 'BDT', status: 'failed', paymentMethod: 'Rocket', createdAt: minutesAgo(1440), reference: 'ORD-G2988', customer: 'Maliha Akter', customerPhone: '+880 19•• ••• 883', duplicateGroup: '', failureReason: 'Customer cancelled the payment', providerReference: 'RK-438102', investigation: { initiatedAt: minutesAgo(1440), selectedProvider: 'Rocket', retryAttempts: 0, apiAttempts: [{ attempt: 1, at: minutesAgo(1440), requestStatus: 'Sent', requestHttpStatus: '200 OK', responseStatus: 'Cancelled', responseHttpStatus: '200 OK', latencyMs: 32500 }] }, history: [{ status: 'created', at: minutesAgo(1440), note: 'Payment request received' }, { status: 'processing', at: minutesAgo(1439), note: 'Waiting for customer authorization' }, { status: 'failed', at: minutesAgo(1435), note: 'Customer cancelled payment session' }] },
  ];

  const RECONCILIATION_BATCHES = [
    { id: 'REC-20261125-001', providerId: 'prv_bkash', providerName: 'bKash', filename: 'bkash-settlement-2026-11-24.csv (sample)', importedAt: minutesAgo(24), status: 'review_required', records: [
      { providerReference: 'BK-901872', transactionId: 'TXN-8F21A9', amount: 2500, currency: 'BDT', status: 'settled', settledAt: minutesAgo(120) },
      { providerReference: 'BK-901301', transactionId: 'TXN-11A4F8', amount: 1800, currency: 'BDT', status: 'settled', settledAt: minutesAgo(360) },
      { providerReference: 'BK-ORPHAN-5501', transactionId: 'TXN-UNKNOWN', amount: 4200, currency: 'BDT', status: 'settled', settledAt: minutesAgo(310) },
      { providerReference: 'BK-901872', transactionId: 'TXN-8F21A9', amount: 2500, currency: 'BDT', status: 'settled', settledAt: minutesAgo(119) },
    ] },
  ];

  const AUDIT_LOGS = [
    { id: 'aud_1', createdAt: minutesAgo(12), eventType: 'auth.login', category: 'authentication', action: 'Admin signed in', actorName: 'Ayesha Rahman', actorId: 'adm_1001', ipAddress: '103.110.45.**', outcome: 'success', target: 'Admin session', changes: [] },
    { id: 'aud_2', createdAt: minutesAgo(28), eventType: 'merchant.application.approved', category: 'merchant', action: 'Approved merchant application', actorName: 'Nabil Hasan', actorId: 'adm_1002', ipAddress: '103.110.46.**', outcome: 'success', target: 'Green Basket · mrc_1004', changes: [{ field: 'applicationStatus', previousValue: 'pending', updatedValue: 'approved' }, { field: 'status', previousValue: 'pending', updatedValue: 'active' }] },
    { id: 'aud_3', createdAt: minutesAgo(43), eventType: 'provider.configuration.updated', category: 'provider', action: 'Updated payment provider configuration', actorName: 'Ayesha Rahman', actorId: 'adm_1001', ipAddress: '103.110.45.**', outcome: 'success', target: 'Rocket · prv_rocket', changes: [{ field: 'transactionLimit', previousValue: '120,000 BDT', updatedValue: '150,000 BDT' }, { field: 'apiCredentials', previousValue: 'Configured · value masked', updatedValue: 'Configured · value masked' }] },
    { id: 'aud_4', createdAt: minutesAgo(65), eventType: 'routing.configuration.updated', category: 'routing', action: 'Updated smart routing configuration', actorName: 'Ayesha Rahman', actorId: 'adm_1001', ipAddress: '103.110.45.**', outcome: 'success', target: 'MFS routing rules', changes: [{ field: 'primaryProvider', previousValue: 'bKash', updatedValue: 'Nagad' }, { field: 'fallbackProvider', previousValue: 'Nagad', updatedValue: 'Rocket' }] },
    { id: 'aud_5', createdAt: minutesAgo(102), eventType: 'refund.decision.rejected', category: 'refund', action: 'Rejected refund request', actorName: 'Farhana Islam', actorId: 'adm_1003', ipAddress: '103.110.45.**', outcome: 'success', target: 'RFD-20261124-003', changes: [{ field: 'status', previousValue: 'requested', updatedValue: 'rejected' }] },
    { id: 'aud_6', createdAt: minutesAgo(156), eventType: 'auth.login.failed', category: 'authentication', action: 'Admin sign-in failed · invalid password', actorName: 'Unknown admin · far***@example.com', actorId: 'unknown', ipAddress: '103.110.47.**', outcome: 'failure', target: 'Admin sign-in', changes: [] },
    { id: 'aud_7', createdAt: minutesAgo(220), eventType: 'merchant.account.suspended', category: 'merchant', action: 'Suspended merchant account', actorName: 'Nabil Hasan', actorId: 'adm_1002', ipAddress: '103.110.46.**', outcome: 'success', target: 'Pixel Point · mrc_1005', changes: [{ field: 'status', previousValue: 'active', updatedValue: 'suspended' }] },
    { id: 'aud_8', createdAt: minutesAgo(280), eventType: 'auth.logout', category: 'authentication', action: 'Admin signed out', actorName: 'Farhana Islam', actorId: 'adm_1003', ipAddress: '103.110.45.**', outcome: 'success', target: 'Admin session', changes: [] },
  ];

  function recordAudit(entry) {
    const secretField = /password|secret|token|authorization|credential.*value|private.?key|recovery.?code/i;
    const changes = (entry.changes || []).filter((change) => !secretField.test(change.field || '')).map((change) => ({
      field: String(change.field || 'configuration'),
      previousValue: structuredCloneSafe(change.previousValue ?? null),
      updatedValue: structuredCloneSafe(change.updatedValue ?? null),
    }));
    const record = {
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
      eventType: entry.eventType || 'configuration.updated',
      category: entry.category || 'security',
      action: String(entry.action || 'Administrative action'),
      actorName: String(entry.actorName || 'Ayesha Rahman'),
      actorId: String(entry.actorId || 'adm_1001'),
      ipAddress: String(entry.ipAddress || '103.110.45.**').replace(/(\.\d{1,3})$/, '.**'),
      outcome: entry.outcome || 'success',
      target: String(entry.target || 'Platform'),
      changes,
    };
    AUDIT_LOGS.unshift(record);
    return record;
  }

  function auditChanges(before, after, fields = Object.keys(after)) {
    return fields.filter((field) => JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null))
      .map((field) => ({ field, previousValue: before[field] ?? null, updatedValue: after[field] ?? null }));
  }

  function maskAdminEmail(value) {
    const [name, domain] = String(value || '').split('@');
    return domain ? `${name.slice(0, 3)}***@${domain}` : 'Unknown admin';
  }

  const NOTIFICATIONS = [
    { id: 'ntf_1', category: 'suspicious_activity', title: '3 high-severity risk alerts need review', createdAt: minutesAgo(8), level: 'danger', read: false, page: 'risk' },
    { id: 'ntf_2', category: 'provider_downtime', title: 'Rocket provider response is degraded', createdAt: minutesAgo(22), level: 'warning', read: false, page: 'monitor' },
    { id: 'ntf_3', category: 'merchant_registration', title: 'New merchant application received · Delta Commerce', createdAt: minutesAgo(36), level: 'info', read: false, page: 'merchants' },
    { id: 'ntf_4', category: 'transaction_failure', title: 'Transaction failure rate exceeded the configured threshold', createdAt: minutesAgo(58), level: 'danger', read: false, page: 'transactions' },
    { id: 'ntf_5', category: 'failed_settlement', title: 'Settlement batch SET-2026-114 failed processing', createdAt: minutesAgo(92), level: 'danger', read: false, page: 'finance' },
    { id: 'ntf_6', category: 'reconciliation_mismatch', title: 'Provider statement contains unmatched records', createdAt: minutesAgo(140), level: 'warning', read: true, page: 'reconciliation' },
    { id: 'ntf_7', category: 'refund_status', title: 'A refund request needs review', createdAt: minutesAgo(190), level: 'info', read: true, page: 'refunds' },
    { id: 'ntf_8', category: 'system_maintenance', title: 'Scheduled maintenance window announced', createdAt: minutesAgo(260), level: 'info', read: true, page: 'monitor' },
  ];

  const ALERT_PREFERENCE_RULES = {
    merchant_registration: { label: 'New merchant registration', description: 'Notify when a merchant submits a registration application.' },
    provider_downtime: { label: 'Provider downtime', description: 'Alert when a payment provider remains unavailable.', threshold: { field: 'thresholdMinutes', label: 'Downtime before alert', unit: 'minutes', min: 1, max: 1440, step: 1, defaultValue: 5 } },
    transaction_failure: { label: 'High transaction failure rate', description: 'Alert when failures exceed the rate across a minimum transaction sample.', threshold: { field: 'thresholdPercent', label: 'Failure rate', unit: '%', min: 1, max: 100, step: 0.1, defaultValue: 5 }, secondaryThreshold: { field: 'minimumTransactions', label: 'Minimum transactions', unit: 'transactions', min: 1, max: 10000, step: 1, defaultValue: 20 } },
    suspicious_activity: { label: 'Suspicious activity', description: 'Alert when risk activity reaches the configured score.', threshold: { field: 'minimumRiskScore', label: 'Minimum risk score', unit: '/ 100', min: 1, max: 100, step: 1, defaultValue: 75 } },
    failed_settlement: { label: 'Failed settlement', description: 'Alert when a settlement fails and meets the minimum amount.', threshold: { field: 'minimumAmount', label: 'Minimum settlement amount', unit: 'BDT', min: 0, max: 100000000, step: 100, defaultValue: 0 } },
    reconciliation_mismatch: { label: 'Reconciliation mismatch', description: 'Alert when unmatched or mismatched records meet the amount threshold.', threshold: { field: 'minimumAmount', label: 'Minimum mismatch amount', unit: 'BDT', min: 0, max: 100000000, step: 100, defaultValue: 1000 } },
    refund_status: { label: 'Refund status', description: 'Notify when a refund is approved, rejected, completed, or fails.' },
    system_maintenance: { label: 'System maintenance', description: 'Notify about scheduled maintenance and service-impacting updates.' },
  };
  const ALERT_PREFERENCES = Object.fromEntries(Object.entries(ALERT_PREFERENCE_RULES).map(([key, rule]) => [key, {
    enabled: true,
    inApp: true,
    email: key === 'system_maintenance',
    ...(rule.threshold ? { [rule.threshold.field]: rule.threshold.defaultValue } : {}),
    ...(rule.secondaryThreshold ? { [rule.secondaryThreshold.field]: rule.secondaryThreshold.defaultValue } : {}),
  }]));
  const ADMIN_SETTINGS_KEY = 'pg-admin-preferences';
  const DEFAULT_ADMIN_SETTINGS = { timeZone: 'Asia/Dhaka', dateFormat: 'medium', defaultRange: '30d' };
  const ADMIN_SETTINGS_OPTIONS = {
    timeZones: [
      { value: 'Asia/Dhaka', label: 'Dhaka (UTC+06:00)' },
      { value: 'UTC', label: 'Coordinated Universal Time (UTC)' },
      { value: 'Asia/Singapore', label: 'Singapore (UTC+08:00)' },
    ],
    dateFormats: [
      { value: 'medium', label: 'Nov 25, 2026 · 14:32' },
      { value: 'numeric', label: '25/11/2026 · 14:32' },
      { value: 'iso', label: '2026-11-25 · 14:32' },
    ],
    ranges: [
      { value: '7d', label: 'Last 7 days' },
      { value: '30d', label: 'Last 30 days' },
      { value: '90d', label: 'Last 90 days' },
    ],
  };

  const SEARCH_INDEX = [
    { type: 'Merchant', label: 'Alpha Store', page: 'merchants' },
    { type: 'Merchant', label: 'Daraz Express', page: 'merchants' },
    { type: 'Merchant', label: 'Shohoz Tickets', page: 'merchants' },
    { type: 'Rule', label: 'High Value Rule', page: 'routing' },
    { type: 'Rule', label: 'Low Latency Fallback', page: 'routing' },
    { type: 'Page', label: 'Financial Management & Settlement Monitoring', page: 'finance' },
    { type: 'Page', label: 'Refund & Dispute Management', page: 'refunds' },
    { type: 'Provider', label: 'bKash', page: 'providers' },
    { type: 'Provider', label: 'Nagad', page: 'providers' },
    { type: 'Provider', label: 'Rocket', page: 'providers' },
    { type: 'Provider', label: 'Visa', page: 'providers' },
    { type: 'Provider', label: 'Mastercard', page: 'providers' },
    { type: 'Transaction', label: 'TXN-8F21A9 · ৳ 2,500 · Rahim Ahmed', page: 'transactions' },
    { type: 'Transaction', label: 'TXN-77C0D2 · ৳ 87,000 · failed', page: 'transactions' },
    { type: 'Page', label: 'Audit Logs', page: 'audit' },
    { type: 'Page', label: 'Notification & Alert Management', page: 'alerts' },
    { type: 'Page', label: 'My Admin Profile', page: 'profile' },
    { type: 'Page', label: 'System Monitor', page: 'monitor' },
    { type: 'Page', label: 'Settings', page: 'settings' },
  ];

  function minutesAgo(m) { return new Date(Date.now() - m * 60000).toISOString(); }

  function distribute(total, count, seed) {
    const random = seeded(seed);
    const weights = Array.from({ length: count }, (_, i) => 0.8 + random() * 0.4 + (i / Math.max(1, count - 1)) * 0.08);
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
    const values = weights.map((weight) => Math.floor(total * weight / weightTotal));
    let remaining = total - values.reduce((sum, value) => sum + value, 0);
    for (let i = 0; remaining > 0; i = (i + 1) % count, remaining--) values[i]++;
    return values;
  }

  /* Mock series distribute period totals across chart points for coherent summaries. */
  function buildSeries(range) {
    const cfg = {
      week: { points: 7, step: 1, stats: KPIS['7d'], seed: 7 },
      month: { points: 30, step: 1, stats: KPIS['30d'], seed: 30 },
      quarter: { points: 13, step: 7, stats: KPIS['90d'], seed: 90 },
    }[range] || { points: 30, step: 1, stats: KPIS['30d'], seed: 30 };
    const { points, step, stats, seed } = cfg;
    const counts = {
      successful: distribute(stats.successfulTransactions, points, seed),
      failed: distribute(stats.failedTransactions, points, seed + 1),
      pending: distribute(stats.pendingTransactions, points, seed + 2),
      volume: distribute(stats.totalVolume, points, seed + 3),
    };
    const start = new Date();
    start.setHours(12, 0, 0, 0);
    start.setDate(start.getDate() - (points - 1) * step);
    return Array.from({ length: points }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i * step);
      const label = range === 'week'
        ? d.toLocaleDateString('en-US', { weekday: 'short' })
        : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return {
        date: d.toISOString().slice(0, 10),
        label,
        successful: counts.successful[i],
        failed: counts.failed[i],
        pending: counts.pending[i],
        volume: counts.volume[i],
      };
    });
  }

  function buildReconciliationBatch(batch) {
    const transactions = TRANSACTIONS.filter((transaction) => transaction.providerId === batch.providerId);
    const referenceCounts = batch.records.reduce((counts, record) => {
      const key = record.providerReference || record.transactionId;
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
      return counts;
    }, new Map());
    const seenReferences = new Set();
    const matchedTransactions = new Set();
    const providerRows = batch.records.map((record, index) => {
      const matchKey = record.providerReference || record.transactionId;
      const transaction = record.providerReference
        ? transactions.find((item) => item.providerReference === record.providerReference)
        : transactions.find((item) => item.id === record.transactionId);
      if (transaction) matchedTransactions.add(transaction.id);
      const duplicate = Boolean(matchKey && referenceCounts.get(matchKey) > 1 && seenReferences.has(matchKey));
      if (matchKey) seenReferences.add(matchKey);
      const exceptionType = duplicate ? 'duplicate'
        : !transaction ? 'missing_internal'
          : Math.round(Number(record.amount) * 100) !== Math.round(Number(transaction.amount) * 100) ? 'amount_mismatch' : 'matched';
      return {
        id: `${batch.id}-provider-${index + 1}`,
        source: 'provider',
        providerReference: record.providerReference || '',
        transactionId: record.transactionId || '',
        amount: Number(record.amount),
        currency: record.currency || 'BDT',
        providerStatus: record.status || 'settled',
        settledAt: record.settledAt || '',
        internalTransaction: transaction ? { id: transaction.id, amount: transaction.amount, status: transaction.status, reference: transaction.reference } : null,
        exceptionType,
        reviewStatus: record.reviewStatus || 'open',
        review: record.review || null,
      };
    });
    const missingRows = transactions
      .filter((transaction) => ['successful', 'refunded'].includes(transaction.status) && !matchedTransactions.has(transaction.id))
      .map((transaction) => ({
        id: `${batch.id}-internal-${transaction.id}`,
        source: 'internal',
        providerReference: transaction.providerReference || '',
        transactionId: transaction.id,
        amount: transaction.amount,
        currency: transaction.currency || 'BDT',
        providerStatus: '',
        settledAt: '',
        internalTransaction: { id: transaction.id, amount: transaction.amount, status: transaction.status, reference: transaction.reference },
        exceptionType: 'missing_provider',
        reviewStatus: transaction.reconciliationReviewStatus || 'open',
        review: transaction.reconciliationReview || null,
      }));
    const rows = [...providerRows, ...missingRows];
    const exceptionCount = rows.filter((row) => row.exceptionType !== 'matched').length;
    const pendingReviewCount = rows.filter((row) => row.exceptionType !== 'matched' && row.reviewStatus !== 'reviewed').length;
    return {
      ...batch,
      recordCount: batch.records.length,
      matchedCount: rows.filter((row) => row.exceptionType === 'matched').length,
      exceptionCount,
      pendingReviewCount,
      status: pendingReviewCount ? 'review_required' : 'reconciled',
      rows,
    };
  }

  /* ---------- public API ---------- */
  const DataService = {
    isDemoMode() { return USE_MOCK; },
    /** GET /dashboard/kpis?range=30d */
    getKpis(range = '30d') {
      return USE_MOCK ? delay({ ...KPIS[range], sparks: SPARKS }) : http('/dashboard/kpis', { range });
    },
    /** GET /providers/health */
    getProviders() {
      return USE_MOCK ? delay(PROVIDERS.filter((provider) => provider.isEnabled)) : http('/providers/health');
    },
    /** GET /providers */
    getProviderRecords() {
      return USE_MOCK ? delay(PROVIDERS) : http('/providers');
    },
    /** GET /providers/:id */
    getProvider(id) {
      if (!USE_MOCK) return http(`/providers/${encodeURIComponent(id)}`);
      const provider = PROVIDERS.find((item) => item.id === id);
      if (!provider) return Promise.reject(new Error(`Provider not found: ${id}`));
      return delay(provider);
    },
    /** POST /providers or PATCH /providers/:id; secret values are never stored in mock state. */
    saveProvider(id, changes) {
      const endpoint = id ? `/providers/${encodeURIComponent(id)}` : '/providers';
      const method = id ? 'PATCH' : 'POST';
      if (!USE_MOCK) {
        return fetch(API_BASE + endpoint, {
          method, headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          credentials: 'include', body: JSON.stringify(changes),
        }).then(async (res) => {
          if (!res.ok) throw new Error(`API ${res.status}: ${endpoint}`);
          return res.json();
        });
      }
      const input = structuredCloneSafe(changes);
      const credentialInputs = input.credentials || {};
      delete input.credentials;
      const configured = Object.values(credentialInputs).some((value) => typeof value === 'string' && value.trim());
      let provider;
      const previous = id ? PROVIDERS.find((item) => item.id === id) : null;
      const before = previous ? Object.fromEntries(Object.keys(input).map((field) => [field, structuredCloneSafe(previous[field] ?? null)])) : {};
      if (id) {
        provider = PROVIDERS.find((item) => item.id === id);
        if (!provider) return Promise.reject(new Error(`Provider not found: ${id}`));
        Object.assign(provider, input);
      } else {
        provider = {
          id: `prv_${Date.now()}`, status: 'offline', isEnabled: false, uptime: 0,
          successRate: 0, failureRate: 0, avgLatencyMs: 0, transactionCount: 0,
          transactionVolume: 0, credentialsConfigured: false, priority: 'fallback',
          fallbackProviderId: '', logs: [], ...input,
        };
        PROVIDERS.push(provider);
      }
      if (configured) provider.credentialsConfigured = true;
      if (input.isEnabled !== undefined || input.apiBaseUrl || input.transactionLimit || input.dailyLimit || configured) {
        provider.logs.unshift({
          at: new Date().toISOString(), level: 'info',
          message: configured ? 'Provider credentials updated' : 'Provider configuration updated',
        });
      }
      const field = id ? 'Updated' : 'Added';
      const after = Object.fromEntries(Object.keys(input).map((key) => [key, provider[key] ?? null]));
      if (configured) {
        before.credentialsConfigured = Boolean(previous?.credentialsConfigured);
        after.credentialsConfigured = Boolean(provider.credentialsConfigured);
      }
      recordAudit({
        eventType: id ? 'provider.configuration.updated' : 'provider.configuration.created',
        category: 'provider', action: `${field} payment provider configuration`,
        target: `${provider.name} · ${provider.id}`,
        changes: auditChanges(before, after, [...Object.keys(input), ...(configured ? ['credentialsConfigured'] : [])]),
      });
      return delay(provider);
    },
    /** PATCH /providers/routing */
    saveProviderRouting(routes) {
      if (!USE_MOCK) {
        return fetch(API_BASE + '/providers/routing', {
          method: 'PATCH', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          credentials: 'include', body: JSON.stringify({ routes }),
        }).then(async (res) => {
          if (!res.ok) throw new Error(`API ${res.status}: /providers/routing`);
          return res.json();
        });
      }
      const previousRoutes = routes.map((route) => {
        const primary = PROVIDERS.find((provider) => provider.type === route.type && provider.priority === 'primary');
        return { type: route.type, primaryProviderId: primary?.id || '', fallbackProviderId: primary?.fallbackProviderId || '' };
      });
      routes.forEach((route) => {
        const primary = PROVIDERS.find((provider) => provider.id === route.primaryProviderId);
        const fallback = PROVIDERS.find((provider) => provider.id === route.fallbackProviderId);
        PROVIDERS.filter((provider) => provider.type === route.type).forEach((provider) => {
          provider.priority = provider.id === route.primaryProviderId ? 'primary' : 'fallback';
          if (provider.id === route.primaryProviderId) provider.fallbackProviderId = route.fallbackProviderId;
        });
        if (primary) primary.logs.unshift({ at: new Date().toISOString(), level: 'info', message: `Set as primary ${route.type.toUpperCase()} provider${fallback ? ` · fallback ${fallback.name}` : ''}` });
      });
      recordAudit({
        eventType: 'routing.provider_priority.updated', category: 'routing',
        action: 'Updated primary and fallback provider routing', target: 'Provider routing priorities',
        changes: routes.flatMap((route) => {
          const previous = previousRoutes.find((item) => item.type === route.type);
          const primary = PROVIDERS.find((provider) => provider.id === route.primaryProviderId);
          const fallback = PROVIDERS.find((provider) => provider.id === route.fallbackProviderId);
          return [
            { field: `${route.type} primary provider`, previousValue: PROVIDERS.find((provider) => provider.id === previous?.primaryProviderId)?.name || '—', updatedValue: primary?.name || '—' },
            { field: `${route.type} fallback provider`, previousValue: PROVIDERS.find((provider) => provider.id === previous?.fallbackProviderId)?.name || '—', updatedValue: fallback?.name || '—' },
          ];
        }),
      });
      return delay({ ok: true });
    },
    /** GET /routing/config */
    getRoutingConfig() {
      if (!USE_MOCK) return http('/routing/config');
      return delay({
        config: ROUTING_CONFIG,
        providers: PROVIDERS,
        decisions: ROUTING_DECISIONS,
        analytics: { routedTransactions: 128450, primarySelections: 125104, failovers: 826, successRate: 98.7, failoverSuccessRate: 91.4, avgDecisionMs: 18 },
      });
    },
    /** PATCH /routing/config */
    saveRoutingConfig(changes) {
      if (!USE_MOCK) {
        return fetch(API_BASE + '/routing/config', {
          method: 'PATCH', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          credentials: 'include', body: JSON.stringify(changes),
        }).then(async (res) => {
          if (!res.ok) throw new Error(`API ${res.status}: /routing/config`);
          return res.json();
        });
      }
      const providerIds = new Set(PROVIDERS.filter((provider) => provider.isEnabled).map((provider) => provider.id));
      const ruleIds = new Set();
      changes.priorityRoutes.forEach((route) => {
        const primary = PROVIDERS.find((provider) => provider.id === route.primaryProviderId);
        const fallback = PROVIDERS.find((provider) => provider.id === route.fallbackProviderId);
        if (!primary?.isEnabled || primary.type !== route.type || (route.fallbackProviderId && (!fallback?.isEnabled || fallback.type !== route.type))) {
          throw new Error('Provider priorities must use enabled providers of the same type');
        }
        if (route.fallbackProviderId === route.primaryProviderId) throw new Error('Primary and fallback providers must be different');
      });
      changes.rules.forEach((rule) => {
        if (ruleIds.has(rule.id)) throw new Error('Routing rule identifiers must be unique');
        ruleIds.add(rule.id);
        if (!providerIds.has(rule.primaryProviderId) || (rule.fallbackProviderId && !providerIds.has(rule.fallbackProviderId))) {
          throw new Error('Routing rules must use enabled providers');
        }
        if (rule.fallbackProviderId === rule.primaryProviderId) throw new Error('Primary and fallback providers must be different');
        const primary = PROVIDERS.find((provider) => provider.id === rule.primaryProviderId);
        const fallback = PROVIDERS.find((provider) => provider.id === rule.fallbackProviderId);
        if (rule.method !== 'any' && primary?.type !== rule.methodType) throw new Error('Primary provider is not compatible with this payment method');
        if (rule.fallbackProviderId && rule.method !== 'any' && fallback?.type !== rule.methodType) throw new Error('Fallback provider is not compatible with this payment method');
        if (!Number.isFinite(rule.minAmount) || rule.minAmount < 0 || (rule.maxAmount !== null && (!Number.isFinite(rule.maxAmount) || rule.maxAmount < rule.minAmount))) {
          throw new Error('Enter a valid routing amount range');
        }
      });
      changes.providerLimits.forEach(({ id, transactionLimit, dailyLimit }) => {
        const provider = PROVIDERS.find((item) => item.id === id);
        if (!provider || !Number.isFinite(transactionLimit) || transactionLimit <= 0 || !Number.isFinite(dailyLimit) || dailyLimit < transactionLimit) {
          throw new Error('Daily limits must be at least the per-transaction limit');
        }
      });
      const before = {
        autoFailover: ROUTING_CONFIG.autoFailover,
        rules: structuredCloneSafe(ROUTING_CONFIG.rules),
        priorityRoutes: structuredCloneSafe(PROVIDERS.filter((provider) => provider.priority === 'primary')
          .map(({ type, id, fallbackProviderId }) => ({ type, primaryProviderId: id, fallbackProviderId }))),
        providerLimits: structuredCloneSafe(PROVIDERS.map(({ id, transactionLimit, dailyLimit }) => ({ id, transactionLimit, dailyLimit }))),
      };
      ROUTING_CONFIG.autoFailover = Boolean(changes.autoFailover);
      ROUTING_CONFIG.rules = structuredCloneSafe(changes.rules);
      changes.priorityRoutes.forEach((route) => {
        PROVIDERS.filter((provider) => provider.type === route.type).forEach((provider) => {
          provider.priority = provider.id === route.primaryProviderId ? 'primary' : 'fallback';
          if (provider.id === route.primaryProviderId) {
            provider.fallbackProviderId = route.fallbackProviderId;
            provider.logs.unshift({
              at: new Date().toISOString(), level: 'info',
              message: `Smart routing priority updated · ${route.type.toUpperCase()} primary${route.fallbackProviderId ? ' and fallback configured' : ''}`,
            });
          }
        });
      });
      changes.providerLimits.forEach(({ id, transactionLimit, dailyLimit }) => {
        const provider = PROVIDERS.find((item) => item.id === id);
        provider.transactionLimit = transactionLimit;
        provider.dailyLimit = dailyLimit;
      });
      const after = {
        autoFailover: ROUTING_CONFIG.autoFailover,
        rules: structuredCloneSafe(ROUTING_CONFIG.rules),
        priorityRoutes: structuredCloneSafe(PROVIDERS.filter((provider) => provider.priority === 'primary')
          .map(({ type, id, fallbackProviderId }) => ({ type, primaryProviderId: id, fallbackProviderId }))),
        providerLimits: structuredCloneSafe(PROVIDERS.map(({ id, transactionLimit, dailyLimit }) => ({ id, transactionLimit, dailyLimit }))),
      };
      recordAudit({
        eventType: 'routing.configuration.updated', category: 'routing',
        action: 'Updated smart routing configuration', target: 'Routing rules and provider limits',
        changes: auditChanges(before, after),
      });
      return delay({ ok: true });
    },
    /** GET /finance/overview?range=7d|30d|90d&status= */
    getFinancialData(filters = {}) {
      if (!USE_MOCK) return http('/finance/overview', filters);
      const range = ['7d', '30d', '90d'].includes(filters.range) ? filters.range : '30d';
      const days = Number.parseInt(range, 10);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days + 1);
      const settlements = SETTLEMENTS.filter((settlement) => {
        const withinRange = new Date(`${settlement.period}T23:59:59`).getTime() >= cutoff.getTime();
        return withinRange
          && (!filters.status || filters.status === 'all' || settlement.status === filters.status)
          && (!filters.providerId || settlement.providerId === filters.providerId)
          && (!filters.merchantId || settlement.merchantId === filters.merchantId)
          && (!filters.discrepanciesOnly || settlement.status === 'discrepancy');
      }).sort((a, b) => b.period.localeCompare(a.period) || b.id.localeCompare(a.id));
      const summary = FINANCIAL_SUMMARY[range];
      return delay({ summary, settlements });
    },
    /** GET /reconciliation?batchId=&exceptionType=&reviewStatus= */
    getReconciliationData(filters = {}) {
      if (!USE_MOCK) return http('/reconciliation', filters);
      const batches = RECONCILIATION_BATCHES.map(buildReconciliationBatch)
        .sort((a, b) => new Date(b.importedAt) - new Date(a.importedAt));
      const selectedBatchId = filters.batchId || batches[0]?.id || '';
      const selectedBatch = batches.find((batch) => batch.id === selectedBatchId) || null;
      const query = String(filters.q || '').trim().toLowerCase();
      const rows = selectedBatch ? selectedBatch.rows.filter((row) =>
        (!filters.exceptionType || filters.exceptionType === 'all' || row.exceptionType === filters.exceptionType)
        && (!filters.reviewStatus || filters.reviewStatus === 'all' || row.reviewStatus === filters.reviewStatus)
        && (!query || [row.id, row.providerReference, row.transactionId, row.internalTransaction?.reference].some((value) => String(value || '').toLowerCase().includes(query)))) : [];
      const summary = batches.reduce((result, batch) => {
        result.batches += 1;
        result.providerRecords += batch.recordCount;
        result.matched += batch.matchedCount;
        result.exceptions += batch.exceptionCount;
        result.pendingReview += batch.pendingReviewCount;
        return result;
      }, { batches: 0, providerRecords: 0, matched: 0, exceptions: 0, pendingReview: 0 });
      return delay({ batches, selectedBatch, rows, summary, providers: PROVIDERS });
    },
    /** POST /reconciliation/batches */
    importReconciliationStatement(providerId, file, records) {
      if (!USE_MOCK) {
        const formData = new FormData();
        formData.append('providerId', providerId);
        formData.append('statement', file);
        return fetch(API_BASE + '/reconciliation/batches', {
          method: 'POST', headers: { Accept: 'application/json' },
          credentials: 'include', body: formData,
        }).then(async (res) => {
          if (!res.ok) throw new Error(`API ${res.status}: /reconciliation/batches`);
          return res.json();
        });
      }
      const provider = PROVIDERS.find((item) => item.id === providerId);
      if (!provider) return Promise.reject(new Error('Choose a valid payment provider'));
      if (!Array.isArray(records) || !records.length) return Promise.reject(new Error('The statement contains no transaction records'));
      if (records.length > 5000) return Promise.reject(new Error('A statement can contain at most 5,000 records'));
      const batch = {
        id: `REC-${new Date().toISOString().replace(/\D/g, '').slice(0, 12)}-${String(RECONCILIATION_BATCHES.length + 1).padStart(3, '0')}`,
        providerId, providerName: provider.name, filename: String(file?.name || 'provider-statement.csv'),
        importedAt: new Date().toISOString(), status: 'processing', records: structuredCloneSafe(records),
      };
      RECONCILIATION_BATCHES.unshift(batch);
      recordAudit({
        eventType: 'reconciliation.statement.imported', category: 'reconciliation',
        action: `Imported ${records.length} ${provider.name} statement records`,
        target: `${batch.id} · ${provider.name}`,
        changes: [{ field: 'status', previousValue: null, updatedValue: batch.status }],
      });
      return delay(buildReconciliationBatch(batch));
    },
    /** PATCH /reconciliation/batches/:batchId/records/:recordId */
    reviewReconciliationRecord(batchId, recordId, note = '') {
      if (!USE_MOCK) {
        return fetch(`${API_BASE}/reconciliation/batches/${encodeURIComponent(batchId)}/records/${encodeURIComponent(recordId)}`, {
          method: 'PATCH', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          credentials: 'include', body: JSON.stringify({ reviewStatus: 'reviewed', note }),
        }).then(async (res) => {
          if (!res.ok) throw new Error(`API ${res.status}: /reconciliation/batches/${batchId}/records/${recordId}`);
          return res.json();
        });
      }
      const batch = RECONCILIATION_BATCHES.find((item) => item.id === batchId);
      if (!batch) return Promise.reject(new Error(`Reconciliation batch not found: ${batchId}`));
      const reconciledBatch = buildReconciliationBatch(batch);
      const row = reconciledBatch.rows.find((item) => item.id === recordId);
      if (!row) return Promise.reject(new Error(`Reconciliation record not found: ${recordId}`));
      if (row.exceptionType === 'matched') return Promise.reject(new Error('Matched records do not require exception review'));
      row.reviewStatus = 'reviewed';
      row.review = { at: new Date().toISOString(), actor: 'Admin', note: String(note || '').trim() };
      if (row.source === 'internal') {
        const transaction = TRANSACTIONS.find((item) => item.id === row.transactionId);
        if (transaction) {
          transaction.reconciliationReviewStatus = 'reviewed';
          transaction.reconciliationReview = row.review;
        }
      } else {
        const index = Number(recordId.slice(recordId.lastIndexOf('-') + 1)) - 1;
        if (batch.records[index]) {
          batch.records[index].reviewStatus = 'reviewed';
          batch.records[index].review = row.review;
        }
      }
      recordAudit({
        eventType: 'reconciliation.exception.reviewed', category: 'reconciliation',
        action: 'Reviewed reconciliation exception',
        target: `${recordId} · ${batchId}`,
        changes: [{ field: 'reviewStatus', previousValue: 'pending', updatedValue: 'reviewed' }],
      });
      return delay({ ...row, batch: buildReconciliationBatch(batch) });
    },
    /** GET /refunds?status=&q=&disputeStatus= */
    getRefunds(filters = {}) {
      if (!USE_MOCK) return http('/refunds', filters);
      const query = String(filters.q || '').trim().toLowerCase();
      const rows = REFUNDS.filter((refund) => (!filters.status || filters.status === 'all' || refund.status === filters.status)
        && (!filters.disputeStatus || filters.disputeStatus === 'all' || refund.dispute.status === filters.disputeStatus)
        && (!query || [refund.id, refund.transactionId, refund.merchantName, refund.customer].some((value) => value.toLowerCase().includes(query))))
        .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
      return delay(rows);
    },
    /** GET /refunds/audit */
    getRefundAudit(limit = 50) {
      if (!USE_MOCK) return http('/refunds/audit', { limit });
      return delay(REFUND_AUDIT.slice(0, limit));
    },
    /** PATCH /refunds/:id/status */
    updateRefund(id, action, note = '') {
      if (!USE_MOCK) {
        return fetch(`${API_BASE}/refunds/${encodeURIComponent(id)}/status`, {
          method: 'PATCH', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          credentials: 'include', body: JSON.stringify({ action, note }),
        }).then(async (res) => {
          if (!res.ok) throw new Error(`API ${res.status}: /refunds/${id}/status`);
          return res.json();
        });
      }
      const refund = REFUNDS.find((item) => item.id === id);
      if (!refund) return Promise.reject(new Error(`Refund not found: ${id}`));
      const transitions = {
        approve: { from: ['requested'], to: 'approved', label: 'Refund approved' },
        reject: { from: ['requested'], to: 'rejected', label: 'Refund rejected' },
        process: { from: ['approved', 'failed'], to: 'processing', label: 'Refund processing' },
        complete: { from: ['processing'], to: 'completed', label: 'Refund completed' },
        fail: { from: ['processing'], to: 'failed', label: 'Refund failed' },
      };
      const transition = transitions[action];
      if (!transition || !transition.from.includes(refund.status)) return Promise.reject(new Error('This refund action is not available for its current status'));
      const cleanNote = String(note || '').trim();
      if (action === 'reject' && !cleanNote) return Promise.reject(new Error('Add a reason before rejecting a refund'));
      const previousStatus = refund.status;
      refund.status = transition.to;
      const timestamp = new Date().toISOString();
      const auditNote = cleanNote || (action === 'process' && refund.status === 'processing' ? 'Refund submitted for provider processing.' : transition.label);
      const entry = { id: `${id}-${Date.now()}`, refundId: id, transactionId: refund.transactionId, at: timestamp, actor: 'Admin', action: transition.label, note: auditNote };
      refund.history.push({ at: timestamp, actor: 'Admin', action: transition.label, note: auditNote });
      REFUND_AUDIT.unshift(entry);
      recordAudit({
        eventType: `refund.decision.${action}`, category: 'refund',
        action: `${transition.label}: ${id}`, target: `${id} · ${refund.transactionId}`,
        changes: [{ field: 'status', previousValue: previousStatus, updatedValue: refund.status }],
      });
      return delay(refund);
    },
    /** POST /refunds/:id/notes */
    addRefundNote(id, note) {
      if (!USE_MOCK) {
        return fetch(`${API_BASE}/refunds/${encodeURIComponent(id)}/notes`, {
          method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          credentials: 'include', body: JSON.stringify({ note }),
        }).then(async (res) => {
          if (!res.ok) throw new Error(`API ${res.status}: /refunds/${id}/notes`);
          return res.json();
        });
      }
      const refund = REFUNDS.find((item) => item.id === id);
      if (!refund) return Promise.reject(new Error(`Refund not found: ${id}`));
      const text = String(note || '').trim();
      if (!text) return Promise.reject(new Error('Investigation note cannot be empty'));
      const timestamp = new Date().toISOString();
      refund.notes.push({ at: timestamp, actor: 'Admin', text });
      refund.history.push({ at: timestamp, actor: 'Admin', action: 'Investigation note added', note: text });
      REFUND_AUDIT.unshift({
        id: `${id}-${Date.now()}`, refundId: id, transactionId: refund.transactionId,
        at: timestamp, actor: 'Admin', action: 'Investigation note added', note: text,
      });
      recordAudit({
        eventType: 'refund.investigation.note_added', category: 'refund',
        action: 'Added refund investigation note', target: `${id} · ${refund.transactionId}`,
        changes: [],
      });
      return delay(refund);
    },
    /** PATCH /refunds/:id/dispute */
    updateRefundDispute(id, status, note = '') {
      if (!USE_MOCK) {
        return fetch(`${API_BASE}/refunds/${encodeURIComponent(id)}/dispute`, {
          method: 'PATCH', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          credentials: 'include', body: JSON.stringify({ status, note }),
        }).then(async (res) => {
          if (!res.ok) throw new Error(`API ${res.status}: /refunds/${id}/dispute`);
          return res.json();
        });
      }
      const refund = REFUNDS.find((item) => item.id === id);
      if (!refund) return Promise.reject(new Error(`Refund not found: ${id}`));
      if (!['open', 'under_review', 'resolved', 'none'].includes(status)) return Promise.reject(new Error('Invalid dispute status'));
      const previousStatus = refund.dispute.status;
      const text = String(note || '').trim();
      if (status !== 'none' && !text && !refund.dispute.reason) return Promise.reject(new Error('Add an investigation note for this dispute'));
      const timestamp = new Date().toISOString();
      refund.dispute = { status, reason: text || refund.dispute.reason };
      const label = `Dispute ${status.replace('_', ' ')}`;
      const auditNote = text || refund.dispute.reason || label;
      refund.history.push({ at: timestamp, actor: 'Admin', action: label, note: auditNote });
      REFUND_AUDIT.unshift({
        id: `${id}-${Date.now()}`, refundId: id, transactionId: refund.transactionId,
        at: timestamp, actor: 'Admin', action: label, note: auditNote,
      });
      recordAudit({
        eventType: `refund.dispute.${status}`, category: 'refund',
        action: label, target: `${id} · ${refund.transactionId}`,
        changes: [{ field: 'disputeStatus', previousValue: previousStatus, updatedValue: status }],
      });
      return delay(refund);
    },
    /** GET /analytics/transactions?period=month */
    getTransactionSeries(period = 'month') {
      return USE_MOCK ? delay(buildSeries(period)) : http('/analytics/transactions', { period });
    },
    /** GET /analytics/payment-methods?range=7d|30d|90d */
    getPaymentMethodDistribution(range = '30d') {
      if (!USE_MOCK) return http('/analytics/payment-methods', { range });
      const total = (KPIS[range] || KPIS['30d']).totalTransactions;
      let assigned = 0;
      return delay(PAYMENT_METHODS.map((method, index) => {
        const count = index === PAYMENT_METHODS.length - 1
          ? total - assigned
          : Math.round(total * method.share);
        assigned += count;
        return {
          ...method,
          count,
        };
      }));
    },
    /** GET /analytics/transactions?period=week */
    getDailyActivity() {
      if (!USE_MOCK) return http('/analytics/transactions/daily');
      return delay(buildSeries('week').map((day) => ({
        date: day.date,
        label: day.label,
        total: day.successful + day.failed + day.pending,
      })));
    },
    /** GET /transactions?filters... */
    getTransactions(filters = {}) {
      if (!USE_MOCK) return http('/transactions', filters);
      const query = String(filters.id || '').trim().toLowerCase();
      const amountMin = filters.amountMin === '' || filters.amountMin == null ? null : Number(filters.amountMin);
      const amountMax = filters.amountMax === '' || filters.amountMax == null ? null : Number(filters.amountMax);
      const duplicateCounts = TRANSACTIONS.reduce((counts, transaction) => {
        const key = transaction.duplicateGroup || `${transaction.merchantId}|${transaction.reference}|${transaction.amount}`;
        counts.set(key, (counts.get(key) || 0) + 1);
        return counts;
      }, new Map());
      const rows = TRANSACTIONS.filter((transaction) => {
        const transactionDate = transaction.createdAt.slice(0, 10);
        const duplicateKey = transaction.duplicateGroup || `${transaction.merchantId}|${transaction.reference}|${transaction.amount}`;
        return (!query || transaction.id.toLowerCase().includes(query))
          && (!filters.merchantId || transaction.merchantId === filters.merchantId)
          && (!filters.providerId || transaction.providerId === filters.providerId)
          && (!filters.status || filters.status === 'all' || transaction.status === filters.status)
          && (!filters.from || transactionDate >= filters.from)
          && (!filters.to || transactionDate <= filters.to)
          && (amountMin === null || transaction.amount >= amountMin)
          && (amountMax === null || transaction.amount <= amountMax)
          && (!filters.duplicatesOnly || duplicateCounts.get(duplicateKey) > 1);
      }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return delay(rows);
    },
    /** GET /transactions/:id with lifecycle history */
    getTransaction(id) {
      if (!USE_MOCK) return http(`/transactions/${encodeURIComponent(id)}`);
      const transaction = TRANSACTIONS.find((item) => item.id === id);
      if (!transaction) return Promise.reject(new Error(`Transaction not found: ${id}`));
      return delay(transaction);
    },
    /** GET /merchants/stats */
    getMerchantStats() {
      return USE_MOCK ? delay(MERCHANT_STATS) : http('/merchants/stats');
    },
    /** GET /admin/access-options */
    getAdminAccessOptions() {
      return USE_MOCK ? delay({ roles: ADMIN_ROLES, permissions: ADMIN_PERMISSIONS }) : http('/admin/access-options');
    },
    /** GET /admin/users?status=&q= */
    getAdminUsers(filters = {}) {
      if (!USE_MOCK) return http('/admin/users', filters);
      const query = String(filters.q || '').trim().toLowerCase();
      const rows = ADMIN_USERS.filter((admin) => (
        (!filters.status || filters.status === 'all' || admin.status === filters.status)
        && (!query || [admin.name, admin.email, admin.role, admin.id].some((value) => value.toLowerCase().includes(query)))
      )).sort((a, b) => a.name.localeCompare(b.name));
      return delay(rows);
    },
    /** GET /admin/users/:id including recent masked authentication events. */
    getAdminUser(id) {
      if (!USE_MOCK) return http(`/admin/users/${encodeURIComponent(id)}`);
      const admin = ADMIN_USERS.find((item) => item.id === id);
      if (!admin) return Promise.reject(new Error(`Admin user not found: ${id}`));
      return delay(admin);
    },
    /** GET /admin/me */
    getMyAdminProfile() {
      if (!USE_MOCK) return http('/admin/me');
      return delay(ADMIN_USERS[0]);
    },
    /** GET /admin/preferences */
    async getAdminSettings() {
      if (!USE_MOCK) return http('/admin/preferences');
      let saved;
      try {
        const raw = localStorage.getItem(ADMIN_SETTINGS_KEY);
        saved = raw ? JSON.parse(raw) : {};
      } catch (error) {
        throw new Error(`Unable to read saved admin preferences: ${error.message}`);
      }
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('Saved admin preferences are invalid');
      const settings = { ...DEFAULT_ADMIN_SETTINGS, ...saved };
      if (!ADMIN_SETTINGS_OPTIONS.timeZones.some((option) => option.value === settings.timeZone)
        || !ADMIN_SETTINGS_OPTIONS.dateFormats.some((option) => option.value === settings.dateFormat)
        || !ADMIN_SETTINGS_OPTIONS.ranges.some((option) => option.value === settings.defaultRange)) {
        throw new Error('Saved admin preferences contain unsupported values');
      }
      return delay({ settings, options: ADMIN_SETTINGS_OPTIONS, demo: true });
    },
    /** PATCH /admin/preferences */
    async saveAdminSettings(changes) {
      if (!USE_MOCK) {
        const res = await fetch(API_BASE + '/admin/preferences', {
          method: 'PATCH', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          credentials: 'include', body: JSON.stringify(changes),
        });
        if (!res.ok) throw new Error(`API ${res.status}: /admin/preferences`);
        return res.json();
      }
      if (!ADMIN_SETTINGS_OPTIONS.timeZones.some((option) => option.value === changes.timeZone)
        || !ADMIN_SETTINGS_OPTIONS.dateFormats.some((option) => option.value === changes.dateFormat)
        || !ADMIN_SETTINGS_OPTIONS.ranges.some((option) => option.value === changes.defaultRange)) {
        throw new Error('Choose a supported time zone, date format, and dashboard range');
      }
      const settings = { timeZone: changes.timeZone, dateFormat: changes.dateFormat, defaultRange: changes.defaultRange };
      try {
        localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify(settings));
      } catch (error) {
        throw new Error(`Unable to save admin preferences: ${error.message}`);
      }
      return delay({ settings, options: ADMIN_SETTINGS_OPTIONS, demo: true });
    },
    /** PATCH /admin/me — actor identity is always derived from the authenticated session. */
    updateMyAdminProfile(changes) {
      if (!USE_MOCK) {
        const { avatarDataUrl, ...profile } = changes;
        const body = new FormData();
        Object.entries(profile).forEach(([key, value]) => body.append(key, String(value)));
        if (avatarDataUrl !== undefined) body.append('removeAvatar', String(!avatarDataUrl));
        if (avatarDataUrl) {
          const [metadata, encoded] = String(avatarDataUrl).split(',');
          const mime = /^data:(image\/(?:jpeg|png|webp));base64$/.exec(metadata || '')?.[1];
          if (!mime || !encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || Math.floor(encoded.length * 3 / 4) > 2 * 1024 * 1024) {
            return Promise.reject(new Error('Profile picture must be a JPEG, PNG, or WebP image no larger than 2 MB'));
          }
          const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
          body.append('avatar', new Blob([bytes], { type: mime }), 'admin-profile');
        }
        return fetch(API_BASE + '/admin/me', { method: 'PATCH', credentials: 'include', body }).then(async (res) => {
          if (!res.ok) throw new Error(`API ${res.status}: /admin/me`);
          return res.json();
        });
      }
      const admin = ADMIN_USERS[0];
      const name = String(changes.name || '').trim();
      const email = String(changes.email || '').trim().toLowerCase();
      const jobTitle = String(changes.jobTitle || '').trim();
      const phone = String(changes.phone || '').trim();
      if (!name || name.length > 100) return Promise.reject(new Error('Enter a name between 1 and 100 characters'));
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return Promise.reject(new Error('Enter a valid work email address'));
      if (ADMIN_USERS.some((item) => item.id !== admin.id && item.email.toLowerCase() === email)) return Promise.reject(new Error('Another admin account already uses this email'));
      if (jobTitle.length > 100) return Promise.reject(new Error('Job title must be 100 characters or fewer'));
      if (phone && !/^[+()\d .-]{7,24}$/.test(phone)) return Promise.reject(new Error('Enter a valid phone number'));
      if (changes.avatarDataUrl !== undefined && changes.avatarDataUrl !== null && changes.avatarDataUrl !== '') {
        const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(changes.avatarDataUrl);
        if (!match || Math.floor(match[2].length * 3 / 4) > 2 * 1024 * 1024) {
          return Promise.reject(new Error('Profile picture must be a JPEG, PNG, or WebP image no larger than 2 MB'));
        }
      }
      Object.assign(admin, { name, email, jobTitle, phone });
      if (changes.avatarDataUrl !== undefined) admin.avatarDataUrl = changes.avatarDataUrl || '';
      recordAudit({
        eventType: 'admin.profile.updated', category: 'admin',
        action: 'Updated own admin profile', actorName: admin.name, actorId: admin.id, target: `${admin.name} · ${admin.id}`,
      });
      return delay(admin);
    },
    /** POST /admin/users — sends an invitation; never accepts or stores a password. */
    createAdminUser(input) {
      if (!USE_MOCK) {
        return fetch(`${API_BASE}/admin/users`, {
          method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          credentials: 'include', body: JSON.stringify(input),
        }).then(async (res) => {
          if (!res.ok) throw new Error(`API ${res.status}: /admin/users`);
          return res.json();
        });
      }
      const name = String(input.name || '').trim();
      const email = String(input.email || '').trim().toLowerCase();
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Promise.reject(new Error('Enter a name and a valid email address'));
      if (ADMIN_USERS.some((admin) => admin.email.toLowerCase() === email)) return Promise.reject(new Error('An admin account already exists for this email'));
      if (!ADMIN_ROLES.includes(input.role)) return Promise.reject(new Error('Select a valid admin role'));
      const permissions = [...new Set(input.permissions || [])];
      if (permissions.some((permission) => !ADMIN_PERMISSIONS.some((item) => item.key === permission))) return Promise.reject(new Error('One or more permissions are invalid'));
      const allowedIpRanges = [...new Set((input.allowedIpRanges || []).map((range) => String(range).trim()).filter(Boolean))];
      if (allowedIpRanges.some((range) => !isValidIPv4Range(range))) return Promise.reject(new Error('One or more approved network ranges are invalid'));
      if (input.requireApprovedNetwork && allowedIpRanges.length === 0) return Promise.reject(new Error('Add an approved network before requiring network restrictions'));
      const admin = {
        id: `adm_${Date.now()}`, name, email, role: input.role, status: 'inactive',
        twoFactorEnabled: false, twoFactorRequired: Boolean(input.twoFactorRequired),
        requireApprovedNetwork: Boolean(input.requireApprovedNetwork),
        allowedIpRanges,
        permissions,
        invitationStatus: 'pending',
        loginHistory: [],
      };
      ADMIN_USERS.push(admin);
      recordAudit({
        eventType: 'admin.account.invited', category: 'admin',
        action: `Invited admin account: ${admin.email}`, target: `${admin.name} · ${admin.id}`,
        changes: [
          { field: 'status', previousValue: null, updatedValue: 'inactive · invitation pending' },
          { field: 'role', previousValue: null, updatedValue: admin.role },
          { field: 'permissions', previousValue: null, updatedValue: admin.permissions },
          { field: 'twoFactorRequired', previousValue: null, updatedValue: admin.twoFactorRequired },
        ],
      });
      return delay(admin);
    },
    /** PATCH /admin/users/:id — enforce role, permission, and self-deactivation rules server-side. */
    updateAdminUser(id, changes) {
      if (!USE_MOCK) {
        return fetch(`${API_BASE}/admin/users/${encodeURIComponent(id)}`, {
          method: 'PATCH', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          credentials: 'include', body: JSON.stringify(changes),
        }).then(async (res) => {
          if (!res.ok) throw new Error(`API ${res.status}: /admin/users/${id}`);
          return res.json();
        });
      }
      const admin = ADMIN_USERS.find((item) => item.id === id);
      if (!admin) return Promise.reject(new Error(`Admin user not found: ${id}`));
      const normalizedChanges = structuredCloneSafe(changes);
      if (id === 'adm_1001' && normalizedChanges.status === 'inactive') return Promise.reject(new Error('You cannot deactivate your own account'));
      if (normalizedChanges.status && !['active', 'inactive'].includes(normalizedChanges.status)) return Promise.reject(new Error('Select a valid admin account status'));
      if (normalizedChanges.name !== undefined) normalizedChanges.name = String(normalizedChanges.name).trim();
      if (normalizedChanges.name === '') return Promise.reject(new Error('Admin name cannot be empty'));
      if (normalizedChanges.role && !ADMIN_ROLES.includes(normalizedChanges.role)) return Promise.reject(new Error('Select a valid admin role'));
      if (normalizedChanges.email) {
        normalizedChanges.email = String(normalizedChanges.email).trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedChanges.email)) return Promise.reject(new Error('Enter a valid email address'));
        if (ADMIN_USERS.some((item) => item.id !== id && item.email.toLowerCase() === normalizedChanges.email)) return Promise.reject(new Error('Another admin account already uses this email'));
      }
      if (normalizedChanges.permissions && normalizedChanges.permissions.some((permission) => !ADMIN_PERMISSIONS.some((item) => item.key === permission))) {
        return Promise.reject(new Error('One or more permissions are invalid'));
      }
      if (normalizedChanges.allowedIpRanges !== undefined) {
        if (!Array.isArray(normalizedChanges.allowedIpRanges)) return Promise.reject(new Error('Approved network ranges must be a list'));
        normalizedChanges.allowedIpRanges = [...new Set(normalizedChanges.allowedIpRanges.map((range) => String(range).trim()).filter(Boolean))];
        if (normalizedChanges.allowedIpRanges.some((range) => !isValidIPv4Range(range))) return Promise.reject(new Error('One or more approved network ranges are invalid'));
      }
      const effectiveRanges = normalizedChanges.allowedIpRanges || admin.allowedIpRanges;
      if (normalizedChanges.requireApprovedNetwork === true && effectiveRanges.length === 0) {
        return Promise.reject(new Error('Add an approved network before requiring network restrictions'));
      }
      const retainsLastSuperAdmin = admin.status === 'active'
        && admin.role === 'Super Admin'
        && admin.permissions.includes('manage_admins')
        && (normalizedChanges.status === 'inactive'
          || normalizedChanges.role && normalizedChanges.role !== 'Super Admin'
          || normalizedChanges.permissions && !normalizedChanges.permissions.includes('manage_admins'));
      const activeSuperAdmins = ADMIN_USERS.filter((item) => item.status === 'active'
        && item.role === 'Super Admin' && item.permissions.includes('manage_admins'));
      if (retainsLastSuperAdmin && activeSuperAdmins.length <= 1) return Promise.reject(new Error('Keep at least one active Super Admin with admin-management permission'));
      const previousValues = Object.fromEntries(Object.keys(normalizedChanges).map((field) => [field, structuredCloneSafe(admin[field] ?? null)]));
      Object.assign(admin, normalizedChanges);
      if (normalizedChanges.status === 'active' && admin.invitationStatus === 'pending') admin.invitationStatus = 'accepted';
      const fields = Object.keys(normalizedChanges);
      const action = fields.includes('status')
        ? `${admin.status === 'active' ? 'Activated' : 'Deactivated'} admin account: ${admin.email}`
        : fields.includes('twoFactorEnabled')
          ? `${admin.twoFactorEnabled ? 'Enabled' : 'Disabled'} admin two-factor authentication: ${admin.email}`
          : `Updated admin access and profile: ${admin.email}`;
      const currentValues = Object.fromEntries(fields.map((field) => [field, structuredCloneSafe(admin[field] ?? null)]));
      recordAudit({
        eventType: fields.includes('status') ? `admin.account.${admin.status}` : fields.includes('twoFactorEnabled') ? 'admin.mfa.updated' : 'admin.access.updated',
        category: 'admin', action, target: `${admin.name} · ${admin.id}`,
        changes: auditChanges(previousValues, currentValues, fields),
      });
      return delay(admin);
    },
    /** GET /merchants?status=&q= */
    getMerchants(filters = {}) {
      if (!USE_MOCK) return http('/merchants', filters);
      const query = String(filters.q || '').trim().toLowerCase();
      const rows = MERCHANTS.filter((merchant) => {
        const statusMatch = !filters.status || filters.status === 'all' || merchant.status === filters.status;
        const queryMatch = !query || [merchant.name, merchant.owner, merchant.email, merchant.id].some((value) => value.toLowerCase().includes(query));
        return statusMatch && queryMatch;
      });
      return delay(rows);
    },
    /** GET /merchants/:id */
    getMerchant(id) {
      if (!USE_MOCK) return http(`/merchants/${encodeURIComponent(id)}`);
      const merchant = MERCHANTS.find((item) => item.id === id);
      if (!merchant) return Promise.reject(new Error(`Merchant not found: ${id}`));
      return delay(merchant);
    },
    /** PATCH /merchants/:id — mock mutations are session-only. */
    updateMerchant(id, changes) {
      if (!USE_MOCK) {
        return fetch(`${API_BASE}/merchants/${encodeURIComponent(id)}`, {
          method: 'PATCH', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          credentials: 'include', body: JSON.stringify(changes),
        }).then(async (res) => {
          if (!res.ok) throw new Error(`API ${res.status}: /merchants/${id}`);
          return res.json();
        });
      }
      const merchant = MERCHANTS.find((item) => item.id === id);
      if (!merchant) return Promise.reject(new Error(`Merchant not found: ${id}`));
      const previousValues = Object.fromEntries(Object.keys(changes).map((field) => [field, structuredCloneSafe(merchant[field] ?? null)]));
      Object.assign(merchant, structuredCloneSafe(changes));
      const field = Object.keys(changes)[0];
      const auditAction = field === 'applicationStatus'
        ? `${changes.applicationStatus === 'approved' ? 'Approved' : 'Rejected'} merchant application: ${merchant.name}`
        : field === 'verificationStatus' ? `Verified business information: ${merchant.name}`
          : field === 'status' ? `${changes.status === 'suspended' ? 'Suspended' : 'Activated'} merchant: ${merchant.name}`
            : field === 'permissions' ? `Updated merchant permissions: ${merchant.name}`
              : `Updated merchant transaction limits: ${merchant.name}`;
      const currentValues = Object.fromEntries(Object.keys(changes).map((key) => [key, structuredCloneSafe(merchant[key] ?? null)]));
      const eventType = field === 'applicationStatus'
        ? `merchant.application.${changes.applicationStatus}`
        : field === 'status' ? `merchant.account.${changes.status}` : 'merchant.configuration.updated';
      recordAudit({
        eventType, category: 'merchant', action: auditAction,
        target: `${merchant.name} · ${merchant.id}`,
        changes: auditChanges(previousValues, currentValues),
      });
      return delay(merchant);
    },
    /** GET /risk-alerts?status=&severity=&type=&q= */
    getRiskAlerts(filters = {}) {
      if (!USE_MOCK) return http('/risk-alerts', filters);
      const query = String(filters.q || '').trim().toLowerCase();
      const rows = RISK_ALERTS.filter((alert) => (!filters.status || filters.status === 'all' || alert.status === filters.status)
        && (!filters.severity || filters.severity === 'all' || alert.severity === filters.severity)
        && (!filters.type || filters.type === 'all' || alert.type === filters.type)
        && (!query || [alert.id, alert.title, alert.merchantName, alert.transactionId, alert.summary].some((value) => value.toLowerCase().includes(query))))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return delay(rows);
    },
    /** PATCH /risk-alerts/:id */
    updateRiskAlert(id, status, note = '') {
      if (!USE_MOCK) {
        return fetch(`${API_BASE}/risk-alerts/${encodeURIComponent(id)}`, {
          method: 'PATCH', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          credentials: 'include', body: JSON.stringify({ status, note }),
        }).then(async (res) => {
          if (!res.ok) throw new Error(`API ${res.status}: /risk-alerts/${id}`);
          return res.json();
        });
      }
      const alert = RISK_ALERTS.find((item) => item.id === id);
      if (!alert) return Promise.reject(new Error(`Risk alert not found: ${id}`));
      if (!['investigating', 'resolved', 'dismissed'].includes(status)) return Promise.reject(new Error('Invalid risk alert status'));
      const allowedTransitions = { open: ['investigating', 'resolved', 'dismissed'], investigating: ['resolved', 'dismissed'] };
      if (!allowedTransitions[alert.status]?.includes(status)) return Promise.reject(new Error('This risk alert action is not available for its current status'));
      const cleanNote = String(note || '').trim();
      if (status === 'dismissed' && !cleanNote) return Promise.reject(new Error('Add a reason before dismissing this alert'));
      const previousStatus = alert.status;
      alert.status = status;
      alert.reviewHistory = alert.reviewHistory || [];
      alert.review = { at: new Date().toISOString(), actor: 'Admin', previousStatus, status, note: cleanNote };
      alert.reviewHistory.push(alert.review);
      recordAudit({
        eventType: `risk.alert.${status}`, category: 'security',
        action: `Risk alert ${status}`, target: `${id} · ${alert.title}`,
        changes: [{ field: 'status', previousValue: previousStatus, updatedValue: status }],
      });
      return delay({ ...alert, previousStatus });
    },
    /** GET /risk-alerts/summary */
    getRiskSummary() {
      if (!USE_MOCK) return http('/risk-alerts/summary');
      const active = RISK_ALERTS.filter((alert) => alert.status === 'open' || alert.status === 'investigating');
      const severityRank = { critical: 0, high: 1, medium: 2, low: 3 };
      const counts = active.reduce((result, alert) => {
        const group = result[alert.type] || { type: alert.type, label: alert.title, count: 0, severity: alert.severity };
        group.count += 1;
        if (severityRank[alert.severity] < severityRank[group.severity]) group.severity = alert.severity;
        result[alert.type] = group;
        return result;
      }, {});
      return delay({ openCount: active.length, byType: Object.values(counts) });
    },
    /** GET /system/health?level=&q= — returns operational metrics with sensitive fields excluded. */
    getSystemHealth(filters = {}) {
      if (!USE_MOCK) return http('/system/health', filters);
      const providers = PROVIDERS.filter((provider) => provider.isEnabled).map((provider) => ({
        id: provider.id,
        name: provider.name,
        status: provider.status === 'online' ? 'green' : provider.status === 'degraded' ? 'yellow' : 'red',
        uptime: provider.uptime,
        averageResponseMs: provider.avgLatencyMs,
        successRate: provider.successRate,
        failureRate: provider.failureRate,
      }));
      const query = String(filters.q || '').trim().toLowerCase();
      const severityRank = { green: 0, yellow: 1, red: 2 };
      const statuses = [
        SYSTEM_HEALTH.api.status,
        SYSTEM_HEALTH.database.status,
        SYSTEM_HEALTH.webhook.status,
        SYSTEM_HEALTH.jobs.status,
        ...SYSTEM_HEALTH.servers.map((server) => server.status),
        ...providers.map((provider) => provider.status),
      ];
      const status = statuses.reduce((worst, current) => (
        severityRank[current] > severityRank[worst] ? current : worst
      ), 'green');
      const errorLogs = SYSTEM_HEALTH.errorLogs.filter((log) => (
        (!filters.level || filters.level === 'all' || log.level === filters.level)
        && (!query || [log.id, log.level, log.service, log.message, log.requestId].some((value) => value.toLowerCase().includes(query)))
      ));
      return delay({
        ...structuredCloneSafe(SYSTEM_HEALTH),
        status,
        providers,
        errorLogs,
        capturedAt: new Date().toISOString(),
        demo: true,
      });
    },
    /** GET /activity?limit=4 */
    getRecentActivity(limit = 4) {
      return USE_MOCK ? delay(ACTIVITY.slice(0, limit)) : http('/activity', { limit });
    },
    /** GET /audit-logs?limit=4 */
    getAuditLogs(limit = 4) {
      return USE_MOCK
        ? delay([...AUDIT_LOGS].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit))
        : http('/audit-logs', { limit });
    },
    /** GET /security/audit-logs?category=&outcome=&q=&from=&to= */
    getSecurityAuditLogs(filters = {}) {
      if (!USE_MOCK) return http('/security/audit-logs', filters);
      const all = [...AUDIT_LOGS].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const query = String(filters.q || '').trim().toLowerCase();
      const logs = all.filter((entry) => {
        const date = entry.createdAt.slice(0, 10);
        return (!filters.category || filters.category === 'all' || entry.category === filters.category)
          && (!filters.outcome || filters.outcome === 'all' || entry.outcome === filters.outcome)
          && (!filters.from || date >= filters.from)
          && (!filters.to || date <= filters.to)
          && (!query || [entry.id, entry.eventType, entry.category, entry.action, entry.actorName, entry.actorId, entry.target, entry.ipAddress]
            .some((value) => String(value || '').toLowerCase().includes(query)));
      });
      const summary = logs.reduce((result, entry) => {
        result.total += 1;
        if (entry.outcome === 'failure') result.failed += 1;
        if (entry.category === 'authentication') result.authEvents += 1;
        if (entry.category === 'admin') result.adminChanges += 1;
        return result;
      }, { total: 0, failed: 0, authEvents: 0, adminChanges: 0 });
      return delay({ logs, summary, total: logs.length, demo: true });
    },
    /** POST /security/auth-events — never send password, MFA secret, or raw credentials. */
    recordAdminAuthEvent(eventType, details = {}) {
      const allowedEvents = {
        login: { eventType: 'auth.login', action: 'Admin signed in', outcome: 'success' },
        logout: { eventType: 'auth.logout', action: 'Admin signed out', outcome: 'success' },
        failed_login: { eventType: 'auth.login.failed', action: 'Admin sign-in failed', outcome: 'failure' },
      };
      const event = allowedEvents[eventType];
      if (!event) return Promise.reject(new Error('Unsupported admin authentication event'));
      const safeDetails = {
        actorName: eventType === 'failed_login'
          ? `Unknown admin · ${maskAdminEmail(details.email)}`
          : String(details.actorName || 'Ayesha Rahman'),
        actorId: eventType === 'failed_login' ? 'unknown' : String(details.actorId || 'adm_1001'),
        ipAddress: String(details.ipAddress || '103.110.45.**').replace(/(\.\d{1,3})$/, '.**'),
        target: eventType === 'failed_login' ? 'Admin sign-in' : 'Admin session',
      };
      if (!USE_MOCK) return Promise.reject(new Error('Authentication events must be recorded by trusted backend authentication middleware'));
      const record = recordAudit({
        ...event, ...safeDetails, category: 'authentication', changes: [],
      });
      const admin = ADMIN_USERS.find((item) => item.id === record.actorId);
      if (admin) {
        admin.loginHistory.unshift({
          at: record.createdAt,
          location: 'Dhaka, Bangladesh',
          ipAddress: record.ipAddress,
          device: 'Dashboard session',
          outcome: eventType === 'login' ? 'Success · signed in' : 'Success · signed out',
          twoFactor: admin.twoFactorEnabled,
        });
      }
      return delay(record);
    },
    /** GET /notifications */
    getNotifications() {
      return USE_MOCK ? delay(NOTIFICATIONS) : http('/notifications');
    },
    /** GET /notifications/preferences */
    getAlertPreferences() {
      return USE_MOCK
        ? delay({ preferences: ALERT_PREFERENCES, rules: ALERT_PREFERENCE_RULES })
        : http('/notifications/preferences');
    },
    /** PATCH /notifications/preferences */
    saveAlertPreferences(preferences) {
      if (!USE_MOCK) {
        return fetch(API_BASE + '/notifications/preferences', {
          method: 'PATCH', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          credentials: 'include', body: JSON.stringify({ preferences }),
        }).then(async (res) => {
          if (!res.ok) throw new Error(`API ${res.status}: /notifications/preferences`);
          return res.json();
        });
      }
      const keys = Object.keys(ALERT_PREFERENCE_RULES);
      if (!preferences || keys.some((key) => !preferences[key]) || Object.keys(preferences).some((key) => !ALERT_PREFERENCE_RULES[key])) {
        return Promise.reject(new Error('Invalid alert preference categories'));
      }
      const next = {};
      for (const [key, rule] of Object.entries(ALERT_PREFERENCE_RULES)) {
        const value = preferences[key];
        if (typeof value.enabled !== 'boolean' || typeof value.inApp !== 'boolean' || typeof value.email !== 'boolean') {
          return Promise.reject(new Error(`Invalid delivery preferences for ${rule.label}`));
        }
        next[key] = { enabled: value.enabled, inApp: value.inApp, email: value.email };
        for (const threshold of [rule.threshold, rule.secondaryThreshold].filter(Boolean)) {
          const number = Number(value[threshold.field]);
          if (!Number.isFinite(number) || number < threshold.min || number > threshold.max) {
            return Promise.reject(new Error(`${threshold.label} must be between ${threshold.min} and ${threshold.max}`));
          }
          next[key][threshold.field] = number;
        }
      }
      Object.keys(ALERT_PREFERENCES).forEach((key) => delete ALERT_PREFERENCES[key]);
      Object.assign(ALERT_PREFERENCES, next);
      return delay({ preferences: ALERT_PREFERENCES, rules: ALERT_PREFERENCE_RULES, demo: true });
    },
    /** PATCH /notifications/:id/read */
    async markNotificationRead(id) {
      if (USE_MOCK) {
        const notification = NOTIFICATIONS.find((item) => item.id === id);
        if (!notification) throw new Error(`Notification not found: ${id}`);
        notification.read = true;
        return delay({ ok: true });
      }
      const res = await fetch(API_BASE + `/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH', credentials: 'include' });
      if (!res.ok) throw new Error(`API ${res.status}: /notifications/${encodeURIComponent(id)}/read`);
      return res.json();
    },
    /** POST /notifications/read-all */
    async markAllNotificationsRead() {
      if (USE_MOCK) { NOTIFICATIONS.forEach((n) => (n.read = true)); return delay({ ok: true }); }
      const res = await fetch(API_BASE + '/notifications/read-all', { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error(`API ${res.status}: /notifications/read-all`);
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
