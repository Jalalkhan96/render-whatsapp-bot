# Open Knowledge Engine

A **production-ready, zero-dependency, CommonJS (Node 18+)** multi-source open-knowledge and digital-archive search engine. Search across **100 sources** — Wikipedia, Wikidata, Internet Archive, Open Library, museums, research indexes, government open data, maps, web archives and more — through one normalized pipeline, with a WhatsApp bot plugin (`-` prefix).

Built from the 100-source master spec (sections 1–102). Every rule in that spec is enforced in code: official API first, sequential source processing, failure isolation, no fabrication, license honesty.

## Architecture

```
USER QUERY
  ↓  query-router.cjs      (detectCategory → selectSources; never all 100)
SOURCE 1 → request → parse → normalize → dedupe → save → cleanup
  ↓  search-engine.cjs      (concurrency=1 default; one source can never crash the run)
SOURCE 2 → …
  ↓  deduplicator.cjs       (identifier-first, then title+creator+date)
  ↓  result-ranker.cjs      (authority tiers: govt > museum/library > Wikimedia structured > research registry > archive > aggregator)
FINAL RESULTS (≤50)
```

### Directory layout

```
open-knowledge-engine/
├── commands.cjs            # WhatsApp bot plugin (all -commands, result cards)
├── .env.example            # API keys + tuning vars
├── core/
│   ├── http.cjs            # fetch wrapper: 20s timeout, 3 retries + backoff, 429 handling, per-source rate limits
│   ├── base-source.cjs     # BaseKnowledgeSource + universal result format + no-fabrication helpers
│   ├── registry.cjs        # loads + validates all 100 adapters
│   ├── metadata-normalizer.cjs  # book / research / archive_item / person / place / dataset normalizers
│   ├── query-router.cjs    # KnowledgeRouter { detectCategory, selectSources }
│   ├── search-engine.cjs   # sequential pipeline, pagination guards, failure isolation
│   ├── deduplicator.cjs    # identifier-first dedup + cross-source entity matching
│   ├── result-ranker.cjs   # ranking signals + source authority tiers
│   ├── license-engine.cjs  # license/rights evaluation (unknown NEVER → free)
│   ├── cache.cjs           # in-memory + JSON file cache (TTL 21600s)
│   ├── health-manager.cjs  # per-source health statuses + latency/error tracking
│   ├── scheduler.cjs       # fast/daily/weekly/bulk health pings (never full crawls)
│   ├── store.cjs           # JSON-file persistence for the 14 §90 tables
│   └── entity-graph.cjs    # subject/predicate/object/source/confidence triples
├── sources/
│   ├── wiki/        # 001–010  wikipedia … wikivoyage
│   ├── books/       # 011–020  internet-archive … feedbooks
│   ├── government/  # 021–030  loc … nasa
│   ├── museums/     # 031–040  europeana … harvard
│   ├── libraries/   # 041–045 + 091–094  trove … gallica
│   ├── research/    # 046–060  openalex … researchgate
│   ├── science/     # 061–070  noaa … imf
│   ├── maps/        # 071–080  openstreetmap … loc-web-archives
│   ├── aggregators/ # 081–090  dbpedia … open-product-data
│   └── misc/        # 095–100  google-arts-culture … huggingface
├── data/            # cache.json, health.json, store tables (created at runtime)
└── tests/
    └── run-tests.cjs  # per-source tests: connect/search/parse/normalize/license/pagination/dedup/cleanup
```

## Bot commands (prefix `-`)

| Command | Sources searched |
|---|---|
| `-wiki <q>` | Wikipedia, Wikidata, DBpedia |
| `-wikidata <q>` | Wikidata, WDQS, DBpedia, Wikipedia |
| `-archive <q>` / `-archiveall <q>` | Internet Archive, Wayback, LOC, Europeana, DPLA, British Library, Trove, DigitalNZ, Commons, Public Domain Review |
| `-book <q>` | Open Library, Internet Archive, Gutenberg, Google Books, HathiTrust, Standard Ebooks, ManyBooks |
| `-author <q>` | Open Library, Gutenberg, IA, Wikidata, Wikipedia, Standard Ebooks |
| `-document <q>` | IA, LOC, Europeana, DPLA, Wikisource, Gutenberg |
| `-history <q>` | Wikipedia, Wikisource, IA, LOC, Europeana, DPLA, Chronicling America, Trove |
| `-newspaper <q>` | Chronicling America, LOC, IA, Trove, Europeana, British Library, Google Books |
| `-paper <q>` / `-research <q>` | OpenAlex, Crossref, Semantic Scholar, arXiv, PubMed, PMC, Europe PMC, DOAJ, CORE, Zenodo (+ Figshare/OSF for -research) |
| `-dataset <q>` | Data.gov, data.europa.eu, World Bank, UN Data, OECD, WHO, IMF, Hugging Face, Zenodo, Figshare, Dryad |
| `-govdata <q>` | Data.gov, GovInfo, Congress, NARA, World Bank, UN, OECD, WHO, IMF, data.europa.eu |
| `-science <q>` | NASA, NOAA, USGS, OpenAlex, arXiv, PubMed, PMC, Europe PMC |
| `-place <q>` / `-mapinfo <q>` | OpenStreetMap, GeoNames, Wikidata, Wikipedia, Wikivoyage, Geograph |
| `-oldphoto <q>` | Commons, IA, LOC, Europeana, DPLA, Smithsonian, Trove, DigitalNZ, British Library, PICRYL |
| `-museum <q>` / `-art <q>` | Smithsonian, Met, Art Institute of Chicago, Cleveland, Rijksmuseum, Europeana, Harvard, Wellcome, Getty, Yale |
| `-publicdomain <q>` | Gutenberg, Standard Ebooks, LibriVox, IA, Commons, Public Domain Review, PICRYL, Wikisource |
| `-webarchive <q>` | Wayback, Common Crawl, Archive-It, UK Web Archive, LOC Web Archives |
| `-ai <q>` | Hugging Face, arXiv, OpenAlex, Semantic Scholar, Crossref, Zenodo |
| `-knowledge <q>` | Router detects the category and picks the best sources automatically |
| `-searchtext <q>` | Full-text search (IA, Open Library, LOC, Wikisource, Gutenberg) |
| `-booksearch <phrase>` | Search inside books (IA, Google Books, Open Library, LOC) |
| `-next` / `-prev` | Paginate the current result session |
| `-sourcehealth` | Health dashboard for all sources |
| `-testsource <id>` / `-testall` | Run the per-source test harness |
| `-ingest <source>` (+ `-ingeststatus/-ingestpause/-ingestresume/-ingeststop`) | **Admin only.** Bulk ingest, only for sources with official dumps |
| `-source enable|disable|test|info <id>` | **Admin only.** Source management |

Every result card ends with a **source citation** (source name, URL, retrieval timestamp, source identifier). Fields the source didn't provide render as `unknown` — never invented.

## Setup

```bash
cp .env.example .env
# edit .env — set OPENKNOWLEDGE_CONTACT (your email) and any API keys you have
node tests/run-tests.cjs --all        # full test suite
node tests/run-tests.cjs --source wikipedia  # single source
```

### Environment keys

All keys are **optional** — sources without keys degrade gracefully (`auth_required` status, skipped in searches, never faked):

`SMITHSONIAN_API_KEY, EUROPEANA_API_KEY, HARVARD_API_KEY, RIJKSMUSEUM_KEY, TROVE_KEY, DIGITALNZ_KEY, DPLA_KEY, CONGRESS_KEY, GOVINFO_KEY, BHL_KEY, CORE_KEY, OPENALEX_KEY, MAPILLARY_TOKEN, OPENCORPORATES_TOKEN, NOAA_TOKEN, DATA_GOV_API_KEY, NARA_API_KEY, GEONAMES_USERNAME (required for GeoNames), NASA_API_KEY, CROSSREF_EMAIL`

Tuning: `OPENKNOWLEDGE_CONTACT, KNOWLEDGE_REQUEST_TIMEOUT=20000, KNOWLEDGE_MAX_RETRIES=3, KNOWLEDGE_SOURCE_CONCURRENCY=1, KNOWLEDGE_CACHE_TTL=21600, MAX_RESULTS_PER_SOURCE=20, MAX_PAGES_PER_SOURCE=5, MAX_FINAL_RESULTS=50, WIKIDATA_SPARQL_ENDPOINT, KNOWLEDGE_BULK_ENABLED=0`

## Bot integration

`commands.cjs` is a drop-in WhatsApp plugin:

```js
// in your bot's plugin loader:
const ok = require('./path/to/open-knowledge-engine/commands.cjs');
// ok = { name:'open-knowledge', prefix:'-', commands:[...], handle }
// route: if message starts with '-' and command is in ok.commands → await ok.handle(cmd, args, ctx)
```

`ctx` may carry `{ isAdmin, isOwner, role }` — admin commands (`-ingest*`, `-source`) refuse non-admins. Result cards are plain text with emoji headers; sessions expire after 15 minutes.

## Source status table (honest)

Generated from the live registry (`node -e` over `core/registry.cjs`). ✅ = real implementation, keyless. ⚠️ = limited (partial API / degraded upstream). 🔑 = real implementation, needs a key (reports `auth_required` and is skipped without it). 🚧 = honest stub — returns `[]`, declares its status, never fabricates.

| # | Source | ID | Status | Key required |
|---|--------|----|--------|----------------|
| 1 | Wikipedia | `wikipedia` | ✅ ok | — |
| 2 | Wikidata | `wikidata` | ✅ ok | — |
| 3 | Wikimedia Commons | `wikimedia-commons` | ✅ ok | — |
| 4 | Wikisource | `wikisource` | ✅ ok | — |
| 5 | Wiktionary | `wiktionary` | ✅ ok | — |
| 6 | Wikibooks | `wikibooks` | ✅ ok | — |
| 7 | Wikiversity | `wikiversity` | ✅ ok | — |
| 8 | Wikiquote | `wikiquote` | ✅ ok | — |
| 9 | Wikinews | `wikinews` | ✅ ok | — |
| 10 | Wikivoyage | `wikivoyage` | ✅ ok | — |
| 11 | Internet Archive | `internet-archive` | ✅ ok | — |
| 12 | Open Library | `open-library` | ✅ ok | — |
| 13 | Project Gutenberg | `gutenberg` | ⚠️ limited | — |
| 14 | HathiTrust Digital Library | `hathitrust` | ⚠️ limited | — |
| 15 | Google Books | `google-books` | ✅ ok | — |
| 16 | ISFDB (Internet Speculative Fiction Database) | `isfdb` | 🚧 stub (not_implemented) | — |
| 17 | Standard Ebooks | `standardebooks` | ⚠️ limited | — |
| 18 | LibriVox | `librivox` | ✅ ok | — |
| 19 | ManyBooks | `manybooks` | 🚧 stub (not_implemented) | — |
| 20 | Feedbooks | `feedbooks` | 🚧 stub (not_implemented) | — |
| 21 | Library of Congress | `loc` | ✅ ok | — |
| 22 | Chronicling America (Historic Newspapers) | `chronicling-america` | ✅ ok | — |
| 23 | U.S. Congress (congress.gov) | `congress` | 🔑 auth_required | CONGRESS_KEY |
| 24 | GovInfo (U.S. Government Publishing Office) | `govinfo` | ⚠️ limited | — |
| 25 | Data.gov (U.S. Federal Open Data) | `datagov` | 🔑 auth_required | DATA_GOV_API_KEY,API_DATA_GOV_KEY |
| 26 | U.S. National Archives (NARA) | `nara` | 🔑 auth_required | NARA_API_KEY |
| 27 | National Archives Catalog | `nara-catalog` | 🔑 auth_required | NARA_API_KEY |
| 28 | Digital Public Library of America | `dpla` | 🔑 auth_required | DPLA_KEY |
| 29 | Smithsonian Institution Open Access | `smithsonian` | 🔑 auth_required | SMITHSONIAN_API_KEY |
| 30 | NASA Image and Video Library | `nasa` | ✅ ok | — |
| 31 | Europeana | `europeana` | 🔑 auth_required | EUROPEANA_API_KEY |
| 32 | British Library | `british-library` | 🚧 stub (not_implemented) | — |
| 33 | Wellcome Collection | `wellcome` | ✅ ok | — |
| 34 | Rijksmuseum | `rijksmuseum` | 🔑 auth_required | RIJKSMUSEUM_KEY |
| 35 | The Met (Metropolitan Museum of Art) | `met-museum` | ✅ ok | — |
| 36 | Art Institute of Chicago | `artic` | ✅ ok | — |
| 37 | Cleveland Museum of Art | `clevelandart` | ✅ ok | — |
| 38 | Getty Museum | `getty` | 🚧 stub (limited) | — |
| 39 | Yale University Collections | `yale` | 🚧 stub (limited) | — |
| 40 | Harvard Art Museums | `harvard` | 🔑 auth_required | HARVARD_API_KEY |
| 41 | Trove (National Library of Australia) | `trove` | ✅ ok | TROVE_KEY |
| 42 | DigitalNZ | `digitalnz` | ✅ ok | — |
| 43 | National Library of Australia (catalogue) | `nla` | 🚧 stub (limited) | — |
| 44 | National Archives of Australia | `naa` | 🚧 stub (limited) | — |
| 45 | Archives New Zealand | `nz-archives` | 🚧 stub (limited) | — |
| 46 | Internet Sacred Text Archive | `sacred-texts` | 🚧 stub (limited) | — |
| 47 | Perseus Digital Library | `perseus` | ⚠️ limited | — |
| 48 | Digital Bodleian (Oxford) | `bodleian` | ⚠️ limited | — |
| 49 | Gallica (Bibliothèque nationale de France) | `gallica` | ⚠️ limited | — |
| 50 | OpenAlex | `openalex` | ✅ ok | — |
| 51 | Crossref | `crossref` | ✅ ok | — |
| 52 | Semantic Scholar | `semanticscholar` | ✅ ok | — |
| 53 | arXiv | `arxiv` | ✅ ok | — |
| 54 | PubMed | `pubmed` | ✅ ok | — |
| 55 | PubMed Central | `pmc` | ✅ ok | — |
| 56 | Europe PMC | `europepmc` | ✅ ok | — |
| 57 | DOAJ | `doaj` | ✅ ok | — |
| 58 | CORE | `core` | ✅ ok | CORE_KEY |
| 59 | Zenodo | `zenodo` | ✅ ok | — |
| 60 | figshare | `figshare` | ✅ ok | — |
| 61 | Dryad | `dryad` | ✅ ok | — |
| 62 | OSF Preprints | `osf` | ✅ ok | — |
| 63 | SSRN | `ssrn` | 🚧 stub (not_implemented) | — |
| 64 | ResearchGate | `researchgate` | 🚧 stub (not_implemented) | — |
| 65 | NOAA Climate Data Online | `noaa` | 🔑 auth_required | NOAA_TOKEN |
| 66 | USGS Earthquake Hazards Program | `usgs` | ✅ ok | — |
| 67 | data.gov.uk | `datagovuk` | 🚧 stub (limited) | — |
| 68 | data.europa.eu | `dataeuropa` | 🚧 stub (limited) | — |
| 69 | World Bank Open Data | `worldbank` | ⚠️ limited | — |
| 70 | UN Data | `undata` | 🚧 stub (limited) | — |
| 71 | OECD Data (SDMX) | `oecd` | 🚧 stub (limited) | — |
| 72 | WHO Global Health Observatory | `who` | ⚠️ limited | — |
| 73 | UNESCO Institute for Statistics | `unesco-uis` | 🚧 stub (limited) | — |
| 74 | IMF Data Services | `imf` | 🚧 stub (limited) | — |
| 75 | OpenStreetMap (Nominatim) | `openstreetmap` | ✅ ok | — |
| 76 | GeoNames | `geonames` | 🔑 auth_required | GEONAMES_USERNAME |
| 77 | Wikimapia | `wikimapia` | 🚧 stub (limited) | — |
| 78 | Geograph Britain & Ireland | `geograph` | 🚧 stub (limited) | — |
| 79 | Mapillary | `mapillary` | 🔑 auth_required | MAPILLARY_TOKEN |
| 80 | Wayback Machine | `wayback` | ✅ ok | — |
| 81 | Common Crawl | `commoncrawl` | ✅ ok | — |
| 82 | Archive-It | `archive-it` | 🚧 stub (limited) | — |
| 83 | UK Web Archive | `uk-web-archive` | 🚧 stub (limited) | — |
| 84 | Library of Congress Web Archives | `loc-web-archives` | ⚠️ limited | — |
| 85 | DBpedia | `dbpedia` | ✅ ok | — |
| 86 | Wikidata Query Service | `wdqs` | ✅ ok | — |
| 87 | GeoNames Wikipedia Search | `geonames-wikipedia` | 🔑 auth_required | GEONAMES_USERNAME |
| 88 | OpenCorporates | `opencorporates` | ⚠️ limited | — |
| 89 | OpenSanctions | `opensanctions` | ⚠️ limited | — |
| 90 | Open Food Facts | `openfoodfacts` | ✅ ok | — |
| 91 | Open Beauty Facts | `openbeautyfacts` | ✅ ok | — |
| 92 | Open Products Facts | `openproductsfacts` | ✅ ok | — |
| 93 | Wikidata Products | `wikidata-products` | ⚠️ limited | — |
| 94 | Open Product Data | `open-product-data` | 🚧 stub (not_implemented) | — |
| 95 | Google Arts & Culture | `google-arts-culture` | 🚧 stub (not_implemented) | — |
| 96 | The Public Domain Review | `public-domain-review` | 🚧 stub (limited) | — |
| 97 | Picryl | `picryl` | 🚧 stub (limited) | — |
| 98 | Biodiversity Heritage Library | `bhl` | 🔑 auth_required | BHL_KEY |
| 99 | Smithsonian Biodiversity (Open Access) | `smithsonian-biodiversity` | 🔑 auth_required | SMITHSONIAN_API_KEY |
| 100 | Hugging Face Hub | `huggingface` | ✅ ok | — |

## Absolute rules (§101–102)

**NEVER:**
- 100 simultaneous scrapers / browser sessions / full-page crawls
- Unlimited downloads, recursion, or pagination
- Permanent mirrors of copyrighted books/articles (metadata + links only)
- Mapping `unknown` → `free`, or assuming visible = public domain
- Inventing sources, authors, dates, licenses, identifiers, URLs, coordinates, statistics
- Letting one source's failure crash a search
- Ordinary users triggering bulk ingestion (admin-only, dump sources only)

**ALWAYS:**
- `SOURCE → REQUEST → PARSE → NORMALIZE → SAVE → CLEANUP → NEXT SOURCE` (sequential)
- Official API → official dump → JSON/RDF → feed → HTML → (browser never)
- Timeouts (20s), retries (3× exponential backoff), per-source rate limits, 429 backoff
- Metadata only in interactive mode; bulk `.ingest` is a separate admin-only mode
- Every result carries its source citation

## Testing

`node tests/run-tests.cjs --all` — per source: contract check, connect, one small live search, parse/normalize (universal §7 format), license field, pagination limit, dedup, no-fabrication assertions. Stubs assert declared status + empty results.

## Known limitations (verified during build, 2026-10-05)

- **Nominatim (OpenStreetMap)** blocks some datacenter IPs; the adapter follows the documented API and reports the block honestly via healthCheck. Set `OPENKNOWLEDGE_CONTACT`.
- **Geograph's** documented API returns 404 (appears retired) → stub.
- **HathiTrust** bib API only supports identifier lookups (ISBN/OCLC/LCCN); free-text search → `[]`.
- **Standard Ebooks'** full OPDS catalog feed is now Patrons-only; adapter uses the open new-releases Atom feed.
- **data.gov (US)** CKAN is retired → now the GSA v4 Catalog API, key required (`DATA_GOV_API_KEY`).
- **NARA** catalog v1 serves SPA HTML → v2 API with `NARA_API_KEY`.
- **data.gov.uk** new platform has no JSON API; **data.europa.eu** hub search rejects unauthenticated GET; **UN Data / OECD / UNESCO-UIS / IMF** SDMX endpoints are heavy, moved, or unreachable → honest limited stubs.
- **figshare** POST search timed out from the build network; implemented to the documented shape with defensive parsing.
- **govinfo** full POST search timed out from the build network; falls back to `DEMO_KEY`; re-verify with a real `GOVINFO_KEY`.
- **Google Books** `www.googleapis.com` timed out from the build network; implemented to the documented v1 schema.
- **DBpedia Lookup** was down at build time; adapter falls back to bounded SPARQL label search.
- **Semantic Scholar** enforces strict rate limits (30 rpm, 2s delay in the adapter).
- **Wikidata Query Service** has a 2026–2027 backend migration in progress; the endpoint is configurable via `WIKIDATA_SPARQL_ENDPOINT`.
- **ResearchGate / SSRN / ISFDB / ManyBooks / Feedbooks / Google Arts & Culture / British Library / Getty / Yale / NLA / NAA / NZ Archives / Sacred Texts / Archive-It / UK Web Archive / Wikimapia / Open Product Data** have no usable public search API → honest stubs that return `[]` and say so. They are wired into the registry and router so they activate if an API appears.
- **OpenCorporates** now returns 401 without a token → limited until `OPENCORPORATES_TOKEN` is set.
