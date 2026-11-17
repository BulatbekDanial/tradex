/* TradeX — core: simulated market, cases, metrics, scoring, lessons. */
(function () {
  'use strict';

  // ---------- RNG ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeNormal(rand) {
    let spare = null;
    return function () {
      if (spare !== null) { const s = spare; spare = null; return s; }
      let u = 0, v = 0;
      while (u === 0) u = rand();
      while (v === 0) v = rand();
      const r = Math.sqrt(-2 * Math.log(u));
      spare = r * Math.sin(2 * Math.PI * v);
      return r * Math.cos(2 * Math.PI * v);
    };
  }

  // ---------- Calendar ----------
  const HIST = 504;          // visible history before a case starts (~2 years)
  const REPLAY = 252;        // one simulated year of replay
  const N = HIST + REPLAY;
  const START = HIST;        // index of case start day
  const dates = [];
  (function buildDates() {
    const d = new Date(Date.UTC(2031, 0, 6)); // scenario calendar lies in the future on purpose: prices are not real history
    while (dates.length < N) {
      const wd = d.getUTCDay();
      if (wd !== 0 && wd !== 6) dates.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
  })();

  // ---------- Universe ----------
  const SECTORS = {
    tech: 'Technology', fin: 'Financials', health: 'Healthcare', energy: 'Oil & gas',
    cons: 'Consumer', ind: 'Industrials & airlines', util: 'Utilities & renewables', mat: 'Materials & mining', tel: 'Telecom',
    etf: 'Equity funds (ETF)', bond: 'Bonds', gold: 'Gold', cash: 'Money market'
  };
  // Real issuers and funds; prices, multiples and ESG scores are SCENARIO values for learning.
  // ccy: price currency. eu: loading on the European market factor. beta: global market loading.
  const ASSETS = [
    { t: 'AAPL', n: 'Apple', ex: 'Nasdaq', ccy: 'USD', p0: 220, s: 'tech', type: 'stock', beta: 1.1, eu: 0, vol: 0.013, mu: 0.0005, rate: 1.0, pe: 30, div: 0.5, esg: 66, d: 'Phones, computers and services.' },
    { t: 'MSFT', n: 'Microsoft', ex: 'Nasdaq', ccy: 'USD', p0: 430, s: 'tech', type: 'stock', beta: 1.0, eu: 0, vol: 0.012, mu: 0.0005, rate: 1.0, pe: 33, div: 0.8, esg: 72, d: 'Software, cloud and AI.' },
    { t: 'NVDA', n: 'NVIDIA', ex: 'Nasdaq', ccy: 'USD', p0: 140, s: 'tech', type: 'stock', beta: 1.6, eu: 0, vol: 0.025, mu: 0.0007, rate: 1.4, pe: 45, div: 0.0, esg: 64, d: 'Graphics and AI chips. Very volatile.' },
    { t: 'AMZN', n: 'Amazon', ex: 'Nasdaq', ccy: 'USD', p0: 200, s: 'cons', type: 'stock', beta: 1.2, eu: 0, vol: 0.017, mu: 0.0005, rate: 1.2, pe: 38, div: 0.0, esg: 58, d: 'E-commerce and AWS cloud.' },
    { t: 'TSLA', n: 'Tesla', ex: 'Nasdaq', ccy: 'USD', p0: 300, s: 'cons', type: 'stock', beta: 1.7, eu: 0, vol: 0.030, mu: 0.0005, rate: 1.5, pe: 70, div: 0.0, esg: 60, d: 'Electric cars and energy storage. Extreme volatility.' },
    { t: 'JPM', n: 'JPMorgan Chase', ex: 'NYSE', ccy: 'USD', p0: 240, s: 'fin', type: 'stock', beta: 1.1, eu: 0, vol: 0.012, mu: 0.0004, rate: -0.3, pe: 12, div: 2.3, esg: 60, d: 'Largest U.S. bank.' },
    { t: 'V', n: 'Visa', ex: 'NYSE', ccy: 'USD', p0: 300, s: 'fin', type: 'stock', beta: 1.0, eu: 0, vol: 0.012, mu: 0.0005, rate: 0.5, pe: 30, div: 0.8, esg: 66, d: 'Global card payments network.' },
    { t: 'JNJ', n: 'Johnson & Johnson', ex: 'NYSE', ccy: 'USD', p0: 160, s: 'health', type: 'stock', beta: 0.6, eu: 0, vol: 0.009, mu: 0.0003, rate: 0.3, pe: 15, div: 3.1, esg: 70, d: 'Drugs and medical devices. Defensive sector.' },
    { t: 'KO', n: 'Coca-Cola', ex: 'NYSE', ccy: 'USD', p0: 65, s: 'cons', type: 'stock', beta: 0.6, eu: 0, vol: 0.008, mu: 0.0003, rate: 0.3, pe: 23, div: 3.0, esg: 64, d: 'Beverages. Steady demand in any economy.' },
    { t: 'XOM', n: 'ExxonMobil', ex: 'NYSE', ccy: 'USD', p0: 110, s: 'energy', type: 'stock', beta: 0.9, eu: 0, vol: 0.015, mu: 0.0003, rate: -0.1, pe: 13, div: 3.5, esg: 30, fossil: true, d: 'Oil and gas. High dividend, low ESG.' },
    { t: 'NEE', n: 'NextEra Energy', ex: 'NYSE', ccy: 'USD', p0: 70, s: 'util', type: 'stock', beta: 0.6, eu: 0, vol: 0.012, mu: 0.0003, rate: 1.3, pe: 20, div: 3.0, esg: 82, d: 'Utility with a large wind and solar fleet.' },
    { t: 'CCJ', n: 'Cameco', ex: 'NYSE', ccy: 'USD', p0: 55, s: 'mat', type: 'stock', beta: 0.9, eu: 0, vol: 0.022, mu: 0.0004, rate: 0.2, pe: 40, div: 0.2, esg: 55, d: 'Uranium miner. A contested topic for ESG mandates.' },
    { t: 'ASML', n: 'ASML Holding', ex: 'Euronext Amsterdam', ccy: 'EUR', p0: 700, s: 'tech', type: 'stock', beta: 1.3, eu: 0.8, vol: 0.020, mu: 0.0006, rate: 1.2, pe: 35, div: 0.9, esg: 74, d: 'Lithography machines every advanced chip maker needs.' },
    { t: 'SAP', n: 'SAP', ex: 'Xetra', ccy: 'EUR', p0: 230, s: 'tech', type: 'stock', beta: 1.0, eu: 0.8, vol: 0.014, mu: 0.0005, rate: 1.0, pe: 40, div: 1.0, esg: 76, d: 'Business software and cloud.' },
    { t: 'MC', n: 'LVMH', ex: 'Euronext Paris', ccy: 'EUR', p0: 650, s: 'cons', type: 'stock', beta: 1.1, eu: 0.9, vol: 0.016, mu: 0.0004, rate: 0.8, pe: 24, div: 2.0, esg: 62, d: 'Luxury goods: fashion, jewelry, wine and spirits.' },
    { t: 'SAN', n: 'Sanofi', ex: 'Euronext Paris', ccy: 'EUR', p0: 95, s: 'health', type: 'stock', beta: 0.6, eu: 0.7, vol: 0.010, mu: 0.0003, rate: 0.3, pe: 13, div: 4.0, esg: 70, d: 'Pharmaceuticals and vaccines.' },
    { t: 'ALV', n: 'Allianz', ex: 'Xetra', ccy: 'EUR', p0: 300, s: 'fin', type: 'stock', beta: 0.9, eu: 1.0, vol: 0.012, mu: 0.0004, rate: -0.3, pe: 12, div: 5.0, esg: 66, d: 'Insurance and asset management.' },
    { t: 'BNP', n: 'BNP Paribas', ex: 'Euronext Paris', ccy: 'EUR', p0: 65, s: 'fin', type: 'stock', beta: 1.1, eu: 1.1, vol: 0.016, mu: 0.0004, rate: -0.4, pe: 7, div: 7.0, esg: 60, d: 'One of the largest banks in the euro area.' },
    { t: 'TTE', n: 'TotalEnergies', ex: 'Euronext Paris', ccy: 'EUR', p0: 60, s: 'energy', type: 'stock', beta: 0.8, eu: 0.8, vol: 0.014, mu: 0.0003, rate: -0.1, pe: 8, div: 5.5, esg: 38, fossil: true, d: 'Oil, gas and a growing power business.' },
    { t: 'SIE', n: 'Siemens', ex: 'Xetra', ccy: 'EUR', p0: 200, s: 'ind', type: 'stock', beta: 1.1, eu: 1.0, vol: 0.014, mu: 0.0004, rate: 0.6, pe: 18, div: 2.6, esg: 70, d: 'Factory automation, rail and smart buildings.' },
    { t: 'LHA', n: 'Lufthansa', ex: 'Xetra', ccy: 'EUR', p0: 7, s: 'ind', type: 'stock', beta: 1.2, eu: 1.0, vol: 0.019, mu: 0.0002, rate: 0.5, pe: 6, div: 3.0, esg: 42, crash: 1.6, d: 'Airline group. Falls hard in crises.' },
    { t: 'IBE', n: 'Iberdrola', ex: 'BME Madrid', ccy: 'EUR', p0: 13, s: 'util', type: 'stock', beta: 0.5, eu: 0.7, vol: 0.010, mu: 0.0003, rate: 1.0, pe: 17, div: 4.0, esg: 80, d: 'Power grids and one of the largest renewable fleets.' },
    { t: 'DTE', n: 'Deutsche Telekom', ex: 'Xetra', ccy: 'EUR', p0: 30, s: 'tel', type: 'stock', beta: 0.5, eu: 0.8, vol: 0.010, mu: 0.0003, rate: 0.4, pe: 15, div: 3.0, esg: 68, d: 'Mobile and broadband in Europe; owns most of T-Mobile US.' },
    { t: 'BAS', n: 'BASF', ex: 'Xetra', ccy: 'EUR', p0: 48, s: 'mat', type: 'stock', beta: 0.9, eu: 0.9, vol: 0.015, mu: 0.0002, rate: 0.2, pe: 14, div: 6.5, esg: 50, d: 'Chemicals. Sensitive to energy prices and the economy.' },
    { t: 'SPY', n: 'SPDR S&P 500 ETF', ex: 'NYSE Arca', ccy: 'USD', p0: 600, s: 'etf', type: 'etf', beta: 1.0, eu: 0, vol: 0.0015, mu: 0.0, rate: 0.6, pe: 22, div: 1.3, esg: 60, d: 'Fund of the 500 largest U.S. companies. Default benchmark.' },
    { t: 'IEMG', n: 'iShares Core MSCI Emerging Markets', ex: 'NYSE Arca', ccy: 'USD', p0: 58, s: 'etf', type: 'etf', beta: 1.1, eu: 0.1, vol: 0.006, mu: 0.0001, rate: 0.8, pe: 13, div: 2.6, esg: 52, d: 'Emerging-market stocks.' },
    { t: 'ESGU', n: 'iShares ESG Aware MSCI USA', ex: 'Nasdaq', ccy: 'USD', p0: 130, s: 'etf', type: 'etf', beta: 0.95, eu: 0, vol: 0.003, mu: 0.0001, rate: 0.9, pe: 23, div: 1.2, esg: 80, d: 'U.S. stocks screened on ESG criteria.' },
    { t: 'AGG', n: 'iShares Core U.S. Aggregate Bond', ex: 'NYSE Arca', ccy: 'USD', p0: 98, s: 'bond', type: 'etf', beta: 0.05, eu: 0, vol: 0.0028, mu: 0.00012, rate: 2.2, pe: null, div: 3.8, esg: 65, d: 'Investment-grade U.S. bonds, duration about 6 years.' },
    { t: 'EGOV', n: 'Euro area government bonds (basket)', ex: 'Euro bond market', ccy: 'EUR', p0: 100, s: 'bond', type: 'etf', beta: 0.02, eu: 0.15, vol: 0.0025, mu: 0.0001, rate: 2.0, pe: null, div: 2.8, esg: 62, d: 'Basket of German, French, Dutch and Spanish government bonds. Currency risk for a dollar investor.' },
    { t: 'GLD', n: 'SPDR Gold Shares', ex: 'NYSE Arca', ccy: 'USD', p0: 300, s: 'gold', type: 'etf', beta: 0.05, eu: 0, vol: 0.009, mu: 0.0002, rate: 0.6, pe: null, div: 0.0, esg: 50, d: 'Physical gold. Crisis protection, no income.' },
    { t: 'SGOV', n: 'iShares 0-3 Month Treasury Bond', ex: 'NYSE Arca', ccy: 'USD', p0: 100, s: 'cash', type: 'etf', beta: 0, eu: 0, vol: 0.0002, mu: 0.00016, rate: 0, pe: null, div: 0.0, esg: 70, d: 'Short-term U.S. Treasury bills. Almost cash, with a yield.' }
  ];
  const BY = {}; ASSETS.forEach(a => { BY[a.t] = a; });

  // ---------- Regimes ----------
  function regime(i) {
    // returns {mu, vm (vol multiplier), rate (daily rate shock), crash (0/1)}
    if (i >= 300 && i <= 325) return { mu: -0.0085, vm: 2.2, rate: 0, crash: 1, name: 'history-shock' };
    if (i > 325 && i <= 380) return { mu: 0.0013, vm: 1.3, rate: 0, crash: 0 };
    const r = i - START;
    if (r >= 20 && r <= 32) return { mu: -0.0006, vm: 1.3, rate: 0.0016, crash: 0 };
    if (r >= 70 && r <= 92) return { mu: -0.0105, vm: 2.7, rate: -0.0004, crash: 1 };
    if (r > 92 && r <= 160) return { mu: 0.0036, vm: 1.4, rate: -0.0005, crash: 0 };
    if (r > 160) return { mu: 0.0009, vm: 1, rate: 0, crash: 0 };
    return { mu: 0.00045, vm: 1, rate: 0, crash: 0 };
  }

  // ---------- Generate market ----------
  const MKT_VOL = 0.0085, SECT_VOL = 0.005, EU_VOL = 0.006;
  const series = {};      // t -> {o,h,l,c,v} arrays in the asset's own currency
  const rets = {};        // t -> total daily return in USD (price + dividend + FX)
  const pret = {};        // local price return
  const fx = new Float64Array(N); // EUR per 1 USD (EUR/USD shown in the UI is 1/fx)
  (function generate() {
    const rand = mulberry32(20261031);
    const nrm = makeNormal(rand);
    const mkt = new Float64Array(N), euf = new Float64Array(N);
    const sect = {};
    Object.keys(SECTORS).forEach(k => { sect[k] = new Float64Array(N); });
    fx[0] = 0.92;
    for (let i = 1; i < N; i++) {
      const g = regime(i);
      mkt[i] = g.mu + MKT_VOL * g.vm * nrm();
      euf[i] = 0.0001 + EU_VOL * g.vm * nrm() + (g.crash ? -0.002 : 0);
      Object.keys(sect).forEach(k => { sect[k][i] = SECT_VOL * g.vm * nrm(); });
      const r = i - START; const fxShock = (r >= 60 && r < 65) ? 0.006 : 0;
      fx[i] = fx[i - 1] * (1 + 0.003 * nrm() + (g.crash ? 0.0008 : 0) + fxShock);
    }
    ASSETS.forEach(a => { pret[a.t] = new Float64Array(N); });
    ASSETS.forEach(a => {
      if (a.t === 'ESGU') return;
      const r = pret[a.t];
      for (let i = 1; i < N; i++) {
        const g = regime(i);
        let x;
        if (a.s === 'bond') {
          x = a.mu + a.beta * mkt[i] - a.rate * g.rate + a.vol * g.vm * 0.8 * nrm() + (g.crash && a.ccy === 'USD' ? 0.0008 : 0) + (a.eu ? 0.15 * euf[i] : 0);
        } else if (a.s === 'gold') {
          x = a.mu + a.beta * mkt[i] + a.vol * Math.sqrt(g.vm) * nrm() + (g.crash ? 0.001 : 0);
        } else if (a.s === 'cash') {
          x = a.mu + a.vol * nrm();
        } else if (a.t === 'SPY') {
          x = mkt[i] + a.vol * nrm();
        } else {
          const crashExtra = g.crash && a.crash ? (a.crash - 1) * g.mu : 0;
          x = (a.mu - 0.00045 * a.beta) + a.beta * mkt[i] + (a.eu || 0) * euf[i] + 0.8 * (sect[a.s] ? sect[a.s][i] : 0)
            + a.vol * g.vm * nrm() - a.rate * g.rate + crashExtra;
        }
        r[i] = Math.max(-0.35, Math.min(0.35, x));
      }
    });
    const members = ASSETS.filter(a => a.type === 'stock' && a.ccy === 'USD' && a.esg >= 60 && !a.fossil).map(a => a.t);
    for (let i = 1; i < N; i++) {
      let s = 0; members.forEach(t => { s += pret[t][i]; });
      pret.ESGU[i] = s / members.length + 0.003 * nrm();
    }
    ASSETS.forEach(a => {
      const start = a.p0;
      const o = new Float64Array(N), h = new Float64Array(N), l = new Float64Array(N), c = new Float64Array(N), v = new Float64Array(N);
      const tr = new Float64Array(N);
      const base = a.type === 'stock' ? 2e5 + rand() * 6e5 : 8e5 + rand() * 1e6;
      const dv = Math.max(a.vol, 0.004);
      c[0] = start; o[0] = start; h[0] = start; l[0] = start; v[0] = base;
      for (let i = 1; i < N; i++) {
        c[i] = c[i - 1] * (1 + pret[a.t][i]);
        o[i] = c[i - 1] * (1 + 0.25 * dv * nrm());
        h[i] = Math.max(o[i], c[i]) * (1 + Math.abs(nrm()) * 0.5 * dv);
        l[i] = Math.min(o[i], c[i]) * (1 - Math.abs(nrm()) * 0.5 * dv);
        v[i] = base * (1 + Math.abs(pret[a.t][i]) / dv * 0.6) * Math.exp(0.3 * nrm());
        const local = pret[a.t][i] + a.div / 100 / 252;
        tr[i] = a.ccy === 'EUR' ? (1 + local) * (fx[i - 1] / fx[i]) - 1 : local;
      }
      series[a.t] = { o, h, l, c, v };
      rets[a.t] = tr;
    });
  })();

  // ---------- News / events (simulated) ----------
  const NEWS = [
    { i: 300, tag: 'macro', title: 'Scenario: global liquidity shock', text: 'A large fund collapses and markets fall for several weeks.' },
    { i: 330, tag: 'macro', title: 'Scenario: central banks cut rates', text: 'Policy support kicks in and the recovery begins.' },
    { i: START + 5, tag: 'sector', s: 'tech', title: 'Scenario: tech earnings beat expectations', text: 'Revenue is growing, but valuations stay high.' },
    { i: START + 20, tag: 'macro', title: 'Scenario: surprise rate hike', text: 'Growth stocks, bonds and utilities come under pressure.' },
    { i: START + 45, tag: 'sector', s: 'health', title: 'Scenario: regulators tighten drug approvals', text: 'Pharma stocks slide.' },
    { i: START + 60, tag: 'macro', title: 'Scenario: euro falls about 3% against the dollar', text: 'Euro-priced assets are worth less in dollars. Currency risk in action.' },
    { i: START + 70, tag: 'macro', title: 'Scenario: banking confidence crisis', text: 'Risk assets sell off. Gold and U.S. Treasuries are in demand.' },
    { i: START + 82, tag: 'macro', title: 'Scenario: stocks down 25% from the peak', text: 'Volatility at a 3-year high. Clients are calling their advisors.' },
    { i: START + 93, tag: 'macro', title: 'Scenario: emergency rate cut', text: 'First signs of a turnaround.' },
    { i: START + 160, tag: 'sector', s: 'util', title: 'Scenario: new renewable energy subsidies', text: 'Clean energy is back in focus.' }
  ];

  // ---------- Cases ----------
  const RISK_BANDS = { 1: [0.02, 0.07], 2: [0.05, 0.10], 3: [0.09, 0.14], 4: [0.13, 0.20], 5: [0.18, 0.30] };
  const CASES = [
    {
      id: 'aigerim', level: 'Rookie', title: 'A down payment in three years',
      client: { name: 'Emily Carter', age: 34, role: 'Credit analyst at a bank · Chicago', avatar: 'EC', color: '#E8B04B' },
      story: 'Has been saving for six years. Wants to make a down payment on a condo in three years. Afraid of losing money, but knows her savings account does not beat inflation.',
      capital: 60000, horizonY: 3, goal: 'Protect the capital and earn more than inflation; down payment in 3 years.',
      targetReturn: 0.06, risk: 2, maxDD: 0.12,
      constraints: { excludeSectors: [], excludeFossil: false, maxWeight: 0.25, minSectors: 3, minEsg: 0, liquidity: { amount: 15000, months: 9 } },
      hidden: [
        'In 9 months she needs $15,000 to help renovate her parents’ house (she only says so if asked directly about upcoming expenses).',
        'She works at a large U.S. bank, so her salary and bonus already depend on the banking sector.'
      ],
      traps: ['Bank stocks look cheap, but owning them doubles her exposure to her own employer.'],
      benchmark: { SPY: 0.4, AGG: 0.6 }, rf: 0.04
    },
    {
      id: 'zhasyl', level: 'Analyst', title: 'An environmental foundation’s endowment',
      client: { name: 'Green Delta Foundation', age: null, role: 'Nonprofit · Rotterdam', avatar: 'GD', color: '#5FB37E' },
      story: 'The foundation funds wetland and river restoration across Europe. Its board wants the endowment to grow without contradicting the mission.',
      capital: 500000, horizonY: 10, goal: 'Long-term capital growth under a strict ESG mandate.',
      targetReturn: 0.07, risk: 3, maxDD: 0.20,
      constraints: { excludeSectors: [], excludeFossil: true, maxWeight: 0.15, minSectors: 5, minEsg: 62, liquidity: null },
      hidden: [
        'Every year the foundation pays out 4% of capital in grants, so it needs a steady cash flow.',
        'One trustee strongly opposes airlines and mining, even though the mandate does not formally ban them.'
      ],
      traps: ['Cameco mines uranium for low-carbon nuclear power, but mining and radioactive waste make it a disputed fit for an ESG mandate.'],
      benchmark: { ESGU: 0.7, AGG: 0.3 }, rf: 0.04
    },
    {
      id: 'timur', level: 'Associate', title: '15% a year for a startup founder',
      client: { name: 'Lucas Meyer', age: 22, role: 'Co-founder of a software startup · Berlin', avatar: 'LM', color: '#7FA8E8' },
      story: 'Got a $20,000 bonus after the company raised a round. Wants to “grow aggressively, at least 15% a year” and asks why not just buy tech stocks.',
      capital: 20000, horizonY: 7, goal: 'Maximum long-term growth; the client expects 15% a year.',
      targetReturn: 0.15, risk: 4, maxDD: 0.30,
      constraints: { excludeSectors: [], excludeFossil: false, maxWeight: 0.30, minSectors: 4, minEsg: 0, liquidity: null },
      hidden: [
        'Almost all of his wealth is his stake in the startup. A tech-heavy portfolio doubles the same risk.',
        'If the startup fails to raise its next round within 18 months, he will need savings to live on.'
      ],
      traps: ['Expecting 15% a year is unrealistic without very high risk; the advisor must manage expectations.'],
      benchmark: { SPY: 1.0 }, rf: 0.04
    }
  ];

  // ---------- Helpers ----------
  const sum = a => a.reduce((x, y) => x + y, 0);
  const mean = a => a.length ? sum(a) / a.length : 0;
  function sd(a) { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) * (x - m)))); }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function price(t, i) { const a = BY[t]; return a.ccy === 'EUR' ? series[t].c[i] / fx[i] : series[t].c[i]; } // USD
  function localPrice(t, i) { return series[t].c[i]; }

  // weights: {ticker: w} (cash key 'CASH' allowed). Returns daily portfolio return array over [from, to].
  function portfolioReturns(weights, from, to) {
    const out = [];
    const keys = Object.keys(weights).filter(k => k !== 'CASH' && weights[k] > 0);
    const cashW = weights.CASH || 0;
    for (let i = from; i <= to; i++) {
      let r = cashW * (0.04 / 252);
      keys.forEach(k => { r += weights[k] * rets[k][i]; });
      out.push(r);
    }
    return out;
  }
  function maxDrawdown(rs) {
    let v = 1, peak = 1, mdd = 0;
    rs.forEach(r => { v *= 1 + r; if (v > peak) peak = v; mdd = Math.max(mdd, 1 - v / peak); });
    return mdd;
  }
  function riskyWeights(weights) {
    const k = Object.keys(weights).filter(x => x !== 'CASH' && weights[x] > 0.0001);
    return k.map(x => [x, weights[x]]);
  }

  // Ex-ante metrics from history ending at idx (lookback days)
  function metrics(weights, idx, lookback, rf) {
    lookback = lookback || 252; rf = rf == null ? 0.04 : rf;
    const from = Math.max(1, idx - lookback + 1);
    const pr = portfolioReturns(weights, from, idx);
    const mr = []; for (let i = from; i <= idx; i++) mr.push(rets.SPY[i]);
    const annRet = mean(pr) * 252;
    const vol = sd(pr) * Math.sqrt(252);
    const sharpe = vol > 1e-6 ? (annRet - rf) / vol : 0;
    const mdd = maxDrawdown(pr);
    const mm = mean(mr), pm = mean(pr);
    let cov = 0, vm = 0;
    for (let j = 0; j < pr.length; j++) { cov += (pr[j] - pm) * (mr[j] - mm); vm += (mr[j] - mm) * (mr[j] - mm); }
    const beta = vm > 0 ? cov / vm : 0;
    const rw = riskyWeights(weights);
    const total = sum(rw.map(x => x[1])) + (weights.CASH || 0);
    const allW = rw.map(x => x[1]).concat(weights.CASH > 0.0001 ? [weights.CASH] : []);
    const hhi = total > 0 ? sum(allW.map(w => (w / total) * (w / total))) : 1;
    const neff = hhi > 0 ? 1 / hhi : 0;
    const sectorW = {};
    rw.forEach(([t, w]) => { const s = BY[t].s; sectorW[s] = (sectorW[s] || 0) + w; });
    if (weights.CASH > 0.0001) sectorW.cash = (sectorW.cash || 0) + weights.CASH;
    const sectors = Object.keys(sectorW).filter(s => sectorW[s] >= 0.02).length;
    let esgNum = 0, esgDen = 0;
    rw.forEach(([t, w]) => { esgNum += BY[t].esg * w; esgDen += w; });
    const esg = esgDen > 0 ? esgNum / esgDen : 0;
    const sw = rw.filter(x => BY[x[0]].type === 'stock'); const maxW = sw.length ? Math.max.apply(null, sw.map(x => x[1])) : 0;
    let divY = 0; rw.forEach(([t, w]) => { divY += w * BY[t].div / 100; });
    const liquid = (weights.CASH || 0) + (weights.SGOV || 0) + (weights.AGG || 0);
    return { annRet, vol, sharpe, mdd, beta, hhi, neff, sectors, sectorW, esg, maxW, divY, liquid };
  }

  function stressTest(weights) {
    const pr = portfolioReturns(weights, 300, 325);
    let v = 1; pr.forEach(r => { v *= 1 + r; });
    const mr = portfolioReturns({ SPY: 1 }, 300, 325);
    let m = 1; mr.forEach(r => { m *= 1 + r; });
    return { portfolio: v - 1, market: m - 1, from: dates[300], to: dates[325] };
  }

  // Constraint check → list of {id, label, ok, hard, detail}
  function checkConstraints(cs, weights, m) {
    const c = cs.constraints; const out = [];
    const rw = riskyWeights(weights);
    const total = sum(rw.map(x => x[1])) + (weights.CASH || 0);
    out.push({ id: 'invested', label: '100% of capital allocated', ok: Math.abs(total - 1) < 0.005, hard: true, detail: (total * 100).toFixed(1) + '%' });
    if (c.excludeFossil) {
      const bad = rw.filter(([t]) => BY[t].fossil).map(x => x[0]);
      out.push({ id: 'fossil', label: 'No fossil fuels', ok: bad.length === 0, hard: true, detail: bad.length ? bad.join(', ') : 'ok' });
    }
    if (c.excludeSectors && c.excludeSectors.length) {
      const bad = rw.filter(([t]) => c.excludeSectors.indexOf(BY[t].s) >= 0).map(x => x[0]);
      out.push({ id: 'sectors-ex', label: 'Excluded sectors', ok: bad.length === 0, hard: true, detail: bad.join(', ') || 'ok' });
    }
    out.push({ id: 'maxw', label: 'Single stock ≤ ' + Math.round(c.maxWeight * 100) + '%', ok: m.maxW <= c.maxWeight + 1e-6, hard: false, detail: Math.round(m.maxW * 100) + '%' });
    out.push({ id: 'minsect', label: 'Sectors ≥ ' + c.minSectors, ok: m.sectors >= c.minSectors, hard: false, detail: String(m.sectors) });
    if (c.minEsg) out.push({ id: 'esg', label: 'Average ESG ≥ ' + c.minEsg, ok: m.esg >= c.minEsg, hard: false, detail: m.esg.toFixed(0) });
    if (c.liquidity) {
      const need = c.liquidity.amount / cs.capital;
      out.push({ id: 'liq', label: 'Liquidity for $' + c.liquidity.amount.toLocaleString('en-US') + ' in ' + c.liquidity.months + ' months', ok: m.liquid >= need - 1e-6, hard: false, detail: Math.round(m.liquid * 100) + '% / need ' + Math.round(need * 100) + '%', hiddenUntilAsked: true });
    }
    const band = RISK_BANDS[cs.risk];
    out.push({ id: 'vol', label: 'Volatility within risk band ' + cs.risk + '/5 (' + Math.round(band[0] * 100) + '–' + Math.round(band[1] * 100) + '%)', ok: m.vol >= band[0] && m.vol <= band[1], hard: false, detail: (m.vol * 100).toFixed(1) + '%' });
    out.push({ id: 'mdd', label: 'Historical drawdown ≤ ' + Math.round(cs.maxDD * 100) + '%', ok: m.mdd <= cs.maxDD, hard: false, detail: (m.mdd * 100).toFixed(1) + '%' });
    return out;
  }

  // Quantitative part of the board score (40 pts): client fit (code) 10 + risk management 30
  function quantScore(cs, weights, idx, knowsLiquidity) {
    const m = metrics(weights, idx, 504, cs.rf);
    const bm = metrics(cs.benchmark, idx, 504, cs.rf);
    const checks = checkConstraints(cs, weights, m);
    // Client fit (code) 10
    let fit = 10; const notes = [];
    checks.forEach(ch => {
      if (ch.ok) return;
      if (['vol', 'mdd'].indexOf(ch.id) >= 0) return; // scored under risk
      if (ch.hard) { fit -= 5; notes.push('Hard constraint broken: ' + ch.label); }
      else { fit -= 2; notes.push('Broken: ' + ch.label + ' (' + ch.detail + ')'); }
    });
    fit = clamp(fit, 0, 10);
    // Risk 30
    const band = RISK_BANDS[cs.risk];
    let corridor = 8;
    if (m.vol < band[0]) corridor -= Math.ceil((band[0] - m.vol) / 0.02) * 2;
    if (m.vol > band[1]) corridor -= Math.ceil((m.vol - band[1]) / 0.02) * 2;
    corridor = clamp(corridor, 0, 8);
    const sharpePts = 8 * clamp(m.sharpe - bm.sharpe + 0.5, 0, 1);
    let mddPts = 7;
    if (m.mdd > cs.maxDD) mddPts = 7 * clamp(1 - (m.mdd - cs.maxDD) / cs.maxDD, 0, 1);
    const neffTarget = cs.level === 'Rookie' ? 5 : 7;
    const divPts = (m.neff >= neffTarget ? 4 : 4 * clamp(m.neff / neffTarget, 0, 1)) + (m.sectors >= cs.constraints.minSectors ? 3 : 0);
    const risk = corridor + sharpePts + mddPts + divPts;
    return {
      total: fit + risk, fit, risk,
      parts: { corridor, sharpe: sharpePts, mdd: mddPts, div: divPts },
      m, bm, checks, notes
    };
  }

  // Elo-like board rating
  function expectedScore(rating, level) {
    const diff = { Rookie: 900, Analyst: 1100, Associate: 1300, Partner: 1500 }[level] || 1100;
    return 1 / (1 + Math.pow(10, (diff - rating) / 400));
  }
  function updateRating(rating, score, level, defenses) {
    const S = score / 100; const E = expectedScore(rating, level);
    const K = defenses < 10 ? 40 : 20;
    return Math.round(rating + K * (S - E));
  }

  // ---------- Placement test ----------
  const PLACEMENT = [
    { axis: 'basics', q: 'Inflation is 8% a year and your savings account pays 6%. What happens to your purchasing power?', o: ['It grows by 6%', 'It falls by about 2% a year', 'It stays the same', 'It grows by 14%'], a: 1 },
    { axis: 'basics', q: '$1,000 at 10% a year, compounded, after 2 years is…', o: ['$1,200', '$1,210', '$1,100', '$1,020'], a: 1 },
    { axis: 'risk', q: 'A portfolio fell from $100 to $70, then rose 30%. What is it worth now?', o: ['$100', '$91', '$97', '$130'], a: 1 },
    { axis: 'risk', q: 'What lowers the risk of a portfolio of 5 tech stocks the most?', o: ['Add 5 more tech stocks', 'Add bonds and stocks from other sectors', 'Buy the most expensive stock', 'Trade more often'], a: 1 },
    { axis: 'analysis', q: 'A P/E of 40 means…', o: ['The company is losing money', 'Investors pay $40 for $1 of annual earnings', 'The dividend is 40%', 'The stock costs $40'], a: 1 },
    { axis: 'analysis', q: 'When interest rates rise, a company with a lot of debt usually…', o: ['Benefits', 'Suffers: servicing its debt gets more expensive', 'Is not affected', 'Pays higher dividends'], a: 1 },
    { axis: 'behavior', q: 'A stock rose 80% in a month and everyone on social media is buying. This is most likely…', o: ['A guarantee of further gains', 'A signal to check the valuation and resist FOMO', 'A reason to take out a loan', 'A safe defensive stock'], a: 1 },
    { axis: 'behavior', q: 'The market fell 20% and the client’s horizon is 10 years. A sensible advisor…', o: ['Sells everything immediately', 'Reviews the plan, rebalances and explains the horizon to the client', 'Doubles the risk with borrowed money', 'Stops answering calls'], a: 1 }
  ];

  // ---------- Lessons ----------
  // card types: concept, choice, swipe, slider, match, chart
  const UNITS = [
    { id: 'u1', title: 'Money and time', lessons: [
      { id: 'l1', title: 'Inflation eats money', concept: 'inflation', cards: [
        { type: 'concept', title: 'Real return', text: 'Real return ≈ nominal return − inflation. A savings account paying 5% with 4% inflation grows your purchasing power by only about 1%.' },
        { type: 'choice', q: 'A bond pays 3% and inflation is 5%. The real return is about…', o: ['+8%', '−2%', '+2%', '0%'], a: 1, e: '3% − 5% = −2%: your money grows more slowly than prices.' },
        { type: 'slider', q: 'What will $1,000 grow to in 10 years at 7% a year, compounded?', min: 1000, max: 3000, step: 10, answer: 1967, tol: 80, unit: '$', e: '1,000 × 1.07¹⁰ ≈ $1,967. Compounding almost doubles the money in 10 years.' },
        { type: 'swipe', q: 'You are 16 and saving for college in 2 years. Is crypto a good place for that money?', left: 'Not suitable', right: 'Suitable', a: 'left', e: 'Short horizon + important goal = you need low risk. Crypto can fall 50% in a month.' }
      ] },
      { id: 'l2', title: 'The rule of 72', concept: 'compounding', cards: [
        { type: 'concept', title: 'The rule of 72', text: 'To estimate how many years it takes to double your money, divide 72 by the annual return in percent. At 8% it takes about 9 years.' },
        { type: 'choice', q: 'How many years to double your money at 6% a year?', o: ['6', '12', '18', '72'], a: 1, e: '72 / 6 = 12 years.' },
        { type: 'match', q: 'Match each term with its meaning', pairs: [['Compounding', 'Interest on interest'], ['Inflation', 'Rising prices'], ['Real return', 'Return after inflation']] }
      ] }
    ] },
    { id: 'u2', title: 'Risk and return', lessons: [
      { id: 'l3', title: 'What a drawdown is', concept: 'drawdown', cards: [
        { type: 'concept', title: 'Maximum drawdown', text: 'The largest fall from a peak to the low that follows. If a portfolio grew to $120 and then fell to $90, the drawdown is 25%.' },
        { type: 'chart', q: 'Tap the lowest point after the peak — the bottom of the drawdown.', seed: 7, e: 'The bottom of a drawdown is the lowest point after the most recent high.' },
        { type: 'choice', q: 'After a 50% loss, how much do you need to gain to get back to even?', o: ['50%', '100%', '75%', '25%'], a: 1, e: 'From $50 back to $100 is +100%. Big drawdowns are very hard to recover from.' }
      ] },
      { id: 'l4', title: 'The Sharpe ratio', concept: 'sharpe', cards: [
        { type: 'concept', title: 'Sharpe ratio', text: 'Sharpe = (return − risk-free rate) / volatility. It shows how much return you earn per unit of risk. Above 1 is often considered good, but the fair comparison is against a benchmark over the same period.' },
        { type: 'choice', q: 'Portfolio A: 12% return, 20% volatility. B: 8% and 8%. The risk-free rate is 4%. Which has the higher Sharpe?', o: ['A (0.4)', 'B (0.5)', 'The same', 'Cannot compare'], a: 1, e: 'A: (12−4)/20 = 0.4. B: (8−4)/8 = 0.5. B uses its risk more efficiently.' },
        { type: 'swipe', q: 'Is the portfolio with the highest return always the best one?', left: 'No', right: 'Yes', a: 'left', e: 'What matters is how much risk was taken. A high return with huge risk may just be luck.' }
      ] },
      { id: 'l5', title: 'Diversification and correlation', concept: 'diversification', cards: [
        { type: 'concept', title: 'Correlation', text: 'If assets move together (high correlation), combining them barely reduces risk. Three tech stocks are almost one bet.' },
        { type: 'choice', q: 'What diversifies a portfolio of tech stocks best?', o: ['Another tech stock', 'Bonds and utilities', 'A tech ETF', 'A social media stock'], a: 1, e: 'Bonds and defensive sectors are only loosely linked to tech.' },
        { type: 'slider', q: 'Portfolio: 50% / 30% / 20%. Effective number of holdings N_eff = 1 / Σw² ≈ ?', min: 1, max: 5, step: 0.1, answer: 2.6, tol: 0.15, unit: '', e: 'Σw² = 0.25 + 0.09 + 0.04 = 0.38; 1 / 0.38 ≈ 2.6.' }
      ] }
    ] },
    { id: 'u3', title: 'Asset classes', lessons: [
      { id: 'l6', title: 'Bonds, rates and currency', concept: 'bonds', cards: [
        { type: 'concept', title: 'Currency risk', text: 'If you measure your money in dollars but buy a stock priced in euros, your result depends on both the stock price and the exchange rate. A stock up 10% in euros while the euro falls 10% against the dollar gives about 0% in dollars.' },
        { type: 'choice', q: 'A European stock returned +12% in euros, and the euro fell 8% against the dollar. Your return in dollars is about…', o: ['+20%', '+3%', '+12%', '−8%'], a: 1, e: '1.12 × 0.92 ≈ 1.03, about +3% in dollars.' },
        { type: 'concept', title: 'Rates and bonds', text: 'When a central bank raises rates, existing bonds lose value because new ones pay more. The longer the bond (duration), the bigger the fall.' },
        { type: 'swipe', q: 'The central bank raised rates. A bond ETF will most likely…', left: 'Fall', right: 'Rise', a: 'left', e: 'Higher rates = lower bond prices.' },
        { type: 'match', q: 'Match each asset with its role', pairs: [['Bonds', 'Steady income'], ['Gold', 'Crisis protection'], ['Growth stocks', 'Long-term growth']] }
      ] }
    ] },
    { id: 'u4', title: 'Analyzing companies', lessons: [
      { id: 'l7', title: 'P/E and valuation', concept: 'valuation', cards: [
        { type: 'concept', title: 'P/E', text: 'Price divided by earnings per share. A P/E of 40 means the market pays $40 for $1 of annual earnings and expects strong growth. If growth slows, the stock can fall a lot.' },
        { type: 'choice', q: 'Which company carries the highest risk of disappointing the market?', o: ['P/E 8, 6% dividend', 'P/E 45, no dividend', 'P/E 15, 3% dividend', 'P/E 12, 4% dividend'], a: 1, e: 'A high valuation already prices in an optimistic scenario.' }
      ] }
    ] },
    { id: 'u5', title: 'Portfolios for clients', lessons: [
      { id: 'l8', title: 'Horizon and liquidity', concept: 'client', cards: [
        { type: 'concept', title: 'Horizon and liquidity', text: 'Money needed in the next 1–2 years should not sit in volatile stocks. The liquid part is kept in cash, T-bills or short-term bonds.' },
        { type: 'swipe', q: 'The client needs $15,000 in 9 months. Keep it in growth stocks?', left: 'No', right: 'Yes', a: 'left', e: 'Stocks can fall 25% in 9 months. That is not a risk this client can afford.' },
        { type: 'choice', q: 'Which question matters most before building a client’s portfolio?', o: ['Their favorite company', 'When and how much money they will need', 'Which phone they use', 'How many friends invest'], a: 1, e: 'The timing and size of withdrawals shape the whole portfolio.' }
      ] },
      { id: 'l9', title: 'ESG without greenwashing', concept: 'esg', cards: [
        { type: 'concept', title: 'ESG', text: 'ESG rates environmental, social and governance practices. Greenwashing is when a company looks “green” only in its advertising.' },
        { type: 'choice', q: 'A foundation with an environmental mission cannot hold fossil fuels. Which fits?', o: ['An oil producer', 'A pipeline operator', 'A wind farm operator', 'Any energy company'], a: 2, e: 'Wind power fits the mandate; oil and gas do not.' }
      ] }
    ] },
    { id: 'u6', title: 'Investor psychology', lessons: [
      { id: 'l10', title: 'FOMO and panic', concept: 'behavior', cards: [
        { type: 'concept', title: 'FOMO', text: 'Fear of missing out makes people buy at the top. Panic makes them sell at the bottom. Both lock in losses.' },
        { type: 'swipe', q: 'The market fell 25%, but the client’s plan and horizon have not changed. Sell everything?', left: 'No, stick to the plan', right: 'Yes, save the money', a: 'left', e: 'Selling at the bottom locks in the loss. First check whether the goals or risk profile changed.' },
        { type: 'choice', q: 'An influencer promises 5% a day “with no risk”. This is…', o: ['A great opportunity', 'A sign of fraud', 'A normal return', 'A bond'], a: 1, e: 'A guaranteed high return with no risk is a classic sign of a Ponzi scheme.' }
      ] }
    ] }
  ];

  function lessonById(id) {
    for (const u of UNITS) for (const l of u.lessons) if (l.id === id) return l;
    return null;
  }
  // Which lessons to recommend for weak criteria
  const LESSON_FOR = { clientFit: ['l8', 'l9'], risk: ['l3', 'l4', 'l5'], analysis: ['l7', 'l6'], defense: ['l10', 'l3'], communication: ['l8'] };

  function chartSeries(seed) {
    const rnd = mulberry32(seed); const n = makeNormal(rnd);
    const out = [100]; for (let i = 1; i < 40; i++) {
      const drift = i < 14 ? 0.012 : i < 26 ? -0.02 : 0.01;
      out.push(out[i - 1] * (1 + drift + 0.015 * n()));
    }
    return out;
  }

  window.BR = {
    HIST, REPLAY, N, START, dates, fx, localPrice, SECTORS, ASSETS, BY, series, rets, NEWS, CASES, RISK_BANDS,
    price, metrics, portfolioReturns, maxDrawdown, stressTest, checkConstraints, quantScore,
    updateRating, PLACEMENT, UNITS, lessonById, LESSON_FOR, chartSeries, mean, sd, clamp, mulberry32
  };
})();
