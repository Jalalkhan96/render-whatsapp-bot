# Apify Rotator Kit

Multi-key rotation and automatic failover for Apify actors. Plug in up to 10+ Apify
API tokens; the client automatically rotates to the next available key when one
hits a rate limit, monthly usage cap, or goes invalid — with full logging at every
step so you can see exactly which key is being used and why.

Pre-wired for the 21 actors you're using across TikTok, Instagram, Facebook,
Reddit, Pinterest, YouTube, X, LinkedIn, Threads, and Snapchat.

## 1. Install

```bash
cd apify-rotator-kit
npm install
```

Or, if dropping this into an existing bot project, just copy `lib/`, `index.js`,
and merge `.env.example` into your own `.env`.

## 2. Configure your keys

Copy `.env.example` to `.env` and fill in your tokens:

```
APIFY_TOKEN_1=apify_api_xxxx
APIFY_TOKEN_2=apify_api_xxxx
...
APIFY_TOKEN_10=apify_api_xxxx
```

The rotator auto-detects **any** number of `APIFY_TOKEN_n` variables — add more
or fewer any time, no code changes needed.

## 3. Use it

```javascript
require("dotenv").config();
const apify = require("./index");

const results = await apify.tiktok.scrape({ searchQueries: ["cats"], resultsPerPage: 5 });
```

Run the included example:

```bash
npm run example
```

## How rotation works

- Each call goes through `callApify()`, which picks the next key that isn't on
  cooldown (round-robin).
- If that key's request fails, the error is classified and handled:

| Scenario | HTTP / signal | Action |
|---|---|---|
| Rate limit | `429` | Cooldown 60s, try next key |
| Monthly usage cap hit | `402` / `usage-hard-limit` | Cooldown 24h, try next key |
| Invalid / revoked token | `401` | Marked **permanently dead** (30-day cooldown) — fix the token in `.env` |
| Network error / timeout | fetch failure, abort | Cooldown 30s, try next key |
| Apify server error | `5xx` | Cooldown 15s, try next key |
| Actor not found | `404` | **Not retried** — every key would fail identically, so it fails fast |
| Anything else | — | **Not retried** — avoids silently burning through all 10 keys on a bug in your own request |
| All keys on cooldown | — | Throws with `err.allKeysExhausted = true` and a snapshot of each key's status |

Cooldown state is persisted to `data/apify-key-state.json`, so it survives a
process restart (important for a long-running bot deployed on something like
Katabump). Add that file to `.gitignore` (already done).

## Checking key health

```javascript
console.log(apify.statusText());
```

```
key_1: ✅ available | success=42 fail=0
key_2: ⛔ rate_limit (1m left) | success=10 fail=2
key_3: ✅ available | success=8 fail=0
...
```

Wire this into a bot admin command (e.g. `/apifystatus`) to check it live from
WhatsApp/Telegram/wherever your bot runs.

## Actor coverage

| Platform | Function | Actor |
|---|---|---|
| TikTok | `apify.tiktok.scrape(input)` | `clockworks/tiktok-scraper` |
| TikTok | `apify.tiktok.scrapeComments(input)` | `clockworks/tiktok-comments-scraper` |
| TikTok | `apify.tiktok.scrapeProfile(input)` | `clockworks/tiktok-profile-scraper` |
| TikTok | `apify.tiktok.scrapeHashtag(input)` | `clockworks/tiktok-hashtag-scraper` |
| TikTok | `apify.tiktok.scrapeVideo(input)` | `clockworks/tiktok-video-scraper` |
| Instagram | `apify.instagram.scrape(input)` | `apify/instagram-scraper` |
| Instagram | `apify.instagram.search(input)` | `apify/instagram-search-scraper` |
| Instagram | `apify.instagram.scrapeProfile(input)` | `apify/instagram-profile-scraper` |
| Instagram | `apify.instagram.scrapeComments(input)` | `apify/instagram-comment-scraper` |
| Facebook | `apify.facebook.search(input)` | `apify/facebook-search-scraper` |
| Facebook | `apify.facebook.scrapePosts(input)` | `apify/facebook-posts-scraper` |
| Facebook | `apify.facebook.scrapeComments(input)` | `apify/facebook-comments-scraper` |
| Reddit | `apify.reddit.scrape(input)` | `hipersoft/reddit-scraper` |
| Pinterest | `apify.pinterest.scrape(input)` | `subimpact/pinterest-scraper` |
| YouTube | `apify.youtube.scrape(input)` | `automation-lab/youtube-scraper` |
| X | `apify.x.scrape(input)` | `forge-api/x-scraper` |
| LinkedIn | `apify.linkedin.searchProfiles(input)` | `harvestapi/linkedin-profile-search` |
| LinkedIn | `apify.linkedin.scrapeProfilePosts(input)` | `apimaestro/linkedin-profile-posts` |
| LinkedIn | `apify.linkedin.scrapeJobs(input)` | `bebity/linkedin-jobs-scraper` |
| Threads | `apify.threads.scrape(input)` | `lergassy/threads-scraper` |
| Snapchat | `apify.snapchat.scrape(input)` | `automation-lab/snapchat-scraper` |

`input` for every function is passed straight through as the actor's JSON input —
check each actor's page on the Apify Store for its expected fields (search terms,
usernames, URLs, result limits, etc). This kit only handles the key
rotation/retry layer, not the actor-specific input shape.

Actor IDs live in one place — `lib/actors/registry.js` — so if Apify ever renames
or you swap to a different actor for a platform, you only change it there.

## Calling an actor that's not in the registry

Use the low-level helper directly:

```javascript
const { apifyRunSync } = require("./lib/apifyClient");

const data = await apifyRunSync("someOwner/some-actor", { your: "input" });
```

It gets the same rotation, retry, and logging behavior as everything else.

## Project structure

```
apify-rotator-kit/
├── index.js                 # main entry point, exports all platform wrappers
├── example.js                # working usage example
├── package.json
├── .env.example
├── lib/
│   ├── apifyRotator.js       # key pool, cooldown tracking, persistence
│   ├── apifyClient.js        # retry/rotation logic + error classification
│   └── actors/
│       ├── registry.js       # all actor IDs in one place
│       ├── tiktok.js
│       ├── instagram.js
│       ├── facebook.js
│       ├── linkedin.js
│       └── misc.js           # reddit, pinterest, youtube, x, threads, snapchat
└── data/
    └── apify-key-state.json  # auto-created; persisted cooldown state (gitignored)
```

## Integrating into an existing bot (e.g. a Node.js/Baileys WhatsApp bot)

1. Copy `lib/` and `index.js` into your bot's project (e.g. under `src/apify/`).
2. Merge the `APIFY_TOKEN_n` vars into your bot's existing `.env`.
3. `npm install dotenv` if not already present (only real dependency).
4. In your message handler:

```javascript
const apify = require("./src/apify"); // adjust path

// e.g. on a "/tiktok <query>" command
const results = await apify.tiktok.scrape({ searchQueries: [query], resultsPerPage: 10 });
```

5. Wrap calls in try/catch and check `err.allKeysExhausted` to send a graceful
   "search temporarily unavailable" reply instead of crashing the bot process.

## Notes / things to tune

- `MONTHLY_CAP` cooldown in `lib/apifyClient.js` defaults to 24h — adjust to
  match your actual Apify plan's reset cycle if it's not a rolling daily one.
- If you ever run multiple bot instances concurrently against the same key pool,
  the JSON-file state isn't safe for concurrent writes — swap `_loadState`/`_saveState`
  in `apifyRotator.js` for your SQLite DB (both the media-search-bot and
  restaurant-ordering-bot projects already use SQLite, so this is a natural fit).
- Actor input shapes differ per actor — this kit doesn't validate or transform
  input, it only handles which key gets used and what happens when that key fails.
