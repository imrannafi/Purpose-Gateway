/* Mobile banking: provider → account number → confirm amount → provider-hosted
   authorization (OTP + PIN happen on the provider's page) → verification.
   We never collect OTP or PIN in this app. */
(function () {
  "use strict";
  const PG = window.PG;
  const { $, $$, escapeHtml, money } = PG;

  const SUBS = ["provider", "account", "confirm", "verify"];
  const PENDING_KEY = "pg_pending_mfs";

  let panel, grid, numberInput;
  let selected = null;   // provider code
  let sub = "provider";
  let payment = null;    // current mobile payment (requires_action)

  const current = () => PG.provider(selected);
  const accountLen = () => current()?.account_number_length || 10;
  const accountDigits = () => PG.bdDigits(numberInput.value, accountLen());

  /* ---------------- Sub-step navigation ---------------- */
  function go(name) {
    const from = SUBS.indexOf(sub);
    const to = SUBS.indexOf(name);
    sub = name;
    PG.showView($$("[data-sub-view]", panel), "data-sub-view", name, to < from ? "back" : "forward");
    $$("#mfsSteps li").forEach((li, i) => {
      li.classList.toggle("is-active", i === to);
      li.classList.toggle("is-done", i < to);
    });
    const p = current();
    $("#mfsSubtitle").textContent = {
      provider: "Choose your mobile banking provider",
      account: `Enter your ${p?.name || ""} account number`,
      confirm: "Review the payment before you approve it",
      verify: `Secure verification with ${p?.name || "your provider"}`,
    }[name];
    $("#mfsCount").hidden = name !== "provider";
    if (name === "account") setTimeout(() => numberInput.focus({ preventScroll: true }), 60);
  }

  /* ---------------- 1. Provider grid ---------------- */
  function renderGrid() {
    const list = PG.state.mfsProviders;
    grid.innerHTML = list.map((p, i) => `
      <button type="button" class="mfs-card" role="radio" aria-checked="${p.code === selected}" data-code="${escapeHtml(p.code)}"
        data-search="${escapeHtml([p.name, p.name_bn, p.operator_name, p.code].join(" ").toLowerCase())}" style="--i:${i}">
        ${PG.logoTile(p, "mfs-card__logo")}
        <span class="mfs-card__name">${escapeHtml(p.name)}</span>
        <span class="mfs-card__bank">${escapeHtml(p.operator_name)}</span>
        <span class="mfs-card__check" aria-hidden="true"><svg><use href="#i-check"/></svg></span>
      </button>`).join("");
    PG.hydrateLogos(grid);
    $("#mfsCount").textContent = `${list.length} providers`;
    $("#mfsMethodCount").textContent = `${list.length} providers`;
    $("#mfsSearchWrap").hidden = list.length <= 6;
  }

  function choose(code) {
    selected = code;
    $$(".mfs-card", grid).forEach((c) => {
      const on = c.dataset.code === code;
      c.setAttribute("aria-checked", on);
      c.classList.toggle("is-picked", on);
    });
    renderSelected();
    setTimeout(() => go("account"), PG.reducedMotion() ? 0 : 320);
  }

  /* ---------------- 2. Account ---------------- */
  function renderSelected() {
    const p = current();
    if (!p) return;
    $("#mfsSelected").innerHTML = `
      ${PG.logoTile(p, "mfs-selected__logo")}
      <div class="mfs-selected__text"><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(p.operator_name)}</span></div>
      <button type="button" class="btn-sm" data-mfs-back="provider"><svg><use href="#i-swap"/></svg>Change</button>`;
    PG.hydrateLogos($("#mfsSelected"));
    $("#mfsNumberLabel").textContent = `${p.name} Account Number`;
    numberInput.placeholder = accountLen() === 11 ? "1XXX-XXXXXX-X" : "1XXX-XXXXXX";
    numberInput.maxLength = accountLen() + 6; // room for a pasted +880 prefix; reformatted on input
    if (numberInput.value) { numberInput.value = PG.formatBd(accountDigits()); validateNumber(); }
    $$("[data-mfs-name]", panel).forEach((x) => (x.textContent = p.name));
  }

  function numberError() {
    const d = accountDigits();
    const p = current();
    if (!d) return "Account number is required.";
    if (!new RegExp(`^1[3-9]\\d{${accountLen() - 2}}$`).test(d)) {
      return accountLen() === 11
        ? `Enter your ${p.name} account number: mobile number + check digit (e.g. 1712-345678-9).`
        : `Enter a valid ${accountLen()}-digit number (e.g. 1712-345678).`;
    }
    return "";
  }
  const validateNumber = () => { const m = numberError(); PG.setFieldError(numberInput, m); return !m; };

  /* ---------------- 3. Confirm ---------------- */
  function renderConfirm() {
    const p = current();
    const o = PG.state.order;
    $("#mfsConfirm").innerHTML = `
      <div class="confirm-card__head">
        ${PG.logoTile(p, "confirm-card__logo")}
        <div><small>Paying with</small><strong>${escapeHtml(p.name)}</strong></div>
      </div>
      <dl class="confirm-card__rows">
        <div><dt>Account</dt><dd>${escapeHtml(PG.displayPhone(accountDigits()))}</dd></div>
        <div><dt>Order</dt><dd>${escapeHtml(o.order_number)}</dd></div>
        <div><dt>Amount</dt><dd>${money(o.total_minor)}</dd></div>
        <div><dt>Gateway fee</dt><dd class="is-free">Free</dd></div>
      </dl>
      <div class="confirm-card__total"><span>Total payable</span><strong>${money(o.total_minor)}</strong></div>`;
    PG.hydrateLogos($("#mfsConfirm"));
    $("#mfsProceed .pay-btn__label").textContent = `Pay ${money(o.total_minor)} with ${p.name}`;
  }

  /* ---------------- 4. Verify ---------------- */
  function setVerify({ title, text, state = "loading", items = [] }) {
    $("#verifyTitle").textContent = title;
    $("#verifyText").textContent = text || "";
    const orb = $("#verifyOrb");
    orb.className = "verify__orb is-" + state;
    $("#verifyList").innerHTML = items.map((it) => `
      <li class="is-${it.state}"><span class="verify__icon">${it.state === "done" ? `<svg><use href="#i-check"/></svg>` : it.state === "fail" ? `<svg><use href="#i-x"/></svg>` : ""}</span>${escapeHtml(it.label)}</li>`).join("");
    $("#verifyRetry").hidden = state !== "fail";
  }

  function verifyItems(stage, failAt) {
    const p = current();
    const labels = ["Payment request created", `Authorized on ${p?.name || "provider"} (OTP & PIN)`, `Verifying with ${p?.name || "provider"}`];
    return labels.map((label, i) => ({ label, state: failAt === i ? "fail" : i < stage ? "done" : i === stage ? "active" : "todo" }));
  }

  async function proceed() {
    const btn = $("#mfsProceed");
    const confirmView = $('[data-sub-view="confirm"]', panel);
    PG.formError(confirmView, "");
    const p = current();
    const { state, api } = PG;
    PG.setLoading(btn, true, "Connecting…");
    try {
      payment = await api.initiateMobilePayment({
        checkout_session_id: state.session.id,
        order_id: state.order.id,
        provider_code: p.code,
        amount_minor: state.order.total_minor,
        currency: state.order.currency,
        details: { provider: p.code, wallet_number: "+880" + accountDigits() },
        return_url: location.href.split("?")[0] + `?session=${encodeURIComponent(state.session.id)}`,
      });
    } catch (err) {
      PG.setLoading(btn, false);
      PG.formError(confirmView, err.message || "Couldn't reach the provider. Please try again.");
      PG.shake(btn);
      return;
    }
    PG.setLoading(btn, false);
    renderVerifyLogo();
    go("verify");

    if (payment.redirect_url) {
      // Live: hand over to the provider's own secure page (OTP + PIN there).
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({ payment_id: payment.id, provider: p.code, digits: accountDigits() }));
      setVerify({ title: `Redirecting to ${p.name}…`, text: "Complete the OTP and PIN steps on the provider's page.", items: verifyItems(1) });
      setTimeout(() => location.assign(payment.redirect_url), 700);
      return;
    }

    // Sandbox: simulated provider page.
    setVerify({ title: `Waiting for ${p.name} approval…`, text: "Approve the payment on the provider's page.", items: verifyItems(1) });
    openSandboxProvider();
  }

  function renderVerifyLogo() {
    const p = current();
    $("#verifyLogo").innerHTML = PG.logoTile(p, "verify__tile");
    PG.hydrateLogos($("#verifyLogo"));
  }

  function openSandboxProvider() {
    const p = current();
    const modal = $("#providerModal");
    $("#providerLogo").innerHTML = PG.logoTile(p, "provider-card__tile");
    PG.hydrateLogos($("#providerLogo"));
    $("#providerTitle").textContent = `${p.name} secure checkout`;
    $$("[data-provider-name]", modal).forEach((x) => (x.textContent = p.name));
    $("#providerRows").innerHTML = `
      <div><dt>Merchant</dt><dd>Purpose Gateway</dd></div>
      <div><dt>Account</dt><dd>${escapeHtml(PG.maskPhone(accountDigits()))}</dd></div>
      <div><dt>Amount</dt><dd>${money(payment.amount_minor)}</dd></div>`;
    let answered = false;
    const answer = (approved) => { answered = true; PG.closeModal(modal, approved ? "approve" : "decline"); };
    $("#providerApprove").onclick = () => answer(true);
    $("#providerDecline").onclick = () => answer(false);
    PG.openModal(modal, {
      initialFocus: $("#providerApprove"),
      onClose: (reason) => authorize(answered && reason === "approve"),
    });
  }

  async function authorize(approved) {
    const p = current();
    try {
      await PG.api.sandboxAuthorize(payment.id, approved);
    } catch (err) { return fail(err.message); }
    if (!approved) return fail(`The payment was cancelled on ${p.name}. No money was taken.`, 1);
    await verify(payment.id);
  }

  async function verify(paymentId) {
    const p = current();
    setVerify({ title: `Verifying with ${p?.name || "provider"}…`, text: "Confirming the transaction with the provider.", items: verifyItems(2) });
    try {
      const result = await PG.api.getPayment(paymentId);
      if (result.status !== "succeeded") throw new Error(result.status === "cancelled" ? "The payment was cancelled. No money was taken." : "The provider didn't confirm this payment. No money was taken.");
      setVerify({ title: "Payment verified", text: "", state: "done", items: verifyItems(3) });
      sessionStorage.removeItem(PENDING_KEY);
      await PG.wait(PG.reducedMotion() ? 0 : 650);
      PG.emit("paid", { payment: result, method: "mobile", detail: `${p?.name || "Mobile banking"} · ${PG.maskPhone(accountDigits())}` });
    } catch (err) {
      sessionStorage.removeItem(PENDING_KEY);
      fail(err.message, 2);
    }
  }

  function fail(msg, at = 1) {
    payment = null; // a declined/failed payment is finished; retry creates a new one
    setVerify({ title: "Payment not completed", text: msg, state: "fail", items: verifyItems(at, at) });
  }

  /* ---------------- Bindings ---------------- */
  function bind() {
    grid.addEventListener("click", (e) => {
      const c = e.target.closest(".mfs-card");
      if (c) choose(c.dataset.code);
    });
    grid.addEventListener("keydown", (e) => {
      const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      if (!keys[e.key]) return;
      const cards = $$(".mfs-card:not([hidden])", grid);
      const i = cards.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      cards[(i + keys[e.key] + cards.length) % cards.length].focus();
    });
    $("#mfsSearch").addEventListener("input", (e) => {
      const q = e.target.value.trim().toLowerCase();
      let shown = 0;
      $$(".mfs-card", grid).forEach((c) => {
        const match = !q || c.dataset.search.includes(q);
        c.hidden = !match;
        if (match) shown++;
      });
      $("#mfsEmpty").hidden = shown > 0;
    });

    numberInput.addEventListener("input", () => {
      numberInput.value = PG.formatBd(accountDigits());
      if (numberInput.closest(".field").classList.contains("has-error")) validateNumber();
    });
    numberInput.addEventListener("blur", () => { if (numberInput.value) validateNumber(); });

    $("#mfsAccountForm").addEventListener("submit", (e) => {
      e.preventDefault();
      if (!validateNumber()) { numberInput.focus(); PG.shake(e.target.querySelector(".pay-btn")); return; }
      renderConfirm();
      go("confirm");
    });

    panel.addEventListener("click", (e) => {
      const b = e.target.closest("[data-mfs-back]");
      if (b) go(b.dataset.mfsBack);
    });
    $("#mfsProceed").addEventListener("click", proceed);
    $("#verifyRetry").addEventListener("click", () => { renderConfirm(); go("confirm"); });
  }

  function reset() {
    selected = null;
    payment = null;
    numberInput.value = "";
    PG.setFieldError(numberInput, "");
    numberInput.closest(".field").classList.remove("is-valid");
    $("#mfsSearch").value = "";
    $("#mfsEmpty").hidden = true;
    renderGrid();
    sub = "verify";
    go("provider");
  }

  PG.modules.mobile = {
    init() {
      panel = $("#mobilePanel");
      grid = $("#mfsGrid");
      numberInput = $("#mfsNumber");
      bind();
    },
    /** Called once providers are loaded. */
    setProviders() { renderGrid(); },
    show() {
      // Re-entering the method mid-flow keeps progress. After a failed attempt,
      // return to the confirm step (provider + number kept) instead of the error.
      if (sub === "verify" && !payment) {
        if (selected) { renderConfirm(); go("confirm"); } else go("provider");
      }
    },
    onOrder() { if (sub === "confirm") renderConfirm(); },
    /** Live mode: the provider redirected back with ?payment_id=… */
    resume(paymentId) {
      let pending = {};
      try { pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "{}"); } catch (_) {}
      if (pending.provider) selected = pending.provider;
      if (pending.digits) numberInput.value = PG.formatBd(pending.digits);
      payment = { id: paymentId };
      renderSelected();
      renderVerifyLogo();
      go("verify");
      verify(paymentId);
    },
    reset,
  };
})();
