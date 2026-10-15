# licensed-adult-finder v1.0

Legal-lane adult video search. Official developer APIs only, zero dependencies,
CommonJS (`.cjs`, `require()`), Node 18+.

**Not a scraper. Not a ripper.** There is no `--download` flag on purpose —
this tool returns metadata + official links (video page, official embed URL,
thumbnails) and nothing else. If you need the full file, open the official page
like a human.

## The rules baked in

1. **18+ gate.** Nothing runs without `--i-am-18` (or `LAF_I_AM_ADULT=1`).
2. **Official APIs only.** The registry accepts `kind: 'official-api'` entries
   and nothing else. Scrapers are refused at registration.
3. **Unknown license NEVER becomes free.** Results from unregistered sources are
   rejected, not passed through.
4. **Anime / hentai / doujinshi permanently excluded** — both as sources and as
   query terms. Standing rule: blind results from those pools risk
   underage-looking sexualized content.
5. **Proper attribution.** Every search appends to `attribution-log.json`:
   query, date, provider, each result's official URL, and the provider's
   terms + API docs. Provenance is never lost.

## Sources (verified 2026-10-06)

| Source | Kind | Auth | Status |
|---|---|---|---|
| Eporner API v2 | official-api | none | verified-live |

RedTube / YouPorn / Pornhub have no verifiably live official developer API in
2026, so they are **not** included. The registry is built to accept more
official APIs later — register one only if it's published by the provider
themselves.

## Usage

```bash
node finder.cjs --sources
node finder.cjs --i-am-18 --search "query" --per-page 30 --order mostviewed
node finder.cjs --i-am-18 --search "query" --format txt --out results.txt
node finder.cjs --i-am-18 --trending --per-page 20
node finder.cjs --i-am-18 --video pBzvT1TCytK
```

Orders: `latest | mostviewed | toprated | longest`. Formats: `json | csv | txt`.

## Adding a source

Official developer API only — published by the provider, documented, with
terms. Wire an adapter in `lib/`, normalize to the universal result format,
`registry.register()` it. Anything else is refused by design.

## Files

- `finder.cjs` — CLI
- `lib/http.cjs` — polite zero-dep HTTP (20s timeout, retries, 429 backoff, rate limit)
- `lib/registry.cjs` — source registry + permanent exclusions
- `lib/agegate.cjs` — 18+ confirmation
- `lib/eporner.cjs` — Eporner API v2 adapter
- `lib/license.cjs` — provenance/license engine
- `lib/rank.cjs` — transparent point ranker
- `lib/dedup.cjs` — provider+id dedup
- `lib/store.cjs` — attribution log
