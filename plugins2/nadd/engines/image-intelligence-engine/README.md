# Image Intelligence Engine

A **100-source image search, license and download engine** — zero npm dependencies,
CommonJS, Node 18+. Searches sources **sequentially** (one at a time, never 100
parallel browsers), normalizes every result into a universal object with honest
license metadata, dedupes, ranks, and downloads on demand.

```
USER (-image sunset mountain)
 ↓
query normalization + flag parsing
 ↓
smart source selection (command → curated source list, ≤10 sources)
 ↓
SOURCE #1 → search → normalize → release buffers
 ↓
SOURCE #2 → …
 ↓
deduplication (URL / title+creator / near-title)
 ↓
license filtering (--commercial, --cc0, --no-attribution …)
 ↓
ranking (relevance, resolution, license confidence, popularity …)
 ↓
final response (≤30 results, WhatsApp-paginated)
```

## Setup

```bash
cd image-engine
cp .env.example .env   # fill in API keys you have
node test/test-sources.cjs   # offline test suite (no network)
node api/server.cjs          # HTTP API on :3000 (PORT env)
node scheduler/daily-health.cjs  # daily source health check
```

Only services that require keys need them: `UNSPLASH_ACCESS_KEY`,
`PEXELS_API_KEY`, `PIXABAY_API_KEY`, `FLICKR_API_KEY`, `EUROPEANA_API_KEY`,
`SMITHSONIAN_API_KEY`, `HARVARD_API_KEY`, `RIJKSMUSEUM_API_KEY`,
`DPLA_API_KEY`, `DIGITALNZ_API_KEY`, `NYPL_API_TOKEN`. `OPENVERSE_TOKEN` is
optional. Sources without a key either throw a clear `auth_required` health
state or simply get skipped by the selector — one missing key never breaks a
search (failure isolation).

## Architecture

```
image-engine/
  lib/
    http.js          fetch wrapper: timeout, retries w/ backoff, 5-redirect cap,
                     byte cap, SSRF protection (DNS resolve + private-range
                     reject on EVERY hop), custom User-Agent
    scrape.js        fetchHtml, OpenGraph / JSON-LD / <img> extraction (transport
                     only — SELECTORS stay per-site in each adapter)
    base-source.js   wraps adapters: rate limiting, timeout, retries, health
    registry.js      exactly 100 entries (loads + validates sources/*.js)
    query.js         normalizeQuery + --flag parsing
    selector.js      COMMAND_SOURCE_MAP + smart selection + rotation
    normalizer.js    raw → universal image object (never invents licenses)
    license.js       license vocab, parsing, filters, download ALLOW/WARN/DENY
    ranker.js        0-100 scoring with reasons[]
    dedup.js         URL/title/creator/near-title merging + alsoFrom[]
    phash.js         dHash over supplied RGBA buffers (decoder is pluggable)
    download.js      license gate → SSRF fetch → size cap → magic-byte MIME
                     validation → SVG sanitize → temp file
    svg-sanitize.js  strips scripts, handlers, javascript: URLs, foreignObject
    cache.js         in-memory TTL result cache
    health.js        per-source status tracking
    engine.js        ImageSearchEngine (sequential search loop)
    report.js        daily health report JSON
  sources/           100 per-site adapters (unsplash.js … interfacelift.js)
  plugins/image.cjs  WhatsApp bot plugin (prefix `-`)
  api/server.cjs     zero-dep HTTP API
  scheduler/daily-health.cjs
  test/test-sources.cjs  offline tests · test/queries.txt  query sets
```

## WhatsApp commands (prefix `-`)

| Command | What it does |
|---|---|
| `-image <q>` / `-img` / `-photo` / `-photos` / `-picture` / `-pic` | photo search |
| `-wallpaper <q>` | wallpaper search (4k/phone/desktop via flags) |
| `-illustration <q>` | illustration search |
| `-vector <q>` | vector search |
| `-icon <q>` | icon search |
| `-freeimage <q>` | free-stock photo search |
| `-publicdomain <q>` / `-pd <q>` | public-domain / museum sources |
| `-ccimage <q>` / `-cc0 <q>` | CC0 / CC search |
| `-openimage <q>` | open-license search |
| `-imageall <q>` | search all relevant sources sequentially |
| `-bestimage <q>` | single top-ranked result |
| `-commercialimage <q>` | commercial-use-only results |
| `-imgurl <q>` | direct image URLs only |
| `-imagecompare <q>` | results grouped by source |
| `-imagedetail <n\|source:id>` | full metadata + license + attribution text |
| `-imgdl <n\|source id\|url>` / `-downloadimage` | download on demand (license-checked, temp file cleaned up) |
| `-imagestatus` | 100-source health table |
| `-imagesource enable\|disable\|test <id>` | owner-only source management |
| `-next` / `-prev` | paginate last search |
| `-imagehelp` | command list |

Flags: `--limit N --landscape --portrait --square --vertical --horizontal
--panorama --4k --hd --transparent --commercial --cc0 --public-domain
--license <v> --no-attribution --min-width N --min-height N --color <name>
--page N`

Example: `-image sunset --limit 20 --landscape --commercial`

## HTTP API

| Route | Description |
|---|---|
| `GET /search?q=&type=&limit=` | `type` = image\|photo\|illustration\|icon\|vector\|wallpaper\|publicdomain\|ccimage\|imageall … |
| `GET /image?source=&id=` | single image metadata |
| `POST /download` `{source,id}` | license-checked download (returns temp path) |
| `GET /health` | per-source status + latency |
| `GET /sources` | registry (id, type, transport, endpointVerified…) |

## License-honesty policy (the #1 rule)

- `unknown` is **never** converted to `free`.
- `free download` is **never** converted to `commercially unrestricted`.
- `royalty-free` is **never** converted to `public domain`.
- Every result carries `license`, `licenseUrl`, `licenseType`,
  `attributionRequired`, `commercialUse` (each nullable), and
  `licenseUnknown:true` when the source didn't say.
- Filters are strict: `--commercial` passes only `commercialUse === true`;
  `--no-attribution` passes only `attributionRequired === false`.
- Downloads: `decideDownload()` → `allow` | `warn` (unknown license — user
  decides) | `deny` (only for `Restricted`).
- Openverse/NASA/Wikimedia-style caveats are preserved in metadata
  (`licenseVerified:false`, `usageGuidelinesUrl`, per-image rights).

## `endpointVerified` meaning

- `true`: the endpoint URL was taken from official docs and the request/
  response shape follows them (17 APIs: Unsplash, Pexels, Pixabay, Openverse,
  Wikimedia, Flickr, NASA, Smithsonian, Europeana, LoC, Met, AIC, Cleveland,
  Rijksmuseum, DPLA, Internet Archive, Wallhaven).
- `false`: best-effort — page scraping or an unverified API shape. The engine
  surfaces this in `/sources`, `-imagestatus`, and health output. Treat
  results from these as "found, verify before reuse".

## The 100 sources

18 free-stock photo APIs/pages (Unsplash → Skitterphoto) · 7 added free-stock
sites (**pxhere, rawpixel, morguefile, freeimages, stockvault, newoldstock,
magdeleine**) · 25 open/public-domain/cultural (Wikimedia → British Library,
incl. Biodiversity Heritage Library) · 10 illustration (unDraw → Ouch) ·
10 vector/icon pages (SVG Repo → IconPark) · 20 open-source icon packages via
jsDelivr (OpenMoji → Maki) · 10 wallpaper (Wallhaven → InterfaceLIFT).

## How to add a source

1. Create `sources/<id>.js` exporting the adapter contract (see any existing
   adapter; `sources/pexels.js` for API, `sources/stocksnap.js` for page,
   `sources/lucide.js` for package).
2. Add the id to `IDS` in `lib/registry.js` (keep priority unique 1–100).
3. Optionally add it to a `COMMAND_SOURCE_MAP` list in `lib/selector.js`.
4. Run `node test/test-sources.cjs`.

## Bot wiring

Drop `plugins/image.cjs` into your bot's plugin folder:

- **wa-broadcast-suite**: copy to `plugins/` — auto-loaded, commands merge into
  the `-` prefix map. (`-imagesource` is owner-gated; the suite already routes
  only owner commands.)
- **Other bots**: use the exported `execute({sock,msg,args,text,sender,isOwner,reply})`
  fallback, or call `handleTextCommand(cmd, ctxLike, args)` directly.

The plugin keeps per-chat pagination sessions (10-min TTL), sends top-3
thumbnails, and never sends 30 full-resolution images at once.

## Live spot-check

Ran 2026-10-05 (no API keys — keyless endpoints only):

| Source | Query | Result |
|---|---|---|
| Wallhaven API | `sunset` limit 3 | ✅ 3 results in 802ms (sample: "Wallhaven pom5de 3840x2160", license Unknown — correctly not assumed) |
| Openverse API | `sunset` limit 3 | ✅ 3 results in 7.3s (sample: "Orange sunset", license CC BY-NC-SA mapped correctly) |
| Wikimedia API | `sunset` limit 3 | ✅ 3 results in 1.8s (sample license "CC BY 2.0" → normalized CC BY) |

Offline CI (`node test/test-sources.cjs`: 6155 assertions, 0 failures) covers
contracts, license honesty, parsing, ranking, dedup, SSRF and sanitization
without network.

## Known limitations

- Page adapters depend on site HTML; if a site redesigns, the adapter returns
  `[]` and health flips to `degraded` — it never crashes a search.
- Key-gated APIs (Unsplash, Pexels, …) need keys; without them those sources
  report `auth_required` and are skipped.
- True word-level perceptual dedup needs decoded pixels (pluggable via
  `lib/phash.js`); default dedup uses URL/title/creator keys.
- Never use this to build a permanent mirror of third-party catalogs:
  metadata + thumbnails + download-on-demand only.
