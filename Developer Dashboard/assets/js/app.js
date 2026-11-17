/* Purpose Gateway — Developer Portal UI */
(function () {
  "use strict";

  var api = window.PGApi;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var state = {
    sandbox: true,
    lang: "curl",
    keys: [],
    samples: {},
    usageRows: [],
    activeIndex: null
  };

  /* ---------------- helpers ---------------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fmtCompact(n) {
    if (n >= 1e6) return trimZeros((n / 1e6).toFixed(n >= 1e7 ? 1 : 2)) + "M";
    if (n >= 1e3) return trimZeros((n / 1e3).toFixed(1)) + "K";
    return String(n);
  }
  function trimZeros(s) { return s.replace(/\.0+$|(\.\d*?)0+$/, "$1"); }

  function fmtMs(ms) { return ms >= 1000 ? trimZeros((ms / 1000).toFixed(1)) + "s" : ms + "ms"; }

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fmtDay(iso) { var d = new Date(iso + "T00:00:00Z"); return MONTHS[d.getUTCMonth()] + " " + d.getUTCDate(); }

  function timeAgo(iso) {
    var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return Math.floor(s / 86400) + "d ago";
  }

  function svgIcon(id, cls) { return '<svg class="icon ' + (cls || "") + '"><use href="#' + id + '"/></svg>'; }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy") ? resolve() : reject(); } catch (e) { reject(e); }
      document.body.removeChild(ta);
    });
  }

  function toast(msg, type) {
    var el = document.createElement("div");
    el.className = "toast" + (type === "error" ? " toast--error" : "");
    el.innerHTML = svgIcon(type === "error" ? "i-alert" : "i-check", "icon--sm") + "<span>" + esc(msg) + "</span>";
    $("#toasts").appendChild(el);
    setTimeout(function () {
      el.classList.add("is-leaving");
      el.addEventListener("animationend", function () { el.remove(); });
    }, 2800);
  }

  /* ---------------- user ---------------- */
  function renderUser(u) {
    var initials = u.full_name.split(/\s+/).map(function (p) { return p[0]; }).slice(0, 2).join("").toUpperCase();
    $("#profileName").textContent = u.full_name;
    $("#profileRole").textContent = u.role_label;
    $("#profileAvatar").textContent = initials;
    $("#topAvatar").textContent = u.full_name.charAt(0).toUpperCase();
    $("#topAvatar").setAttribute("title", u.full_name);
  }

  /* ---------------- API keys ---------------- */
  var KEY_ICON =
    '<svg class="key__icon" viewBox="0 0 24 28" aria-hidden="true"><path fill="#3b5bfd" d="M5 1h10l7 7v16a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V4a3 3 0 0 1 3-3z"/>' +
    '<path fill="#93a8ff" d="M15 1v5a2 2 0 0 0 2 2h5z"/><path d="M7 15h10M7 20h7" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>';

  function renderKeys(keys) {
    state.keys = keys;
    $("#keyList").innerHTML = keys.map(function (k) {
      var badge = k.status !== "active"
        ? '<span class="badge badge--revoked">' + esc(k.status) + "</span>"
        : k.environment === "live"
          ? '<span class="badge badge--active"><span class="dot dot--green"></span>Active</span>'
          : '<span class="badge badge--test">Test Mode</span>';
      return (
        '<div class="key" data-key-id="' + esc(k.id) + '">' + KEY_ICON +
        '<div class="key__body"><div class="key__top"><span class="key__name">' + esc(k.name) + "</span>" + badge + "</div>" +
        '<div class="key__value" title="Ends in ' + esc(k.last_four) + '">' + esc(k.key_prefix) + "••••••••••••••••</div></div>" +
        '<div class="key__actions"><button class="key__btn" data-copy-key="' + esc(k.id) + '" aria-label="Copy ' + esc(k.name) + '">' + svgIcon("i-copy", "icon--sm") + "</button></div>" +
        "</div>"
      );
    }).join("");
  }

  function keyFor(env) {
    return state.keys.filter(function (k) { return k.environment === env; })[0];
  }

  /* ---------------- usage ---------------- */
  function renderStats(s) {
    $('[data-stat="total"]').textContent = fmtCompact(s.total_requests);
    $('[data-stat="success"]').textContent = s.success_rate + "%";
    $('[data-stat="latency"]').textContent = fmtMs(s.avg_response_ms);
    $('[data-stat="error"]').textContent = s.error_rate + "%";
  }

  function niceStep(raw) {
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var steps = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < steps.length; i++) if (steps[i] * mag >= raw) return steps[i] * mag;
    return 10 * mag;
  }

  function smoothPath(pts) {
    if (pts.length < 2) return "";
    var d = "M" + pts[0][0] + "," + pts[0][1];
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += "C" + c1x.toFixed(1) + "," + c1y.toFixed(1) + " " + c2x.toFixed(1) + "," + c2y.toFixed(1) + " " + p2[0].toFixed(1) + "," + p2[1].toFixed(1);
    }
    return d;
  }

  var chartGeom = null;

  function renderChart() {
    var rows = state.usageRows;
    var el = $("#usageChart");
    var w = el.clientWidth, h = el.clientHeight;
    if (!rows.length || !w) return;

    var pad = { l: 44, r: 14, t: 14, b: 28 };
    var iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
    var vals = rows.map(function (r) { return r.total_requests; });
    var step = niceStep(Math.max.apply(null, vals) / 3);
    var yMax = step * 3;
    var n = rows.length;

    var pts = vals.map(function (v, i) {
      return [pad.l + (n === 1 ? iw / 2 : (i * iw) / (n - 1)), pad.t + ih - (v / yMax) * ih];
    });
    var line = smoothPath(pts);
    var area = line + "L" + pts[n - 1][0] + "," + (pad.t + ih) + "L" + pts[0][0] + "," + (pad.t + ih) + "Z";

    var grid = "", yLabels = "";
    for (var g = 0; g <= 3; g++) {
      var y = pad.t + ih - (g / 3) * ih;
      grid += '<line class="chart__grid" x1="' + pad.l + '" x2="' + (w - pad.r) + '" y1="' + y + '" y2="' + y + '"/>';
      yLabels += '<text class="chart__axis" x="' + (pad.l - 12) + '" y="' + (y + 4) + '" text-anchor="end">' + fmtCompact(step * g).replace(/^0$/, "0M") + "</text>";
    }

    var labelCount = Math.min(5, n);
    var xLabels = "";
    for (var k = 0; k < labelCount; k++) {
      var idx = Math.round((k * (n - 1)) / (labelCount - 1));
      var anchor = k === 0 ? "start" : k === labelCount - 1 ? "end" : "middle";
      xLabels += '<text class="chart__axis" x="' + pts[idx][0] + '" y="' + (h - 6) + '" text-anchor="' + anchor + '">' + fmtDay(rows[idx].usage_date) + "</text>";
    }

    el.innerHTML =
      '<svg viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '" aria-hidden="true">' +
      '<defs><linearGradient id="usageFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b5bfd" stop-opacity=".22"/><stop offset="1" stop-color="#3b5bfd" stop-opacity="0"/></linearGradient></defs>' +
      grid +
      '<line class="chart__grid" x1="' + pad.l + '" x2="' + pad.l + '" y1="' + pad.t + '" y2="' + (pad.t + ih) + '" style="stroke:#dfe3f1"/>' +
      yLabels + xLabels +
      '<path d="' + area + '" fill="url(#usageFill)"/>' +
      '<path class="chart__line" d="' + line + '"/>' +
      '<line class="chart__guide" id="chartGuide" y1="' + pad.t + '" y2="' + (pad.t + ih) + '"/>' +
      '<circle class="chart__dot" id="chartDot" r="6"/>' +
      '<rect id="chartHit" x="' + pad.l + '" y="0" width="' + iw + '" height="' + h + '" fill="transparent"/>' +
      "</svg>" +
      '<div class="chart__tip" id="chartTip"></div>';

    chartGeom = { pts: pts, pad: pad, iw: iw, n: n };
    var maxIdx = vals.indexOf(Math.max.apply(null, vals));
    setActivePoint(state.activeIndex != null && state.activeIndex < n ? state.activeIndex : maxIdx, true);

    var hit = $("#chartHit");
    var onMove = function (e) {
      var rect = el.getBoundingClientRect();
      var x = e.clientX - rect.left - pad.l;
      var i = Math.round((x / iw) * (n - 1));
      setActivePoint(Math.max(0, Math.min(n - 1, i)), false);
    };
    hit.addEventListener("pointermove", onMove);
    hit.addEventListener("pointerdown", onMove);
    hit.addEventListener("pointerleave", function () { setActivePoint(maxIdx, true); });
  }

  function setActivePoint(i, isDefault) {
    if (!chartGeom) return;
    var p = chartGeom.pts[i], row = state.usageRows[i];
    var dot = $("#chartDot"), guide = $("#chartGuide"), tip = $("#chartTip");
    dot.setAttribute("cx", p[0]); dot.setAttribute("cy", p[1]);
    guide.setAttribute("x1", p[0]); guide.setAttribute("x2", p[0]);
    tip.innerHTML = fmtCompact(row.total_requests) + (isDefault ? "" : "<small>" + fmtDay(row.usage_date) + "</small>");
    var w = $("#usageChart").clientWidth;
    var half = tip.offsetWidth / 2;
    tip.style.left = Math.max(half, Math.min(w - half, p[0])) + "px";
    tip.style.top = p[1] + "px";
    if (!isDefault) state.activeIndex = null;
  }

  function loadUsage(range) {
    $("#usageChart").style.opacity = ".5";
    return Promise.all([api.getUsageSummary(range), api.getUsageDaily(range)]).then(function (res) {
      renderStats(res[0]);
      state.usageRows = res[1];
      state.activeIndex = null;
      $("#usageChart").style.opacity = "";
      renderChart();
    });
  }

  /* ---------------- code samples ---------------- */
  var KW = {
    curl: /\bcurl\b/.source,
    node: /\b(?:import|from|const|let|await|async|new|return)\b/.source,
    python: /\b(?:import|from|as|None|True|False|return)\b/.source,
    php: /<\?php|\b(?:new|echo|return)\b/.source
  };
  var STR = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/.source;
  var NUM = /\b\d+(?:\.\d+)?\b/.source;
  var FLAG = /(?:^|(?<=\s))--?[A-Za-z][\w-]*/.source;
  var VAR = /\$\w+/.source;
  var FN = /\b[A-Za-z_]\w*(?=\()/.source;
  var CLASSES = [null, "tk-str", "tk-num", "tk-kw", "tk-flag", "tk-var", "tk-fn"];

  function highlightLine(line, lang) {
    var re = new RegExp("(" + STR + ")|(" + NUM + ")|(" + KW[lang] + ")|(" + (lang === "curl" ? FLAG : "(?!)") + ")|(" + VAR + ")|(" + FN + ")", "g");
    var out = "", last = 0, m;
    while ((m = re.exec(line))) {
      if (m[0] === "") { re.lastIndex++; continue; }
      out += esc(line.slice(last, m.index));
      for (var g = 1; g < CLASSES.length; g++) {
        if (m[g] !== undefined) { out += '<span class="' + CLASSES[g] + '">' + esc(m[0]) + "</span>"; break; }
      }
      last = m.index + m[0].length;
    }
    return out + esc(line.slice(last));
  }

  function currentKey() { return keyFor(state.sandbox ? "test" : "live"); }

  function renderCode() {
    var src = state.samples[state.lang];
    if (!src) return;
    var k = currentKey();
    var shown = src.replace(/\{\{KEY\}\}/g, k ? k.key_prefix + "•••" : "YOUR_API_KEY");
    $("#codeBlock").innerHTML = shown.split("\n").map(function (l) {
      return '<span class="line">' + (highlightLine(l, state.lang) || " ") + "</span>";
    }).join("");
  }

  function setLang(lang) {
    state.lang = lang;
    $$("#codeTabs .tab").forEach(function (t) {
      var on = t.dataset.lang === lang;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
    });
    renderCode();
  }

  /* ---------------- onboarding ---------------- */
  function renderSteps(steps, justCompleted) {
    $("#stepList").innerHTML = steps.map(function (s) {
      var cls = "step" + (s.completed ? " is-done" : "") + (s.step_key === justCompleted ? " is-new" : "");
      return (
        '<li class="' + cls + '"><span class="step__num">' + s.position + "</span>" +
        '<div class="step__body"><strong>' + esc(s.title) + "</strong><span>" + esc(s.description) + "</span></div>" +
        svgIcon("i-check", "step__check") +
        (s.completed ? '<span class="sr-only" hidden>Completed</span>' : "") + "</li>"
      );
    }).join("");
  }

  /* ---------------- status ---------------- */
  var STATUS_LABEL = { operational: "Operational", degraded: "Degraded", partial_outage: "Partial Outage", major_outage: "Major Outage", maintenance: "Maintenance" };
  var CHECK_ICON = '<svg class="status-row__icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#22c55e"/><path d="m7 12.5 3.2 3L17 9" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var WARN_ICON = '<svg class="status-row__icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#f59e0b"/><path d="M12 7v6M12 16.5v.5" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>';

  function renderStatus(data) {
    var allOk = data.services.every(function (s) { return s.current_status === "operational"; });
    $("#statusList").innerHTML = data.services.map(function (s) {
      var ok = s.current_status === "operational";
      var mod = ok ? "" : s.current_status.indexOf("outage") !== -1 ? " status-row--outage" : " status-row--degraded";
      return (
        '<li class="status-row' + mod + '">' + (ok ? CHECK_ICON : WARN_ICON) +
        '<span class="status-row__name">' + esc(s.name) + "</span>" +
        '<span class="status-row__state"><span class="dot dot--green"></span>' + (STATUS_LABEL[s.current_status] || s.current_status) + "</span></li>"
      );
    }).join("");
    $("#statusBadge span:last-child").textContent = allOk ? "All Systems Operational" : "Some Systems Degraded";
    $("#statusSubtitle").textContent = allOk ? "Our services are running smoothly." : "We're investigating an issue.";
    $("#uptimeValue").textContent = data.uptime_30d + "%";
  }

  /* ---------------- notifications ---------------- */
  var NOTIF_ICON = { warning: "i-alert", success: "i-check", info: "i-package" };
  function renderNotifications(list) {
    var unread = list.filter(function (n) { return !n.is_read; }).length;
    var badge = $("#notifCount");
    badge.textContent = unread ? String(unread) : "";
    badge.dataset.count = unread;
    $("#notifBtn").setAttribute("aria-label", "Notifications" + (unread ? " (" + unread + " unread)" : ""));
    $("#notifList").innerHTML = list.length ? list.map(function (n) {
      return (
        '<li class="notif__item' + (n.is_read ? "" : " is-unread") + '">' +
        '<span class="notif__icon notif__icon--' + n.type + '">' + svgIcon(NOTIF_ICON[n.type] || "i-bell", "icon--sm") + "</span>" +
        "<div><strong>" + esc(n.title) + "</strong><p>" + esc(n.body) + '</p><time datetime="' + n.created_at + '">' + timeAgo(n.created_at) + "</time></div></li>"
      );
    }).join("") : '<li class="search__empty">You\'re all caught up.</li>';
  }

  /* ---------------- popovers ---------------- */
  var openPopover = null;
  function togglePopover(btn, panel, force) {
    var willOpen = force !== undefined ? force : panel.hidden;
    if (openPopover && openPopover.panel !== panel) closePopover();
    panel.hidden = !willOpen;
    btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
    openPopover = willOpen ? { btn: btn, panel: panel } : null;
  }
  function closePopover() {
    if (!openPopover) return;
    openPopover.panel.hidden = true;
    openPopover.btn.setAttribute("aria-expanded", "false");
    openPopover = null;
  }

  /* ---------------- sidebar drawer ---------------- */
  var mqDrawer = window.matchMedia("(max-width: 1024px)");
  function setDrawer(open) {
    var sb = $("#sidebar");
    sb.classList.toggle("is-open", open);
    $("#scrim").hidden = !open;
    $("#menuBtn").setAttribute("aria-expanded", open ? "true" : "false");
    document.body.style.overflow = open ? "hidden" : "";
    if (open) setTimeout(function () { $("#sidebarClose").focus(); }, 50);
  }

  /* ---------------- search ---------------- */
  var searchTimer, searchResults = [], searchActive = -1;
  function highlightMatch(text, q) {
    var i = text.toLowerCase().indexOf(q.toLowerCase());
    if (!q || i < 0) return esc(text);
    return esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + q.length)) + "</mark>" + esc(text.slice(i + q.length));
  }
  function renderSearch(q) {
    var box = $("#searchResults");
    if (!q.trim()) { box.hidden = true; return; }
    box.hidden = false;
    if (!searchResults.length) { box.innerHTML = '<div class="search__empty">No results for “' + esc(q) + "”</div>"; return; }
    box.innerHTML = searchResults.map(function (r, i) {
      var tag = r.kind === "endpoint"
        ? '<span class="search__tag search__tag--' + r.method.toLowerCase() + '">' + r.method + "</span>"
        : '<span class="search__tag search__tag--guide">GUIDE</span>';
      return '<div class="search__item' + (i === searchActive ? " is-active" : "") + '" role="option" data-i="' + i + '" aria-selected="' + (i === searchActive) + '">' + tag +
        "<div><strong>" + highlightMatch(r.title, q) + "</strong><small>" + highlightMatch(r.path, q) + "</small></div></div>";
    }).join("");
  }
  function chooseResult(i) {
    var r = searchResults[i];
    if (!r) return;
    $("#searchResults").hidden = true;
    $("#searchInput").blur();
    toast("Opening “" + r.title + "” — docs pages arrive in the next phase.");
  }

  /* ---------------- wire up ---------------- */
  function bind() {
    // nav + hash links
    document.addEventListener("click", function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      var hash = a.getAttribute("href");
      var target = hash.length > 1 && document.getElementById(hash.slice(1));
      if (a.classList.contains("nav__item")) {
        $$(".nav__item").forEach(function (n) { n.classList.remove("is-active"); n.removeAttribute("aria-current"); });
        a.classList.add("is-active"); a.setAttribute("aria-current", "page");
        if (mqDrawer.matches) setDrawer(false);
      }
      e.preventDefault();
      closePopover();
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: hash === "#portal" ? "start" : "center" });
      } else if (hash.length > 1) {
        var label = (a.textContent || hash.slice(1)).trim().replace(/\s+/g, " ");
        toast(label + " — this page will be available in the next phase.");
      }
    });

    // drawer
    $("#menuBtn").addEventListener("click", function () { setDrawer(true); });
    $("#sidebarClose").addEventListener("click", function () { setDrawer(false); $("#menuBtn").focus(); });
    $("#scrim").addEventListener("click", function () { setDrawer(false); });
    mqDrawer.addEventListener("change", function (e) { if (!e.matches) setDrawer(false); });

    // popovers
    $("#notifBtn").addEventListener("click", function (e) { e.stopPropagation(); togglePopover(this, $("#notifPanel")); });
    $("#profileBtn").addEventListener("click", function (e) { e.stopPropagation(); togglePopover(this, $("#profileMenu")); });
    $("#topAvatar").addEventListener("click", function (e) {
      e.stopPropagation();
      if (mqDrawer.matches) { setDrawer(true); setTimeout(function () { togglePopover($("#profileBtn"), $("#profileMenu"), true); }, 280); }
      else togglePopover($("#profileBtn"), $("#profileMenu"));
    });
    document.addEventListener("click", function (e) {
      if (openPopover && !openPopover.panel.contains(e.target)) closePopover();
      if (!$("#search").contains(e.target)) $("#searchResults").hidden = true;
    });
    $("#markAllRead").addEventListener("click", function (e) {
      e.stopPropagation();
      api.markAllNotificationsRead().then(renderNotifications);
    });

    // keys copy
    $("#keyList").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-copy-key]");
      if (!btn) return;
      var k = state.keys.filter(function (x) { return x.id === btn.dataset.copyKey; })[0];
      copyText(k.mock_token).then(function () {
        btn.classList.add("is-done");
        btn.innerHTML = svgIcon("i-check", "icon--sm");
        toast(k.name + " copied to clipboard");
        setTimeout(function () { btn.classList.remove("is-done"); btn.innerHTML = svgIcon("i-copy", "icon--sm"); }, 1600);
      }, function () { toast("Couldn't access the clipboard", "error"); });
    });

    // sandbox toggle
    $("#sandboxToggle").addEventListener("change", function () {
      state.sandbox = this.checked;
      api.updatePreferences({ sandbox_mode: state.sandbox });
      renderCode();
      toast(state.sandbox ? "Sandbox mode on — requests use your test key" : "Sandbox mode off — samples now use your live key");
    });

    // range
    $("#rangeSelect").addEventListener("change", function () { loadUsage(this.value); });

    // code tabs (click + arrow keys)
    $("#codeTabs").addEventListener("click", function (e) {
      var t = e.target.closest(".tab");
      if (t) setLang(t.dataset.lang);
    });
    $("#codeTabs").addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      var tabs = $$("#codeTabs .tab");
      var i = tabs.findIndex(function (t) { return t.dataset.lang === state.lang; });
      var next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      setLang(next.dataset.lang); next.focus();
    });

    $("#copyCode").addEventListener("click", function () {
      var k = currentKey();
      var text = state.samples[state.lang].replace(/\{\{KEY\}\}/g, k ? k.mock_token : "YOUR_API_KEY");
      var label = this.querySelector("span");
      copyText(text).then(function () {
        label.textContent = "Copied";
        toast("Code sample copied");
        setTimeout(function () { label.textContent = "Copy"; }, 1600);
      }, function () { toast("Couldn't access the clipboard", "error"); });
    });

    // run sandbox
    $("#runSandbox").addEventListener("click", function () {
      var btn = this;
      if (!state.sandbox) { toast("Turn on Sandbox Mode to send test requests safely", "error"); return; }
      btn.disabled = true;
      var original = btn.innerHTML;
      btn.innerHTML = "Sending request…";
      api.runSandboxRequest({ language: state.lang, endpoint: "payments.create" }).then(function (res) {
        btn.disabled = false; btn.innerHTML = original;
        toast(res.status + " OK · " + res.body.id + " · " + res.latency_ms + " ms");
        return api.completeOnboardingStep("first_request");
      }).then(function (steps) { renderSteps(steps, "first_request"); })
        .catch(function () { btn.disabled = false; btn.innerHTML = original; toast("Sandbox request failed", "error"); });
    });

    // search
    var input = $("#searchInput");
    var isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    $("#searchKbd").textContent = isMac ? "(⌘ + K)" : "(Ctrl + K)";
    input.addEventListener("input", function () {
      clearTimeout(searchTimer);
      var q = input.value;
      searchTimer = setTimeout(function () {
        api.search(q).then(function (r) { searchResults = r; searchActive = r.length ? 0 : -1; renderSearch(q); });
      }, 120);
    });
    input.addEventListener("focus", function () { if (input.value.trim()) renderSearch(input.value); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!searchResults.length) return;
        searchActive = (searchActive + (e.key === "ArrowDown" ? 1 : -1) + searchResults.length) % searchResults.length;
        renderSearch(input.value);
      } else if (e.key === "Enter") { e.preventDefault(); chooseResult(searchActive); }
      else if (e.key === "Escape") { input.value = ""; $("#searchResults").hidden = true; input.blur(); }
    });
    $("#searchResults").addEventListener("mousedown", function (e) {
      var item = e.target.closest(".search__item");
      if (item) { e.preventDefault(); chooseResult(+item.dataset.i); }
    });

    // tutorial modal
    var modal = $("#tutorialModal");
    $("#tutorialBtn").addEventListener("click", function () { modal.hidden = false; modal.querySelector("[data-close]").focus(); });
    modal.addEventListener("click", function (e) { if (e.target === modal || e.target.closest("[data-close]")) { modal.hidden = true; $("#tutorialBtn").focus(); } });

    // global keys
    document.addEventListener("keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); input.focus(); input.select(); }
      if (e.key === "Escape") {
        closePopover();
        if (!modal.hidden) { modal.hidden = true; $("#tutorialBtn").focus(); }
        if ($("#sidebar").classList.contains("is-open")) { setDrawer(false); $("#menuBtn").focus(); }
      }
    });

    // chart resize
    if ("ResizeObserver" in window) {
      var raf;
      new ResizeObserver(function () { cancelAnimationFrame(raf); raf = requestAnimationFrame(renderChart); }).observe($("#usageChart"));
    } else {
      window.addEventListener("resize", renderChart);
    }

    $("#year").textContent = new Date().getFullYear();
  }

  /* ---------------- init ---------------- */
  function init() {
    bind();

    api.getCurrentUser().then(renderUser);
    api.getNotifications().then(renderNotifications);
    api.getOnboarding().then(function (s) { renderSteps(s); });
    api.getServiceStatus().then(renderStatus);
    loadUsage($("#rangeSelect").value);

    Promise.all([api.getPreferences(), api.getApiKeys(), api.getCodeSamples()]).then(function (res) {
      state.sandbox = !!res[0].sandbox_mode;
      $("#sandboxToggle").checked = state.sandbox;
      renderKeys(res[1]);
      state.samples = res[2];
      setLang(res[0].default_code_language || "curl");
    }).catch(function () { toast("Failed to load dashboard data", "error"); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
