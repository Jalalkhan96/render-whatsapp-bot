# Pinterest Scraper Prototype

This is a standalone Pinterest scraper prototype. It is intentionally outside
the WhatsApp bot; no plugin, dispatcher, or bot command was changed.

## Run a public search

```powershell
node .\pinterstscrap\index.js --query "cricket"
```

Results are stored in:

```text
pinterstscrap/data/latest.json
```

## Watch for new pins

```powershell
$env:PINTEREST_INTERVAL_MS = "300000"
node .\pinterstscrap\index.js --query "cricket" --watch
```

The prototype uses public Pinterest pages, keeps a small ID cache, and reports
new pin URLs. It does not bypass login, CAPTCHA, robots rules, or rate limits.
Do not place an account cookie in this repository or send it in chat. If a
future private-account adapter is needed, use a local ignored path and obtain
the account owner's explicit approval.

## Optional cookie file (local only)

If Pinterest starts returning very limited public results, you can use your own
local exported cookie JSON file without committing it:

```powershell
$env:PINTEREST_COOKIES_JSON = "C:\\safe-local-path\\cookies.json"
node .\pinterstscrap\index.js --query "cricket"
```

Cookie files are for your own account/session only and should never be pushed
to GitHub or shared in chats.

The future bot menu name is documented as `-pinterstonlymenu` to match the
requested spelling, but it is not registered until this prototype is reviewed.
