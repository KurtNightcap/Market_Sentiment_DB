export default async function handler(req, res) {
res.setHeader(“Access-Control-Allow-Origin”, “*”);
res.setHeader(“Access-Control-Allow-Methods”, “GET, OPTIONS”);
if (req.method === “OPTIONS”) return res.status(200).end();

const sub = req.query.sub || “investing”;
const t = req.query.t || “day”;
const limit = req.query.limit || 25;

const url = `https://www.reddit.com/r/${sub}/top.json?t=${t}&limit=${limit}`;

try {
const response = await fetch(url, {
headers: {
“User-Agent”: “MarketSentimentDashboard/1.0”
}
});
const data = await response.json();
res.setHeader(“Cache-Control”, “public, max-age=300”);
return res.status(200).json(data);
} catch(e) {
return res.status(500).json({ error: e.message });
}
}