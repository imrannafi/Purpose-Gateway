/* Card payment: input formatting/validation + interactive 3D card preview. */
(function () {
  "use strict";
  const PG = window.PG;
  const { $, $$ } = PG;

  const BRANDS = [
    { id: "amex", re: /^3[47]/, lengths: [15], cvv: 4, gaps: [4, 10], label: "American Express" },
    { id: "visa", re: /^4/, lengths: [13, 16, 19], cvv: 3, gaps: [4, 8, 12, 16], label: "Visa" },
    { id: "mastercard", re: /^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/, lengths: [16], cvv: 3, gaps: [4, 8, 12], label: "Mastercard" },
  ];
  const detectBrand = (digits) => BRANDS.find((b) => b.re.test(digits)) || null;

  const BRAND_MARK = {
    visa: `<span class="cb cb--visa">VISA</span>`,
    mastercard: `<span class="cb cb--mc"><i></i><i></i></span>`,
    amex: `<span class="cb cb--amex">AMEX</span>`,
  };

  let form, card, el = {};
  let prevDigits = "";
  let unflipTimer;

  /* ---------------- Validation ---------------- */
  function luhn(num) {
    let sum = 0, dbl = false;
    for (let i = num.length - 1; i >= 0; i--) {
      let d = +num[i];
      if (dbl) { d *= 2; if (d > 9) d -= 9; }
      sum += d; dbl = !dbl;
    }
    return sum % 10 === 0;
  }
  const digitsOf = () => el.number.value.replace(/\D/g, "");

  const validators = {
    cardNumber() {
      const digits = digitsOf();
      const brand = detectBrand(digits);
      if (!digits) return "Card number is required.";
      const okLen = brand ? brand.lengths.includes(digits.length) : digits.length >= 12 && digits.length <= 19;
      if (!okLen || !luhn(digits)) return "Please enter a valid card number.";
      return "";
    },
    cardExpiry() {
      const v = el.expiry.value;
      const m = v.match(/^(\d{2})\s?\/\s?(\d{2})$/);
      if (!v) return "Expiry date is required.";
      if (!m) return "Use MM / YY format.";
      const mm = +m[1], yy = 2000 + +m[2];
      if (mm < 1 || mm > 12) return "Invalid month.";
      const now = new Date();
      if (new Date(yy, mm, 0, 23, 59, 59) < now) return "This card has expired.";
      if (yy > now.getFullYear() + 20) return "Invalid year.";
      return "";
    },
    cardCvv() {
      const v = el.cvv.value;
      const need = detectBrand(digitsOf())?.cvv;
      if (!v) return "CVV is required.";
      if (need ? v.length !== need : !/^\d{3,4}$/.test(v)) return `CVV must be ${need || "3–4"} digits.`;
      return "";
    },
    cardName() {
      const v = el.name.value.trim();
      if (!v) return "Cardholder name is required.";
      if (v.length < 2 || !/^[\p{L} .'-]+$/u.test(v)) return "Enter the name exactly as on the card.";
      return "";
    },
  };
  function validate(id, show = true) {
    const msg = validators[id]();
    if (show) PG.setFieldError(document.getElementById(id), msg);
    return !msg;
  }

  /* ---------------- 3D card rendering ---------------- */
  function renderNumber() {
    const digits = digitsOf();
    const brand = detectBrand(digits);
    const len = Math.max(brand?.id === "amex" ? 15 : 16, digits.length);
    const gaps = brand ? brand.gaps : [4, 8, 12, 16];
    let html = "";
    for (let i = 0; i < len; i++) {
      if (i && gaps.includes(i)) html += `<i class="card3d__gap"></i>`;
      const ch = digits[i];
      const isNew = ch && prevDigits[i] !== ch;
      html += `<span class="card3d__d${ch ? " is-on" : ""}${isNew ? " is-new" : ""}">${ch || "•"}</span>`;
    }
    el.cNumber.innerHTML = html;
    prevDigits = digits;
  }

  function renderBrand(brand) {
    const id = brand ? brand.id : "";
    if (card.dataset.brand !== id) {
      card.dataset.brand = id;
      el.cBrand.innerHTML = BRAND_MARK[id] || "";
      el.cBrandBack.innerHTML = BRAND_MARK[id] || "";
      el.cBrand.classList.remove("is-new"); void el.cBrand.offsetWidth; el.cBrand.classList.add("is-new");
    }
    el.brandText.textContent = brand ? (brand.id === "amex" ? "Amex" : brand.label) : "";
    const brands = $(".brands", form);
    brands.classList.toggle("has-match", !!brand);
    $$(".brand-logo", brands).forEach((b) => b.classList.toggle("is-match", !!brand && b.dataset.brand === id));
  }

  function renderName() {
    const v = el.name.value.trim().toUpperCase();
    el.cName.textContent = v || "YOUR NAME";
    el.cName.classList.toggle("is-on", !!v);
  }
  function renderExpiry() {
    const d = el.expiry.value.replace(/\D/g, "");
    const mask = "MMYY";
    let out = "";
    for (let i = 0; i < 4; i++) out += (d[i] || mask[i]) + (i === 1 ? "/" : "");
    el.cExpiry.textContent = out;
    el.cExpiry.classList.toggle("is-on", d.length > 0);
  }
  function renderCvv() {
    const n = el.cvv.value.length;
    el.cCvv.textContent = n ? "•".repeat(n) : "";
  }

  /* Focus highlight that glides to the zone being edited. */
  function moveFocus(zone) {
    const target = zone && $(`.card3d__front [data-zone="${zone}"]`, card);
    if (!target) { el.cFocus.classList.remove("is-on"); return; }
    let x = 0, y = 0, n = target;
    while (n && !n.classList.contains("card3d__face")) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    const pad = 6;
    Object.assign(el.cFocus.style, {
      transform: `translate(${x - pad}px, ${y - pad}px)`,
      width: target.offsetWidth + pad * 2 + "px",
      height: target.offsetHeight + pad * 2 + "px",
    });
    el.cFocus.classList.add("is-on");
  }

  const flip = (on) => { clearTimeout(unflipTimer); card.classList.toggle("is-flipped", on); };

  /* Subtle pointer tilt + moving light. */
  function bindTilt() {
    const stage = $(".card-stage", form);
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    stage.addEventListener("pointermove", (e) => {
      if (PG.reducedMotion()) return;
      const r = stage.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      card.style.setProperty("--ry", (px * 14).toFixed(2) + "deg");
      card.style.setProperty("--rx", (-py * 10).toFixed(2) + "deg");
      card.style.setProperty("--mx", ((px + 0.5) * 100).toFixed(1) + "%");
      card.style.setProperty("--my", ((py + 0.5) * 100).toFixed(1) + "%");
    });
    stage.addEventListener("pointerleave", () => {
      ["--rx", "--ry"].forEach((p) => card.style.setProperty(p, "0deg"));
      card.style.setProperty("--mx", "30%"); card.style.setProperty("--my", "20%");
    });
  }

  /* ---------------- Inputs ---------------- */
  function bindInputs() {
    el.number.addEventListener("input", () => {
      const pos = el.number.selectionStart;
      const before = el.number.value.length;
      let digits = el.number.value.replace(/\D/g, "").slice(0, 19);
      const brand = detectBrand(digits);
      if (brand) digits = digits.slice(0, Math.max(...brand.lengths));
      const gaps = brand ? brand.gaps : [4, 8, 12, 16];
      el.number.value = digits.split("").map((c, i) => (i && gaps.includes(i) ? " " : "") + c).join("");
      const diff = el.number.value.length - before;
      try { el.number.setSelectionRange(pos + diff, pos + diff); } catch (_) {}
      el.cvv.maxLength = brand ? brand.cvv : 4;
      renderBrand(brand);
      renderNumber();
      moveFocus("number");
      if (el.number.closest(".field").classList.contains("has-error")) validate("cardNumber");
    });

    el.name.addEventListener("input", () => {
      renderName();
      moveFocus("name");
      if (el.name.closest(".field").classList.contains("has-error")) validate("cardName");
    });

    el.expiry.addEventListener("input", (e) => {
      let d = el.expiry.value.replace(/\D/g, "").slice(0, 4);
      if (d.length === 1 && +d > 1) d = "0" + d;
      const deleting = e.inputType && e.inputType.startsWith("delete");
      el.expiry.value = d.length > 2 ? `${d.slice(0, 2)} / ${d.slice(2)}` : d.length === 2 && !deleting ? `${d} / ` : d;
      renderExpiry();
      if (el.expiry.closest(".field").classList.contains("has-error")) validate("cardExpiry");
    });

    el.cvv.addEventListener("input", () => {
      el.cvv.value = el.cvv.value.replace(/\D/g, "");
      renderCvv();
      flip(true);
      const need = detectBrand(digitsOf())?.cvv || 3;
      // Finished → turn back to the front.
      if (el.cvv.value.length >= need) unflipTimer = setTimeout(() => flip(false), 750);
      if (el.cvv.closest(".field").classList.contains("has-error")) validate("cardCvv");
    });

    $$("input[data-zone]", form).forEach((input) => {
      input.addEventListener("focus", () => {
        const zone = input.dataset.zone;
        if (zone === "cvv") { el.cFocus.classList.remove("is-on"); flip(true); }
        else { flip(false); moveFocus(zone); }
      });
      input.addEventListener("blur", () => {
        setTimeout(() => {
          if (!form.contains(document.activeElement) || !document.activeElement.dataset?.zone) {
            el.cFocus.classList.remove("is-on");
            flip(false);
          }
        }, 0);
        if (input.value && input.id) validate(input.id);
      });
    });
  }

  /* ---------------- Submit ---------------- */
  async function onSubmit(e) {
    e.preventDefault();
    const btn = $("#cardPayBtn");
    PG.formError(form, "");
    const ids = ["cardNumber", "cardName", "cardExpiry", "cardCvv"];
    const results = ids.map((id) => validate(id));
    const bad = ids[results.indexOf(false)];
    if (bad) { document.getElementById(bad).focus(); PG.shake(btn); return; }

    const { state, api } = PG;
    const digits = digitsOf();
    const brand = detectBrand(digits);
    const [mm, yy] = el.expiry.value.split("/").map((s) => s.trim());
    PG.setLoading(btn, true, "Securing card…");
    flip(false);
    card.classList.add("is-processing");
    try {
      // PAN/CVV go only to the processor's tokenizer — never to our backend.
      const tok = await api.tokenizeCard({ number: digits, exp_month: +mm, exp_year: 2000 + +yy, cvc: el.cvv.value, name: el.name.value.trim(), brand: brand?.id });
      btn.querySelector(".pay-btn__label").textContent = "Processing payment…";
      const payment = await api.createPayment({
        checkout_session_id: state.session.id,
        order_id: state.order.id,
        method_code: "card",
        provider_code: brand?.id || "card",
        amount_minor: state.order.total_minor,
        currency: state.order.currency,
        details: {
          token: tok.token, brand: tok.brand || brand?.id || "unknown", last4: tok.last4 || digits.slice(-4),
          exp_month: +mm, exp_year: 2000 + +yy, cardholder_name: el.name.value.trim(), save_card: $("#saveCard").checked,
        },
      });
      if (payment.status === "requires_action" && payment.redirect_url) { location.assign(payment.redirect_url); return; } // 3-D Secure
      if (payment.status !== "succeeded") throw new Error("The card was not charged. Please try again.");
      PG.emit("paid", { payment, method: "card", detail: `${brand ? brand.label : "Card"} •••• ${digits.slice(-4)}` });
    } catch (err) {
      PG.formError(form, err.message || "Payment failed. Please try again.");
      PG.shake(btn);
    } finally {
      PG.setLoading(btn, false);
      PG.refreshAmountLabels();
      card.classList.remove("is-processing");
    }
  }

  function reset() {
    form.reset();
    $$(".field", form).forEach((f) => f.classList.remove("has-error", "is-valid"));
    $$(".field__error", form).forEach((x) => (x.textContent = ""));
    PG.formError(form, "");
    prevDigits = "";
    renderBrand(null); renderNumber(); renderName(); renderExpiry(); renderCvv();
    flip(false); el.cFocus.classList.remove("is-on");
  }

  PG.modules.card = {
    init() {
      form = $("#cardForm");
      card = $("#card3d");
      el = {
        number: $("#cardNumber"), name: $("#cardName"), expiry: $("#cardExpiry"), cvv: $("#cardCvv"),
        brandText: $("#cardBrand"),
        cNumber: $("#card3dNumber"), cName: $("#card3dName"), cExpiry: $("#card3dExpiry"), cCvv: $("#card3dCvv"),
        cBrand: $("#card3dBrand"), cBrandBack: $("#card3dBrandBack"), cFocus: $("#card3dFocus"),
      };
      bindInputs();
      bindTilt();
      form.addEventListener("submit", onSubmit);
      renderNumber();
      card.classList.add("is-intro");
    },
    show() {
      card.classList.remove("is-intro"); void card.offsetWidth; card.classList.add("is-intro");
    },
    reset,
  };
})();
