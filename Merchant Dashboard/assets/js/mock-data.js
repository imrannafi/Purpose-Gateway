/**
 * Mock data — shaped exactly like rows from /database/schema.sql
 * (snake_case columns, money as BIGINT minor units: 1 BDT = 100 poisha,
 *  timestamps as ISO-8601 with offset).
 *
 * The snapshot is pinned to 30 Nov 2025 so it matches the design reference.
 * Once the database is connected this file is no longer loaded; api.js
 * switches to real HTTP calls.
 */
(function () {
  // Deterministic PRNG so the mock looks the same on every load
  function rng(seed) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  const MOCK_NOW = "2025-11-30T15:00:00+06:00";
  const MERCHANT_ID = "6f1c2a9e-0d3b-4c1e-9a77-3f0b8e5d2c11";

  // ---------------------------------------------------------------- identity
  const merchant = {
    id: MERCHANT_ID,
    business_name: "Nafi Lifestyle Store",
    legal_name: "Nafi Lifestyle",
    business_type: "sole_proprietorship",
    industry: "Retail",
    slug: "nafi-lifestyle",
    email: "billing@nafilifestyle.example",
    country_code: "BD",
    default_currency: "BDT",
    timezone: "Asia/Dhaka",
    phone: "+8801712345678",
    website_url: "https://nafilifestyle.example",
    address_line1: "House 12, Road 4",
    city: "Dhaka",
    postal_code: "1205",
    status: "active",
    kyc_status: "verified",
  };

  const merchant_user = {
    id: "b4a0c7de-2f61-4b8e-8d0a-91e6f3c2a7b5",
    merchant_id: MERCHANT_ID,
    full_name: "Imran Un Nafi",
    display_title: "Merchant",
    email: "imran@nafilifestyle.example",
    role: "owner",
    avatar_url: null,
  };

  const subscription = {
    plan_code: "starter",
    plan_name: "Starter",
    status: "active",
    upgrade_plan_code: "pro",
  };

  const merchant_settings = {
    payout_schedule: "manual",
    notify_email: { payment_failed: true, payout: true, weekly_report: true, payment_success: false, refund: true, security: true },
    notify_sms: { payout: true, payment: false },
  };
  const merchant_team = [
    { id: "usr_owner", full_name: "Imran Un Nafi", email: "imran@nafilifestyle.example", role: "owner", status: "active", invited_at: "2025-03-02T10:00:00+06:00" },
    { id: "usr_finance", full_name: "Nusrat Jahan", email: "nusrat@nafilifestyle.example", role: "finance", status: "active", invited_at: "2025-04-15T09:30:00+06:00" },
  ];
  const security_settings = { two_factor_enabled: false };

  const payment_preferences = {
    mobile_banking: "bkash",
    card: "card",
    bank_transfer: "",
  };

  // ---------------------------------------------------------------- gateways
  // payment_providers joined with merchant_gateways
  const payment_providers = [
    { id: 1, code: "bkash",      name: "bKash",         method_code: "mobile_banking", brand_color: "#E2136E", logo_url: null, availability: "available", availability_label: "Operational", fee_percent: 1.5, fixed_fee_minor: 0, sort_order: 1 },
    { id: 2, code: "nagad",      name: "Nagad",         method_code: "mobile_banking", brand_color: "#F26522", logo_url: null, availability: "available", availability_label: "Operational", fee_percent: 1.5, fixed_fee_minor: 0, sort_order: 2 },
    { id: 3, code: "rocket",     name: "Rocket",        method_code: "mobile_banking", brand_color: "#8C3494", logo_url: null, availability: "available", availability_label: "Operational", fee_percent: 1.5, fixed_fee_minor: 0, sort_order: 3 },
    { id: 4, code: "card",       name: "Card",          method_code: "card",           brand_color: "#2B5CF6", logo_url: null, availability: "available", availability_label: "Operational", fee_percent: 2.9, fixed_fee_minor: 500, sort_order: 4 },
    { id: 5, code: "upay",       name: "Upay",          method_code: "mobile_banking", brand_color: "#FFC20E", logo_url: null, availability: "available", availability_label: "Operational", fee_percent: 1.5, fixed_fee_minor: 0, sort_order: 5 },
    { id: 6, code: "bank",       name: "Bank Transfer", method_code: "bank_transfer",  brand_color: "#0F766E", logo_url: null, availability: "available", availability_label: "Operational", fee_percent: 1, fixed_fee_minor: 0, sort_order: 6 },
    { id: 7, code: "visa",       name: "Visa",          method_code: "card",           brand_color: "#1A1F71", logo_url: null, availability: "available", availability_label: "Operational", fee_percent: 2.9, fixed_fee_minor: 500, sort_order: 7 },
    { id: 8, code: "mastercard", name: "Mastercard",    method_code: "card",           brand_color: "#EB001B", logo_url: null, availability: "available", availability_label: "Operational", fee_percent: 2.9, fixed_fee_minor: 500, sort_order: 8 },
  ];

  const merchant_gateways = [
    { id: "gw_01", provider_code: "bkash",  status: "active",  environment: "live", connected_at: "2025-03-02T10:12:00+06:00" },
    { id: "gw_02", provider_code: "nagad",  status: "active",  environment: "live", connected_at: "2025-03-02T10:20:00+06:00" },
    { id: "gw_03", provider_code: "rocket", status: "active",  environment: "live", connected_at: "2025-04-11T16:45:00+06:00" },
    { id: "gw_04", provider_code: "card",   status: "active",  environment: "live", connected_at: "2025-05-19T12:00:00+06:00" },
    { id: "gw_05", provider_code: "upay",   status: "active",  environment: "live", connected_at: "2025-08-03T09:30:00+06:00" },
    { id: "gw_06", provider_code: "bank",   status: "pending", environment: "live", connected_at: null },
  ];

  // ---------------------------------------------------------------- balance & payouts
  const merchant_balance = {
    merchant_id: MERCHANT_ID,
    currency: "BDT",
    available_minor: 18642050,   // ৳186,420.50
    pending_minor: 2315000,      // ৳23,150.00 (in settlement)
    reserved_minor: 0,
    updated_at: MOCK_NOW,
  };

  const payout_accounts = [
    { id: "pa_01", account_type: "bank_account",  label: "City Bank •••• 4521",   bank_name: "The City Bank PLC", account_name: "Nafi Lifestyle Store", account_number_last4: "4521", is_default: true,  status: "verified" },
    { id: "pa_02", account_type: "mobile_wallet", label: "bKash Merchant •••• 890", bank_name: "bKash",           account_name: "Imran Un Nafi",        account_number_last4: "890",  is_default: false, status: "verified" },
  ];

  const payout_rules = { min_payout_minor: 50000, payout_fee_minor: 0 }; // ৳500 minimum

  const payouts = [];
  const payment_links = [
    {
      id: "pl_demo_01", slug: "eid-collection-9f31a", title: "Eid Collection",
      description: "New season collection order.", amount_minor: 250000,
      currency: "BDT", status: "active", uses_count: 18, created_at: "2025-11-24T10:30:00+06:00",
      url: "https://pay.purposegateway.com/nafi-lifestyle/eid-collection-9f31a",
    },
    {
      id: "pl_demo_02", slug: "custom-order-4c7b2", title: "Custom Order",
      description: "Customer enters the amount for a custom order.", amount_minor: null,
      currency: "BDT", status: "paused", uses_count: 6, created_at: "2025-11-18T14:15:00+06:00",
      url: "https://pay.purposegateway.com/nafi-lifestyle/custom-order-4c7b2",
    },
  ];
  const support_tickets = [];

  // ---------------------------------------------------------------- customers + transactions
  const NAMES = [
    "Rahim Ahmed", "Nusrat Jahan", "Tanvir Hasan", "Samiya Akter", "Arif Hossain", "Farzana Islam",
    "Mahmud Karim", "Sadia Rahman", "Rakib Chowdhury", "Tasnim Sultana", "Shakil Mia", "Ayesha Siddiqua",
    "Fahim Reza", "Lamia Haque", "Jubayer Alam", "Mithila Das", "Sabbir Khan", "Ritu Barua",
  ];
  const customers = NAMES.map((full_name, i) => ({
    id: "cus_" + String(i + 1).padStart(3, "0"),
    merchant_id: MERCHANT_ID,
    full_name,
    email: full_name.toLowerCase().replace(/\s+/g, ".") + "@mail.example",
    phone: "+88017" + String(10000000 + i * 734119).slice(0, 8),
  }));

  // First four rows reproduce the design reference exactly
  const transactions = [
    { public_id: "PGT-78452", customer_id: "cus_001", amount_minor: 250000, provider_code: "bkash",  status: "success", created_at: "2025-11-30T14:45:00+06:00", payer_account_masked: "01712•••890" },
    { public_id: "PGT-78451", customer_id: "cus_002", amount_minor: 320000, provider_code: "nagad",  status: "success", created_at: "2025-11-30T13:20:00+06:00", payer_account_masked: "01819•••214" },
    { public_id: "PGT-78450", customer_id: "cus_003", amount_minor: 175000, provider_code: "rocket", status: "failed",  created_at: "2025-11-30T12:12:00+06:00", payer_account_masked: "01611•••507", failure_code: "insufficient_funds", failure_message: "Payer wallet has insufficient balance." },
    { public_id: "PGT-78449", customer_id: "cus_004", amount_minor: 420000, provider_code: "visa",   status: "success", created_at: "2025-11-30T11:47:00+06:00", card_brand: "visa", card_last4: "4242" },
  ];

  (function generateHistory() {
    const r = rng(78452);
    const providers = ["bkash", "bkash", "bkash", "nagad", "nagad", "rocket", "visa", "mastercard", "upay"];
    const statuses = ["success", "success", "success", "success", "success", "success", "success", "success", "failed", "pending", "refunded"];
    let t = new Date("2025-11-30T11:47:00+06:00").getTime();
    for (let n = 78448; n > 78448 - 44; n--) {
      t -= Math.round((25 + r() * 140) * 60000);
      const provider_code = providers[Math.floor(r() * providers.length)];
      const isCard = provider_code === "visa" || provider_code === "mastercard";
      const status = statuses[Math.floor(r() * statuses.length)];
      const tx = {
        public_id: "PGT-" + n,
        customer_id: customers[Math.floor(r() * customers.length)].id,
        amount_minor: Math.round((450 + r() * 7800) / 50) * 50 * 100,
        provider_code,
        status,
        created_at: new Date(t).toISOString(),
      };
      if (isCard) { tx.card_brand = provider_code; tx.card_last4 = String(1000 + Math.floor(r() * 8999)); }
      else tx.payer_account_masked = "01" + (7 + Math.floor(r() * 3)) + String(10 + Math.floor(r() * 89)) + "•••" + String(100 + Math.floor(r() * 899));
      if (status === "failed") { tx.failure_code = "payer_cancelled"; tx.failure_message = "Customer cancelled on the provider page."; }
      transactions.push(tx);
    }
  })();

  // derive fee/net + ids (fee = 1.5% for MFS, 2.5% for cards — merchant plan pricing)
  transactions.forEach((tx, i) => {
    const isCard = tx.provider_code === "visa" || tx.provider_code === "mastercard";
    tx.id = "txn_" + String(i + 1).padStart(4, "0");
    tx.merchant_id = MERCHANT_ID;
    tx.currency = "BDT";
    tx.method_code = isCard ? "card" : "mobile_banking";
    tx.fee_minor = tx.status === "success" || tx.status === "refunded" ? Math.round(tx.amount_minor * (isCard ? 0.025 : 0.015)) : 0;
    tx.net_minor = tx.status === "success" ? tx.amount_minor - tx.fee_minor : 0;
    tx.refunded_minor = tx.status === "refunded" ? tx.amount_minor : 0;
    tx.environment = "live";
    tx.provider_reference = tx.status === "failed" ? null : "PRV" + (91000000 + i * 3137);
  });

  const refunds = transactions.filter((tx) => tx.refunded_minor > 0).map((tx, i) => ({
    id: "rf_seed_" + String(i + 1).padStart(3, "0"),
    transaction_id: tx.id,
    transaction_public_id: tx.public_id,
    customer_name: customers.find((customer) => customer.id === tx.customer_id)?.full_name || "Guest",
    amount_minor: tx.refunded_minor,
    reason: i % 2 ? "duplicate" : "requested_by_customer",
    status: "succeeded",
    requested_at: new Date(new Date(tx.created_at).getTime() + 15 * 60000).toISOString(),
    updated_at: new Date(new Date(tx.created_at).getTime() + 45 * 60000).toISOString(),
  }));

  // ---------------------------------------------------------------- analytics (daily_merchant_stats rollups)
  function distribute(shape, totalMinor, startISO) {
    const sum = shape.reduce((a, b) => a + b, 0);
    const start = new Date(startISO + "T00:00:00Z"); // UTC so toISOString keeps the calendar date
    let acc = 0;
    return shape.map((v, i) => {
      let value = Math.round((v / sum) * totalMinor / 100) * 100;
      if (i === shape.length - 1) value = totalMinor - acc;
      acc += value;
      const d = new Date(start.getTime() + i * 86400000);
      return { stat_date: d.toISOString().slice(0, 10), gross_volume_minor: value };
    });
  }

  const novShape = [.55,.6,.58,.5,.47,.55,.68,.75,.74,.7,.72,.8,.86,.9,.85,.75,.72,.78,.85,.88,.9,.92,.9,.86,.84,.86,.92,1.0,1.08,1.14];
  const octShape = [.6,.62,.66,.6,.55,.58,.64,.7,.72,.68,.66,.7,.78,.8,.76,.7,.66,.7,.74,.79,.82,.8,.76,.72,.74,.78,.83,.86,.84,.88,.9];

  const daily_merchant_stats = [
    ...distribute(octShape, 22111100, "2025-10-01"),
    ...distribute(novShape, 24875000, "2025-11-01"),
  ];

  const monthly_revenue_2025 = [12810000, 13540000, 15260000, 14930000, 16620000, 17150000, 18030000, 19240000, 20510000, 22111100, 24875000]
    .map((v, i) => ({ month: `2025-${String(i + 1).padStart(2, "0")}`, gross_volume_minor: v }));

  // KPI summaries per date-range (what GET /dashboard/summary returns)
  function spark(seed, n, trend, vol) {
    const r = rng(seed);
    let v = 50;
    return Array.from({ length: n }, (_, i) => (v += trend + (r() - 0.45) * vol, Math.max(5, v + Math.sin(i * 1.3) * vol * .4)));
  }
  const dashboard_summaries = {
    today:        { total_revenue_minor: 1165000,  revenue_change_pct: 4.2,  success_rate_pct: 98.9, success_rate_change_pct: 0.2,  total_transactions: 94,   transactions_change_pct: 6.8,  failed_payments: 1,   failed_change_pct: -50.0 },
    last_7_days:  { total_revenue_minor: 6134000,  revenue_change_pct: 8.1,  success_rate_pct: 98.5, success_rate_change_pct: -0.1, total_transactions: 712,  transactions_change_pct: 9.4,  failed_payments: 11,  failed_change_pct: 2.3 },
    last_30_days: { total_revenue_minor: 24875000, revenue_change_pct: 12.5, success_rate_pct: 98.7, success_rate_change_pct: 0.3,  total_transactions: 2847, transactions_change_pct: 18.2, failed_payments: 36,  failed_change_pct: 5.1 },
    last_90_days: { total_revenue_minor: 66248000, revenue_change_pct: 21.4, success_rate_pct: 98.4, success_rate_change_pct: 0.6,  total_transactions: 7915, transactions_change_pct: 24.9, failed_payments: 127, failed_change_pct: -3.2 },
  };
  Object.entries(dashboard_summaries).forEach(([k, s], idx) => {
    const base = 100 + idx * 17;
    s.sparklines = {
      revenue: spark(base + 1, 16, 2.2, 14),
      success_rate: spark(base + 2, 16, 1.8, 16),
      transactions: spark(base + 3, 16, 2.0, 15),
      failed: spark(base + 4, 16, s.failed_change_pct > 0 ? 1.6 : -1.2, 18),
    };
  });

  // ---------------------------------------------------------------- notifications
  const notifications = [
    { id: "ntf_1", type: "payout",      title: "Payout settled",          body: "৳45,000.00 was sent to City Bank •••• 4521.",          created_at: "2025-11-30T10:05:00+06:00", read_at: null },
    { id: "ntf_2", type: "payment_failed", title: "Payment failed",       body: "#PGT-78450 from Tanvir Hasan via Rocket failed.",      created_at: "2025-11-30T12:13:00+06:00", read_at: null },
    { id: "ntf_3", type: "gateway",     title: "Bank Transfer pending",   body: "Upload your trade license to finish activation.",       created_at: "2025-11-29T18:40:00+06:00", read_at: null },
    { id: "ntf_4", type: "system",      title: "Monthly report ready",    body: "Your October 2025 statement is available to download.", created_at: "2025-11-01T09:00:00+06:00", read_at: "2025-11-01T11:00:00+06:00" },
  ];

  window.PG_MOCK = {
    MOCK_NOW, merchant, merchant_user, subscription,
    payment_providers, merchant_gateways,
    merchant_balance, payout_accounts, payout_rules, payouts, payment_links, support_tickets, merchant_settings, payment_preferences, merchant_team, security_settings,
    customers, transactions, refunds,
    daily_merchant_stats, monthly_revenue_2025, dashboard_summaries,
    notifications,
  };
})();
