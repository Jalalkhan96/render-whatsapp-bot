# ABIX-AE — WhatsApp Automation Bot

**Version:** 10.3.1  
**License:** MIT  
**Maintainer / copyright notice:** 9696  
**Primary runtime:** Node.js + Baileys  
**Primary deployment target:** Render (Docker Web Service)

ABIX-AE is a plugin-based messaging bot centered on WhatsApp. It includes group-management utilities, media and sticker tools, AI integrations, social/search helpers, education and general-purpose utilities, sports/cricket features, and a large collection of interactive games. An Express HTTP service provides health and runtime status endpoints, plus selected media-download and game endpoints. Telegram is available as an optional transport when configured.

> **Project note:** This repository contains many independently maintained plugins and third-party integrations. Individual commands may depend on external APIs, API keys, upstream websites, or platform behavior. The presence of a plugin does not guarantee every external provider is currently available. Use the health checks and logs to verify the features you rely on.

## Contents

- [Features](#features)
- [Architecture and folders](#architecture-and-folders)
- [Requirements](#requirements)
- [Run locally](#run-locally)
- [Environment configuration](#environment-configuration)
- [Connect WhatsApp](#connect-whatsapp)
- [Commands and menus](#commands-and-menus)
- [Render deployment](#render-deployment)
- [Health and HTTP endpoints](#health-and-http-endpoints)
- [Persistent storage and backups](#persistent-storage-and-backups)
- [Tests and maintenance](#tests-and-maintenance)
- [Troubleshooting](#troubleshooting)
- [Security guidance](#security-guidance)
- [License](#license)

## Features

### Messaging and command system

- Baileys-based WhatsApp connection and session handling.
- Configurable command prefix; the default prefix is `-`.
- Recursive plugin discovery, command aliases, command categories, permission checks, cooldowns, and duplicate/broken-plugin reporting.
- Runtime plugin registry refresh for changes in the configured plugin folders.
- Lightweight message/contact store and periodic writes.
- Optional Telegram integration controlled by `TELEGRAM_BOT_TOKEN`.

### Group administration and safety tools

The plugin set includes group administration and moderation features such as kick/ban and unban helpers, warnings, mute/unmute, anti-link, anti-tag, anti-badword and spam controls. Availability and exact options depend on each plugin and the permissions of the bot account. For group-management commands, promote the bot to group admin and grant only the WhatsApp permissions it needs.

### AI and information tools

- Gemini integration using the official API when configured.
- Additional AI/chat and information plugins.
- General utilities such as dictionary, conversion, facts, QR codes, country/currency information, and selected developer utilities.
- AI and information results can vary with API quotas, network conditions, model availability, and service policies.

### Media, stickers, and downloads

- Image, audio, video, GIF, and sticker-related tools.
- Static and animated sticker conversion, with temporary-file cleanup and FFmpeg support.
- Download/search integrations for supported media platforms and public URLs.
- Text and image creation tools, font search/download helpers, and selected file/PDF utilities.
- The HTTP media-download endpoints are separate from WhatsApp commands; see [Health and HTTP endpoints](#health-and-http-endpoints).

Media downloads and conversions can consume significant RAM, CPU, bandwidth, and disk space. Use sensible concurrency, input-size, and timeout limits on small hosts.

### Social, sports, learning, and games

- Social search/profile helpers and scraper integrations, including optional Apify-backed features.
- Cricket information and match-related commands, subject to their upstream data source.
- Education, study, and general-purpose utility plugins.
- A game center with multiple text and browser-rendered/interactive games.
- Pakistan-focused information utilities and other specialized menus.

Do not rely on any command as an official source for financial, legal, medical, emergency, or other high-impact decisions. Check source data independently.

## Architecture and folders

The main process starts from `index.js` and loads `config.js` and `settings.js`. The command handler currently discovers JavaScript plugins recursively from these directories:

| Path | Purpose |
|---|---|
| `index.js` | Main application startup, WhatsApp lifecycle, and service coordination. |
| `lib/` | Command loader, permissions, session helpers, HTTP server, Gemini service, media utilities, storage, and shared helpers. |
| `plugins/` | Core WhatsApp commands and feature plugins. |
| `plugins2/` | Additional command packs, integrations, scrapers, downloads, games, and utilities. |
| `esportplugin/` | Esports-related command pack. |
| `plugin4/` | Additional game-center commands. |
| `web/` | Browser-based status/game UI assets where enabled. |
| `data/`, `database/` | Seed and runtime application data; the Render entrypoint maps these to persistent storage. |
| `tests/` | Automated regression and smoke tests. |
| `scripts/` | Preflight, storage inspection, cleanup, and maintenance utilities. |
| `docs/` | Deployment and operational documentation. |
| `tiktok-card-maker/` | Optional local TikTok profile-card helper. |
| `Dockerfile`, `docker-entrypoint.sh`, `render.yaml` | Container build and Render Blueprint setup. |

Plugin directories are not all automatically loaded. The active command loader uses `plugins/`, `plugins2/`, `esportplugin/`, and `plugin4/`; do not assume a JavaScript file in another folder is a registered command. A plugin normally exports a command name and a handler function. Check `lib/commandHandler.js` before adding a new plugin or changing discovery behavior.

## Requirements

- **Node.js 24.x recommended** for deployments built from the included Dockerfile. The package declares Node.js `>=20`, but use the included Docker runtime for the most consistent production environment.
- npm, installed with Node.js.
- FFmpeg for many audio/video and animated-sticker functions. The included Docker image installs FFmpeg and sets `FFMPEG_PATH=/usr/bin/ffmpeg`.
- Internet access to WhatsApp and any third-party APIs used by enabled commands.
- A WhatsApp account/device to link to the bot.
- A Gemini API key if you want the official Gemini integration.
- Additional API credentials only for the specific integrations you plan to use.

On Debian/Ubuntu outside Docker, install system packages before installing npm dependencies:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates ffmpeg python3 make g++ libfontconfig1 libfreetype6
```

## Run locally

1. Clone or extract the repository into a folder you control.
2. Create your local environment file from the template:

   ```bash
   cp .env.example .env
   ```

   On Windows PowerShell, use `Copy-Item .env.example .env`.
3. Edit `.env` and set at least the owner number. Add a Gemini key if you want AI commands. Keep real credentials out of source control.
4. Install dependencies:

   ```bash
   npm ci
   ```

5. Run the startup checks and start the bot:

   ```bash
   npm run check
   npm start
   ```

6. Watch the console for the command-load report, web server startup, and WhatsApp pairing/connection messages.

The HTTP server uses the `PORT` environment variable if supplied and listens on `HOST` (default `0.0.0.0`). For a local run, open `http://127.0.0.1:3000/` unless you set another port. The root page is served from `web/index.html` when that UI exists.

## Environment configuration

The `.env.example` file is the starting point. These are the primary settings; individual plugins may define additional optional variables.

| Variable | Required? | Description |
|---|---|---|
| `OWNER_NUMBER` | Yes for owner configuration | Owner phone number in digits only, including country code; do not include `+` or spaces. Example format: `923001234567`. Replace the example with your own number. |
| `SECONDARY_OWNER_NUMBERS` | Optional | Comma-separated list of additional trusted owner numbers. Give owner access only to people you trust. |
| `BOT_NAME` | Optional | Display name; defaults to the configured fallback. |
| `BOT_PREFIX` | Optional | Command prefix. Defaults to `-`. |
| `TIMEZONE` | Optional | Timezone for time-sensitive features; default is `Asia/Karachi`. |
| `COMMAND_MODE` | Optional | Command mode; defaults to `public`. Review command permission logic before changing it. |
| `GEMINI_BACKEND` | Optional | Use `official` for the Google Gemini API configuration used by the included Render Blueprint. |
| `GEMINI_USE_WEB2API` | Optional | Set to `false` when using the official API backend. |
| `GEMINI_API_KEY` | Optional, needed for Gemini | Secret key for the official Gemini API. Set it in your hosting provider's secret/environment settings. |
| `GEMINI_MODEL` | Optional | Model identifier supported by your configured Gemini endpoint/account. Verify model availability before changing it. |
| `TELEGRAM_BOT_TOKEN` | Optional | Enables the Telegram transport when configured. |
| `APIFY_API_TOKEN` | Optional | Token for Apify-backed search/profile plugins. Usage or Actor charges may apply. |
| `APIFY_TIKTOK_PROFILE_ACTOR` | Optional | Overrides the TikTok profile-scraper Actor; default is configured by the plugin. |
| `FFMPEG_PATH` | Optional | FFmpeg executable path; Docker uses `/usr/bin/ffmpeg`. |
| `SESSION_DIR` | Hosting-dependent | WhatsApp credentials/session directory. Render Blueprint uses `/var/data/session`. Treat it as a secret. |
| `PORT` | Hosting-provided | HTTP service port. Render injects this value; do not hard-code a different port in the service settings. |
| `HOST` | Optional | Interface to bind; use `0.0.0.0` in a container. |
| `NODE_OPTIONS` | Optional | Node runtime flags. The Render Blueprint sets a 1,280 MB V8 heap ceiling for the configured 2 GB service. |
| `BOT_MEMORY_WARN_MB` | Optional | RSS warning threshold in MB. This logs a warning; it does not guarantee the process can recover from memory exhaustion. |
| `RENDER_KEEPALIVE_URL` | Optional | Overrides the URL used by the in-process Render keep-alive. Normally not needed on Render. |
| `RENDER_KEEPALIVE_INTERVAL_MS` | Optional | Keep-alive interval in milliseconds; defaults to 420,000 ms (7 minutes). |
| `DATABASE_URL`, `POSTGRES_URL`, `MYSQL_URL`, `MONGO_URL`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Optional | Connection settings for integrations that support these data stores. Configure only the provider used by the plugin. |

Other optional integrations may use keys such as `GIPHY_API_KEY`, `YOUTUBE_API_KEY`, `PEXELS_API_KEY`, `GROQ_API_KEY`, `VIRUSTOTAL_API_KEY`, music-service keys, short-link API keys, and provider-specific keys. Search the relevant plugin for the exact variable name and expected format. Never assume a key is required for every command.

### Environment-file rules

- Never replace an existing production `.env` with `.env.example`.
- Do not commit `.env`, WhatsApp session credentials, cookies, API tokens, or database credentials to Git.
- Put production secrets in Render's **Environment** settings or another secret manager.
- Do not paste tokens or `creds.json` contents into public issues, chat screenshots, or logs.

## Connect WhatsApp

1. Set `OWNER_NUMBER` to the WhatsApp phone number that should own the bot. Use country code and digits only.
2. Start the bot. If no valid registered credentials exist in `SESSION_DIR`, read the startup logs and follow the displayed pairing instructions.
3. Complete the link from WhatsApp on the phone/account you intend to use.
4. Wait for the logs to confirm the connection and allow the credential files to be written.
5. Keep the session directory private and persistent. Do not start two bot instances with the same WhatsApp session at the same time.

For Render, make sure the persistent disk remains attached between deployments. If the session is lost or invalid, re-pair by following the current logs rather than copying another user's session files.

## Commands and menus

Commands use the configured prefix; examples below use the default `-`. Send commands in a WhatsApp chat with the bot. Some commands are group-only, admin-only, owner-only, or depend on extra API configuration.

Useful entry points in the current plugin tree include:

| Example | Purpose |
|---|---|
| `-menu` or `-allmenu` | Main command catalog/menu. |
| `-gcmenu` | Group administration and moderation menu. |
| `-aimenu` | AI-related menu. |
| `-edumenu` / `-studymenu` | Education and study tools. |
| `-socialmenu` | Social-search feature menu. |
| `-newsmenu` | News-related menu. |
| `-secmenu` | Security-related utilities. |
| `-cricmenu` / `-cricketonlymenu` | Cricket feature menu. |
| `-pkmenu` | Pakistan-focused feature menu. |
| `-wpmenu` | Media/download-related menu. |
| `-funmenu` / `-game4menu` | Games and entertainment. |
| `-sticker` or `-s` | Reply to supported media to create a sticker. |
| `-ttprofile username` | Look up a public TikTok profile when the required plugin/API is configured. |
| `-gemini prompt` | Use the Gemini command when the service and key are configured. |

Menu names and individual command availability can change as plugins are updated. The live registry is also available at `/api/commands`; in WhatsApp, use the menu command to see the commands currently loaded by that running instance. Do not assume that every filename in `plugins/` or `plugins2/` is a public command: some files are helpers, internal modules, or restricted commands.

### Group moderation examples

The current moderation menu documents commands such as `-kick @user`, `-ban @user`, `-unban @user`, `-warn @user`, `-warnings @user`, `-resetwarn @user`, `-mute [minutes]`, `-unmute`, and toggle/status controls for anti-link, anti-tag, anti-badword, and spam protection. Confirm syntax in the current menu before using a command. Group actions require appropriate bot-admin permissions and may be limited by WhatsApp.

## Render deployment

The repository includes `render.yaml` and a Dockerfile for a Render Blueprint deployment.

1. Push the project to a **private Git repository**. Review all files before publishing and confirm no real `.env`, session credentials, cookies, tokens, or logs containing secrets are included.
2. In Render, select **New → Blueprint** and connect the repository's root. Render should discover `render.yaml`.
3. Review the proposed service and persistent disk. The included configuration targets the `1c-2g` service plan and a 2 GB disk mounted at `/var/data`.
4. Set the prompted `OWNER_NUMBER` and `GEMINI_API_KEY` values in Render. Add any other provider tokens only when the related feature is needed.
5. Deploy and inspect logs for dependency installation, command loading, HTTP server startup, and WhatsApp pairing/connection.
6. Test `https://YOUR-SERVICE.onrender.com/healthz`, then check `/api/status` for runtime details.

### What the container persists

`docker-entrypoint.sh` maps selected runtime paths into `PERSISTENT_DATA_DIR` (default `/var/data`) before starting the process. These include `data/`, `database/`, the WhatsApp broadcast-suite auth directory, and `baileys_store.json`. The configured `SESSION_DIR` is `/var/data/session`. Do not remove or replace these paths in a deployment without understanding which plugin data they contain.

### About the 7-minute keep-alive

When a public URL is available, the app sends a best-effort request to its public `/healthz` endpoint every 7 minutes by default. On Render it uses `RENDER_EXTERNAL_URL`; `RENDER_KEEPALIVE_URL` can override the target. Successful pings are logged with the `[KEEPALIVE]` prefix.

**This does not guarantee that a Render Free service will stay awake.** The in-process timer cannot fire while the instance is suspended, and self-pinging behavior is not a substitute for a paid always-on service. If continuous availability and persistent WhatsApp credentials are important, use an always-on service with a persistent disk and monitor connection status separately.

## Health and HTTP endpoints

The HTTP server is intended for liveness checks and operational visibility. It is not a fully authenticated admin API.

| Endpoint | Method | Purpose |
|---|---|---|
| `/` | `GET` | Serves the web UI if `web/index.html` is present. |
| `/healthz` | `GET` | Liveness check. Returns HTTP 200 while the HTTP process is alive, even during WhatsApp pairing/reconnection. Used by Render. |
| `/health` | `GET` | Readiness-style status. Returns HTTP 200 when WhatsApp or configured Telegram is connected; otherwise may return HTTP 503. |
| `/api/status` | `GET` | Runtime status including uptime, memory/disk stats, connection state, storage counts, and command counts. |
| `/api/commands` | `GET` | Lists public commands currently registered by the command handler. |
| `/api/games` | `GET` | Returns the native game catalogue when available. |
| `/games` and `/games/:game` | `GET` | Serves the game menu or a game page when the game module is available. |
| `/api/media/platforms` | `GET` | Lists supported hostnames known to the media downloader. |
| `/api/media/info` | `POST` | Accepts JSON containing a supported URL and returns media information. |
| `/api/media/download` | `POST` | Accepts JSON containing a supported URL and optional quality (`best`, `1080`, `720`, `480`, `360`) and creates a download job. |
| `/api/media/jobs/:id` | `GET` | Reads the status of an existing media job. |
| `/api/media/file/:id` | `GET` | Streams a completed download for an existing job. |

The media endpoints may be reachable from the public internet on a public web service. Add authentication, rate limiting, request validation, and resource limits before using them as a general-purpose public API. Do not expose private or internal URLs to fetchers.

## Persistent storage and backups

- Keep Render's persistent disk attached across deploys; the Docker entrypoint copies seed files without overwriting existing state when initializing storage links.
- Back up the WhatsApp session, application `data/`, `database/`, and plugin-specific persistent directories securely and separately from the code repository.
- Protect backups as secrets: session/auth files can grant access to messaging accounts or connected services.
- Monitor available disk space. Downloaded media and temporary files can grow quickly; use the storage diagnostic and cleanup helpers before deleting files manually.
- Never commit runtime stores, session folders, `.env`, cookies, or backup archives.

## Tests and maintenance

Useful scripts from `package.json`:

```bash
npm run check             # dependency/config preflight
npm test                  # project test runner (tests/run.js)
npm run storage:doctor    # inspect storage-related state
npm run clean             # project cleanup helper
npm run reinstall         # clean dependencies and reinstall from the package manifest
```

You can run focused regression tests directly, for example:

```bash
node tests/sticker-command.test.js
node tests/telegram-bot.test.js
node tests/menu.test.js
```

Test names and coverage may evolve; use `find tests -maxdepth 1 -type f` to inspect the current suite. Automated tests do not prove that WhatsApp, Telegram, Gemini, Apify, or any other live external service is reachable. Verify credentials and provider status separately. Run `npm ci` on a clean checkout when validating the lockfile; avoid running destructive cleanup/reinstall actions on a live host without a backup and maintenance window.

## Troubleshooting

### Bot does not start: missing module

Run `npm ci` using the Node version recommended above, then `npm run check`. Review the first missing-module or native-build error rather than repeatedly deleting files. On Docker deployment, inspect the build logs separately from runtime logs.

### WhatsApp is not connected

Check the latest logs for pairing or authentication errors. Confirm `SESSION_DIR` is writable and persistent, verify the phone has internet access, and ensure only one active process is using the same session. If credentials are invalid, re-pair from the bot's own startup flow.

### Commands are missing or duplicated

Review the `[COMMANDS]` log lines for loaded, duplicate, duplicate alias, and broken-plugin counts. Check the plugin's exported `command`, `aliases`, and `handler`; verify it resides in an actively loaded directory; remove unintended duplicate copies. Some commands are intentionally restricted or filtered by the command handler.

### Gemini does not respond

Verify `GEMINI_API_KEY`, `GEMINI_BACKEND=official`, and `GEMINI_MODEL`. Check provider quota, model access, and network errors in logs. Do not put the key in the URL or commit it to a file.

### Media/sticker conversion fails

Verify FFmpeg with `ffmpeg -version`, confirm `FFMPEG_PATH`, and check the input's size, duration, and format. Some codecs require a compatible FFmpeg build. Keep temporary storage available and review the relevant plugin's logs.

### Server looks healthy but WhatsApp is offline

`/healthz` checks HTTP liveness, not WhatsApp connectivity. Inspect `/health`, `/api/status`, and runtime logs for the WhatsApp state. A 200 from `/healthz` alone does not mean commands can be delivered.

### Service sleeps or restarts on Render

The 7-minute ping is best effort. Check Render plan limits, service events, memory/disk usage, and startup logs. A free service may suspend or restart; use an always-on plan and persistent disk for reliable operation. A 1,280 MB V8 heap ceiling does not prevent memory exhaustion from native buffers or child processes.

### Persistent disk is full

Use `npm run storage:doctor`, review `/api/status` disk values, and identify large temporary/download files. Remove only files known to be disposable. Do not delete session files, database files, or plugin state as a generic cleanup measure.

## Security guidance

- Set `OWNER_NUMBER` correctly and keep secondary-owner access minimal.
- Store secrets in the platform's environment/secret manager, not source files.
- Use a private repository and restrict deployment and log access.
- Keep Node.js and dependencies updated; run dependency and regression checks before deploying changes.
- Avoid exposing unauthenticated media endpoints as a shared service. Add access control and rate limits when the deployment requires it.
- Treat WhatsApp session files, Telegram tokens, Apify tokens, database credentials, and backups as sensitive credentials.
- Review third-party API terms, quotas, and content permissions before using scraping or downloading features. Only access content you are authorized to access.
- The bot is provided as-is. Operators remain responsible for compliance with platform terms, local law, data protection duties, and responsible use.

## License

This project is distributed under the MIT License. See [`LICENSE`](LICENSE) for the complete license text.
