/**
 * API service layer — the ONLY module the UI talks to.
 *
 * Every function returns a Promise. While USE_MOCK is true they resolve from
 * window.PG_MOCK. When the backend + database are live, set USE_MOCK = false:
 * each function already calls the REST endpoint written in its comment and
 * expects the same response shape (see /database/README.md → "API contract").
 */
(function () {
  const USE_MOCK = true;
  const BASE_URL = "/api/v1";
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const db = window.PG_MOCK;

  async function http(method, path, body) {
    const res = await fetch(BASE_URL + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(method !== "GET" ? { "Idempotency-Key": (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include", // session cookie (httpOnly) — see README → Auth
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw Object.assign(new Error(err.message || res.statusText), { status: res.status, code: err.code });
    }
    return res.status === 204 ? null : res.json();
  }
  const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== "" && v !== null)).toString();

  const providerMap = () => Object.fromEntries(db.payment_providers.map((p) => [p.code, p]));
  const customerMap = () => Object.fromEntries(db.customers.map((c) => [c.id, c]));

  /** Shape of a transaction row as the API returns it (joined, flat). */
  function toTxDTO(tx) {
    const p = providerMap()[tx.provider_code];
    const c = customerMap()[tx.customer_id] || {};
    return {
      ...tx,
      customer_name: c.full_name || "Guest",
      customer_email: c.email || null,
      customer_phone: c.phone || null,
      provider_name: p ? p.name : tx.provider_code,
    };
  }

  const api = {
    /** GET /me → { merchant, user, subscription } */
    async getSession() {
      if (!USE_MOCK) return http("GET", "/me");
      await delay(80);
      return clone({ merchant: db.merchant, user: db.merchant_user, subscription: db.subscription });
    },

    /** GET /dashboard/summary?range=last_30_days → KPI block (+ sparklines) */
    async getDashboardSummary(range = "last_30_days") {
      if (!USE_MOCK) return http("GET", `/dashboard/summary?${qs({ range })}`);
      await delay(220);
      return clone({ range, ...db.dashboard_summaries[range] });
    },

    /**
     * GET /dashboard/revenue?period=this_month
     * → { period, granularity, total_minor, previous_total_minor, change_pct, points:[{ date, value_minor }] }
     */
    async getRevenueSeries(period = "this_month") {
      if (!USE_MOCK) return http("GET", `/dashboard/revenue?${qs({ period })}`);
      await delay(200);
      let points, prev, granularity = "day";
      const toPts = (rows, key) => rows.map((r) => ({ date: r[key], value_minor: r.gross_volume_minor }));
      const sum = (rows) => rows.reduce((a, r) => a + r.gross_volume_minor, 0);
      const oct = db.daily_merchant_stats.filter((r) => r.stat_date.startsWith("2025-10"));
      const nov = db.daily_merchant_stats.filter((r) => r.stat_date.startsWith("2025-11"));
      if (period === "last_month") { points = toPts(oct, "stat_date"); prev = 20510000; }
      else if (period === "this_year") { points = toPts(db.monthly_revenue_2025, "month"); prev = 168420000; granularity = "month"; }
      else { points = toPts(nov, "stat_date"); prev = sum(oct); }
      const total = points.reduce((a, p) => a + p.value_minor, 0);
      return { period, granularity, total_minor: total, previous_total_minor: prev, change_pct: +(((total - prev) / prev) * 100).toFixed(1), points };
    },

    /** GET /balance → merchant_balances row */
    async getBalance() {
      if (!USE_MOCK) return http("GET", "/balance");
      await delay(120);
      return clone(db.merchant_balance);
    },

    /** GET /gateways → connected gateways (merchant_gateways ⨝ payment_providers) */
    async getConnectedGateways() {
      if (!USE_MOCK) return http("GET", "/gateways");
      await delay(140);
      const pm = providerMap();
      return clone(db.merchant_gateways.map((g) => ({ ...g, ...pm[g.provider_code], id: g.id })));
    },

    /**
     * GET /transactions?search=&status=&page=1&page_size=10
     * → { data:[TxDTO], page, page_size, total }
     */
    async listTransactions({ search = "", status = "all", page = 1, page_size = 10 } = {}) {
      if (!USE_MOCK) return http("GET", `/transactions?${qs({ search, status: status === "all" ? "" : status, page, page_size })}`);
      await delay(160);
      const q = search.trim().toLowerCase().replace(/^#/, "");
      let rows = db.transactions.map(toTxDTO);
      if (status !== "all") rows = rows.filter((t) => t.status === status);
      if (q) rows = rows.filter((t) => [t.public_id, t.customer_name, t.provider_name].some((v) => String(v).toLowerCase().includes(q)));
      const total = rows.length;
      const start = (page - 1) * page_size;
      return clone({ data: rows.slice(start, start + page_size), page, page_size, total });
    },

    /** GET /transactions/:public_id → TxDTO + events */
    async getTransaction(publicId) {
      if (!USE_MOCK) return http("GET", `/transactions/${encodeURIComponent(publicId)}`);
      await delay(100);
      const tx = db.transactions.find((t) => t.public_id === publicId);
      if (!tx) throw new Error("Transaction not found");
      return clone(toTxDTO(tx));
    },

    /** POST /transactions/:public_id/refunds { amount_minor, reason } → refund */
    async createRefund(publicId, { amount_minor, reason }) {
      if (!USE_MOCK) return http("POST", `/transactions/${encodeURIComponent(publicId)}/refunds`, { amount_minor, reason });
      await delay(500);
      const tx = db.transactions.find((t) => t.public_id === publicId);
      if (!tx || tx.status !== "success") throw new Error("Only successful payments can be refunded.");
      if (amount_minor > db.merchant_balance.available_minor) throw new Error("Not enough available balance for this refund.");
      tx.status = amount_minor >= tx.amount_minor ? "refunded" : "partially_refunded";
      tx.refunded_minor = amount_minor;
      db.merchant_balance.available_minor -= amount_minor;
      return { id: "rf_" + Date.now(), transaction_id: tx.id, amount_minor, reason, status: "pending" };
    },

    /** GET /payout-accounts → payout_accounts[] (+ rules) */
    async listPayoutAccounts() {
      if (!USE_MOCK) return http("GET", "/payout-accounts");
      await delay(80);
      return clone({ accounts: db.payout_accounts, rules: db.payout_rules });
    },

    /** POST /payouts { payout_account_id, amount_minor } → payout (balance is debited) */
    async createPayout({ payout_account_id, amount_minor }) {
      if (!USE_MOCK) return http("POST", "/payouts", { payout_account_id, amount_minor });
      await delay(700);
      if (amount_minor < db.payout_rules.min_payout_minor) throw new Error("Amount is below the minimum payout.");
      if (amount_minor > db.merchant_balance.available_minor) throw new Error("Amount exceeds your available balance.");
      db.merchant_balance.available_minor -= amount_minor;
      const payout = {
        id: "po_" + Date.now(),
        public_id: "PO-" + String(10240 + db.payouts.length + 1),
        payout_account_id, amount_minor, fee_minor: db.payout_rules.payout_fee_minor,
        currency: "BDT", status: "processing", requested_at: new Date().toISOString(),
      };
      db.payouts.unshift(payout);
      return clone(payout);
    },

    /** POST /payment-links { title, amount_minor|null, description } → payment_link */
    async createPaymentLink({ title, amount_minor, description }) {
      if (!USE_MOCK) return http("POST", "/payment-links", { title, amount_minor, description });
      await delay(500);
      const slug = (title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "pay") + "-" + Math.random().toString(36).slice(2, 7);
      const link = {
        id: "pl_" + Date.now(), slug, title, description: description || null,
        amount_minor: amount_minor ?? null, currency: "BDT", status: "active",
        url: `https://pay.purposegateway.com/${db.merchant.slug}/${slug}`,
        created_at: new Date().toISOString(),
      };
      db.payment_links.unshift(link);
      return clone(link);
    },

    /** GET /notifications?limit=20 → notifications[] newest first */
    async listNotifications() {
      if (!USE_MOCK) return http("GET", "/notifications?limit=20");
      await delay(90);
      return clone([...db.notifications].sort((a, b) => b.created_at.localeCompare(a.created_at)));
    },

    /** POST /notifications/read-all → 204 */
    async markAllNotificationsRead() {
      if (!USE_MOCK) return http("POST", "/notifications/read-all");
      const now = new Date().toISOString();
      db.notifications.forEach((n) => { n.read_at = n.read_at || now; });
      return null;
    },
  };

  window.PG_API = api;
  window.PG_NOW = () => (USE_MOCK ? new Date(db.MOCK_NOW) : new Date());
})();
