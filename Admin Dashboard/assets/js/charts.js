/* =========================================================
   Lightweight SVG charts (no dependencies)
   ========================================================= */
(function (global) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  let uid = 0;

  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  /** Smooth path through points (Catmull-Rom → cubic Bézier) */
  function smoothPath(pts, tension = 0.18) {
    if (!pts.length) return '';
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) * tension, c1y = p1[1] + (p2[1] - p0[1]) * tension;
      const c2x = p2[0] - (p3[0] - p1[0]) * tension, c2y = p2[1] - (p3[1] - p1[1]) * tension;
      d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
    }
    return d;
  }

  /** KPI sparkline with soft gradient fill */
  function sparkline(container, data, color) {
    const w = 150, h = 56, pad = 4;
    const min = Math.min(...data), max = Math.max(...data);
    const pts = data.map((v, i) => [pad + (i / (data.length - 1)) * (w - pad * 2), h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2 - 6)]);
    const id = 'sg' + ++uid;
    const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none', class: 'kpi__spark', 'aria-hidden': 'true' });
    const grad = el('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, el('defs', {}, svg));
    el('stop', { offset: 0, 'stop-color': color, 'stop-opacity': 0.35 }, grad);
    el('stop', { offset: 1, 'stop-color': color, 'stop-opacity': 0 }, grad);
    const line = smoothPath(pts);
    el('path', { d: `${line} L${pts[pts.length - 1][0]},${h} L${pts[0][0]},${h} Z`, fill: `url(#${id})` }, svg);
    el('path', { d: line, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' }, svg);
    container.appendChild(svg);
  }

  /**
   * Multi-series area chart with hover tooltip.
   * series: [{ key, color, fill:boolean }]
   * data:   [{ label, [key]: number }]
   */
  function areaChart(container, data, series, opts = {}) {
    const fmt = opts.format || ((v) => (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k');
    const yMax = opts.yMax || 100000;
    const yTicks = opts.yTicks || [0, 25000, 50000, 75000, 100000];
    const highlight = opts.highlightIndex;

    function render() {
      container.innerHTML = '';
      const W = Math.max(container.clientWidth, 260);
      const H = container.clientHeight || 200;
      const m = { t: 10, r: 14, b: 26, l: 40 };
      const iw = W - m.l - m.r, ih = H - m.t - m.b;
      const x = (i) => m.l + (i / (data.length - 1)) * iw;
      const y = (v) => m.t + ih - (Math.min(v, yMax) / yMax) * ih;

      const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H });
      const defs = el('defs', {}, svg);

      // grid + y axis
      const grid = el('g', { class: 'grid' }, svg);
      const axis = el('g', { class: 'axis' }, svg);
      yTicks.forEach((t) => {
        el('line', { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t) }, grid);
        const tx = el('text', { x: m.l - 10, y: y(t) + 4, 'text-anchor': 'end' }, axis);
        tx.textContent = t === 0 ? '0k' : fmt(t);
      });
      // vertical grid + x labels (about 5 labels max, always include ends)
      const n = data.length;
      const want = W < 420 ? 3 : 5;
      const idx = new Set([0, n - 1]);
      for (let k = 1; k < want - 1; k++) idx.add(Math.round((k * (n - 1)) / (want - 1)));
      [...idx].sort((a, b) => a - b).forEach((i) => {
        el('line', { x1: x(i), x2: x(i), y1: m.t, y2: m.t + ih }, grid);
        const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
        const tx = el('text', { x: x(i), y: H - 6, 'text-anchor': anchor }, axis);
        tx.textContent = data[i].label;
      });

      // series
      series.slice().reverse().forEach((s) => {
        const pts = data.map((d, i) => [x(i), y(d[s.key])]);
        const line = smoothPath(pts);
        if (s.fill) {
          const id = 'ag' + ++uid;
          const g = el('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
          el('stop', { offset: 0, 'stop-color': s.color, 'stop-opacity': s.fillOpacity || 0.22 }, g);
          el('stop', { offset: 1, 'stop-color': s.color, 'stop-opacity': 0 }, g);
          el('path', { d: `${line} L${x(n - 1)},${m.t + ih} L${x(0)},${m.t + ih} Z`, fill: `url(#${id})` }, svg);
        }
        el('path', { d: line, fill: 'none', stroke: s.color, 'stroke-width': s.width || 2.2, 'stroke-linecap': 'round' }, svg);
      });

      // hover elements
      const hoverLine = el('line', { class: 'hover-line', y1: m.t, y2: m.t + ih, opacity: 0 }, svg);
      const dot = el('circle', { r: 6, fill: series[0].color, stroke: '#fff', 'stroke-width': 3, opacity: 0 }, svg);
      container.appendChild(svg);

      const tip = document.createElement('div');
      tip.className = 'chart-tip';
      tip.hidden = true;
      container.appendChild(tip);

      function show(i, detail) {
        const d = data[i], px = x(i), py = y(d[series[0].key]);
        hoverLine.setAttribute('x1', px); hoverLine.setAttribute('x2', px);
        hoverLine.setAttribute('opacity', detail ? 1 : 0);
        dot.setAttribute('cx', px); dot.setAttribute('cy', py); dot.setAttribute('opacity', 1);
        tip.innerHTML = `${fmt(d[series[0].key])}<div class="tip-detail">${d.label}<br>` +
          series.map((s) => `<b style="background:${s.color}"></b>${s.name}: ${fmt(d[s.key])}`).join('<br>') + '</div>';
        tip.classList.toggle('is-detail', !!detail);
        tip.hidden = false;
        // keep tooltip within the card
        const half = tip.offsetWidth / 2;
        tip.style.left = Math.min(Math.max(px, half), W - half) + 'px';
        tip.style.top = py + 'px';
      }
      function reset() {
        if (highlight != null && data[highlight]) show(highlight, false);
        else { tip.hidden = true; dot.setAttribute('opacity', 0); hoverLine.setAttribute('opacity', 0); }
      }
      function nearest(clientX) {
        const r = svg.getBoundingClientRect();
        const rel = ((clientX - r.left) / r.width) * W;
        return Math.max(0, Math.min(n - 1, Math.round(((rel - m.l) / iw) * (n - 1))));
      }
      svg.addEventListener('pointermove', (e) => show(nearest(e.clientX), true));
      svg.addEventListener('pointerleave', reset);
      svg.addEventListener('pointerdown', (e) => show(nearest(e.clientX), true));
      reset();
    }

    render();
    let raf;
    const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); });
    ro.observe(container);
    return { destroy: () => ro.disconnect(), rerender: render };
  }

  global.Charts = { sparkline, areaChart };
})(window);
