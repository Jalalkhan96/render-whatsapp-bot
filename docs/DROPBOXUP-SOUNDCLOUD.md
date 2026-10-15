# ABIX Dropbox Upload + SoundCloud Commands

## Dropbox upload

The Dropbox uploader mirrors `-gofileup`: reply to a WhatsApp media message and run `-dropboxup`, or reply to a Telegram media message and run `/dropboxup`. It supports photos, video, audio, stickers, and documents, uploads the downloaded media to the configured Dropbox account, then replies with a share link. Temporary files are removed after the upload finishes.

Configure one of these authentication methods in `.env`:

```dotenv
# Option A: short-lived access token for a quick test
DROPBOX_ACCESS_TOKEN=

# Option B: recommended for long-running hosting (OAuth offline refresh token)
DROPBOX_APP_KEY=
DROPBOX_APP_SECRET=
DROPBOX_REFRESH_TOKEN=

DROPBOX_UPLOAD_FOLDER=/ABIX Uploads
DROPBOXUP_MAX_MB=500
DROPBOX_UPLOAD_TIMEOUT_MS=1800000
```

Create a Dropbox app and grant the scopes `files.content.write` and `sharing.write`. For a persistent bot, use a refresh token from an OAuth flow with offline access rather than relying on a short-lived access token. A public share link lets anyone with the link access the file; do not run the command on sensitive media unless that is intended. Dropbox upload sessions are used for files above 150 MiB.

`DROPBOX_UPLOAD_FOLDER` is created if absent. Use an empty value to upload to the Dropbox root. The limit applies to WhatsApp source media; the standard hosted Telegram Bot API can download incoming media only up to 20 MiB, even if `DROPBOXUP_MAX_MB` is larger.

## SoundCloud

The bot includes the root `soundcloud.cjs` service and the following commands on both platforms:

| Action | WhatsApp | Telegram |
|---|---|---|
| Help | `-scmusic` | `/scmusic` |
| Search track metadata | `-scsearch <query>` | `/scsearch <query>` |
| Download a track, playlist, or profile | `-scdownload <public SoundCloud URL> [limit]` | `/scdownload <public SoundCloud URL> [limit]` |
| Download a playlist | `-scplaylist <playlist URL> [limit]` | `/scplaylist <playlist URL> [limit]` |
| Download a user's tracks | `-scuser <profile URL> [limit]` | `/scuser <profile URL> [limit]` |
| Download liked tracks | `-sclikes <profile URL> [limit]` | `/sclikes <profile URL> [limit]` |

The default and maximum per-request count is controlled by `SOUNDCLOUD_MAX_ITEMS` (the bot caps it at 10). `SOUNDCLOUD_MAX_TRACK_MB` limits each download; keep it conservative to protect hosting storage, RAM, and platform send limits. `SOUNDCLOUD_OAUTH_TOKEN` is optional for creator-enabled official downloads that require the account's authorization.

Only tracks whose creator enabled the official SoundCloud download are downloaded. Public official download endpoints may work without login. When SoundCloud requires account authorization or does not expose a download, the bot reports/skips that track; it does not extract HLS/playback streams or bypass access controls. Playlist/user collections are capped and may be incomplete if SoundCloud's public API returns partial metadata.

## Troubleshooting

- `Dropbox is not configured`: fill the access token or all three refresh-token values.
- Dropbox `missing_scope`: enable `files.content.write` and `sharing.write` on the Dropbox app and re-authorize it.
- Telegram `/dropboxup` requires a reply to a media/file message. Telegram's standard cloud Bot API download limit is 20 MiB.
- SoundCloud auth/client-ID extraction may fail if SoundCloud changes its public website bundles; retry later.
- `No official download`: the creator did not enable downloads or the endpoint requires the creator/account authorization.
