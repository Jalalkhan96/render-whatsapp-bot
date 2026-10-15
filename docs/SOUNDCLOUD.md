# ABIX SoundCloud commands (WhatsApp + Telegram)

SoundCloud commands share `soundcloud.cjs`. No SoundCloud-specific environment variables, developer API key, OAuth token, or browser login are needed for public metadata lookup. The script discovers the public client identifier used by the SoundCloud website and queries its public metadata endpoint; no developer key is configured.

## Commands

| Feature | WhatsApp | Telegram |
|---|---|---|
| Help | `-scmusic` | `/scmusic` |
| Search tracks | `-scsearch lofi` | `/scsearch lofi` |
| Download one track / playlist / profile items | `-scdownload https://soundcloud.com/... 5` | `/scdownload https://soundcloud.com/... 5` |
| Playlist items | `-scplaylist https://soundcloud.com/... 5` | `/scplaylist https://soundcloud.com/... 5` |
| Artist tracks | `-scuser https://soundcloud.com/artist 5` | `/scuser https://soundcloud.com/artist 5` |
| Public likes | `-sclikes https://soundcloud.com/artist 5` | `/sclikes https://soundcloud.com/artist 5` |

The default maximum is 5 items per command. Increase the hard-coded `MAX_ITEMS` / `MAX_SOUNDCLOUD_ITEMS` constants only if the hosting service has enough disk, bandwidth, and Telegram/WhatsApp upload headroom.

## Download boundary

The downloader only tries SoundCloud's official creator-enabled download URL/endpoints when they are available without account authentication. Tracks needing login or not marked downloadable are skipped. It does not extract progressive/HLS playback URLs, reassemble stream segments, harvest cookies, or bypass private/auth-gated tracks. Public metadata lookup may still fail if SoundCloud changes its website bundles or limits the public endpoint.

Downloaded audio is temporarily stored under the OS temp directory and removed after the bot sends it. Each individual track is capped at 16 MiB to avoid exhausting hosted disk or memory.

## Dependencies and setup

The existing bot dependency `axios` is used. No new API key or SoundCloud environment variable is required. Telegram still needs its existing `TELEGRAM_BOT_TOKEN`; WhatsApp still uses its existing Baileys session. Restart the bot after replacing the updated files.
