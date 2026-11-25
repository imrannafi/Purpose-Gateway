/* Purpose Gateway — Checkout core: shared state, helpers and UI primitives.
   Every module (card, mobile, wallet, group, success) and app.js use window.PG. */
(function () {
  "use strict";

  const PG = (window.PG = window.PG || {});
  PG.api = window.PG_API;
  PG.modules = {};

  /* ---------------- DOM ---------------- */
  PG.$ = (s, el = document) => el.querySelector(s);
  PG.$$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  /* ---------------- Constants ---------------- */
  // UI method key → DB payment_methods.code
  PG.METHOD_CODE = { card: "card", mobile: "mobile_banking", wallet: "wallet", group: "group" };
  PG.METHOD_LABEL = { card: "Card Payment", mobile: "Mobile Banking", wallet: "Wallet", group: "Group Payment" };
  PG.METHOD_ICON = { card: "i-card", mobile: "i-phone", wallet: "i-wallet", group: "i-users" };

  /* ---------------- State ---------------- */
  PG.state = {
    session: null,
    order: null,
    user: null,
    wallet: null,
    method: null,
    step: 1,
    mfsProviders: [],
    lastPayment: null,
  };

  /* ---------------- Event bus ---------------- */
  const handlers = {};
  PG.on = (evt, fn) => { (handlers[evt] = handlers[evt] || []).push(fn); };
  PG.emit = (evt, data) => (handlers[evt] || []).forEach((fn) => fn(data));

  /* ---------------- Formatting ---------------- */
  const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
  PG.money = (minor) => "৳ " + nf.format((minor || 0) / 100);
  PG.toMinor = (major) => Math.round((parseFloat(major) || 0) * 100);
  PG.initials = (name) => (name || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
  PG.escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /** Digits after +880 (leading 0 / 880 stripped). */
  PG.bdDigits = (v, max = 10) => {
    let d = String(v || "").replace(/\D/g, "");
    if (d.startsWith("880")) d = d.slice(3);
    if (d.startsWith("0")) d = d.slice(1);
    return d.slice(0, max);
  };
  /** 1712345678 → 1712-345678, 17123456789 → 1712-345678-9 */
  PG.formatBd = (d) => d.length > 10 ? `${d.slice(0, 4)}-${d.slice(4, 10)}-${d.slice(10)}` : d.length > 4 ? `${d.slice(0, 4)}-${d.slice(4)}` : d;
  PG.displayPhone = (d) => "+880 " + PG.formatBd(d);
  PG.maskPhone = (d) => d.length >= 8 ? `+880 ${d.slice(0, 2)}**-***${d.slice(-3)}` : "+880 " + d;
  PG.isBdMobile = (d) => /^1[3-9]\d{8}$/.test(d);

  PG.reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  PG.wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------------- Toast ---------------- */
  let toastTimer;
  PG.toast = (msg) => {
    const t = PG.$("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  };

  /* ---------------- Animated numbers ---------------- */
  const running = new WeakMap();
  PG.animateNumber = (el, to, { from, duration = 900, format = PG.money } = {}) => {
    const start = from ?? +(el.dataset.value || 0);
    el.dataset.value = to;
    cancelAnimationFrame(running.get(el));
    if (PG.reducedMotion() || start === to) { el.textContent = format(to); return; }
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = format(Math.round(start + (to - start) * e));
      if (p < 1) running.set(el, requestAnimationFrame(tick));
    };
    running.set(el, requestAnimationFrame(tick));
  };

  /* ---------------- View switching ----------------
     Shows the element in `views` whose `attr` equals `name`; hides the rest.
     `dir` = "forward" | "back" picks the slide direction. */
  PG.showView = (views, attr, name, dir = "forward") => {
    let shown = null;
    views.forEach((v) => {
      const on = v.getAttribute(attr) === name;
      if (on) {
        shown = v;
        if (!v.hidden) return;
        v.hidden = false;
        v.classList.remove("enter-forward", "enter-back");
        void v.offsetWidth;
        v.classList.add(dir === "back" ? "enter-back" : "enter-forward");
      } else {
        v.hidden = true;
      }
    });
    return shown;
  };

  /* ---------------- Buttons & fields ---------------- */
  PG.setLoading = (btn, on, label) => {
    const lbl = btn.querySelector(".pay-btn__label");
    if (on) {
      btn.dataset.prevLabel = lbl.textContent;
      if (label) lbl.textContent = label;
      btn.classList.add("is-loading");
      btn.setAttribute("aria-busy", "true");
    } else {
      btn.classList.remove("is-loading");
      btn.removeAttribute("aria-busy");
      if (btn.dataset.prevLabel != null) lbl.textContent = btn.dataset.prevLabel;
    }
  };

  PG.shake = (el) => { el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake"); };

  PG.formError = (scope, msg) => {
    const el = scope.querySelector(".form-error");
    if (el) el.textContent = msg || "";
  };

  PG.setFieldError = (input, msg) => {
    const field = input.closest(".field");
    const err = field && field.querySelector(".field__error");
    if (err) {
      err.textContent = msg || "";
      if (!err.id) err.id = "err-" + (input.id || Math.random().toString(36).slice(2));
      input.setAttribute("aria-describedby", err.id);
    }
    if (field) { field.classList.toggle("has-error", !!msg); field.classList.toggle("is-valid", !msg && !!input.value); }
    input.setAttribute("aria-invalid", msg ? "true" : "false");
  };

  /* ---------------- Provider logos ----------------
     Loads the provider's OFFICIAL logo file: <logo_url>.svg → .png → .webp.
     Results are cached per provider so each file is requested once.
     If no file exists the tile keeps a neutral initials badge — never a
     drawn or imitation logo. See assets/img/mfs/README.md. */
  const logoCache = new Map();
  function resolveLogo(p) {
    if (!p || !p.logo_url) return Promise.resolve(null);
    if (logoCache.has(p.code)) return logoCache.get(p.code);
    const exts = /\.(svg|png|webp|jpe?g)$/i.test(p.logo_url) ? [""] : [".svg", ".png", ".webp"];
    const promise = new Promise((resolve) => {
      let i = 0;
      const img = new Image();
      img.onload = () => resolve(img.src);
      img.onerror = () => (++i < exts.length ? (img.src = p.logo_url + exts[i]) : resolve(null));
      img.src = p.logo_url + exts[0];
    });
    logoCache.set(p.code, promise);
    return promise;
  }
  PG.provider = (code) => PG.state.mfsProviders.find((p) => p.code === code) || null;

  /** Markup for a logo tile; call PG.hydrateLogos(root) after inserting. */
  PG.logoTile = (p, cls = "") => p
    ? `<span class="logo-tile ${cls}" data-logo="${PG.escapeHtml(p.code)}"><span class="logo-tile__mono" aria-hidden="true">${PG.escapeHtml(p.name.replace(/[^A-Za-z]/g, "").slice(0, 2))}</span></span>`
    : `<span class="logo-tile ${cls}"><span class="logo-tile__mono" aria-hidden="true">?</span></span>`;

  PG.hydrateLogos = (root = document) => {
    PG.$$("[data-logo]:not(.is-hydrated)", root).forEach((box) => {
      box.classList.add("is-hydrated");
      const p = PG.provider(box.dataset.logo);
      resolveLogo(p).then((src) => {
        if (!src) return;
        const img = new Image();
        img.alt = p.name + " logo";
        img.decoding = "async";
        img.src = src;
        box.classList.add("has-logo");
        box.replaceChildren(img);
      });
    });
  };

  /* ---------------- Modal ---------------- */
  let lastFocus = null;
  const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';
  PG.openModal = (modal, { onClose, initialFocus } = {}) => {
    lastFocus = document.activeElement;
    modal.hidden = false;
    modal.classList.remove("is-closing");
    document.body.classList.add("has-modal");
    modal._onClose = onClose;
    modal._keys = (e) => {
      if (e.key === "Escape") { e.preventDefault(); PG.closeModal(modal, "escape"); }
      if (e.key === "Tab") {
        const f = PG.$$(FOCUSABLE, modal).filter((el) => el.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener("keydown", modal._keys);
    requestAnimationFrame(() => (initialFocus || PG.$(FOCUSABLE, modal))?.focus({ preventScroll: true }));
  };
  PG.closeModal = (modal, reason) => {
    if (modal.hidden) return;
    document.removeEventListener("keydown", modal._keys);
    modal.classList.add("is-closing");
    const done = () => {
      modal.hidden = true;
      modal.classList.remove("is-closing");
      document.body.classList.remove("has-modal");
      lastFocus?.focus?.({ preventScroll: true });
      modal._onClose?.(reason);
    };
    PG.reducedMotion() ? done() : setTimeout(done, 220);
  };

  /* ---------------- Confetti ----------------
     Lightweight canvas burst in theme colours; skipped for reduced motion. */
  PG.confetti = (canvas, { duration = 2600, count = 150 } = {}) => {
    if (PG.reducedMotion() || !canvas.getContext) return;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = (canvas.width = innerWidth * dpr);
    const H = (canvas.height = innerHeight * dpr);
    const colors = ["#1a4fe8", "#3c8bff", "#9fd0ff", "#6d3cf0", "#8b7bff", "#16a34a", "#ffd77a"];
    const parts = Array.from({ length: count }, () => ({
      x: W / 2 + (Math.random() - 0.5) * W * 0.25,
      y: H * 0.42,
      vx: (Math.random() - 0.5) * 16 * dpr,
      vy: (-Math.random() * 15 - 6) * dpr,
      w: (6 + Math.random() * 6) * dpr,
      h: (8 + Math.random() * 8) * dpr,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      c: colors[(Math.random() * colors.length) | 0],
      round: Math.random() < 0.3,
    }));
    const t0 = performance.now();
    const frame = (t) => {
      const el = t - t0;
      ctx.clearRect(0, 0, W, H);
      parts.forEach((p) => {
        p.vy += 0.42 * dpr; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - el / duration);
        ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
        if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill(); }
        else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 2);
        ctx.restore();
      });
      if (el < duration) requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
    };
    requestAnimationFrame(frame);
  };

  /* ---------------- Amount labels ----------------
     <span data-amount-label="Pay"> → "Pay ৳ 95,000" (refreshed on order change). */
  PG.refreshAmountLabels = () => {
    PG.$$("[data-amount-label]").forEach((el) => {
      if (el.closest(".is-loading")) return;
      el.textContent = `${el.dataset.amountLabel} ${PG.money(PG.state.order.total_minor)}`;
    });
  };
})();
