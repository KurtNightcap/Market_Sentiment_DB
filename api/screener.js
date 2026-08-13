const https = require("https");

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://finviz.com/screener.ashx"
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let body = "";
      res.on("data", c => body += c);
      res.on("end", () => resolve({ status: res.statusCode, body, contentType: res.headers["content-type"] || "" }));
    });
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("Timeout")); });
    req.end();
  });
}

function parseCSV(csv) {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.replace(/"/g, "").trim());
  return lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.replace(/"/g, "").trim());
    const obj = {};
    headers.forEach((h, i) => obj[h] = vals[i] || "");
    return obj;
  }).filter(r => r.Ticker);
}

// Finviz screener URLs by type
const SCREENERS = {
  // Fallen angels: small+ cap, 50%+ below 52w high
  fallenangels: "https://finviz.com/export.ashx?v=152&f=cap_smallover,ta_highlow52w_b50h&ft=4&o=-change&auth=guest",

  // Faded fad IPOs: IPO 2020-2022, market cap $50M-$2B
  fadedipos: "https://finviz.com/export.ashx?v=152&f=cap_micro_large,ipodate_more2019,ipodate_more2022_neg&ft=4&o=-change&auth=guest",

  // Collapsed SPACs: search for blank check companies that have completed mergers
  spacs: "https://finviz.com/export.ashx?v=152&f=cap_micro_mid,ind_blankcheckmergers&ft=4&o=-change&auth=guest",

  // Orphaned stocks: very low institutional ownership, small cap
  orphaned: "https://finviz.com/export.ashx?v=152&f=cap_micro_small,sh_instown_u5&ft=4&o=marketcap&auth=guest",
};

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const type = req.query.type || "fallenangels";
  const url = SCREENERS[type];

  if (!url) {
    return res.status(400).json({ error: `Unknown type. Use: ${Object.keys(SCREENERS).join(", ")}` });
  }

  try {
    const { status, body, contentType } = await fetchUrl(url);

    if (status === 429) {
      return res.status(429).json({ error: "Finviz rate limited. Try again in a moment." });
    }

    if (status !== 200) {
      return res.status(status).json({ error: `Finviz returned ${status}`, body: body.slice(0, 200) });
    }

    // If it's CSV parse it, otherwise return raw
    if (contentType.includes("text/csv") || body.startsWith("No.,Ticker") || body.startsWith("Number,Ticker")) {
      const rows = parseCSV(body);
      res.setHeader("Cache-Control", "public, max-age=600");
      return res.status(200).json({ type, count: rows.length, stocks: rows });
    }

    // Finviz may return HTML if blocked — detect and report
    if (body.includes("<html") || body.includes("<!DOCTYPE")) {
      return res.status(403).json({ error: "Finviz returned HTML (likely blocked). Will use fallback data." });
    }

    return res.status(200).json({ type, raw: body.slice(0, 500) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
