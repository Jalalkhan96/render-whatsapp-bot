# Sound Meme Engine

Zero-dependency, CommonJS, Node 18+. Searches the sound-meme sites that are
actually reachable key-free, ranks the hits, and downloads where the license
allows it. Anime meme sounds included — that's just a query away.

## Sources (verified live, key-free)

| Source            | What it is                                              | Gets you            |
|-------------------|-----------------------------------------------------------|---------------------|
| `wikimedia-audio` | Wikimedia Commons `filetype:audio` search — CC/PD sounds  | free MP3/OGG/WAV downloads + attribution |
| `youtube`         | YouTube search-page scrape (no key)                       | metadata + official watch links ONLY — no ripping |

## Blocked, honestly (verified Oct 2026)

| Source           | Why it's a stub                                              |
|------------------|--------------------------------------------------------------|
| `myinstants`     | Cloudflare 403 from datacenters, even with full browser headers |
| `voicy`          | HTTP 403                                                     |
| `101soundboards` | JS-rendered — zero mp3 references in served HTML             |
| `mixkit`         | audio URLs are JS-loaded, not in static HTML                 |

These stubs throw an explanatory error instead of faking results. They may
work from a residential IP — the adapter contract is documented in
`src/sources/index.cjs` if you want to wire one.

## Quick start

```bash
node bin/sound.cjs search "anime meme sound effect" --limit 15
node bin/sound.cjs search "vine boom" --sources wikimedia-audio --download --dir ./sounds
node bin/sound.cjs sources
node bin/sound.cjs test
node examples/anime-sounds.cjs
```

```js
const { searchSounds } = require('./src/index.cjs');
const hits = await searchSounds('anime meme sound', { limit: 15 });
for (const h of hits)
  console.log(h.score, h.title, h.downloadable ? h.mediaUrl : h.pageUrl);
```

## Result shape

```js
{
  id: 'youtube:SkWbQYyqtL0',
  source: 'youtube',
  kind: 'video-link',            // or 'audio'
  title: 'Anime ahhhh!!! - sound effect',
  mediaUrl: null,                // direct file URL (audio kind only)
  pageUrl: 'https://www.youtube.com/watch?v=SkWbQYyqtL0',
  author: 'Channel name',
  durationSec: 12,
  views: 152300,
  downloadable: false,           // true only for wikimedia-audio
  license: { status: 'unknown', ... },
  score: 21.4
}
```

## License policy

Same hard rule as the whole engine family: **unknown license NEVER becomes
free.** Commons audio carries real CC/PD metadata → `free` with attribution.
YouTube results are user uploads → `unknown`, links only, never downloaded
by this tool.
