const https = require(“https”);

module.exports = async function handler(req, res) {
res.setHeader(“Access-Control-Allow-Origin”, “*”);
res.setHeader(“Access-Control-Allow-Methods”, “GET, OPTIONS”);
if (req.method === “OPTIONS”) return res.status(200).end();

const sub = req.query.sub || “investing”;
const t = req.query.t || “day”;
const limit = req.query.limit || 25;

const url = `https://www.reddit.com/r/${sub}/top.json?t=${t}&limit=${limit}&raw_json=1`;

try {
const data = await new Promise((resolve, reject) => {
const options = {
hostname: “www.reddit.com”,
path: `/r/${sub}/top.json?t=${t}&limit=${limit}&raw_json=1`,
method: “GET”,
headers: {
“User-Agent”: “MarketSentimentDashboard/1.0 (by /u/kurtnightcap)”,
“Accept”: “application/json”
}
};

```
  const req = https.request(options, (response) => {
    let body = "";
    response.on("data", chunk => body += chunk);
    response.on("end", () => {
      try { resolve(JSON.parse(body)); }
      catch(e) { reject(new Error("JSON parse failed: " + body.slice(0, 100))); }
    });
  });

  req.on("error", reject);
  req.setTimeout(8000, () => { req.destroy(); reject(new Error("Timeout")); });
  req.end();
});

res.setHeader("Cache-Control", "public, max-age=300");
return res.status(200).json(data);
```

} catch(e) {
return res.status(500).json({ error: e.message });
}
};