# 🎵 music-engine — Music Intelligence & Song Discovery Engine

A complete, production-ready music search module for your bot/app. Zero npm
dependencies, CommonJS, Node ≥ 18. Built for servers with limited RAM/disk:
external sources are processed **one by one**, never in parallel, and every
response body is released after parsing.

## What it does

From a song name, artist, lyric fragment, album, ISRC, Spotify/YouTube/Apple
Music URL, or audio clip, the engine:

1. normalizes the query (case, unicode, diacritics, Roman Urdu/Hindi variants —
   `Afreen Afreen` / `afrin afrin` / `عفریں` stay findable, while
   `Kahani Suno` ≠ `Kahani Suno 2.0`)
2. searches metadata providers sequentially (MusicBrainz → Spotify → Apple →
   Deezer → JioSaavn → YouTube …)
3. verifies the match (title, artist, album, **version**, duration, year, ISRC —
   remix/live/acoustic/sped-up are never merged with the original)
4. cascades lyrics providers (Musixmatch → LyricFind → Genius → Lyrics.com →
   LyricsTranslate → … → regional sources)
5. enriches with artist/album info, meaning, facts, samples, translations,
   charts and cross-platform trending

## Layout

```
music-engine/
  music/
    index.js            public API
    music-manager.js    full pipeline (search/lyrics/artist/album/meaning/…)
    search-engine.js    query classification + provider cascade
    query-normalizer.js normalization, ISRC/URL detection, roman variants
    track-matcher.js    confidence scoring, version-conflict detection
    result-ranker.js    +25/+25/+30/+10/+5/+5 point scheme, strong|probable|uncertain
    deduplicator.js     ISRC → provider-id → URL → title+artist+duration
    scheduler.js        SEQUENTIAL source queue (concurrency = 1)
    health-manager.js   per-source health: healthy|degraded|timeout|blocked|
                        changed|auth_required|disabled (+ circuit breaker)
    cache.js            file-backed TTL cache (track/lyrics/chart/trend)
    db.js               JSON database (metadata/ids/urls only)
    http.js / html.js   shared fetch + parsing helpers
    logger.js           compact `[3/40] Genius SUCCESS` logs, rotating file
    source-registry.js  all 64 sources with priorities
    bot-commands.cjs    Baileys plugin, `-` prefix
    api.js              HTTP API (node:http, express-mountable)
    daily-scraper.js    scheduled job (spec §68 order)
    lyrics/             19 adapters (Genius … LyricsRead)
    metadata/           12 adapters (MusicBrainz … Bandcamp)
    recognition/        5 adapters (Shazam, SoundHound, ACRCloud, AudD, Musipedia)
    charts/             8 adapters (Billboard … Genius Charts)
    regional-platforms/ 9 adapters (Gaana, JioSaavn, …, Coke Studio PK, Patari)
    translation/        2 adapters (link-only translations)
    regional/           7 strategy modules (pakistan, india, punjabi, urdu,
                        pashto, bengali, south-indian)
    info/               songfacts, whosampled
  tests/
    unit.js             offline unit tests (normalizer, matcher, dedup, ranker)
    run.js              live adapter test runner (small limits, no media)
  data/                 cache.json, music-db.json, health.json, logs/ (runtime)
```

## Quick start

```bash
cd music-engine
cp .env.example .env   # fill in the API keys you have; the rest report AUTH_REQUIRED
node -e "
const { MusicManager } = require('./music');
(async () => {
  const m = new MusicManager();
  console.log(JSON.stringify(await m.search('Kahani Suno Kaifi Khalil'), null, 1));
})();
"
```

### WhatsApp bot (Baileys)

```js
const music = require('./music/bot-commands.cjs');
// in your message handler:
const handled = await music.handleMusicMessage(text, {
  reply: async (t) => sock.sendMessage(jid, { text: t }),
  sender, audioBuffer, mime,
});
if (handled) return;
```

Commands: `-musicmenu -song -lyrics -findsong -artist -album -songmeaning
-songfacts -sampled -translate-song -trendingmusic -chart -newmusic
-identify -identifyvoice -pklyrics -urdulyrics -hindilyrics -punjabilyrics`

### HTTP API

```bash
node music/api.js   # :3100
curl 'localhost:3100/api/music/search?q=Kahani%20Suno'
curl 'localhost:3100/api/music/lyrics?q=Pasoori'
curl 'localhost:3100/api/music/trending?country=pk'
curl 'localhost:3100/api/music/identify' -X POST -d '{"audioBase64":"..."}'
```

Or mount in Express: `app.use('/api/music', require('./music/api').expressRouter())`.

### Daily scraper

```bash
node music/daily-scraper.js
# cron: 0 4 * * * cd /path/music-engine && node music/daily-scraper.js
```

## Legal / access policy (enforced by design)

- Only official APIs, licensed providers, and publicly accessible pages.
- No CAPTCHA/paywall/login bypass, no private profiles, no protected media downloads.
- **Lyrics: the engine returns the provider link + availability, never a full
  copyrighted lyric dump.** Short excerpts appear only where the source
  explicitly permits them.
- **Translations: link + availability + summary only** — no full unauthorized
  translated copies are generated or stored.
- Sources that need credentials you haven't provided report `auth_required`
  (never fake success). Changed/blocked sites report `source_changed`/`blocked`
  and the engine continues with the next provider.

## Source health

`GET /api/music/health` or `data/health.json`. Statuses:
`healthy · degraded · timeout · blocked · changed · auth_required · disabled`.
A source failing 5× in a row is circuit-broken for 30 minutes, then retried.

## Adding a source

1. Create `music/<group>/<id>.js` exporting `{ META, search, lookup, health }`
   (see any existing adapter; use `../http` and `../html` helpers).
2. Add `['<group>', '<id>']` to `ADAPTER_PATHS` in `music/source-registry.js`.
3. Test: `node tests/run.js <id>`.

## Tests

```bash
node tests/unit.js            # offline: normalization, versioning, ranking
node tests/run.js             # live: every adapter, 3-result limit, no media
node tests/run.js genius      # single adapter
```

Tested query set includes: Blinding Lights, Shape of You, Perfect, Despacito,
Believer, Kahani Suno, Pasoori, Afreen Afreen, Tajdar-e-Haram, Tu Jhoom, plus
misspellings, Roman Urdu/Hindi, Urdu/Hindi script, and original-vs-remix /
studio-vs-live / sped-up-vs-original distinctions.
