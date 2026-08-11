const https = require("https");

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: "GET",
      headers: {
        "User-Agent": "MarketSentimentDashboard/1.0 contact@example.com",
        "Accept": "application/json"
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let body = "";
      res.on("data", c => body += c);
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error("Timeout")); });
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const type = req.query.type || "13d";
  const startdt = req.query.startdt || "";
  const enddt = req.query.enddt || "";

  const EDGAR = "https://efts.sec.gov/LATEST/search-index";

  const configs = {
    "13d": {
      q: '"Schedule 13D"',
      dateRange: "custom",
      startdt,
      enddt,
      "hits.hits._source": "display_names,file_date,form,adsh,biz_locations,sics",
      size: 200
    },
    "bankruptcy": {
      q: '"bankruptcy"',
      forms: "8-K",
      dateRange: "custom",
      startdt,
      enddt,
      "hits.hits._source": "display_names,file_date,form,adsh,biz_locations,sics,items",
      size: 200
    },
    "spinoff": {
      forms: "10-12G,10-12G/A",
      dateRange: "custom",
      startdt,
      enddt,
      "hits.hits._source": "display_names,file_date,form,adsh,biz_locations,sics",
      size: 100
    }
  };

  const config = configs[type];
  if (!config) return res.status(400).json({ error: "Unknown type" });

  const params = new URLSearchParams(config);
  const url = `${EDGAR}?${params}`;

  try {
    const { status, body } = await fetchUrl(url);
    if (status !== 200) return res.status(status).json({ error: `EDGAR returned ${status}` });
    const data = JSON.parse(body);
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};