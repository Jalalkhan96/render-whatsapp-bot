# Apify Social Gateway

The production request path is:

```text
WhatsApp command
  -> lib/social/socialHub.js
  -> lib/social/socialHub.mjs
  -> lib/social/gateway-client.mjs
  -> Google Apps Script /exec
  -> whitelisted Apify Actor
  -> dataset items
```

## Google Apps Script

Deploy [`apps-script/Code.gs`](../apps-script/Code.gs) as a Web App:

- Execute as: **Me**
- Access: **Anyone**
- Use the `/exec` URL
- Keep GET disabled for operations; requests must use POST

Add these Script Properties:

```text
GATEWAY_SECRET
APIFY_TOKEN_01
APIFY_TOKEN_02
...
APIFY_TOKEN_15
```

Only the operation names in `Code.gs` are accepted. Actor IDs are not accepted
from the bot request, and Apify tokens never leave Apps Script.

Multiple token slots provide credential failover and cooldown handling. They do
not multiply the account-level Apify quota.

## Bot configuration

Production `.env`:

```env
APIFY_USE_GATEWAY=true
APIFY_GATEWAY_URL=https://script.google.com/macros/s/<actual-deployment-id>/exec
APIFY_GATEWAY_SECRET=<same-value-as-GATEWAY_SECRET>
```

The two values above are not optional placeholders. Replace them with the
deployed Apps Script `/exec` URL and the exact secret stored in Apps Script
Project Settings. Restart the bot after changing `.env`.

To verify the gateway before testing WhatsApp commands, send a small POST
request with the same secret. A successful response has `success: true` and an
`items` array:

```powershell
$body = @{
  secret = $env:APIFY_GATEWAY_SECRET
  op = "tiktok.search"
  input = @{ searchQueries = @("cricket"); resultsPerPage = 1 }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Method Post -Uri $env:APIFY_GATEWAY_URL `
  -ContentType "application/json" -Body $body
```

For local-only debugging, direct mode can be used temporarily:

```env
APIFY_USE_GATEWAY=false
APIFY_API_TOKEN=YOUR_APIFY_TOKEN
```

Do not use direct mode in production and do not put either credential in a
WhatsApp message or button ID.

## TikTok search

`.ttsearch <query>` uses `tiktokSearch()` from the Social Hub with five results.
The existing carousel, session tokens, expiry checks, buttons, and media sender
remain in [`plugins/ttsearch.js`](../plugins/ttsearch.js). Search data is not
treated as a permanent download URL; the existing media resolver/sender remains
the download boundary.

## Commands

The Social Hub-backed commands are grouped in `.socialmenu`. Existing commands
are not renamed or replaced. Actor IDs and input schemas are defined in the
provided gateway allowlist and should be verified against the current Apify
Actor Output tab before production rollout.
