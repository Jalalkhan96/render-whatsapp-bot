# ABIX-AE Games — Native HTML Message Gameplay

The supplied Flappy reference embeds the complete HTML/CSS/Canvas/JavaScript game in a native rich-response message. The unified response is base64 encoded and the HTML lives in `primitive.payload`.

ABIX now applies the same message model to all 31 arcade games:

- Open a game command.
- Build a self-contained HTML game document.
- Use the richer standalone HTML for Dino, Flappy and Snake where present.
- Use the existing 31-game HTML engine for the other games.
- Wrap the HTML with `lib/richHtmlGame.cjs`.
- Send it directly with `sock.relayMessage()`.
- Client-side JavaScript handles controls, game state, restart, game-over and local best scores.

Existing commands and the older SVG/quick-reply implementation remain available as a fallback.

`WA_GAME_MODE=auto` — native HTML first, fallback on rejection.
`WA_GAME_MODE=native` — native HTML only.
`WA_GAME_MODE=buttons` — force the existing compatible controls.

`WA_GAME_TRUSTED_SOURCES` can override the comma-separated trusted-source metadata.
