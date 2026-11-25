/* Purpose Gateway — Checkout controller: order summary, stepper, method
   selection (step 1) → payment interface (step 2), coupon, account menu. */
(function () {
  "use strict";

  const PG = window.PG;
  const { $, $$, money, escapeHtml, state, api } = PG;
  const PANELS = { card: "#cardForm", mobile: "#mobilePanel", wallet: "#walletPanel", group: "#groupPanel" };

  const LAPTOP_SVG = `
  <svg viewBox="0 0 120 80" aria-hidden="true">
    <defs>
      <linearGradient id="scr" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#1b0b3a"/><stop offset=".45" stop-color="#6b2fd6"/><stop offset=".7" stop-color="#c37bff"/><stop offset="1" stop-color="#2a0f5c"/>
      </linearGradient>
      <linearGradient id="base" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9ebf0"/><stop offset="1" stop-color="#a9aebb"/></linearGradient>
    </defs>
    <rect x="18" y="6" width="84" height="56" rx="4" fill="#2b2d33"/>
    <rect x="21" y="9" width="78" height="50" rx="2" fill="url(#scr)"/>
    <path d="M21 50c18-16 30-30 78-36v10C64 26 46 38 34 59H21Z" fill="#fff" opacity=".12"/>
    <path d="M40 59c10-18 26-32 59-38v4C72 30 56 42 48 59Z" fill="#fff" opacity=".18"/>
    <rect x="57" y="9" width="6" height="2" rx="1" fill="#111"/>
    <path d="M6 62h108l-4 7a4 4 0 0 1-3.5 2h-93A4 4 0 0 1 10 69Z" fill="url(#base)"/>
    <rect x="50" y="62" width="20" height="2.5" rx="1.2" fill="#8b909c"/>
  </svg>`;

  /* ---------------- Order summary ---------------- */
  function renderOrder() {
    const o = state.order;
    $("#orderItems").innerHTML = o.items.map((it) => {
      const a = it.variant_attributes || {};
      const meta = [a.screen, a.ram, a.storage].filter(Boolean).map(escapeHtml).join("<i>•</i>");
      const thumb = it.image_url ? `<img src="${escapeHtml(it.image_url)}" alt="" loading="lazy">` : LAPTOP_SVG;
      return `
        <li class="item">
          <div class="item__thumb">${thumb}</div>
          <div>
            <p class="item__name">${escapeHtml(it.product_name)}</p>
            ${meta ? `<p class="item__meta">${meta}</p>` : ""}
            ${a.color ? `<span class="item__chip">${escapeHtml(a.color)}</span>` : ""}
          </div>
          <div class="item__price">
            <strong>${money(it.line_total_minor)}</strong>
            <span>× ${it.quantity}</span>
          </div>
        </li>`;
    }).join("");

    $("#subtotal").textContent = money(o.subtotal_minor);
    const d = $("#discount");
    d.textContent = "- " + money(o.discount_minor);
    d.classList.toggle("is-discount", o.discount_minor > 0);
    $("#delivery").textContent = money(o.delivery_charge_minor);
    PG.animateNumber($("#total"), o.total_minor, { duration: 700 });
    PG.refreshAmountLabels();
    Object.values(PG.modules).forEach((m) => m.onOrder?.());
  }

  function renderUser() {
    $$("[data-bind]").forEach((el) => {
      const [obj, key] = el.dataset.bind.split(".");
      if (obj === "user" && state.user?.[key]) el.textContent = state.user[key];
    });
  }

  /* ---------------- Stepper ---------------- */
  function setStep(step) {
    state.step = step;
    $$(".stepper__step").forEach((li) => {
      const n = +li.dataset.step;
      li.classList.toggle("is-active", n === step);
      li.classList.toggle("is-done", n < step || (step === 3 && n === 3));
      if (n === step) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
    $$(".stepper__line span").forEach((l, i) => l.style.setProperty("--p", step > i + 1 ? 1 : 0));
    $("#stepper").classList.toggle("can-go-back", step === 2 && !state.groupLocked);
    const stepName = ["", "payment_method", "payment_details", "complete"][step];
    if (state.session && state.session.current_step !== stepName) {
      state.session.current_step = stepName;
      api.updateSession(state.session.id, { current_step: stepName });
    }
  }

  /* ---------------- Step 1 → Step 2 ---------------- */
  function markMethod(method) {
    $$(".method").forEach((b) => {
      const on = b.dataset.method === method;
      b.classList.toggle("is-selected", on);
      b.setAttribute("aria-checked", on);
    });
  }

  function chooseMethod(method) {
    if (!PG.METHOD_CODE[method]) return;
    markMethod(method);
    // Brief pause so the selection animation registers before moving on.
    setTimeout(() => openDetails(method), PG.reducedMotion() ? 0 : 380);
  }

  function openDetails(method, { scroll = true } = {}) {
    if (state.groupLocked && method !== "group") { PG.toast("Cancel the group requests first to use another method."); method = "group"; }
    state.method = method;
    markMethod(method);
    api.updateSession(state.session.id, { selected_method_code: PG.METHOD_CODE[method] });

    $("#detailsMethod").innerHTML = `<svg><use href="#${PG.METHOD_ICON[method]}"/></svg>${escapeHtml(PG.METHOD_LABEL[method])}`;
    Object.entries(PANELS).forEach(([k, sel]) => { $(sel).hidden = k !== method; });
    const panel = $(PANELS[method]);
    panel.classList.remove("enter-forward"); void panel.offsetWidth; panel.classList.add("enter-forward");

    PG.showView($$("#stage > .view"), "data-view", "details", "forward");
    setStep(2);
    PG.modules[method]?.show?.();
    if (scroll && window.innerWidth <= 1100) $(".pay").scrollIntoView({ behavior: PG.reducedMotion() ? "auto" : "smooth", block: "start" });
  }

  function backToMethods() {
    if (state.groupLocked) { PG.toast("Cancel the group requests first to change method."); return; }
    PG.showView($$("#stage > .view"), "data-view", "methods", "back");
    setStep(1);
    $("#payTitle").focus({ preventScroll: true });
  }

  function restart() {
    Object.values(PG.modules).forEach((m) => m.reset?.());
    state.method = null;
    state.groupLocked = false;
    markMethod(null);
    PG.emit("group-lock", false);
    PG.showView($$("#stage > .view"), "data-view", "methods", "back");
    setStep(1);
    api.getWallet().then((w) => { state.wallet = w; PG.modules.wallet.render(); }).catch(() => {});
  }

  /* ---------------- Bindings ---------------- */
  function bindUI() {
    const methods = $("#methods");
    methods.addEventListener("click", (e) => {
      const b = e.target.closest(".method"); if (b) chooseMethod(b.dataset.method);
    });
    // Arrow keys move focus; Enter/Space choose (choosing advances to step 2).
    methods.addEventListener("keydown", (e) => {
      const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      if (!keys[e.key]) return;
      e.preventDefault();
      const list = $$(".method");
      const i = Math.max(0, list.indexOf(document.activeElement));
      list[(i + keys[e.key] + list.length) % list.length].focus();
    });

    $$("[data-select-method]").forEach((el) => el.addEventListener("click", () => openDetails(el.dataset.selectMethod)));
    document.addEventListener("click", (e) => {
      const b = e.target.closest("[data-goto-method]");
      if (!b) return;
      b.dataset.gotoMethod === "methods" ? backToMethods() : openDetails(b.dataset.gotoMethod);
    });

    $("#backToMethods").addEventListener("click", backToMethods);
    $('[data-goto-step="1"]').addEventListener("click", () => { if (state.step === 2) backToMethods(); });

    PG.on("step", setStep);
    PG.on("restart", restart);
    PG.on("group-lock", (locked) => {
      $("#backToMethods").disabled = locked;
      $("#backToMethods").title = locked ? "Cancel the group requests to change method" : "";
      $("#couponInput").disabled = locked;
      $("#couponForm button").disabled = locked;
      $("#stepper").classList.toggle("can-go-back", state.step === 2 && !locked);
    });

    // Coupon
    $("#couponForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = $("#couponInput");
      const msg = $("#couponMsg");
      const code = input.value.trim();
      if (!code) { msg.className = "coupon__msg err"; msg.textContent = "Please enter a code."; return; }
      msg.className = "coupon__msg"; msg.textContent = "Checking…";
      try {
        state.order = await api.applyCoupon(state.order.id, code);
        renderOrder();
        msg.className = "coupon__msg ok";
        msg.textContent = `${state.order.coupon_code} applied — you saved ${money(state.order.discount_minor)}.`;
      } catch (err) {
        msg.className = "coupon__msg err"; msg.textContent = err.message;
      }
    });

    // Account menu
    const accBtn = $("#accountBtn"), accMenu = $("#accountMenu");
    const closeMenu = () => { accMenu.hidden = true; accBtn.setAttribute("aria-expanded", "false"); };
    accBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = accMenu.hidden;
      accMenu.hidden = !open; accBtn.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("click", (e) => { if (!accMenu.hidden && !accMenu.contains(e.target)) closeMenu(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !accMenu.hidden) { closeMenu(); accBtn.focus(); } });

    // Floating bag follows the pointer slightly (3D parallax).
    const hero = $("#summaryHero"), bag = $("#bag3d");
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      hero.addEventListener("pointermove", (e) => {
        if (PG.reducedMotion()) return;
        const r = hero.getBoundingClientRect();
        bag.style.setProperty("--bx", (((e.clientX - r.left) / r.width - 0.5) * 24).toFixed(1) + "deg");
        bag.style.setProperty("--by", (-((e.clientY - r.top) / r.height - 0.5) * 16).toFixed(1) + "deg");
      });
      hero.addEventListener("pointerleave", () => { bag.style.setProperty("--bx", "0deg"); bag.style.setProperty("--by", "0deg"); });
    }

    $("#year").textContent = new Date().getFullYear();
  }

  /* ---------------- Init ---------------- */
  async function init() {
    Object.values(PG.modules).forEach((m) => m.init?.());
    bindUI();
    $("#sandboxBar").hidden = !api.isSandbox;

    const params = new URLSearchParams(location.search);
    const data = await api.getCheckout(params.get("session") || "cs_7Hk2pQ9xLm");
    state.session = data.session;
    state.order = data.order;
    state.user = data.user;
    state.wallet = data.wallet || null;
    state.mfsProviders = (data.payment_providers || [])
      .filter((p) => p.method_code === "mobile_banking" && p.is_active !== false)
      .sort((a, b) => a.sort_order - b.sort_order);

    PG.modules.mobile.setProviders();
    renderUser();
    renderOrder();
    PG.modules.wallet.render();

    // Returning from a provider's hosted page (live mode): ?payment_id=…
    const returning = params.get("payment_id");
    if (returning) { openDetails("mobile", { scroll: false }); PG.modules.mobile.resume(returning); return; }

    // Resume step 2 if the session says the customer was already there.
    const uiMethod = Object.keys(PG.METHOD_CODE).find((k) => PG.METHOD_CODE[k] === data.session.selected_method_code);
    if (data.session.current_step === "payment_details" && uiMethod) openDetails(uiMethod, { scroll: false });
    else setStep(1);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
