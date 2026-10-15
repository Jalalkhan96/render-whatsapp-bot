# ABIX HTML Games — `_stPayload` Update

## Scope

All dedicated HTML games under `plugins2/wa-tricks/games/` now use the shared
`lib/richHtmlGame.cjs` sender for the native HTML payload shape.

Current dedicated HTML game files:

- `dino-runner.html`
- `flappy-bird.html`
- `snake.html`

`plugins/dinorunner.js` already uses `lib/richHtmlGame.cjs`, so it is covered by
the same builder.

## Payload

The shared `_stPayload()` helper now implements the supplied structure, and `buildNativeHtmlGame()` validates the HTML before delegating to it:

- `messageContextInfo.botMetadata`
- `botForwardedMessage.message.richResponseMessage`
- `unifiedResponse.data` containing base64-encoded JSON
- `GenAIaeacdsnwHtmlPrimitive`
- `GenAISingleLayoutViewModel`
- the supplied trusted source default (`nixel.dev`)

The hard-coded proof/certificate values remain in `lib/richHtmlGameMeta.json`,
which is reused by the shared builder instead of duplicating the values in each
game plugin.

## Runtime behavior

`plugins2/wa-tricks/inchat-games.cjs` now routes its Rich HTML path through
`sendNativeHtmlGameWithFallback()` rather than the older `sock.createAIRich()`
helper. This keeps all three dedicated HTML games on one payload implementation.

If native relay is unavailable or rejected, the existing image fallback remains
available.

## Validation

The update should be checked with:

```bash
node --check lib/richHtmlGame.cjs
node --check plugins2/wa-tricks/inchat-games.cjs
node native-game-self-test.cjs
```
