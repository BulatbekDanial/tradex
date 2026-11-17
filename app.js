/* TradeX — UI, state, routing, theming. Vanilla JS. */
(function () {
  'use strict';
  const B = window.BR, AI = window.BOARD;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (x, d) => (x == null || isNaN(x)) ? '—' : (x * 100).toFixed(d == null ? 1 : d) + '%';
  const spct = (x, d) => (x >= 0 ? '+' : '') + pct(x, d);
  const money = x => '$' + Math.round(x).toLocaleString('en-US');
  const px = x => x >= 1000 ? x.toFixed(0) : x.toFixed(2);
  const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }), nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function lpx(t, i) { const a = B.BY[t]; const v = B.localPrice(t, i); return (a.ccy === 'EUR' ? '€' : '$') + (v >= 1000 ? nf0.format(v) : nf2.format(v)); }
  const todayStr = () => new Date().toISOString().slice(0, 10);
  function weekKey(d) { d = d || new Date(); const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return t.getUTCFullYear() + '-W' + String(Math.ceil(((t - y) / 86400000 + 1) / 7)).padStart(2, '0'); }

  // ---------- capabilities ----------
  const CAP = { sample: null, db: null, user: null, uid: null, canWrite: true };

  // ---------- state ----------
  const KEY = 'tradex.v1', OLD_KEY = 'boardroom.v1';
  function defaults() {
    return { v: 1, savedAt: 0, nick: '', onboarded: false, placement: null, xp: 0, streak: { count: 0, last: '' }, rating: 1000, defenses: 0, best: 0,
      activity: {}, cases: {}, activeCase: null, customCases: [], lessons: {}, weekXp: { key: weekKey(), xp: 0 }, joined: [], history: [], age: null, chart: chartDefaults(), avatar: 0, profile: { name: '', goal: '' } };
  }
  const CKEY = 'tradex.consent', OLD_CKEY = 'boardroom.consent';
  try { ['', 'c'].forEach(k => { const o = k ? OLD_CKEY : OLD_KEY, n = k ? CKEY : KEY; const v = localStorage.getItem(o); if (v != null) { if (localStorage.getItem(n) == null) localStorage.setItem(n, v); localStorage.removeItem(o); } }); } catch (e) { /* storage unavailable */ }
  let CONSENT = null;
  try { CONSENT = JSON.parse(localStorage.getItem(CKEY) || 'null'); } catch (e) { CONSENT = null; }
  let S = defaults();
  if (CONSENT && CONSENT.functional) { try { const raw = localStorage.getItem(KEY); if (raw) S = Object.assign(defaults(), JSON.parse(raw)); } catch (e) { /* storage unavailable */ } }
  if (!S.chart) S.chart = chartDefaults();
  if (!S.profile) S.profile = { name: '', goal: '' };
  function chartDefaults() { return { type: 'candle', interval: 'D1', autoscroll: true, lastPrice: true, volume: true, events: true, palette: 'classic', fav: ['sma', 'ema', 'bb', 'rsi', 'macd'], ind: [], color: '#E8B04B' }; }
  function ageOk() { return !!(S.age && (S.age.band === '16+' || S.age.parent)); }
  function cloudOk() { return !!(CONSENT && CONSENT.cloud && ageOk()); }
  function aiOk() { return !!(CONSENT && CONSENT.ai && ageOk()); }

  let saveTimer = null, dbSaving = false, dbDirty = false;
  function save() {
    S.savedAt = Date.now();
    if (CONSENT && CONSENT.functional) { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
    clearTimeout(saveTimer); saveTimer = setTimeout(saveRemote, 1500);
  }
  async function saveRemote() {
    if (!CAP.db || !CAP.uid || !cloudOk()) return;
    if (dbSaving) { dbDirty = true; return; }
    dbSaving = true;
    try { await CAP.db.collection('data/users/' + CAP.uid).doc('state').set({ json: JSON.stringify(S), savedAt: S.savedAt }); }
    catch (e) { if (e && e.code === 'quota_exceeded') toast('Storage is full: progress is saved only in this browser.'); }
    dbSaving = false;
    if (dbDirty) { dbDirty = false; saveRemote(); }
    pushBoard();
  }
  let boardSaving = false, boardDirty = false;
  async function pushBoard() {
    if (!CAP.db || !CAP.uid || !S.onboarded || !CAP.canWrite || !cloudOk()) return;
    if (boardSaving) { boardDirty = true; return; }
    boardSaving = true;
    const wk = weekKey();
    const body = { nick: S.nick.slice(0, 24), rating: S.rating, xp: S.xp, weekKey: wk, weekXp: S.weekXp.key === wk ? S.weekXp.xp : 0, defenses: S.defenses, best: Math.round(S.best), lessons: Object.keys(S.lessons).length, av: S.avatar | 0, tournaments: tournamentResults(), ...learnStats(), classes: (S.joined || []).map(j => j.code).slice(0, 10), updatedAt: Date.now() };
    try { await CAP.db.collection('leaderboard').doc(CAP.uid).set(body); }
    catch (e) { if (e && e.code === 'invalid_argument') CAP.canWrite = false; }
    boardSaving = false;
    if (boardDirty) { boardDirty = false; pushBoard(); }
  }
  function learnStats() {
    const fb = S.fb || [];
    return { pre: S.placement ? S.placement.total : null, post: S.postCheck ? S.postCheck.total : null,
      fbN: fb.length, fbU: fb.length ? Math.round(fb.reduce((a, f) => a + (f.u || 0), 0) / fb.filter(f => f.u).length * 10) / 10 || null : null,
      fbRec: fb.filter(f => f.rec === true).length, fbRecN: fb.filter(f => f.rec != null).length };
  }
  function tournamentResults() { const o = {}; (S.history || []).forEach(h => { if (h.tour) Object.keys(h.tour).forEach(code => { const r = h.tour[code]; if (!o[code] || r.board > o[code].board) o[code] = r; }); }); return o; }

  function addXp(n) {
    S.xp += n; const wk = weekKey();
    if (S.weekXp.key !== wk) S.weekXp = { key: wk, xp: 0 };
    S.weekXp.xp += n;
    const t = todayStr(); S.activity[t] = (S.activity[t] || 0) + 1;
    if (S.streak.last !== t) {
      const y = new Date(); y.setDate(y.getDate() - 1);
      S.streak.count = S.streak.last === y.toISOString().slice(0, 10) ? S.streak.count + 1 : 1;
      S.streak.last = t;
    }
    save(); renderBadge();
  }

  // ---------- UI helpers ----------
  let QUIET = false;
  function toast(msg) { if (QUIET) return; const box = $('#toast'); while (box.children.length >= 3) box.firstChild.remove(); const t = document.createElement('div'); t.className = 't'; t.innerHTML = msg; $('#toast').appendChild(t); setTimeout(() => t.remove(), 5200); }
  let lastFocus = null;
  function openModal(html, wide) { if (!$('#modal').classList.contains('on')) lastFocus = document.activeElement; $('#modalBox').className = 'box' + (wide === true ? ' wide' : wide ? ' ' + wide : ''); $('#modalBox').innerHTML = html; $('#modal').classList.add('on'); const f = $('#modalBox [autofocus]') || $('#modalBox button, #modalBox input'); if (f) f.focus(); }
  function closeModal() { $('#modal').classList.remove('on'); $('#modalBox').innerHTML = ''; if (lastFocus && lastFocus.isConnected) lastFocus.focus(); lastFocus = null; }

  // ---------- theme (stored as a strictly necessary preference) ----------
  const THEME_KEY = 'tradex.theme';
  const docEl = document.documentElement;
  function themePref() { try { const t = localStorage.getItem(THEME_KEY); return t === 'light' || t === 'dark' ? t : 'system'; } catch (e) { return 'system'; } }
  function isDark() { const x = docEl.getAttribute('data-tx'); if (x) return x === 'dark'; const h = docEl.getAttribute('data-theme'); if (h === 'dark' || h === 'light') return h === 'dark'; return !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches); }
  function cssv(n) { return getComputedStyle(docEl).getPropertyValue('--' + n).trim(); }
  function K() { return { accent: cssv('accent-line'), fill: cssv('accent-fill'), up: cssv('up'), down: cssv('down'), blue: cssv('blue'), muted: cssv('muted'), faint: cssv('faint'), text: cssv('text'), line: cssv('line-2'), grid: cssv('grid'), bg: cssv('panel') }; }
  function chartTheme() {
    const k = K(), dark = isDark();
    return { bg: k.bg, grid: k.grid, grid2: k.line, text: k.muted, line: cssv('line'), cross: k.faint, tag: k.accent, accent: k.accent, mono: '"Geist Mono", "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace',
      pal: { classic: { up: k.up, down: k.down }, mono: dark ? null : { up: '#8A8578', down: '#2B2925' }, amber: dark ? null : { up: '#4F46E5', down: '#B45309' }, cb: dark ? null : { up: '#2D6FC4', down: '#B86A00' } } };
  }
  const SUN = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>';
  const MOON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/></svg>';
  function paintThemeBtn() { const b = $('#themeBtn'); if (!b) return; const d = isDark(); b.innerHTML = d ? SUN : MOON; b.setAttribute('aria-label', d ? 'Switch to light theme' : 'Switch to dark theme'); b.title = d ? 'Light theme' : 'Dark theme'; }
  function setTheme(t) {
    try { if (t === 'system') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, t); } catch (e) { /* storage unavailable: applies to this tab only */ }
    if (t === 'system') docEl.removeAttribute('data-tx'); else docEl.setAttribute('data-tx', t);
    paintThemeBtn(); refreshTheme();
  }
  function refreshTheme() {
    if ($('#modal').classList.contains('on')) { if (T.eng) T.eng.update({ theme: chartTheme() }); return; }
    if (isView('terminal') && T.eng) { T.eng.update({ theme: chartTheme() }); const c = caseDef(S.activeCase), s = c && S.cases[S.activeCase]; if (s && T.step === 'build') renderRight(c, s, 'build'); return; }
    route();
  }
  if (window.matchMedia) { try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!docEl.getAttribute('data-tx')) { paintThemeBtn(); refreshTheme(); } }); } catch (e) { /* old browsers */ } }

  // ---------- avatars (generated shapes, no photo uploads) ----------
  const AVATARS = [
    ['#2D5CA3', 'i'], ['#1D7343', 'M4 17l5-5 4 3 7-8M15 7h5v5'], ['#7240A8', 'M12 3l8 9-8 9-8-9z'], ['#B2352A', 'M13 2L5 14h6l-1 8 8-12h-6z'],
    ['#0F766E', 'M5 19C5 10 10 5 19 5c0 9-5 14-14 14zM5 19l7-7'], ['#9A5B00', 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.8l-5.4 2.7 1.2-6-4.5-4.2 6.1-.7z'], ['#334155', 'M12 3l8 4.5v9L12 21l-8-4.5v-9z'], ['#BE185D', 'M3 14c3-4 6 4 9 0s6 4 9 0M3 9c3-4 6 4 9 0s6 4 9 0'],
    ['#4338CA', 'M4 18h16l1-10-5 4-4-7-4 7-5-4z'], ['#15803D', 'M12 4a8 8 0 1 0 .01 0M9 12h6M12 9v6'], ['#9A3412', 'M12 4l9 16H3z'], ['#1E40AF', 'M12 4a8 8 0 1 0 .01 0M12 8a4 4 0 1 0 .01 0']
  ];
  function avatarHtml(id, size, label, nick) {
    const a = AVATARS[(id | 0) % AVATARS.length] || AVATARS[0]; size = size || 32;
    const n = nick == null ? S.nick : nick;
    const inner = a[1] === 'i' ? esc(((n || 'T').trim()[0] || 'T').toUpperCase()) : `<svg viewBox="0 0 24 24" width="${Math.round(size * 0.56)}" height="${Math.round(size * 0.56)}" aria-hidden="true"><path d="${a[1]}" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    return `<span class="uav" style="width:${size}px;height:${size}px;background:${a[0]};font-size:${Math.round(size * 0.42)}px" ${label ? 'role="img" aria-label="' + esc(label) + '"' : 'aria-hidden="true"'}>${inner}</span>`;
  }
  function avatarPicker(sel) { return `<div class="av-grid" role="radiogroup" aria-label="Avatar">${AVATARS.map((a, i) => `<button type="button" class="av-pick" role="radio" aria-checked="${i === sel}" data-a="av-pick" data-id="${i}" aria-label="Avatar ${i + 1}">${avatarHtml(i, 48)}</button>`).join('')}</div>`; }

  // ---------- nav glider & ripple ----------
  function moveGlider() { const a = $('#tabs a.on'), g = $('#glider'); if (!g) return; if (!a) { g.style.opacity = 0; return; } g.style.opacity = 1; g.style.top = a.offsetTop + 'px'; g.style.height = a.offsetHeight + 'px'; }
  window.addEventListener('resize', moveGlider);
  document.addEventListener('pointerdown', ev => { const b = ev.target.closest('.btn, .tbtn'); if (!b || b.disabled || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return; const r = b.getBoundingClientRect(); const d = Math.max(r.width, r.height); const sp = document.createElement('span'); sp.className = 'ripple'; sp.style.cssText = `width:${d}px;height:${d}px;left:${ev.clientX - r.left - d / 2}px;top:${ev.clientY - r.top - d / 2}px`; b.appendChild(sp); setTimeout(() => sp.remove(), 600); });
  function renderBadge() {
    $('#userBadge').innerHTML = S.onboarded ? `<div class="row" style="flex-wrap:nowrap">${avatarHtml(S.avatar, 34)}<div style="min-width:0"><div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(S.nick)}</div><div class="faint" style="font-size:12px">R ${S.rating} · ${S.xp} XP · <span role="img" aria-label="day streak">🔥</span>${S.streak.count || 0}</div></div></div>` : '<div class="faint" style="font-size:12.5px">Guest · <button class="linkbtn" data-a="onboard">set up profile</button></div>';
    $('#meBtn').innerHTML = avatarHtml(S.avatar, 30) + '<span>' + (S.onboarded ? esc(S.nick) : 'Profile') + '</span>'; $('#meBtn').setAttribute('aria-label', 'Profile' + (S.onboarded ? ': ' + S.nick : ''));
    const c = S.activeCase && S.cases[S.activeCase];
    $('#simDate').textContent = c ? 'Scenario · ' + B.dates[c.day] + ' · day ' + (c.day - B.START + 1) + '/' + B.REPLAY : 'Scenario starts ' + B.dates[B.START];
    const n = bellItems().filter(x => x.unread).length; const bb = $('#bellBtn');
    if (bb) { bb.querySelectorAll('.badge').forEach(x => x.remove()); if (n) bb.insertAdjacentHTML('beforeend', `<span class="badge">${n > 9 ? '9+' : n}</span>`); bb.setAttribute('aria-label', 'Notifications' + (n ? ', ' + n + ' new' : '')); }
  }
  function cap1(x) { return x.charAt(0).toUpperCase() + x.slice(1); }
  function bellItems() {
    const c = S.activeCase && S.cases[S.activeCase]; const out = [];
    if (c) B.NEWS.filter(n => n.i >= B.START && n.i <= c.day).forEach(n => out.push({ i: n.i, ic: n.tag === 'macro' ? '◆' : '•', t: cap1(n.title.replace(/^Scenario:\s*/, '')), s: B.dates[n.i] + ' · ' + n.text, unread: n.i > (S.seenNews || 0) }));
    return out.sort((a, b) => b.i - a.i);
  }
  function renderBell(open) {
    const pop = $('#bellPop'), btn = $('#bellBtn'); if (!pop) return;
    btn.setAttribute('aria-expanded', String(!!open));
    if (!open) { pop.innerHTML = ''; return; }
    const items = bellItems();
    pop.innerHTML = `<div class="bellpop" role="dialog" aria-label="Notifications"><div class="bh">Notifications<span class="chip">${items.length} scenario events</span></div>${items.length ? items.slice(0, 8).map(x => `<div class="bi"><i aria-hidden="true">${x.ic}</i><div><div style="font-weight:600">${esc(x.t)}${x.unread ? ' <span class="chip amber">new</span>' : ''}</div><div class="faint" style="font-size:12.5px">${esc(x.s)}</div></div></div>`).join('') : '<div class="bi" style="display:block;color:var(--muted)">Market events from your active case will appear here.</div>'}</div>`;
    const c = S.activeCase && S.cases[S.activeCase]; if (c) { S.seenNews = c.day; save(); }
    const bb = $('#bellBtn'); bb.querySelectorAll('.badge').forEach(x => x.remove());
  }

  function caseDef(id) { return B.CASES.find(c => c.id === id) || S.customCases.find(c => c.id === id) || null; }
  function newCaseState(c) {
    return { id: c.id, phase: 'brief', day: B.START, cash: c.capital, holdings: {}, target: {}, watch: ['SPY', 'AGG', 'SGOV', 'GLD', 'KSPI', 'HSBK', 'KZAP', 'AAPL'], trades: [], thesis: { strategy: '', fit: '', risks: '', plan: '' },
      qa: [], askedHidden: false, values: [[B.START, c.capital]], feed: [], withdrawn: false, out: 0, results: [] };
  }
  function perfValue(s, i) { return valueAt(s, i) + (s.out || 0); }
  function valueAt(s, i) { let v = s.cash; Object.keys(s.holdings).forEach(t => { v += s.holdings[t] * B.price(t, i); }); return v; }
  function curWeights(s) {
    const V = valueAt(s, s.day); const w = {};
    Object.keys(s.holdings).forEach(t => { const x = s.holdings[t] * B.price(t, s.day) / V; if (x > 0.0001) w[t] = x; });
    if (s.cash / V > 0.0001) w.CASH = Math.max(0, s.cash / V);
    return w;
  }
  function targetWeights(s) { const w = Object.assign({}, s.target); const sum = Object.values(w).reduce((a, b) => a + b, 0); if (sum < 0.9999) w.CASH = 1 - sum; return w; }

  // ---------- Router ----------
  const VIEWS = ['overview', 'terminal', 'boardroom', 'league', 'learn', 'profile', 'about'];
  const DOCS = ['privacy', 'terms', 'refunds', 'cookies', 'licenses', 'access', 'company', 'my-data'];
  function route() {
    let v = (location.hash || '#overview').slice(1); if (VIEWS.indexOf(v) < 0 && DOCS.indexOf(v) < 0) v = 'overview';
    const isDoc = DOCS.indexOf(v) >= 0;
    VIEWS.forEach(x => { $('#v-' + x).classList.toggle('on', x === v); });
    $('#v-doc').classList.toggle('on', isDoc);
    document.querySelectorAll('#tabs a').forEach(a => { a.classList.toggle('on', a.dataset.v === v); if (a.dataset.v === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (v !== 'terminal') stopLive();
    if (T.lastView !== v) { window.scrollTo(0, 0); T.lastView = v; }
    if (T.eng && v !== 'terminal') { T.eng.destroy(); T.eng = null; }
    T.pop = null;
    if (isDoc) renderDoc(v);
    else ({ overview: renderOverview, terminal: renderTerminal, boardroom: renderBoardroom, league: renderLeague, learn: renderLearn, profile: renderProfile, about: renderAbout })[v]();
    renderBadge(); moveGlider(); renderBell(false); document.body.classList.remove('side-open');
    const VT = { overview: 'Overview', terminal: 'Terminal', boardroom: 'Boardroom', league: 'League', learn: 'Learn', profile: 'Profile', about: 'About' };
    document.title = (VT[v] || (DOC_TITLES[v] || '')) + ' · TradeX'; $('#crumb').textContent = VT[v] || DOC_TITLES[v] || 'Document';
  }
  window.addEventListener('hashchange', route);
  function go(v) { if (location.hash === '#' + v) route(); else location.hash = v; }

  // ---------- Canvas helpers ----------
  function setupCanvas(cv) { const r = cv.getBoundingClientRect(); const d = window.devicePixelRatio || 1; cv.width = Math.max(1, r.width * d); cv.height = Math.max(1, r.height * d); const g = cv.getContext('2d'); g.scale(d, d); return { g, w: r.width, h: r.height }; }
  function drawSpark(cv, vals, color) {
    if (!cv || !vals || vals.length < 2) return; cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', 'Portfolio value: from ' + money(vals[0]) + ' to ' + money(vals[vals.length - 1]) + ' (' + spct(vals[vals.length - 1] / vals[0] - 1) + ')'); const { g, w, h } = setupCanvas(cv);
    const mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals), rg = mx - mn || 1;
    const X = i => i / (vals.length - 1) * (w - 4) + 2, Y = v => h - 3 - (v - mn) / rg * (h - 6);
    g.beginPath(); vals.forEach((v, i) => i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)));
    g.strokeStyle = color || K().accent; g.lineWidth = 1.5; g.stroke();
    g.lineTo(X(vals.length - 1), h); g.lineTo(X(0), h); g.closePath(); g.fillStyle = (color || K().accent) + '22'; g.fill();
    g.beginPath(); g.arc(X(vals.length - 1), Y(vals[vals.length - 1]), 2.5, 0, 7); g.fillStyle = color || K().accent; g.fill();
  }
  function drawRadar(cv, labels, vals, color) {
    if (!cv) return; cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', 'Chart: ' + labels.map((l, i) => l + ' ' + Math.round(B.clamp(vals[i], 0, 1) * 100) + '%').join(', ')); const { g, w, h } = setupCanvas(cv); const cx = w / 2, cy = h / 2 + 4, R = Math.min(w, h) / 2 - 34; if (R <= 4) return; const n = labels.length;
    g.strokeStyle = K().line; g.lineWidth = 1;
    for (let k = 1; k <= 4; k++) { g.beginPath(); for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / n; const r = R * k / 4; i ? g.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)) : g.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); } g.stroke(); }
    g.font = '11px Inter, "Segoe UI", system-ui, sans-serif'; g.fillStyle = K().muted; g.textAlign = 'center';
    for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / n; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a)); g.stroke(); g.fillText(labels[i], cx + (R + 18) * Math.cos(a), cy + (R + 14) * Math.sin(a) + 3); }
    g.beginPath(); vals.forEach((v, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; const r = R * B.clamp(v, 0, 1); i ? g.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)) : g.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); });
    g.closePath(); g.fillStyle = (color || K().accent) + '33'; g.fill(); g.strokeStyle = color || K().accent; g.lineWidth = 2; g.stroke();
  }
  function drawLines(cv, seriesList, opts) {
    if (!cv) return; cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', 'Chart: ' + seriesList.map(s => s.name + ' from ' + s.v[0].toFixed(1) + ' to ' + s.v[s.v.length - 1].toFixed(1)).join('; ')); const { g, w, h } = setupCanvas(cv); opts = opts || {};
    const all = [].concat.apply([], seriesList.map(s => s.v)); const mn = Math.min.apply(null, all), mx = Math.max.apply(null, all), rg = mx - mn || 1;
    const n = seriesList[0].v.length; const X = i => 34 + i / (n - 1) * (w - 40), Y = v => h - 16 - (v - mn) / rg * (h - 26);
    g.strokeStyle = K().grid; g.fillStyle = K().faint; g.font = '11px Inter, "Segoe UI", system-ui, sans-serif';
    [mn, (mn + mx) / 2, mx].forEach(v => { g.beginPath(); g.moveTo(34, Y(v)); g.lineTo(w, Y(v)); g.stroke(); g.fillText(opts.fmt ? opts.fmt(v) : v.toFixed(0), 2, Y(v) + 3); });
    seriesList.forEach(s => { g.beginPath(); s.v.forEach((v, i) => i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))); g.strokeStyle = s.c; g.lineWidth = s.wd || 1.8; g.stroke(); });
    if (opts.labels) { let y = 12; seriesList.forEach(s => { g.fillStyle = s.c; g.fillText('— ' + s.name, 40, y); y += 13; }); }
  }

  // ===================================================================
  // OVERVIEW
  // ===================================================================
  function nextAction() {
    const id = S.activeCase; const s = id && S.cases[id]; const c = id && caseDef(id);
    const today = todayStr(); const lessonToday = Object.values(S.lessons).some(l => (l.at || '').slice(0, 10) === today);
    if (s && c) {
      if (!Object.keys(s.holdings).length) return { t: 'Build a portfolio for “' + c.client.name + '”', d: c.title + '. Allocate ' + money(c.capital) + ' within the case constraints.', a: 'go-terminal', b: 'Open terminal' };
      const th = s.thesis; if (!th.strategy || !th.fit || !th.risks || !th.plan) return { t: 'Finish your investment thesis', d: 'The board will ask about every part of your thesis.', a: 'go-thesis', b: 'Go to thesis' };
      if (!s.results.length) return { t: 'Defend your strategy before the board', d: '5 questions, about 10 minutes. Scored on the reasoning, not on luck.', a: 'go-board', b: 'Enter the Boardroom' };
    }
    if (!lessonToday) { const l = nextLesson(); return { t: 'Lesson of the day: ' + l.title, d: '3–5 minutes. Keep your streak and work on weak spots.', a: 'lesson', id: l.id, b: 'Start lesson' }; }
    return { t: 'Take a new case', d: 'New client, new constraints. Or generate a case with AI.', a: 'go-cases', b: 'Case library' };
  }
  function skillAverages() {
    const h = (S.history || []).slice(-5); if (!h.length) return null;
    const keys = ['clientFit', 'risk', 'analysis', 'defense', 'communication']; const out = {};
    keys.forEach(k => { out[k] = h.reduce((a, x) => a + (x.radar ? x.radar[k] : 0), 0) / h.length; });
    return out;
  }
  function impactStats() {
    if (!LG.rows || !LG.rows.length) return null; const r = LG.rows;
    const paired = r.filter(x => x.pre != null && x.post != null); const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
    const recN = r.reduce((a, x) => a + (x.fbRecN || 0), 0);
    return { users: r.length, defenses: r.reduce((a, x) => a + (x.defenses || 0), 0), lessons: r.reduce((a, x) => a + (x.lessons || 0), 0), classes: new Set(r.flatMap(x => x.classes || [])).size,
      pairs: paired.length, gain: paired.length ? avg(paired.map(x => x.post)) - avg(paired.map(x => x.pre)) : null, recPct: recN ? r.reduce((a, x) => a + (x.fbRec || 0), 0) / recN : null };
  }
  function renderImpact() {
    const el = $('#impact'); if (!el) return; const st = impactStats();
    if (!st) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="panel tight" style="margin-top:14px"><div class="panel-h" style="margin-bottom:8px"><h3>TradeX in numbers</h3><span class="right label">live data from the shared league</span></div>
      <div class="tiles" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr))">
        <div class="tile"><div class="v">${st.users}</div><div class="k">Students</div></div><div class="tile"><div class="v">${st.defenses}</div><div class="k">Board defenses</div></div>
        <div class="tile"><div class="v">${st.lessons}</div><div class="k">Lessons completed</div></div><div class="tile"><div class="v">${st.classes}</div><div class="k">Classes</div></div>
        ${st.pairs ? `<div class="tile hl"><div class="v">${st.gain >= 0 ? '+' : ''}${st.gain.toFixed(1)}</div><div class="k">Knowledge gain</div><div class="s">of 8 · ${st.pairs} students</div></div>` : ''}
        ${st.recPct != null ? `<div class="tile"><div class="v">${Math.round(st.recPct * 100)}%</div><div class="k">Would recommend</div></div>` : ''}</div></div>`;
  }
  // ---------- dashboard charts ----------
  const FONT = 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif';
  const SECTOR_COLORS = { tech: '#6366F1', fin: '#0EA5E9', health: '#14B8A6', energy: '#F97316', cons: '#EC4899', ind: '#8B5CF6', util: '#22C55E', mat: '#A16207', tel: '#06B6D4', etf: '#3B82F6', bond: '#94A3B8', gold: '#EAB308', cash: '#64748B' };
  function drawArea(cv, series, xLabels, fmt) {
    if (!cv || !series.length || series[0].v.length < 2) return; const { g, w, h } = setupCanvas(cv); const k = K();
    cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', 'Chart: ' + series.map(s => s.name + ' from ' + fmt(s.v[0]) + ' to ' + fmt(s.v[s.v.length - 1])).join('; '));
    const all = [].concat.apply([], series.map(s => s.v)); let mn = Math.min.apply(null, all), mx = Math.max.apply(null, all); const pad = (mx - mn) * 0.12 || mx * 0.02; mn -= pad; mx += pad;
    const L = 64, R = 10, Tp = 10, Bt = 26; const n = series[0].v.length; if (w < 100 || h < 60) return;
    const X = i => L + i / (n - 1) * (w - L - R), Y = v => Tp + (1 - (v - mn) / (mx - mn)) * (h - Tp - Bt);
    g.font = '11.5px ' + FONT; g.textBaseline = 'middle';
    for (let j = 0; j <= 4; j++) { const v = mn + (mx - mn) * j / 4, y = Y(v); g.strokeStyle = k.grid; g.lineWidth = 1; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(L, y); g.lineTo(w - R, y); g.stroke(); g.setLineDash([]); g.fillStyle = k.faint; g.textAlign = 'right'; g.fillText(fmt(v), L - 10, y); }
    g.textAlign = 'center'; g.textBaseline = 'alphabetic'; const step = Math.max(1, Math.ceil(n / 6));
    for (let i = 0; i < n; i += step) { g.fillStyle = k.faint; g.fillText(xLabels[i] || '', X(i), h - 6); }
    series.slice().reverse().forEach(s => {
      g.beginPath(); s.v.forEach((v, i) => i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)));
      g.strokeStyle = s.c; g.lineWidth = s.wd || 2; g.setLineDash(s.dash ? [5, 4] : []); g.stroke(); g.setLineDash([]);
      if (s.fill) { g.lineTo(X(n - 1), h - Bt); g.lineTo(X(0), h - Bt); g.closePath(); const gr = g.createLinearGradient(0, Tp, 0, h - Bt); gr.addColorStop(0, s.c + '40'); gr.addColorStop(1, s.c + '00'); g.fillStyle = gr; g.fill(); }
    });
    const last = series[0]; g.beginPath(); g.arc(X(n - 1), Y(last.v[n - 1]), 4, 0, 7); g.fillStyle = last.c; g.fill(); g.strokeStyle = k.bg; g.lineWidth = 2; g.stroke();
  }
  function drawDonut(cv, items, center) {
    if (!cv) return; const { g, w, h } = setupCanvas(cv); const k = K();
    cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', 'Allocation: ' + items.map(x => x.label + ' ' + Math.round(x.w * 100) + '%').join(', '));
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 4, r = R * 0.68; if (R <= 4) return; let a = -Math.PI / 2;
    items.forEach(x => { const b = a + x.w * Math.PI * 2; g.beginPath(); g.arc(cx, cy, R, a + 0.012, b - 0.012); g.arc(cx, cy, r, b - 0.012, a + 0.012, true); g.closePath(); g.fillStyle = x.c; g.fill(); a = b; });
    g.textAlign = 'center'; g.fillStyle = k.text; g.font = '650 20px ' + FONT; g.fillText(center[0], cx, cy + 2); g.fillStyle = k.faint; g.font = '12px ' + FONT; g.fillText(center[1], cx, cy + 20);
  }
  const IC = {
    rating: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.8l-5.4 2.7 1.2-6-4.5-4.2 6.1-.7z"/>',
    value: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
    shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'
  };
  const icon = k => `<span class="ic" aria-hidden="true"><svg viewBox="0 0 24 24">${IC[k]}</svg></span>`;
  function shortDate(d) { const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; return m[+d.slice(5, 7) - 1] + ' ' + (+d.slice(8, 10)); }

  function renderOverview() {
    if (CAP.db && cloudOk()) subscribeLeague();
    const el = $('#v-overview'); const na = nextAction();
    const cases = B.CASES.concat(S.customCases);
    const sa = skillAverages();
    const days = []; const end = new Date(); const start = new Date(); start.setDate(end.getDate() - 18 * 7 + 1); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) { const k = d.toISOString().slice(0, 10); const c = S.activity[k] || 0; days.push('<i title="' + k + ': ' + c + '" class="' + (c >= 4 ? 'l3' : c >= 2 ? 'l2' : c >= 1 ? 'l1' : '') + '"></i>'); }
    const best = S.history.length ? Math.max.apply(null, S.history.map(h => h.total)) : 0;
    const prevR = S.history.length > 1 ? S.history[S.history.length - 2].rating : 1000; const dR = S.history.length ? S.rating - prevR : 0;
    const id = S.activeCase; const c = id && caseDef(id); const s = id && S.cases[id];
    const invested = s && Object.keys(s.holdings).length;
    const PV = s ? perfValue(s, s.day) : null; const pvD = s ? PV / c.capital - 1 : 0;
    const wk = S.weekXp.key === weekKey() ? S.weekXp.xp : 0;
    const top = rowsForLeague().slice().sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 5);
    const acts = [];
    if (s) (s.trades || []).slice(-6).forEach(t => acts.push({ ic: t.t.slice(0, 4), t: (t.side === 'BUY' ? 'Bought ' : 'Sold ') + t.t, s: B.dates[t.i] + ' · ' + (B.BY[t.t] ? B.BY[t.t].n : ''), v: (t.side === 'BUY' ? '−' : '+') + money(t.amt), cls: t.side === 'BUY' ? 'down' : 'up', at: t.i }));
    S.history.slice(-3).forEach(h => { const cd = caseDef(h.caseId); acts.push({ ic: '★', t: 'Board verdict · ' + Math.round(h.total) + '/100', s: (cd ? cd.client.name : h.caseId) + ' · ' + (h.at || '').slice(0, 10), v: 'R ' + h.rating, cls: '', at: 1e9 }); });
    acts.sort((a, b) => b.at - a.at);
    el.innerHTML = `
      <div class="pagehead"><div><h1>${S.onboarded ? 'Welcome back, ' + esc(S.nick) : 'Welcome to TradeX'}</h1><p>Build a portfolio for a client, defend it before an AI board of directors, climb the league.</p></div>
        <div class="right row"><span class="chip">${B.ASSETS.length} instruments · scenario prices</span><button class="btn primary" data-a="${na.a}" data-id="${esc(na.id || '')}">${esc(na.b)}</button></div></div>
      <div class="tiles">
        <div class="tile hl">${icon('rating')}<div class="v">${S.rating}</div><div class="k">Board Rating</div><div class="s">${S.history.length ? `<span class="delta ${dR >= 0 ? 'up' : 'down'}">${dR >= 0 ? '+' : ''}${dR}</span> after your last defense` : 'starts at 1,000'}</div></div>
        <div class="tile">${icon('value')}<div class="v">${s ? money(PV) : '—'}</div><div class="k">Portfolio value</div><div class="s">${s ? `<span class="delta ${pvD >= 0 ? 'up' : 'down'}">${spct(pvD)}</span> since case start` : 'no active case'}</div></div>
        <div class="tile">${icon('shield')}<div class="v">${S.defenses}</div><div class="k">Board defenses</div><div class="s">best score ${best ? Math.round(best) : '—'}</div></div>
        <div class="tile">${icon('bolt')}<div class="v">${wk}</div><div class="k">XP this week</div><div class="s">${S.xp} total · ${S.streak.count || 0}-day streak${S.streak.last === todayStr() ? ' ✓' : ''}</div></div>
      </div>
      <div id="impact"></div>
      <div class="dash">
        <section class="panel"><div class="panel-h"><h3>Portfolio value</h3>${s ? `<span class="right seg" role="group" aria-label="Series"><button class="on" tabindex="-1">${esc(c.client.name)}</button></span><span class="sub">Scenario days ${B.dates[B.START]} to ${B.dates[s.day]} · vs benchmark</span>` : '<span class="sub">Take a case to see your portfolio here</span>'}</div>
          ${invested && s.values.length > 1 ? '<canvas id="ovArea" style="width:100%;height:260px"></canvas><div class="row" style="gap:18px;margin-top:8px;font-size:13px"><span class="row" style="gap:6px"><i style="width:14px;height:3px;border-radius:2px;background:var(--accent-line);display:inline-block"></i>Your portfolio</span><span class="row muted" style="gap:6px"><i style="width:14px;height:0;border-top:2px dashed var(--faint);display:inline-block"></i>Benchmark</span></div>' : `<div class="empty">${s ? 'Execute your first rebalance in the Terminal, then fast-forward or press Live to see the curve.' : 'No active case yet.'}<div style="margin-top:12px"><button class="btn primary" data-a="${na.a}" data-id="${esc(na.id || '')}">${esc(na.b)}</button></div></div>`}
        </section>
        <section class="panel"><div class="panel-h"><h3>Asset allocation</h3><span class="sub">${invested ? 'Current weights by sector' : 'Appears after your first trade'}</span></div>
          ${invested ? '<canvas id="ovDonut" style="width:100%;height:190px"></canvas><div class="legend" id="ovLegend"></div>' : '<div class="empty">Nothing allocated yet.</div>'}
        </section>
      </div>
      <div class="dash">
        <div class="stack">
          <div class="panel hero"><div class="label">Next step</div><h2 style="margin:6px 0 4px">${esc(na.t)}</h2><p class="muted">${esc(na.d)}</p>
            <div class="row" style="margin-top:14px"><button class="btn primary" data-a="${na.a}" data-id="${esc(na.id || '')}">${esc(na.b)}</button><a class="btn ghost" href="#about">How TradeX works</a></div></div>
          <section class="panel" id="caseLib"><div class="panel-h"><h3>Case library</h3><span class="chip">fictional clients</span>
            <span class="right row"><select id="genLevel" aria-label="Case level" style="width:auto"><option>Rookie</option><option selected>Analyst</option><option>Associate</option><option>Partner</option></select>
            <input type="text" id="genTheme" placeholder="theme (optional)" style="width:170px" aria-label="Case theme"><button class="btn" data-a="gen-case" ${CAP.sample ? '' : 'disabled title="AI required"'}>+ AI case</button></span></div>
            <div class="casecards">${cases.map(x => caseCard(x)).join('')}</div></section>
        </div>
        <div class="stack">
          <section class="panel"><div class="panel-h"><h3>Recent activity</h3><a class="right" href="#terminal" style="font-size:13px">Open terminal</a></div>
            ${acts.length ? acts.slice(0, 6).map(a => `<div class="list-row"><span class="ic" aria-hidden="true">${esc(a.ic)}</span><div><div class="t">${esc(a.t)}</div><div class="s">${esc(a.s)}</div></div><div class="v ${a.cls}">${esc(a.v)}</div></div>`).join('') : '<div class="empty">Trades and verdicts will show up here.</div>'}</section>
          <section class="panel"><div class="panel-h"><h3>Top players</h3><a class="right" href="#league" style="font-size:13px">View all</a></div>
            ${top.length ? top.map((r, i) => `<div class="list-row"><span class="ic" aria-hidden="true" style="background:none;border:0;padding:0">${avatarHtml(r.av, 36, null, r.nick)}</span><div><div class="t">${i + 1}. ${esc(r.nick || '—')}${r.me ? ' <span class="chip amber">you</span>' : ''}</div><div class="s">${r.defenses || 0} defenses · best ${r.best || '—'}</div></div><div class="v">${r.rating}</div></div>`).join('') : '<div class="empty">Complete a defense to enter the league.</div>'}</section>
          <section class="panel"><div class="panel-h"><h3>Defense skills</h3><span class="right label">${sa ? 'latest ' + Math.min(5, S.history.length) : 'no defenses yet'}</span></div>
            ${sa ? '<canvas id="ovRadar" style="width:100%;height:220px"></canvas>' : '<div class="empty">Complete your first defense to see a profile across the board’s 5 criteria.</div>'}</section>
          <section class="panel"><div class="panel-h"><h3>Activity</h3><span class="right label">last 18 weeks</span></div><div class="coverage" role="img" aria-label="Daily activity over the last 18 weeks">${days.join('')}</div>
            <div class="row faint" style="font-size:12px;margin-top:8px;gap:4px">less <i style="width:10px;height:10px;background:var(--grid);display:inline-block;border-radius:2px"></i><i style="width:10px;height:10px;background:color-mix(in srgb,var(--accent-line) 30%,var(--grid));display:inline-block;border-radius:2px"></i><i style="width:10px;height:10px;background:color-mix(in srgb,var(--accent-line) 60%,var(--grid));display:inline-block;border-radius:2px"></i><i style="width:10px;height:10px;background:var(--accent-line);display:inline-block;border-radius:2px"></i> more</div></section>
        </div>
      </div>`;
    renderImpact();
    cases.forEach(x => { const cs = S.cases[x.id]; if (cs && cs.values.length > 1) drawSpark($('#sp-' + x.id), cs.values.map(v => v[1]), perfValue(cs, cs.day) >= x.capital ? K().up : K().down); });
    if (invested && s.values.length > 1) {
      const idx = s.values.map(v => v[0]); const pv = s.values.map(v => v[1]);
      const br = B.portfolioReturns(c.benchmark, B.START + 1, s.day); let bv = c.capital; const bAt = { [B.START]: c.capital }; br.forEach((r, j) => { bv *= 1 + r; bAt[B.START + 1 + j] = bv; });
      drawArea($('#ovArea'), [{ name: 'Your portfolio', v: pv, c: K().accent, fill: true, wd: 2.2 }, { name: 'Benchmark', v: idx.map(i => bAt[i] || c.capital), c: K().faint, dash: true, wd: 1.5 }], idx.map(i => shortDate(B.dates[i])), (() => { const all = pv.concat(idx.map(i => bAt[i] || c.capital)); const dec = Math.max.apply(null, all) - Math.min.apply(null, all) < 8000 ? 1 : 0; return v => '$' + (v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : (v / 1000).toFixed(dec) + 'k'); })());
      const w = curWeights(s); const bySec = {}; Object.keys(w).forEach(t => { const sec = t === 'CASH' ? 'cash' : B.BY[t].s; bySec[sec] = (bySec[sec] || 0) + w[t]; });
      const items = Object.keys(bySec).sort((a, b) => bySec[b] - bySec[a]).map(sec => ({ label: B.SECTORS[sec], w: bySec[sec], c: SECTOR_COLORS[sec] || '#94A3B8' }));
      drawDonut($('#ovDonut'), items, [Object.keys(w).filter(t => t !== 'CASH').length + '', 'holdings']);
      $('#ovLegend').innerHTML = items.map(x => `<div><i style="background:${x.c}"></i><span>${esc(x.label)}</span><b>${Math.round(x.w * 100)}%</b></div>`).join('');
    }
    if (sa) drawRadar($('#ovRadar'), ['Client', 'Risk', 'Analysis', 'Defense', 'Communic.'], [sa.clientFit, sa.risk, sa.analysis, sa.defense, sa.communication]);
  }
  function caseCard(c) {
    const s = S.cases[c.id]; const phase = s ? ({ brief: 'Brief', build: 'Portfolio', thesis: 'Thesis', defend: 'Defense', done: 'Done' }[s.phase] || s.phase) : 'New';
    const v = s ? perfValue(s, s.day) : c.capital; const r = v / c.capital - 1;
    return `<div class="casecard"><div class="row"><div class="avatar" role="img" aria-label="Client ${esc(c.client.name)}" style="background:${c.client.color}">${esc(c.client.avatar)}</div>
      <div style="min-width:0"><div style="font-weight:600">${esc(c.title)}</div><div class="muted" style="font-size:12px">${esc(c.client.name)}${c.client.age ? ', ' + c.client.age : ''} · ${esc(c.client.role)}</div></div></div>
      <div class="row"><span class="chip amber">${esc(c.level)}</span><span class="chip">${money(c.capital)}</span><span class="chip">${c.horizonY} years</span><span class="chip">risk ${c.risk}/5</span>${c.ai ? '<span class="chip">AI</span>' : ''}</div>
      ${s ? `<div class="row" style="justify-content:space-between"><span class="label">${phase} · ${B.dates[s.day]}</span><span class="num ${r >= 0 ? 'up' : 'down'}">${spct(r)}</span></div><canvas id="sp-${esc(c.id)}" style="width:100%;height:34px"></canvas>` : `<p class="muted" style="font-size:12.5px">${esc(c.goal)}</p>`}
      <div class="row"><button class="btn ${S.activeCase === c.id ? 'primary' : ''} sm" data-a="open-case" data-id="${esc(c.id)}">${s ? 'Continue' : 'Take case'}</button>${s ? `<button class="btn ghost sm" data-a="reset-case" data-id="${esc(c.id)}">Reset</button>` : ''}</div></div>`;
  }

  // ===================================================================
  // TERMINAL
  // ===================================================================
  const T = { ticker: 'SPY', eng: null, step: null, sort: 'sector', pop: null, popTab: 0, views: {}, tool: null, indQ: '' };
  function openCase(id) {
    const c = caseDef(id); if (!c) return;
    if (!S.cases[id]) S.cases[id] = newCaseState(c);
    S.activeCase = id; save(); go('terminal');
  }
  function renderTerminal() {
    const el = $('#v-terminal'); const id = S.activeCase; const c = id && caseDef(id); const s = id && S.cases[id];
    if (T.eng) { T.eng.destroy(); T.eng = null; }
    if (!c || !s) { el.innerHTML = `<div class="empty"><h2>No active case</h2><p style="margin:8px 0 12px">Pick a client in the case library.</p><button class="btn primary" data-a="go-cases">Go to library</button></div>`; return; }
    const step = T.step || (s.phase === 'brief' ? 'brief' : s.phase === 'thesis' ? 'thesis' : 'build');
    T.step = step;
    const steps = [['brief', '1 · Brief'], ['build', '2 · Portfolio'], ['thesis', '3 · Thesis'], ['defend', '4 · Defense']];
    const order = ['brief', 'build', 'thesis', 'defend', 'done'];
    el.innerHTML = `<div class="stepper">${steps.map(([k, l]) => `<button data-a="step" data-id="${k}" class="${k === step ? 'on' : order.indexOf(s.phase) > order.indexOf(k) ? 'done' : ''}">${l}</button>`).join('')}</div>
      <div class="term"><div class="stack" id="tLeft"></div><div class="stack" id="tCenter"></div><div class="stack insp" id="tRight"></div></div>`;
    renderLeft(c, s); renderCenter(c, s); renderRight(c, s, step);
  }
  function renderLeft(c, s) {
    const w = Object.keys(s.holdings).length ? curWeights(s) : targetWeights(s);
    const m = B.metrics(w, s.day, 504, c.rf);
    const checks = B.checkConstraints(c, w, m);
    const feed = B.NEWS.filter(n => n.i <= s.day && n.i > s.day - 504).map(n => ({ i: n.i, tag: n.tag, title: n.title, text: n.text })).concat(s.feed || []).sort((a, b) => b.i - a.i).slice(0, 14);
    $('#tLeft').innerHTML = `
      <div class="panel"><div class="row"><div class="avatar" role="img" aria-label="Client ${esc(c.client.name)}" style="background:${c.client.color}">${esc(c.client.avatar)}</div><div><div style="font-weight:600">${esc(c.client.name)}${c.client.age ? ', ' + c.client.age : ''}</div><div class="muted" style="font-size:12px">${esc(c.client.role)}</div></div></div>
        <p style="margin-top:8px;font-size:13px">${esc(c.story)}</p>
        <div class="row" style="margin-top:8px"><span class="chip">${money(c.capital)}</span><span class="chip">${c.horizonY} years</span><span class="chip amber">risk ${c.risk}/5</span><span class="chip">DD ≤ ${pct(c.maxDD, 0)}</span><span class="chip">goal ${pct(c.targetReturn, 0)}</span></div>
        <p class="muted" style="margin-top:8px;font-size:12.5px"><b class="amber">Goal:</b> ${esc(c.goal)}</p></div>
      <div class="panel"><div class="panel-h"><h3>Constraints</h3><span class="right label">${Object.keys(s.holdings).length ? 'current' : 'target'} portfolio</span></div>
        <div class="checklist">${checks.filter(ch => !(ch.hiddenUntilAsked && !s.askedHidden)).map(ch => `<div class="ck"><span class="ic ${ch.ok ? 'up' : ch.hard ? 'down' : 'amber'}">${ch.ok ? '✓' : ch.hard ? '✕' : '!'}</span><span>${esc(ch.label)}</span><span class="d">${esc(ch.detail)}</span></div>`).join('')}</div></div>
      <div class="panel"><div class="panel-h"><h3>Ask the client</h3><span class="right label">${Math.max(0, 3 - s.qa.length)}/3</span></div>
        <div class="chat" id="chat">${s.qa.length ? s.qa.map(x => `<div class="bubble me">${esc(x.q)}</div><div class="bubble">${esc(x.a)}</div>`).join('') : '<p class="muted" style="font-size:12.5px">A good advisor asks first. Find out what the intake form doesn’t say: spending plans, work, values.</p>'}</div>
        <div class="row" style="margin-top:8px;flex-wrap:nowrap"><input type="text" id="askInput" aria-label="Question for the client" placeholder="Question for the client (no personal data of your own)…" ${s.qa.length >= 3 ? 'disabled' : ''}><button class="btn" data-a="ask-client" ${s.qa.length >= 3 ? 'disabled' : ''}>Ask</button></div></div>
      <div class="panel"><div class="panel-h"><h3>Event feed</h3><span class="right label">simulation</span></div>
        <div class="news">${feed.map(n => `<div class="n ${n.tag}"><div class="label">${B.dates[n.i]}${n.i >= B.START ? '' : ' · history'}</div><div style="font-size:12.5px;font-weight:600">${esc(n.title)}</div><div class="muted" style="font-size:12px">${esc(n.text)}</div></div>`).join('') || '<p class="muted">All quiet so far.</p>'}</div></div>`;
  }
  const ICON = {
    line: '<svg viewBox="0 0 40 30"><path d="M3 25l9-9 7 5 9-12 9 7"/><path d="M3 28h34" opacity=".5"/></svg>',
    candle: '<svg viewBox="0 0 40 30"><path d="M10 4v22M20 2v26M30 6v18"/><rect x="7" y="9" width="6" height="10" fill="#C9D0E0"/><rect x="17" y="6" width="6" height="14"/><rect x="27" y="10" width="6" height="9" fill="#C9D0E0"/></svg>',
    bars: '<svg viewBox="0 0 40 30"><path d="M10 4v22M6 9h4M10 20h4M20 2v26M16 18h4M20 7h4M30 6v18M26 10h4M30 20h4"/></svg>',
    ha: '<svg viewBox="0 0 40 30"><rect x="7" y="5" width="6" height="9" fill="#C9D0E0"/><rect x="17" y="10" width="6" height="9" fill="#C9D0E0"/><rect x="27" y="15" width="6" height="9" fill="#C9D0E0"/><path d="M10 3v13M20 8v13M30 13v13"/></svg>',
    ind: '<svg viewBox="0 0 16 16"><path d="M1 12l4-5 3 3 6-8"/><path d="M1 15h14" opacity=".5"/></svg>',
    draw: '<svg viewBox="0 0 16 16"><path d="M2 14L14 2M10 2h4v4"/></svg>',
    type: '<svg viewBox="0 0 16 16"><path d="M4 2v12M8 4v9M12 3v10"/><rect x="2.5" y="5" width="3" height="5"/><rect x="10.5" y="6" width="3" height="4"/></svg>'
  };
  const TYPE_NAMES = { line: 'Line', candle: 'Candles', bars: 'Bars', ha: 'Heikin Ashi' };
  const DCOLORS = ['#E8B04B', '#4C8DE0', '#2FA36B', '#E0574C', '#A66BDB', '#8A8578'];
  function renderCenter(c, s) {
    const a = B.BY[T.ticker]; const ch = S.chart;
    $('#tCenter').innerHTML = `
      <div class="panel tight"><div class="chart-tools" id="ctools">
        <label class="sr" for="tickSel" style="position:absolute;left:-9999px">Tool</label>
        <select id="tickSel" style="width:auto;font:12px var(--mono)">${B.ASSETS.map(x => `<option value="${x.t}" ${x.t === T.ticker ? 'selected' : ''}>${x.t} · ${esc(x.n)}</option>`).join('')}</select>
        <button class="tbtn" data-a="pop" data-id="type" aria-haspopup="dialog" aria-expanded="${T.pop === 'type'}">${ICON.type}${TYPE_NAMES[ch.type]} · ${ch.interval}</button>
        <button class="tbtn" data-a="pop" data-id="ind" aria-haspopup="dialog" aria-expanded="${T.pop === 'ind'}">${ICON.ind}Indicators${ch.ind.length ? ' <span class="chip amber">' + ch.ind.length + '</span>' : ''}</button>
        <button class="tbtn ${T.tool ? 'on' : ''}" id="drawBtn" data-a="pop" data-id="draw" aria-haspopup="dialog" aria-expanded="${T.pop === 'draw'}">${ICON.draw}<span id="drawLbl">${T.tool ? '✎ ' + esc(BRChart.TOOLS.find(t => t.key === T.tool).name) : 'Drawings'}</span></button>
        <span class="seg" role="group" aria-label="Zoom"><button data-a="z" data-id="out" aria-label="Zoom out">−</button><button data-a="z" data-id="in" aria-label="Zoom in">+</button><button data-a="zend" aria-label="Go to latest candle">⇥</button></span>
        <span id="selCtl"></span>
        ${liveCtl(s)}
        <span class="mono" id="pxLbl" style="margin-left:auto;font-size:13px">${pxLabel(a, s)}</span>
        <button class="btn sm" data-a="add-asset" data-id="${a.t}">+ to portfolio</button>
        <div id="popHost"></div></div>
        ${ch.ind.length ? `<div class="row" style="margin-bottom:8px">${ch.ind.map((x, i) => { const d = BRChart.IND.find(z => z.key === x.key); return `<span class="ind-chip">${esc(d.name)}${d.params.map(([k, l, def]) => `<label style="display:inline-flex;gap:3px;align-items:center" title="${esc(l)}"><span class="faint">${esc(l.slice(0, 3))}</span><input type="number" step="any" data-ip="${i}:${k}" value="${x.params && x.params[k] != null ? x.params[k] : def}" aria-label="${esc(d.name)}: ${esc(l)}"></label>`).join('')}<button class="x" data-a="rm-ind" data-id="${i}" aria-label="Remove ${esc(d.name)}">×</button></span>`; }).join('')}</div>` : ''}
        <div class="chartbox" id="chart" style="height:${420 + Math.min(3, ch.ind.filter(x => (BRChart.IND.find(z => z.key === x.key) || {}).pane).length) * 92}px"></div>
        <div class="muted" style="font:12px var(--mono);margin-top:8px"><span class="chip warn" title="Prices are generated by a scenario; these are not real quotes">scenario prices</span> ${esc(a.n)} · ${esc(a.ex)} · ${a.ccy} · ${esc(a.d)} · P/E ${a.pe == null ? '—' : a.pe} · div. ${a.div}% · ESG ${a.esg}${a.fossil ? ' · fossil fuels' : ''}</div>
        <div class="faint" style="font:11px var(--mono);margin-top:2px">wheel or +/− to zoom · drag or ← → to scroll · click a drawing to select, Delete to remove · daily scenario data, fictional calendar</div></div>
      <div class="panel tight"><div class="panel-h"><h3>Market</h3><span class="label">as of ${B.dates[s.day]}</span><span class="chip warn">scenario</span><span class="label">EUR/USD ${(1 / B.fx[s.day]).toFixed(4)}</span><span class="right seg"><button data-a="sort" data-id="sector" class="${T.sort === 'sector' ? 'on' : ''}">sector</button><button data-a="sort" data-id="y1" class="${T.sort === 'y1' ? 'on' : ''}">1Y</button><button data-a="sort" data-id="vol" class="${T.sort === 'vol' ? 'on' : ''}">vol</button></span></div>
        <div class="tbl-wrap" id="mktTbl">${marketTable(s)}</div>
        <p class="faint" style="font:12px var(--mono);margin-top:8px">Prices are in the trading currency (€ or $). 1M and 1Y returns are in U.S. dollars including the euro exchange rate, as a client with a dollar account sees them.</p></div>`;
    renderPop(); drawChart(s); refreshSelUI();
  }
  function renderPop() {
    const host = $('#popHost'); if (!host) return; const ch = S.chart;
    document.querySelectorAll('[data-a="pop"]').forEach(b => b.setAttribute('aria-expanded', String(b.dataset.id === T.pop)));
    if (!T.pop) { host.innerHTML = ''; return; }
    let h = '';
    if (T.pop === 'type') {
      h = `<div class="pop" role="dialog" aria-label="Chart type and interval" style="left:0"><div class="pop-tabs" role="tablist"><button role="tab" aria-selected="${!T.popTab}" class="${!T.popTab ? 'on' : ''}" data-a="pop-tab" data-id="0">Chart types</button><button role="tab" aria-selected="${T.popTab === 1}" class="${T.popTab === 1 ? 'on' : ''}" data-a="pop-tab" data-id="1">Interval (${ch.interval})</button></div>`;
      if (!T.popTab) {
        h += `<div class="type-grid">${['line', 'candle', 'bars', 'ha'].map(k => `<button class="${ch.type === k ? 'on' : ''}" data-a="ctype" data-id="${k}" aria-pressed="${ch.type === k}">${ICON[k]}<span>${TYPE_NAMES[k]}</span></button>`).join('')}</div>
        <div class="pop-body">${[['lastPrice', 'Show last price'], ['autoscroll', 'Enable auto-scroll'], ['volume', 'Show volume'], ['events', 'Show events and trades']].map(([k, l]) => `<label class="pop-row"><span class="sw"><input type="checkbox" data-ct="${k}" ${ch[k] !== false ? 'checked' : ''}><span class="tr"></span></span>${l}</label>`).join('')}
        <button class="linkbtn" style="text-align:left;font:13px var(--sans)" data-a="pal-open" aria-expanded="${!!T.palOpen}">Change candle colors</button>
        ${T.palOpen ? `<div class="stack" style="gap:6px" role="radiogroup" aria-label="Candle colors">${Object.keys(BRChart.PAL).map(k => { const p = BRChart.PAL[k]; return `<label class="pop-row"><input type="radio" name="pal" data-pal="${k}" ${ch.palette === k ? 'checked' : ''}><span style="display:inline-block;width:14px;height:14px;background:${p.up};border-radius:3px"></span><span style="display:inline-block;width:14px;height:14px;background:${p.down};border-radius:3px"></span>${esc(p.name)}</label>`; }).join('')}</div>` : ''}</div>`;
      } else {
        h += `<div class="int-grid">${BRChart.INTERVALS.map(([k]) => `<button class="${ch.interval === k ? 'on' : ''}" data-a="cint" data-id="${k}" aria-pressed="${ch.interval === k}">${k}</button>`).join('')}</div><div class="pop-body"><p class="muted" style="font-size:12.5px">D1 = day, W1 = week, MN = month. The simulator generates daily prices, so there are no intraday intervals.</p></div>`;
      }
      h += '</div>';
    } else if (T.pop === 'ind') {
      h = `<div class="pop" role="dialog" aria-label="Indicators" style="left:110px;width:min(380px,calc(100vw - 40px))"><div class="pop-h">Indicators<button class="x" data-a="pop-close" aria-label="Close">✕</button></div>
        <div style="padding:0 16px 6px"><input type="text" id="indQ" placeholder="Search indicators" value="${esc(T.indQ || '')}" aria-label="Search indicators"></div><div class="pop-list" id="indList">${indListHtml()}</div></div>`;
    } else if (T.pop === 'draw') {
      h = `<div class="pop" role="dialog" aria-label="Drawings" style="left:230px;width:min(360px,calc(100vw - 40px))"><div class="pop-h">Drawings<button class="x" data-a="pop-close" aria-label="Close">✕</button></div>
        <div class="pop-list">${BRChart.TOOLS.map(t => `<button class="pop-item" data-a="tool" data-id="${t.key}"><svg viewBox="0 0 16 16"><path d="${t.icon}" ${t.dash ? 'stroke-dasharray="2 2"' : ''}/></svg>${esc(t.name)}<span class="faint mono" style="margin-left:auto;font-size:11px">${t.pts} ${t.pts === 1 ? 'point' : 'points'}</span></button>`).join('')}</div>
        <div class="pop-body" style="border-top:1px solid var(--pop-line)"><div class="pop-row">Color:${DCOLORS.map(c => `<button class="swatch ${S.chart.color === c ? 'on' : ''}" style="background:${c}" data-a="dcolor" data-id="${c}" aria-label="Color ${c}"></button>`).join('')}</div>
        <button class="btn sm ghost" data-a="dclear">Delete all drawings on ${T.ticker}</button></div></div>`;
    }
    host.innerHTML = h;
    const f = host.querySelector(T.pop === 'ind' ? '#indQ' : '.pop button.on, .pop button, .pop input'); if (f && !T.noFocus) f.focus(); T.noFocus = false;
  }
  function indListHtml() {
    const q = (T.indQ || '').toLowerCase(); const fav = S.chart.fav || [];
    const list = BRChart.IND.filter(d => !q || d.name.toLowerCase().indexOf(q) >= 0).sort((a, b) => (fav.indexOf(b.key) >= 0) - (fav.indexOf(a.key) >= 0) || a.name.localeCompare(b.name));
    return list.map(d => `<div class="pop-item" style="cursor:default"><button class="star" data-a="fav" data-id="${d.key}" aria-pressed="${fav.indexOf(d.key) >= 0}" aria-label="${fav.indexOf(d.key) >= 0 ? 'Remove from favorites' : 'Add to favorites'}: ${esc(d.name)}">${fav.indexOf(d.key) >= 0 ? '★' : '☆'}</button><button class="pop-item" style="padding:0" data-a="add-ind" data-id="${d.key}">${esc(d.name)}<span class="faint mono" style="margin-left:auto;font-size:10.5px">${d.pane ? 'pane' : 'on chart'}</span></button></div>`).join('') || '<p class="muted" style="padding:8px 16px">Nothing found</p>';
  }
  function refreshSelUI() {
    const el = $('#selCtl'); if (!el) return; const d = T.eng && T.eng.selected;
    el.innerHTML = d ? `<span class="row" style="gap:6px"><span class="chip amber">${esc(BRChart.TOOLS.find(t => t.key === d.tool).name)}</span>${DCOLORS.map(c => `<button class="swatch ${d.color === c ? 'on' : ''}" style="background:${c};width:16px;height:16px" data-a="dcolor" data-id="${c}" aria-label="Drawing color ${c}"></button>`).join('')}<button class="btn sm ghost" data-a="ddel">Delete</button></span>` : '';
    const lbl = $('#drawLbl'); const btn = $('#drawBtn'); if (lbl) { lbl.textContent = T.tool ? '✎ ' + BRChart.TOOLS.find(t => t.key === T.tool).name : 'Drawings'; btn.classList.toggle('on', !!T.tool); }
  }
  function marketTable(s) {
    return `<table class="tbl"><tr><th>Ticker</th><th class="l">Company</th><th class="l">Exchange</th><th class="l">Sector</th><th>Price</th><th title="One-month change in U.S. dollars">1M, $</th><th title="One-year change in U.S. dollars">1Y, $</th><th>Vol 1Y</th><th>P/E</th><th>Div.</th><th>ESG</th><th><span class="sr">Add</span></th></tr>
        ${sortedAssets(s).map(x => { const y1 = chg(x.t, s.day, 252), m1 = chg(x.t, s.day, 21); const vol = B.metrics({ [x.t]: 1 }, s.day, 252).vol; return `<tr class="click ${x.t === T.ticker ? 'sel' : ''}" data-a="pick" data-id="${x.t}" tabindex="0" aria-label="Show chart for ${x.t}, ${esc(x.n)}"><td class="amber">${x.t}</td><td class="l">${esc(x.n)}</td><td class="l muted">${esc(x.ex)}</td><td class="l muted">${esc(B.SECTORS[x.s])}</td><td>${lpx(x.t, s.day)}</td><td class="${m1 >= 0 ? 'up' : 'down'}">${spct(m1)}</td><td class="${y1 >= 0 ? 'up' : 'down'}">${spct(y1)}</td><td>${pct(vol)}</td><td>${x.pe == null ? '—' : x.pe}</td><td>${x.div}%</td><td class="${x.esg >= 70 ? 'up' : x.esg < 45 ? 'down' : ''}">${x.esg}</td><td><button class="btn sm ghost" data-a="add-asset" data-id="${x.t}" aria-label="Add ${x.t} to portfolio">+</button></td></tr>`; }).join('')}
        </table>`;
  }
  function pxLabel(a, s) { const l1 = B.localPrice(a.t, s.day) / B.localPrice(a.t, Math.max(0, s.day - 21)) - 1; return `${a.t} · ${lpx(a.t, s.day)} <span class="${l1 >= 0 ? 'up' : 'down'}">${spct(l1)} 1M</span>`; }

  // ---------- live playback (scenario days stream onto the chart) ----------
  const LIVE = { on: false, ms: 1500, timer: null, n: 0 };
  function liveCtl(s) {
    const inv = Object.keys(s.holdings).length > 0, end = s.day >= B.N - 1;
    return `<span class="row" style="gap:6px"><button class="tbtn ${LIVE.on ? 'on' : ''}" data-a="live" ${!inv || end ? 'disabled' : ''} aria-pressed="${LIVE.on}" title="${!inv ? 'Execute a rebalance first' : end ? 'Scenario finished' : 'Play the scenario day by day'}">${LIVE.on ? '❚❚ Pause' : '▶ Live'}</button>${LIVE.on ? '<span class="live" aria-live="polite"><i></i>LIVE</span>' : ''}<span class="seg" role="group" aria-label="Speed">${[[1500, '1×'], [750, '2×'], [300, '5×']].map(([ms, l]) => `<button data-a="live-speed" data-id="${ms}" class="${LIVE.ms === ms ? 'on' : ''}" aria-pressed="${LIVE.ms === ms}">${l}</button>`).join('')}</span></span>`;
  }
  function startLive() { if (LIVE.on) return; LIVE.on = true; LIVE.n = 0; LIVE.timer = setInterval(liveTick, LIVE.ms); }
  function stopLive() { if (!LIVE.on) return; LIVE.on = false; clearInterval(LIVE.timer); LIVE.timer = null; save(); }
  function liveTick() {
    const c = caseDef(S.activeCase), s = c && S.cases[S.activeCase];
    if (!s || !isView('terminal') || s.day >= B.N - 1 || $('#modal').classList.contains('on')) { stopLive(); if (s && isView('terminal')) renderCenter(c, s); return; }
    advance(c, s, 1, true); LIVE.n++;
    if (T.eng) T.eng.update({ lastDay: s.day, markers: buildMarkers(s) });
    const pl = $('#pxLbl'); if (pl) pl.innerHTML = pxLabel(B.BY[T.ticker], s);
    if (LIVE.n % 5 === 0) { const mt = $('#mktTbl'); if (mt) mt.innerHTML = marketTable(s); renderLeft(c, s); if (T.step === 'build') renderRight(c, s, 'build'); }
    renderBadge();
  }
  function chg(t, i, n) { const j = Math.max(0, i - n); return B.price(t, i) / B.price(t, j) - 1; }
  function sortedAssets(s) {
    const a = B.ASSETS.slice(); const keys = Object.keys(B.SECTORS);
    if (T.sort === 'y1') a.sort((x, y) => chg(y.t, s.day, 252) - chg(x.t, s.day, 252));
    else if (T.sort === 'vol') a.sort((x, y) => B.metrics({ [y.t]: 1 }, s.day, 252).vol - B.metrics({ [x.t]: 1 }, s.day, 252).vol);
    else a.sort((x, y) => keys.indexOf(x.s) - keys.indexOf(y.s));
    return a;
  }
  function newsShort(t) { t = cap1(t.replace(/^Scenario:\s*/, '')); return t.length > 24 ? t.slice(0, 23) + '…' : t; }
  function buildMarkers(s) {
    const markers = []; const a = B.BY[T.ticker]; if (S.chart.events === false) return markers;
    B.NEWS.filter(n => n.i <= s.day && (n.tag === 'macro' || (n.s && n.s === a.s) || n.t === T.ticker)).forEach(n => markers.push({ d: n.i, pos: 'above', color: n.tag === 'macro' ? K().accent : K().blue, text: newsShort(n.title) }));
    markers.push({ d: B.START, pos: 'below', color: K().text, text: 'case start' });
    (s.trades || []).filter(t => t.t === T.ticker).forEach(t => markers.push({ d: t.i, pos: t.side === 'BUY' ? 'below' : 'above', color: t.side === 'BUY' ? K().up : K().down, text: t.side === 'BUY' ? 'B' : 'S' }));
    return markers;
  }
  function drawChart(s) {
    const box = $('#chart'); if (!box) return;
    if (T.eng) { T.eng.destroy(); T.eng = null; }
    const ch = S.chart; s.drawings = s.drawings || {}; if (!s.drawings[T.ticker]) s.drawings[T.ticker] = [];
    const markers = buildMarkers(s);
    const vkey = T.ticker + ':' + ch.interval;
    T.eng = BRChart.create(box, {
      src: B.series[T.ticker], dates: B.dates, lastDay: s.day, interval: ch.interval, type: ch.type, palette: ch.palette,
      indicators: ch.ind, drawings: s.drawings[T.ticker], markers, title: T.ticker, autoscroll: ch.autoscroll !== false || !T.views[vkey],
      lastPrice: ch.lastPrice !== false, volume: ch.volume !== false, drawColor: ch.color, view: T.views[vkey] ? Object.assign({}, T.views[vkey]) : null,
      theme: chartTheme(),
      onDrawings: d => { s.drawings[T.ticker] = d; save(); },
      onTool: t => { T.tool = t; refreshSelUI(); },
      onSelect: () => refreshSelUI(),
      onView: v => { T.views[vkey] = Object.assign({}, v); }
    });
  }
  function renderRight(c, s, step) {
    const r = $('#tRight');
    if (step === 'brief') {
      r.innerHTML = `<div class="panel"><div class="eyebrow">Brief</div><h2 style="margin:6px 0">${esc(c.title)}</h2>
        <p style="font-size:13px">${esc(c.story)}</p><hr class="sep">
        <div class="stack" style="gap:6px;font-size:13px"><div><span class="label">Capital</span><div class="num">${money(c.capital)}</div></div>
        <div><span class="label">Horizon</span><div>${c.horizonY} years</div></div><div><span class="label">Risk profile</span><div>${c.risk}/5 · volatility ${pct(B.RISK_BANDS[c.risk][0], 0)}–${pct(B.RISK_BANDS[c.risk][1], 0)} · drawdown up to ${pct(c.maxDD, 0)}</div></div>
        <div><span class="label">Benchmark</span><div class="mono">${Object.keys(c.benchmark).map(k => k + ' ' + pct(c.benchmark[k], 0)).join(' + ')}</div></div></div>
        <hr class="sep"><p class="muted" style="font-size:12.5px">The market opens on ${B.dates[B.START]}. You see two years of history; the future is hidden. Once the portfolio is built, you can fast-forward week by week and watch how your decisions handle events.</p>
        <button class="btn primary" style="margin-top:12px;width:100%;justify-content:center" data-a="start-build">Start: build the portfolio</button></div>`;
      return;
    }
    if (step === 'thesis') { renderThesis(c, s); return; }
    const V = valueAt(s, s.day); const PV = perfValue(s, s.day); const inv = Object.keys(s.holdings).length > 0;
    const tw = targetWeights(s); const mt = B.metrics(tw, s.day, 504, c.rf); const band = B.RISK_BANDS[c.risk];
    const cw = inv ? curWeights(s) : null;
    const tKeys = Object.keys(s.target);
    const tsum = Object.values(s.target).reduce((a, b) => a + b, 0);
    const volCls = mt.vol >= band[0] && mt.vol <= band[1] ? 'ok' : 'bad';
    const bm = B.metrics(c.benchmark, s.day, 504, c.rf);
    r.innerHTML = `
      <div class="panel"><div class="panel-h"><h3>Portfolio</h3><span class="right label">${B.dates[s.day]}</span></div>
        <div class="row" style="justify-content:space-between;align-items:baseline"><div class="num" style="font-size:24px">${money(V)}</div><div class="num ${PV >= c.capital ? 'up' : 'down'}" title="Return including client withdrawals">${spct(PV / c.capital - 1)}</div></div>${s.out ? `<div class="faint mono" style="font-size:11px">client withdrew ${money(s.out)} · return accounts for the withdrawal</div>` : ''}
        <canvas id="pfSpark" style="width:100%;height:46px;margin-top:4px"></canvas>
        <div class="row muted" style="font:11px var(--mono);justify-content:space-between"><span>cash ${money(s.cash)}</span><span>trades ${s.trades.length}</span><span>day ${s.day - B.START + 1}/${B.REPLAY}</span></div>
        <div class="row" style="margin-top:8px"><button class="btn sm" data-a="adv" data-id="5" ${!inv || s.day >= B.N - 1 ? 'disabled' : ''}>+1 week</button><button class="btn sm" data-a="adv" data-id="21" ${!inv || s.day >= B.N - 1 ? 'disabled' : ''}>+1 month</button><button class="btn sm" data-a="adv" data-id="63" ${!inv || s.day >= B.N - 1 ? 'disabled' : ''}>+3 months</button></div>
        ${!inv ? '<p class="faint" style="font-size:12px;margin-top:6px">Fast-forward unlocks after your first trade.</p>' : ''}</div>
      <div class="panel"><div class="panel-h"><h3>Target weights</h3><span class="right num ${Math.abs(tsum - 1) < 0.005 ? 'up' : tsum > 1.0001 ? 'down' : 'muted'}">${pct(tsum, 0)}</span></div>
        <div class="stack" style="gap:6px">${tKeys.length ? tKeys.map(t => `<div class="alloc-row"><span class="amber">${t}</span><input type="range" min="0" max="50" step="1" value="${Math.round(s.target[t] * 100)}" data-w="${t}" aria-label="Weight ${t}"><input type="number" min="0" max="100" step="1" value="${Math.round(s.target[t] * 100)}" data-wn="${t}" aria-label="Weight ${t}, %"><button class="x" data-a="rm-asset" data-id="${t}" aria-label="Remove ${t}">×</button></div>${cw ? `<div class="faint" style="font:10.5px var(--mono);margin:-4px 0 0 62px">now ${pct(cw[t] || 0, 1)}</div>` : ''}`).join('') : '<p class="muted" style="font-size:12.5px">Add assets with the “+” button in the market table, or quickly:</p>'}
        <div class="row">${['SPY', 'AGG', 'SGOV', 'GLD', 'ESGU'].filter(t => !(t in s.target)).map(t => `<button class="btn sm ghost" data-a="add-asset" data-id="${t}">+ ${t}</button>`).join('')}</div>
        <div class="row muted" style="font:11px var(--mono)">cash ${pct(Math.max(0, 1 - tsum), 0)} · estimated fee on execution ${money(estFee(s))} (0.1% of trade value, no other charges)</div>
        <div class="row"><button class="btn primary" data-a="exec" ${tsum > 1.0001 ? 'disabled' : ''}>Execute rebalance</button><button class="btn ghost sm" data-a="even">Equal weights</button></div></div></div>
      <div class="panel"><div class="panel-h"><h3>Risk panel</h3><span class="right label">target · 2 years of history</span></div>
        <div class="risk-tiles">
          <div class="rt ${volCls}"><div class="v">${pct(mt.vol)}</div><div class="k">Volatility · target ${pct(band[0], 0)}–${pct(band[1], 0)}</div></div>
          <div class="rt ${mt.sharpe >= bm.sharpe ? 'ok' : mt.sharpe >= bm.sharpe - 0.3 ? 'warn' : 'bad'}"><div class="v">${mt.sharpe.toFixed(2)}</div><div class="k">Sharpe · bench. ${bm.sharpe.toFixed(2)}</div></div>
          <div class="rt ${mt.mdd <= c.maxDD ? 'ok' : 'bad'}"><div class="v">${pct(mt.mdd)}</div><div class="k">Max drawdown · limit ${pct(c.maxDD, 0)}</div></div>
          <div class="rt ${mt.neff >= 5 ? 'ok' : mt.neff >= 3 ? 'warn' : 'bad'}"><div class="v">${mt.neff.toFixed(1)}</div><div class="k">N_eff · sectors ${mt.sectors}</div></div>
          <div class="rt"><div class="v">${pct(mt.annRet)}</div><div class="k">Return (hist.) · target ${pct(c.targetReturn, 0)}</div></div>
          <div class="rt"><div class="v">${mt.beta.toFixed(2)}</div><div class="k">Beta to market · ESG ${mt.esg.toFixed(0)}</div></div>
        </div>
        <div class="stack" style="gap:4px;margin-top:8px">${Object.keys(mt.sectorW).sort((a, b) => mt.sectorW[b] - mt.sectorW[a]).map(k => `<div class="row" style="flex-wrap:nowrap;font:11px var(--mono)"><span style="width:118px" class="muted">${esc(B.SECTORS[k])}</span><div class="bar" style="flex:1"><i style="width:${Math.min(100, mt.sectorW[k] * 100)}%"></i></div><span style="width:40px;text-align:right">${pct(mt.sectorW[k], 0)}</span></div>`).join('')}</div></div>
      <div class="panel"><div class="panel-h"><h3>Trades</h3><span class="right label">latest</span></div>
        ${s.trades.length ? '<div class="tbl-wrap" style="max-height:170px;overflow:auto"><table class="tbl"><tr><th>Date</th><th class="l">Ticker</th><th>Side</th><th>Amount</th></tr>' + s.trades.slice(-12).reverse().map(t => `<tr><td>${B.dates[t.i].slice(2)}</td><td class="l amber">${t.t}</td><td class="${t.side === 'BUY' ? 'up' : 'down'}">${t.side}</td><td>${money(t.amt)}</td></tr>`).join('') + '</table></div>' : '<p class="muted" style="font-size:12.5px">No trades yet.</p>'}
        <div class="row" style="margin-top:10px"><button class="btn" data-a="step" data-id="thesis" ${!inv ? 'disabled' : ''}>Next: thesis →</button></div></div>`;
    if (s.values.length > 1) drawSpark($('#pfSpark'), s.values.map(v => v[1]), PV >= c.capital ? K().up : K().down);
  }
  function renderThesis(c, s) {
    const th = s.thesis; const w = Object.keys(s.holdings).length ? curWeights(s) : targetWeights(s); const m = B.metrics(w, s.day, 504, c.rf);
    const chips = [['vol', 'Volatility ' + pct(m.vol)], ['sh', 'Sharpe ' + m.sharpe.toFixed(2)], ['mdd', 'Max drawdown ' + pct(m.mdd)], ['neff', 'N_eff ' + m.neff.toFixed(1)], ['ret', 'Return ' + pct(m.annRet)], ['liq', 'Liquid share ' + pct(m.liquid, 0)]];
    const field = (k, label, hint) => `<div><div class="row" style="justify-content:space-between"><label class="label" for="th-${k}">${label}</label><span class="faint mono" style="font-size:11px" id="wc-${k}">${(th[k] || '').trim().split(/\s+/).filter(Boolean).length} w.</span></div><textarea id="th-${k}" data-th="${k}" rows="3" placeholder="${esc(hint)}">${esc(th[k] || '')}</textarea></div>`;
    const total = ['strategy', 'fit', 'risks', 'plan'].reduce((a, k) => a + (th[k] || '').trim().split(/\s+/).filter(Boolean).length, 0);
    const ready = ['strategy', 'fit', 'risks', 'plan'].every(k => (th[k] || '').trim().length >= 15) && Object.keys(s.holdings).length > 0;
    $('#tRight').innerHTML = `<div class="panel"><div class="eyebrow">Investment thesis</div><p class="muted" style="font-size:12.5px;margin:4px 0 10px">Up to 300 words. The AI does not write anything for you here; the board will question you on exactly this text. Do not include personal data.</p>
      <div class="stack">${field('strategy', 'Strategy', 'What the portfolio is and how it is built: core, defensive part, growth bets.')}${field('fit', 'Why it fits the client', 'Goal, horizon, risk, liquidity, constraints, and what you learned from the client.')}${field('risks', 'Key risks', 'What could go wrong and which holdings are the riskiest.')}${field('plan', 'Plan for a market drop', 'What you will do if the market falls 20–25%, and what you will tell the client.')}</div>
      <div class="label" style="margin-top:10px">Insert a metric</div><div class="row" style="margin-top:4px">${chips.map(([k, l]) => `<button class="btn sm ghost" data-a="ins-metric" data-id="${esc(l)}">${esc(l)}</button>`).join('')}</div>
      <div class="row" style="margin-top:12px;justify-content:space-between"><span class="mono faint" style="font-size:11px">${total}/300 words</span><button class="btn primary" data-a="go-board" ${ready ? '' : 'disabled'}>Send to the board →</button></div>
      ${ready ? '' : '<p class="faint" style="font-size:12px;margin-top:6px">You need trades in the portfolio and at least one sentence in every field.</p>'}</div>`;
  }

  function estFee(s) { const i = s.day; const V = valueAt(s, i); let turn = 0; Array.from(new Set(Object.keys(s.target).concat(Object.keys(s.holdings)))).forEach(t => { turn += Math.abs(V * (s.target[t] || 0) - (s.holdings[t] || 0) * B.price(t, i)); }); return turn * 0.001; }
  function executeRebalance(c, s) {
    const i = s.day; const V = valueAt(s, i); const tw = s.target; const fee = 0.001;
    const tickers = Array.from(new Set(Object.keys(tw).concat(Object.keys(s.holdings))));
    const sells = [], buys = [];
    tickers.forEach(t => { const cur = (s.holdings[t] || 0) * B.price(t, i); const des = V * (tw[t] || 0); const diff = des - cur; if (Math.abs(diff) < 1) return; (diff < 0 ? sells : buys).push([t, diff]); });
    sells.forEach(([t, diff]) => { const amt = -diff; const sh = amt / B.price(t, i); s.holdings[t] = (s.holdings[t] || 0) - sh; if (s.holdings[t] < 1e-9) delete s.holdings[t]; s.cash += amt * (1 - fee); s.trades.push({ i, t, side: 'SELL', amt }); });
    const need = buys.reduce((a, b) => a + b[1] * (1 + fee), 0); const k = need > s.cash ? s.cash / need : 1;
    buys.forEach(([t, diff]) => { const amt = diff * k; const sh = amt / B.price(t, i); s.holdings[t] = (s.holdings[t] || 0) + sh; s.cash -= amt * (1 + fee); s.trades.push({ i, t, side: 'BUY', amt }); });
    if (s.cash < 0 && s.cash > -1) s.cash = 0;
    if (s.trades.length > 300) s.trades = s.trades.slice(-300);
    s.values[s.values.length - 1] = [i, perfValue(s, i)];
    if (s.phase === 'brief' || s.phase === 'build') s.phase = 'build';
    addXp(5); save(); toast('Rebalance executed at closing prices ' + B.dates[i] + '. Trades: ' + (sells.length + buys.length) + '.');
  }
  function advance(c, s, n, quiet) {
    const end = Math.min(B.N - 1, s.day + n); const news = [];
    for (let i = s.day + 1; i <= end; i++) {
      Object.keys(s.holdings).forEach(t => { const d = B.BY[t].div / 100 / 252; if (d) s.cash += s.holdings[t] * B.price(t, i) * d; });
      s.cash += Math.max(0, s.cash) * 0.02 / 252;
      if (c.constraints.liquidity && !s.withdrawn && i >= B.START + c.constraints.liquidity.months * 21) { withdraw(c, s, i, c.constraints.liquidity.amount); s.withdrawn = true; }
      if (i === B.START + 82) s.feed.push({ i, tag: 'client', title: c.client.name + ': “I see the news. Are we going to lose everything?”', text: 'The client is nervous. At the defense the board will ask what you told them.' });
      B.NEWS.forEach(nw => { if (nw.i === i) news.push(nw); });
      if ((i - B.START) % 5 === 0 || i === end) s.values.push([i, perfValue(s, i)]);
    }
    s.day = end; if (!quiet) addXp(2); else if ((end - B.START) % 21 === 0) addXp(2); save();
    news.slice(0, 2).forEach(nw => toast('<b>' + B.dates[nw.i] + '</b> ' + esc(nw.title))); if (news.length > 2) toast('And ' + (news.length - 2) + ' more events in the feed on the left.');
    if (s.day >= B.N - 1) toast('The simulated year is over. You can defend your final strategy.');
  }
  function withdraw(c, s, i, amount) {
    s.out = (s.out || 0) + amount;
    let left = amount; const take = Math.min(left, Math.max(0, s.cash)); s.cash -= take; left -= take;
    const order = ['SGOV', 'AGG'].filter(t => s.holdings[t]).concat(Object.keys(s.holdings).filter(t => t !== 'SGOV' && t !== 'AGG'));
    let forced = 0;
    order.forEach(t => { if (left <= 0) return; const val = s.holdings[t] * B.price(t, i); const sell = Math.min(val, left); s.holdings[t] -= sell / B.price(t, i); if (s.holdings[t] < 1e-9) delete s.holdings[t]; left -= sell; s.trades.push({ i, t, side: 'SELL', amt: sell }); if (B.BY[t].type === 'stock' || t === 'SPY' || t === 'IEMG' || t === 'ESGU') forced += sell; });
    const msg = c.client.name + ' withdrew ' + money(amount) + ' as planned' + (forced > 0 ? '. Risky assets had to be sold for ' + money(forced) + (B.price('SPY', i) < B.price('SPY', B.START) ? ' at lower prices.' : '.') : ' from the liquid part, without selling stocks.');
    s.feed.push({ i, tag: 'client', title: 'Withdrawal ' + money(amount), text: msg }); toast(esc(msg));
  }

  async function askClient(c, s) {
    const inp = $('#askInput'); const q = (inp.value || '').trim(); if (!q || s.qa.length >= 3) return;
    inp.value = ''; inp.disabled = true;
    const chat = $('#chat'); chat.insertAdjacentHTML('beforeend', `<div class="bubble me">${esc(q)}</div><div class="bubble typing" id="typing"></div>`); chat.scrollTop = 1e9;
    let r; try { r = await AI.clientReply(c, q, CAP.sample); } catch (e) { r = { text: 'Sorry, the connection dropped. Please ask again.' }; if (e && e.code === 'not_granted') setAI(null); }
    s.qa.push({ q, a: r.text }); if (AI.revealsHidden(c, r.text)) { s.askedHidden = true; addXp(5); }
    save(); renderLeft(c, s);
  }

  // ===================================================================
  // BOARDROOM
  // ===================================================================
  let R = null;
  function buildCtx(c, s) {
    const weights = curWeights(s); const quant = B.quantScore(c, weights, s.day, s.askedHidden);
    return { cs: c, weights, quant, thesis: s.thesis, pitch: '', stress: B.stressTest(weights), askedHidden: s.askedHidden, idx: s.day };
  }
  function renderBoardroom() {
    const el = $('#v-boardroom'); const id = S.activeCase; const c = id && caseDef(id); const s = id && S.cases[id];
    if (!c || !s) { el.innerHTML = `<div class="empty"><h2>The board has not convened</h2><p style="margin:8px 0 12px">Take a case and build a portfolio first.</p><button class="btn primary" data-a="go-cases">Go to cases</button></div>`; return; }
    if (R && R.caseId === id) { drawRoom(); return; }
    const ready = Object.keys(s.holdings).length && ['strategy', 'fit', 'risks', 'plan'].every(k => (s.thesis[k] || '').trim().length >= 15);
    const last = s.results[s.results.length - 1];
    const board = AI.boardFor(c);
    el.innerHTML = `<div class="room"><div class="panel" style="padding:0;overflow:hidden">
        <div class="stage">${board.map(p => memberHtml(p)).join('')}</div>
        <div style="padding:22px">
          <div class="eyebrow">Board meeting</div><h2 style="margin:6px 0">${esc(c.title)}</h2>
          <p class="muted" style="max-width:62ch">You are defending a portfolio as of ${B.dates[s.day]}. First a short pitch (60–90 seconds), then 5 questions from board members, each with one possible follow-up. Scoring: 40 points computed by code from portfolio metrics, 60 from the board’s rubric with quotes.</p>
          <div class="row" style="margin-top:14px">${ready ? '<button class="btn primary" data-a="board-start">Start the meeting</button>' : '<button class="btn" data-a="go-thesis">Portfolio and thesis first</button>'}
          ${last ? '<button class="btn ghost" data-a="show-verdict">Last verdict: ' + Math.round(last.total) + '</button>' : ''}</div>
          ${!CAP.sample ? '<p class="faint" style="margin-top:10px;font-size:12.5px">AI is not available in this view: questions are built from weak spots found by code, and the qualitative score is approximate.</p>' : ''}
        </div></div>
      <div class="stack">${boardSide(c, s)}</div></div>`;
  }
  function memberHtml(p, speaking, react) {
    return `<div class="member ${speaking ? 'speaking' : ''}"${speaking ? ' aria-current="true"' : ''}><div class="face" role="img" aria-label="${esc(p.name)}, ${esc(p.role)}${speaking ? ', speaking' : ''}${react ? ', reaction: ' + ({ nod: 'convinced', neutral: 'neutral', frown: 'not convinced' }[react] || '') : ''}" style="background:${p.color}">${p.mono}${react ? `<span class="react">${{ nod: '✓', neutral: '…', frown: '?' }[react] || ''}</span>` : ''}</div><div class="nm">${esc(p.name)}</div><div class="rl">${esc(p.role)}</div></div>`;
  }
  function boardSide(c, s) {
    const w = Object.keys(s.holdings).length ? curWeights(s) : targetWeights(s); const m = B.metrics(w, s.day, 504, c.rf);
    return `<div class="panel"><div class="panel-h"><h3>Cheat sheet</h3><span class="right label">read only</span></div>
      <div class="risk-tiles"><div class="rt"><div class="v">${pct(m.vol)}</div><div class="k">Volatility</div></div><div class="rt"><div class="v">${m.sharpe.toFixed(2)}</div><div class="k">Sharpe</div></div><div class="rt"><div class="v">${pct(m.mdd)}</div><div class="k">Max drawdown</div></div><div class="rt"><div class="v">${m.neff.toFixed(1)}</div><div class="k">N_eff</div></div></div>
      <div class="label" style="margin-top:10px">Holdings</div><div class="mono" style="font-size:11.5px;margin-top:4px">${Object.keys(w).sort((a, b) => w[b] - w[a]).map(t => `<div class="row" style="justify-content:space-between"><span class="amber">${t === 'CASH' ? 'CASH' : t}</span><span>${pct(w[t], 1)}</span></div>`).join('')}</div>
      <div class="label" style="margin-top:10px">Client</div><p style="font-size:12.5px">${esc(c.client.name)} · ${money(c.capital)} · ${c.horizonY} years · risk ${c.risk}/5 · DD ≤ ${pct(c.maxDD, 0)}</p>
      ${s.qa.length ? '<div class="label" style="margin-top:10px">What you learned</div>' + s.qa.map(x => `<p style="font-size:12px" class="muted">— ${esc(x.a)}</p>`).join('') : ''}</div>`;
  }
  function drawRoom() {
    const el = $('#v-boardroom'); const c = caseDef(R.caseId); const s = S.cases[R.caseId]; const board = AI.boardFor(c);
    if (R.stage === 'verdict') { renderVerdict(c, s, R.result); return; }
    const speaking = R.speaker; const remain = Math.max(0, 90 - Math.floor((Date.now() - R.timerStart) / 1000));
    el.innerHTML = `<div class="room"><div class="panel" style="padding:0;overflow:hidden">
        <div class="stage">${board.map(p => memberHtml(p, p.id === speaking, R.reactions[p.id])).join('')}</div>
        <div class="row" style="padding:8px 14px;border-bottom:1px solid var(--line);font:11px var(--mono)" ><span class="muted">${R.stage === 'pitch' ? 'Opening pitch' : 'Question ' + Math.min(R.qi + 1, R.questions.length) + ' of ' + R.questions.length}</span>
          <span style="margin-left:auto" class="muted">${R.questions.map((q, i) => i < R.qi ? '●' : i === R.qi && R.stage !== 'pitch' ? '◉' : '○').join(' ')}</span>${R.offline ? '<span class="chip">offline</span>' : '<span class="chip ok">AI</span>'}</div>
        <div class="transcript" id="trans" role="log" aria-live="polite" aria-label="Meeting progress">${R.transcript.map(msgHtml).join('')}${R.busy ? '<div class="msg"><div class="who faint">…</div><div class="body typing faint">' + esc(R.busy) + '</div></div>' : ''}</div>
        ${R.stage === 'deliberating' ? '<div class="answer"><div class="row"><span class="typing muted">The board is deliberating and checking answers against the rubric</span></div></div>' : `
        <div class="answer"><label class="label" for="ans">${R.stage === 'pitch' ? 'Your pitch: what the strategy is and why it fits this client' : 'Your answer'}</label>
          <textarea id="ans" rows="4" ${R.busy ? 'disabled' : ''} placeholder="Use the portfolio numbers and the client’s interests. No personal data.">${esc(R.draft || '')}</textarea>
          <div class="row"><span class="timer ${remain === 0 ? 'late' : ''}" id="timer">${remain === 0 ? 'time is up, you can still finish' : '⏱ ' + remain + ' s'}</span>
            <span class="row" style="margin-left:auto">${R.stage !== 'pitch' ? `<button class="btn sm ghost" data-a="attach">+ data</button><button class="btn sm ghost" data-a="clarify" ${R.clarified ? 'disabled' : ''}>Rephrase the question</button>` : ''}<button class="btn primary" data-a="answer" ${R.busy ? 'disabled' : ''}>Answer</button></span></div></div>`}
      </div><div class="stack">${boardSide(c, s)}</div></div>`;
    const tr = $('#trans'); if (tr) tr.scrollTop = 1e9;
    R.stress && document.querySelectorAll('canvas[data-stress]').forEach(cv => drawStress(cv, R.ctx.weights));
    const a = $('#ans'); if (a && !R.busy) { a.focus(); a.setSelectionRange(a.value.length, a.value.length); }
  }
  function msgHtml(m) {
    if (m.from === 'student') return `<div class="msg me"><div class="who amber">YOU</div><div class="body">${esc(m.text)}</div></div>`;
    const p = AI.PERSONAS[m.persona] || AI.PERSONAS.chair;
    return `<div class="msg"><div class="avatar" aria-hidden="true" style="width:30px;height:30px;font-size:10px;background:${p.color}">${p.mono}</div><div class="body"><div class="label" style="color:${p.color}">${esc(p.name)} · ${esc(p.role)}</div><div style="margin-top:2px">${esc(m.text)}</div>${m.attach === 'stress' ? '<canvas data-stress style="width:100%;height:150px;margin-top:8px"></canvas><div class="faint mono" style="font-size:10.5px">Historical shock ' + B.dates[300] + ' — ' + B.dates[325] + ': your portfolio vs the market</div>' : ''}</div></div>`;
  }
  function drawStress(cv, weights) {
    const pr = B.portfolioReturns(weights, 290, 340), mr = B.portfolioReturns({ SPY: 1 }, 290, 340);
    let a = 100, b = 100; const va = [100], vb = [100]; pr.forEach((r, i) => { a *= 1 + r; b *= 1 + mr[i]; va.push(a); vb.push(b); });
    drawLines(cv, [{ v: vb, c: K().muted, name: 'Market SPY', wd: 1.4 }, { v: va, c: K().accent, name: 'Your portfolio' }], { labels: true, fmt: x => x.toFixed(0) });
  }
  let timerInt = null;
  function startTimer() { clearInterval(timerInt); R.timerStart = Date.now(); timerInt = setInterval(() => { const t = $('#timer'); if (!t || !R) { clearInterval(timerInt); return; } const remain = Math.max(0, 90 - Math.floor((Date.now() - R.timerStart) / 1000)); t.textContent = remain === 0 ? 'time is up, you can still finish' : '⏱ ' + remain + ' s'; t.classList.toggle('late', remain === 0); }, 1000); }

  async function boardStart() {
    const id = S.activeCase; const c = caseDef(id); const s = S.cases[id];
    const ctx = buildCtx(c, s);
    R = { caseId: id, ctx, questions: [], qi: 0, stage: 'pitch', transcript: [], reactions: {}, speaker: 'chair', followups: 0, clarified: false, busy: '', draft: '', offline: !CAP.sample, timerStart: Date.now() };
    R.transcript.push({ from: 'board', persona: 'chair', text: 'Good afternoon. The board is ready to hear your strategy for “' + c.client.name + '”. You have a minute and a half for your opening.' });
    s.phase = 'defend'; save(); drawRoom(); startTimer();
    // plan questions in background
    R.planning = AI.planQuestions(ctx, CAP.sample).then(p => { if (R) { R.questions = p.questions; R.offline = p.offline; } }).catch(e => { if (e && e.code === 'not_granted') setAI(null); if (R) { R.offline = true; return AI.planQuestions(ctx, null).then(p => { R.questions = p.questions; }); } });
  }
  async function boardAnswer() {
    const a = $('#ans'); const text = (a.value || '').trim(); if (!text || !R) return;
    R.draft = ''; R.transcript.push({ from: 'student', text });
    if (R.stage === 'pitch') {
      R.ctx.pitch = text; R.busy = 'The board is preparing questions'; drawRoom();
      await R.planning; R.busy = ''; R.stage = 'q'; R.qi = 0; askCurrent(); return;
    }
    const item = R.questions[R.qi];
    R.busy = AI.PERSONAS[item.persona].name + ' is thinking about your answer'; drawRoom();
    let fu = { followup: null, reaction: 'neutral' };
    if (!R.inFollow && R.followups < 3) { try { fu = await AI.followUp(R.ctx, item, text, CAP.sample); } catch (e) { /* keep default */ } }
    R.reactions[item.persona] = fu.reaction; R.busy = '';
    if (fu.followup && !R.inFollow) { R.inFollow = true; R.followups++; R.transcript.push({ from: 'board', persona: item.persona, text: fu.followup }); R.speaker = item.persona; drawRoom(); startTimer(); return; }
    R.inFollow = false; R.qi++; R.clarified = false;
    if (R.qi >= R.questions.length) { finishDefense(); return; }
    askCurrent();
  }
  function askCurrent() {
    const item = R.questions[R.qi]; R.speaker = item.persona;
    R.transcript.push({ from: 'board', persona: item.persona, text: item.q, attach: item.attach === 'stress' ? 'stress' : null });
    if (item.attach === 'stress') R.stress = true;
    drawRoom(); startTimer();
  }
  async function clarify() {
    if (!R || R.clarified) return; const item = R.questions[R.qi]; R.clarified = true;
    const hints = { clientFit: 'In other words: how does this decision connect to this client’s goal, timeline and constraints?', risk: 'Simpler: what exactly could go wrong, and how hard would it hit the portfolio, in percent?', analysis: 'Simpler: which facts or numbers support this choice?', defense: 'Shorter: your main argument in one or two sentences.', communication: 'Imagine the client doesn’t know the jargon. How would you explain it to them?' };
    R.transcript.push({ from: 'board', persona: item.persona, text: hints[item.focus] || hints.defense }); drawRoom();
  }
  async function finishDefense() {
    R.stage = 'deliberating'; R.speaker = null; drawRoom(); clearInterval(timerInt);
    const c = caseDef(R.caseId); const s = S.cases[R.caseId];
    let ai;
    try { ai = await AI.scoreDefense(R.ctx, R.transcript, CAP.sample); } catch (e) { if (e && e.code === 'not_granted') setAI(null); ai = await AI.scoreDefense(R.ctx, R.transcript, null); }
    const q = R.ctx.quant; const aiPts = Object.keys(ai.criteria).reduce((a, k) => a + ai.criteria[k].points, 0);
    const total = Math.round((q.total + aiPts) * 10) / 10;
    const radar = { clientFit: (q.fit + ai.criteria.clientFit.points) / 25, risk: q.risk / 30, analysis: ai.criteria.analysis.points / 20, defense: ai.criteria.defense.points / 15, communication: ai.criteria.communication.points / 10 };
    const weakest = Object.keys(radar).sort((a, b) => radar[a] - radar[b]).slice(0, 2);
    const lessons = Array.from(new Set([].concat.apply([], weakest.map(k => B.LESSON_FOR[k])))).slice(0, 3);
    const oldR = S.rating; S.rating = B.updateRating(S.rating, total, c.level, S.defenses); S.defenses++; S.best = Math.max(S.best, total);
    const tour = {}; (S.joined || []).forEach(j => { if (j.caseId === c.id && (!j.endsAt || Date.now() < j.endsAt)) tour[j.code] = { board: Math.round(total), risk: Math.round(q.risk / 30 * 100), at: Date.now() }; });
    const result = { total, quant: { fit: q.fit, risk: q.risk, parts: q.parts, notes: q.notes, m: { vol: q.m.vol, sharpe: q.m.sharpe, mdd: q.m.mdd, neff: q.m.neff, bmSharpe: q.bm.sharpe } }, ai, radar, lessons, ratingFrom: oldR, ratingTo: S.rating, day: s.day, at: new Date().toISOString(), transcript: R.transcript.map(x => ({ from: x.from, persona: x.persona, text: x.text })), offline: R.offline || ai.offline };
    s.results.push(result); if (s.results.length > 5) s.results = s.results.slice(-5); s.phase = 'done';
    S.history.push({ caseId: c.id, total, radar, rating: S.rating, at: result.at, tour: Object.keys(tour).length ? tour : null }); if (S.history.length > 60) S.history = S.history.slice(-60);
    addXp(50 + Math.round(total / 2));
    R.stage = 'verdict'; R.result = result; drawRoom();
  }
  function fbHtml() {
    const k = S.defenses; const f = (S.fb || []).find(x => x.k === k) || {};
    return `<div class="label">How was this case?</div><p class="muted" style="font-size:13.5px;margin:4px 0 8px">How useful was it for understanding investing?</p>
      <div class="seg" role="radiogroup" aria-label="Usefulness from 1 to 5">${[1, 2, 3, 4, 5].map(n => `<button role="radio" aria-checked="${f.u === n}" class="${f.u === n ? 'on' : ''}" data-a="fb" data-id="${n}" style="padding:8px 14px">${n}</button>`).join('')}</div>
      <p class="muted" style="font-size:13.5px;margin:12px 0 8px">Would you recommend TradeX to a friend?</p>
      <div class="seg" role="radiogroup" aria-label="Recommendation"><button role="radio" aria-checked="${f.rec === true}" class="${f.rec === true ? 'on' : ''}" data-a="fb-rec" data-id="1" style="padding:8px 14px">Yes</button><button role="radio" aria-checked="${f.rec === false}" class="${f.rec === false ? 'on' : ''}" data-a="fb-rec" data-id="0" style="padding:8px 14px">No</button></div>
      ${f.u || f.rec != null ? '<p class="faint" style="font-size:12.5px;margin-top:8px">Thanks! Your answer goes anonymously into the class averages.</p>' : ''}`;
  }
  function setFb(patch) { S.fb = S.fb || []; const k = S.defenses; let f = S.fb.find(x => x.k === k); if (!f) { f = { k, c: S.activeCase, at: todayStr() }; S.fb.push(f); if (S.fb.length > 50) S.fb.shift(); } Object.assign(f, patch); save(); pushBoard(); const b = $('#fbBox'); if (b) b.innerHTML = fbHtml(); }
  function renderVerdict(c, s, res) {
    const el = $('#v-boardroom');
    const status = res.total >= 80 ? ['Approved', 'up', 'The board approves the strategy'] : res.total >= 60 ? ['With conditions', 'amber', 'Approved with conditions'] : ['Revise', 'down', 'Needs revision'];
    const ai = res.ai; const q = res.quant;
    const crit = [['clientFit', 'Client fit', q.fit, 10], ['analysis', 'Quality of analysis'], ['defense', 'Defense'], ['communication', 'Communication']];
    el.innerHTML = `<div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(280px,360px);gap:12px">
      <div class="stack"><div class="panel"><div class="row" style="align-items:center;gap:22px"><div><div class="label">Final score</div><div class="verdict-score">${Math.round(res.total)}</div><div class="muted mono" style="font-size:12px">out of 100 · rating ${res.ratingFrom} → <span class="${res.ratingTo >= res.ratingFrom ? 'up' : 'down'}">${res.ratingTo}</span></div></div>
          <div><span class="stamp ${status[1]}">${status[0]}</span><h2 style="margin-top:10px">${status[2]}</h2><p class="muted" style="max-width:56ch;margin-top:4px">${esc(ai.summary || '')}</p>${res.offline ? '<span class="chip" style="margin-top:6px">qualitative part scored offline</span>' : ''}</div></div></div>
        <div class="panel"><div class="panel-h"><h3>Quantitative part · ${(q.fit + q.risk).toFixed(1)} / 40</h3><span class="right label">computed by code</span></div>
          <div class="risk-tiles" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">
            <div class="rt ${q.fit >= 8 ? 'ok' : q.fit >= 5 ? 'warn' : 'bad'}"><div class="v">${q.fit.toFixed(1)}/10</div><div class="k">Client constraints</div></div>
            <div class="rt ${q.parts.corridor >= 6 ? 'ok' : 'bad'}"><div class="v">${q.parts.corridor.toFixed(1)}/8</div><div class="k">Risk in band · vol ${pct(q.m.vol)}</div></div>
            <div class="rt ${q.parts.sharpe >= 5 ? 'ok' : 'warn'}"><div class="v">${q.parts.sharpe.toFixed(1)}/8</div><div class="k">Sharpe ${q.m.sharpe.toFixed(2)} vs ${q.m.bmSharpe.toFixed(2)}</div></div>
            <div class="rt ${q.parts.mdd >= 6 ? 'ok' : 'bad'}"><div class="v">${q.parts.mdd.toFixed(1)}/7</div><div class="k">Drawdown ${pct(q.m.mdd)}</div></div>
            <div class="rt ${q.parts.div >= 5 ? 'ok' : 'warn'}"><div class="v">${q.parts.div.toFixed(1)}/7</div><div class="k">Diversification · N_eff ${q.m.neff.toFixed(1)}</div></div></div>
          ${q.notes.length ? '<div class="stack" style="gap:4px;margin-top:8px">' + q.notes.map(n => `<div class="down" style="font-size:12.5px">✕ ${esc(n)}</div>`).join('') + '</div>' : ''}</div>
        <div class="panel"><div class="panel-h"><h3>Board assessment · ${Object.keys(ai.criteria).reduce((a, k) => a + ai.criteria[k].points, 0).toFixed(1)} / 60</h3><span class="right label">rubric with evidence</span></div>
          <div class="stack">${crit.map(([k, label]) => { const x = ai.criteria[k]; return `<div><div class="row" style="justify-content:space-between"><b style="font-size:13px">${label}</b><span class="mono"><span class="chip ${x.level === 'Excellent' || x.level === 'Proficient' ? 'ok' : x.level === 'Developing' ? 'warn' : 'bad'}">${x.level}</span> ${x.points.toFixed(1)}/${AI.MAXP[k]}</span></div><p class="muted" style="font-size:12.5px;margin-top:2px">${esc(x.comment)}</p>${x.evidence ? `<div class="quote" style="font-size:12.5px;margin-top:4px">${esc(x.evidence)}</div>` : ''}</div>`; }).join('<hr class="sep">')}</div></div>
        ${ai.best || ai.weak ? `<div class="grid" style="grid-template-columns:1fr 1fr">${ai.best ? `<div class="panel"><div class="label up">Best answer</div><div class="quote" style="margin-top:6px">${esc(ai.best)}</div></div>` : ''}${ai.weak ? `<div class="panel"><div class="label down">Where the board wasn’t convinced</div><div class="quote" style="margin-top:6px;border-left-color:var(--down)">${esc(ai.weak)}</div></div>` : ''}</div>` : ''}
        <details class="panel"><summary class="label" style="cursor:pointer">Meeting transcript</summary><div class="transcript" style="max-height:none;padding:10px 0 0">${res.transcript.map(msgHtml).join('')}</div></details>
      </div>
      <div class="stack"><div class="panel"><div class="panel-h"><h3>Defense profile</h3></div><canvas id="vRadar" style="width:100%;height:240px"></canvas></div>
        <div class="panel"><div class="panel-h"><h3>What to improve</h3></div><div class="stack" style="gap:6px">${res.lessons.map(id => { const l = B.lessonById(id); return l ? `<button class="lesson-node" data-a="lesson" data-id="${id}"><span class="st">▶</span><span><b style="font-size:13px">${esc(l.title)}</b><br><span class="muted" style="font-size:11.5px">3–4 min · +XP</span></span></button>` : ''; }).join('')}</div></div>
        <div class="panel" id="fbBox">${fbHtml()}</div>
        ${S.placement && !S.postCheck ? '<div class="panel"><div class="label">Check your progress</div><p class="muted" style="font-size:14px;margin:4px 0 10px">Take the same 8 questions as at the start and compare.</p><button class="btn" data-a="postcheck">Final check</button></div>' : ''}
        <div class="panel stack"><button class="btn primary" data-a="revise">Revise and defend again</button><button class="btn" data-a="copy-result">Copy result</button><button class="btn ghost" data-a="go-league">Go to league</button></div></div></div>`;
    drawRadar($('#vRadar'), ['Client', 'Risk', 'Analysis', 'Defense', 'Communic.'], [res.radar.clientFit, res.radar.risk, res.radar.analysis, res.radar.defense, res.radar.communication]);
  }

  // ===================================================================
  // LEAGUE
  // ===================================================================
  const LG = { tab: 'rating', rows: null, loading: false, unsub: null, tours: {}, tourUnsubs: {}, tourView: null, err: '' };
  function subscribeLeague() {
    if (!CAP.db || LG.unsub || !cloudOk()) return;
    LG.loading = true;
    const timer = setTimeout(() => { if (LG.loading) { LG.err = 'Can’t load the league. Data will appear when storage responds.'; if (isView('league')) renderLeague(); } }, 10000);
    LG.unsub = CAP.db.collection('leaderboard').orderBy('rating', 'desc').limit(300).onSnapshot(snap => {
      LG.rows = snap.docs.map(d => Object.assign({ id: d.id }, d.data())); if (!snap.metadata.fromCache) { LG.loading = false; LG.err = ''; clearTimeout(timer); }
      if (isView('league')) renderLeague(); else if (isView('overview')) renderImpact(); else if (isView('about')) renderAbout();
    }, e => { LG.loading = false; clearTimeout(timer); LG.err = 'League unavailable (' + (e.code || 'error') + ').'; if (isView('league')) renderLeague(); });
    (S.joined || []).forEach(j => subscribeTour(j.code));
  }
  function subscribeTour(code) {
    if (!CAP.db || LG.tourUnsubs[code]) return;
    LG.tourUnsubs[code] = CAP.db.doc('tournaments/' + code).onSnapshot(d => { LG.tours[code] = d.exists ? d.data() : null; if (isView('league')) renderLeague(); }, () => {});
  }
  function copyText(t, msg) { (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast(msg), () => { openModal(`<h2 style="margin-bottom:8px">Copy it manually</h2><textarea style="min-height:200px;font:13px var(--mono)" readonly>${esc(t)}</textarea><div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn primary" data-a="modal-close">Done</button></div>`); }); }
  function isView(v) { return $('#v-' + v).classList.contains('on'); }
  function rowsForLeague() {
    if (LG.rows) return LG.rows.map(r => Object.assign({}, r, { me: r.id === CAP.uid }));
    if (!S.onboarded) return [];
    return [{ id: 'me', av: S.avatar | 0, nick: S.nick || 'You', rating: S.rating, xp: S.xp, defenses: S.defenses, best: Math.round(S.best), weekKey: S.weekXp.key, weekXp: S.weekXp.key === weekKey() ? S.weekXp.xp : 0, me: true, tournaments: tournamentResults(), ...learnStats(), classes: (S.joined || []).map(j => j.code) }];
  }
  function renderLeague() {
    const el = $('#v-league'); subscribeLeague();
    let rows = rowsForLeague(); const wk = weekKey();
    if (LG.tab === 'week') rows = rows.map(r => Object.assign({}, r, { wx: r.weekKey === wk ? (r.weekXp || 0) : 0 })).sort((a, b) => b.wx - a.wx);
    const div = xp => xp >= 1500 ? 'Chairman' : xp >= 800 ? 'Diamond' : xp >= 400 ? 'Platinum' : xp >= 200 ? 'Gold' : xp >= 80 ? 'Silver' : 'Bronze';
    const myIdx = rows.findIndex(r => r.me);
    const valOf = r => LG.tab === 'week' ? r.wx : r.rating;
    const top3 = rows.slice(0, 3);
    el.innerHTML = `<div class="eyebrow">League</div><div class="row" style="margin:6px 0 12px"><h1>Rankings and tournaments</h1>
        <span class="right seg" style="margin-left:auto"><button data-a="lg-tab" data-id="rating" class="${LG.tab === 'rating' ? 'on' : ''}">Board Rating</button><button data-a="lg-tab" data-id="week" class="${LG.tab === 'week' ? 'on' : ''}">Weekly league</button></span></div>
      ${!CAP.db || !cloudOk() ? `<div class="panel tight" style="margin-bottom:12px;font-size:12.5px"><span class="chip warn">just you</span> ${!CAP.db ? (window.claude ? 'The shared table works when the app is opened with a platform account.' : 'The shared league arrives with the server version; your progress is saved in this browser.') : !ageOk() ? 'Under 16, joining the shared league needs a parent’s confirmation (on the My data page).' : 'The shared league is turned off in your consent settings.'} We never invent other players. ${CAP.db && ageOk() ? '<button class="btn sm" data-a="consent-settings">Turn on “Cloud and league”</button>' : ''}</div>` : ''}
      ${LG.err ? `<div class="panel tight" style="margin-bottom:12px" class="muted">${esc(LG.err)}</div>` : ''}
      <div class="lg"><div class="panel">
        ${rows.length ? `<div class="podium">${top3.map((r, i) => `<div class="p ${i === 0 ? 'first' : ''}"><div class="label">${['1st', '2nd', '3rd'][i]} place</div><div style="display:flex;justify-content:center;margin-top:6px">${avatarHtml(r.av, 40, null, r.nick)}</div><div style="font-weight:600;margin-top:4px">${esc(r.nick || '—')}</div><div class="num amber" style="font-size:20px">${valOf(r)}</div><div class="faint mono" style="font-size:11px">${LG.tab === 'week' ? 'XP this week' : 'rating'}</div></div>`).join('')}</div>
        <div class="tbl-wrap"><table class="tbl"><tr><th>#</th><th class="l">Player</th><th>${LG.tab === 'week' ? 'Weekly XP' : 'Rating'}</th><th>Best</th><th>Defenses</th><th class="l">Division</th></tr>
        ${rows.slice(0, 50).map((r, i) => `<tr class="${r.me ? 'sel' : ''}"><td>${i + 1}</td><td class="l"><span class="row" style="gap:8px;flex-wrap:nowrap">${avatarHtml(r.av, 24, null, r.nick)}${esc(r.nick || '—')}${r.me ? ' <span class="chip amber">you</span>' : ''}</span></td><td class="amber">${valOf(r)}</td><td>${r.best || '—'}</td><td>${r.defenses || 0}</td><td class="l muted">${div(r.xp || 0)}</td></tr>`).join('')}
        </table></div>${myIdx >= 50 ? `<div class="mono" style="margin-top:8px;font-size:12px">You are #${myIdx + 1}</div>` : ''}` : `<div class="empty">${LG.loading ? 'Loading the table…' : 'Nobody in the league yet. Complete a defense and be the first.'}</div>`}
        ${LG.tab === 'week' ? '<p class="faint" style="font-size:12px;margin-top:8px">Week ' + wk + '. XP comes from lessons, trades and defenses. Division is based on total XP.</p>' : '<p class="faint" style="font-size:12px;margin-top:8px">Board Rating grows only with the quality of your defenses: each result is compared with what’s expected for the case difficulty.</p>'}
      </div>
      <div class="stack">${tourPanel()}</div></div>`;
  }
  function tourScore(entry, preset) { const w = { balanced: [0.6, 0.4], strategy: [0.8, 0.2], risk: [0.3, 0.7] }[preset] || [0.6, 0.4]; return Math.round(entry.board * w[0] + entry.risk * w[1]); }
  function tourPanel() {
    const joined = S.joined || [];
    let view = '';
    if (LG.tourView) {
      const j = joined.find(x => x.code === LG.tourView); const t = LG.tours[LG.tourView] || j;
      const entries = rowsForLeague().filter(r => r.tournaments && r.tournaments[LG.tourView]).map(r => ({ nick: r.nick, me: r.me, e: r.tournaments[LG.tourView] })).map(x => Object.assign(x, { score: tourScore(x.e, t.preset) })).sort((a, b) => b.score - a.score);
      const cdef = caseDef(t.caseId);
      view = `<div class="panel"><div class="panel-h"><h3>${esc(t.name || LG.tourView)}</h3><span class="right chip amber">${LG.tourView}</span></div>
        <p class="muted" style="font-size:12.5px">Case: ${esc(cdef ? cdef.title : t.caseId)} · preset ${esc({ balanced: 'Balanced 60/40', strategy: 'Strategy-first 80/20', risk: 'Risk-adjusted 30/70' }[t.preset] || t.preset)}${t.endsAt ? ' · until ' + new Date(t.endsAt).toLocaleDateString('en-US') : ''}</p>
        <p class="faint" style="font-size:11.5px;margin-top:4px">Tournament Score = a share of the board score + a share of the portfolio risk score. Pure return does not count.</p>
        ${entries.length ? '<table class="tbl" style="margin-top:8px"><tr><th>#</th><th class="l">Player</th><th>Score</th><th>Board</th><th>Risk</th></tr>' + entries.map((x, i) => `<tr class="${x.me ? 'sel' : ''}"><td>${i + 1}</td><td class="l">${esc(x.nick)}</td><td class="amber">${x.score}</td><td>${x.e.board}</td><td>${x.e.risk}</td></tr>`).join('') + '</table>' : '<div class="empty" style="margin-top:8px">No results yet. Take the tournament case and complete a defense.</div>'}
        ${t.createdBy && t.createdBy === CAP.uid ? pilotReport(LG.tourView, t) : ''}
        <div class="row" style="margin-top:10px"><button class="btn primary sm" data-a="open-case" data-id="${esc(t.caseId)}">Play case</button><button class="btn ghost sm" data-a="tour-close">Back</button></div></div>`;
    }
    return view + `<div class="panel"><div class="panel-h"><h3>Classes and tournaments</h3><span class="right label">${CAP.db && cloudOk() ? 'shared' : 'unavailable'}</span></div>
      ${joined.length ? '<div class="stack" style="gap:6px">' + joined.map(j => { const t = LG.tours[j.code] || j; return `<button class="lesson-node" data-a="tour-open" data-id="${esc(j.code)}"><span class="st">${esc(j.code.slice(0, 1))}</span><span><b style="font-size:13px">${esc(t.name || j.code)}</b><br><span class="muted mono" style="font-size:11px">${esc(j.code)} · ${esc((caseDef(t.caseId) || {}).title || '')}</span></span></button>`; }).join('') + '</div>' : '<p class="muted" style="font-size:12.5px">You are not in any tournaments yet.</p>'}
      <hr class="sep"><label class="label" for="joinCode">Join with a code</label><div class="row" style="flex-wrap:nowrap;margin-top:4px"><input type="text" id="joinCode" placeholder="e.g. K7Q2PX" maxlength="6" style="text-transform:uppercase"><button class="btn" data-a="tour-join" ${CAP.db && cloudOk() ? '' : 'disabled'}>Join</button></div>
      <button class="btn primary" style="margin-top:10px" data-a="tour-new" ${CAP.db && cloudOk() ? '' : 'disabled'}>I’m a teacher: create a class</button></div>`;
  }
  function classStats(code) {
    const all = rowsForLeague(); const members = all.filter(r => (r.classes || []).includes(code) || (r.tournaments && r.tournaments[code]));
    const done = members.filter(r => r.tournaments && r.tournaments[code]);
    const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    const paired = members.filter(r => r.pre != null && r.post != null);
    const fbRows = members.filter(r => r.fbU);
    const recN = members.reduce((a, r) => a + (r.fbRecN || 0), 0), rec = members.reduce((a, r) => a + (r.fbRec || 0), 0);
    return { n: members.length, done: done.length, board: avg(done.map(r => r.tournaments[code].board)), risk: avg(done.map(r => r.tournaments[code].risk)),
      pairs: paired.length, pre: avg(paired.map(r => r.pre)), post: avg(paired.map(r => r.post)), useful: avg(fbRows.map(r => r.fbU)), fbN: fbRows.length, recPct: recN ? rec / recN : null, recN, members };
  }
  function pilotReport(code, t) {
    const st = classStats(code); const q = B.PLACEMENT.length; const f1 = x => x == null ? '—' : x.toFixed(1);
    return `<hr class="sep"><div class="panel-h"><h3>Pilot report</h3><span class="right chip ok">visible only to you</span></div>
      <div class="tiles" style="grid-template-columns:repeat(auto-fill,minmax(120px,1fr))">
        <div class="tile"><div class="v">${st.n}</div><div class="k">Students</div><div class="s">joined with the code</div></div>
        <div class="tile"><div class="v">${st.done}</div><div class="k">Defended a case</div><div class="s">${st.n ? Math.round(st.done / st.n * 100) + '% of class' : '—'}</div></div>
        <div class="tile"><div class="v">${f1(st.board)}</div><div class="k">Board score</div><div class="s">average, out of 100</div></div>
        <div class="tile hl"><div class="v">${st.pairs ? f1(st.pre) + '→' + f1(st.post) : '—'}</div><div class="k">Knowledge before→after</div><div class="s">of ${q} · pairs: ${st.pairs}</div></div>
        <div class="tile"><div class="v">${f1(st.useful)}</div><div class="k">Usefulness</div><div class="s">of 5 · answers ${st.fbN}</div></div>
        <div class="tile"><div class="v">${st.recPct == null ? '—' : Math.round(st.recPct * 100) + '%'}</div><div class="k">Would recommend</div><div class="s">answers ${st.recN}</div></div>
      </div>
      <p class="faint" style="font-size:12.5px;margin-top:8px">Only averages across nicknames that joined the class and turned on the shared league. No names or personal data. Knowledge gain counts students who took both checks.</p>
      <div class="row" style="margin-top:8px"><button class="btn sm" data-a="pilot-copy" data-id="${esc(code)}">Copy summary</button><button class="btn sm ghost" data-a="pilot-csv" data-id="${esc(code)}">Copy table (CSV)</button></div>`;
  }
  function pilotSummary(code) {
    const st = classStats(code); const t = LG.tours[code] || (S.joined || []).find(j => j.code === code) || {}; const q = B.PLACEMENT.length; const f1 = x => x == null ? 'n/a' : x.toFixed(1);
    const lines = [`TradeX pilot "${t.name || code}" (${new Date().toISOString().slice(0, 10)})`,
      `Students joined: ${st.n}; completed a full case and board defense: ${st.done}.`,
      `Average AI-board score: ${f1(st.board)}/100.`,
      st.pairs ? `Knowledge check (same 8 questions before and after, ${st.pairs} students): ${f1(st.pre)}/${q} -> ${f1(st.post)}/${q} (${st.pre ? (st.post >= st.pre ? '+' : '') + Math.round((st.post - st.pre) / st.pre * 100) + '%' : 'n/a'}).` : 'Knowledge check: not enough paired results yet.',
      st.fbN ? `Usefulness rating: ${f1(st.useful)}/5 (${st.fbN} students).` : '',
      st.recN ? `Would recommend to a friend: ${Math.round(st.recPct * 100)}% (${st.recN} answers).` : ''];
    return lines.filter(Boolean).join('\n');
  }
  function pilotCsv(code) {
    const st = classStats(code); const cell = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    return ['nick,defended,board,risk,pre,post,usefulness,recommend_yes,recommend_answers'].concat(st.members.map(r => { const e = r.tournaments && r.tournaments[code]; return [cell(r.nick), e ? 1 : 0, e ? e.board : '', e ? e.risk : '', r.pre, r.post, r.fbU, r.fbRec || 0, r.fbRecN || 0].map(v => typeof v === 'string' && v[0] === '"' ? v : cell(v)).join(','); })).join('\n');
  }
  function tourNewModal() {
    openModal(`<div class="eyebrow">Class or pilot</div><h2 style="margin:6px 0 6px">Run TradeX in your class</h2><p class="muted" style="margin-bottom:12px">Students enter the code on the League page. You get a report: how many finished the case, the average score, knowledge before and after, and usefulness ratings. Only nicknames and averages.</p>
      <div class="stack"><div><label class="label" for="tn-name">Name</label><input type="text" id="tn-name" maxlength="60" placeholder="Period 3 · TradeX pilot" autofocus></div>
      <div><label class="label" for="tn-case">Case</label><select id="tn-case">${B.CASES.map(c => `<option value="${c.id}">${esc(c.title)} · ${c.level}</option>`).join('')}</select></div>
      <div><label class="label" for="tn-preset">Scoring formula</label><select id="tn-preset"><option value="balanced">Balanced: 60% board / 40% risk</option><option value="strategy">Strategy-first — 80% / 20%</option><option value="risk">Risk-adjusted — 30% / 70%</option></select></div>
      <div><label class="label" for="tn-days">Duration</label><select id="tn-days"><option value="7">7 days</option><option value="14" selected>14 days</option><option value="30">30 days</option></select></div></div>
      <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn ghost" data-a="modal-close">Cancel</button><button class="btn primary" data-a="tour-create">Create and get code</button></div><p class="faint" style="font-size:12.5px;margin-top:10px">Pilot tip: ask students to take the placement check before the case and the final check after the defense.</p><div></div>`);
  }
  async function tourCreate() {
    const name = ($('#tn-name').value || '').trim() || 'Tournament'; const caseId = $('#tn-case').value; const preset = $('#tn-preset').value; const days = +$('#tn-days').value;
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let code = ''; for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    const t = { name: name.slice(0, 60), caseId, preset, createdBy: CAP.uid, createdAt: Date.now(), endsAt: Date.now() + days * 86400000 };
    try { await CAP.db.doc('tournaments/' + code).set(t); } catch (e) { toast('Could not create the tournament: ' + esc(e.code || 'error') + '. Only participants with edit access can create tournaments.'); return; }
    S.joined = (S.joined || []).concat([Object.assign({ code }, t)]); save(); subscribeTour(code); LG.tourView = code;
    openModal(`<div class="eyebrow">Tournament created</div><h2 style="margin:6px 0">${esc(name)}</h2><p class="muted">Share the code with students; they enter it on the League page. The pilot report will appear on the class card.</p><div class="num amber" style="font-size:44px;letter-spacing:.12em;margin:14px 0">${code}</div><div class="row"><button class="btn" data-a="copy" data-id="${code}">Copy code</button><button class="btn primary" data-a="modal-close">Done</button></div>`);
  }
  async function tourJoin() {
    const code = ($('#joinCode').value || '').trim().toUpperCase(); if (!/^[A-Z0-9]{6}$/.test(code)) { toast('The code is 6 characters: letters and digits.'); return; }
    if ((S.joined || []).some(j => j.code === code)) { LG.tourView = code; renderLeague(); return; }
    let d; try { d = await CAP.db.doc('tournaments/' + code).get(); } catch (e) { toast('Could not check the code.'); return; }
    if (!d.exists) { toast('Tournament with code ' + esc(code) + ' not found.'); return; }
    const t = d.data(); S.joined = (S.joined || []).concat([{ code, name: t.name, caseId: t.caseId, preset: t.preset, endsAt: t.endsAt }]); save(); subscribeTour(code); LG.tourView = code; addXp(5);
    toast('You joined “' + esc(t.name) + '”. Your result counts after you defend the case.'); renderLeague();
  }

  // ===================================================================
  // LEARN
  // ===================================================================
  function nextLesson() { for (const u of B.UNITS) for (const l of u.lessons) if (!S.lessons[l.id]) return l; return B.UNITS[0].lessons[0]; }
  function renderLearn() {
    const el = $('#v-learn'); const nl = nextLesson();
    el.innerHTML = `<div class="eyebrow">Learn · micro-lessons</div><div class="row" style="margin:6px 0 12px;align-items:flex-end"><h1>Financial literacy, 4 minutes at a time</h1></div>
      <div class="grid" style="grid-template-columns:minmax(0,1fr) 300px">
        <div class="units">${B.UNITS.map((u, ui) => `<div class="panel"><div class="label">Unit ${ui + 1}</div><h3 style="margin:4px 0 10px">${esc(u.title)}</h3><div class="stack" style="gap:6px">${u.lessons.map(l => { const d = S.lessons[l.id]; return `<button class="lesson-node ${d ? 'done' : ''}" data-a="lesson" data-id="${l.id}"><span class="st">${d ? '✓' : '▶'}</span><span><b style="font-size:13px">${esc(l.title)}</b><br><span class="muted mono" style="font-size:11px">${l.cards.length} cards${d ? ' · accuracy ' + Math.round(d.acc * 100) + '%' : ''}</span></span></button>`; }).join('')}</div></div>`).join('')}</div>
        <div class="stack"><div class="panel hero"><div class="label">Lesson of the day</div><h2 style="margin:6px 0">${esc(nl.title)}</h2><button class="btn primary" data-a="lesson" data-id="${nl.id}">Start</button></div>
          <div class="panel"><div class="tiles" style="grid-template-columns:1fr 1fr"><div class="tile"><div class="v">${S.streak.count || 0}</div><div class="k">Streak</div></div><div class="tile"><div class="v">${S.weekXp.key === weekKey() ? S.weekXp.xp : 0}</div><div class="k">Weekly XP</div></div></div>
          <p class="faint" style="font-size:12px;margin-top:8px">Mistakes don’t block a lesson: a missed card comes back at the end. Lesson recommendations come from board verdicts.</p></div></div></div>`;
  }
  let L = null;
  function startLesson(id) {
    const l = B.lessonById(id); if (!l) return;
    L = { l, queue: l.cards.map((c, i) => i), pos: 0, correct: 0, answered: 0, retried: {}, state: {} };
    closeModal(); drawLesson();
  }
  function drawLesson() {
    const l = L.l; const idx = L.queue[L.pos]; const card = l.cards[idx]; const st = L.state;
    const progress = Math.round(L.pos / L.queue.length * 100);
    let body = '';
    if (card.type === 'concept') body = `<div class="eyebrow">Concept</div><h2 style="margin:6px 0 8px">${esc(card.title)}</h2><p style="font-size:15px;line-height:1.6">${esc(card.text)}</p>`;
    else if (card.type === 'choice') body = `<h2 style="margin-bottom:12px">${esc(card.q)}</h2>${card.o.map((o, i) => `<button class="opt ${st.done ? (i === card.a ? 'right' : i === st.pick ? 'wrong' : '') : st.pick === i ? 'sel' : ''}" data-a="l-pick" data-id="${i}" ${st.done ? 'disabled' : ''}>${esc(o)}</button>`).join('')}`;
    else if (card.type === 'swipe') body = `<div class="eyebrow">Decide fast</div><h2 style="margin:6px 0">${esc(card.q)}</h2><div class="swipe"><button class="btn ${st.done ? (card.a === 'left' ? 'primary' : '') : ''}" data-a="l-swipe" data-id="left" ${st.done ? 'disabled' : ''}>← ${esc(card.left)}</button><button class="btn ${st.done ? (card.a === 'right' ? 'primary' : '') : ''}" data-a="l-swipe" data-id="right" ${st.done ? 'disabled' : ''}>${esc(card.right)} →</button></div><p class="faint mono" style="font-size:11px;margin-top:6px">keys ← →</p>`;
    else if (card.type === 'slider') { const v = st.v == null ? Math.round((card.min + card.max) / 2 / card.step) * card.step : st.v; body = `<h2 style="margin-bottom:14px">${esc(card.q)}</h2><div class="num amber" style="font-size:34px" id="slv">${card.unit === '$' ? '$' + Number(v).toLocaleString('en-US') : v}</div><input type="range" id="slider" min="${card.min}" max="${card.max}" step="${card.step}" value="${v}" ${st.done ? 'disabled' : ''} aria-label="Answer">${st.done ? `<p class="mono" style="margin-top:6px">Correct: ${card.unit === '$' ? '$' + card.answer.toLocaleString('en-US') : card.answer}</p>` : ''}`; }
    else if (card.type === 'match') { const m = st.m || (st.m = { left: card.pairs.map((p, i) => i), right: shuffle(card.pairs.map((p, i) => i), idx), done: [], sel: null }); body = `<h2 style="margin-bottom:12px">${esc(card.q)}</h2><div class="match"><div class="stack" style="gap:8px">${m.left.map(i => `<button class="${m.done.indexOf(i) >= 0 ? 'done' : m.sel === i ? 'sel' : ''}" data-a="l-ml" data-id="${i}">${esc(card.pairs[i][0])}</button>`).join('')}</div><div class="stack" style="gap:8px">${m.right.map(i => `<button class="${m.done.indexOf(i) >= 0 ? 'done' : ''}" data-a="l-mr" data-id="${i}">${esc(card.pairs[i][1])}</button>`).join('')}</div></div>`; }
    else if (card.type === 'chart') body = `<h2 style="margin-bottom:10px">${esc(card.q)}</h2><canvas id="lchart" tabindex="0" role="img" aria-label="A 40-point practice chart. Use the left and right arrows to pick a point, Enter to answer. Selected point ${(st.cur == null ? 0 : st.cur) + 1}." style="width:100%;height:220px;cursor:crosshair;background:var(--input);border-radius:6px"></canvas><p class="faint mono" style="font-size:11px;margin-top:4px">with the mouse or arrows ← → and Enter</p>`;
    const fb = st.done && card.type !== 'concept' ? `<div class="feedback ${st.ok ? 'good' : 'bad'}"><b>${st.ok ? 'Correct.' : 'Not quite.'}</b> ${esc(card.e || '')}${st.alt ? '<p style="margin-top:6px">' + esc(st.alt) + '</p>' : ''}</div>` : '';
    const canCheck = card.type === 'choice' && st.pick != null || card.type === 'slider';
    openModal(`<div class="row" style="flex-wrap:nowrap"><button class="x" data-a="modal-close" aria-label="Close lesson">✕</button><div class="prog" style="flex:1"><i style="width:${progress}%"></i></div><span class="mono faint" style="font-size:11px">${L.pos + 1}/${L.queue.length}</span></div>
      <div style="margin:18px 0 6px" class="label">${esc(l.title)}</div>${body}${fb}
      <div class="row" style="margin-top:16px;justify-content:space-between">${CAP.sample && (st.done || card.type === 'concept') ? '<button class="btn ghost sm" data-a="l-explain">I don’t get it, explain differently</button>' : '<span></span>'}
      ${card.type === 'concept' || st.done ? '<button class="btn primary" data-a="l-next" autofocus>Next</button>' : canCheck ? '<button class="btn primary" data-a="l-check">Check</button>' : ''}</div>`, true);
    if (card.type === 'chart') drawLessonChart(card, st);
  }
  function shuffle(a, seed) { const r = B.mulberry32(seed + 11); const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } if (x.every((v, i) => v === a[i])) x.reverse(); return x; }
  function drawLessonChart(card, st) {
    const cv = $('#lchart'); const vals = B.chartSeries(card.seed); const { g, w, h } = setupCanvas(cv);
    const mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    const X = i => 10 + i / (vals.length - 1) * (w - 20), Y = v => h - 12 - (v - mn) / (mx - mn) * (h - 24);
    g.beginPath(); vals.forEach((v, i) => i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))); g.strokeStyle = K().accent; g.lineWidth = 2; g.stroke();
    vals.forEach((v, i) => { g.beginPath(); g.arc(X(i), Y(v), 2, 0, 7); g.fillStyle = K().muted; g.fill(); });
    if (!st.done && st.cur != null) { g.beginPath(); g.arc(X(st.cur), Y(vals[st.cur]), 7, 0, 7); g.strokeStyle = K().text; g.lineWidth = 1.5; g.stroke(); }
    if (st.pickI != null) { g.beginPath(); g.arc(X(st.pickI), Y(vals[st.pickI]), 6, 0, 7); g.strokeStyle = st.ok ? K().up : K().down; g.lineWidth = 2; g.stroke(); }
    if (st.done) { const tr = troughIndex(vals); g.beginPath(); g.arc(X(tr), Y(vals[tr]), 9, 0, 7); g.strokeStyle = K().up; g.setLineDash([3, 3]); g.stroke(); g.setLineDash([]); }
    if (!st.done) cv.onkeydown = ev => { if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') { ev.preventDefault(); st.cur = B.clamp((st.cur == null ? 0 : st.cur) + (ev.key === 'ArrowRight' ? 1 : -1), 0, vals.length - 1); drawLessonChart(card, st); cv.setAttribute('aria-label', 'Selected point ' + (st.cur + 1) + ' of ' + vals.length + ', value ' + vals[st.cur].toFixed(1) + '. Enter to answer.'); } else if (ev.key === 'Enter' && st.cur != null) { ev.preventDefault(); st.pickI = st.cur; grade(Math.abs(st.cur - troughIndex(vals)) <= 2); } };
    if (!st.done) cv.onclick = ev => { const r = cv.getBoundingClientRect(); const x = ev.clientX - r.left; let best = 0, bd = 1e9; vals.forEach((v, i) => { const d = Math.abs(X(i) - x); if (d < bd) { bd = d; best = i; } }); st.pickI = best; const tr = troughIndex(vals); grade(Math.abs(best - tr) <= 2); };
  }
  function troughIndex(v) { let peak = v[0], mdd = 0, tr = 0; v.forEach((x, i) => { if (x > peak) peak = x; const d = 1 - x / peak; if (d > mdd) { mdd = d; tr = i; } }); return tr; }
  function grade(ok) {
    const st = L.state; st.done = true; st.ok = ok; L.answered++; if (ok) L.correct++;
    const idx = L.queue[L.pos]; if (!ok && !L.retried[idx]) { L.retried[idx] = 1; L.queue.push(idx); }
    drawLesson();
  }
  function lessonNext() {
    L.pos++; L.state = {};
    if (L.pos >= L.queue.length) {
      const acc = L.answered ? L.correct / L.answered : 1; const xp = 10 + L.correct * 2;
      S.lessons[L.l.id] = { acc, at: new Date().toISOString() }; addXp(xp);
      openModal(`<div class="eyebrow">Lesson complete</div><h2 style="margin:6px 0">${esc(L.l.title)}</h2><div class="tiles" style="margin:14px 0"><div class="tile hl"><div class="v">+${xp}</div><div class="k">XP</div></div><div class="tile"><div class="v">${Math.round(acc * 100)}%</div><div class="k">Accuracy</div></div><div class="tile"><div class="v">${S.streak.count}</div><div class="k">Streak</div></div></div>
        <div class="row" style="justify-content:flex-end"><button class="btn" data-a="lesson" data-id="${nextLesson().id}">Another lesson</button><button class="btn primary" data-a="apply-case">Apply it in a case</button></div>`);
      L = null; if (isView('learn')) renderLearn(); if (isView('overview')) renderOverview(); return;
    }
    drawLesson();
  }


  // ===================================================================
  // ABOUT — for judges, teachers and partners
  // ===================================================================
  const ABOUT_TXT = {
    h: 'Learn investing the way professionals are judged: by the reasoning, not by luck.',
    lead: 'TradeX is a case-based investing simulator for high-school students. Each case is a client with a goal, a deadline and limits. Students build a portfolio from real U.S. and European companies on a scenario market, write an investment thesis and defend it in front of an AI board of directors.',
    p: ['Teenagers see investing everywhere: trading apps, finfluencers, crypto ads. Most school courses explain the theory but give no safe place to make a decision and be challenged on it.', 'Stock-market games reward whoever gets lucky with a hot stock. That teaches gambling, not judgment.', 'Real advisors start from the client: goals, timeline, risk, values. Almost no learning tool trains that skill.'],
    s: [['Brief', 'A fictional client with goals, a horizon, risk tolerance, constraints and a hidden fact the student has to ask about.'], ['Portfolio', '31 real instruments (Apple, NVIDIA, ASML, LVMH, Siemens, an S&P 500 ETF, bonds, gold) with scenario prices, the euro exchange rate, crises and news. Pro charts with 26 indicators, drawing tools and live playback.'], ['Thesis', 'Strategy, client fit, key risks and a plan for a market drop. The student writes it; the AI never writes for them.'], ['Board defense', 'Five AI directors (chair, risk, growth, ESG, skeptic) question the thesis. Score: 40 points computed by code (constraints, risk, drawdown, diversification) + 60 points from a rubric with evidence quotes.']],
    d: ['Scores the decision process, not returns. Pure profit is not part of the score.', 'Client-first cases, like real advisory work and case competitions.', 'Global by design: U.S. and European markets, with currency risk built in.', 'Built-in measurement: the same 8-question check before and after, so teachers see learning gains.'],
    t: ['A teacher creates a class in one minute and shares a 6-character code.', 'The class report shows students joined, cases defended, average board score, knowledge before and after, usefulness rating and the share who would recommend it.', 'Only nicknames and averages. No real names, emails or phone numbers. Students under 16 need a parent’s confirmation for shared features.'],
    m: ['Free for students.', 'School and club subscription: class reports, custom cases, tournaments.', 'Sponsored tournaments and financial-literacy programs with banks and brokers, with no product placement inside cases.'],
    r: ['Run class pilots and collect before/after results.', 'Server version: licensed real or delayed market data; sign-in with email, Google, Apple ID or phone.', 'More languages and teacher-made cases.'],
    disc: 'Educational simulation. Company names are used for identification only; prices, news and ESG scores are scenario values. Not investment advice.'
  };
  function renderAbout() {
    const el = $('#v-about'); if (!el) return; if (CAP.db && cloudOk()) subscribeLeague();
    const x = ABOUT_TXT; const st = impactStats();
    const li = a => '<ul style="margin:6px 0 0;padding-left:20px">' + a.map(t => `<li style="margin-bottom:6px">${esc(t)}</li>`).join('') + '</ul>';
    const lbl = ['students', 'board defenses', 'lessons completed', 'classes'];
    el.innerHTML = `<div class="about-hero"><div class="eyebrow">About TradeX</div><h1 style="margin-top:8px">${x.h}</h1><p class="muted" style="margin-top:12px;max-width:72ch;font-size:16.5px">${x.lead}</p>
        <div class="row" style="margin-top:20px">${S.onboarded ? '<button class="btn primary" data-a="open-case" data-id="aigerim">Try the first case</button>' : '<button class="btn primary" data-a="onboard">Try TradeX free, no sign-up</button>'}<a class="btn" href="#league">I’m a teacher: run a class pilot</a></div></div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr));margin-top:16px">
        <section class="panel"><h2>The problem</h2>${li(x.p)}</section>
        <section class="panel"><h2>What makes it different</h2>${li(x.d)}</section>
      </div>
      <section class="panel" style="margin-top:16px"><h2 style="margin-bottom:14px">How it works</h2><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">${x.s.map(([h, t], i) => `<div class="casecard"><span class="step-n">${i + 1}</span><h3>${esc(h)}</h3><p class="muted" style="font-size:14.5px">${esc(t)}</p></div>`).join('')}</div></section>
      <section class="panel" style="margin-top:16px"><div class="panel-h"><h2>Impact so far</h2><span class="right chip ok">live</span></div>
        ${st ? `<div class="tiles">${[st.users, st.defenses, st.lessons, st.classes].map((v, i) => `<div class="tile"><div class="v">${v}</div><div class="k">${lbl[i]}</div></div>`).join('')}${st.pairs ? `<div class="tile hl"><div class="v">${st.gain >= 0 ? '+' : ''}${st.gain.toFixed(1)}</div><div class="k">knowledge gain (of 8)</div><div class="s">n = ${st.pairs}</div></div>` : ''}${st.recPct != null ? `<div class="tile"><div class="v">${Math.round(st.recPct * 100)}%</div><div class="k">would recommend</div></div>` : ''}</div>` : '<p class="muted">Live numbers appear here as students use TradeX with the shared league turned on.</p>'}</section>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));margin-top:16px">
        <section class="panel"><h2>For schools</h2>${li(x.t)}</section>
        <section class="panel"><h2>Business model</h2>${li(x.m)}</section>
        <section class="panel"><h2>Next steps</h2>${li(x.r)}</section>
      </div>
      <p class="faint" style="margin-top:16px;font-size:13px">${x.disc}</p>`;
  }

  // ===================================================================
  // PROFILE & ACCOUNT
  // ===================================================================
  const GOALS = ['', 'Understand the basics of investing', 'Prepare for a case competition or olympiad', 'Learn to build a portfolio for a goal', 'Understand European and U.S. markets', 'Just curious'];
  const AUTH_ICONS = {
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
    google: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 12.2c0 4.6-3.3 7.8-8 7.8a8 8 0 1 1 5.5-13.8"/><path d="M12 12h8"/></svg>',
    apple: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M16 3c-1.5.2-3 1.5-3 3 1.6 0 3-1.4 3-3zM12 8c-1 0-2-.8-3.5-.8C6 7.2 4 9.3 4 12.5 4 16.4 6.6 21 8.6 21c1.2 0 1.8-.7 3.4-.7s2 .7 3.4.7c1.6 0 3.1-2.6 3.6-4.3-1.8-.7-2.8-2.3-2.8-4.2 0-1.7.9-3 2.2-3.8-.9-1.2-2.3-1.9-3.7-1.9C13.9 6.8 13 8 12 8z"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/></svg>'
  };
  function renderProfile() {
    const el = $('#v-profile'); if (T.avSel == null) T.avSel = S.avatar | 0;
    const pr = S.profile || {}; const tp = themePref(); const lvl = S.placement ? S.placement.level : null;
    const signed = !!CAP.uid;
    el.innerHTML = `<div class="eyebrow">Profile</div>
      <div class="row" style="margin:8px 0 18px;gap:16px">${avatarHtml(S.avatar, 72, 'Your avatar')}<div><h1>${S.onboarded ? esc(S.nick) : 'Guest'}</h1>
        <div class="row" style="margin-top:6px"><span class="chip amber">R ${S.rating}</span><span class="chip">${S.xp} XP</span><span class="chip">defenses ${S.defenses}</span>${lvl ? '<span class="chip ok">' + esc(lvl) + '</span>' : '<span class="chip">placement check not taken</span>'}</div></div></div>
      <div class="prof">
        <div class="stack">
          <section class="panel" aria-labelledby="pfH"><h2 id="pfH" style="margin-bottom:14px">Personal details</h2>
            <div class="grid" style="grid-template-columns:1fr 1fr">
              <div><label class="label" for="pfNick">League nickname</label><input type="text" id="pfNick" maxlength="24" value="${esc(S.nick)}" autocomplete="off"><p class="faint" style="font-size:12.5px;margin-top:4px">Visible to other players. Not your real name.</p></div>
              <div><label class="label" for="pfName">What should we call you <span class="faint">(optional)</span></label><input type="text" id="pfName" maxlength="40" value="${esc(pr.name || '')}" autocomplete="off"><p class="faint" style="font-size:12.5px;margin-top:4px">Only you can see this. You can leave it empty.</p></div>
            </div>
            <div style="margin-top:12px"><label class="label" for="pfGoal">Learning goal</label><select id="pfGoal">${GOALS.map(g => `<option value="${esc(g)}" ${g === (pr.goal || '') ? 'selected' : ''}>${g ? esc(g) : '— not selected —'}</option>`).join('')}</select></div>
            <div style="margin-top:16px"><div class="label" style="margin-bottom:8px">Avatar</div>${avatarPicker(T.avSel)}<p class="faint" style="font-size:12.5px;margin-top:6px">Avatars are ready-made icons. Photo uploads are turned off so we don’t collect images of faces.</p></div>
            <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn primary" data-a="pf-save">Save profile</button></div>
          </section>
          <section class="panel" aria-labelledby="thH"><h2 id="thH" style="margin-bottom:10px">Appearance</h2>
            <div class="seg" role="radiogroup" aria-label="Theme">${[['light', 'Light'], ['dark', 'Dark'], ['system', 'System']].map(([k, l]) => `<button role="radio" aria-checked="${tp === k}" class="${tp === k ? 'on' : ''}" data-a="theme-set" data-id="${k}" style="padding:9px 16px">${l}</button>`).join('')}</div>
            <p class="faint" style="font-size:12.5px;margin-top:8px">Applies immediately and is stored only in this browser.</p>
          </section>
          <section class="panel" aria-labelledby="plH"><h2 id="plH" style="margin-bottom:6px">Placement check</h2>
            <p class="muted">${S.placement ? 'Result: ' + S.placement.total + ' of ' + B.PLACEMENT.length + ', level ' + esc(S.placement.level) + '.' : 'Optional. 8 questions on basics, risk, analysis and behavior; we’ll suggest lessons for your level.'}</p>
            ${S.postCheck ? `<p class="muted" style="margin-top:4px">Final check: ${S.postCheck.total} of ${B.PLACEMENT.length}${S.placement ? ' (was ' + S.placement.total + ')' : ''}.</p>` : ''}
            <div class="row" style="margin-top:10px">${S.placement ? '' : '<button class="btn" data-a="placement">Take placement check</button>'}<button class="btn ${S.placement ? 'primary' : ''}" data-a="postcheck" ${S.defenses ? '' : 'disabled title="Available after your first defense"'}>Final check</button></div>
            <p class="faint" style="font-size:12.5px;margin-top:6px">The placement check comes before cases, the final check after. The difference shows what you learned. In a class, the teacher sees only averages.</p>
          </section>
        </div>
        <div class="stack">
          <section class="panel" aria-labelledby="acH"><h2 id="acH" style="margin-bottom:10px">Sign-in and account</h2>
            <div class="auth-opt" style="border-color:${signed ? 'color-mix(in srgb, var(--up) 45%, var(--line))' : 'var(--line)'}"><span class="dot ${signed ? '' : 'off'}" aria-hidden="true"></span><div><b>${signed ? 'Signed in with your platform account' : 'Guest mode'}</b><div class="muted" style="font-size:13px">${signed ? 'No separate password needed: your progress and league entry are tied to your platform account.' : 'Progress is stored only in this browser.'}</div></div></div>
            <div class="label" style="margin:16px 0 8px">Other sign-in methods</div>
            <div class="stack" style="gap:8px">${[['mail', 'Email and password'], ['google', 'Google'], ['apple', 'Apple ID'], ['phone', 'Phone and SMS code']].map(([k, l]) => `<div class="auth-opt" aria-disabled="true">${AUTH_ICONS[k]}<span style="flex:1">${l}</span><span class="chip">in the server version</span></div>`).join('')}</div>
            <div class="label" style="margin:18px 0 8px">What code verification will look like</div>
            <div class="panel" style="background:var(--panel-2);box-shadow:none" role="img" aria-label="Preview of a six-digit code entry screen. Input is disabled.">
              <div style="font-weight:600;margin-bottom:4px">Enter the code from the SMS</div><div class="muted" style="font-size:13px;margin-bottom:10px">6-digit code, valid for 5 minutes</div>
              <div class="otp" aria-hidden="true"><span class="f">•</span><span class="f">•</span><span class="f">•</span><span></span><span></span><span></span></div>
              <div class="faint" style="font-size:12.5px;margin-top:10px">Resend code in 0:42 · preview, nothing is sent</div>
            </div>
            <p class="faint" style="font-size:12.5px;margin-top:10px">These methods need a server: password storage, Google and Apple sign-in keys, an SMS gateway. The data model and API are described in the project documentation.</p>
          </section>
          <section class="panel" aria-labelledby="dtH"><h2 id="dtH" style="margin-bottom:10px">Data and consent</h2>
            <div class="row"><a class="btn" href="#my-data">My data</a><button class="btn" data-a="consent-settings">Consent</button><a class="btn ghost" href="#privacy">Privacy</a></div>
          </section>
        </div>
      </div>`;
  }

  // ===================================================================
  // ONBOARDING
  // ===================================================================
  let P = null;
  const SOC = {
    google: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.4-.2-2.1H12v4h6c-.3 1.4-1.1 2.6-2.3 3.4v2.8h3.7c2.1-2 3.2-4.9 3.2-8.1z"/><path fill="#34A853" d="M12 23c3 0 5.6-1 7.4-2.7l-3.7-2.8c-1 .7-2.3 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2v2.9C3.8 20.5 7.6 23 12 23z"/><path fill="#FBBC05" d="M5.8 14.1c-.2-.7-.4-1.4-.4-2.1s.1-1.4.4-2.1V7H2C1.3 8.5.9 10.2.9 12s.4 3.5 1.1 5l3.8-2.9z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2C17.6 2.1 15 1 12 1 7.6 1 3.8 3.5 2 7l3.8 2.9C6.7 7.3 9.1 5.4 12 5.4z"/></svg>',
    apple: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8s1.9.8 3.2.8c1.3 0 2.1-1.2 2.9-2.4.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.4-.9-2.4-4zM14 5.5c.7-.8 1.1-1.9 1-3-1 0-2.1.6-2.8 1.4-.6.7-1.2 1.8-1 2.9 1.1.1 2.1-.5 2.8-1.3z"/></svg>',
    meta: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#1877F2"/><path fill="#fff" d="M13.4 22v-7.2h2.4l.4-2.8h-2.8v-1.8c0-.8.2-1.4 1.4-1.4h1.5V6.3c-.3 0-1.1-.1-2.2-.1-2.2 0-3.6 1.3-3.6 3.7V12H8.1v2.8h2.4V22h2.9z"/></svg>'
  };
  function onboard() {
    if (T.obAv == null) T.obAv = S.avatar | 0;
    openModal(`<h2 class="welcome">Welcome to TradeX</h2><p class="lead">You are a junior investment advisor. Build a portfolio for a client and defend it before an AI board.</p>
      <label class="label" for="nick" style="color:var(--text);font-weight:600">Nickname</label><input type="text" id="nick" maxlength="24" value="${esc(S.nick)}" placeholder="e.g. bull_runner" autofocus style="margin-top:6px">
      <p class="faint" style="font-size:12.5px;margin-top:4px">No sign-up, email or password. Don’t use your real name.</p>
      <div style="margin-top:14px"><div class="label" style="margin-bottom:8px;color:var(--text);font-weight:600">Avatar</div>${avatarPicker(T.obAv)}</div>
      <button class="btn dark block" style="margin-top:18px" data-a="ob-next">Start</button>
      <div class="orline">Or</div>
      <button class="btn block" data-a="demo">Explore with a demo portfolio</button>
      <p class="faint" style="font-size:12.5px;margin-top:10px;text-align:center">The demo builds a sample portfolio for the first case and fast-forwards three months, so you can see the dashboard, charts and board defense right away. Virtual money, scenario prices, not investment advice.</p>`, 'glass');
  }
  function seedDemo() {
    const n = ($('#nick') && $('#nick').value || '').trim().replace(/[<>]/g, '');
    S.nick = n.length >= 2 ? n : 'demo_advisor'; S.avatar = T.obAv | 0;
    const c = caseDef('aigerim'); S.cases[c.id] = newCaseState(c); const s = S.cases[c.id]; S.activeCase = c.id;
    s.phase = 'build'; s.target = { AGG: 0.30, SGOV: 0.25, SPY: 0.15, JNJ: 0.08, KO: 0.07, SAP: 0.07, GLD: 0.05, IBE: 0.03 };
    s.qa = [{ q: 'Will you need any of this money before the down payment?', a: c.hidden[0] }]; s.askedHidden = true;
    QUIET = true; try { executeRebalance(c, s); advance(c, s, 63, true); } finally { QUIET = false; }
    s.thesis = { strategy: 'Sample thesis (edit it): a conservative core of U.S. bonds and Treasury bills, with a smaller slice of the S&P 500 and defensive stocks.', fit: 'Emily needs a down payment in 3 years and $15,000 in 9 months; her risk level is 2/5, so 25% sits in T-bills and stocks stay below 40%.', risks: 'Rising rates would hurt bonds; a stock market crash would hit the equity slice. No bank stocks, because her job already depends on banks.', plan: 'If the market falls 20%, I keep the plan, rebalance back to target weights and remind Emily that the renovation money is already in T-bills.' };
    s.phase = 'thesis'; save();
  }
  function finishOnboard() {
    const first = !S.onboarded; S.onboarded = true; if (first) addXp(20); save(); pushBoard();
    if (T.demo) { T.demo = false; go('overview'); openModal(`<div class="eyebrow">Demo ready</div><h2 style="margin:6px 0 8px">Hi, ${esc(S.nick)}! Your demo portfolio is live.</h2>
      <p class="muted">We built a conservative portfolio for Emily Carter, wrote a sample thesis and fast-forwarded three months. Next: look around the dashboard, open the Terminal, or defend the strategy before the board.</p>
      <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn" data-a="modal-close">See dashboard</button><button class="btn" data-a="go-terminal-close">Open terminal</button><button class="btn primary" data-a="go-board-close">Defend before the board</button></div>`); renderBadge(); renderOverview(); return; }
    openModal(`<div class="eyebrow">Done</div><h2 style="margin:6px 0 8px">${avatarHtml(S.avatar, 40)} <span style="vertical-align:middle">Hi, ${esc(S.nick)}!</span></h2>
      <p class="muted">Start with the first case. The short placement check (8 questions) is optional and suggests lessons for your level.</p>
      <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn" data-a="modal-close">Go to overview</button><button class="btn" data-a="placement">Take placement check</button><button class="btn primary" data-a="open-case" data-id="aigerim" autofocus>First case: Emily Carter</button></div>`);
    renderBadge(); if (isView('overview')) renderOverview();
  }
  function ageStep() {
    openModal(`<div class="eyebrow">Age</div><h2 style="margin:6px 0 8px">How old are you?</h2>
      <p class="muted">We need this to know whether a parent’s consent is required for cloud storage, the shared league and AI features. We store only “16 or older” or “under 16”, never a date of birth.</p>
      <div class="swipe"><button class="btn" data-a="age" data-id="16+" autofocus>I’m 16 or older</button><button class="btn" data-a="age" data-id="u16">I’m under 16</button></div>`);
  }
  function parentStep() {
    openModal(`<div class="eyebrow">Parental consent</div><h2 style="margin:6px 0 8px">Show this screen to a parent or legal guardian</h2>
      <p>Dear parent or guardian: this is an educational investing simulation with no real money. With your consent we will store your child’s nickname and learning progress in the cloud, show the nickname and rating in a shared league, and send learning answers to a language model for questions and scoring. We do not collect names, contact details, photos or dates of birth, show ads or use trackers. Details are in the <a href="#privacy" data-a="modal-close">Privacy Policy</a>. You can withdraw consent and delete the data on the My data page.</p>
      <label class="pop-row" style="margin-top:12px"><input type="checkbox" id="parentOk"> I am the parent or legal guardian and I consent</label>
      <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn" data-a="parent-later">Continue without cloud and AI</button><button class="btn" data-a="parent-yes">Confirm</button></div>`);
  }
  function placementQ() {
    const q = B.PLACEMENT[P.i];
    openModal(`<div class="row" style="flex-wrap:nowrap"><div class="prog" style="flex:1"><i style="width:${Math.round(P.i / B.PLACEMENT.length * 100)}%"></i></div><span class="mono faint" style="font-size:11px">${P.i + 1}/${B.PLACEMENT.length}</span></div>
      <div class="label" style="margin:16px 0 4px">${P.mode === 'post' ? 'Final check · the same 8 questions' : 'Placement check'}</div><h2 style="margin-bottom:12px">${esc(q.q)}</h2>
      ${q.o.map((o, i) => `<button class="opt" data-a="pl-pick" data-id="${i}">${esc(o)}</button>`).join('')}<button class="btn ghost sm" data-a="pl-pick" data-id="-1">I don’t know</button>`);
  }
  function placementDone() {
    if (P.mode === 'post') return postCheckDone();
    const axes = { basics: 0, risk: 0, analysis: 0, behavior: 0 }; B.PLACEMENT.forEach((q, i) => { if (P.ans[i] === q.a) axes[q.axis]++; });
    const total = Object.values(axes).reduce((a, b) => a + b, 0); const level = total >= 7 ? 'Associate' : total >= 5 ? 'Analyst' : 'Rookie';
    const firstPl = !S.placement; S.placement = { axes, total, level, at: todayStr() }; if (firstPl) addXp(10); save();
    const strong = Object.keys(axes).sort((a, b) => axes[b] - axes[a])[0], weak = Object.keys(axes).sort((a, b) => axes[a] - axes[b])[0];
    const names = { basics: 'Basics', risk: 'Risk and return', analysis: 'Analyzing companies', behavior: 'Investor psychology' };
    openModal(`<div class="eyebrow">Investor profile</div><h2 style="margin:6px 0">Level: ${level}</h2><p class="muted">${total} of ${B.PLACEMENT.length}. Strength: ${names[strong]}. Room to grow: ${names[weak]}.</p>
      <canvas id="plR" style="width:100%;height:220px;margin-top:8px"></canvas>
      <div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn" data-a="modal-close">Close</button><button class="btn primary" data-a="go-learn-close">Go to lessons</button></div>`);
    drawRadar($('#plR'), ['Basics', 'Risk', 'Analysis', 'Behavior'], [axes.basics / 2, axes.risk / 2, axes.analysis / 2, axes.behavior / 2], K().blue);
    if (isView('overview')) renderOverview(); if (isView('profile')) renderProfile();
  }

  function postCheckDone() {
    const axes = { basics: 0, risk: 0, analysis: 0, behavior: 0 }; B.PLACEMENT.forEach((q, i) => { if (P.ans[i] === q.a) axes[q.axis]++; });
    const total = Object.values(axes).reduce((a, b) => a + b, 0); const first = !S.postCheck;
    S.postCheck = { axes, total, at: todayStr() }; if (first) addXp(10); save(); pushBoard();
    const pre = S.placement ? S.placement.total : null; const n = B.PLACEMENT.length;
    openModal(`<div class="eyebrow">Final check</div><h2 style="margin:6px 0">${total} of ${n}</h2>
      ${pre != null ? `<p class="muted">Before: ${pre} of ${n}. Now: ${total} of ${n}. ${total > pre ? 'Up by ' + (total - pre) + ' ' + (total - pre === 1 ? 'question' : 'questions') + '.' : total === pre ? 'No change; take a look at the lessons below.' : 'Lower than at the start; review the lessons.'}</p>
        <div class="stack" style="gap:8px;margin-top:12px"><div><div class="label">Before</div><div class="bar" style="height:12px"><i style="width:${pre / n * 100}%;background:var(--faint)"></i></div></div><div><div class="label">After</div><div class="bar" style="height:12px"><i style="width:${total / n * 100}%"></i></div></div></div>`
      : '<p class="muted">You didn’t take the placement check, so there is nothing to compare. Your result is saved.</p>'}
      <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn" data-a="modal-close">Close</button><button class="btn primary" data-a="go-learn-close">Go to lessons</button></div>`);
    if (isView('profile')) renderProfile(); if (isView('overview')) renderOverview();
  }

  // ===================================================================
  // DOCS, MY DATA, CONSENT
  // ===================================================================
  const DOC_TITLES = { privacy: 'Privacy', terms: 'Terms', refunds: 'Refunds', cookies: 'Cookies and storage', 'my-data': 'My data', licenses: 'Licenses', access: 'Accessibility', company: 'Company details' };
  function renderDoc(id) {
    const el = $('#v-doc');
    const nav = `<nav class="docnav" aria-label="Documents">${DOCS.map(d => `<a class="btn sm ${d === id ? 'primary' : 'ghost'}" href="#${d}" ${d === id ? 'aria-current="page"' : ''}>${DOC_TITLES[d]}</a>`).join('')}</nav>`;
    if (id === 'my-data') { el.innerHTML = nav + myDataHtml(); return; }
    const pg = LEGAL.PAGES[id];
    el.innerHTML = nav + `<article class="panel doc"><div class="eyebrow">Document</div><h1 style="margin:6px 0 10px">${esc(pg.title)}</h1>${pg.html()}</article>`;
    $('#main').focus();
  }
  function myDataHtml() {
    const nCases = Object.keys(S.cases).length, nL = Object.keys(S.lessons).length;
    const yes = '<span class="chip ok">on</span>', no = '<span class="chip">off</span>';
    return `<article class="panel doc"><div class="eyebrow">My data</div><h1 style="margin:6px 0 10px">What is stored about you and how to delete it</h1>
      <table class="tbl"><tr><td class="l">Nickname</td><td class="l">${S.nick ? esc(S.nick) : '—'}</td></tr>
      <tr><td class="l">Avatar</td><td class="l">${avatarHtml(S.avatar, 24)} set #${(S.avatar | 0) + 1}</td></tr>
      <tr><td class="l">Name and goal</td><td class="l">${S.profile && S.profile.name ? esc(S.profile.name) : '—'} · ${S.profile && S.profile.goal ? esc(S.profile.goal) : '—'}</td></tr>
      <tr><td class="l">Theme</td><td class="l">${{ light: 'light', dark: 'dark', system: 'system' }[themePref()]}</td></tr>
      <tr><td class="l">Age group</td><td class="l">${S.age ? (S.age.band === '16+' ? '16+' : 'under 16' + (S.age.parent ? ', parental consent received' : ', without parental consent')) : 'not set'}</td></tr>
      <tr><td class="l">Learning progress</td><td class="l">cases ${nCases}, lessons ${nL}, defenses ${S.defenses}, XP ${S.xp}</td></tr>
      <tr><td class="l">On this device</td><td class="l">${CONSENT && CONSENT.functional ? yes : no}</td></tr>
      <tr><td class="l">In the cloud and league</td><td class="l">${cloudOk() ? yes : no}${CAP.db ? '' : ' <span class="faint">(cloud is not available in this view)</span>'}</td></tr>
      <tr><td class="l">AI features</td><td class="l">${aiOk() ? yes : no}</td></tr></table>
      <div class="row" style="margin-top:12px"><button class="btn" data-a="consent-settings">Change consent</button>${S.age && S.age.band === 'u16' && !S.age.parent ? '<button class="btn" data-a="parent-again">Get parental consent</button>' : ''}${!S.age ? '<button class="btn" data-a="age-again">Set age</button>' : ''}</div>
      <h3>Edit profile</h3><p class="muted">Change your nickname, avatar, name and goal in your <a href="#profile">profile</a>.</p>
      <h3>Download a copy</h3><p class="muted">All your data as JSON. Copy and save it.</p><div class="row"><button class="btn" data-a="export">Show my data</button></div><div id="exportBox"></div>
      <h3>Delete data</h3><p class="muted">Deletion happens immediately and doesn’t require contacting the operator.</p>
      <div class="row"><button class="btn" data-a="del" data-id="local">Delete from this device</button><button class="btn" data-a="del" data-id="cloud" ${CAP.db && CAP.uid ? '' : 'disabled'}>Delete from cloud and league</button><button class="btn" data-a="del" data-id="all">Delete everything and start over</button></div>
      <h3>Request to the operator</h3><p class="muted">If something can’t be deleted on your own: ${LEGAL.COMPANY.email ? '<a href="mailto:' + esc(LEGAL.COMPANY.email) + '">' + esc(LEGAL.COMPANY.email) + '</a> (' + esc(LEGAL.COMPANY.email) + ')' : 'the operator’s contact will be listed under Company details.'}</p></article>`;
  }
  async function deleteCloud() {
    if (!CAP.db || !CAP.uid) return true;
    try {
      await CAP.db.collection('data/users/' + CAP.uid).doc('state').delete();
      await CAP.db.collection('leaderboard').doc(CAP.uid).delete();
      for (const j of (S.joined || [])) { try { const d = await CAP.db.doc('tournaments/' + j.code).get(); if (d.exists && d.data().createdBy === CAP.uid) await CAP.db.doc('tournaments/' + j.code).update({ createdBy: null }); } catch (e) { /* not owner */ } }
      return true;
    } catch (e) { toast('Could not delete cloud data (' + esc(e.code || 'error') + '). Please try again later.'); return false; }
  }
  async function doDelete(kind) {
    if (kind === 'local') { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } toast('Data on this device was deleted.' + (CONSENT && CONSENT.functional ? ' New progress will be saved again while “Save progress” is on.' : '')); }
    if (kind === 'cloud') { if (await deleteCloud()) { if (LG.unsub) { LG.unsub(); LG.unsub = null; } LG.rows = null; CONSENT = Object.assign({}, CONSENT, { cloud: false }); try { localStorage.setItem(CKEY, JSON.stringify(CONSENT)); } catch (e) { /* ignore */ } toast('Cloud data and your league entry were deleted. “Cloud and league” is now off.'); } }
    if (kind === 'all') { await deleteCloud(); try { localStorage.removeItem(KEY); localStorage.removeItem(CKEY); localStorage.removeItem(THEME_KEY); } catch (e) { /* ignore */ } docEl.removeAttribute('data-tx'); paintThemeBtn(); if (LG.unsub) { LG.unsub(); LG.unsub = null; } LG.rows = null; CONSENT = null; S = defaults(); R = null; setAI(); toast('All data deleted.'); closeModal(); go('overview'); showConsent(); onboard(); return; }
    closeModal(); if (location.hash === '#my-data') renderDoc('my-data');
  }
  function showConsent() {
    const el = $('#consent'); if (CONSENT) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<h2 style="font-size:15px">What we store</h2><p class="muted" style="font-size:13px;margin:4px 0 10px">No cookies, ads or analytics. With your consent we save progress on this device, sync it to the cloud for the league, and send learning answers to AI. Details: <a href="#cookies">Cookies and storage</a>, <a href="#privacy">Privacy</a>.</p>
      <div class="row"><button class="btn" data-a="consent-all">Allow all</button><button class="btn" data-a="consent-min">Necessary only</button><button class="btn" data-a="consent-settings">Choose</button></div>`;
  }
  function consentSettings() {
    const c = CONSENT || { functional: false, cloud: false, ai: false }; const minor = !ageOk();
    const row = (k, title, text, dis) => `<div class="switch"><label for="cs-${k}"><b>${title}</b><br><span class="muted" style="font-size:12.5px">${text}</span></label><span class="sw"><input type="checkbox" id="cs-${k}" ${c[k] || k === 'nec' ? 'checked' : ''} ${dis ? 'disabled' : ''}><span class="tr"></span></span></div>`;
    openModal(`<div class="eyebrow">Consent settings</div><h2 style="margin:6px 0 10px">Choose what you allow</h2>
      ${row('nec', 'Necessary', 'We only remember your consent choices. Can’t be turned off.', true)}
      ${row('functional', 'Save progress', 'Portfolios, theses, lessons and chart settings in this browser.')}
      ${row('cloud', 'Cloud and league', minor ? 'Requires age 16+ or a parent’s consent (on the My data page).' : 'Sync across devices; your nickname and rating appear in the shared league.', minor)}
      ${row('ai', 'AI features', minor ? 'Requires age 16+ or a parent’s consent.' : 'Your thesis and answers are sent to the Claude language model for questions and scoring. Without this, offline mode.', minor)}
      <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn" data-a="consent-min">Necessary only</button><button class="btn" data-a="consent-save">Save choices</button></div>`);
  }
  function applyConsent(c) {
    const old = CONSENT; CONSENT = { v: 1, functional: !!c.functional, cloud: !!c.cloud, ai: !!c.ai, at: new Date().toISOString() };
    try { localStorage.setItem(CKEY, JSON.stringify(CONSENT)); } catch (e) { /* ignore */ }
    if (!CONSENT.functional) { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } } else save();
    if (!CONSENT.cloud && LG.unsub) { LG.unsub(); LG.unsub = null; LG.rows = null; }
    setAI(); showConsent(); if ($('#cs-functional')) closeModal();
    if (cloudOk() && !(old && old.cloud)) syncCloud();
    const keep = $('#modal').classList.contains('on'); if (!keep) route(); else if (isView('league')) renderLeague();
  }

  // ---------- command palette (Ctrl+K) ----------
  let PAL_ITEMS = [], PAL_SEL = 0;
  function palItems() {
    const out = [];
    [['overview', 'Overview'], ['terminal', 'Terminal'], ['boardroom', 'Boardroom'], ['league', 'League'], ['learn', 'Learn'], ['profile', 'Profile']].forEach(([v, n]) => out.push({ t: 'Go to: ' + n, k: 'section', run: () => go(v) }));
    out.push({ t: 'Theme: ' + (isDark() ? 'light' : 'dark'), k: 'view', run: () => setTheme(isDark() ? 'light' : 'dark') });
    B.CASES.concat(S.customCases).forEach(c => out.push({ t: 'Case: ' + c.title, k: c.level, run: () => openCase(c.id) }));
    B.UNITS.forEach(u => u.lessons.forEach(l => out.push({ t: 'Lesson: ' + l.title, k: u.title, run: () => startLesson(l.id) })));
    if (S.activeCase) BRChart.TOOLS.forEach(tl => out.push({ t: 'Drawing: ' + tl.name, k: 'chart', run: () => { go('terminal'); setTimeout(() => { if (T.eng) { T.eng.setTool(tl.key); T.tool = tl.key; refreshSelUI(); } }, 60); } }));
    DOCS.forEach(d => out.push({ t: 'Document: ' + DOC_TITLES[d], k: 'document', run: () => go(d) }));
    out.push({ t: 'Consent settings', k: 'data', run: consentSettings });
    return out;
  }
  function openPalette() {
    const p = $('#palette'); PAL_ITEMS = palItems(); PAL_SEL = 0; lastFocus = document.activeElement;
    p.innerHTML = `<div class="box" role="dialog" aria-label="Command palette"><input type="text" id="palQ" role="combobox" aria-expanded="true" aria-controls="palList" aria-autocomplete="list" placeholder="Where to go or what to do…" autocomplete="off"><ul id="palList" role="listbox"></ul></div>`;
    p.classList.add('on'); drawPalette(''); $('#palQ').focus();
  }
  function drawPalette(q) {
    q = q.toLowerCase(); const list = PAL_ITEMS.filter(x => !q || x.t.toLowerCase().indexOf(q) >= 0).slice(0, 40); PAL_SEL = Math.min(PAL_SEL, Math.max(0, list.length - 1));
    $('#palList').innerHTML = list.map((x, i) => `<li role="option" id="po-${i}" aria-selected="${i === PAL_SEL}" data-pi="${PAL_ITEMS.indexOf(x)}">${esc(x.t)}<span class="k">${esc(x.k)}</span></li>`).join('') || '<li aria-disabled="true">Nothing found</li>';
    $('#palQ').setAttribute('aria-activedescendant', 'po-' + PAL_SEL); const el = $('#po-' + PAL_SEL); if (el) el.scrollIntoView({ block: 'nearest' });
  }
  function closePalette() { $('#palette').classList.remove('on'); $('#palette').innerHTML = ''; if (lastFocus && lastFocus.isConnected) lastFocus.focus(); }
  function runPalette(idx) { const it = PAL_ITEMS[idx]; closePalette(); if (it) it.run(); }
  async function syncCloud() {
    if (!CAP.db || !CAP.uid || !cloudOk()) return;
    try { const d = await CAP.db.collection('data/users/' + CAP.uid).doc('state').get(); if (d.exists) { const r = d.data(); if (r.savedAt > (S.savedAt || 0)) { S = Object.assign(defaults(), JSON.parse(r.json)); if (!S.chart) S.chart = chartDefaults(); if (CONSENT.functional) { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } } route(); if (S.onboarded && $('#modal').classList.contains('on') && !L && !P) closeModal(); } } } catch (e) { /* keep local */ }
    saveRemote(); if (isView('league')) renderLeague();
  }

  // ===================================================================
  // EVENTS
  // ===================================================================
  document.addEventListener('click', async ev => {
    if (T.pop && !ev.target.closest('.pop') && !ev.target.closest('[data-a="pop"]')) { T.pop = null; renderPop(); }
    if ($('#bellBtn').getAttribute('aria-expanded') === 'true' && !ev.target.closest('#bellPop') && !ev.target.closest('#bellBtn')) renderBell(false);
    const pli = ev.target.closest('#palList li[data-pi]'); if (pli) { runPalette(+pli.dataset.pi); return; }
    if (ev.target === $('#palette')) { closePalette(); return; }
    const btn = ev.target.closest('[data-a]'); if (!btn) { if (ev.target === $('#modal')) closeModal(); return; }
    const a = btn.dataset.a, id = btn.dataset.id;
    const c = S.activeCase && caseDef(S.activeCase), s = S.activeCase && S.cases[S.activeCase];
    switch (a) {
      case 'go-terminal': go('terminal'); break;
      case 'go-thesis': T.step = 'thesis'; go('terminal'); break;
      case 'go-board': if (s) { s.phase = s.phase === 'done' ? 'done' : 'thesis'; save(); } go('boardroom'); break;
      case 'go-cases': go('overview'); setTimeout(() => { const el = $('#caseLib'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 50); break;
      case 'go-league': go('league'); break;
      case 'open-case': closeModal(); R = null; T.step = null; openCase(id); break;
      case 'reset-case': delete S.cases[id]; if (S.activeCase === id) S.activeCase = null; save(); renderOverview(); break;
      case 'gen-case': {
        btn.disabled = true; btn.textContent = 'Generating…';
        try { const cs = await AI.generateCase(CAP.sample, $('#genLevel').value, ($('#genTheme').value || '').trim().slice(0, 80)); S.customCases.push(cs); if (S.customCases.length > 8) S.customCases.shift(); save(); toast('New case: ' + esc(cs.title)); }
        catch (e) { if (e && e.code === 'not_granted') setAI(null); toast('Could not generate a case. Please try again.'); }
        renderOverview(); break;
      }
      case 'step': if (id === 'defend') { go('boardroom'); break; } T.step = id; if (s && id === 'build' && s.phase === 'brief') { s.phase = 'build'; save(); } if (s && id === 'thesis' && s.phase === 'build') { s.phase = 'thesis'; save(); } renderTerminal(); break;
      case 'start-build': s.phase = 'build'; T.step = 'build'; save(); renderTerminal(); break;
      case 'pop': T.pop = T.pop === id ? null : id; T.popTab = 0; T.palOpen = false; renderPop(); break;
      case 'pop-close': T.pop = null; renderPop(); const pb = document.querySelector('[data-a="pop"]'); if (pb) pb.focus(); break;
      case 'pop-tab': T.popTab = +id; renderPop(); break;
      case 'ctype': S.chart.type = id; save(); renderCenter(c, s); break;
      case 'cint': S.chart.interval = id; save(); renderCenter(c, s); break;
      case 'pal-open': T.palOpen = !T.palOpen; renderPop(); break;
      case 'fav': { const f = S.chart.fav; const k = f.indexOf(id); if (k >= 0) f.splice(k, 1); else f.push(id); save(); $('#indList').innerHTML = indListHtml(); const sb = document.querySelector('[data-a="fav"][data-id="' + id + '"]'); if (sb) sb.focus(); break; }
      case 'add-ind': { if (S.chart.ind.length >= 8) { toast('No more than 8 indicators at once.'); break; } const d = BRChart.IND.find(x => x.key === id); if (d.pane && S.chart.ind.filter(x => BRChart.IND.find(z => z.key === x.key).pane).length >= 3) { toast('No more than 3 indicators in separate panes.'); break; } S.chart.ind.push({ key: id, params: {} }); save(); T.noFocus = true; renderCenter(c, s); break; }
      case 'rm-ind': S.chart.ind.splice(+id, 1); save(); renderCenter(c, s); break;
      case 'tool': T.pop = null; renderPop(); T.tool = id; if (T.eng) T.eng.setTool(id); refreshSelUI(); break;
      case 'dcolor': S.chart.color = id; save(); if (T.eng) T.eng.setColor(id); refreshSelUI(); if (T.pop === 'draw') { T.noFocus = true; renderPop(); } break;
      case 'ddel': if (T.eng) T.eng.removeSelected(); refreshSelUI(); break;
      case 'dclear': openModal(`<h2>Delete all drawings on ${T.ticker}?</h2><p class="muted" style="margin:6px 0 14px">Lines, channels and Fibonacci levels on this ticker will be deleted.</p><div class="row" style="justify-content:flex-end"><button class="btn" data-a="modal-close" autofocus>Cancel</button><button class="btn" data-a="dclear-yes">Delete</button></div>`); break;
      case 'dclear-yes': closeModal(); if (T.eng) T.eng.clearDrawings(); break;
      case 'z': if (T.eng) T.eng.zoomBy(id === 'in' ? 1.25 : 0.8); break;
      case 'zend': if (T.eng) T.eng.toEnd(); break;
      case 'consent-all': applyConsent({ functional: true, cloud: true, ai: true }); toast(ageOk() ? 'Consent saved.' : 'Save progress is on. Cloud and AI turn on after age confirmation or a parent’s consent.'); break;
      case 'consent-min': applyConsent({ functional: false, cloud: false, ai: false }); toast('We save only your choice. Progress lasts until you close the tab.'); break;
      case 'consent-settings': consentSettings(); break;
      case 'consent-save': applyConsent({ functional: $('#cs-functional').checked, cloud: $('#cs-cloud').checked, ai: $('#cs-ai').checked }); toast('Choice saved.'); break;
      case 'export': { const box = $('#exportBox'); const data = JSON.stringify({ exportedAt: new Date().toISOString(), consent: CONSENT, profile: S }, null, 2); box.innerHTML = `<label class="label" for="exportTa" style="display:block;margin-top:8px">My data (JSON)</label><textarea id="exportTa" rows="10" readonly style="font:11px var(--mono)">${esc(data)}</textarea><button class="btn sm" data-a="export-copy" style="margin-top:6px">Copy</button>`; break; }
      case 'export-copy': try { await navigator.clipboard.writeText($('#exportTa').value); toast('Copied.'); } catch (e) { $('#exportTa').select(); toast('Selected; press Ctrl+C.'); } break;
      case 'del': openModal(`<h2>${{ local: 'Delete data from this device?', cloud: 'Delete data from the cloud and league?', all: 'Delete everything and start over?' }[id]}</h2><p class="muted" style="margin:6px 0 14px">${{ local: 'Progress in this browser will be erased. A cloud copy, if any, stays.', cloud: 'Your cloud progress and your league row will be deleted. Progress in this browser stays.', all: 'Progress on this device, the cloud copy, your league entry and your consent choices will be deleted.' }[id]}</p><div class="row" style="justify-content:flex-end"><button class="btn" data-a="modal-close" autofocus>Cancel</button><button class="btn" data-a="del-yes" data-id="${id}">Delete</button></div>`); break;
      case 'del-yes': doDelete(id); break;
      case 'nick-save': { const n = ($('#nickEdit').value || '').trim().replace(/[<>]/g, ''); if (n.length < 2) { toast('Nickname must be at least 2 characters.'); break; } S.nick = n; save(); toast('Nickname updated.'); renderBadge(); break; }
      case 'age': S.age = { band: id, parent: false, at: new Date().toISOString().slice(0, 10) }; save(); if (id === 'u16') parentStep(); else { setAI(); syncCloud(); finishOnboard(); } break;
      case 'parent-yes': if (!$('#parentOk').checked) { toast('Check the consent box or continue without cloud and AI.'); break; } S.age.parent = true; S.age.parentAt = new Date().toISOString().slice(0, 10); save(); setAI(); syncCloud(); if (S.onboarded) { closeModal(); route(); } else finishOnboard(); break;
      case 'parent-later': if (S.onboarded) { closeModal(); route(); } else finishOnboard(); break;
      case 'parent-again': parentStep(); break;
      case 'age-again': ageStep(); break;
      case 'ob-later': closeModal(); break;
      case 'demo': seedDemo(); T.demo = true; renderBadge(); if (S.age) finishOnboard(); else ageStep(); break;
      case 'sort': T.sort = id; renderCenter(c, s); break;
      case 'pick': if (ev.target.closest('button[data-a="add-asset"]')) break; T.ticker = id; renderCenter(c, s); break;
      case 'add-asset': ev.stopPropagation(); if (!(id in s.target)) { const free = 1 - Object.values(s.target).reduce((x, y) => x + y, 0); s.target[id] = Math.max(0, Math.min(0.1, Math.round(free * 100) / 100)); } if (T.step === 'brief') T.step = 'build'; if (s.phase === 'brief') s.phase = 'build'; save(); renderTerminal(); break;
      case 'rm-asset': delete s.target[id]; save(); renderRight(c, s, 'build'); renderLeft(c, s); break;
      case 'even': { const k = Object.keys(s.target); k.forEach(t => { s.target[t] = Math.floor(1000 / k.length) / 1000; }); save(); renderRight(c, s, 'build'); renderLeft(c, s); break; }
      case 'exec': stopLive(); executeRebalance(c, s); renderTerminal(); break;
      case 'adv': stopLive(); advance(c, s, +id); renderTerminal(); break;
      case 'ask-client': askClient(c, s); break;
      case 'ins-metric': { const ta = document.activeElement && document.activeElement.tagName === 'TEXTAREA' ? document.activeElement : $('#th-fit'); const k = ta.dataset.th; s.thesis[k] = ((ta.value || '') + ' [' + id + ']').trim(); ta.value = s.thesis[k]; save(); break; }
      case 'board-start': boardStart(); break;
      case 'answer': boardAnswer(); break;
      case 'clarify': clarify(); break;
      case 'attach': { const ta = $('#ans'); const m = R.ctx.quant.m; ta.value = (ta.value + ' [vol ' + pct(m.vol) + ', Sharpe ' + m.sharpe.toFixed(2) + ', drawdown ' + pct(m.mdd) + ', N_eff ' + m.neff.toFixed(1) + ']').trim(); R.draft = ta.value; ta.focus(); break; }
      case 'show-verdict': R = { caseId: S.activeCase, stage: 'verdict', result: s.results[s.results.length - 1] }; drawRoom(); break;
      case 'revise': R = null; T.step = 'build'; if (s) { s.phase = 'build'; save(); } go('terminal'); break;
      case 'copy-result': { const r = R && R.result; if (!r) break; const txt = 'TradeX · ' + c.title + ': ' + Math.round(r.total) + '/100, rating ' + r.ratingTo; try { await navigator.clipboard.writeText(txt); toast('Copied.'); } catch (e) { toast(esc(txt)); } break; }
      case 'copy': try { await navigator.clipboard.writeText(id); toast('Code copied.'); } catch (e) { toast('Code: ' + esc(id)); } break;
      case 'lg-tab': LG.tab = id; renderLeague(); break;
      case 'tour-new': tourNewModal(); break;
      case 'tour-create': tourCreate(); break;
      case 'tour-join': tourJoin(); break;
      case 'pilot-copy': copyText(pilotSummary(id), 'Pilot summary copied.'); break;
      case 'pilot-csv': copyText(pilotCsv(id), 'Table copied; paste it into Excel or Google Sheets.'); break;
      case 'tour-open': LG.tourView = id; subscribeTour(id); renderLeague(); break;
      case 'tour-close': LG.tourView = null; renderLeague(); break;
      case 'lesson': startLesson(id); break;
      case 'l-pick': L.state.pick = +id; drawLesson(); break;
      case 'l-check': { const card = L.l.cards[L.queue[L.pos]]; if (card.type === 'choice') grade(L.state.pick === card.a); else if (card.type === 'slider') { const v = +$('#slider').value; L.state.v = v; grade(Math.abs(v - card.answer) <= card.tol); } break; }
      case 'l-swipe': grade(id === L.l.cards[L.queue[L.pos]].a); break;
      case 'l-ml': { const m = L.state.m; if (m.done.indexOf(+id) < 0) { m.sel = +id; drawLesson(); } break; }
      case 'l-mr': { const m = L.state.m; const card = L.l.cards[L.queue[L.pos]]; if (m.sel == null || m.done.indexOf(+id) >= 0) break; if (m.sel === +id) { m.done.push(+id); m.sel = null; if (m.done.length === card.pairs.length) { L.state.miss ? grade(false) : grade(true); return; } } else { L.state.miss = true; toast('Not a match; try again.'); m.sel = null; } drawLesson(); break; }
      case 'l-next': lessonNext(); break;
      case 'l-explain': { btn.disabled = true; btn.textContent = 'Explaining…'; try { const t = await AI.explain(L.l.cards[L.queue[L.pos]], CAP.sample); if (t) { L.state.alt = t; if (L.l.cards[L.queue[L.pos]].type === 'concept') { L.state.done = true; } drawLesson(); } } catch (e) { if (e && e.code === 'not_granted') setAI(null); toast('AI is not available right now.'); btn.disabled = false; } break; }
      case 'apply-case': closeModal(); go(S.activeCase ? 'terminal' : 'overview'); break;
      case 'onboard': onboard(); break;
      case 'ob-next': { const n = ($('#nick').value || '').trim().replace(/[<>]/g, ''); if (n.length < 2) { toast('Nickname must be at least 2 characters.'); $('#nick').focus(); return; } S.nick = n; S.avatar = T.obAv | 0; save(); renderBadge(); if (S.age) finishOnboard(); else ageStep(); break; }
      case 'av-pick': { const v = +id; if ($('#modal').classList.contains('on')) T.obAv = v; else T.avSel = v; document.querySelectorAll('[data-a="av-pick"]').forEach(b => b.setAttribute('aria-checked', String(+b.dataset.id === v))); break; }
      case 'placement': P = { i: 0, ans: [], mode: 'pre' }; placementQ(); break;
      case 'fb': setFb({ u: +id }); { const b = document.querySelector('[data-a="fb"][data-id="' + id + '"]'); if (b) b.focus(); } break;
      case 'fb-rec': setFb({ rec: id === '1' }); { const b = document.querySelector('[data-a="fb-rec"][data-id="' + id + '"]'); if (b) b.focus(); } break;
      case 'postcheck': P = { i: 0, ans: [], mode: 'post' }; placementQ(); break;
      case 'go-learn-close': closeModal(); go('learn'); break;
      case 'go-terminal-close': closeModal(); go('terminal'); break;
      case 'go-board-close': closeModal(); go('boardroom'); break;
      case 'theme': setTheme(isDark() ? 'light' : 'dark'); break;
      case 'side-collapse': document.body.classList.toggle('side-mini'); btn.setAttribute('aria-label', document.body.classList.contains('side-mini') ? 'Expand sidebar' : 'Collapse sidebar'); setTimeout(moveGlider, 320); break;
      case 'side-open': document.body.classList.toggle('side-open'); break;
      case 'cmdk': openPalette(); break;
      case 'bell': renderBell($('#bellBtn').getAttribute('aria-expanded') !== 'true'); break;
      case 'theme-set': setTheme(id); if (isView('profile')) renderProfile(); break;
      case 'pf-save': {
        const n = ($('#pfNick').value || '').trim().replace(/[<>]/g, ''); if (n.length < 2) { toast('Nickname must be at least 2 characters.'); $('#pfNick').focus(); break; }
        S.nick = n; S.profile = { name: ($('#pfName').value || '').trim().replace(/[<>]/g, '').slice(0, 40), goal: $('#pfGoal').value };
        if (T.avSel != null) S.avatar = T.avSel; save(); renderBadge(); toast('Profile saved.' + (CONSENT && CONSENT.functional ? '' : ' Right now it lasts until you close the tab; turn on “Save progress” to keep it.')); renderProfile(); break; }
      case 'live': { const c2 = caseDef(S.activeCase), s2 = c2 && S.cases[S.activeCase]; if (!s2) break; if (LIVE.on) stopLive(); else startLive(); renderCenter(c2, s2); const lb = document.querySelector('[data-a="live"]'); if (lb) lb.focus(); break; }
      case 'live-speed': { LIVE.ms = +id; if (LIVE.on) { clearInterval(LIVE.timer); LIVE.timer = setInterval(liveTick, LIVE.ms); } const c2 = caseDef(S.activeCase), s2 = c2 && S.cases[S.activeCase]; if (s2) { renderCenter(c2, s2); const sb = document.querySelector('[data-a="live-speed"][data-id="' + id + '"]'); if (sb) sb.focus(); } break; }
      case 'pl-pick': P.ans[P.i] = +id; P.i++; if (P.i >= B.PLACEMENT.length) placementDone(); else placementQ(); break;
      case 'modal-close': closeModal(); if (L) L = null; break;
    }
  });
  document.addEventListener('input', ev => {
    const t = ev.target; const s = S.activeCase && S.cases[S.activeCase]; const c = S.activeCase && caseDef(S.activeCase);
    if (t.dataset.w || t.dataset.wn) {
      const k = t.dataset.w || t.dataset.wn; const v = B.clamp(+t.value || 0, 0, 100) / 100; s.target[k] = v;
      const sib = t.dataset.w ? document.querySelector('[data-wn="' + k + '"]') : document.querySelector('[data-w="' + k + '"]'); if (sib) sib.value = Math.round(v * 100);
      clearTimeout(T.rt); T.rt = setTimeout(() => { save(); renderRight(c, s, 'build'); renderLeft(c, s); const f = document.querySelector('[data-' + (t.dataset.w ? 'w' : 'wn') + '="' + k + '"]'); if (f && t.dataset.wn) { f.focus(); } }, t.dataset.w ? 250 : 600);
    }
    if (t.dataset.th) { s.thesis[t.dataset.th] = t.value.slice(0, 2500); const wc = $('#wc-' + t.dataset.th); if (wc) wc.textContent = t.value.trim().split(/\s+/).filter(Boolean).length + ' w.'; clearTimeout(T.tt); T.tt = setTimeout(() => { save(); const btn = document.querySelector('[data-a="go-board"]'); if (btn) btn.disabled = !(['strategy', 'fit', 'risks', 'plan'].every(k => (s.thesis[k] || '').trim().length >= 15) && Object.keys(s.holdings).length); }, 400); }
    if (t.id === 'slider') { const card = L.l.cards[L.queue[L.pos]]; L.state.v = +t.value; $('#slv').textContent = card.unit === '$' ? '$' + Number(t.value).toLocaleString('en-US') : t.value; }
    if (t.id === 'ans' && R) R.draft = t.value;
    if (t.id === 'indQ') { T.indQ = t.value; $('#indList').innerHTML = indListHtml(); }
    if (t.id === 'palQ') { PAL_SEL = 0; drawPalette(t.value); }
    if (t.dataset.ip) { const [i, k] = t.dataset.ip.split(':'); const ind = S.chart.ind[+i]; if (ind && t.value !== '' && isFinite(+t.value)) { ind.params = ind.params || {}; ind.params[k] = +t.value; clearTimeout(T.it); T.it = setTimeout(() => { save(); if (T.eng) T.eng.update({ indicators: S.chart.ind }); }, 400); } }
  });
  document.addEventListener('change', ev => { const t = ev.target; if (t.dataset.ct) { S.chart[t.dataset.ct] = t.checked; save(); T.noFocus = true; renderCenter(caseDef(S.activeCase), S.cases[S.activeCase]); const f = document.querySelector('[data-ct="' + t.dataset.ct + '"]'); if (f) f.focus(); return; } if (t.dataset.pal) { S.chart.palette = t.dataset.pal; save(); T.noFocus = true; renderCenter(caseDef(S.activeCase), S.cases[S.activeCase]); const f = document.querySelector('[data-pal="' + t.dataset.pal + '"]'); if (f) f.focus(); return; } if (ev.target.id === 'tickSel') { T.ticker = ev.target.value; const s = S.cases[S.activeCase]; renderCenter(caseDef(S.activeCase), s); } });
  document.addEventListener('keydown', ev => {
    if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'k' || ev.key === 'K' || ev.key === 'л' || ev.key === 'Л')) { ev.preventDefault(); if ($('#palette').classList.contains('on')) closePalette(); else openPalette(); return; }
    if ($('#palette').classList.contains('on')) {
      const n = $('#palList').querySelectorAll('li[data-pi]').length;
      if (ev.key === 'Escape') { closePalette(); return; }
      if (ev.key === 'ArrowDown') { ev.preventDefault(); PAL_SEL = (PAL_SEL + 1) % Math.max(1, n); drawPalette($('#palQ').value); return; }
      if (ev.key === 'ArrowUp') { ev.preventDefault(); PAL_SEL = (PAL_SEL - 1 + n) % Math.max(1, n); drawPalette($('#palQ').value); return; }
      if (ev.key === 'Enter') { ev.preventDefault(); const li = $('#po-' + PAL_SEL); if (li) runPalette(+li.dataset.pi); return; }
      return;
    }
    if (ev.key === 'Escape' && $('#bellBtn').getAttribute('aria-expanded') === 'true') { renderBell(false); $('#bellBtn').focus(); return; }
    if (ev.key === 'Escape' && T.pop) { T.pop = null; renderPop(); const b = document.querySelector('[data-a="pop"]'); if (b) b.focus(); return; }
    if (ev.key === 'Tab' && $('#modal').classList.contains('on')) { const f = Array.from($('#modalBox').querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), textarea, select, [tabindex="0"]')); if (f.length) { const first = f[0], last = f[f.length - 1]; if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); } else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); } } }
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('[data-a][tabindex]:not(button):not(a):not(input)')) { ev.preventDefault(); ev.target.click(); return; }
    if (ev.key === 'Escape' && $('#modal').classList.contains('on')) { closeModal(); L = null; }
    if (L && L.l && $('#modal').classList.contains('on')) { const card = L.l.cards[L.queue[L.pos]]; if (card && card.type === 'swipe' && !L.state.done && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight')) grade((ev.key === 'ArrowLeft' ? 'left' : 'right') === card.a); }
    if (ev.key === 'Enter' && ev.target.id === 'askInput') { askClient(caseDef(S.activeCase), S.cases[S.activeCase]); }
    if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey) && ev.target.id === 'ans') boardAnswer();
  });

  // ---------- capability boot ----------
  function setAI(sample) { if (sample !== undefined) CAP.rawSample = sample; CAP.sample = aiOk() ? (CAP.rawSample || null) : null; $('#aiDot').className = 'dot' + (CAP.sample ? '' : ' off'); $('#aiStatus').textContent = CAP.sample ? 'AI board: online' : CAP.rawSample ? 'AI: off in consent settings' : 'AI: offline mode'; }
  async function boot() {
    if (!S.onboarded && !location.hash) history.replaceState(null, '', '#about');
    paintThemeBtn(); route(); showConsent();
    if (!S.onboarded && !isView('about')) onboard();
    const cl = window.claude;
    if (!cl || typeof cl.use !== 'function') { setAI(null); return; }
    cl.use('sample').then(sm => { setAI(sm || null); if (isView('overview')) renderOverview(); }).catch(() => setAI(null));
    try {
      const [db, user] = await Promise.all([cl.use('db').catch(() => null), cl.use('user').catch(() => null)]);
      CAP.user = user; CAP.uid = user ? await user.id() : null;
      if (user && typeof user.can === 'function') { try { const cw = await user.can('data.write'); if (cw === false) CAP.canWrite = false; } catch (e) { /* unknown */ } }
      if (db && CAP.uid) { CAP.db = db; await syncCloud(); }
    } catch (e) { /* run offline */ }
  }
  boot();
})();
