# ABIX Quran Web Scraper Update

## What was added

A separate `plugins2/quran.js` module adds live Quran features without replacing the existing Islamic plugin. No Quran API key is required.

## Commands

- `-quranmenu` — Quran feature menu
- `-quran 2:255` — Arabic + English translation
- `-ayah 36:1` — verse lookup
- `-surah 36` — Surah information + first verse + audio link
- `-quransearch <word/phrase>` — scrape Quran.com search results
- `-qurantrans 2:255 ur` — localized Quran.com translation (Urdu example)
- `-qurantranslations urdu` — scrape Tanzil translation catalog
- `-quranaudio 1:1 alafasy` — verse audio via EveryAyah
- `-surahaudio 36` — full Surah audio via MP3Quran direct audio host
- `-quranreciters` — scrape EveryAyah recitation catalog
- `-quranword 1:1` — scrape Quranic Arabic Corpus word-by-word page
- `-quransources 2:255` — source URLs
- `-quranstatus` — source reachability check

## Sources

1. Quran.com — Quran text, localized translation pages and search pages.
2. Tanzil.net — translation catalog and Quran deep-link reference.
3. EveryAyah.com — ayah-by-ayah MP3 recitations.
4. MP3Quran.net — complete Surah audio URLs.
5. Quranic Arabic Corpus — word-by-word linguistic pages.

## Storage/performance

The plugin does not download or persist a complete Quran database. HTML is fetched only when a command is requested. Verse audio is sent from a remote URL rather than being permanently stored on the bot disk.

## Attribution/usage

The bot displays the source URL with verse results. Tanzil's published terms require a link back to Tanzil when its Quran text is used in an application, and its translation repository has additional usage conditions. This patch therefore uses Quran.com for the verse/translation display and uses Tanzil primarily for the public translation catalog/deep links.
