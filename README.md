# ABIX Sticker + TikTok Profile Patch

This patch contains two bot plugins and the upgraded standalone TikTok Profile Card Maker from the supplied ZIP. It does not overwrite the bot's `package.json`, existing `.env`, session files, or command registry.

## 1. Add the bot files

Copy these files into the existing bot:

- `plugins/sticker.js` → the single plugin directory your bot currently loads (for example, `Plugin3` or `plugins2`).
- `plugins/tiktok-profile.js` → that same plugin directory.
- `lib/tiktok-profile-api.js` → `<bot-root>/lib/tiktok-profile-api.js` (create `lib/` if needed).

Use only one copy of each plugin so aliases do not register twice. The `../lib/tiktok-profile-api.js` import assumes the plugin folder sits directly under the bot root, as in common `plugins/`, `plugins2/`, or `Plugin3/` layouts.

## 2. Add Apify configuration

Merge the following lines into the bot's existing `.env`. Do not replace your `.env` file:

```dotenv
APIFY_API_TOKEN=your_real_apify_api_token
APIFY_TIKTOK_PROFILE_ACTOR=clockworks~tiktok-profile-scraper
```

The token is used server-side only. The default Actor is `clockworks~tiktok-profile-scraper`; override `APIFY_TIKTOK_PROFILE_ACTOR` if your Apify account uses a different profile-scraper Actor.

## 3. Commands

- `-sticker` / `-s` / `-stik`: reply to an image, GIF, or short video to convert it to a sticker.
- `-tiktokprofile username`
- `-ttprofile @username`
- `-tiktokinfo https://www.tiktok.com/@username`

TikTok lookup is for publicly available profile data. Apify account usage or Actor charges may apply. The plugin caches lookups for 10 minutes per username.

## 4. Sticker notes

The updated sticker command:

- Keeps the full image/video ratio with transparent padding; it does not crop or add black bars.
- Handles quoted images/videos, regular images, and WhatsApp GIF-style `videoMessage` media.
- Converts video to animated WebP with lower-quality retries and WhatsApp-sized output limits (100 KB static, 500 KB animated).
- Deletes temporary files even after errors.
- Uses `FFMPEG_PATH` if set, otherwise it tries the optional `ffmpeg-static` package, then `ffmpeg` from PATH.

Requirements: Node.js 20+, existing `@whiskeysockets/baileys` and `sharp`, and FFmpeg accessible to the bot process for video/GIF stickers. For Ubuntu, install FFmpeg with `sudo apt-get install ffmpeg`. On managed hosting, enable FFmpeg in the runtime or set `FFMPEG_PATH`. Avoid installing `ffmpeg-static` if your host is disk-constrained and system FFmpeg is available.

## 5. Run the updated card maker (optional)

This is an optional local helper app, separate from the WhatsApp plugin. It uses the same API helper in the ZIP and does not require Vercel.

```bash
cd tiktok-card-maker
cp .env.example .env
# Edit .env and set APIFY_API_TOKEN to your actual token
npm start
```

Open `http://127.0.0.1:4173`. Enter a TikTok username or public profile URL, click **Fetch profile with Apify**, then download the generated PNG card. The app server binds to `127.0.0.1` by default so the Apify proxy is not exposed to the public internet. Do not change `HOST` to `0.0.0.0` unless you add proper authentication and rate limiting.

## 6. Verification limits

Local checks can validate JavaScript syntax and mock profile mapping, but live Actor access cannot be confirmed without your Apify token. Actor inputs/fields can change; if your selected Actor differs from the default, check its input schema and update the actor ID/configuration accordingly.
