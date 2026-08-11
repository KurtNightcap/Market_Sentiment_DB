const https = require("https");

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 MarketSentimentDashboard/1.0",
        "Accept": "application/json, text/plain, */*"
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
  const startdt = req.query.startdt || "2026-06-01";
  const enddt = req.query.enddt || new Date().toISOString().split("T")[0];

  let url = "";

  if (type === "13d") {
    url = `https://efts.sec.gov/LATEST/search-index?q=%22Schedule+13D%22&dateRange=custom&startdt=${startdt}&enddt=${enddt}&hits.hits._source=display_names,file_date,form,adsh,biz_locations,sics&size=200`;
  } else if (type === "bankruptcy") {
    url = `https://efts.sec.gov/LATEST/search-index?q=%22bankruptcy%22&forms=8-K&dateRange=custom&startdt=${startdt}&enddt=${enddt}&hits.hits._source=display_names,file_date,form,adsh,biz_locations,sics,items&size=200`;
  } else if (type === "spinoff") {
    url = `https://efts.sec.gov/LATEST/search-index?forms=10-12G%2C10-12G%2FA&dateRange=custom&startdt=${startdt}&enddt=${enddt}&hits.hits._source=display_names,file_date,form,adsh,biz_locations,sics&size=100`;
  } else {
    return res.status(400).json({ error: "Unknown type. Use 13d, bankruptcy, or spinoff." });
  }

  try {
    const { status, body } = await fetchUrl(url);
    if (status !== 200) {
      return res.status(status).json({ error: `EDGAR returned ${status}`, url, body: body.slice(0, 300) });
    }
    const data = JSON.parse(body);
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message, url });
  }
};