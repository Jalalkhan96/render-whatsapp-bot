# ABIX Local Anime Card Data

This directory contains the local card metadata/index and scraper state.

- `cards.json` — active local card records.
- `seed-cards.json` — starter public asset metadata used to bootstrap the system.
- `index.json` — generated lookup indexes.
- `scrape-state.json` — resumable scraper checkpoint state.

Run from the bot root:

```bash
npm run cards:scrape
npm run cards:scrape -- --download
npm run cards:doctor
```

The scraper is designed to fetch publicly accessible image assets and keep the
bot independent from third-party card APIs. Check the source site's terms and
asset licenses before publishing or mirroring artwork.
