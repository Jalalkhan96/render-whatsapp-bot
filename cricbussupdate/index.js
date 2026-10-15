const fs = require('fs');
const path = require('path');
const { scrape } = require('./scraper');

const DATA_DIR = path.join(__dirname, 'data');
const CACHE_FILE = path.join(DATA_DIR, 'latest.json');
const intervalMs = Math.max(60_000, Number(process.env.CRICBUZZ_INTERVAL_MS) || 300_000);

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return { ids: [], items: [] };
  }
}

function writeCache(payload) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CACHE_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function runOnce() {
  const previous = readCache();
  const result = await scrape();
  const previousIds = new Set(previous.ids || []);
  const newItems = result.items.filter(item => !previousIds.has(item.id));
  writeCache({
    fetchedAt: result.fetchedAt,
    ids: result.items.map(item => item.id).slice(0, 200),
    items: result.items,
    failures: result.failures,
  });
  console.log(`[CRICBUZZ] ${result.items.length} items fetched; ${newItems.length} new`);
  if (result.failures.length) {
    console.warn('[CRICBUZZ] Source failures:', result.failures);
  }
  for (const item of newItems) {
    console.log(`NEW: ${item.title}\n${item.url}\n`);
  }
  return result;
}

async function main() {
  await runOnce();
  if (process.argv.includes('--watch')) {
    console.log(`[CRICBUZZ] Watching every ${intervalMs} ms`);
    setInterval(() => runOnce().catch(error => {
      console.error('[CRICBUZZ] Poll failed:', error.message);
    }), intervalMs);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('[CRICBUZZ] Fatal error:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { runOnce };
