const https = require("https");

// SEC requires a descriptive User-Agent with a real contact email
const UA = "MarketSentimentDashboard/1.0 kurtnightcap@gmail.com";

function getJSON(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: "GET",
        headers: { "User-Agent": UA, "Accept": "application/json" }
      },
      (r) => {
        if (r.statusCode === 404) { r.resume(); return resolve(null); }
        if (r.statusCode !== 200) { r.resume(); return reject(new Error(u.pathname + " -> " + r.statusCode)); }
        let b = "";
        r.setEncoding("utf8");
        r.on("data", (c) => (b += c));
        r.on("end", () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
      }
    );
    req.on("error", reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error("timeout")); });
    req.end();
  });
}

async function frame(tag, period) {
  const d = await getJSON(`https://data.sec.gov/api/xbrl/frames/us-gaap/${tag}/USD/${period}.json`);
  const m = new Map();
  if (d && d.data) for (const x of d.data) if (!m.has(x.cik)) m.set(x.cik, { v: x.val, end: x.end });
  return m;
}

async function inBatches(jobs, size) {
  const out = [];
  for (let i = 0; i < jobs.length; i += size) {
    out.push(...(await Promise.all(jobs.slice(i, i + size).map((f) => f()))));
  }
  return out;
}

// First-pass exclusions by name (banks, insurers, funds, SPACs, REITs, BDCs, etc.)
// Replace with SIC-code filtering in v2.
const EXCL = /\b(bank|banc|bancorp|bancshares|bankshares|financial|insurance|assurance|reinsurance|trust|reit|realty|mortgage|acquisition|fund|etf|lending|bdc|savings|partners)\b|capital corp|investment corp|\bL\.?P\.?$/i;

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=86400");

  try {
    let period = req.query.period || "CY2026Q3I";
    const annual = req.query.annual || "CY2025";

    // Ticker list = listed companies only (also gives us tickers)
    const tk = await getJSON("https://www.sec.gov/files/company_tickers.json");
    const byCik = new Map();
    Object.values(tk).forEach((t) => {
      if (!byCik.has(t.cik_str)) byCik.set(t.cik_str, { ticker: t.ticker, name: t.title });
    });

    // Balance sheet frames (instant). Fall back to Q2 if Q3 is thin.
    let assets = await frame("Assets", period);
    if (assets.size < 3000 && !req.query.period) {
      period = "CY2026Q2I";
      assets = await frame("Assets", period);
    }

    const bal = [
      "CashAndCashEquivalentsAtCarryingValue", "ShortTermInvestments", "MarketableSecuritiesCurrent",
      "LongTermDebt", "LongTermDebtNoncurrent", "LongTermDebtCurrent", "ShortTermBorrowings", "DebtCurrent"
    ];
    // Annual duration frames (used to screen out pre-revenue / cash-burning names)
    const ann = [
      "RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues",
      "NetCashProvidedByUsedInOperatingActivities"
    ];

    const jobs = [...bal.map((t) => () => frame(t, period)), ...ann.map((t) => () => frame(t, annual))];
    const results = await inBatches(jobs, 5);
    const F = {};
    [...bal, ...ann].forEach((t, i) => (F[t] = results[i]));
    const g = (t, c) => { const x = F[t].get(c); return x ? x.v : undefined; };

    let excluded = 0;
    const rows = [];
    for (const [cik, a] of assets) {
      const t = byCik.get(cik);
      if (!t) continue;
      if (EXCL.test(t.name)) { excluded++; continue; }
      const A = a.v;
      if (!(A >= 1e8)) continue;

      const cash = g("CashAndCashEquivalentsAtCarryingValue", cik);
      if (cash === undefined) continue;
      let sti = g("ShortTermInvestments", cik);
      if (sti === undefined) sti = g("MarketableSecuritiesCurrent", cik);
      if (sti === undefined) sti = 0;

      const ltd = g("LongTermDebt", cik);
      const ltn = g("LongTermDebtNoncurrent", cik);
      const ltc = g("LongTermDebtCurrent", cik);
      const stb = g("ShortTermBorrowings", cik);
      const dc = g("DebtCurrent", cik);

      let debt = null;
      if (ltd !== undefined) debt = ltd + (stb || 0);
      else if (ltn !== undefined) debt = ltn + (dc !== undefined ? dc : (ltc || 0) + (stb || 0));
      else if (dc !== undefined || stb !== undefined || ltc !== undefined)
        debt = dc !== undefined ? dc : (ltc || 0) + (stb || 0);

      const debtMissing = debt === null;
      if (debtMissing) debt = 0;

      let rev = g("RevenueFromContractWithCustomerExcludingAssessedTax", cik);
      if (rev === undefined) rev = g("Revenues", cik);
      const ocf = g("NetCashProvidedByUsedInOperatingActivities", cik);

      rows.push({
        c: cik, t: t.ticker, n: t.name, a: A, d: debt, ca: cash, s: sti,
        cal: (debt - cash) / A,            // paper-pure CAL: (debt - cash) / assets
        calAdj: (debt - cash - sti) / A,   // also nets short-term investments
        r: rev === undefined ? null : rev,
        o: ocf === undefined ? null : ocf,
        e: a.end,
        dm: debtMissing ? 1 : 0
      });
    }

    // Percentile of CAL across the whole eligible universe (paper uses full-sample quartiles)
    rows.sort((x, y) => x.cal - y.cal);
    const n = rows.length;
    rows.forEach((r, i) => {
      r.p = n > 1 ? Math.round((i / (n - 1)) * 1000) / 10 : 0;
      r.cal = Math.round(r.cal * 10000) / 10000;
      r.calAdj = Math.round(r.calAdj * 10000) / 10000;
    });

    return res.status(200).json({
      meta: {
        period, annual,
        assetsFrameCompanies: assets.size,
        universe: n,
        excludedByName: excluded,
        generated: new Date().toISOString()
      },
      rows
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};