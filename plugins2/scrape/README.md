# ABIX Plugin2 Scrape Hub

This bundle adds a new isolated directory:

    plugins2/scrape/

The uploaded `meme-search-engine` and `sound-meme-engine` archives were integrated once each; their duplicate `(1)` uploads were byte-identical and were not duplicated.

## Commands

- `-scrapemenu` — scrape hub menu
- `-scrapememe <query>` — search memes
- `-scrapememe <count> <query>` — send N meme results
- `-scrapesound <query>` — search sounds
- `-scrapesound <count> <query>` — send downloadable sound results
- `-pinscrape <query>` — direct-first Pinterest search, sending images and videos
- `-pinscrape <count> <query>` — send N Pinterest media items (maximum 10)
- `-pinscrape image|video <query>` — filter results by media type
- `-pinscrape <Pinterest URL>` — scrape a public pin/page URL
- `-pintest <query>` — direct-first image/video extraction with Apify backup
- `-pintest video <query>` — test video extraction specifically
- `-pinsearch <query>` — direct-first search, Apify fallback when needed
- `-pinsimilar <query|Pin URL>` — topic-related pins; reply to an image for visual Lens
- `-pinapify <query>` — explicit Apify-only backup search
- `-scrapestatus` — local availability check

## API-key policy

No Pinterest API key is used.

The two uploaded engines are **API-key-free / no-auth** engines as supplied. They still use public web endpoints internally (for example Wikimedia, Imgflip, meme-api, and YouTube search pages); "API-free" here means no paid/private API credential is required.

Pinterest is implemented as a public-page scraper with optional Playwright/stealth browser fallback. When direct search returns too few items, search commands use the existing Apify token pool to fill the result set. `-pinapify` calls the Apify search directly. No Pinterest API key or Pinterest login cookies are required for the direct extractor.

## Loader safety

All engine/library code is under:

    plugins2/scrape/engines/

The ABIX loader's internal-engine exclusion is important because these packages contain CLI/test files that are not WhatsApp plugins. Only the small command adapters at the top of `plugins2/scrape/` should register as commands.

## Existing commands preserved

The existing `meme` command and existing Pinterest `pinsearch` command are not replaced. New names are used to avoid registration conflicts.

## Optional Pinterest browser dependencies

The Pinterest scraper first tries normal public HTML. For JS-rendered results it tries, in this order:

1. `playwright-extra` + `puppeteer-extra-plugin-stealth` when already installed
2. `playwright`

No Pinterest API package or token is required.

## Resource behavior

The bot sends media directly with `sock.sendMessage(...)`; it does not use `message.reply()`.

The sound engine never rips YouTube audio. YouTube results remain official page links, while downloadable Wikimedia audio can be sent as audio.

## Pintest implementation

`pintest.js` is a Node.js/Baileys port of the supplied Python `PinterestScraper`: mobile crawler headers, public Pinterest search URL, `i.pinimg.com/originals/` and `736x/` extraction, alt-text matching, deduplication, JSON dump, and optional Playwright/stealth fallback. It does not use a Pinterest API key.
