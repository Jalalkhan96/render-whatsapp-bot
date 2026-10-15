# Deployment Notes

## KataBump / Linux / Node 20+

1. Upload the project archive and extract it as the bot root.
2. Copy `.env.example` to `.env` and restore the real values from your private configuration.
3. Keep the existing `OWNER_NUMBER` as the primary owner and put additional owners in `SECONDARY_OWNER_NUMBERS`.
4. Keep `BOT_PREFIX` as the single default prefix. The current validated prefix is `-`.
5. Run `npm ci` on the hosting machine. Do not upload the sandbox `node_modules` directory.
6. Start with `npm start`.
7. Confirm startup reports the command loader, owner configuration, API configuration, and database backend.
8. Use `-apihealth apify` from an authorized owner account to perform live Apify actor checks.

## Protected downloader commands

The source files implementing `-dl`, `-gdl`, and `--gdlv` were not modified. `gdlv` is implemented inside the protected `plugins2/gdl.js` file.

## Native slider

`ABIX_NATIVE_INTERACTIVE=false` is the safe default. It prevents an unsupported native carousel from leaving mobile users with a blank response. After a real WhatsApp Android/Web test, native mode can be enabled with `ABIX_NATIVE_INTERACTIVE=true`.

`ABIX_SLIDER_VIDEO=true` is optional and requires `assets/bot_top.mp4`.

## Do not package

Never distribute `.env`, session/auth credentials, private cookies, `.git`, `node_modules`, runtime logs, or local backups as part of a public deployment archive.
