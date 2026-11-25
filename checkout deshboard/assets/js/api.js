/**
 * API service layer.
 *
 * Every function here returns a Promise. With USE_MOCK = true it resolves
 * from window.PG_MOCK (sandbox). When the backend is ready, set
 * USE_MOCK = false: each function then calls the endpoint noted in its
 * comment. The UI only talks to this module, so nothing else changes.
 *
 * SECURITY
 *  - Card: the PAN/CVV are tokenized in the browser by the processor's SDK
 *    (see tokenizeCard). Only the token + display metadata reach our server.
 *  - Mobile banking: we never collect OTP or PIN. The backend creates the
 *    payment with the MFS (bKash/Nagad/… checkout API) and returns the
 *    provider's hosted redirect_url. The customer authorizes there, and the
 *    provider redirects back to us; the backend verifies server-to-server.
 *  - Group: each contributor gets a provider-issued payment request
 *    (request-to-pay / payment link). Status comes from provider webhooks,
 *    which the UI polls through getGroupPayment().
 *  - Successful payments are only ever simulated when USE_MOCK is true.
 *    See /database/README.md → "PCI scope and security".
 */
(function () {
  const USE_MOCK = true;
  const BASE_URL = "/api/v1";
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const rid = (n = 10) => Math.random().toString(36).slice(2, 2 + n);
  const ref = () => "PGTX" + rid(8).toUpperCase();
  const db = window.PG_MOCK;

  async function http(method, path, body) {
    const res = await fetch(BASE_URL + path, {
      method,
      headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID?.() || String(Date.now()) },
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include",
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || res.statusText);
    return res.json();
  }

  function computeDiscount(order, coupon) {
    if (!coupon) return 0;
    let d = coupon.discount_type === "percentage"
      ? Math.round((order.subtotal_minor * coupon.discount_value) / 100)
      : coupon.discount_value;
    if (coupon.max_discount_minor != null) d = Math.min(d, coupon.max_discount_minor);
    return Math.min(d, order.subtotal_minor);
  }

  const markOrderPaid = () => {
    db.order.status = "paid";
    db.order.amount_paid_minor = db.order.total_minor;
    db.checkout_session.current_step = "complete";
  };

  // In-memory sandbox stores
  const sandboxPayments = new Map(); // payment_id → payment
  const sandboxGroups = new Map();   // group_id → group (+ per-member timeline)

  /* Sandbox group simulation: each contributor accepts after a few seconds
     and pays a few seconds later, like a real provider webhook would report.
     Statuses (UI ↔ DB member_status): pending ↔ invited, accepted, paid. */
  function groupSnapshot(g) {
    const now = Date.now();
    let collected = 0;
    g.members.forEach((m) => {
      if (g.status === "cancelled") return;
      if (now >= m._paidAt) { m.status = "paid"; m.paid_at = m.paid_at || new Date(m._paidAt).toISOString(); }
      else if (now >= m._acceptAt) m.status = "accepted";
      else m.status = "pending";
      if (m.status === "paid") collected += m.share_minor;
    });
    g.collected_minor = collected;
    if (g.status === "collecting" && collected >= g.total_minor) g.status = "funded";
    const out = clone(g);
    out.members.forEach((m) => { delete m._acceptAt; delete m._paidAt; });
    return out;
  }

  const api = {
    /** true while running against mock data. The UI shows a sandbox banner. */
    isSandbox: USE_MOCK,

    /** GET /checkout-sessions/:id → { session, order, user, wallet, payment_methods, payment_providers } */
    async getCheckout(sessionId) {
      if (!USE_MOCK) return http("GET", `/checkout-sessions/${sessionId}`);
      await delay(150);
      return clone({ session: db.checkout_session, order: db.order, user: db.user, wallet: db.wallet, payment_methods: db.payment_methods, payment_providers: db.payment_providers });
    },

    /** PATCH /checkout-sessions/:id  { current_step?, selected_method_code? } */
    async updateSession(sessionId, patch) {
      if (!USE_MOCK) return http("PATCH", `/checkout-sessions/${sessionId}`, patch);
      Object.assign(db.checkout_session, patch);
      return clone(db.checkout_session);
    },

    /** POST /orders/:id/coupon  { code } → updated order */
    async applyCoupon(orderId, code) {
      if (!USE_MOCK) return http("POST", `/orders/${orderId}/coupon`, { code });
      await delay(400);
      const coupon = db.coupons.find((c) => c.code === code.trim().toUpperCase() && c.is_active);
      if (!coupon) throw new Error("This coupon code is invalid or expired.");
      if (db.order.subtotal_minor < coupon.min_order_minor) throw new Error("Order total is below the minimum for this coupon.");
      const o = db.order;
      o.discount_minor = computeDiscount(o, coupon);
      o.coupon_code = coupon.code;
      o.total_minor = o.subtotal_minor - o.discount_minor + o.delivery_charge_minor + o.tax_minor;
      return clone(o);
    },

    /** DELETE /orders/:id/coupon */
    async removeCoupon(orderId) {
      if (!USE_MOCK) return http("DELETE", `/orders/${orderId}/coupon`);
      const o = db.order;
      o.discount_minor = 0; o.coupon_code = null;
      o.total_minor = o.subtotal_minor + o.delivery_charge_minor + o.tax_minor;
      return clone(o);
    },

    /* ------------------------------------------------------------------ */
    /*  Card                                                               */
    /* ------------------------------------------------------------------ */

    /**
     * Tokenize card data IN THE BROWSER with the processor's SDK.
     * Live: a processor adapter must register window.PG_CARD_TOKENIZER =
     * { tokenize({ number, exp_month, exp_year, cvc, name }) → { token, brand, last4 } }.
     * The raw PAN/CVV never go to our backend.
     */
    async tokenizeCard(card) {
      if (!USE_MOCK) {
        if (!window.PG_CARD_TOKENIZER) throw new Error("Card payments are not configured yet. Please choose another method.");
        return window.PG_CARD_TOKENIZER.tokenize(card);
      }
      await delay(500);
      return { token: "tok_sandbox_" + rid(14), brand: card.brand, last4: card.number.slice(-4) };
    },

    /**
     * POST /payments
     * body: { checkout_session_id, order_id, method_code, provider_code, amount_minor, currency, details }
     *  - card:   details = { token, brand, last4, exp_month, exp_year, cardholder_name, save_card }
     *  - wallet: details = { wallet_id }
     * → payment row. Live card payments may return
     *   { status: "requires_action", redirect_url } for 3-D Secure.
     */
    async createPayment(payload) {
      if (!USE_MOCK) return http("POST", "/payments", payload);
      await delay(1400);
      if (payload.method_code === "wallet") {
        if (db.wallet.balance_minor < payload.amount_minor) throw new Error("Insufficient wallet balance.");
        db.wallet.balance_minor -= payload.amount_minor;
      }
      markOrderPaid();
      return {
        id: "pay_" + rid(),
        gateway_reference: ref(),
        status: "succeeded",
        amount_minor: payload.amount_minor,
        currency: payload.currency,
        method_code: payload.method_code,
        provider_code: payload.provider_code,
        paid_at: new Date().toISOString(),
        wallet_balance_minor: payload.method_code === "wallet" ? db.wallet.balance_minor : undefined,
      };
    },

    /* ------------------------------------------------------------------ */
    /*  Mobile banking (redirect / hosted authorization)                   */
    /* ------------------------------------------------------------------ */

    /**
     * POST /payments  { method_code: "mobile_banking", provider_code, details: { wallet_number }, return_url }
     * The backend calls the provider's create-payment API and returns
     * { id, status: "requires_action", redirect_url } — the provider's own
     * page where the customer enters OTP + PIN.
     * Sandbox: redirect_url is null and the UI shows a simulated provider page.
     */
    async initiateMobilePayment(payload) {
      if (!USE_MOCK) return http("POST", "/payments", { ...payload, method_code: "mobile_banking" });
      await delay(1100);
      const p = {
        id: "pay_" + rid(),
        status: "requires_action",
        redirect_url: null,
        sandbox: true,
        amount_minor: payload.amount_minor,
        currency: payload.currency,
        method_code: "mobile_banking",
        provider_code: payload.provider_code,
      };
      sandboxPayments.set(p.id, p);
      return clone(p);
    },

    /** Sandbox only: stands in for the customer approving on the provider's page. */
    async sandboxAuthorize(paymentId, approved) {
      if (!USE_MOCK) throw new Error("sandboxAuthorize is not available in live mode.");
      await delay(300);
      const p = sandboxPayments.get(paymentId);
      if (!p) throw new Error("Payment not found.");
      p.status = approved ? "authorized" : "cancelled";
      return clone(p);
    },

    /**
     * GET /payments/:id — the backend has already verified the payment with
     * the provider (execute/verify API) after the callback.
     */
    async getPayment(paymentId) {
      if (!USE_MOCK) return http("GET", `/payments/${paymentId}`);
      await delay(900);
      const p = sandboxPayments.get(paymentId);
      if (!p) throw new Error("Payment not found.");
      if (p.status === "authorized") {
        p.status = "succeeded";
        p.gateway_reference = ref();
        p.provider_transaction_id = "TRX" + rid(8).toUpperCase();
        p.paid_at = new Date().toISOString();
        markOrderPaid();
      }
      return clone(p);
    },

    /* ------------------------------------------------------------------ */
    /*  Wallet                                                             */
    /* ------------------------------------------------------------------ */

    /** GET /wallet → { id, balance_minor, currency, wallet_number_masked, status } */
    async getWallet() {
      if (!USE_MOCK) return http("GET", "/wallet");
      await delay(250);
      return clone(db.wallet);
    },

    /* ------------------------------------------------------------------ */
    /*  Group payment                                                      */
    /* ------------------------------------------------------------------ */

    /**
     * POST /group-payments
     * body: { order_id, split_type, contributors: [{ name, phone, provider_code, share_minor }] }
     * The backend sends one provider payment request per contributor.
     * → { id, share_code, total_minor, collected_minor, status, members: [{ id, name, phone, provider_code, share_minor, status }] }
     */
    async createGroupPayment(payload) {
      if (!USE_MOCK) return http("POST", "/group-payments", payload);
      await delay(1200);
      const now = Date.now();
      const g = {
        id: "grp_" + rid(),
        share_code: "GRP-" + rid(5).toUpperCase(),
        total_minor: payload.contributors.reduce((a, c) => a + c.share_minor, 0),
        collected_minor: 0,
        currency: "BDT",
        status: "collecting",
        members: payload.contributors.map((c, i) => {
          const accept = now + 1800 + i * 1100 + Math.random() * 2200;
          return { id: "gm_" + rid(8), ...c, status: "pending", _acceptAt: accept, _paidAt: accept + 1800 + Math.random() * 2600 };
        }),
      };
      sandboxGroups.set(g.id, g);
      db.order.status = "partially_paid";
      return groupSnapshot(g);
    },

    /** GET /group-payments/:id — poll for per-contributor status. */
    async getGroupPayment(groupId) {
      if (!USE_MOCK) return http("GET", `/group-payments/${groupId}`);
      await delay(120);
      const g = sandboxGroups.get(groupId);
      if (!g) throw new Error("Group payment not found.");
      return groupSnapshot(g);
    },

    /** POST /group-payments/:id/members/:memberId/remind — re-sends the provider request. */
    async remindGroupMember(groupId, memberId) {
      if (!USE_MOCK) return http("POST", `/group-payments/${groupId}/members/${memberId}/remind`);
      await delay(400);
      const m = sandboxGroups.get(groupId)?.members.find((x) => x.id === memberId);
      if (m && m.status === "pending") { m._acceptAt = Date.now() + 900; m._paidAt = m._acceptAt + 1800; }
      return { ok: true };
    },

    /** POST /group-payments/:id/cancel — voids every open request. */
    async cancelGroupPayment(groupId) {
      if (!USE_MOCK) return http("POST", `/group-payments/${groupId}/cancel`);
      await delay(400);
      const g = sandboxGroups.get(groupId);
      if (g) g.status = "cancelled";
      db.order.status = "pending_payment";
      return { ok: true };
    },

    /**
     * POST /group-payments/:id/complete — once collected == total, settles the
     * order and returns the final payment row.
     */
    async completeGroupPayment(groupId) {
      if (!USE_MOCK) return http("POST", `/group-payments/${groupId}/complete`);
      await delay(1300);
      const g = sandboxGroups.get(groupId);
      const snap = g && groupSnapshot(g);
      if (!snap || snap.collected_minor < snap.total_minor) throw new Error("The full amount hasn't been collected yet.");
      g.status = "completed";
      markOrderPaid();
      return {
        id: "pay_" + rid(),
        gateway_reference: ref(),
        status: "succeeded",
        amount_minor: snap.total_minor,
        currency: snap.currency,
        method_code: "group",
        provider_code: "group",
        group_share_code: snap.share_code,
        contributors: snap.members.length,
        paid_at: new Date().toISOString(),
      };
    },
  };

  window.PG_API = api;
})();
