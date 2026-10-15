# MovieBox+ Plugin2 Fix

This patch fixes two runtime issues reported by ABIX:

1. `message.reply is not a function` — all MBX replies now use the bot-compatible `sock.sendMessage(..., { quoted: message })` path.
2. `HTTP 404 GET /wefeed-mobile-bff/subject-api/search` — the MovieBox search client now sends the current search request as POST JSON and falls back to the V2 POST endpoint on 404/405.

## Deploy
Copy the files under `plugins2/` into the existing bot. Do not replace your `.env`, session, or runtime data.

## Current search body
```json
{
  "keyword": "Dune",
  "type": 0,
  "page": 1,
  "pageSize": 10
}
```

## Commands
- `-mbx Dune`
- `-mbx Stranger Things`
- `-mbxinfo <subject-id>`

The patch does not add a download bypass or circumvent authentication/signing.
