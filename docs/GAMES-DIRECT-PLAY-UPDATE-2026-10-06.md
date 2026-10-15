# ABIX-AE Games — Direct Play Update (2026-10-06)

## What changed

- `-games` / `-gamemenu` sends one long arcade image containing the complete command catalogue.
- No legacy `ListMessage` is used for the arcade menu.
- Individual games use direct native-flow `quick_reply` buttons attached to the same game message.
- The previous `OPEN CONTROLS` / `single_select` intermediate sheet is removed.
- Game sends do not quote the triggering message and do not inject fake `Forwarded` metadata.
- Native-flow `messageVersion` is set to `1`, with an explicit empty context and normal MD device metadata.

## Important WhatsApp limitation

WhatsApp chat/image messages do not execute arbitrary JavaScript or a Canvas game inside the message bubble. Therefore the reliable in-chat implementation is a rendered game board plus direct quick-reply actions. Each tap returns an interactive response ID such as `-dino jump`; the existing command router executes that command and the bot sends the updated board.

This avoids unsupported Rich HTML/JS envelopes while keeping the game interaction inside the WhatsApp conversation.
