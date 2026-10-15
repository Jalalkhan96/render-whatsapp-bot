# ABIX Sticker Command Patch

## Commands

- WhatsApp: reply to an image, short video, or GIF with `-sticker` or `-s`.
- Telegram: reply to a photo, short video, or GIF with `/sticker` or `/s`.
- The old GIF-only helper remains available as `-gif2sticker`.
- Legacy `-scc` and `-sss` GIF-maker commands are disabled to prevent command conflicts.

## Conversion behavior

- Images become static WebP stickers.
- Videos and GIFs become animated stickers.
- WhatsApp animated output is capped at 6 seconds and 500 KiB; static output targets 100 KiB.
- Telegram static output is capped at 512 KiB; video stickers use silent VP9 WebM, up to 3 seconds and 256 KiB.
- Scaling preserves aspect ratio. The converters do not add square padding or crop the source.
- Input size is capped at 25 MiB for WhatsApp and 20 MiB for Telegram to avoid excessive memory use.

## Installation

Copy the folders in this ZIP into the existing bot root, preserving paths and replacing the included files. Do not replace `.env` or session files. No new environment variables are required.

Dependencies already expected by the project include `sharp`, `@whiskeysockets/baileys`, and `file-type`. FFmpeg must be installed on the host; Telegram video stickers also require an FFmpeg build with the `libvpx-vp9` encoder.

Restart the bot after replacing the files.

## Verification performed

- Syntax checks passed for all changed JavaScript files.
- Focused source/command regression tests passed.
- A synthetic WhatsApp animated-video conversion produced a valid animated WebP within the size target.
- A synthetic Telegram video-sticker encoding produced silent VP9 WebM under 256 KiB.
- A mocked WhatsApp image-handler smoke test produced a WebP image sticker with ratio preserved.
- Live WhatsApp/Telegram delivery requires the bot to be running with valid credentials and was not tested here.
