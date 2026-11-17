/**
 * Tiny dependency-free SVG charts: sparkline() and areaChart().
 * Curves use monotone cubic interpolation so they never overshoot the data.
 */
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let uid = 0;

  function el(name, attrs = {}, parent) {
    const node = document.createElementNS(NS, name);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  /** Monotone cubic (Fritsch–Carlson) path through points [[x,y],...] */
  function monotonePath(pts) {
    const n = pts.length;
    if (n === 0) return "";
    if (n === 1) return `M${pts[0][0]},${pts[0][1]}`;
    const dx = [], dy = [], m = [], t = [];
    for (let i = 0; i < n - 1; i++) {
      dx[i] = pts[i + 1][0] - pts[i][0];
      dy[i] = pts[i + 1][1] - pts[i][1];
      m[i] = dy[i] / dx[i];
    }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (m[i] === 0) { t[i] = t[i + 1] = 0; continue; }
      const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
      if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
    }
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < n - 1; i++) {
      const h = dx[i] / 3;
      d += `C${pts[i][0] + h},${pts[i][1] + t[i] * h} ${pts[i + 1][0] - h},${pts[i + 1][1] - t[i + 1] * h} ${pts[i + 1][0]},${pts[i + 1][1]}`;
    }
    return d;
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    const exp = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / exp;
    const nice = f <= 1 ? 1 : f <= 1.2 ? 1.2 : f <= 1.6 ? 1.6 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 4 ? 4 : f <= 5 ? 5 : f <= 8 ? 8 : 10;
    return nice * exp;
  }

  function gradient(defs, id, color, top = 0.35, bottom = 0) {
    const g = el("linearGradient", { id, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el("stop", { offset: 0, "stop-color": color, "stop-opacity": top }, g);
    el("stop", { offset: 1, "stop-color": color, "stop-opacity": bottom }, g);
  }

  /* ------------------------------------------------------------ sparkline */
  function sparkline(svg, values, color) {
    const W = 160, H = 60, pad = 4;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.innerHTML = "";
    const min = Math.min(...values), max = Math.max(...values);
    const pts = values.map((v, i) => [
      (i / (values.length - 1)) * W,
      pad + (1 - (v - min) / (max - min || 1)) * (H - pad * 2 - 6) + 6,
    ]);
    const id = "sg" + ++uid;
    gradient(el("defs", {}, svg), id, color, 0.28, 0);
    const line = monotonePath(pts);
    el("path", { d: `${line}L${W},${H}L0,${H}Z`, fill: `url(#${id})` }, svg);
    el("path", { d: line, fill: "none", stroke: color, "stroke-width": 2.2, "stroke-linecap": "round", "stroke-linejoin": "round", "vector-effect": "non-scaling-stroke" }, svg);
  }

  /* ------------------------------------------------------------ area chart */
  /**
   * @param {HTMLElement} host
   * @param {{points:{label:string, full:string, value:number}[], formatValue:(n)=>string, formatTick:(n)=>string, defaultIndex?:number, ariaLabel?:string}} opts
   */
  function areaChart(host, opts) {
    let state = { ...opts };
    let active = null;
    let geom = null;
    let animated = false;

    host.tabIndex = 0;
    host.innerHTML = "";
    const svg = el("svg", { "aria-hidden": "true" }, host);
    const tip = document.createElement("div");
    tip.className = "chart-tip";
    host.appendChild(tip);

    function render() {
      const W = host.clientWidth;
      const H = host.clientHeight || 240;
      if (!W) return;
      const narrow = W < 460;
      const m = { top: 30, right: narrow ? 10 : 18, bottom: 30, left: narrow ? 40 : 52 };
      const iw = W - m.left - m.right;
      const ih = H - m.top - m.bottom;
      const values = state.points.map((p) => p.value);
      const yMax = niceMax(Math.max(...values) * 1.12);
      const n = values.length;
      const x = (i) => m.left + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
      const y = (v) => m.top + (1 - v / yMax) * ih;

      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.innerHTML = "";
      const id = "ag" + ++uid;
      const defs = el("defs", {}, svg);
      gradient(defs, id, "#2b5cf6", 0.22, 0.02);

      // horizontal grid + y labels
      const yTicks = 4;
      for (let k = 0; k <= yTicks; k++) {
        const v = (yMax / yTicks) * k;
        const yy = y(v);
        if (k > 0) el("line", { x1: m.left, x2: m.left + iw, y1: yy, y2: yy, class: "grid-line" }, svg);
        el("line", { x1: m.left - 5, x2: m.left, y1: yy, y2: yy, class: "axis-line" }, svg);
        const t = el("text", { x: m.left - 12, y: yy + 4, "text-anchor": "end", class: "tick-label" }, svg);
        t.textContent = state.formatTick(v);
      }

      // x ticks
      const xCount = narrow ? 3 : 5;
      const idxs = [...new Set(Array.from({ length: Math.min(xCount, n) }, (_, k) => Math.round((k / (Math.min(xCount, n) - 1 || 1)) * (n - 1))))];
      idxs.forEach((i, k) => {
        const xx = x(i);
        if (k > 0 && k < idxs.length - 1) el("line", { x1: xx, x2: xx, y1: m.top, y2: m.top + ih, class: "grid-line" }, svg);
        el("line", { x1: xx, x2: xx, y1: m.top + ih, y2: m.top + ih + 5, class: "axis-line" }, svg);
        const anchor = k === 0 ? "start" : k === idxs.length - 1 ? "end" : "middle";
        const t = el("text", { x: xx + (k === 0 ? -8 : k === idxs.length - 1 ? 8 : 0), y: H - 6, "text-anchor": anchor, class: "x-label" }, svg);
        t.textContent = state.points[i].label;
      });

      // axes
      el("line", { x1: m.left, x2: m.left, y1: m.top - 6, y2: m.top + ih, class: "axis-line" }, svg);
      el("line", { x1: m.left, x2: m.left + iw, y1: m.top + ih, y2: m.top + ih, class: "axis-line" }, svg);

      // series
      const pts = values.map((v, i) => [x(i), y(v)]);
      const line = monotonePath(pts);
      el("path", { d: `${line}L${x(n - 1)},${m.top + ih}L${x(0)},${m.top + ih}Z`, fill: `url(#${id})` }, svg);
      const path = el("path", { d: line, class: "line" }, svg);
      if (!animated && !reduceMotion && path.getTotalLength) {
        const len = path.getTotalLength();
        path.style.strokeDasharray = len;
        path.style.strokeDashoffset = len;
        path.getBoundingClientRect();
        path.style.transition = "stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)";
        requestAnimationFrame(() => (path.style.strokeDashoffset = 0));
        animated = true;
      }

      // hover layer
      const cross = el("line", { class: "crosshair", y1: m.top, y2: m.top + ih }, svg);
      const dot = el("circle", { class: "dot", r: 7 }, svg);
      geom = { x, y, n, m, iw, ih, W, cross, dot, pts };
      setActive(active ?? defaultIndex());
    }

    function defaultIndex() {
      const n = state.points.length;
      return state.defaultIndex != null ? Math.min(state.defaultIndex, n - 1) : n - 1;
    }

    function setActive(i) {
      if (!geom) return;
      active = Math.max(0, Math.min(geom.n - 1, i));
      const [px, py] = geom.pts[active];
      geom.cross.setAttribute("x1", px); geom.cross.setAttribute("x2", px);
      geom.cross.setAttribute("y1", py + 9);
      geom.dot.setAttribute("cx", px); geom.dot.setAttribute("cy", py);
      const p = state.points[active];
      tip.innerHTML = `${state.formatValue(p.value)}<small>${p.full}</small>`;
      // clamp tooltip inside the host
      const tw = tip.offsetWidth || 110;
      const left = Math.max(tw / 2 + 2, Math.min(geom.W - tw / 2 - 2, px));
      tip.style.left = left + "px";
      tip.style.top = py + "px";
      tip.style.setProperty("--arrow-shift", px - left + "px");
      host.setAttribute("aria-valuetext", `${p.full}: ${state.formatValue(p.value)}`);
    }

    function indexFromEvent(e) {
      const r = host.getBoundingClientRect();
      const px = e.clientX - r.left;
      const t = (px - geom.m.left) / geom.iw;
      return Math.round(t * (geom.n - 1));
    }

    host.addEventListener("pointermove", (e) => geom && setActive(indexFromEvent(e)));
    host.addEventListener("pointerdown", (e) => geom && setActive(indexFromEvent(e)));
    host.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") setActive(defaultIndex()); });
    host.addEventListener("keydown", (e) => {
      if (!geom) return;
      const map = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity };
      if (!(e.key in map)) return;
      e.preventDefault();
      const d = map[e.key];
      setActive(Number.isFinite(d) ? active + d : d < 0 ? 0 : geom.n - 1);
    });

    let raf;
    const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); });
    ro.observe(host);
    render();

    return {
      update(next) {
        state = { ...state, ...next };
        active = null;
        animated = false;
        render();
        host.setAttribute("aria-label", state.ariaLabel || "Chart");
      },
    };
  }

  window.PG_CHARTS = { sparkline, areaChart };
})();
