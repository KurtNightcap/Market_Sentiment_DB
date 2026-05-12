const https = require("https");

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "*/*"
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
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("Timeout")); });
    req.end();
  });
}

function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                   item.match(/<title>(.*?)<\/title>/) || [])[1] || "";
    const link  = (item.match(/<link>(.*?)<\/link>/) || [])[1] || "";
    const date  = (item.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || "";
    const desc  = (item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) ||
                   item.match(/<description>(.*?)<\/description>/) || [])[1] || "";
    if (title) items.push({ title: title.trim(), link, date, description: desc.replace(/<[^>]+>/g,'').slice(0,200) });
  }
  return items;
}

const RSS_FEEDS = [
  { url: "https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC,^DJI,^IXIC&region=US&lang=en-US", source: "Yahoo Finance" },
  { url: "https://feeds.finance.yahoo.com/rss/2.0/headline?s=BTC-USD,ETH-USD&region=US&lang=en-US", source: "Yahoo Crypto" },
  { url: "https://finance.yahoo.com/news/rssindex", source: "Yahoo News" },
];

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const type = req.query.type || "news";

  try {
    if (type === "feargreed") {
      const { body } = await fetchUrl("https://production.dataviz.cnn.io/index/fearandgreed/graphdata");
      const data = JSON.parse(body);
      return res.status(200).json(data);
    }

    // Fetch all RSS feeds in parallel
    const results = await Promise.allSettled(
      RSS_FEEDS.map(f => fetchUrl(f.url).then(r => ({ ...r, source: f.source })))
    );

    const allItems = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value.status === 200) {
        const items = parseRSS(r.value.body).map(item => ({
          ...item,
          source: RSS_FEEDS[i].source
        }));
        allItems.push(...items);
      }
    });

    // Deduplicate by title
    const seen = new Set();
    const unique = allItems.filter(item => {
      if (seen.has(item.title)) return false;
      seen.add(item.title);
      return true;
    });

    res.setHeader("Cache-Control", "public, max-age=300");
    return res.status(200).json({ items: unique, count: unique.length });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
