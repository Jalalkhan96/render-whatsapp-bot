# Meme Search Engine

Zero-dependency, CommonJS, Node 18+. Searches the meme sites that are
actually free to query — no API keys — ranks the hits, dedups them, labels
licenses honestly, and downloads with attribution sidecars.

## Sources (verified live, key-free)

| Source      | What it is                                              | License label |
|-------------|-----------------------------------------------------------|---------------|
| `imgflip`   | api.imgflip.com/get_memes — 100 most-captioned templates  | `unknown`     |
| `memeapi`   | meme-api.com — live Reddit meme subs (incl. r/pepethefrog)| `unknown`     |
| `wikimedia` | Wikimedia Commons file search — CC/PD files w/ metadata   | `free`        |

Reddit's direct JSON API blocks datacenter IPs, so `memeapi` (a Reddit
proxy) is the Reddit lane. Know Your Meme has no public API and sits behind
Cloudflare — not scrapable key-free, excluded honestly. Giphy/Tenor need
keys — adapters exist as `auth_required` stubs (see SOURCES below).

## Quick start

```bash
node bin/meme.cjs search "pepe the frog" --limit 20
node bin/meme.cjs search "pepe the frog" --limit 20 --format csv --out pepes.csv
node bin/meme.cjs search "pepe the frog" --download --dir ./pepes
node bin/meme.cjs sources            # list sources + health
node bin/meme.cjs test               # offline test suite
node examples/pepe.cjs               # Pepe demo
```

Library use:

```js
const { searchMemes } = require('./src/index.cjs');
const hits = await searchMemes('pepe the frog', { limit: 20, nsfw: false });
for (const h of hits) console.log(h.score.toFixed(1), h.title, h.imageUrl);
```

## Options

```
search <query>
  --limit N        max results (default 20)
  --sources a,b    subset of: imgflip,memeapi,wikimedia (default all)
  --format fmt     json | csv | txt (default json to stdout; txt is titles+urls)
  --out FILE       write output to file instead of stdout
  --download       download images to --dir (default ./downloads)
  --dir DIR        download directory
  --nsfw           include NSFW results (default: excluded)
  --no-cache       bypass the 1h disk cache
  --timeout MS     per-request timeout (default 20000)
```

## Result shape

```js
{
  id: 'memeapi:pepethefrog:1w3210k',
  source: 'memeapi',
  title: 'Falling Down Apu movie poster [OC]',
  imageUrl: 'https://i.redd.it/k2h2su9gqmmh1.png',
  pageUrl: 'https://redd.it/1w3210k',
  author: 'FrogRampant',
  ups: 179,
  nsfw: false,
  width: null, height: null,
  license: { status: 'unknown', name: null, url: null, attribution: null },
  score: 23.4
}
```

Wikimedia hits carry `license: { status:'free', name:'CC BY 2.0',
url:'https://…', attribution:'Photo: … / Wikimedia Commons' }`.

## SOURCES (why some sites are missing)

- `giphy`, `tenor`: need API keys → `auth_required`. Set
  `GIPHY_API_KEY` / `TENOR_API_KEY` env vars; the stubs in
  `src/sources/index.cjs` show the exact adapter contract.
- `knowyourmeme`: no public API + Cloudflare → not feasible key-free.
- `reddit` direct JSON: returns a block page from datacenter IPs →
  routed through `memeapi` instead. The engine never fakes a source.
