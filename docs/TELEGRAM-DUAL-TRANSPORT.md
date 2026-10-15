# ABIX Telegram + WhatsApp UI update

WhatsApp/Baileys and Telegram Bot API are separate transports in the same bot process. The Telegram UI uses native Telegram text, inline keyboards, reply keyboards, photos/videos, media albums and message edits. It does not inject HTML into Telegram chat messages.

## Telegram commands

**Core UI**: `/start`, `/menu`, `/more`, `/help`, `/ping`, `/status`, `/settings`, `/search`, `/keyboard`, `/hidekeyboard`, `/album`, `/links`, `/inline`, `/app`.

**ID finder**: `/id` (user + chat), `/myid`, `/userid`, `/chatid`, `/groupid`, `/channelid`. Reply to another user's message with `/userid` to identify the replied-to user. Run `/groupid` inside the group. Run `/channelid` as a post inside a channel where the bot is a member (and has permission to reply).

**Effects on both platforms**:
- TextPro.me: `-textpro` / `/textpro`, `-tppopular` / `/tppopular`, `-tpnew` / `/tpnew`, `-tpsearch neon` / `/tpsearch neon`.
- Ephoto360 English: `-ephoto` / `/ephoto`, `-epopular` / `/epopular`, `-epnew` / `/epnew`, `-epsearch neon` / `/epsearch neon`.
- BirthdayCake24: `-birthdaycake` / `/birthdaycake`, `-bcpopular` / `/bcpopular`, `-bcnew` / `/bcnew`, `-bcsearch cake` / `/bcsearch cake`.

Each individual template command is also available (for example `/tpneon ABIX`, `/epmagic ABIX`, `/bdfireworks JALAL`). The Telegram slash-command dropdown stays short to avoid dozens of template entries; individual template commands still work and can be found in the inline-button template menus. WhatsApp uses `BOT_PREFIX` (default `-`).

## UI features

- Animated `/start` welcome: brief status messages, then the main menu.
- Main menu: compact two-column grid or full-width list, switchable in **Settings → Button layout**.
- Back/Home controls, search filters and pagination.
- Photo/video cards and a media album (`/album`). Album buttons are sent in a following message because Telegram media albums cannot carry one shared inline keyboard.
- Inline search: use `/inline`; then enable Inline Mode for the bot using `@BotFather`'s `/setinline`. This Bot API feature cannot be enabled by code.
- Quick deep links: `/links`; links open the chosen bot section with a `/start` parameter.
- Theme presets: Neon Cyber, Matrix and Minimal. Native Telegram clients control actual chat and button colors; themes change bot styling/text and configured media, not Telegram's app chrome.
- Optional Mini App: `/app`, only when `TELEGRAM_WEBAPP_URL` is a valid HTTPS URL and your domain is configured for the bot. Full CSS animation and Web App haptic feedback are Mini App features. A native bot cannot force sound or vibration on inline-button taps; audio playback is controlled by the Telegram client/device.
- Admin dashboard: `/admin` or the Admin button, restricted to numeric IDs in `TELEGRAM_ADMIN_IDS` and private chats.
- Per-group Anti-Link toggle appears in Settings; it is off by default and needs bot admin permission to delete messages. Only group administrators may toggle it.

## Environment

```dotenv
TELEGRAM_BOT_TOKEN=
TELEGRAM_ADMIN_IDS=
TELEGRAM_POLL_TIMEOUT_SECONDS=25
TELEGRAM_DEFAULT_THEME=cyber
TELEGRAM_DEFAULT_LAYOUT=grid
TELEGRAM_MENU_IMAGE=assets/bot_top_image.jpg
TELEGRAM_MENU_VIDEO=
TELEGRAM_MEDIA_MAX_BYTES=20971520
TELEGRAM_ALBUM_MEDIA=assets/card1.png,assets/card2.png,assets/card3.png
TELEGRAM_WEBAPP_URL=
TELEGRAM_AUTO_APPROVE_JOIN_REQUESTS=false
TELEGRAM_AUTO_APPROVE_CHAT_IDS=
```

`TELEGRAM_ALBUM_MEDIA` accepts 2–10 comma-separated local paths within the project, public HTTPS URLs, or existing Telegram file IDs. Prefix an item with `photo:` or `video:` to override type inference. Keep media files under `TELEGRAM_MEDIA_MAX_BYTES`. `TELEGRAM_WEBAPP_URL` can stay empty if using only native Telegram UI.

Create the Telegram bot with `@BotFather` and keep `TELEGRAM_BOT_TOKEN` secret. Set `TELEGRAM_ADMIN_IDS` to numeric Telegram user IDs; WhatsApp phone numbers do not grant Telegram admin access.

## If Telegram commands still do not reply

1. Confirm `TELEGRAM_BOT_TOKEN` is the token for the intended bot, save `.env`, and restart the process. Use `/start` and `/ping`.
2. Run only **one** polling process for this token. A Telegram API `409 Conflict` usually means another instance is polling or a webhook is configured. Stop duplicate instances.
3. This transport intentionally does not delete an existing webhook. Check `getWebhookInfo`; if it returns a webhook URL and you intend to use long polling, remove that webhook explicitly in your deployment before restarting. Do not run polling and a webhook for the same token simultaneously.
4. Inspect startup logs for `[Telegram] Startup failed` or `[Telegram] Polling error`. `/status` gives configured admins additional diagnostics after polling is running.
5. Inline mode requires enabling via `@BotFather`; a Mini App requires HTTPS and a configured domain. These are Telegram platform requirements, not bot commands that can self-enable.
6. To retrieve IDs: use `/id` in a direct/group chat; reply to a person's message with `/userid`; use `/groupid` inside a group; publish `/channelid` in a channel containing the bot.

## Join-request auto-approval

Auto-approval is disabled by default. To enable it, set `TELEGRAM_AUTO_APPROVE_JOIN_REQUESTS=true` and preferably set `TELEGRAM_AUTO_APPROVE_CHAT_IDS` to comma-separated target chat IDs. The bot needs administrator permission `can_invite_users` in the relevant chats, and users must join through an invite link that creates join requests.

## Verification

Run `node tests/telegram-bot.test.js` and `node tests/textpro.test.cjs` from the project root. These are local regression tests and do not send live messages or perform external image generation.
