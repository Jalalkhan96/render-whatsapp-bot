# ABIX Public Image Scraper — No Official APIs

Adds public HTML/page scraping for anime/image sources and browser-rendered image sites.

## Existing sources
- Zerochan
- Safebooru
- Danbooru
- Anime-Pictures
- e-shuushuu
- Wallhaven
- Alpha Coders / Wallpaper Abyss

## Added browser-scraped sources
- Unsplash
- Pexels
- Pixabay

The browser sources are scraped with Playwright exactly because the important image elements are lazy-loaded/client-rendered. No API key is used.

## Install
```bash
npm i playwright
npx playwright install chromium
```

Your bot should already have `axios` for the older HTML sources.

## Commands
```text
-animeimg Naruto
-animeimg unsplash Naruto
-animeimg pexels Naruto
-animeimg pixabay Naruto
-unsplashimg Naruto
-pexelsimg Naruto
-pixabayimg Naruto
-stockimg Naruto
-animeimgget <session> <number>
-animeimgall <session>
-animeimgsites
-animeimgurl <public-url>
```

## Design notes
- Public pages only.
- No login/private-access bypass.
- No official site API keys.
- The bot does not permanently download a batch to disk, which avoids uncontrolled disk growth; it stores short-lived result URLs in memory and sends selected images through WhatsApp.
- Respect each site's terms, robots policies, and applicable image licenses/copyright.
