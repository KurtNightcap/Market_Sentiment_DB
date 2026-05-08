export default async function handler(req, res) {
  const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const path = req.query.path || "/markets";
  const params = { ...req.query };
  delete params.path;

  const queryString = new URLSearchParams(params).toString();
  const kalshiUrl = `${KALSHI_BASE}${path}${queryString ? "?" + queryString : ""}`;

  try {
    const response = await fetch(kalshiUrl, {
      headers: { "Accept": "application/json" }
    });
    const data = await response.json();
    res.setHeader("Cache-Control", "public, max-age=30");
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
