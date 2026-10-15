# ABIX-AE Master Direct: one-video / low-quality update

## Commands

- `-mdscrape --list-sites` — list every configured site ID, display name, and target category for Scraper 1.
- `-mdscrape2 --list-sites` — list every configured site ID, display name, and target category for Scraper 2.
- `-mdscrape anime --site=xvideo` — search the configured XVideos target in Scraper 1 (`xvideo` is an alias for `xvideos`).
- `-mdscrape2 anime --site=xvideos` — search the configured XVideos target in Scraper 2.
- `-mdscrape anime wallpaper --site=zerochan` — select any configured target by its ID. Quoted exact names can also be passed when the command parser preserves quoted arguments.

The commands remain restricted to the configured primary owner and secondary owner.

## Result UI and downloads

- One video is shown per interactive message.
- `MORE VIDEO` advances to the next candidate.
- Download buttons are created only for source-exposed `240p`, `480p`, or a player explicitly marked `LOW` stream.
- `setVideoUrlHigh()` streams and unclassified direct MP4 URLs are not exposed as download actions. Known 720p/1080p/1440p/2160p URLs are rejected even if encountered in a low-source field.
- A `LOW` button means the source itself labels the rendition low; it does not guarantee the site documents an exact pixel height. Explicit 240p/480p variants are labeled by that exact resolution.
- The file is returned as a downloadable WhatsApp document; fake-forward metadata is not added.
- Direct download buffers are capped by `MDSCRAPE_MAX_DOWNLOAD_BYTES` (default 32 MiB). The source must allow public direct access and respond with a genuine video MIME type.

## Site coverage and limitations

Each target configured in the scraper's own `targets` array can be selected with `--site=ID` or `--site=NAME`. `--list-sites` prints the actual configured list. Some listed targets are image/gallery/catalog sites, or may block anonymous access; their presence in the target list does not guarantee that they host video or expose a downloadable 240p/480p stream. The scraper does not bypass authentication, paywalls, DRM, or site restrictions.

## Resource / storage behavior

Search results remain in process memory and are held in expiring chat sessions; this update does not write a JSON search-result database. It resolves one item at a time to reduce CPU and RAM load. Existing stale result JSON from previous versions is unlinked when the command starts, if present.

## Install

Extract the patch ZIP into the existing bot root, overwrite the matching files, and restart. Do not replace `.env`, WhatsApp authentication/session files, databases, or user data.

## Verification performed

Offline tests cover parsing the site-list flag, XVideos alias normalization, direct low-resolution extraction, rejection of high-quality streams, single-video pagination, 240p download routing, owner-gated command flow, and memory-only search results. Live site extraction and delivery through a live WhatsApp session still need verification on the deployment.
