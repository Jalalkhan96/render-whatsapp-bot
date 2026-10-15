# ABIX Font Studio — WhatsApp Menu Redesign

## What's changed
- Replaced the plain menu with WhatsApp-formatted headings, italic descriptions, monospaced command examples, separators, and a short copy/send tip.
- Includes the combined catalog search, Urdu/Nastaliq commands, filters, source shortcuts, recent-result selection, stats, and sources.
- Preserves the existing command handler and database/direct-attachment logic; this patch changes the menu presentation only.
- Avoids claiming that every saved URL is guaranteed to work. It explains that actual file attachments depend on the source URL being publicly downloadable.

## Install
1. Extract this ZIP into the existing ABIX bot root and overwrite `plugins/font-downloader.js`.
2. Do not replace `.env`, WhatsApp session files, or the existing database helper.
3. Restart the bot with your normal start command.

## Test
From the bot root, run:

```bash
node tests/font-menu.test.cjs
```

This verifies menu styling, command coverage, prefix handling, and real newline rendering. It does not require live Turso credentials.
