/* Group payment: contributors (name, mobile number, provider, share) each get
   their own provider payment request; statuses are tracked individually. */
(function () {
  "use strict";
  const PG = window.PG;
  const { $, $$, escapeHtml, money } = PG;

  const MAX = 10, MIN = 2, POLL_MS = 1200;
  const STATUS = {
    pending: { label: "Pending", note: "Request sent" },
    accepted: { label: "Accepted", note: "Approving payment" },
    paid: { label: "Paid", note: "Received" },
    declined: { label: "Declined", note: "Request declined" },
    expired: { label: "Expired", note: "Request expired" },
  };

  let panel, list, contribs = [], group = null, pollTimer = null, seenPaid = new Set(), keySeq = 0;

  const total = () => PG.state.order.total_minor;
  const splitType = () => $('input[name="splitType"]:checked', panel).value;
  const newRow = (o = {}) => ({ key: ++keySeq, name: "", digits: "", provider: "", share_minor: 0, ...o });

  /* ================= Setup ================= */
  function initRows() {
    const u = PG.state.user || {};
    const providers = PG.state.mfsProviders;
    contribs = [
      newRow({ name: u.full_name || "", digits: PG.bdDigits(u.phone || ""), provider: providers[0]?.code || "" }),
      newRow({ provider: providers[1]?.code || providers[0]?.code || "" }),
    ];
    recalc();
  }

  function recalc() {
    if (splitType() !== "equal" || !contribs.length) return;
    const n = contribs.length, t = total();
    const base = Math.floor(t / n), rem = t - base * n;
    contribs.forEach((c, i) => (c.share_minor = base + (i === 0 ? rem : 0)));
  }

  function providerOptions(sel) {
    return PG.state.mfsProviders.map((p) => `
      <li role="option" tabindex="-1" aria-selected="${p.code === sel}" data-code="${escapeHtml(p.code)}">
        ${PG.logoTile(p, "pp__logo")}<span>${escapeHtml(p.name)}</span>
        ${p.code === sel ? `<svg class="pp__tick"><use href="#i-check"/></svg>` : ""}
      </li>`).join("");
  }

  function pickerButton(code) {
    const p = PG.provider(code);
    return p
      ? `${PG.logoTile(p, "pp__logo")}<span class="pp__name">${escapeHtml(p.name)}</span>`
      : `<span class="pp__placeholder">Select provider</span>`;
  }

  function renderSetup() {
    recalc();
    const custom = splitType() === "custom";
    list.innerHTML = contribs.map((c, i) => `
      <li class="contrib" data-key="${c.key}" style="--i:${i}">
        <span class="contrib__avatar av-${i % 6}">${escapeHtml(PG.initials(c.name))}</span>
        <div class="contrib__field contrib__name">
          <label class="sr-only" for="cn-${c.key}">Contributor ${i + 1} name</label>
          <input id="cn-${c.key}" type="text" data-k="name" value="${escapeHtml(c.name)}" placeholder="Contributor name" autocomplete="off" />
        </div>
        <div class="contrib__field contrib__phone">
          <label class="sr-only" for="cp-${c.key}">Contributor ${i + 1} mobile number</label>
          <span class="contrib__prefix">+880</span>
          <input id="cp-${c.key}" type="text" inputmode="tel" data-k="phone" value="${escapeHtml(PG.formatBd(c.digits))}" placeholder="1XXX-XXXXXX" maxlength="16" autocomplete="off" />
        </div>
        <div class="contrib__field contrib__provider pp">
          <button type="button" class="pp__btn" aria-haspopup="listbox" aria-expanded="false" aria-label="Contributor ${i + 1} mobile banking provider">
            ${pickerButton(c.provider)}<svg class="pp__chev"><use href="#i-chevron-down"/></svg>
          </button>
          <ul class="pp__list" role="listbox" hidden></ul>
        </div>
        <div class="contrib__field contrib__amount">
          <label class="sr-only" for="ca-${c.key}">Contributor ${i + 1} amount in taka</label>
          <span class="contrib__prefix">৳</span>
          <input id="ca-${c.key}" type="number" min="0" step="0.01" inputmode="decimal" data-k="share" value="${(c.share_minor / 100).toFixed(2).replace(/\.00$/, "")}" ${custom ? "" : "readonly"} />
        </div>
        <button type="button" class="contrib__remove" aria-label="Remove contributor ${i + 1}" ${contribs.length <= MIN ? "disabled" : ""}><svg><use href="#i-x"/></svg></button>
      </li>`).join("");
    PG.hydrateLogos(list);
    $("#addContrib").disabled = contribs.length >= MAX;
    $("#groupCount").textContent = `${contribs.length} contributors`;
    renderSummary();
  }

  function renderSummary() {
    const sum = contribs.reduce((a, c) => a + c.share_minor, 0);
    const diff = total() - sum;
    const status = diff === 0
      ? `<span class="good"><svg><use href="#i-check"/></svg>Split matches total</span>`
      : `<span class="bad">${diff > 0 ? money(diff) + " left to assign" : money(-diff) + " over total"}</span>`;
    $("#splitSummary").innerHTML = `
      <span>Contributors <b>${contribs.length}</b></span>
      <span>Assigned <b>${money(sum)}</b> of <b>${money(total())}</b></span>
      ${status}`;
  }

  /* Provider picker (listbox) */
  function closePickers(except) {
    $$(".pp", list).forEach((pp) => {
      if (pp === except) return;
      $(".pp__list", pp).hidden = true;
      $(".pp__btn", pp).setAttribute("aria-expanded", "false");
      pp.closest(".contrib")?.classList.remove("is-open");
    });
  }
  function openPicker(pp) {
    const row = pp.closest(".contrib");
    const c = contribs.find((x) => x.key === +row.dataset.key);
    const ul = $(".pp__list", pp);
    closePickers(pp);
    ul.innerHTML = providerOptions(c.provider);
    PG.hydrateLogos(ul);
    ul.hidden = false;
    row.classList.add("is-open");
    $(".pp__btn", pp).setAttribute("aria-expanded", "true");
    ($('[aria-selected="true"]', ul) || $("li", ul))?.focus();
  }
  function pickProvider(li) {
    const pp = li.closest(".pp");
    const row = li.closest(".contrib");
    const c = contribs.find((x) => x.key === +row.dataset.key);
    c.provider = li.dataset.code;
    const btn = $(".pp__btn", pp);
    btn.innerHTML = pickerButton(c.provider) + `<svg class="pp__chev"><use href="#i-chevron-down"/></svg>`;
    PG.hydrateLogos(btn);
    btn.classList.remove("has-error");
    PG.formError($('[data-group-view="setup"]', panel), "");
    closePickers();
    btn.focus();
  }

  function validate() {
    $$(".has-error", list).forEach((x) => x.classList.remove("has-error"));
    const flag = (key, sel) => $(`.contrib[data-key="${key}"] ${sel}`, list)?.classList.add("has-error");
    if (contribs.length < MIN) return "Add at least two contributors.";
    let msg = "";
    const seen = new Set();
    contribs.forEach((c) => {
      if (!c.name.trim()) { flag(c.key, ".contrib__name"); msg = msg || "Enter a name for every contributor."; }
      if (!PG.isBdMobile(c.digits)) { flag(c.key, ".contrib__phone"); msg = msg || "Enter a valid 11-digit mobile number (01XXX-XXXXXX) for every contributor."; }
      if (!c.provider) { flag(c.key, ".pp__btn"); msg = msg || "Choose a mobile banking provider for every contributor."; }
      if (c.share_minor <= 0) { flag(c.key, ".contrib__amount"); msg = msg || "Every contributor's amount must be greater than zero."; }
      const id = c.digits + "|" + c.provider;
      if (c.digits && c.provider && seen.has(id)) { flag(c.key, ".contrib__phone"); msg = msg || "The same number is listed twice with the same provider."; }
      seen.add(id);
    });
    if (msg) return msg;
    const sum = contribs.reduce((a, c) => a + c.share_minor, 0);
    if (sum !== total()) return `The amounts must add up to ${money(total())}. ${sum < total() ? money(total() - sum) + " is still unassigned." : money(sum - total()) + " too much is assigned."}`;
    return "";
  }

  async function sendRequests() {
    const setup = $('[data-group-view="setup"]', panel);
    const btn = $("#sendRequests");
    const msg = validate();
    PG.formError(setup, msg);
    if (msg) { PG.shake(btn); return; }
    PG.setLoading(btn, true, "Sending requests…");
    try {
      group = await PG.api.createGroupPayment({
        checkout_session_id: PG.state.session.id,
        order_id: PG.state.order.id,
        split_type: splitType(),
        contributors: contribs.map((c) => ({ name: c.name.trim(), phone: "+880" + c.digits, provider_code: c.provider, share_minor: c.share_minor })),
      });
      seenPaid = new Set();
      PG.state.groupLocked = true;
      PG.emit("group-lock", true);
      showTrack();
      PG.toast(`Payment requests sent to ${group.members.length} contributors`);
    } catch (err) {
      PG.formError(setup, err.message || "Couldn't send the requests. Please try again.");
      PG.shake(btn);
    } finally {
      PG.setLoading(btn, false);
    }
  }

  /* ================= Tracking ================= */
  function showTrack() {
    $("#groupSubtitle").textContent = "Track each contributor's payment in real time";
    PG.showView($$("[data-group-view]", panel), "data-group-view", "track");
    list.innerHTML = "";
    $("#gTrack").innerHTML = "";
    renderTrack(group, true);
    startPolling();
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(async () => {
      if (!group) return stopPolling();
      try {
        group = await PG.api.getGroupPayment(group.id);
        renderTrack(group);
      } catch (_) { /* keep polling; transient network errors are fine */ }
    }, POLL_MS);
  }
  function stopPolling() { clearInterval(pollTimer); pollTimer = null; }

  function trackRow(m, i) {
    const p = PG.provider(m.provider_code);
    return `
      <li class="gt is-${m.status}" data-id="${escapeHtml(m.id)}" style="--i:${i}">
        <span class="gt__avatar av-${i % 6}">${escapeHtml(PG.initials(m.name))}<span class="gt__badge"><svg><use href="#i-check"/></svg></span></span>
        <div class="gt__who">
          <strong>${escapeHtml(m.name)}</strong>
          <span>${escapeHtml(PG.displayPhone(PG.bdDigits(m.phone)))}</span>
        </div>
        <div class="gt__provider">${PG.logoTile(p, "gt__logo")}<span>${escapeHtml(p ? p.name : m.provider_code)}</span></div>
        <div class="gt__amount"><small>Requested</small><strong>${money(m.share_minor)}</strong></div>
        <div class="gt__state">
          <span class="gt__chip"></span>
          <span class="gt__timeline" aria-hidden="true"><i></i><b></b><i></i><b></b><i></i></span>
        </div>
        <button type="button" class="gt__remind btn-sm" data-remind="${escapeHtml(m.id)}"><svg><use href="#i-bell"/></svg>Remind</button>
      </li>`;
  }

  function updateRow(li, m) {
    const s = STATUS[m.status] || STATUS.pending;
    li.className = `gt is-${m.status}`;
    $(".gt__chip", li).innerHTML = `<i class="dot dot--${m.status}"></i>${s.label}<small>${s.note}</small>`;
    $(".gt__chip", li).setAttribute("aria-label", `${m.name}: ${s.label}`);
    if (m.status === "paid" && !seenPaid.has(m.id)) {
      seenPaid.add(m.id);
      li.classList.add("just-paid");
      setTimeout(() => li.classList.remove("just-paid"), 1600);
    }
  }

  function renderTrack(g, first = false) {
    const ul = $("#gTrack");
    if (first || ul.children.length !== g.members.length) {
      ul.innerHTML = g.members.map(trackRow).join("");
      PG.hydrateLogos(ul);
    }
    g.members.forEach((m) => {
      const li = $(`.gt[data-id="${CSS.escape(m.id)}"]`, ul);
      if (!li) return;
      const wasPaid = seenPaid.has(m.id);
      updateRow(li, m);
      if (!first && !wasPaid && m.status === "paid") PG.toast(`${m.name} paid ${money(m.share_minor)}`);
    });
    if (first) g.members.filter((m) => m.status === "paid").forEach((m) => seenPaid.add(m.id));

    const collected = g.collected_minor, t = g.total_minor;
    const paidCount = g.members.filter((m) => m.status === "paid").length;
    const pct = t ? Math.round((collected / t) * 100) : 0;
    $("#gTotal").textContent = money(t);
    PG.animateNumber($("#gCollected"), collected, { duration: 700 });
    PG.animateNumber($("#gRemaining"), t - collected, { duration: 700 });
    $("#gPeople").innerHTML = `${g.members.length} <small>· ${paidCount} paid</small>`;
    $("#gPct").textContent = pct + "%";
    const C = 2 * Math.PI * 50;
    const bar = $("#gRingBar");
    bar.style.strokeDasharray = C;
    bar.style.strokeDashoffset = C * (1 - pct / 100);
    $(".gsum", panel).classList.toggle("is-full", collected >= t);
    $("#groupCount").textContent = `${paidCount}/${g.members.length} paid`;

    const funded = collected >= t;
    const btn = $("#groupComplete");
    if (!btn.classList.contains("is-loading")) {
      btn.disabled = !funded;
      btn.classList.toggle("is-ready", funded);
      btn.querySelector(".pay-btn__label").textContent = funded ? `Complete Payment ${money(t)}` : `Waiting for contributors… ${money(t - collected)} left`;
    }
    if (funded) stopPolling();
  }

  async function complete() {
    const btn = $("#groupComplete");
    const track = $('[data-group-view="track"]', panel);
    PG.formError(track, "");
    PG.setLoading(btn, true, "Completing payment…");
    try {
      const payment = await PG.api.completeGroupPayment(group.id);
      PG.emit("paid", { payment, method: "group", detail: `${payment.contributors || group.members.length} contributors · ${payment.group_share_code || group.share_code}` });
    } catch (err) {
      PG.formError(track, err.message || "Couldn't complete the payment. Please try again.");
      PG.shake(btn);
    } finally {
      PG.setLoading(btn, false);
    }
  }

  let cancelArmed = null;
  async function cancel() {
    const btn = $("#groupCancel");
    if (!cancelArmed) {
      btn.classList.add("is-armed");
      btn.lastChild.textContent = "Click again to cancel all requests";
      cancelArmed = setTimeout(() => { cancelArmed = null; btn.classList.remove("is-armed"); btn.lastChild.textContent = "Cancel all requests"; }, 3500);
      return;
    }
    clearTimeout(cancelArmed); cancelArmed = null;
    btn.classList.remove("is-armed"); btn.lastChild.textContent = "Cancel all requests";
    stopPolling();
    try { await PG.api.cancelGroupPayment(group.id); } catch (_) {}
    group = null;
    PG.state.groupLocked = false;
    PG.emit("group-lock", false);
    PG.toast("All payment requests were cancelled");
    backToSetup();
  }

  function backToSetup() {
    $("#groupSubtitle").textContent = "Add contributors — each gets their own payment request";
    PG.showView($$("[data-group-view]", panel), "data-group-view", "setup", "back");
    renderSetup();
  }

  /* ================= Bindings ================= */
  function bind() {
    list.addEventListener("input", (e) => {
      const row = e.target.closest(".contrib"); if (!row) return;
      const c = contribs.find((x) => x.key === +row.dataset.key);
      const k = e.target.dataset.k;
      e.target.closest(".contrib__field")?.classList.remove("has-error");
      PG.formError($('[data-group-view="setup"]', panel), "");
      if (k === "name") { c.name = e.target.value; $(".contrib__avatar", row).textContent = PG.initials(c.name); }
      if (k === "phone") { c.digits = PG.bdDigits(e.target.value); e.target.value = PG.formatBd(c.digits); }
      if (k === "share") { c.share_minor = Math.max(0, PG.toMinor(e.target.value)); renderSummary(); }
    });
    list.addEventListener("click", (e) => {
      const rm = e.target.closest(".contrib__remove");
      if (rm) {
        const key = +rm.closest(".contrib").dataset.key;
        contribs = contribs.filter((c) => c.key !== key);
        renderSetup();
        return;
      }
      const btn = e.target.closest(".pp__btn");
      if (btn) { btn.getAttribute("aria-expanded") === "true" ? closePickers() : openPicker(btn.closest(".pp")); return; }
      const li = e.target.closest(".pp__list li");
      if (li) pickProvider(li);
    });
    list.addEventListener("keydown", (e) => {
      const li = e.target.closest(".pp__list li");
      if (!li) return;
      const items = $$("li", li.parentElement);
      const i = items.indexOf(li);
      if (e.key === "ArrowDown") { e.preventDefault(); items[Math.min(items.length - 1, i + 1)].focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); items[Math.max(0, i - 1)].focus(); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickProvider(li); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); const b = $(".pp__btn", li.closest(".pp")); closePickers(); b.focus(); }
      else if (e.key === "Tab") closePickers();
    });
    document.addEventListener("click", (e) => { if (!e.target.closest(".pp")) closePickers(); });

    $("#addContrib").addEventListener("click", () => {
      if (contribs.length >= MAX) return;
      const used = new Set(contribs.map((c) => c.provider));
      const next = PG.state.mfsProviders.find((p) => !used.has(p.code)) || PG.state.mfsProviders[0];
      contribs.push(newRow({ provider: next?.code || "" }));
      renderSetup();
      $$('input[data-k="name"]', list).pop()?.focus();
    });
    $$('input[name="splitType"]', panel).forEach((r) => r.addEventListener("change", renderSetup));
    $("#sendRequests").addEventListener("click", sendRequests);

    $("#gTrack").addEventListener("click", async (e) => {
      const b = e.target.closest("[data-remind]"); if (!b || !group) return;
      b.disabled = true;
      const m = group.members.find((x) => x.id === b.dataset.remind);
      try { await PG.api.remindGroupMember(group.id, b.dataset.remind); PG.toast(`Reminder sent to ${m?.name || "contributor"}`); }
      catch (err) { PG.toast(err.message); }
      setTimeout(() => (b.disabled = false), 4000);
    });
    $("#groupComplete").addEventListener("click", complete);
    $("#groupCancel").addEventListener("click", cancel);
  }

  PG.modules.group = {
    init() {
      panel = $("#groupPanel");
      list = $("#contribs");
      bind();
    },
    show() {
      if (group) return;
      if (!contribs.length) initRows();
      renderSetup();
    },
    onOrder() { if (!group && contribs.length) renderSetup(); },
    reset() {
      stopPolling();
      group = null;
      contribs = [];
      PG.state.groupLocked = false;
      $('input[name="splitType"][value="equal"]', panel).checked = true;
      PG.formError($('[data-group-view="setup"]', panel), "");
      PG.formError($('[data-group-view="track"]', panel), "");
      $("#groupSubtitle").textContent = "Add contributors — each gets their own payment request";
      PG.showView($$("[data-group-view]", panel), "data-group-view", "setup", "back");
    },
  };
})();
