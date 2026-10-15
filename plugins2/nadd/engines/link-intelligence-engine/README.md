# Link Intelligence Engine v1.0.0

Production-ready **URL shortener + expander + redirect tracer + link checker + safety intelligence**
module for apps and WhatsApp bots. Zero dependencies, CommonJS.

```
LONG URL → SHORT URL → REDIRECT CHAIN → FINAL DESTINATION
→ TRACKING PARAMS → AFFILIATE WRAPPERS → SAFETY ANALYSIS → NORMALIZED RESULT
```

## Layout

```
link-engine/
├── link-manager.js        # orchestrator: analyzeUrl / shortenWith / autoShorten / linkPreview
├── url-normalizer.js      # normalizeUrl()
├── url-validator.js       # http/https only; rejects javascript:, data:, file:, …
├── redirect-engine.js     # traceRedirects() — 301/302/303/307/308, meta refresh, public JS
├── redirect-tracer.js     # chat formatting for traces
├── shortener-detector.js  # domain registry + classification labels
├── resolver-engine.js     # sequential provider fallback (never parallel)
├── destination-analyzer.js# hostname / domain / path / tracking / affiliate
├── tracking-detector.js   # detectTracking() + cleanUrl() (functional params kept)
├── affiliate/affiliate-detector.js
├── safety-engine.js       # heuristic risk: unknown/low/medium/high
├── domain-analyzer.js     # registrable domain, punycode, IP host, lookalike signals
├── result-ranker.js       # cross-provider verification + conflict detection
├── cache.js               # TTL cache (failures cached briefly; private links never cached)
├── scheduler.js           # sequential queue — one source at a time
├── health-manager.js      # per-provider health: healthy/degraded/timeout/inactive/…
├── logger.js              # [LINK] structured logs, secrets never printed
├── security/
│   ├── ssrf.js            # blocks localhost/RFC1918/link-local/metadata IPs, re-checked per hop
│   └── monetized-detector.js # ad/wait/interstitial gates → INTERACTION_REQUIRED (never bypassed)
├── shorteners/            # 28 adapters (bitly, tinyurl, rebrandly, …, t2m) + _base.js
├── resolvers/             # wheregoes, unshortenit, unshortlink, redirectcheck, generic
├── providers/registry.js  # unified registry with priorities + rate limits
├── plugins/link-commands.cjs # WhatsApp bot plugin (`-` prefix)
└── tests/run.js           # 26 tests — `npm test`
```

## Quick start

```js
const LM = require('./link-manager');

// Full intelligence
const r = await LM.analyzeUrl('https://bit.ly/abc123');
console.log(r.finalDestination.url, r.security.risk, r.classification);

// Shorten — FREE, no API keys needed. Tries in order:
// is.gd → v.gd → da.gd → clck.ru → cleanuri → tinyurl (all live-verified, no key)
const s = await LM.autoShorten('https://example.com/long/page');
const one = await LM.shortenWith('https://example.com/long/page', 'isgd');

// Clean tracking params (keeps functional ones, redacts tokens)
const { clean, removed } = LM.cleanLink('https://example.com/p?id=1&utm_source=x');
```

No signup, no keys, no scraping hacks for shortening: the engine uses the
providers' own free public endpoints. Key-based providers (Bitly, Rebrandly,
Short.io, Dub, Cuttly, …) are tried automatically **only if** their key is set
in `.env`; otherwise they report `AUTH_REQUIRED` and are skipped in milliseconds —
never fake success. (Note: shorturl.at and t.ly web forms block datacenter IPs
with 403, so they are expand-only from servers; they work from your phone/PC.)

## WhatsApp bot

Drop `plugins/link-commands.cjs` into your bot's `plugins/` folder and set
`LINK_ENGINE_PATH` if the engine lives elsewhere:

| Command | Description |
|---|---|
| `-short [provider] <url>` | shorten (auto if no provider) |
| `-autoshort <url>` | pick best available provider |
| `-expand` / `-unshort <url>` | full expansion + intelligence card |
| `-redirecttrace <url>` | hop-by-hop chain |
| `-linkcheck <url>` | status / TLS / tracking / risk |
| `-linkpreview <url>` | title / description / image (small metadata only) |
| `-cleanlink <url>` | strip tracking, keep functional params |
| `-linkinfo <url>` | classification + provider + domain |
| `-comparelink <u1> <u2>` | same destination? |
| `-expandbulk <urls…>` | up to 20, sequential |
| `-linkstatus` / `-linkhealth` / `-linkhistory` | provider roster / health / history |
| `-linksearch <query>` | find providers |
| `-qr <url>` | QR code (optional npm `qrcode`) |

## Security boundaries (hard rules)

- **Resolves:** HTTP 301/302/303/307/308, meta refresh, public JS redirects,
  public redirect endpoints, affiliate/tracking wrappers.
- **Never bypasses:** CAPTCHA, Cloudflare challenges, logins, paywalls, ad/wait
  timers, human verification, **click-through interstitials** (e.g. da.gd shows
  an anti-phishing consent screen for fresh links) → returns
  `INTERACTION_REQUIRED` with the *advertised* destination surfaced for intel.
  The engine never auto-clicks through.
- **SSRF:** private/loopback/link-local/cloud-metadata targets blocked and
  re-validated at **every** hop (DNS-rebinding safe).
- **Privacy:** password-reset / session / token / invite URLs are never cached,
  never persisted raw, never sent to external scanners.
- **VirusTotal** only runs with an explicit key + explicit call, never automatically.
- Transparent UA `MyApp-LinkResolver/1.0` — never impersonates browsers/crawlers.
- HEAD first, GET fallback with 2 MB cap; never downloads full pages/media.
- Sequential execution everywhere; one source failure never crashes the engine.

## Database schema

See `db/schema.sql` for `links`, `redirect_hops`, `link_sources`, `link_checks`,
`link_safety`, `link_tracking`, `link_provider_health`, `link_scrape_runs`.

## Health

`node health-manager.js --check` pings every provider homepage once daily
(use a cron) and records `healthy/degraded/timeout/inactive`.
