# ABIX-AE GIF Sticker Fix + Master Direct Scrapers

## GIF-to-sticker framing

The shared animated WebP conversion now fills the 480x480 sticker frame by default and crops the sides as needed, rather than adding transparent/black-looking top and bottom space. This can crop part of wide media. To preserve the complete frame, internal callers can pass `{ fit: 'contain' }` (which may show empty space around a landscape source).

The video normalization step used by animated stickers uses `scale-to-fill + crop` instead of `pad`, and the Nekogif MP4 helper no longer adds hard black letterboxing.

## New owner-only commands

Both commands require a configured primary owner or secondary owner. Configure `OWNER_NUMBER` and `SECONDARY_OWNER_NUMBERS` (comma-separated phone numbers) as usual.

- `-masterdirect <query> [--sites=12|--all] [--per-site=2]` (alias `-mdscrape`)
Example full scan: `-mdscrape anime wallpaper --all`
- `-masterdirect2 <query> [--sites=12|--all] [--per-site=2]` (alias `-mdscrape2`)
- `-mdscrape2 anime wallpaper --all`

Defaults to the first 12 targets and 2 page links per site, with sequential requests and a 900 ms pause between hosts to reduce memory and rate-limit risk. `--all` enables the complete target list. `--sites=8` and `--per-site=1` can be used to reduce workload.

Each command extracts result-page URLs and then checks a bounded number of pages for public video/image metadata and thumbnails. When media can be previewed, the bot sends a native swipeable WhatsApp carousel with a `⬇️ DOWNLOAD` quick-reply button on each card. Tapping it fetches the selected file and sends it as a downloadable WhatsApp document. `➡️ MORE MEDIA` advances to the next set of cards. Results/buttons are held in memory for 15 minutes, and only configured owners/secondary owners can use them.

The carousel and download responses use direct relay or `_skipForwardContext`, so no fake-forward/channel-forward metadata is added. Download requests are size-limited to protect host memory; configure `MDSCRAPE_MAX_DOWNLOAD_BYTES` (default 32 MiB, capped at 64 MiB) and `MDSCRAPE_MAX_MEDIA_DETAILS` (default 36) if needed. Public site layout/access restrictions can still prevent media extraction.

Results are saved to `data/master-direct-one/master_scraped_targets.json` and `data/master-direct-two/master_scraped_targets.json` respectively. Each command writes its own file so the two runs do not collide.

## Dependencies

`cheerio` is already declared by the bot's package.json. The commands use Node's built-in `fetch`, available in Node 20+.

## Quick verification

```bash
node -c lib/sticker.js
node -c plugins/nekogif.js
node -c plugins2/masterdirect.js
node -c plugins2/masterdirect2.js
node -c plugins2/direct-scrapers/master-direct-one.cjs
node -c plugins2/direct-scrapers/master-direct-two.cjs
node tests/run.js
node tests/master-direct.test.js
node tests/master-direct-flow.test.js
```
