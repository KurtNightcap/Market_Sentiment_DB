const https = require("https");

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/csv,text/html,*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://finviz.com/"
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let body = "";
      res.on("data", c => body += c);
      res.on("end", () => resolve({ status: res.statusCode, body, ct: res.headers["content-type"] || "" }));
    });
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("Timeout")); });
    req.end();
  });
}

function parseCSV(csv) {
  const lines = csv.trim().split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.replace(/"/g, "").trim());
  return lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.replace(/"/g, "").trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ""; });
    return obj;
  }).filter(r => r.Ticker || r.ticker);
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const type = req.query.type || "fallenangels";

  // Build paths manually to avoid URL parsing issues
  const PATHS = {
    fallenangels: "/export.ashx?v=152&f=cap_smallover,ta_highlow52w_b50h&ft=4&o=-change",
    fadedipos:    "/export.ashx?v=152&f=cap_micro_large,ipodate_before2023,ipodate_after2019&ft=4&o=-change",
    spacs:        "/export.ashx?v=152&f=cap_micro_mid,ind_blankcheckmergers&ft=4&o=-change",
    orphaned:     "/export.ashx?v=152&f=cap_micro_small,sh_instown_u5&ft=4&o=marketcap",
  };

  const path = PATHS[type];
  if (!path) {
    return res.status(400).json({ error: "Unknown type. Use: " + Object.keys(PATHS).join(", ") });
  }

  try {
    const { status, body, ct } = await fetchUrl("https://finviz.com" + path);

    if (status === 429) return res.status(429).json({ error: "Rate limited by Finviz." });
    if (status !== 200) return res.status(status).json({ error: `Finviz returned ${status}`, preview: body.slice(0, 300) });
    if (body.includes("<!DOCTYPE") || body.includes("<html")) {
      return res.status(403).json({ error: "Finviz blocked the request (returned HTML)." });
    }

    const stocks = parseCSV(body);
    res.setHeader("Cache-Control", "public, max-age=600");
    return res.status(200).json({ type, count: stocks.length, stocks });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
