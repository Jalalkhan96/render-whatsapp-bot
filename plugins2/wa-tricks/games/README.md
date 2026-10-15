# 🎮 WhatsApp Game Arcade

These games are **inline HTML Rich Response games** now, not `.html` document
attachments. On supported WhatsApp Android clients the HTML/CSS/JavaScript is
carried inside the message bubble and the user can play it directly there.

## Games
- `dino-runner.html` — 🦖 Dino Runner
- `flappy-bird.html` — 🐤 Flappy Bird
- `snake.html` — 🐍 Cyber Snake

All three are self-contained: CSS + JavaScript + game logic are inline and do
not depend on external CDN assets.

## 🎭 PFP personalization
Each game contains `{{PFP}}`. The bot tries to fetch the player's WhatsApp
profile picture and embeds it as a data URI before creating the native rich
message. When no picture is available, the game's default character is used.

## Native message path
`lib/richHtmlGame.cjs` builds:

`botForwardedMessage → richResponseMessage → unifiedResponse →
GenAIaeacdsnwHtmlPrimitive`

The payload is Base64 encoded inside `unifiedResponse.data` and relayed with
`relayMessage()`.

## Client support
WhatsApp's HTML rich primitive is a WhatsApp-client feature rather than a
normal Baileys message type. Current reverse-engineered implementations report
that `GenAIaeacdsnwHtmlPrimitive` renders natively on supported **Android**
clients; WhatsApp Web/Desktop may flatten or ignore the HTML section. The bot
therefore does not pretend that a browser attachment is the same thing.

## Commands
- `-games` / `-arcade` — open the game list
- `-dino` / `-dinorunner` — Dino Runner
- `-flappy` — Flappy Bird
- `-snake` — Cyber Snake

## Add a new game
1. Put a self-contained `.html` file in `games/`.
2. Keep external assets out of the file where possible because the rich HTML
   section is delivered as an inline payload.
3. Add `{ cmd, name, file, desc }` to `GAMES` in `wa-trick-games.cjs`.
4. The same `sendPersonalizedGame()` path will embed `{{PFP}}` automatically.
