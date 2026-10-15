const fs = require('fs');
const path = require('path');
const { scrape } = require('./scraper');

const DATA_DIR = path.join(__dirname, 'data');
const CACHE_FILE = path.join(DATA_DIR, 'latest.json');
const intervalMs = Math.max(60_000, Number(process.env.PINTEREST_INTERVAL_MS) || 300_000);

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return { ids: [], items: [] };
  }
}

function writeCache(value) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CACHE_FILE, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function runOnce(query) {
  const previous = readCache();
  const result = await scrape(query);
  const oldIds = new Set(previous.ids || []);
  const fresh = result.items.filter(item => !oldIds.has(item.id));
  writeCache({
    fetchedAt: result.fetchedAt,
    query: result.query,
    url: result.url,
    ids: result.items.map(item => item.id).slice(0, 200),
    items: result.items,
  });
  console.log(`[PINTEREST] ${result.items.length} pins found; ${fresh.length} new`);
  fresh.forEach(item => console.log(`NEW: ${item.title}\n${item.url}\n`));
  return result;
}

async function main() {
  const queryIndex = process.argv.indexOf('--query');
  const query = queryIndex >= 0 ? process.argv[queryIndex + 1] || '' : '';
  await runOnce(query);
  if (process.argv.includes('--watch')) {
    console.log(`[PINTEREST] Watching every ${intervalMs} ms`);
    setInterval(() => runOnce(query).catch(error => {
      console.error('[PINTEREST] Poll failed:', error.message);
    }), intervalMs);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('[PINTEREST] Fatal error:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { runOnce };
