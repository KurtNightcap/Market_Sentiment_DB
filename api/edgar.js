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
  const enddt = req.query.enddt || new Date().toISOString().split("T")[0];

  const EDGAR = "https://efts.sec.gov/LATEST/search-index";

  // Build URL based on type
  let url = "";

  if (type === "13d") {
    url = `${EDGAR}?q=%22Schedule+13D%22&dateRange=custom&startdt=${startdt}&enddt=${enddt}&hits.hits._source=display_names,file_date,form,adsh,biz_locations,sics&size=200`;

  } else if (type === "bankruptcy") {
    url = `${EDGAR}?q=%22bankruptcy%22&forms=8-K&dateRange=custom&startdt=${startdt}&enddt=${enddt}&hits.hits._source=display_names,file_date,form,adsh,biz_locations,sics,items&size=200`;

  } else if (type === "spinoff") {
    url = `${EDGAR}?forms=10-12G,10-12G%2FA&dateRange=custom&startdt=${startdt}&enddt=${enddt}&hits.hits._source=display_names,file_date,form,adsh,biz_locations,sics&size=100`;

  } else if (type === "fadedipos") {
    // S-1 filings from 2020-2022 = faded fad IPO candidates
    url = `${EDGAR}?forms=S-1&dateRange=custom&startdt=2020-01-01&enddt=2022-12-31&hits.hits._source=display_names,file_date,form,adsh,biz_locations,sics&size=200`;

  } else if (type === "spacs") {
    // S-4 filings = SPAC merger registrations 2020-2022
    url = `${EDGAR}?forms=S-4&q=%22blank+check%22&dateRange=custom&startdt=2020-01-01&enddt=2022-12-31&hits.hits._source=display_names,file_date,form,adsh,biz_locations,sics&size=200`;

  } else if (type === "fallenangels") {
    // 8-K with significant loss/impairment language = fallen angels
    url = `${EDGAR}?q=%22significant+decline%22+%22impairment%22&forms=8-K&dateRange=custom&startdt=${startdt}&enddt=${enddt}&hits.hits._source=display_names,file_date,form,adsh,biz_locations,sics,items&size=100`;

  } else if (type === "pipes") {
    // PIPE transactions show up as S-3 or 8-K with private placement language
    url = `${EDGAR}?q=%22private+placement%22+%22private+investment+in+public+equity%22&forms=8-K&dateRange=custom&startdt=${startdt}&enddt=${enddt}&hits.hits._source=display_names,file_date,form,adsh,biz_locations,sics&size=100`;

  } else if (type === "restructuring") {
    // Out of court restructurings
    url = `${EDGAR}?q=%22out-of-court+restructuring%22+%22restructuring%22&forms=8-K&dateRange=custom&startdt=${startdt}&enddt=${enddt}&hits.hits._source=display_names,file_date,form,adsh,biz_locations,sics&size=100`;

  } else {
    return res.status(400).json({ error: "Unknown type. Use: 13d, bankruptcy, spinoff, fadedipos, spacs, fallenangels, pipes, restructuring" });
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
