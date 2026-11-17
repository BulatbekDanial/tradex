/* TradeX chart engine — canvas, no third-party code.
   Chart types, intervals, 25 indicators, 9 drawing tools, pan/zoom, crosshair, keyboard. */
(function () {
  'use strict';

  // ---------- aggregation ----------
  function aggregate(src, dates, lastDay, interval) {
    // src: {o,h,l,c,v} daily arrays; returns bars [{s,e,t,o,h,l,c,v}]
    const out = []; let cur = null; let key = null;
    for (let i = 0; i <= lastDay; i++) {
      const d = dates[i];
      let k;
      if (interval === 'D1') k = i;
      else if (interval === 'W1') { const dt = new Date(d + 'T00:00:00Z'); const day = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - day); k = dt.toISOString().slice(0, 10); }
      else k = d.slice(0, 7);
      if (k !== key) { if (cur) out.push(cur); key = k; cur = { s: i, e: i, t: d, o: src.o[i], h: src.h[i], l: src.l[i], c: src.c[i], v: src.v[i] }; }
      else { cur.e = i; cur.h = Math.max(cur.h, src.h[i]); cur.l = Math.min(cur.l, src.l[i]); cur.c = src.c[i]; cur.v += src.v[i]; }
    }
    if (cur) out.push(cur);
    return out;
  }
  function heikin(bars) {
    const out = []; let po = null, pc = null;
    bars.forEach((b, i) => {
      const c = (b.o + b.h + b.l + b.c) / 4; const o = i === 0 ? (b.o + b.c) / 2 : (po + pc) / 2;
      out.push(Object.assign({}, b, { o, c, h: Math.max(b.h, o, c), l: Math.min(b.l, o, c) })); po = o; pc = c;
    });
    return out;
  }

  // ---------- indicator math ----------
  const NaNs = n => new Array(n).fill(NaN);
  function sma(a, n) { const o = NaNs(a.length); let s = 0, cnt = 0; for (let i = 0; i < a.length; i++) { const x = a[i]; if (isNaN(x)) { s = 0; cnt = 0; continue; } s += x; cnt++; if (cnt > n) { s -= a[i - n]; cnt = n; } if (cnt === n) o[i] = s / n; } return o; }
  function ema(a, n) { const o = NaNs(a.length); const k = 2 / (n + 1); let prev = NaN, seed = 0, cnt = 0; for (let i = 0; i < a.length; i++) { const x = a[i]; if (isNaN(x)) continue; if (isNaN(prev)) { seed += x; cnt++; if (cnt === n) { prev = seed / n; o[i] = prev; } } else { prev = x * k + prev * (1 - k); o[i] = prev; } } return o; }
  function smma(a, n) { const o = NaNs(a.length); let prev = NaN, seed = 0, cnt = 0; for (let i = 0; i < a.length; i++) { const x = a[i]; if (isNaN(x)) continue; if (isNaN(prev)) { seed += x; cnt++; if (cnt === n) { prev = seed / n; o[i] = prev; } } else { prev = (prev * (n - 1) + x) / n; o[i] = prev; } } return o; }
  function stdev(a, n) { const m = sma(a, n); const o = NaNs(a.length); for (let i = n - 1; i < a.length; i++) { if (isNaN(m[i])) continue; let s = 0; for (let j = i - n + 1; j <= i; j++) s += (a[j] - m[i]) ** 2; o[i] = Math.sqrt(s / n); } return o; }
  function hh(a, n, i) { let m = -Infinity; for (let j = Math.max(0, i - n + 1); j <= i; j++) m = Math.max(m, a[j]); return m; }
  function ll(a, n, i) { let m = Infinity; for (let j = Math.max(0, i - n + 1); j <= i; j++) m = Math.min(m, a[j]); return m; }
  function trueRange(H, L, C) { return H.map((h, i) => i === 0 ? h - L[i] : Math.max(h - L[i], Math.abs(h - C[i - 1]), Math.abs(L[i] - C[i - 1]))); }
  function shift(a, k) { const o = NaNs(a.length); for (let i = 0; i < a.length; i++) { const j = i - k; if (j >= 0 && j < a.length) o[i] = a[j]; } return o; }

  const C1 = '#E8B04B', C2 = '#7FA8E8', C3 = '#C58AE6', C4 = '#5FB37E', C5 = '#E2665C';
  const IND = [
    { key: 'ac', name: 'Accelerator Oscillator', pane: true, params: [], calc(b) { const mp = b.H.map((h, i) => (h + b.L[i]) / 2); const ao = sma(mp, 5).map((x, i) => x - sma(mp, 34)[i]); const ac = ao.map((x, i) => x - sma(ao, 5)[i]); return { hist: ac, histColor: (v, i) => i && v > ac[i - 1] ? C4 : C5 }; } },
    { key: 'adx', name: 'ADX', pane: true, params: [['n', 'Period', 14]], calc(b, p) { const n = p.n; const tr = trueRange(b.H, b.L, b.C); const pdm = b.H.map((h, i) => { if (!i) return 0; const up = h - b.H[i - 1], dn = b.L[i - 1] - b.L[i]; return up > dn && up > 0 ? up : 0; }); const mdm = b.H.map((h, i) => { if (!i) return 0; const up = h - b.H[i - 1], dn = b.L[i - 1] - b.L[i]; return dn > up && dn > 0 ? dn : 0; }); const atr = smma(tr, n), pd = smma(pdm, n), md = smma(mdm, n); const pdi = pd.map((x, i) => 100 * x / atr[i]), mdi = md.map((x, i) => 100 * x / atr[i]); const dx = pdi.map((x, i) => 100 * Math.abs(x - mdi[i]) / ((x + mdi[i]) || 1)); return { lines: [{ name: 'ADX', v: smma(dx, n), c: C1 }, { name: '+DI', v: pdi, c: C4 }, { name: '−DI', v: mdi, c: C5 }], levels: [25] }; } },
    { key: 'alligator', name: 'Alligator', pane: false, params: [], calc(b) { const mp = b.H.map((h, i) => (h + b.L[i]) / 2); return { lines: [{ name: 'Jaw', v: shift(smma(mp, 13), 8), c: C2 }, { name: 'Teeth', v: shift(smma(mp, 8), 5), c: C5 }, { name: 'Lips', v: shift(smma(mp, 5), 3), c: C4 }] }; } },
    { key: 'aroon', name: 'Aroon', pane: true, params: [['n', 'Period', 14]], calc(b, p) { const n = p.n; const up = NaNs(b.C.length), dn = NaNs(b.C.length); for (let i = n; i < b.C.length; i++) { let hi = i, lo = i; for (let j = i - n; j <= i; j++) { if (b.H[j] >= b.H[hi]) hi = j; if (b.L[j] <= b.L[lo]) lo = j; } up[i] = 100 * (n - (i - hi)) / n; dn[i] = 100 * (n - (i - lo)) / n; } return { lines: [{ name: 'Up', v: up, c: C4 }, { name: 'Down', v: dn, c: C5 }], range: [0, 100] }; } },
    { key: 'atr', name: 'Average True Range', pane: true, params: [['n', 'Period', 14]], calc(b, p) { return { lines: [{ name: 'ATR', v: smma(trueRange(b.H, b.L, b.C), p.n), c: C1 }] }; } },
    { key: 'ao', name: 'Awesome Oscillator', pane: true, params: [], calc(b) { const mp = b.H.map((h, i) => (h + b.L[i]) / 2); const s5 = sma(mp, 5), s34 = sma(mp, 34); const ao = s5.map((x, i) => x - s34[i]); return { hist: ao, histColor: (v, i) => i && v > ao[i - 1] ? C4 : C5 }; } },
    { key: 'bears', name: 'Bears Power', pane: true, params: [['n', 'Period', 13]], calc(b, p) { const e = ema(b.C, p.n); return { hist: b.L.map((l, i) => l - e[i]), histColor: v => v >= 0 ? C4 : C5 }; } },
    { key: 'bb', name: 'Bollinger Bands', pane: false, params: [['n', 'Period', 20], ['k', 'Deviation', 2]], calc(b, p) { const m = sma(b.C, p.n), s = stdev(b.C, p.n); return { lines: [{ name: 'Upper', v: m.map((x, i) => x + p.k * s[i]), c: C2 }, { name: 'Middle', v: m, c: C1 }, { name: 'Lower', v: m.map((x, i) => x - p.k * s[i]), c: C2 }], fill: [0, 2] }; } },
    { key: 'bbw', name: 'Bollinger Bands Width', pane: true, params: [['n', 'Period', 20], ['k', 'Deviation', 2]], calc(b, p) { const m = sma(b.C, p.n), s = stdev(b.C, p.n); return { lines: [{ name: 'BBW', v: m.map((x, i) => 2 * p.k * s[i] / x * 100), c: C2 }] }; } },
    { key: 'bulls', name: 'Bulls Power', pane: true, params: [['n', 'Period', 13]], calc(b, p) { const e = ema(b.C, p.n); return { hist: b.H.map((h, i) => h - e[i]), histColor: v => v >= 0 ? C4 : C5 }; } },
    { key: 'cci', name: 'CCI', pane: true, params: [['n', 'Period', 20]], calc(b, p) { const tp = b.H.map((h, i) => (h + b.L[i] + b.C[i]) / 3); const m = sma(tp, p.n); const o = NaNs(tp.length); for (let i = p.n - 1; i < tp.length; i++) { let md = 0; for (let j = i - p.n + 1; j <= i; j++) md += Math.abs(tp[j] - m[i]); md /= p.n; o[i] = (tp[i] - m[i]) / (0.015 * (md || 1)); } return { lines: [{ name: 'CCI', v: o, c: C1 }], levels: [100, -100] }; } },
    { key: 'donchian', name: 'Donchian Channel', pane: false, params: [['n', 'Period', 20]], calc(b, p) { const up = b.H.map((x, i) => i >= p.n - 1 ? hh(b.H, p.n, i) : NaN), dn = b.L.map((x, i) => i >= p.n - 1 ? ll(b.L, p.n, i) : NaN); return { lines: [{ name: 'Upper', v: up, c: C3 }, { name: 'Middle', v: up.map((x, i) => (x + dn[i]) / 2), c: C1 }, { name: 'Lower', v: dn, c: C3 }], fill: [0, 2] }; } },
    { key: 'demarker', name: 'DeMarker', pane: true, params: [['n', 'Period', 14]], calc(b, p) { const dmax = b.H.map((h, i) => i && h > b.H[i - 1] ? h - b.H[i - 1] : 0), dmin = b.L.map((l, i) => i && l < b.L[i - 1] ? b.L[i - 1] - l : 0); const a = sma(dmax, p.n), c = sma(dmin, p.n); return { lines: [{ name: 'DeM', v: a.map((x, i) => x / ((x + c[i]) || 1)), c: C1 }], levels: [0.3, 0.7], range: [0, 1] }; } },
    { key: 'env', name: 'Envelopes', pane: false, params: [['n', 'Period', 20], ['pct', 'Offset, %', 2.5]], calc(b, p) { const m = sma(b.C, p.n); return { lines: [{ name: 'Upper', v: m.map(x => x * (1 + p.pct / 100)), c: C2 }, { name: 'Lower', v: m.map(x => x * (1 - p.pct / 100)), c: C2 }] }; } },
    { key: 'ema', name: 'EMA', pane: false, params: [['n', 'Period', 21]], calc(b, p) { return { lines: [{ name: 'EMA ' + p.n, v: ema(b.C, p.n), c: C2 }] }; } },
    { key: 'fractal', name: 'Fractal', pane: false, params: [], calc(b) { const m = []; for (let i = 2; i < b.C.length - 2; i++) { if (b.H[i] > b.H[i - 1] && b.H[i] > b.H[i - 2] && b.H[i] > b.H[i + 1] && b.H[i] > b.H[i + 2]) m.push({ i, p: b.H[i], up: true }); if (b.L[i] < b.L[i - 1] && b.L[i] < b.L[i - 2] && b.L[i] < b.L[i + 1] && b.L[i] < b.L[i + 2]) m.push({ i, p: b.L[i], up: false }); } return { points: m }; } },
    { key: 'fcb', name: 'Fractal Chaos Bands', pane: false, params: [], calc(b) { const up = NaNs(b.C.length), dn = NaNs(b.C.length); let u = NaN, d = NaN; for (let i = 0; i < b.C.length; i++) { const k = i - 2; if (k >= 2) { if (b.H[k] > b.H[k - 1] && b.H[k] > b.H[k - 2] && b.H[k] > b.H[k + 1] && b.H[k] > b.H[k + 2]) u = b.H[k]; if (b.L[k] < b.L[k - 1] && b.L[k] < b.L[k - 2] && b.L[k] < b.L[k + 1] && b.L[k] < b.L[k + 2]) d = b.L[k]; } up[i] = u; dn[i] = d; } return { lines: [{ name: 'Upper', v: up, c: C4 }, { name: 'Lower', v: dn, c: C5 }] }; } },
    { key: 'ichimoku', name: 'Ichimoku Kinko Hyo', pane: false, params: [], calc(b) { const mid = n => b.H.map((x, i) => i >= n - 1 ? (hh(b.H, n, i) + ll(b.L, n, i)) / 2 : NaN); const t = mid(9), k = mid(26), s52 = mid(52); return { lines: [{ name: 'Tenkan', v: t, c: C5 }, { name: 'Kijun', v: k, c: C2 }, { name: 'Senkou A', v: shift(t.map((x, i) => (x + k[i]) / 2), 26), c: C4 }, { name: 'Senkou B', v: shift(s52, 26), c: C3 }, { name: 'Chikou', v: shift(b.C, -26), c: '#9C988C' }], fill: [2, 3] }; } },
    { key: 'keltner', name: 'Keltner Channel', pane: false, params: [['n', 'Period', 20], ['m', 'ATR multiplier', 2]], calc(b, p) { const e = ema(b.C, p.n), a = smma(trueRange(b.H, b.L, b.C), p.n); return { lines: [{ name: 'Upper', v: e.map((x, i) => x + p.m * a[i]), c: C3 }, { name: 'EMA', v: e, c: C1 }, { name: 'Lower', v: e.map((x, i) => x - p.m * a[i]), c: C3 }], fill: [0, 2] }; } },
    { key: 'macd', name: 'MACD', pane: true, params: [['f', 'Fast', 12], ['s', 'Slow', 26], ['sig', 'Signal', 9]], calc(b, p) { const m = ema(b.C, p.f).map((x, i) => x - ema(b.C, p.s)[i]); const sg = ema(m, p.sig); return { lines: [{ name: 'MACD', v: m, c: C2 }, { name: 'Signal', v: sg, c: C1 }], hist: m.map((x, i) => x - sg[i]), histColor: v => v >= 0 ? C4 : C5, levels: [0] }; } },
    { key: 'mom', name: 'Momentum', pane: true, params: [['n', 'Period', 10]], calc(b, p) { return { lines: [{ name: 'Mom', v: b.C.map((c, i) => i >= p.n ? c / b.C[i - p.n] * 100 : NaN), c: C1 }], levels: [100] }; } },
    { key: 'psar', name: 'Parabolic SAR', pane: false, params: [['st', 'Step', 0.02], ['mx', 'Maximum', 0.2]], calc(b, p) { const pts = []; if (b.C.length < 3) return { points: [] }; let up = true, af = p.st, ep = b.H[0], sar = b.L[0]; for (let i = 1; i < b.C.length; i++) { sar = sar + af * (ep - sar); if (up) { sar = Math.min(sar, b.L[i - 1], i > 1 ? b.L[i - 2] : b.L[i - 1]); if (b.L[i] < sar) { up = false; sar = ep; ep = b.L[i]; af = p.st; } else if (b.H[i] > ep) { ep = b.H[i]; af = Math.min(p.mx, af + p.st); } } else { sar = Math.max(sar, b.H[i - 1], i > 1 ? b.H[i - 2] : b.H[i - 1]); if (b.H[i] > sar) { up = true; sar = ep; ep = b.H[i]; af = p.st; } else if (b.L[i] < ep) { ep = b.L[i]; af = Math.min(p.mx, af + p.st); } } pts.push({ i, p: sar, up, dot: true }); } return { points: pts }; } },
    { key: 'rsi', name: 'RSI', pane: true, params: [['n', 'Period', 14]], calc(b, p) { const g = b.C.map((c, i) => i ? Math.max(0, c - b.C[i - 1]) : 0), l = b.C.map((c, i) => i ? Math.max(0, b.C[i - 1] - c) : 0); const ag = smma(g, p.n), al = smma(l, p.n); return { lines: [{ name: 'RSI', v: ag.map((x, i) => 100 - 100 / (1 + x / (al[i] || 1e-9))), c: C3 }], levels: [30, 70], range: [0, 100] }; } },
    { key: 'sma', name: 'SMA', pane: false, params: [['n', 'Period', 50]], calc(b, p) { return { lines: [{ name: 'SMA ' + p.n, v: sma(b.C, p.n), c: C1 }] }; } },
    { key: 'stoch', name: 'Stochastic Oscillator', pane: true, params: [['n', '%K', 14], ['d', '%D', 3]], calc(b, p) { const k = b.C.map((c, i) => i >= p.n - 1 ? 100 * (c - ll(b.L, p.n, i)) / ((hh(b.H, p.n, i) - ll(b.L, p.n, i)) || 1) : NaN); return { lines: [{ name: '%K', v: k, c: C2 }, { name: '%D', v: sma(k, p.d), c: C1 }], levels: [20, 80], range: [0, 100] }; } },
    { key: 'wr', name: 'Williams %R', pane: true, params: [['n', 'Period', 14]], calc(b, p) { return { lines: [{ name: '%R', v: b.C.map((c, i) => i >= p.n - 1 ? -100 * (hh(b.H, p.n, i) - c) / ((hh(b.H, p.n, i) - ll(b.L, p.n, i)) || 1) : NaN), c: C2 }], levels: [-20, -80], range: [-100, 0] }; } }
  ];
  const INDBY = {}; IND.forEach(x => { INDBY[x.key] = x; });

  const TOOLS = [
    { key: 'hline', name: 'Horizontal line', pts: 1, icon: 'M2 8h12', dash: true },
    { key: 'vline', name: 'Vertical line', pts: 1, icon: 'M8 2v12', dash: true },
    { key: 'ray', name: 'Ray', pts: 2, icon: 'M3 13L13 3' },
    { key: 'fibret', name: 'Fibonacci Retracement', pts: 2, icon: 'M2 3h12M2 6h12M2 9h12M2 13h12' },
    { key: 'fibfan', name: 'Fibonacci Fan', pts: 2, icon: 'M3 13L13 3M3 13L13 7M3 13L13 11' },
    { key: 'trend', name: 'Trend Line', pts: 2, icon: 'M3 13L13 3' },
    { key: 'channel', name: 'Parallel channel', pts: 3, icon: 'M2 11L10 3M6 13L14 5' },
    { key: 'rect', name: 'Rectangle', pts: 2, icon: 'M3 4h10v8H3z' },
    { key: 'pitchfork', name: "Andrew's Pitchfork", pts: 3, icon: 'M2 13L14 3M5 14L14 7M2 10L11 2' }
  ];
  const FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

  const PAL = {
    classic: { up: '#5FB37E', down: '#E2665C', name: 'Green / red' },
    cb: { up: '#5B9BE8', down: '#E8A13A', name: 'Blue / orange (color-blind friendly)' },
    mono: { up: '#D9D5C9', down: '#6E6A60', name: 'Monochrome' },
    amber: { up: '#E8B04B', down: '#9C6BD6', name: 'Amber / purple' }
  };

  // ---------- engine ----------
  function create(container, opts) {
    const st = {
      opts, bars: [], view: opts.view || null, hover: null, drag: null, sel: null, pending: null,
      drawings: opts.drawings || [], tool: null, dpr: window.devicePixelRatio || 1, ind: [], destroyed: false
    };
    const cv = document.createElement('canvas');
    cv.tabIndex = 0; cv.setAttribute('role', 'img'); cv.className = 'chart-canvas';
    cv.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;outline-offset:-2px';
    container.appendChild(cv);
    const AX_R = 66, AX_B = 22, PANE_H = 92;

    function setData() {
      const o = st.opts; let bars = aggregate(o.src, o.dates, o.lastDay, o.interval);
      if (o.type === 'ha') bars = heikin(bars);
      st.bars = bars;
      const B = { O: bars.map(b => b.o), H: bars.map(b => b.h), L: bars.map(b => b.l), C: bars.map(b => b.c) };
      st.ind = (o.indicators || []).map(cfg => { const d = INDBY[cfg.key]; if (!d) return null; const p = {}; d.params.forEach(([k, , def]) => { p[k] = cfg.params && cfg.params[k] != null ? +cfg.params[k] : def; }); try { return { cfg, d, r: d.calc(B, p) }; } catch (e) { return null; } }).filter(Boolean);
      const n = bars.length;
      if (!st.view || o.autoscroll) st.view = { right: n - 1 + 3, bw: st.view ? st.view.bw : Math.max(3, Math.min(14, 900 / Math.min(n, 120))) };
      if (st.view.right > n + 40) st.view.right = n + 3;
    }

    function layout() {
      const r = cv.getBoundingClientRect(); const W = r.width, H = r.height;
      const panes = st.ind.filter(x => x.d.pane);
      const ph = Math.min(PANE_H, Math.max(56, (H - AX_B) * 0.22));
      const mainH = Math.max(120, H - AX_B - panes.length * ph);
      return { W, H, pw: W - AX_R, mainTop: 6, mainH: mainH - 6, ph, panes };
    }

    // day index <-> bar index
    function dayToBar(d) {
      const b = st.bars; if (!b.length) return 0; let lo = 0, hi = b.length - 1;
      if (d <= b[0].s) return d - b[0].s;
      if (d >= b[hi].s) { const len = Math.max(1, b[hi].e - b[hi].s + 1); return hi + (d - b[hi].s) / len; }
      while (lo < hi - 1) { const m = (lo + hi) >> 1; if (b[m].s <= d) lo = m; else hi = m; }
      const len = Math.max(1, b[lo].e - b[lo].s + 1); return lo + Math.min(0.999, (d - b[lo].s) / len);
    }
    function barToDay(x) {
      const b = st.bars; if (!b.length) return 0; const k = Math.floor(x); const f = x - k;
      if (k < 0) return b[0].s + x; if (k >= b.length) { const last = b[b.length - 1]; return last.s + (x - (b.length - 1)) * Math.max(1, last.e - last.s + 1); }
      return b[k].s + f * Math.max(1, b[k].e - b[k].s + 1);
    }

    let L = null, scale = null;
    function computeScale() {
      L = layout(); const v = st.view; const n = st.bars.length;
      const from = Math.max(0, Math.floor(v.right - L.pw / v.bw)), to = Math.min(n - 1, Math.ceil(v.right));
      let mn = Infinity, mx = -Infinity;
      for (let i = from; i <= to; i++) { mn = Math.min(mn, st.bars[i].l); mx = Math.max(mx, st.bars[i].h); }
      st.ind.filter(x => !x.d.pane).forEach(x => (x.r.lines || []).forEach(l => { for (let i = from; i <= to; i++) { const y = l.v[i]; if (!isNaN(y) && isFinite(y)) { mn = Math.min(mn, y); mx = Math.max(mx, y); } } }));
      if (!isFinite(mn)) { mn = 0; mx = 1; }
      const pad = (mx - mn) * 0.08 || mx * 0.02 || 1; scale = { from, to, mn: mn - pad, mx: mx + pad };
    }
    const X = i => L.pw - (st.view.right - i) * st.view.bw;
    const Xi = x => st.view.right - (L.pw - x) / st.view.bw;
    const Y = p => L.mainTop + (scale.mx - p) / (scale.mx - scale.mn) * L.mainH;
    const Yp = y => scale.mx - (y - L.mainTop) / L.mainH * (scale.mx - scale.mn);
    const XD = d => X(dayToBar(d));

    function fmtP(p) { return Math.abs(p) >= 1000 ? p.toFixed(0) : Math.abs(p) >= 10 ? p.toFixed(2) : p.toFixed(3); }

    function draw() {
      if (st.destroyed) return;
      const r = cv.getBoundingClientRect(); if (r.width < 10) return;
      cv.width = Math.round(r.width * st.dpr); cv.height = Math.round(r.height * st.dpr);
      const g = cv.getContext('2d'); g.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
      computeScale(); const o = st.opts; const th = o.theme; const col = (th.pal && th.pal[o.palette]) || PAL[o.palette] || PAL.classic;
      g.fillStyle = th.bg; g.fillRect(0, 0, L.W, L.H);
      g.font = '11px ' + th.mono; g.textBaseline = 'middle';
      // grid + price axis
      const ticks = niceTicks(scale.mn, scale.mx, Math.max(3, Math.floor(L.mainH / 60)));
      g.strokeStyle = th.grid; g.lineWidth = 1;
      ticks.forEach(t => { const y = Math.round(Y(t)) + 0.5; g.beginPath(); g.moveTo(0, y); g.lineTo(L.pw, y); g.stroke(); g.fillStyle = th.text; g.fillText(fmtP(t), L.pw + 6, y); });
      // time axis labels
      const step = Math.max(1, Math.ceil(90 / st.view.bw)); g.textAlign = 'center';
      for (let i = scale.from - (scale.from % step); i <= scale.to; i += step) { if (i < 0) continue; const x = Math.round(X(i)) + 0.5; g.strokeStyle = th.grid; g.beginPath(); g.moveTo(x, L.mainTop); g.lineTo(x, L.H - AX_B); g.stroke(); g.fillStyle = th.text; g.fillText(fmtDate(st.bars[i].t, o.interval), x, L.H - AX_B / 2); }
      g.textAlign = 'left';
      g.save(); g.beginPath(); g.rect(0, 0, L.pw, L.mainTop + L.mainH); g.clip();
      // volume
      if (o.volume !== false) {
        let vmax = 0; for (let i = scale.from; i <= scale.to; i++) vmax = Math.max(vmax, st.bars[i].v);
        const vh = L.mainH * 0.16, base = L.mainTop + L.mainH;
        for (let i = scale.from; i <= scale.to; i++) { const b = st.bars[i]; const h = b.v / (vmax || 1) * vh; g.fillStyle = (b.c >= b.o ? col.up : col.down) + '40'; const w = Math.max(1, st.view.bw * 0.7); g.fillRect(X(i) - w / 2, base - h, w, h); }
      }
      // indicator fills & overlay lines
      st.ind.filter(x => !x.d.pane).forEach(x => drawOverlay(g, x));
      // series
      drawSeries(g, col);
      // markers
      (o.markers || []).forEach(m => { const bi = Math.floor(dayToBar(m.d)); if (bi < scale.from || bi > scale.to) return; const b = st.bars[bi]; const x = X(bi); const above = m.pos !== 'below'; const y = above ? Y(b.h) - 10 : Y(b.l) + 10; g.fillStyle = m.color; g.beginPath(); if (above) { g.moveTo(x - 4, y - 5); g.lineTo(x + 4, y - 5); g.lineTo(x, y + 1); } else { g.moveTo(x - 4, y + 5); g.lineTo(x + 4, y + 5); g.lineTo(x, y - 1); } g.fill(); if (m.text && st.view.bw > 4) { g.font = '10px ' + th.mono; g.fillText(m.text, x + 6, above ? y - 6 : y + 6); g.font = '11px ' + th.mono; } });
      // drawings
      st.drawings.forEach(dw => drawShape(g, dw, dw.id === st.sel));
      if (st.pending) drawShape(g, st.pending, true, true);
      g.restore();
      // last price line
      const last = st.bars[st.bars.length - 1];
      if (last && o.lastPrice !== false) { const y = Math.round(Y(last.c)) + 0.5; const c = last.c >= last.o ? col.up : col.down; g.setLineDash([3, 3]); g.strokeStyle = c; g.beginPath(); g.moveTo(0, y); g.lineTo(L.pw, y); g.stroke(); g.setLineDash([]); tag(g, L.pw, y, fmtP(last.c), c, '#0B0B0C'); }
      // hline price tags
      st.drawings.filter(d => d.tool === 'hline').forEach(d => { const y = Y(d.pts[0].p); if (y > L.mainTop && y < L.mainTop + L.mainH) tag(g, L.pw, y, fmtP(d.pts[0].p), d.color, '#0B0B0C'); });
      // panes
      L.panes.forEach((x, k) => drawPane(g, x, L.mainTop + L.mainH + k * L.ph, L.ph));
      // separators
      g.strokeStyle = th.line; g.beginPath(); g.moveTo(L.pw + 0.5, 0); g.lineTo(L.pw + 0.5, L.H); g.moveTo(0, L.H - AX_B + 0.5); g.lineTo(L.W, L.H - AX_B + 0.5); g.stroke();
      // crosshair
      if (st.hover && !st.drag) {
        const { x, y } = st.hover; g.setLineDash([4, 4]); g.strokeStyle = th.cross; g.beginPath(); g.moveTo(Math.round(x) + 0.5, 0); g.lineTo(Math.round(x) + 0.5, L.H - AX_B); g.moveTo(0, Math.round(y) + 0.5); g.lineTo(L.pw, Math.round(y) + 0.5); g.stroke(); g.setLineDash([]);
        if (y < L.mainTop + L.mainH) tag(g, L.pw, y, fmtP(Yp(y)), th.tag, th.bg);
        const bi = Math.round(Xi(x)); if (bi >= 0 && bi < st.bars.length) { const b = st.bars[bi]; const t = fmtDate(b.t, 'D1'); g.font = '11px ' + th.mono; const w = g.measureText(t).width + 12; g.fillStyle = th.tag; g.fillRect(x - w / 2, L.H - AX_B + 2, w, AX_B - 4); g.fillStyle = th.bg; g.textAlign = 'center'; g.fillText(t, x, L.H - AX_B / 2); g.textAlign = 'left'; }
      }
      // OHLC readout
      const bi = st.hover ? Math.round(Xi(st.hover.x)) : st.bars.length - 1; const b = st.bars[Math.max(0, Math.min(st.bars.length - 1, bi))];
      if (b) { g.font = '11px ' + th.mono; g.fillStyle = th.text; const s = o.title + ' · ' + intervalName(o.interval) + '   O ' + fmtP(b.o) + '  H ' + fmtP(b.h) + '  L ' + fmtP(b.l) + '  C ' + fmtP(b.c); g.fillStyle = th.bg + 'cc'; g.fillRect(4, 4, g.measureText(s).width + 10, 18); g.fillStyle = b.c >= b.o ? col.up : col.down; g.fillText(s, 9, 13); }
      // indicator legend
      let ly = 30; st.ind.filter(x => !x.d.pane).forEach(x => { const lw = g.measureText(x.d.name).width + 80; g.fillStyle = th.bg + 'cc'; g.fillRect(4, ly - 8, lw, 15); g.fillStyle = th.text; const lbl = x.d.name + (x.d.params.length ? ' (' + x.d.params.map(p => x.cfg.params && x.cfg.params[p[0]] != null ? x.cfg.params[p[0]] : p[2]).join(', ') + ')' : ''); g.fillText(lbl, 9, ly); ly += 15; });
      if (st.tool) { g.fillStyle = th.tag; g.font = '600 11px ' + th.mono; const need = TOOLS.find(t => t.key === st.tool); const got = st.pending ? st.pending.pts.length - 1 : 0; g.fillText('✎ ' + need.name + ' — point ' + (got + 1) + ' of ' + need.pts + ' · Esc to cancel', 9, L.mainTop + L.mainH - 12); }
      updateLabel();
    }

    function tag(g, x, y, text, bg, fg) { g.font = '11px ' + st.opts.theme.mono; const w = AX_R - 4; g.fillStyle = bg; g.fillRect(x + 2, y - 9, w, 18); g.fillStyle = fg; g.fillText(text, x + 6, y); }

    function drawSeries(g, col) {
      const o = st.opts; const bw = st.view.bw; const w = Math.max(1, Math.min(18, bw * 0.68));
      if (o.type === 'line') {
        g.beginPath(); for (let i = scale.from; i <= scale.to; i++) { const x = X(i), y = Y(st.bars[i].c); i === scale.from ? g.moveTo(x, y) : g.lineTo(x, y); }
        g.strokeStyle = o.theme.accent; g.lineWidth = 1.8; g.stroke();
        g.lineTo(X(scale.to), L.mainTop + L.mainH); g.lineTo(X(scale.from), L.mainTop + L.mainH); g.closePath(); g.fillStyle = o.theme.accent + '22'; g.fill(); g.lineWidth = 1; return;
      }
      for (let i = scale.from; i <= scale.to; i++) {
        const b = st.bars[i]; const x = Math.round(X(i)) + 0.5; const up = b.c >= b.o; const c = up ? col.up : col.down;
        g.strokeStyle = c; g.fillStyle = c; g.lineWidth = 1;
        if (o.type === 'bars') { g.beginPath(); g.moveTo(x, Y(b.h)); g.lineTo(x, Y(b.l)); g.moveTo(x - w / 2, Y(b.o)); g.lineTo(x, Y(b.o)); g.moveTo(x, Y(b.c)); g.lineTo(x + w / 2, Y(b.c)); g.stroke(); continue; }
        g.beginPath(); g.moveTo(x, Y(b.h)); g.lineTo(x, Y(b.l)); g.stroke();
        const y1 = Y(Math.max(b.o, b.c)), y2 = Y(Math.min(b.o, b.c)); g.fillRect(x - w / 2, y1, w, Math.max(1, y2 - y1));
      }
    }
    function drawOverlay(g, x) {
      const r = x.r;
      if (r.fill && r.lines) { const a = r.lines[r.fill[0]].v, b = r.lines[r.fill[1]].v; g.beginPath(); let started = false; for (let i = scale.from; i <= scale.to; i++) { if (isNaN(a[i])) continue; started ? g.lineTo(X(i), Y(a[i])) : (g.moveTo(X(i), Y(a[i])), started = true); } for (let i = scale.to; i >= scale.from; i--) { if (isNaN(b[i])) continue; g.lineTo(X(i), Y(b[i])); } g.closePath(); g.fillStyle = r.lines[r.fill[0]].c + '14'; g.fill(); }
      (r.lines || []).forEach(l => line(g, l.v, l.c, Y));
      (r.points || []).forEach(p => { if (p.i < scale.from || p.i > scale.to) return; { const th = st.opts.theme, cc = (th.pal && th.pal[st.opts.palette]) || PAL[st.opts.palette] || PAL.classic; g.fillStyle = p.up ? cc.up : cc.down; } const x0 = X(p.i), y0 = Y(p.p); if (p.dot) { g.beginPath(); g.arc(x0, y0, 1.8, 0, 7); g.fill(); } else { g.beginPath(); if (p.up) { g.moveTo(x0, y0 - 9); g.lineTo(x0 - 4, y0 - 3); g.lineTo(x0 + 4, y0 - 3); } else { g.moveTo(x0, y0 + 9); g.lineTo(x0 - 4, y0 + 3); g.lineTo(x0 + 4, y0 + 3); } g.fill(); } });
    }
    function line(g, v, c, Yf) { g.beginPath(); let on = false; for (let i = scale.from; i <= scale.to; i++) { const y = v[i]; if (isNaN(y) || !isFinite(y)) { on = false; continue; } on ? g.lineTo(X(i), Yf(y)) : (g.moveTo(X(i), Yf(y)), on = true); } g.strokeStyle = c; g.lineWidth = 1.4; g.stroke(); g.lineWidth = 1; }
    function drawPane(g, x, top, h) {
      const th = st.opts.theme; const r = x.r; const inner = { t: top + 14, h: h - 20 };
      let mn = Infinity, mx = -Infinity;
      const vals = [].concat((r.lines || []).map(l => l.v), r.hist ? [r.hist] : []);
      vals.forEach(v => { for (let i = scale.from; i <= scale.to; i++) { const y = v[i]; if (!isNaN(y) && isFinite(y)) { mn = Math.min(mn, y); mx = Math.max(mx, y); } } });
      if (r.range) { mn = Math.min(mn, r.range[0]); mx = Math.max(mx, r.range[1]); }
      (r.levels || []).forEach(lv => { mn = Math.min(mn, lv); mx = Math.max(mx, lv); });
      if (!isFinite(mn)) { mn = 0; mx = 1; } if (mn === mx) { mn -= 1; mx += 1; }
      const Yf = v => inner.t + (mx - v) / (mx - mn) * inner.h;
      g.strokeStyle = th.line; g.beginPath(); g.moveTo(0, top + 0.5); g.lineTo(L.W, top + 0.5); g.stroke();
      g.save(); g.beginPath(); g.rect(0, top, L.pw, h); g.clip();
      (r.levels || []).forEach(lv => { const y = Math.round(Yf(lv)) + 0.5; g.setLineDash([3, 4]); g.strokeStyle = th.grid2; g.beginPath(); g.moveTo(0, y); g.lineTo(L.pw, y); g.stroke(); g.setLineDash([]); });
      if (r.hist) { const z = Yf(Math.max(mn, Math.min(mx, 0))); const w = Math.max(1, st.view.bw * 0.6); for (let i = scale.from; i <= scale.to; i++) { const v = r.hist[i]; if (isNaN(v)) continue; g.fillStyle = r.histColor ? r.histColor(v, i) : th.accent; const y = Yf(v); g.fillRect(X(i) - w / 2, Math.min(y, z), w, Math.max(1, Math.abs(z - y))); } }
      (r.lines || []).forEach(l => line(g, l.v, l.c, Yf));
      g.restore();
      g.fillStyle = th.text; g.font = '10.5px ' + th.mono; g.fillText(x.d.name + (x.d.params.length ? ' (' + x.d.params.map(p => x.cfg.params && x.cfg.params[p[0]] != null ? x.cfg.params[p[0]] : p[2]).join(', ') + ')' : ''), 8, top + 8);
      g.fillText(fmtP(mx), L.pw + 6, inner.t); g.fillText(fmtP(mn), L.pw + 6, inner.t + inner.h);
    }

    // ----- drawings -----
    function P(pt) { return { x: XD(pt.d), y: Y(pt.p) }; }
    function extend(a, b, toX) { const dx = b.x - a.x; if (Math.abs(dx) < 1e-6) return { x: a.x, y: b.y > a.y ? L.H : 0 }; const k = (b.y - a.y) / dx; return { x: toX, y: a.y + k * (toX - a.x) }; }
    function segs(dw) {
      // returns list of segments [[x1,y1,x2,y2]] for hit testing & drawing, plus fills/labels
      const p = dw.pts.map(P); const out = { lines: [], fills: [], labels: [] };
      const right = L.pw, left = 0;
      switch (dw.tool) {
        case 'hline': out.lines.push([left, p[0].y, right, p[0].y]); break;
        case 'vline': out.lines.push([p[0].x, 0, p[0].x, L.mainTop + L.mainH]); break;
        case 'trend': if (p[1]) out.lines.push([p[0].x, p[0].y, p[1].x, p[1].y]); break;
        case 'ray': if (p[1]) { const e = extend(p[0], p[1], p[1].x >= p[0].x ? right : left); out.lines.push([p[0].x, p[0].y, e.x, e.y]); } break;
        case 'rect': if (p[1]) { const x1 = Math.min(p[0].x, p[1].x), x2 = Math.max(p[0].x, p[1].x), y1 = Math.min(p[0].y, p[1].y), y2 = Math.max(p[0].y, p[1].y); out.lines.push([x1, y1, x2, y1], [x2, y1, x2, y2], [x2, y2, x1, y2], [x1, y2, x1, y1]); out.fills.push([[x1, y1], [x2, y1], [x2, y2], [x1, y2]]); } break;
        case 'fibret': if (p[1]) { const x1 = Math.min(p[0].x, p[1].x); FIB.forEach(f => { const pr = dw.pts[1].p + (dw.pts[0].p - dw.pts[1].p) * f; const y = Y(pr); out.lines.push([x1, y, right, y]); out.labels.push([x1 + 4, y - 7, (f * 100).toFixed(1) + '%  ' + fmtP(pr)]); }); } break;
        case 'fibfan': if (p[1]) { [0.382, 0.5, 0.618, 1].forEach(f => { const yy = p[1].y + (p[0].y - p[1].y) * (1 - f); const e = extend(p[0], { x: p[1].x, y: yy }, p[1].x >= p[0].x ? right : left); out.lines.push([p[0].x, p[0].y, e.x, e.y]); out.labels.push([p[1].x + 4, yy - 7, (f * 100).toFixed(1) + '%']); }); } break;
        case 'channel': if (p[1]) { out.lines.push([p[0].x, p[0].y, p[1].x, p[1].y]); if (p[2]) { const k = p[1].x !== p[0].x ? (p[1].y - p[0].y) / (p[1].x - p[0].x) : 0; const off = p[2].y - (p[0].y + k * (p[2].x - p[0].x)); out.lines.push([p[0].x, p[0].y + off, p[1].x, p[1].y + off]); out.fills.push([[p[0].x, p[0].y], [p[1].x, p[1].y], [p[1].x, p[1].y + off], [p[0].x, p[0].y + off]]); } } break;
        case 'pitchfork': if (p[1]) { out.lines.push([p[1].x, p[1].y, (p[2] || p[1]).x, (p[2] || p[1]).y]); if (p[2]) { const m = { x: (p[1].x + p[2].x) / 2, y: (p[1].y + p[2].y) / 2 }; const dir = m.x >= p[0].x ? right : left; const e = extend(p[0], m, dir); out.lines.push([p[0].x, p[0].y, e.x, e.y]); [p[1], p[2]].forEach(q => { const e2 = extend(q, { x: q.x + (m.x - p[0].x), y: q.y + (m.y - p[0].y) }, dir); out.lines.push([q.x, q.y, e2.x, e2.y]); }); } } break;
      }
      return { segs: out, pts: p };
    }
    function drawShape(g, dw, selected, preview) {
      const { segs: s, pts } = segs(dw); const c = dw.color || st.opts.theme.accent;
      s.fills.forEach(poly => { g.beginPath(); poly.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath(); g.fillStyle = c + '1F'; g.fill(); });
      g.strokeStyle = c; g.lineWidth = selected ? 2 : 1.4; if (dw.tool === 'hline' || dw.tool === 'vline') g.setLineDash(preview ? [4, 4] : [6, 4]);
      s.lines.forEach(l => { g.beginPath(); g.moveTo(l[0], l[1]); g.lineTo(l[2], l[3]); g.stroke(); });
      g.setLineDash([]); g.lineWidth = 1; g.fillStyle = c; g.font = '10px ' + st.opts.theme.mono;
      s.labels.forEach(l => g.fillText(l[2], l[0], l[1]));
      if (selected || preview) pts.forEach(q => { g.beginPath(); g.arc(q.x, q.y, 4.5, 0, 7); g.fillStyle = st.opts.theme.bg; g.fill(); g.strokeStyle = c; g.lineWidth = 1.6; g.stroke(); g.lineWidth = 1; });
    }
    function distSeg(px, py, l) { const [x1, y1, x2, y2] = l; const dx = x2 - x1, dy = y2 - y1; const len = dx * dx + dy * dy || 1; let t = ((px - x1) * dx + (py - y1) * dy) / len; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)); }
    function hit(x, y) {
      for (let k = st.drawings.length - 1; k >= 0; k--) {
        const dw = st.drawings[k]; const { segs: s, pts } = segs(dw);
        for (let j = 0; j < pts.length; j++) if (Math.hypot(pts[j].x - x, pts[j].y - y) < 8) return { dw, handle: j };
        if (s.lines.some(l => distSeg(x, y, l) < 6)) return { dw, handle: -1 };
        if (s.fills.some(poly => inPoly(x, y, poly))) return { dw, handle: -1 };
      }
      return null;
    }
    function inPoly(x, y, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi) c = !c; } return c; }
    const toPt = (x, y) => ({ d: barToDay(Xi(x)), p: Yp(y) });

    // ----- interaction -----
    function pos(ev) { const r = cv.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
    function inMain(q) { return q.x < L.pw && q.y < L.mainTop + L.mainH; }
    cv.addEventListener('pointerdown', ev => {
      cv.focus(); const q = pos(ev); if (!L) return; cv.setPointerCapture(ev.pointerId);
      if (st.tool && inMain(q)) {
        const need = TOOLS.find(t => t.key === st.tool).pts;
        if (!st.pending) st.pending = { id: 'd' + Date.now().toString(36), tool: st.tool, color: st.opts.drawColor || st.opts.theme.accent, pts: [toPt(q.x, q.y)] };
        st.pending.pts[st.pending.pts.length - 1] = toPt(q.x, q.y);
        if (st.pending.pts.length >= need) { st.drawings.push(st.pending); st.sel = st.pending.id; st.pending = null; st.tool = null; changed(); toolChanged(); }
        else st.pending.pts.push(toPt(q.x, q.y));
        draw(); return;
      }
      const h = inMain(q) ? hit(q.x, q.y) : null;
      if (h) { st.sel = h.dw.id; st.drag = { kind: 'shape', dw: h.dw, handle: h.handle, start: toPt(q.x, q.y), orig: h.dw.pts.map(p => Object.assign({}, p)), moved: false }; selChanged(); draw(); return; }
      if (st.sel) { st.sel = null; selChanged(); }
      if (q.x >= L.pw) { st.drag = { kind: 'zoomY' }; return; }
      st.drag = { kind: 'pan', x: q.x, right: st.view.right }; st.opts.autoscroll = false; draw();
    });
    cv.addEventListener('pointermove', ev => {
      const q = pos(ev); st.hover = q;
      if (st.drag && st.drag.kind === 'pan') { st.view.right = st.drag.right + (st.drag.x - q.x) / st.view.bw; clampView(); }
      else if (st.drag && st.drag.kind === 'shape') { const cur = toPt(q.x, q.y); const dd = cur.d - st.drag.start.d, dp = cur.p - st.drag.start.p; st.drag.moved = true; if (st.drag.handle >= 0) st.drag.dw.pts[st.drag.handle] = cur; else st.drag.dw.pts = st.drag.orig.map(p => ({ d: p.d + dd, p: p.p + dp })); }
      else if (st.pending) st.pending.pts[st.pending.pts.length - 1] = toPt(q.x, q.y);
      cv.style.cursor = st.tool ? 'crosshair' : st.drag && st.drag.kind === 'pan' ? 'grabbing' : (inMain(q) && L && hit(q.x, q.y)) ? 'move' : 'crosshair';
      draw();
    });
    cv.addEventListener('pointerup', () => { if (st.drag && st.drag.kind === 'shape' && st.drag.moved) changed(); if (st.drag && st.drag.kind === 'pan') viewChanged(); st.drag = null; draw(); });
    cv.addEventListener('pointerleave', () => { st.hover = null; draw(); });
    cv.addEventListener('wheel', ev => { ev.preventDefault(); const q = pos(ev); zoom(ev.deltaY < 0 ? 1.15 : 1 / 1.15, q.x); }, { passive: false });
    cv.addEventListener('dblclick', ev => { const q = pos(ev); const h = hit(q.x, q.y); if (h && st.opts.onEdit) st.opts.onEdit(h.dw); });
    cv.addEventListener('keydown', ev => {
      const k = ev.key; let used = true;
      if (k === 'ArrowLeft') { st.view.right -= 5; st.opts.autoscroll = false; clampView(); }
      else if (k === 'ArrowRight') { st.view.right += 5; clampView(); }
      else if (k === '+' || k === '=') zoom(1.2, L.pw / 2);
      else if (k === '-' || k === '_') zoom(1 / 1.2, L.pw / 2);
      else if (k === 'End') { st.view.right = st.bars.length + 2; }
      else if (k === 'Home') { st.view.right = Math.min(st.bars.length + 2, L.pw / st.view.bw); }
      else if ((k === 'Delete' || k === 'Backspace') && st.sel) { removeSel(); }
      else if (k === 'Escape') { if (st.pending || st.tool) { st.pending = null; st.tool = null; toolChanged(); } else if (st.sel) { st.sel = null; selChanged(); } else used = false; }
      else used = false;
      if (used) { ev.preventDefault(); viewChanged(); draw(); }
    });
    function zoom(f, ax) { const at = Xi(ax); st.view.bw = Math.max(1.2, Math.min(40, st.view.bw * f)); st.view.right = at + (L.pw - ax) / st.view.bw; clampView(); viewChanged(); draw(); }
    function clampView() { const n = st.bars.length; st.view.right = Math.max(Math.min(n - 1, 10), Math.min(n + 40, st.view.right)); }
    function changed() { if (st.opts.onDrawings) st.opts.onDrawings(st.drawings); }
    function toolChanged() { if (st.opts.onTool) st.opts.onTool(st.tool); }
    function selChanged() { if (st.opts.onSelect) st.opts.onSelect(st.drawings.find(d => d.id === st.sel) || null); }
    function viewChanged() { if (st.opts.onView) st.opts.onView(st.view); }
    function removeSel() { st.drawings = st.drawings.filter(d => d.id !== st.sel); st.sel = null; changed(); selChanged(); }
    function updateLabel() {
      const last = st.bars[st.bars.length - 1], first = st.bars[Math.max(0, scale.from)];
      if (!last || !first) return;
      cv.setAttribute('aria-label', 'Chart ' + st.opts.title + ', ' + ({ candle: 'candles', bars: 'bars', line: 'line', ha: 'Heikin Ashi' }[st.opts.type]) + ', interval ' + intervalName(st.opts.interval) + '. Visible range ' + first.t + ' — ' + st.bars[Math.min(st.bars.length - 1, scale.to)].t + ', price from ' + fmtP(first.c) + ' to ' + fmtP(last.c) + ' (' + ((last.c / first.c - 1) * 100).toFixed(1) + '%). Drawings: ' + st.drawings.length + ', indicators: ' + st.ind.length + '. Arrows scroll, plus and minus zoom.');
    }

    const ro = new ResizeObserver(() => draw()); ro.observe(container);
    setData(); draw();
    return {
      update(o) { Object.assign(st.opts, o); if (o.drawings) st.drawings = o.drawings; setData(); draw(); },
      setTool(t) { st.tool = t; st.pending = null; draw(); cv.focus(); },
      removeSelected() { if (st.sel) { removeSel(); draw(); } },
      clearDrawings() { st.drawings = []; st.sel = null; changed(); selChanged(); draw(); },
      setColor(c) { const d = st.drawings.find(x => x.id === st.sel); if (d) { d.color = c; changed(); draw(); } st.opts.drawColor = c; },
      zoomBy(f) { zoom(f, L ? L.pw / 2 : 300); },
      toEnd() { st.view.right = st.bars.length + 2; viewChanged(); draw(); },
      destroy() { st.destroyed = true; ro.disconnect(); cv.remove(); },
      get selected() { return st.drawings.find(d => d.id === st.sel) || null; },
      canvas: cv
    };
  }

  function niceTicks(mn, mx, n) { const span = mx - mn; const raw = span / n; const mag = Math.pow(10, Math.floor(Math.log10(raw))); const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= n) || 10 * mag; const out = []; for (let v = Math.ceil(mn / step) * step; v <= mx; v += step) out.push(v); return out; }
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(t, interval) { const y = t.slice(2, 4), m = +t.slice(5, 7), d = +t.slice(8, 10); return interval === 'MN' ? MON[m - 1] + " '" + y : d + ' ' + MON[m - 1] + (interval === 'W1' ? " '" + y : ''); }
  function intervalName(i) { return { D1: 'D1 (day)', W1: 'W1 (week)', MN: 'MN (month)' }[i] || i; }

  window.BRChart = { create, IND, TOOLS, PAL, INTERVALS: [['D1', 'D1'], ['W1', 'W1'], ['MN', 'MN']], intervalName };
})();
