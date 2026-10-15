# scrape100 — 100-site sequential web scraping system

Production-ready, CommonJS-only (`.cjs`, `require()`), Node 18+. Scrapes 100 websites
**one by one** (never in parallel), normalizes records, dedupes, persists to SQLite,
and cleans up after every site.

## Quick start

```bash
cd scrape100
npm install
cp .env.example .env   # optional; defaults work
node cli.cjs .scrape dawn
node cli.cjs .scrapeall
npm test
```

## Commands (`node cli.cjs <cmd>`, leading dot optional)

| Command | Description |
|---|---|
| `.scrape <site>` | Scrape one site (e.g. `.scrape dawn`) |
| `.scrapeall` | Sequential run of all enabled sites |
| `.scrapestatus` | Recent per-site run statuses |
| `.scrapefailed` | Failed sites from latest runs |
| `.scrapecategory <cat>` | Run all sites in a category |
| `.scrapecountry <PK\|INT>` | Run all sites in a country group |
| `.scrapesearch <site> <query>` | Search within a site |
| `.health [site]` | Source health states |
| `.schedule` | Start the built-in scheduler |

Env knobs: `SINCE=today|last_1_hour|last_6_hours|last_12_hours|last_24_hours|last_3_days|all`,
`LIMIT=n`, plus all `MAX_*` / `REQUEST_TIMEOUT` / `DEFAULT_REQUEST_DELAY_MS` from `.env.example`.

## Architecture

```
scrape100/
├── cli.cjs                  # command layer
├── lib/
│   ├── config.cjs           # env-driven limits
│   ├── logger.cjs           # structured logs + 14-day rotation
│   ├── http.cjs             # fetch: timeout, retry/backoff, size cap, polite delay
│   ├── extract.cjs          # JSON-LD, OpenGraph, RSS, canonical URLs, cleaning
│   ├── db.cjs               # node:sqlite schema + upsert dedup
│   ├── registry.cjs         # all 100 sites, exact §41 order
│   ├── base.cjs             # adapter contract validation
│   ├── manager.cjs          # ScraperManager — sequential queue
│   ├── health.cjs           # per-site health states
│   ├── report.cjs           # final JSON run report
│   └── scheduler.cjs        # built-in scheduler (high 45m / medium 4h / low 24h + daily master)
├── providers/               # reddit, x, instagram, tiktok, youtube, pinterest, threads, linkedin
├── scrapers/
│   ├── pakistan/            # 50 adapters (001–050)
│   └── international/       # 50 adapters (051–100)
└── tests/                   # 100 per-site tests + testAllSites runner
```

**Sequential guarantee:** `ScraperManager.runAll()` iterates sites in priority order with
`await` — scrape → normalize → dedupe → persist → cleanup → next. One site failure is
caught, logged, recorded in `scrape_site_runs`/`scrape_errors`, and the run continues.

**Method priority per adapter:** official API → RSS/feed → public JSON → server HTML.
No headless browser in core; a `provider-required` transport marks sites that need an
external provider (login wall, aggressive anti-bot, paywall, CAPTCHA) with a written reason.

**Respect rules:** robots/rate limits honored, no CAPTCHA/auth/paywall bypass, no private
data, images/videos stored as URLs only, full HTML never persisted (except `DEBUG=1`).

## Dependencies

- `cheerio` (HTML/XML parsing) — the only runtime dependency.
- `node:sqlite` (built into Node 22+) — zero-dependency SQLite. Node 18–20 is supported
  for adapters, but the DB layer needs Node 22+.

## Tests

```bash
npm test                      # all 100 sites, sequential: "100 total / X passed / Y degraded / Z failed"
node tests/runOne.cjs dawn    # single site
```

`passed` = real records extracted. `degraded` = site blocked/empty but adapter truthful
(provider-required or clean empty). `failed` = code bug (must fix). Exit code is non-zero
only when a real code bug exists.

## Provider-required sites

See `PROVIDER_REQUIRED.md` (generated after the test run) for the honest list of sites
that need an external API/provider, with reasons.
