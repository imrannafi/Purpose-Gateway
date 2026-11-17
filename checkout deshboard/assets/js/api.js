/**
 * API service layer.
 *
 * Every function here returns a Promise and currently resolves from
 * window.PG_MOCK. When the backend + database are ready, replace each
 * body with a fetch() call to the endpoint noted in the comment —
 * the UI (app.js) only talks to this module, so nothing else changes.
 *
 * SECURITY NOTE: raw card numbers / CVV must never reach our own server
 * or database. In production, card fields should be tokenized by the
 * payment processor's hosted fields / SDK, and only the token is sent
 * to `POST /payments`. See /database/README.md → "PCI scope".
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

  const api = {
    /** GET /checkout-sessions/:id  → { session, order, user, payment_methods } */
    async getCheckout(sessionId) {
      if (!USE_MOCK) return http("GET", `/checkout-sessions/${sessionId}`);
      await delay(150);
      return clone({ session: db.checkout_session, order: db.order, user: db.user, payment_methods: db.payment_methods, payment_providers: db.payment_providers });
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

    /**
     * POST /payments
     * body: { checkout_session_id, order_id, method_code, provider_code, amount_minor, currency, details }
     *  - card:           details = { token, brand, last4, exp_month, exp_year, cardholder_name, save_card }
     *  - mobile_banking: details = { provider, wallet_number }
     *  - wallet:         details = { wallet_type, wallet_token }
     *  - group:          details = { split_type, members: [{ name, contact, share_minor }] }
     * → payment row
     */
    async createPayment(payload) {
      if (!USE_MOCK) return http("POST", "/payments", payload);
      await delay(1600);
      const ref = "PGTX" + Math.random().toString(36).slice(2, 10).toUpperCase();
      const isGroup = payload.method_code === "group";
      db.order.status = isGroup ? "partially_paid" : "paid";
      db.checkout_session.current_step = "complete";
      return {
        id: "pay_" + Math.random().toString(36).slice(2, 12),
        gateway_reference: ref,
        status: isGroup ? "pending" : "succeeded",
        amount_minor: payload.amount_minor,
        currency: payload.currency,
        method_code: payload.method_code,
        provider_code: payload.provider_code,
        paid_at: new Date().toISOString(),
        group_share_code: isGroup ? "GRP-" + Math.random().toString(36).slice(2, 7).toUpperCase() : null,
      };
    },
  };

  window.PG_API = api;
})();
