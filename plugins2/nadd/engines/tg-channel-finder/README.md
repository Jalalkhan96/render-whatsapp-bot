# tg-finder — Telegram channel finder bot

A Telegram bot that finds *anything* in public Telegram channels. Zero
dependencies, plain Bot API long polling (Node 18+).

## Setup

1. Talk to **@BotFather** on Telegram → `/newbot` → copy the token.
2. `cp config.example.json config.json`, paste the token.
3. `node index.cjs` (no `npm install` needed — zero deps).
4. Open your bot, send `/start`. The first user auto-becomes admin
   (or pre-fill `admins` with your numeric Telegram id from @userinfobot).

Runs anywhere Node runs: Windows, VPS (`tmux`/`screen`), Android Termux.

## Commands (admin only)

```
/find <query>                instant search across your indexed posts
/deepfind <anything>         the "@finding" one-shot: discover channels about
                             the topic, index their posts, then search inside
/index <channel> [pages]     index a channel's posts (deep history, saved to index.json)
/indexlist                   what's in your index
/findlive <query> [pages]    live search in watchlist channels (no index)
/findin <channel> <query>    one-off live search in any public channel
/add <channel>               save a channel to the watchlist
/del <channel>               remove it
/list                        saved channels
/csearch <keyword>           discover public channels by topic
/info <channel>              title + subscriber count
/help
```

Examples:
- `/deepfind jobs in lahore` — finds job channels, indexes them, returns matching posts
- `/find bitcoin` — instant search across everything you've indexed
- `/index durov 20` — index 20 pages of @durov's history, then `/find` searches it

## How it works

- **Post search** scrapes Telegram's public `t.me/s/<channel>` preview pages
  (no login, no api_id needed) and walks back through pages with `?before=`.
- **Channel discovery** uses DuckDuckGo `site:t.me` search.
- Only **public** channels work — private/invite-only channels have no public
  preview page. Media-only posts (photo with no caption) have no searchable text.

## Limits (honest)

- `t.me/s/` shows recent posts; `/find` with more pages goes deeper but each
  page is a fetch — keep pages ≤ 5 for speed.
- Gentle delays between fetches; hammering Telegram will get your IP
  throttled for a while.
- This is a search tool over public posts, not a bulk downloader.
