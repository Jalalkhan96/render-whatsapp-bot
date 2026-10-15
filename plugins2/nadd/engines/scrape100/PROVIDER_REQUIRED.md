# Provider-required sites

33 of 100 sites need an external provider (official API / Apify actor / partner access) because direct public HTTP extraction is blocked walled from here. No bypasses were attempted. Each entry states the truthful reason found during live probing (2026-10-05).

| # | Site | Reason |
|---|------|--------|
| 12 | hamariweb | All endpoints (homepage, www host, /rss/) return HTTP 403, empty replies, or time out from this datacenter IP — IP-based anti-bot blocking. No CAPTCHA or login wall is presented; the site loads from residential IPs. |
| 15 | brecorder | Cloudflare bot-mitigation challenge blocks all HTTP access: the homepage connection is terminated at the edge and /feed/ returns HTTP 403 with `cf-mitigated: challenge`. The challenge cannot be solved without bypassing anti-bot protection, so no public content is extractable. |
| 18 | sbp | Cloudflare "Attention Required!" JS challenge returns HTTP 403 for all pages, including the public exchange-rate endpoint /ecodata/forex.asp. The challenge cannot be solved without bypassing anti-bot protection, so no SBP data is extractable. |
| 20 | nadra | Akamai edge returns "Access Denied" (HTTP 403, errors.edgesuite.net) for all requests from this network — an IP/datacenter block. No public NADRA notices are reachable. |
| 22 | punjab-gov | Site unreachable from this network: DNS for punjab.gov.pk resolves to the 198.18.0.0/15 benchmarking range (sinkholed) and all connection attempts fail or time out (bare + www hosts, http/https, retries exhausted). |
| 24 | sindh-gov | Site unreachable from this network: DNS for sindh.gov.pk resolves to the 198.18.0.0/15 benchmarking range (sinkholed); homepage and /feed/ requests abort after repeated 35–45s timeouts (bare + www hosts, retries exhausted). |
| 26 | weather-gov | Cloudflare bot-mitigation challenge (HTTP 403, cf-mitigated: challenge) on weather.gov.pk, including /nwfc/daily-forecast; PMD's own pmd.gov.pk states live forecasts/alerts publish only at weather.gov.pk and carries no live figures. No values extractable without bypassing the challenge, and weather values must never be invented. |
| 34 | foodpanda | foodpanda.pk serves a PerimeterX (px-captcha) "Access to this page has been denied" block page (HTTP 403) to automated clients; no public restaurant-listing endpoint is reachable without bypassing the anti-bot challenge, which this system never does. |
| 35 | kfc | kfcpakistan.com is a client-rendered React SPA: pages return only an app shell with no menu data in HTML/JSON-LD, and the menu API base URL is obfuscated in the JS bundle with no publicly documented endpoint. Menu/prices require the official KFC ordering API or partnership feed. |
| 36 | dominos | dominos.com.pk is a client-rendered SPA: all pages return an empty app shell and the menu/deals load from an undocumented XStak ordering API requiring location/session context. Menu prices are not publicly reachable without it. |
| 37 | cheezious | cheezious.com is a client-rendered Next.js app: pages return only the app shell with no menu items or prices in HTML/flight data, and no public menu API endpoint exists (/api/menu, /api/products, /api/deals all 404). Menu data requires their internal ordering API. |
| 39 | airblue | airblue.com returns a Cloudflare "Just a moment..." challenge (HTTP 403) to automated clients; no public routes/schedules endpoint is reachable without bypassing it, which this system never does. |
| 40 | pia | piac.com.pk returns a Cloudflare "Just a moment..." challenge (HTTP 403) to automated clients; no public flight-info/routes endpoint is reachable without bypassing it, which this system never does. |
| 44 | pcb | pcb.com.pk is Cloudflare-guarded: the homepage and API paths return HTTP 403 / blocked responses to automated clients, so no public fixtures, results or news endpoint is reachable without bypassing the challenge, which this system never does. |
| 49 | telenor | telenor.com.pk returns HTTP 403 to automated clients; no public offers/pricing endpoint is reachable without bypassing the block, which this system never does. |
| 50 | nayatel | nayatel.com is client-rendered: package prices are absent from SSR HTML, flight data and JSON-LD (no public pricing figures anywhere on the page), and /api/* serves the SPA shell rather than JSON. Prices require their internal API. |
| 53 | reuters | reuters.com returns HTTP 401 anti-bot interstitial to all server-side requests (RSS feed endpoint, JSON content API, and news sitemap all verified 401 on 2026-10-05). Reuters has no unauthenticated public RSS feed or public JSON API; programmatic access requires a Reuters Connect commercial account / API key. |
| 54 | apnews | apnews.com returns HTTP 403 / resets connections (Akamai bot management) to all server-side requests including its public RSS endpoint, verified 2026-10-05 even with a full browser header set. No unauthenticated public API is exposed; AP content APIs require credentials. |
| 71 | reddit | Public JSON endpoints (/r/all/hot.json, /search.json) returned HTTP 403 from a datacenter IP; Reddit blocks unauthenticated datacenter traffic. Needs official Reddit API (OAuth) or a provider such as Apify. |
| 72 | x | login wall + anti-bot; public search redirects to login (HTTP 307), legacy syndication endpoints are dead (200 with empty body / retired). Needs official API or Apify actor. |
| 73 | instagram | login wall; public profile pages return the logged-out shell (HTTP 200) with no post/profile JSON. Needs official API or a provider such as Apify. |
| 74 | tiktok | datacenter IP blocked; /foryou returns a JS shell with captcha markers and no video data in the rehydration JSON. Needs official API or a provider such as Apify. |
| 76 | pinterest | login wall; homepage returns a logged-out unauth JS shell (HTTP 200) with no pin data; resource APIs require auth. Needs official API or a provider such as Apify. |
| 77 | threads | login wall; homepage returns the login shell (HTTP 200) with no public post data. Needs official API or a provider such as Apify. |
| 78 | linkedin | auth/anti-bot; /feed/ returns HTTP 302 to the login flow; no genuinely public content endpoint. Needs official API or a provider such as Apify. |
| 79 | quora | anti-bot; public topic page returned HTTP 403 from datacenter IP; no public data endpoint. Needs official API or a provider such as Apify. |
| 88 | bloomberg | paywall |
| 92 | ebay | anti-bot/CAPTCHA; needs official eBay Browse API or provider |
| 94 | walmart | anti-bot (PerimeterX/CAPTCHA); needs official Walmart API or provider |
| 95 | etsy | anti-bot; needs official Etsy API or provider |
| 96 | bestbuy | anti-bot (request blocked/timeout); needs official Best Buy API or provider |
| 99 | adidas | anti-bot (Akamai, request blocked/timeout); needs official adidas API or provider |
| 100 | booking | anti-bot; needs official Booking.com Connectivity/API partner access or provider |

Re-test any site with `node tests/runOne.cjs <id>` after obtaining API access or from a residential egress IP.
