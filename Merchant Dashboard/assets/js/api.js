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

  function withDuplicateFlags(rows) {
    const flagged = rows.map((tx) => ({ ...tx, is_duplicate: Boolean(tx.is_duplicate), duplicate_of: tx.duplicate_of || null }));
    const chronological = [...flagged].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    for (let i = 0; i < chronological.length; i++) {
      const current = chronological[i];
      if (["failed", "cancelled"].includes(current.status)) continue;
      const currentTime = new Date(current.created_at).getTime();
      for (let j = i - 1; j >= 0; j--) {
        const previous = chronological[j];
        const elapsed = currentTime - new Date(previous.created_at).getTime();
        if (elapsed > 10 * 60 * 1000) break;
        if (["failed", "cancelled"].includes(previous.status)) continue;
        const samePayer = current.card_last4 && previous.card_last4
          ? current.card_last4 === previous.card_last4
          : current.payer_account_masked && previous.payer_account_masked
            ? current.payer_account_masked === previous.payer_account_masked
            : current.customer_id === previous.customer_id;
        if (current.amount_minor !== previous.amount_minor || current.provider_code !== previous.provider_code || !samePayer) continue;
        current.is_duplicate = true;
        current.duplicate_of = previous.public_id;
        previous.is_duplicate = true;
        break;
      }
    }
    return flagged;
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

    /** GET /payment-providers → provider catalog joined with merchant connection state */
    async getPaymentProviders() {
      if (!USE_MOCK) return http("GET", "/payment-providers");
      await delay(120);
      const gateways = Object.fromEntries(db.merchant_gateways.map((gateway) => [gateway.provider_code, gateway]));
      return clone([...db.payment_providers].sort((a, b) => a.sort_order - b.sort_order).map((provider) => {
        const gateway = gateways[provider.code];
        return { ...provider, status: gateway ? gateway.status : null, environment: gateway ? gateway.environment : null, connected_at: gateway ? gateway.connected_at : null };
      }));
    },

    /** GET /payment-preferences → preferred provider by payment method category */
    async getPaymentPreferences() {
      if (!USE_MOCK) return http("GET", "/payment-preferences");
      await delay(80);
      return clone(db.payment_preferences);
    },

    /** PATCH /payment-preferences { mobile_banking, card, bank_transfer } */
    async updatePaymentPreferences(preferences) {
      if (!USE_MOCK) return http("PATCH", "/payment-preferences", preferences);
      await delay(160);
      const categories = ["mobile_banking", "card", "bank_transfer"];
      const providers = providerMap();
      for (const category of categories) {
        const code = preferences[category] || "";
        if (!code) continue;
        const provider = providers[code];
        const gateway = db.merchant_gateways.find((item) => item.provider_code === code);
        if (!provider || provider.method_code !== category || !gateway || gateway.status !== "active" || provider.availability !== "available") {
          throw new Error(`Choose an enabled, available provider for ${category.replace(/_/g, " ")}.`);
        }
      }
      categories.forEach((category) => { db.payment_preferences[category] = preferences[category] || ""; });
      return clone(db.payment_preferences);
    },

    /**
     * GET /transactions?search=&status=&page=1&page_size=10
     * → { data:[TxDTO], page, page_size, total }
     */
    async listTransactions({
      search = "", status = "all", page = 1, page_size = 10,
      date_from, date_to, min_amount_minor, max_amount_minor, method, duplicates_only = false,
    } = {}) {
      if (!USE_MOCK) return http("GET", `/transactions?${qs({
        search, status: status === "all" ? "" : status, page, page_size,
        date_from, date_to, min_amount_minor, max_amount_minor,
        method: method === "all" ? "" : method, duplicates_only: duplicates_only ? "true" : "",
      })}`);
      await delay(160);
      const q = search.trim().toLowerCase().replace(/^#/, "");
      let rows = withDuplicateFlags(db.transactions.map(toTxDTO));
      if (status !== "all") rows = rows.filter((t) => t.status === status);
      if (q) rows = rows.filter((t) => [t.public_id, t.customer_name].some((v) => String(v).toLowerCase().includes(q)));
      const dateKey = (iso) => {
        const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
        const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
        return `${values.year}-${values.month}-${values.day}`;
      };
      if (date_from) rows = rows.filter((t) => dateKey(t.created_at) >= date_from);
      if (date_to) rows = rows.filter((t) => dateKey(t.created_at) <= date_to);
      if (min_amount_minor != null) rows = rows.filter((t) => t.amount_minor >= min_amount_minor);
      if (max_amount_minor != null) rows = rows.filter((t) => t.amount_minor <= max_amount_minor);
      if (method && method !== "all") rows = rows.filter((t) => t.provider_code === method);
      if (duplicates_only) rows = rows.filter((t) => t.is_duplicate);
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
      const marked = withDuplicateFlags(db.transactions.map(toTxDTO));
      return clone(marked.find((item) => item.public_id === publicId));
    },

    /** GET /refunds → refund requests newest first */
    async listRefunds() {
      if (!USE_MOCK) return http("GET", "/refunds");
      await delay(120);
      const now = Date.now();
      db.refunds.forEach((refund) => {
        const age = now - new Date(refund.requested_at).getTime();
        const nextStatus = age >= 15000 ? "succeeded" : age >= 5000 ? "processing" : "pending";
        if (["pending", "processing"].includes(refund.status) && nextStatus !== refund.status) {
          refund.status = nextStatus;
          refund.updated_at = new Date(now).toISOString();
        }
      });
      return clone([...db.refunds].sort((a, b) => b.requested_at.localeCompare(a.requested_at)));
    },

    /** POST /transactions/:public_id/refunds { amount_minor, reason } → refund */
    async createRefund(publicId, { amount_minor, reason }) {
      if (!USE_MOCK) return http("POST", `/transactions/${encodeURIComponent(publicId)}/refunds`, { amount_minor, reason });
      await delay(500);
      const tx = db.transactions.find((t) => t.public_id === publicId);
      if (!tx || !["success", "partially_refunded"].includes(tx.status)) throw new Error("Only successful payments with a refundable balance can be refunded.");
      if (!Number.isSafeInteger(amount_minor) || amount_minor <= 0) throw new Error("Refund amount must be a positive whole number of minor currency units.");
      if (!["requested_by_customer", "duplicate", "fraudulent", "other"].includes(reason)) throw new Error("Select a valid refund reason.");
      const alreadyRefunded = tx.refunded_minor || 0;
      const remainingMinor = tx.amount_minor - alreadyRefunded;
      if (amount_minor > remainingMinor) throw new Error("Refund amount exceeds the remaining refundable balance.");
      if (amount_minor > db.merchant_balance.available_minor) throw new Error("Not enough available balance for this refund.");
      tx.refunded_minor = alreadyRefunded + amount_minor;
      tx.status = tx.refunded_minor >= tx.amount_minor ? "refunded" : "partially_refunded";
      tx.net_minor = Math.max(0, tx.amount_minor - tx.fee_minor - tx.refunded_minor);
      db.merchant_balance.available_minor -= amount_minor;
      const customer = customerMap()[tx.customer_id] || {};
      const now = new Date().toISOString();
      const refund = {
        id: "rf_" + Date.now(),
        transaction_id: tx.id,
        transaction_public_id: tx.public_id,
        customer_name: customer.full_name || "Guest",
        amount_minor,
        reason,
        status: "pending",
        requested_at: now,
        updated_at: now,
      };
      db.refunds.unshift(refund);
      return clone(refund);
    },

    /** GET /payout-accounts → payout_accounts[] (+ rules) */
    async listPayoutAccounts() {
      if (!USE_MOCK) return http("GET", "/payout-accounts");
      await delay(80);
      return clone({ accounts: db.payout_accounts, rules: db.payout_rules });
    },

    /** GET /payouts → payout history, newest first */
    async listPayouts() {
      if (!USE_MOCK) return http("GET", "/payouts");
      await delay(100);
      return clone([...db.payouts].sort((a, b) => b.requested_at.localeCompare(a.requested_at)));
    },

    /** PATCH /payout-accounts/:id/default */
    async setDefaultPayoutAccount(id) {
      if (!USE_MOCK) return http("PATCH", `/payout-accounts/${encodeURIComponent(id)}/default`);
      const account = db.payout_accounts.find((a) => a.id === id);
      if (!account) throw new Error("Payout account not found.");
      db.payout_accounts.forEach((a) => { a.is_default = a.id === id; });
      return clone(account);
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
        amount_minor: amount_minor ?? null, currency: "BDT", status: "active", uses_count: 0,
        url: `https://pay.purposegateway.com/${db.merchant.slug}/${slug}`,
        created_at: new Date().toISOString(),
      };
      db.payment_links.unshift(link);
      return clone(link);
    },

    /** GET /payment-links → links, newest first */
    async listPaymentLinks() {
      if (!USE_MOCK) return http("GET", "/payment-links");
      await delay(100);
      return clone([...db.payment_links].sort((a, b) => b.created_at.localeCompare(a.created_at)));
    },

    /** PATCH /payment-links/:id { status } */
    async updatePaymentLinkStatus(id, status) {
      if (!USE_MOCK) return http("PATCH", `/payment-links/${encodeURIComponent(id)}`, { status });
      const link = db.payment_links.find((item) => item.id === id);
      if (!link) throw new Error("Payment link not found.");
      if (!["active", "paused"].includes(status)) throw new Error("Invalid payment link status.");
      link.status = status;
      return clone(link);
    },

    /** PATCH /settings/profile → updated merchant and account owner */
    async updateProfile(profile) {
      if (!USE_MOCK) return http("PATCH", "/settings/profile", profile);
      await delay(250);
      db.merchant.business_name = profile.business_name.trim();
      db.merchant.legal_name = profile.legal_name.trim() || null;
      db.merchant.business_type = profile.business_type;
      db.merchant.industry = profile.industry.trim() || null;
      db.merchant.email = profile.business_email.trim();
      db.merchant.phone = profile.phone.trim() || null;
      db.merchant.website_url = profile.website_url.trim() || null;
      db.merchant.address_line1 = profile.address_line1.trim() || null;
      db.merchant.city = profile.city.trim() || null;
      db.merchant.postal_code = profile.postal_code.trim() || null;
      db.merchant_user.full_name = profile.full_name.trim();
      db.merchant_user.email = profile.email.trim();
      return clone({ merchant: db.merchant, user: db.merchant_user });
    },

    /** GET /settings */
    async getMerchantSettings() {
      if (!USE_MOCK) return http("GET", "/settings");
      await delay(80);
      return clone(db.merchant_settings);
    },

    /** PATCH /settings { payout_schedule, notify_email, notify_sms } */
    async updateMerchantSettings(settings) {
      if (!USE_MOCK) return http("PATCH", "/settings", settings);
      await delay(200);
      const schedules = ["manual", "daily", "weekly", "monthly"];
      if (!schedules.includes(settings.payout_schedule)) throw new Error("Invalid payout schedule.");
      db.merchant_settings.payout_schedule = settings.payout_schedule;
      db.merchant_settings.notify_email = { ...settings.notify_email };
      db.merchant_settings.notify_sms = { ...settings.notify_sms };
      return clone(db.merchant_settings);
    },

    /** GET /settings/team → merchant team members */
    async listTeamMembers() {
      if (!USE_MOCK) return http("GET", "/settings/team");
      await delay(100);
      return clone(db.merchant_team);
    },

    /** POST /settings/team/invitations { email, role } */
    async inviteTeamMember({ email, role }) {
      if (!USE_MOCK) return http("POST", "/settings/team/invitations", { email, role });
      await delay(180);
      const allowedRoles = ["admin", "finance", "developer", "support", "viewer"];
      const normalizedEmail = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error("Enter a valid email address.");
      if (!allowedRoles.includes(role)) throw new Error("Choose a valid team role.");
      if (db.merchant_team.some((member) => member.email.toLowerCase() === normalizedEmail)) throw new Error("This email is already on the team or has an invitation.");
      const member = {
        id: "usr_" + Date.now(),
        full_name: "",
        email: normalizedEmail,
        role,
        status: "invited",
        invited_at: new Date().toISOString(),
      };
      db.merchant_team.push(member);
      return clone(member);
    },

    /** DELETE /settings/team/:id */
    async removeTeamMember(id) {
      if (!USE_MOCK) return http("DELETE", `/settings/team/${encodeURIComponent(id)}`);
      await delay(120);
      const index = db.merchant_team.findIndex((member) => member.id === id);
      if (index < 0) throw new Error("Team member not found.");
      if (db.merchant_team[index].role === "owner") throw new Error("The merchant owner cannot be removed.");
      return clone(db.merchant_team.splice(index, 1)[0]);
    },

    /** POST /security/password { current_password, new_password } */
    async changePassword({ current_password, new_password }) {
      if (!USE_MOCK) return http("POST", "/security/password", { current_password, new_password });
      await delay(180);
      if (!current_password || current_password.length < 8) throw new Error("Current password could not be verified.");
      if (typeof new_password !== "string" || new_password.length < 12) throw new Error("New password must be at least 12 characters.");
      return { changed: true };
    },

    /** GET /security/two-factor */
    async getTwoFactorStatus() {
      if (!USE_MOCK) return http("GET", "/security/two-factor");
      await delay(80);
      return clone(db.security_settings);
    },

    /** POST /security/two-factor/setup → setup information for authenticator enrollment */
    async startTwoFactorSetup() {
      if (!USE_MOCK) return http("POST", "/security/two-factor/setup", {});
      await delay(120);
      return {
        setup_uri: "otpauth://totp/Purpose%20Gateway:merchant-demo?secret=JBSWY3DPEHPK3PXP&issuer=Purpose%20Gateway",
        demo_code: "123456",
        demo_only: true,
      };
    },

    /** POST /security/two-factor/confirm { code } */
    async confirmTwoFactor(code) {
      if (!USE_MOCK) return http("POST", "/security/two-factor/confirm", { code });
      await delay(120);
      if (!/^\d{6}$/.test(code) || code !== "123456") throw new Error("Verification code is invalid or expired.");
      db.security_settings.two_factor_enabled = true;
      return clone(db.security_settings);
    },

    /** DELETE /security/two-factor { code } */
    async disableTwoFactor(code) {
      if (!USE_MOCK) return http("DELETE", "/security/two-factor", { code });
      await delay(120);
      if (!/^\d{6}$/.test(code) || code !== "123456") throw new Error("Verification code is invalid or expired.");
      db.security_settings.two_factor_enabled = false;
      return clone(db.security_settings);
    },

    /** PATCH /gateways/:provider_code { status } */
    async updateGatewayStatus(providerCode, status) {
      if (!USE_MOCK) return http("PATCH", `/gateways/${encodeURIComponent(providerCode)}`, { status });
      await delay(140);
      const gateway = db.merchant_gateways.find((item) => item.provider_code === providerCode);
      if (!gateway) throw new Error("Gateway not found.");
      if (!["active", "inactive", "pending"].includes(status)) throw new Error("Invalid gateway status.");
      const provider = providerMap()[providerCode];
      if (!provider) throw new Error("Payment provider not found.");
      if (status === "active" && provider.availability !== "available") throw new Error("This provider is currently unavailable.");
      gateway.status = status;
      if (status === "active" && !gateway.connected_at) gateway.connected_at = new Date().toISOString();
      if (status !== "active" && db.payment_preferences[provider.method_code] === providerCode) {
        const fallback = db.merchant_gateways.find((item) => {
          const candidate = providerMap()[item.provider_code];
          return item.status === "active" && candidate.method_code === provider.method_code && candidate.availability === "available";
        });
        db.payment_preferences[provider.method_code] = fallback ? fallback.provider_code : "";
      }
      return clone(gateway);
    },

    /** POST /gateways { provider_code } → starts secure provider connection/setup */
    async connectGateway(providerCode) {
      if (!USE_MOCK) return http("POST", "/gateways", { provider_code: providerCode });
      await delay(220);
      const provider = providerMap()[providerCode];
      if (!provider) throw new Error("Payment provider not found.");
      if (provider.availability !== "available") throw new Error("This provider is currently unavailable.");
      const existing = db.merchant_gateways.find((item) => item.provider_code === providerCode);
      if (existing) {
        existing.status = "active";
        existing.environment = "live";
        existing.connected_at = existing.connected_at || new Date().toISOString();
      } else {
        db.merchant_gateways.push({
          id: "gw_" + Date.now(),
          provider_code: providerCode,
          status: "active",
          environment: "live",
          connected_at: new Date().toISOString(),
        });
      }
      if (!db.payment_preferences[provider.method_code]) db.payment_preferences[provider.method_code] = providerCode;
      return clone(db.merchant_gateways.find((item) => item.provider_code === providerCode));
    },

    /** POST /support/tickets { category, subject, message } */
    async createSupportTicket({ category, subject, message, related_transaction_id }) {
      if (!USE_MOCK) return http("POST", "/support/tickets", { category, subject, message, related_transaction_id });
      await delay(350);
      const relatedTransaction = related_transaction_id
        ? db.transactions.find((tx) => tx.public_id.toLowerCase() === related_transaction_id.trim().replace(/^#/, "").toLowerCase())
        : null;
      if (related_transaction_id && !relatedTransaction) throw new Error("Transaction ID not found. Check the ID and try again.");
      const ticket = {
        id: "tkt_" + Date.now(),
        public_id: "TKT-" + String(5001 + db.support_tickets.length),
        category, subject: subject.trim(), message: message.trim(),
        related_transaction_id: relatedTransaction ? relatedTransaction.id : null,
        related_transaction_public_id: relatedTransaction ? relatedTransaction.public_id : null,
        messages: [{ author_type: "merchant_user", author_name: db.merchant_user.full_name, body: message.trim(), created_at: new Date().toISOString() }],
        status: "open", created_at: new Date().toISOString(),
      };
      db.support_tickets.unshift(ticket);
      return clone(ticket);
    },

    /** GET /support/tickets */
    async listSupportTickets() {
      if (!USE_MOCK) return http("GET", "/support/tickets");
      await delay(100);
      return clone([...db.support_tickets].sort((a, b) => b.created_at.localeCompare(a.created_at)));
    },

    /** GET /support/tickets/:public_id */
    async getSupportTicket(publicId) {
      if (!USE_MOCK) return http("GET", `/support/tickets/${encodeURIComponent(publicId)}`);
      await delay(80);
      const ticket = db.support_tickets.find((item) => item.public_id === publicId);
      if (!ticket) throw new Error("Support request not found.");
      return clone(ticket);
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
