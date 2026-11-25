/* Payment success popup: animated check, confetti and receipt. */
(function () {
  "use strict";
  const PG = window.PG;
  const { $, escapeHtml, money } = PG;

  const COPY = {
    card: { msg: "Your card payment was approved.", thanks: "Thank you for your purchase! A confirmation has been sent to your email." },
    mobile: { msg: "Your mobile banking payment was verified by the provider.", thanks: "Thank you for your purchase! A confirmation has been sent to your email." },
    wallet: { msg: "The amount was paid from your Purpose Wallet.", thanks: "Thank you for your purchase! Your new wallet balance is updated." },
    group: { msg: "Everyone has paid their share and your order is fully paid.", thanks: "Thank you — and thanks to everyone who chipped in! Each contributor gets their own receipt." },
  };

  function show({ payment, method, detail }) {
    const { state } = PG;
    state.lastPayment = payment;
    const modal = $("#successModal");
    const copy = COPY[method] || COPY.card;

    $("#successTitle").textContent = "Payment Successful!";
    $("#successMsg").textContent = copy.msg;
    $("#successThanks").textContent = copy.thanks;
    $("#successAmount").textContent = money(payment.amount_minor);

    const rows = [
      ["Transaction ID", payment.gateway_reference],
      ["Payment method", PG.METHOD_LABEL[method] || method],
      ...(detail ? [["Paid with", detail]] : []),
      ...(payment.provider_transaction_id ? [["Provider reference", payment.provider_transaction_id]] : []),
      ["Order number", state.order.order_number],
      ["Date", new Date(payment.paid_at || Date.now()).toLocaleString()],
    ];
    $("#receipt").innerHTML = rows.map(([k, v], i) =>
      `<div style="--i:${i}"><dt>${escapeHtml(k)}</dt><dd${k === "Transaction ID" ? ' class="is-ref"' : ""}>${escapeHtml(v)}</dd></div>`).join("");

    PG.emit("step", 3);
    PG.openModal(modal, { initialFocus: $("#successDone"), onClose: () => PG.emit("restart") });
    modal.classList.remove("is-play"); void modal.offsetWidth; modal.classList.add("is-play");
    setTimeout(() => PG.confetti($("#confetti")), 350);
    $("#bag3d")?.classList.add("is-celebrate");
    setTimeout(() => $("#bag3d")?.classList.remove("is-celebrate"), 1600);
  }

  PG.modules.success = {
    init() {
      PG.on("paid", show);
      $("#successDone").addEventListener("click", () => PG.closeModal($("#successModal"), "done"));
      $("#copyRef").addEventListener("click", async () => {
        const ref = PG.state.lastPayment?.gateway_reference; if (!ref) return;
        try { await navigator.clipboard.writeText(ref); PG.toast("Transaction ID copied"); } catch { PG.toast(ref); }
      });
    },
  };
})();
