/* Purpose Wallet: balance, coverage meter, sufficiency check and payment. */
(function () {
  "use strict";
  const PG = window.PG;
  const { $, money } = PG;

  let panel, btn;

  const balance = () => PG.state.wallet?.balance_minor || 0;
  const amount = () => PG.state.order?.total_minor || 0;
  const enough = () => balance() >= amount();

  function render({ animate = false } = {}) {
    const w = PG.state.wallet;
    if (!w || !PG.state.order) return;
    const bal = balance(), amt = amount(), ok = enough();
    const pct = amt ? Math.min(100, Math.round((bal / amt) * 100)) : 100;

    if (animate) PG.animateNumber($("#walletBalance"), bal, { from: 0, duration: 1100 });
    else { $("#walletBalance").textContent = money(bal); $("#walletBalance").dataset.value = bal; }

    $("#walletHolder").textContent = PG.state.user?.full_name || "Wallet holder";
    $("#walletNumber").textContent = w.wallet_number_masked || "";
    $("#walletStatus").textContent = w.status === "active" ? "Active" : w.status;
    $("#walletMethodBalance").textContent = `Balance ${money(bal)}`;

    $("#walletCoverage").textContent = pct + "%";
    $("#walletMeter").classList.toggle("is-short", !ok);
    requestAnimationFrame(() => ($("#walletMeterFill").style.width = pct + "%"));

    $("#walletRowBalance").textContent = money(bal);
    $("#walletRowAmount").textContent = "- " + money(amt);
    $("#walletRowAfterLabel").textContent = ok ? "Balance after payment" : "Shortfall";
    const after = $("#walletRowAfter");
    after.textContent = ok ? money(bal - amt) : "- " + money(amt - bal);
    after.classList.toggle("is-bad", !ok);

    const short = $("#walletShort");
    const wasHidden = short.hidden;
    short.hidden = ok;
    if (!ok) {
      $("#walletShortAmount").textContent = money(amt - bal);
      if (wasHidden) { short.classList.remove("is-in"); void short.offsetWidth; short.classList.add("is-in"); }
    }
    $("#walletCard").classList.toggle("is-short", !ok);
    btn.disabled = !ok;
    btn.hidden = !ok;
    btn.querySelector(".pay-btn__label").textContent = `Pay ${money(amt)} from wallet`;
  }

  async function pay() {
    if (!enough()) { render(); return; }
    const { state, api } = PG;
    PG.formError(panel, "");
    PG.setLoading(btn, true, "Paying from wallet…");
    $("#walletCard").classList.add("is-paying");
    try {
      const payment = await api.createPayment({
        checkout_session_id: state.session.id,
        order_id: state.order.id,
        method_code: "wallet",
        provider_code: "purpose_wallet",
        amount_minor: state.order.total_minor,
        currency: state.order.currency,
        details: { wallet_id: state.wallet.id },
      });
      if (payment.status !== "succeeded") throw new Error("The wallet payment didn't go through. Please try again.");
      const newBal = payment.wallet_balance_minor ?? balance() - payment.amount_minor;
      PG.animateNumber($("#walletBalance"), newBal, { duration: 900 });
      state.wallet.balance_minor = newBal;
      await PG.wait(PG.reducedMotion() ? 0 : 900);
      PG.emit("paid", { payment, method: "wallet", detail: `Purpose Wallet · ${state.wallet.wallet_number_masked}` });
    } catch (err) {
      PG.formError(panel, err.message || "Payment failed. Please try again.");
      PG.shake(btn);
    } finally {
      PG.setLoading(btn, false);
      $("#walletCard").classList.remove("is-paying");
    }
  }

  PG.modules.wallet = {
    init() {
      panel = $("#walletPanel");
      btn = $("#walletPayBtn");
      btn.addEventListener("click", pay);
    },
    show() { render({ animate: true }); },
    onOrder() { render(); },
    reset() { PG.formError(panel, ""); render(); },
    render,
  };
})();
