const https = require("https");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const type = req.query.type || "fallenangels";

  // Hardcoded full URLs to avoid any construction issues
  const URLS = {
    fallenangels: "https://finviz.com/export.ashx?v=152&f=cap_smallover,ta_highlow52w_b50h&ft=4&o=-change",
    fadedipos:    "https://finviz.com/export.ashx?v=152&f=cap_micro_large,ipodate_before2023,ipodate_after2019&ft=4&o=-change",
    spacs:        "https://finviz.com/export.ashx?v=152&f=cap_micro_mid,ind_blankcheckmergers&ft=4&o=-change",
    orphaned:     "https://finviz.com/export.ashx?v=152&f=cap_micro_small,sh_instown_u5&ft=4&o=marketcap",
  };

  const targetUrl = URLS[type];
  if (!targetUrl) {
    return res.status(400).json({ error: "Unknown type: " + type });
  }

  try {
    const data = await new Promise((resolve, reject) => {
      const req2 = https.request({
        hostname: "finviz.com",
        path: "/export.ashx?v=152&f=cap_smallover,ta_highlow52w_b50h&ft=4&o=-change",
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "text/csv,*/*",
          "Referer": "https://finviz.com/"
        }
      }, (response) => {
        let body = "";
        response.on("data", c => body += c);
        response.on("end", () => resolve({ status: response.statusCode, body }));
      });
      req2.on("error", reject);
      req2.setTimeout(15000, () => { req2.destroy(); reject(new Error("Timeout")); });
      req2.end();
    });

    if (data.body.includes("<!DOCTYPE") || data.body.includes("<html")) {
      return res.status(403).json({ error: "Finviz blocked (returned HTML)", status: data.status });
    }

    // Parse CSV
    const lines = data.body.trim().split("\n").filter(l => l.trim());
    if (lines.length < 2) {
      return res.status(200).json({ type, count: 0, stocks: [], raw: data.body.slice(0, 200) });
    }
    const headers = lines[0].split(",").map(h => h.replace(/"/g, "").trim());
    const stocks = lines.slice(1).map(line => {
      const vals = line.split(",").map(v => v.replace(/"/g, "").trim());
      const obj = {};
      headers.forEach((h, i) => { obj[h] = vals[i] || ""; });
      return obj;
    }).filter(r => r.Ticker || r.ticker);

    res.setHeader("Cache-Control", "public, max-age=600");
    return res.status(200).json({ type, count: stocks.length, stocks: stocks.slice(0, 50) });
  } catch (e) {
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
};
