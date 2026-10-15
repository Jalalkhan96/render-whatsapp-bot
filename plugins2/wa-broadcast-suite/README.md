# WA Broadcast Suite

WhatsApp business automation on Baileys (CommonJS, Node 18+). Multi-line bulk
campaigns with Excel contacts, `{variable}` personalization, media attachments,
randomized human-like delays, batch pauses, delivery/read tracking, group
broadcasts, member export, bulk group tools, editable autoresponder, smart
surveys, number filter, and a line warmer.

Built with reference to open-source Baileys bulk-sender projects
(kaushikrudra/whatsapp-tool-bulk-message, codingbhava/whatsapp_bulk,
rakibul509/biko-whatsapp-marketing) — this suite is written from scratch in
the same stack: `@whiskeysockets/baileys` + `xlsx`, no database, no web UI,
everything driven by owner-only `-` commands in chat.

## Install

**Windows 11 / VPS (Ubuntu/Debian):**
```bash
node -v        # need 18+
npm install
cp config.example.json config.json   # then edit owners + lines
node index.cjs
```
Scan the QR code(s) with WhatsApp > Linked devices.

**Android (no computer needed):** install Termux from F-Droid, then
```bash
pkg install nodejs
cd wa-broadcast-suite && npm install
# edit config.json, then:
node index.cjs
```
Keep Termux awake (acquire wakelock) or campaigns pause when the phone sleeps.

**VPS without a personal computer:** upload this folder to the VPS (SFTP/Git),
`npm install`, edit `config.json`, run `node index.cjs` inside `tmux`/`screen`
so it survives disconnects. Scan the QR from your phone.

## Config (`config.json`)

- `owners`: your WhatsApp JIDs (`923001234567@s.whatsapp.net`) — only these
  numbers (or the linked device itself) can run commands.
- `lines`: one entry per sending number, e.g. `[{"id":"line1"},{"id":"line2"}]`.
  Each line scans its own QR; sessions persist in `auth/<id>/`.
- `warmSeeds`: YOUR OWN numbers/groups, used only by the warmer.
- `prefix`: command prefix, default `-`.

## Usage

Drop Excel/CSV files into `inbox/`. Contact sheets need a `phone` column
(full international format, e.g. `923001234567`) plus any columns you want as
`{variables}` (`name`, `city`, …).

```
-cast contacts.xlsx "Hi {name}, ..." [--media inbox/promo.jpg] [--type image]
      [--delay 25-70] [--batch 40] [--pause 300]
-caststatus <id> / -castreport <id> / -castpause <id> / -castresume <id> / -caststop <id>
-filter list.xlsx            # keep only numbers actually on WhatsApp
-groupcast "msg" [--media f] # broadcast to every group this line joined
-groups                      # list my groups
-members all                 # member numbers of my groups -> Excel
-members 1,3
-makegroups "Sales|Support" [--file inbox/phones.xlsx]
-addmembers 2 inbox/phones.xlsx   # line must be group admin
-autoreply add contains price "Our pricelist…"
-survey <campaignId> "Q1?|Q2?"   # follow-up survey to campaign recipients
-surveyreport <id>
-warm 1 … -warm 7 / -warmstop    # gradual warm-up on your own seeds
-exportchats                 # groups + seen contacts -> Excel
-lines / -menu
```

Campaign state is saved to `data/campaigns/` — if the bot restarts mid-run,
re-running `-cast` skips already-sent contacts. Delivery (double tick) and
read (blue tick) receipts update the report live.

## Honest limits (read this)

- **There is no "unlimited".** WhatsApp rate-limits and bans aggressively.
  Keep delays sane (25–70s), batch sizes modest, and warm new lines first.
- **Delivery reports are honest, not 100%.** `delivered` = reached the device,
  `read` = blue ticks (only if the recipient has read receipts on). Nobody can
  guarantee 100% delivery confirmation.
- **Only message people who opted in** (your customers, your groups). Mass
  messaging strangers gets the number banned fast and can be illegal
  (in Pakistan: PECA; in EU: GDPR).
- This uses the unofficial Baileys library, not the official WhatsApp Business
  API. For high-volume business messaging, Meta's official Cloud API is the
  safe route.

## Deliberately NOT included

Number scraping from Google Maps/websites, extracting numbers from groups you
are not a member of, auto-joining groups, and "ban-proof rotation" tricks —
those are non-consensual extraction and ban evasion, and they get accounts
killed. Everything in this suite works on your own contacts, your own groups,
and numbers people gave you.
