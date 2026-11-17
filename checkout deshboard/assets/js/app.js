/* Purpose Gateway — Checkout UI controller */
(function () {
  "use strict";

  const api = window.PG_API;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  // UI method key  → DB payment_methods.code
  const METHOD_CODE = { card: "card", mobile: "mobile_banking", wallet: "wallet", group: "group" };
  const METHOD_LABEL = { card: "Card Payment", mobile: "Mobile Banking", wallet: "Wallet", group: "Group Payment" };
  const MAX_MEMBERS = 10;

  const state = {
    session: null,
    order: null,
    user: null,
    method: "card",
    step: 1,
    members: [],
    lastPayment: null,
    mfsProviders: [],
    mfsProvider: null,
  };

  /* ---------------- Helpers ---------------- */
  const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
  const money = (minor) => "৳ " + nf.format((minor || 0) / 100);
  const toMinor = (major) => Math.round((parseFloat(major) || 0) * 100);
  const initials = (name) => (name || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
  const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }

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

  /* ---------------- Rendering ---------------- */
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
    $("#total").textContent = money(o.total_minor);
    $$("[data-total-inline]").forEach((el) => (el.textContent = money(o.total_minor)));
    updatePayLabel();
    if (state.method === "group") renderMembers();
  }

  function renderUser() {
    $$("[data-bind]").forEach((el) => {
      const [obj, key] = el.dataset.bind.split(".");
      if (obj === "user" && state.user?.[key]) el.textContent = state.user[key];
    });
  }

  function updatePayLabel() {
    const label = $("#payBtnLabel");
    if (state.method === "group") {
      const me = state.members[0];
      label.textContent = `Pay my share ${money(me ? me.share_minor : state.order.total_minor)}`;
    } else {
      label.textContent = `Pay ${money(state.order.total_minor)}`;
    }
  }

  function setStep(step) {
    state.step = step;
    $$(".stepper__step").forEach((li) => {
      const n = +li.dataset.step;
      li.classList.toggle("is-active", n === step);
      li.classList.toggle("is-done", n < step || (step === 3 && n === 3));
      if (n === step) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
    const lines = $$(".stepper__line span");
    lines.forEach((l, i) => l.style.setProperty("--p", step > i + 1 ? 1 : 0));
    const stepName = ["", "payment_method", "payment_details", "complete"][step];
    if (state.session && state.session.current_step !== stepName) {
      state.session.current_step = stepName;
      api.updateSession(state.session.id, { current_step: stepName });
    }
  }

  function selectMethod(method, { focus = false } = {}) {
    if (!METHOD_CODE[method]) return;
    state.method = method;
    $$(".method").forEach((b) => {
      const on = b.dataset.method === method;
      b.classList.toggle("is-selected", on);
      b.setAttribute("aria-checked", on);
      b.tabIndex = on ? 0 : -1;
    });
    $$(".panel").forEach((p) => {
      const on = p.dataset.panel === method;
      p.classList.toggle("is-active", on);
      p.disabled = !on;
    });
    $("#formError").textContent = "";
    if (method === "group" && state.members.length === 0) initMembers();
    if (method === "group") renderMembers();
    updatePayLabel();
    api.updateSession(state.session.id, { selected_method_code: METHOD_CODE[method] });
    if (focus) {
      const btn = $(`.method[data-method="${method}"]`);
      btn.focus({ preventScroll: true });
      btn.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  /* ---------------- Mobile banking providers ---------------- */
  const currentMfs = () => state.mfsProviders.find((p) => p.code === state.mfsProvider) || state.mfsProviders[0];

  // Loads the official logo file: <logo_url>.svg → <logo_url>.png → neutral monogram.
  // Never substitutes a drawn/imitation logo.
  function loadLogo(box, provider) {
    if (!provider.logo_url) return;
    const exts = /\.(svg|png|webp|jpe?g)$/i.test(provider.logo_url) ? [""] : [".svg", ".png", ".webp"];
    let i = 0;
    const img = new Image();
    img.alt = provider.name + " logo";
    img.decoding = "async";
    img.onload = () => { box.classList.add("has-logo"); box.replaceChildren(img); };
    img.onerror = () => { if (++i < exts.length) img.src = provider.logo_url + exts[i]; };
    img.src = provider.logo_url + exts[0];
  }

  function renderMfs() {
    const grid = $("#mfsGrid");
    grid.innerHTML = "";
    state.mfsProviders.forEach((p) => {
      const label = document.createElement("label");
      label.className = "mfs-card";
      label.dataset.code = p.code;
      label.dataset.search = [p.name, p.name_bn, p.operator_name, p.code].join(" ").toLowerCase();
      label.innerHTML = `
        <input type="radio" name="mfsProvider" value="${escapeHtml(p.code)}" ${p.code === state.mfsProvider ? "checked" : ""} />
        <span class="mfs-card__logo"><span class="mfs-card__mono" aria-hidden="true">${escapeHtml(p.name.replace(/[^A-Za-z]/g, "").slice(0, 2))}</span></span>
        <span class="mfs-card__name">${escapeHtml(p.name)}</span>
        <span class="mfs-card__bank">${escapeHtml(p.operator_name)}</span>
        <span class="mfs-card__check" aria-hidden="true"><svg><use href="#i-check"/></svg></span>`;
      grid.appendChild(label);
      loadLogo(label.querySelector(".mfs-card__logo"), p);
    });
    $("#mfsCount").textContent = `${state.mfsProviders.length} providers`;
    $("#mfsSearchWrap").hidden = state.mfsProviders.length <= 6;
    syncMfsSelection();
  }

  function syncMfsSelection() {
    const p = currentMfs();
    if (!p) return;
    $("#mfsNumberLabel").textContent = `${p.name} Account Number`;
    const len = p.account_number_length || 10;
    const mfs = $("#mfsNumber");
    mfs.placeholder = len === 11 ? "1XXX-XXXXXX-X" : "1XXX-XXXXXX";
    mfs.maxLength = len + 2;
    if (mfs.value) { mfs.dispatchEvent(new Event("input")); validateField("mfsNumber"); }
  }

  function bindMfs() {
    $("#mfsGrid").addEventListener("change", (e) => {
      if (e.target.name !== "mfsProvider") return;
      state.mfsProvider = e.target.value;
      syncMfsSelection();
    });
    $("#mfsSearch").addEventListener("input", (e) => {
      const q = e.target.value.trim().toLowerCase();
      let shown = 0;
      $$(".mfs-card").forEach((c) => {
        const match = !q || c.dataset.search.includes(q);
        c.hidden = !match;
        if (match) shown++;
      });
      $("#mfsEmpty").hidden = shown > 0;
    });
  }

  /* ---------------- Card input formatting & validation ---------------- */
  const BRANDS = [
    { id: "amex", re: /^3[47]/, lengths: [15], cvv: 4, gaps: [4, 10] },
    { id: "visa", re: /^4/, lengths: [13, 16, 19], cvv: 3, gaps: [4, 8, 12] },
    { id: "mastercard", re: /^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/, lengths: [16], cvv: 3, gaps: [4, 8, 12] },
  ];
  const detectBrand = (digits) => BRANDS.find((b) => b.re.test(digits)) || null;

  function luhn(num) {
    let sum = 0, dbl = false;
    for (let i = num.length - 1; i >= 0; i--) {
      let d = +num[i];
      if (dbl) { d *= 2; if (d > 9) d -= 9; }
      sum += d; dbl = !dbl;
    }
    return sum % 10 === 0;
  }

  function formatCardNumber(digits, brand) {
    const gaps = brand ? brand.gaps : [4, 8, 12, 16];
    let out = "";
    for (let i = 0; i < digits.length; i++) {
      if (gaps.includes(i)) out += " ";
      out += digits[i];
    }
    return out;
  }

  function setFieldError(id, msg) {
    const input = document.getElementById(id);
    const field = input.closest(".field");
    const err = $(`[data-error-for="${id}"]`);
    if (err) err.textContent = msg || "";
    field.classList.toggle("has-error", !!msg);
    input.setAttribute("aria-invalid", msg ? "true" : "false");
    if (err) input.setAttribute("aria-describedby", err.id || (err.id = "err-" + id));
  }
  function setFieldValid(id, ok) {
    document.getElementById(id).closest(".field").classList.toggle("is-valid", ok);
  }

  const validators = {
    cardNumber() {
      const digits = $("#cardNumber").value.replace(/\D/g, "");
      const brand = detectBrand(digits);
      if (!digits) return "Card number is required.";
      const okLen = brand ? brand.lengths.includes(digits.length) : digits.length >= 12 && digits.length <= 19;
      if (!okLen || !luhn(digits)) return "Please enter a valid card number.";
      return "";
    },
    cardExpiry() {
      const v = $("#cardExpiry").value;
      const m = v.match(/^(\d{2})\s?\/\s?(\d{2})$/);
      if (!v) return "Expiry date is required.";
      if (!m) return "Use MM / YY format.";
      const mm = +m[1], yy = 2000 + +m[2];
      if (mm < 1 || mm > 12) return "Invalid month.";
      const now = new Date();
      const end = new Date(yy, mm, 0, 23, 59, 59);
      if (end < now) return "This card has expired.";
      if (yy > now.getFullYear() + 20) return "Invalid year.";
      return "";
    },
    cardCvv() {
      const v = $("#cardCvv").value;
      const brand = detectBrand($("#cardNumber").value.replace(/\D/g, ""));
      const need = brand ? brand.cvv : null;
      if (!v) return "CVV is required.";
      if (need ? v.length !== need : !/^\d{3,4}$/.test(v)) return `CVV must be ${need || "3–4"} digits.`;
      return "";
    },
    cardName() {
      const v = $("#cardName").value.trim();
      if (!v) return "Cardholder name is required.";
      if (v.length < 2 || !/^[\p{L} .'-]+$/u.test(v)) return "Enter the name exactly as on the card.";
      return "";
    },
    mfsNumber() {
      const digits = $("#mfsNumber").value.replace(/\D/g, "");
      const p = currentMfs();
      const len = p?.account_number_length || 10;
      if (!digits) return "Account number is required.";
      if (!new RegExp(`^1[3-9]\\d{${len - 2}}$`).test(digits)) {
        return len === 11
          ? `Enter your ${p.name} account number: mobile number + check digit (e.g. 1712-345678-9).`
          : `Enter a valid ${len}-digit number (e.g. 1712-345678).`;
      }
      return "";
    },
  };

  function validateField(id, show = true) {
    const msg = validators[id]();
    if (show) { setFieldError(id, msg); setFieldValid(id, !msg); }
    return !msg;
  }

  function bindCardInputs() {
    const num = $("#cardNumber");
    num.addEventListener("input", () => {
      const pos = num.selectionStart;
      const before = num.value.length;
      let digits = num.value.replace(/\D/g, "").slice(0, 19);
      const brand = detectBrand(digits);
      if (brand) digits = digits.slice(0, Math.max(...brand.lengths));
      num.value = formatCardNumber(digits, brand);
      const diff = num.value.length - before;
      try { num.setSelectionRange(pos + diff, pos + diff); } catch (_) {}
      $("#cardBrand").textContent = brand ? brand.id : "";
      const brands = $(".brands");
      brands.classList.toggle("has-match", !!brand);
      $$(".brand-logo", brands).forEach((el) => el.classList.toggle("is-match", brand && el.dataset.brand === brand.id));
      $("#cardCvv").maxLength = brand ? brand.cvv : 4;
      if (num.closest(".field").classList.contains("has-error")) validateField("cardNumber");
    });

    const exp = $("#cardExpiry");
    exp.addEventListener("input", (e) => {
      let d = exp.value.replace(/\D/g, "").slice(0, 4);
      if (d.length === 1 && +d > 1) d = "0" + d;
      const deleting = e.inputType && e.inputType.startsWith("delete");
      exp.value = d.length > 2 ? `${d.slice(0, 2)} / ${d.slice(2)}` : d.length === 2 && !deleting ? `${d} / ` : d;
      if (exp.closest(".field").classList.contains("has-error")) validateField("cardExpiry");
    });

    const cvv = $("#cardCvv");
    cvv.addEventListener("input", () => { cvv.value = cvv.value.replace(/\D/g, ""); });

    const name = $("#cardName");
    name.addEventListener("input", () => { if (name.closest(".field").classList.contains("has-error")) validateField("cardName"); });

    const mfs = $("#mfsNumber");
    mfs.addEventListener("input", () => {
      let d = mfs.value.replace(/\D/g, "");
      if (d.startsWith("880")) d = d.slice(3);
      if (d.startsWith("0")) d = d.slice(1);
      d = d.slice(0, currentMfs()?.account_number_length || 10);
      mfs.value = d.length > 10 ? `${d.slice(0, 4)}-${d.slice(4, 10)}-${d.slice(10)}`
        : d.length > 4 ? `${d.slice(0, 4)}-${d.slice(4)}` : d;
      if (mfs.closest(".field").classList.contains("has-error")) validateField("mfsNumber");
    });

    ["cardNumber", "cardExpiry", "cardCvv", "cardName", "mfsNumber"].forEach((id) => {
      document.getElementById(id).addEventListener("blur", (e) => { if (e.target.value) validateField(id); });
    });
  }

  /* ---------------- Group payment ---------------- */
  function initMembers() {
    state.members = [
      { name: state.user?.full_name || "You", contact: state.user?.email || "", share_minor: 0, is_you: true },
      { name: "", contact: "", share_minor: 0 },
    ];
    recalcEqual();
  }

  const splitType = () => $('input[name="splitType"]:checked').value;

  function recalcEqual() {
    const n = state.members.length;
    const total = state.order.total_minor;
    const base = Math.floor(total / n);
    const rem = total - base * n;
    state.members.forEach((m, i) => (m.share_minor = base + (i === 0 ? rem : 0)));
  }

  function renderMembers() {
    if (splitType() === "equal") recalcEqual();
    const custom = splitType() === "custom";
    $("#members").innerHTML = state.members.map((m, i) => `
      <li class="member" data-i="${i}">
        <span class="member__avatar">${escapeHtml(initials(m.name))}</span>
        <div class="member__name">
          ${m.is_you
            ? `<span class="member__you">You</span><div style="font-weight:600;font-size:14px;margin-top:2px">${escapeHtml(m.name)}</div>`
            : `<input type="text" data-k="name" value="${escapeHtml(m.name)}" placeholder="Friend's name" aria-label="Friend ${i} name" />`}
        </div>
        <div class="member__contact">
          <input type="text" data-k="contact" value="${escapeHtml(m.contact)}" placeholder="Phone or email" aria-label="Member ${i + 1} phone or email" ${m.is_you ? "readonly" : ""} />
        </div>
        <div class="member__amount">
          <input type="number" min="0" step="0.01" inputmode="decimal" data-k="share" value="${(m.share_minor / 100).toFixed(2).replace(/\.00$/, "")}" aria-label="Member ${i + 1} share in taka" ${custom ? "" : "readonly"} />
        </div>
        ${m.is_you ? `<span class="member__spacer"></span>` : `<button type="button" class="member__remove" aria-label="Remove member"><svg><use href="#i-x"/></svg></button>`}
      </li>`).join("");
    $("#addMember").disabled = state.members.length >= MAX_MEMBERS;
    renderSplitSummary();
    updatePayLabel();
  }

  function renderSplitSummary() {
    const sum = state.members.reduce((a, m) => a + m.share_minor, 0);
    const total = state.order.total_minor;
    const diff = total - sum;
    const status = diff === 0
      ? `<span class="good">✓ Split matches total</span>`
      : `<span class="bad">${diff > 0 ? money(diff) + " left to assign" : money(-diff) + " over total"}</span>`;
    $("#splitSummary").innerHTML = `
      <span>People: <b>${state.members.length}</b></span>
      <span>Assigned: <b>${money(sum)}</b> of <b>${money(total)}</b></span>
      ${status}`;
  }

  function bindGroup() {
    $("#members").addEventListener("input", (e) => {
      const li = e.target.closest(".member"); if (!li) return;
      const m = state.members[+li.dataset.i];
      const k = e.target.dataset.k;
      if (k === "name") { m.name = e.target.value; li.querySelector(".member__avatar").textContent = initials(m.name); }
      if (k === "contact") m.contact = e.target.value;
      if (k === "share") { m.share_minor = Math.max(0, toMinor(e.target.value)); renderSplitSummary(); updatePayLabel(); }
    });
    $("#members").addEventListener("click", (e) => {
      const btn = e.target.closest(".member__remove"); if (!btn) return;
      state.members.splice(+btn.closest(".member").dataset.i, 1);
      renderMembers();
    });
    $("#addMember").addEventListener("click", () => {
      if (state.members.length >= MAX_MEMBERS) return;
      state.members.push({ name: "", contact: "", share_minor: 0 });
      renderMembers();
      const inputs = $$('#members input[data-k="name"]');
      inputs[inputs.length - 1]?.focus();
    });
    $$('input[name="splitType"]').forEach((r) => r.addEventListener("change", renderMembers));
  }

  function validateGroup() {
    const others = state.members.filter((m) => !m.is_you);
    if (others.length === 0) return "Add at least one friend to split with.";
    const bad = others.find((m) => !m.name.trim() || !m.contact.trim());
    if (bad) return "Please enter a name and phone/email for every friend.";
    const badContact = others.find((m) => !/^(\+?\d[\d\s-]{7,}|[^\s@]+@[^\s@]+\.[^\s@]+)$/.test(m.contact.trim()));
    if (badContact) return `"${badContact.contact}" isn't a valid phone number or email.`;
    if (state.members.some((m) => m.share_minor <= 0)) return "Every member's share must be greater than zero.";
    const sum = state.members.reduce((a, m) => a + m.share_minor, 0);
    if (sum !== state.order.total_minor) return "The shares must add up exactly to the total amount.";
    return "";
  }

  /* ---------------- Submit ---------------- */
  function buildPayload() {
    const base = {
      checkout_session_id: state.session.id,
      order_id: state.order.id,
      method_code: METHOD_CODE[state.method],
      amount_minor: state.order.total_minor,
      currency: state.order.currency,
    };
    if (state.method === "card") {
      const digits = $("#cardNumber").value.replace(/\D/g, "");
      const [mm, yy] = $("#cardExpiry").value.split("/").map((s) => s.trim());
      const brand = detectBrand(digits);
      // NOTE: In production the PAN/CVV go to the processor's tokenization SDK,
      // never to our backend. Only the returned token + display metadata are sent.
      return { ...base, provider_code: brand?.id || "card", details: {
        token: "tok_mock_" + digits.slice(-4), brand: brand?.id || "unknown", last4: digits.slice(-4),
        exp_month: +mm, exp_year: 2000 + +yy, cardholder_name: $("#cardName").value.trim(), save_card: $("#saveCard").checked,
      } };
    }
    if (state.method === "mobile") {
      const provider = currentMfs().code;
      return { ...base, provider_code: provider, details: { provider, wallet_number: "+880" + $("#mfsNumber").value.replace(/\D/g, "") } };
    }
    if (state.method === "wallet") {
      const wallet_type = $('input[name="walletType"]:checked').value;
      return { ...base, provider_code: wallet_type, details: { wallet_type, wallet_token: "wtok_mock" } };
    }
    return { ...base, amount_minor: state.members[0].share_minor, provider_code: "group", details: {
      split_type: splitType(),
      members: state.members.map((m) => ({ name: m.name.trim(), contact: m.contact.trim(), share_minor: m.share_minor, is_organizer: !!m.is_you })),
    } };
  }

  function validateCurrent() {
    if (state.method === "card") {
      const ids = ["cardNumber", "cardExpiry", "cardCvv", "cardName"];
      const results = ids.map((id) => validateField(id));
      const firstBad = ids[results.indexOf(false)];
      if (firstBad) { document.getElementById(firstBad).focus(); return false; }
      return true;
    }
    if (state.method === "mobile") {
      if (!validateField("mfsNumber")) { $("#mfsNumber").focus(); return false; }
      return true;
    }
    if (state.method === "group") {
      const msg = validateGroup();
      $("#formError").textContent = msg;
      return !msg;
    }
    return true;
  }

  async function onSubmit(e) {
    e.preventDefault();
    $("#formError").textContent = "";
    const btn = $("#payBtn");
    if (!validateCurrent()) {
      btn.classList.remove("shake"); void btn.offsetWidth; btn.classList.add("shake");
      return;
    }
    if (state.step < 2) setStep(2);
    btn.classList.add("is-loading");
    const label = $("#payBtnLabel");
    const prev = label.textContent;
    label.textContent = "Processing…";
    try {
      const payment = await api.createPayment(buildPayload());
      state.lastPayment = payment;
      showSuccess(payment);
    } catch (err) {
      $("#formError").textContent = err.message || "Payment failed. Please try again.";
      label.textContent = prev;
    } finally {
      btn.classList.remove("is-loading");
    }
  }

  function showSuccess(p) {
    const isGroup = state.method === "group";
    $("#checkoutView").hidden = true;
    const view = $("#successView");
    view.hidden = false;
    setStep(3);
    view.querySelector("h2").textContent = isGroup ? "Your share is paid!" : "Payment Successful!";
    $("#successText").textContent = isGroup
      ? `We've sent payment requests to ${state.members.length - 1} friend${state.members.length > 2 ? "s" : ""}. Your order ships once everyone has paid.`
      : "Your payment has been processed successfully. A confirmation has been sent to your email.";
    const rows = [
      ["Order number", state.order.order_number],
      ["Transaction ID", p.gateway_reference],
      ["Payment method", METHOD_LABEL[state.method] + (state.method === "mobile" ? ` · ${currentMfs().name}`
        : p.provider_code && !["group", "card"].includes(p.provider_code) ? ` · ${p.provider_code.replace("_", " ")}` : "")],
      [isGroup ? "Your share" : "Amount paid", money(p.amount_minor)],
      ...(isGroup ? [["Group order total", money(state.order.total_minor)], ["Group share code", p.group_share_code]] : []),
      ["Date", new Date(p.paid_at).toLocaleString()],
    ];
    $("#receipt").innerHTML = rows.map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join("");
    view.scrollIntoView({ behavior: "smooth", block: "start" });
    view.querySelector("h2").setAttribute("tabindex", "-1");
    view.querySelector("h2").focus({ preventScroll: true });
  }

  function restart() {
    $("#payForm").reset();
    $$(".field").forEach((f) => f.classList.remove("has-error", "is-valid"));
    $$(".field__error").forEach((e) => (e.textContent = ""));
    $("#cardBrand").textContent = "";
    $(".brands").classList.remove("has-match");
    state.members = [];
    state.mfsProvider = state.mfsProviders[0]?.code || null;
    $("#mfsSearch").value = "";
    renderMfs();
    $("#mfsEmpty").hidden = true;
    $("#successView").hidden = true;
    $("#checkoutView").hidden = false;
    selectMethod("card");
    setStep(1);
    updatePayLabel();
  }

  /* ---------------- Misc bindings ---------------- */
  function bindUI() {
    // Methods — click + arrow-key radio behaviour
    const methods = $("#methods");
    methods.addEventListener("click", (e) => {
      const b = e.target.closest(".method"); if (b) selectMethod(b.dataset.method);
    });
    methods.addEventListener("keydown", (e) => {
      const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
      if (!keys.includes(e.key)) return;
      e.preventDefault();
      const list = $$(".method");
      const i = list.findIndex((b) => b.dataset.method === state.method);
      const next = list[(i + (keys.indexOf(e.key) < 2 ? 1 : -1) + list.length) % list.length];
      selectMethod(next.dataset.method);
      next.focus();
    });
    $$("[data-select-method]").forEach((el) => el.addEventListener("click", () => selectMethod(el.dataset.selectMethod, { focus: true })));

    // Step 2 once the user starts filling details
    $("#payForm").addEventListener("focusin", (e) => { if (e.target.closest(".panel") && state.step === 1) setStep(2); });

    $("#payForm").addEventListener("submit", onSubmit);
    $("#restart").addEventListener("click", restart);
    $("#copyRef").addEventListener("click", async () => {
      const ref = state.lastPayment?.gateway_reference; if (!ref) return;
      try { await navigator.clipboard.writeText(ref); toast("Transaction ID copied"); } catch { toast(ref); }
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

    $("#year").textContent = new Date().getFullYear();
  }

  /* ---------------- Init ---------------- */
  async function init() {
    bindUI();
    bindCardInputs();
    bindGroup();
    bindMfs();
    const data = await api.getCheckout(new URLSearchParams(location.search).get("session") || "cs_7Hk2pQ9xLm");
    state.session = data.session;
    state.order = data.order;
    state.user = data.user;
    state.mfsProviders = (data.payment_providers || [])
      .filter((p) => p.method_code === "mobile_banking" && p.is_active !== false)
      .sort((a, b) => a.sort_order - b.sort_order);
    state.mfsProvider = state.mfsProviders[0]?.code || null;
    renderMfs();
    renderUser();
    renderOrder();
    const uiMethod = Object.keys(METHOD_CODE).find((k) => METHOD_CODE[k] === data.session.selected_method_code) || "card";
    selectMethod(uiMethod);
    setStep(1);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
