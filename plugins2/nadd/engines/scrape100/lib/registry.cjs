'use strict';
/* Site registry — all 100 sites in the exact MASTER PROMPT §41 order.
 * Adapter modules live in scrapers/pakistan/*.cjs and scrapers/international/*.cjs. */
const path = require('path');

const SITES = [
  // ---- Pakistan (001-050) ----
  { id: 'dawn', name: 'Dawn', country: 'PK', category: 'pakistan_news', dir: 'pakistan', priority: 1 },
  { id: 'geo', name: 'Geo News', country: 'PK', category: 'pakistan_news', dir: 'pakistan', priority: 2 },
  { id: 'ary', name: 'ARY News', country: 'PK', category: 'pakistan_news', dir: 'pakistan', priority: 3 },
  { id: 'express', name: 'Express', country: 'PK', category: 'pakistan_news', dir: 'pakistan', priority: 4 },
  { id: 'thenews', name: 'The News', country: 'PK', category: 'pakistan_news', dir: 'pakistan', priority: 5 },
  { id: 'tribune', name: 'Pakistan Tribune', country: 'PK', category: 'pakistan_news', dir: 'pakistan', priority: 6 },
  { id: 'samaa', name: 'Samaa', country: 'PK', category: 'pakistan_news', dir: 'pakistan', priority: 7 },
  { id: 'aaj', name: 'Aaj', country: 'PK', category: 'pakistan_news', dir: 'pakistan', priority: 8 },
  { id: 'humnews', name: 'Hum News', country: 'PK', category: 'pakistan_news', dir: 'pakistan', priority: 9 },
  { id: 'dunya', name: 'Dunya News', country: 'PK', category: 'pakistan_news', dir: 'pakistan', priority: 10 },
  { id: 'urdupoint', name: 'UrduPoint', country: 'PK', category: 'pakistan_news', dir: 'pakistan', priority: 11 },
  { id: 'hamariweb', name: 'Hamariweb', country: 'PK', category: 'pakistan_news', dir: 'pakistan', priority: 12 },
  { id: 'nation', name: 'The Nation', country: 'PK', category: 'pakistan_news', dir: 'pakistan', priority: 13 },
  { id: 'pakobserver', name: 'Pakistan Observer', country: 'PK', category: 'pakistan_news', dir: 'pakistan', priority: 14 },
  { id: 'brecorder', name: 'Business Recorder', country: 'PK', category: 'business', dir: 'pakistan', priority: 15 },
  { id: 'profit', name: 'Profit Pakistan Today', country: 'PK', category: 'business', dir: 'pakistan', priority: 16 },
  { id: 'psx', name: 'Pakistan Stock Exchange', country: 'PK', category: 'stock_market', dir: 'pakistan', priority: 17 },
  { id: 'sbp', name: 'State Bank of Pakistan', country: 'PK', category: 'economy', dir: 'pakistan', priority: 18 },
  { id: 'fbr', name: 'FBR', country: 'PK', category: 'government', dir: 'pakistan', priority: 19 },
  { id: 'nadra', name: 'NADRA', country: 'PK', category: 'government', dir: 'pakistan', priority: 20 },
  { id: 'pakistan-gov', name: 'Pakistan Government', country: 'PK', category: 'government', dir: 'pakistan', priority: 21 },
  { id: 'punjab-gov', name: 'Punjab Government', country: 'PK', category: 'government', dir: 'pakistan', priority: 22 },
  { id: 'kp-gov', name: 'KP Government', country: 'PK', category: 'government', dir: 'pakistan', priority: 23 },
  { id: 'sindh-gov', name: 'Sindh Government', country: 'PK', category: 'government', dir: 'pakistan', priority: 24 },
  { id: 'balochistan-gov', name: 'Balochistan Government', country: 'PK', category: 'government', dir: 'pakistan', priority: 25 },
  { id: 'weather-gov', name: 'Pakistan Meteorological Dept', country: 'PK', category: 'weather', dir: 'pakistan', priority: 26 },
  { id: 'zameen', name: 'Zameen', country: 'PK', category: 'real_estate', dir: 'pakistan', priority: 27 },
  { id: 'graana', name: 'Graana', country: 'PK', category: 'real_estate', dir: 'pakistan', priority: 28 },
  { id: 'olx', name: 'OLX Pakistan', country: 'PK', category: 'shopping', dir: 'pakistan', priority: 29 },
  { id: 'daraz', name: 'Daraz', country: 'PK', category: 'shopping', dir: 'pakistan', priority: 30 },
  { id: 'priceoye', name: 'PriceOye', country: 'PK', category: 'electronics', dir: 'pakistan', priority: 31 },
  { id: 'telemart', name: 'Telemart', country: 'PK', category: 'electronics', dir: 'pakistan', priority: 32 },
  { id: 'shophive', name: 'ShopHive', country: 'PK', category: 'electronics', dir: 'pakistan', priority: 33 },
  { id: 'foodpanda', name: 'Foodpanda Pakistan', country: 'PK', category: 'food', dir: 'pakistan', priority: 34 },
  { id: 'kfc', name: 'KFC Pakistan', country: 'PK', category: 'food', dir: 'pakistan', priority: 35 },
  { id: 'dominos', name: "Domino's Pakistan", country: 'PK', category: 'food', dir: 'pakistan', priority: 36 },
  { id: 'cheezious', name: 'Cheezious', country: 'PK', category: 'food', dir: 'pakistan', priority: 37 },
  { id: 'sastaticket', name: 'Sastaticket', country: 'PK', category: 'travel', dir: 'pakistan', priority: 38 },
  { id: 'airblue', name: 'Airblue', country: 'PK', category: 'flights', dir: 'pakistan', priority: 39 },
  { id: 'pia', name: 'PIA', country: 'PK', category: 'flights', dir: 'pakistan', priority: 40 },
  { id: 'tapmad', name: 'Tapmad', country: 'PK', category: 'entertainment', dir: 'pakistan', priority: 41 },
  { id: 'cricbuzz', name: 'Cricbuzz', country: 'INT', category: 'cricket', dir: 'pakistan', priority: 42 },
  { id: 'espncricinfo', name: 'ESPNcricinfo', country: 'INT', category: 'cricket', dir: 'pakistan', priority: 43 },
  { id: 'pcb', name: 'PCB', country: 'PK', category: 'cricket', dir: 'pakistan', priority: 44 },
  { id: 'icc', name: 'ICC', country: 'INT', category: 'cricket', dir: 'pakistan', priority: 45 },
  { id: 'jazz', name: 'Jazz', country: 'PK', category: 'telecom', dir: 'pakistan', priority: 46 },
  { id: 'ufone', name: 'Ufone', country: 'PK', category: 'telecom', dir: 'pakistan', priority: 47 },
  { id: 'zong', name: 'Zong', country: 'PK', category: 'telecom', dir: 'pakistan', priority: 48 },
  { id: 'telenor', name: 'Telenor Pakistan', country: 'PK', category: 'telecom', dir: 'pakistan', priority: 49 },
  { id: 'nayatel', name: 'Nayatel', country: 'PK', category: 'telecom', dir: 'pakistan', priority: 50 },
  // ---- International (051-100) ----
  { id: 'bbc', name: 'BBC', country: 'INT', category: 'world_news', dir: 'international', priority: 51 },
  { id: 'cnn', name: 'CNN', country: 'INT', category: 'world_news', dir: 'international', priority: 52 },
  { id: 'reuters', name: 'Reuters', country: 'INT', category: 'world_news', dir: 'international', priority: 53 },
  { id: 'apnews', name: 'AP News', country: 'INT', category: 'world_news', dir: 'international', priority: 54 },
  { id: 'guardian', name: 'The Guardian', country: 'INT', category: 'world_news', dir: 'international', priority: 55 },
  { id: 'nytimes', name: 'New York Times', country: 'INT', category: 'world_news', dir: 'international', priority: 56 },
  { id: 'washingtonpost', name: 'Washington Post', country: 'INT', category: 'world_news', dir: 'international', priority: 57 },
  { id: 'aljazeera', name: 'Al Jazeera', country: 'INT', category: 'world_news', dir: 'international', priority: 58 },
  { id: 'dw', name: 'DW', country: 'INT', category: 'world_news', dir: 'international', priority: 59 },
  { id: 'france24', name: 'France 24', country: 'INT', category: 'world_news', dir: 'international', priority: 60 },
  { id: 'techcrunch', name: 'TechCrunch', country: 'INT', category: 'technology', dir: 'international', priority: 61 },
  { id: 'theverge', name: 'The Verge', country: 'INT', category: 'technology', dir: 'international', priority: 62 },
  { id: 'arstechnica', name: 'Ars Technica', country: 'INT', category: 'technology', dir: 'international', priority: 63 },
  { id: 'wired', name: 'Wired', country: 'INT', category: 'technology', dir: 'international', priority: 64 },
  { id: 'androidauthority', name: 'Android Authority', country: 'INT', category: 'technology', dir: 'international', priority: 65 },
  { id: '9to5google', name: '9to5Google', country: 'INT', category: 'technology', dir: 'international', priority: 66 },
  { id: 'macrumors', name: 'MacRumors', country: 'INT', category: 'technology', dir: 'international', priority: 67 },
  { id: 'tomshardware', name: "Tom's Hardware", country: 'INT', category: 'technology', dir: 'international', priority: 68 },
  { id: 'github-trending', name: 'GitHub Trending', country: 'INT', category: 'trending', dir: 'international', priority: 69 },
  { id: 'huggingface', name: 'Hugging Face', country: 'INT', category: 'ai', dir: 'international', priority: 70 },
  { id: 'reddit', name: 'Reddit', country: 'INT', category: 'social', dir: 'international', priority: 71 },
  { id: 'x', name: 'X', country: 'INT', category: 'social', dir: 'international', priority: 72 },
  { id: 'instagram', name: 'Instagram', country: 'INT', category: 'social', dir: 'international', priority: 73 },
  { id: 'tiktok', name: 'TikTok', country: 'INT', category: 'trending', dir: 'international', priority: 74 },
  { id: 'youtube', name: 'YouTube', country: 'INT', category: 'entertainment', dir: 'international', priority: 75 },
  { id: 'pinterest', name: 'Pinterest', country: 'INT', category: 'trending', dir: 'international', priority: 76 },
  { id: 'threads', name: 'Threads', country: 'INT', category: 'social', dir: 'international', priority: 77 },
  { id: 'linkedin', name: 'LinkedIn', country: 'INT', category: 'social', dir: 'international', priority: 78 },
  { id: 'quora', name: 'Quora', country: 'INT', category: 'community', dir: 'international', priority: 79 },
  { id: 'medium', name: 'Medium', country: 'INT', category: 'trending', dir: 'international', priority: 80 },
  { id: 'investing', name: 'Investing.com', country: 'INT', category: 'finance', dir: 'international', priority: 81 },
  { id: 'tradingview', name: 'TradingView', country: 'INT', category: 'finance', dir: 'international', priority: 82 },
  { id: 'yahoo-finance', name: 'Yahoo Finance', country: 'INT', category: 'finance', dir: 'international', priority: 83 },
  { id: 'coindesk', name: 'CoinDesk', country: 'INT', category: 'crypto', dir: 'international', priority: 84 },
  { id: 'coinmarketcap', name: 'CoinMarketCap', country: 'INT', category: 'crypto', dir: 'international', priority: 85 },
  { id: 'coingecko', name: 'CoinGecko', country: 'INT', category: 'crypto', dir: 'international', priority: 86 },
  { id: 'forbes', name: 'Forbes', country: 'INT', category: 'business', dir: 'international', priority: 87 },
  { id: 'bloomberg', name: 'Bloomberg', country: 'INT', category: 'business', dir: 'international', priority: 88 },
  { id: 'marketwatch', name: 'MarketWatch', country: 'INT', category: 'finance', dir: 'international', priority: 89 },
  { id: 'cnbc', name: 'CNBC', country: 'INT', category: 'business', dir: 'international', priority: 90 },
  { id: 'amazon', name: 'Amazon', country: 'INT', category: 'shopping', dir: 'international', priority: 91 },
  { id: 'ebay', name: 'eBay', country: 'INT', category: 'shopping', dir: 'international', priority: 92 },
  { id: 'aliexpress', name: 'AliExpress', country: 'INT', category: 'shopping', dir: 'international', priority: 93 },
  { id: 'walmart', name: 'Walmart', country: 'INT', category: 'shopping', dir: 'international', priority: 94 },
  { id: 'etsy', name: 'Etsy', country: 'INT', category: 'shopping', dir: 'international', priority: 95 },
  { id: 'bestbuy', name: 'Best Buy', country: 'INT', category: 'shopping', dir: 'international', priority: 96 },
  { id: 'newegg', name: 'Newegg', country: 'INT', category: 'shopping', dir: 'international', priority: 97 },
  { id: 'nike', name: 'Nike', country: 'INT', category: 'shopping', dir: 'international', priority: 98 },
  { id: 'adidas', name: 'Adidas', country: 'INT', category: 'shopping', dir: 'international', priority: 99 },
  { id: 'booking', name: 'Booking.com', country: 'INT', category: 'hotels', dir: 'international', priority: 100 },
];

const SCRAPER_ROOT = path.resolve(__dirname, '..', 'scrapers');

function getAdapter(id) {
  const meta = SITES.find(s => s.id === id);
  if (!meta) throw new Error(`unknown site: ${id}`);
  const file = path.join(SCRAPER_ROOT, meta.dir, `${id}.cjs`);
  try {
    return { meta, adapter: require(file) };
  } catch (err) {
    err.siteId = id;
    throw err;
  }
}

function listSites() { return SITES.slice(); }

module.exports = { SITES, SCRAPER_ROOT, getAdapter, listSites };
