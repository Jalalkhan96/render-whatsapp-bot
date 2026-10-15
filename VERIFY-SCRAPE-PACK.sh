#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-$(pwd)}"
BASE="$ROOT/plugins2/scrape"

[ -d "$BASE" ] || { echo "❌ Missing $BASE"; exit 1; }

for f in "$BASE"/*.js; do
  [ -f "$f" ] || continue
  node --check "$f"
done

find "$BASE/engines" -type f \( -name '*.js' -o -name '*.cjs' -o -name '*.mjs' \) -print0 |
  while IFS= read -r -d '' f; do node --check "$f"; done

node "$BASE/engines/meme-search-engine/test/run.cjs"
node "$BASE/engines/sound-meme-engine/test/run.cjs"
node - <<'NODE'
const pin = require('./plugins2/scrape/engines/pinterest/index.cjs');
const html = '<meta property="og:image" content="https://i.pinimg.com/736x/aa/bb/cc/example.jpg">';
const r = pin.extractMediaFromHtml(html, 5);
if (r.length !== 1 || r[0].type !== 'image') process.exit(1);
console.log('✅ Pinterest parser self-test passed');
const pt = require('./plugins2/scrape/pintest.js');
const h2 = '<img alt="Cyberpunk" src="https://i.pinimg.com/originals/aa/bb/example.jpg">';
const r2 = pt.extractPinsFromHtml(h2, 5);
if (r2.length !== 1 || r2[0].image_url !== 'https://i.pinimg.com/originals/aa/bb/example.jpg') process.exit(1);
console.log('✅ Pintest plugin self-test passed');
NODE

echo '✅ ABIX scrape pack verification passed'
