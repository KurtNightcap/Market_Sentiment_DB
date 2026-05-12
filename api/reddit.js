const https = require("https");

function fetchUrl(url, headers) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: "GET",
      headers: headers || {},
    };
    const req = https.request(options, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, headers).then(resolve).catch(reject);
      }
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("Timeout")); });
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const sub = (req.query.sub || "investing").replace(/[^a-zA-Z0-9_]/g, "");
  const t = req.query.t || "day";
  const limit = parseInt(req.query.limit) || 25;

  // Use old.reddit.com which is more scraper-friendly
  const url = `https://old.reddit.com/r/${sub}/top.json?t=${t}&limit=${limit}&raw_json=1`;

  try {
    const { status, body } = await fetchUrl(url, {
      "User-Agent": "Mozilla/5.0 (compatible; MarketBot/1.0)",
      "Accept": "application/json",
      "Accept-Language": "en-US,en;q=0.9",
    });

    if (status !== 200) {
      return res.status(status).json({ error: `Reddit returned ${status}`, body: body.slice(0, 200) });
    }

    const data = JSON.parse(body);
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
