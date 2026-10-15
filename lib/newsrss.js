const axios = require('axios');
const cheerio = require('cheerio');

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36' };

function parseRss(xml) {
  try {
    const $ = cheerio.load(xml, { xmlMode: true });
    return $('item').map((i, el) => ({
      title: $(el).find('title').first().text().trim(),
      link: $(el).find('link').first().text().trim(),
      pubDate: $(el).find('pubDate').first().text().trim(),
      source: $(el).find('source').first().text().trim() || $(el).find('dc\\\\:source').text().trim()
    })).get().filter(i => i.title && i.title !== '');
  } catch (e) {
    throw new Error('RSS parse failed: ' + e.message);
  }
}

async function fetchRss(url, limit = 10) {
  const res = await axios.get(url, { timeout: 20000, headers: UA, maxRedirects: 5 });
  const items = parseRss(res.data);
  return items.slice(0, limit);
}

async function googleNews(query, region = 'PK', limit = 10) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en&gl=${region}&ceid=${region}:en`;
  const res = await axios.get(url, { timeout: 20000, headers: UA });
  const items = parseRss(res.data);
  return items.slice(0, limit);
}

const SOURCES = {
  pakistan: { type: 'gnews', q: 'pakistan', region: 'PK', label: '🇵🇰 Pakistan News' },
  world: { type: 'gnews', q: 'world news', region: 'US', label: '🌍 World News' },
  pakistanenglish: { type: 'gnews', q: 'pakistan English news', region: 'PK', label: '🇵🇰 Pakistan (English)' },
  dawn: { type: 'gnews', q: 'site:dawn.com', region: 'PK', label: '🌄 Dawn News' },
  geo: { type: 'gnews', q: 'site:geo.tv OR site:geoenglish.com', region: 'PK', label: '🟥 Geo News' },
  tribune: { type: 'gnews', q: 'site:tribune.com.pk', region: 'PK', label: '📰 Express Tribune' },
  jang: { type: 'gnews', q: 'site:jang.com.pk', region: 'PK', label: '📓 Daily Jang (Urdu)' },
  ary: { type: 'gnews', q: 'site:arynews.tv', region: 'PK', label: '🎬 ARY News' },
  samaa: { type: 'gnews', q: 'site:samaa.tv', region: 'PK', label: '🟢 Samaa TV' },
  humnews: { type: 'gnews', q: 'site:humnetwork.tv', region: 'PK', label: '🟣 HUM News' },
  bbc: { type: 'rss', url: 'https://feeds.bbci.co.uk/news/rss.xml', label: '📻 BBC News' },
  bbcworld: { type: 'rss', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', label: '🌍 BBC World' },
  bbcurdu: { type: 'rss', url: 'https://www.bbc.com/urdu/index.xml', label: '🟡 BBC Urdu' },
  aljazeera: { type: 'rss', url: 'https://www.aljazeera.com/xml/rss/all.xml', label: '🌙 Al Jazeera' },
  reuters: { type: 'gnews', q: 'site:reuters.com', region: 'US', label: '📡 Reuters' },
  cnn: { type: 'gnews', q: 'site:cnn.com', region: 'US', label: '🔴 CNN' },
  skynews: { type: 'gnews', q: 'site:news.sky.com', region: 'GB', label: '🌤️ Sky News' },
  indiatoday: { type: 'gnews', q: 'site:indiatoday.in', region: 'IN', label: '🇮🇳 India Today' },
  ndtv: { type: 'gnews', q: 'site:ndtv.com', region: 'IN', label: '🇮🇳 NDTV' },
  techcrunch: { type: 'gnews', q: 'site:techcrunch.com', region: 'US', label: '💻 TechCrunch' },
  cricket: { type: 'gnews', q: 'cricket match', region: 'PK', label: '🏏 Cricket News' }
};

async function getNews(query) {
  const cfg = SOURCES[query] || SOURCES.pakistan;
  if (cfg.type === 'rss') {
    const items = await fetchRss(cfg.url, 8);
    return { label: cfg.label, items };
  }
  const items = await googleNews(cfg.q, cfg.region, 8);
  return { label: cfg.label, items };
}

module.exports = { fetchRss, googleNews, parseRss, getNews, SOURCES };