# ABIX HTML Games UI Enhancement — 2026-10-08

## What changed

All 31 arcade commands now use the HTML-game rendering path through the shared native HTML sender.

### Dedicated HTML games
- dino / dinorunner / dinorun
- flappy / flappybird / flap
- snake

These use the dedicated files under `plugins2/wa-tricks/games/`.

### Remaining games
The other 28 commands use the shared HTML template in `plugins2/wa-tricks/arcade-games.cjs`.

## UI improvements
- Larger game stage
- Wider 760px shell where the client allows it
- Responsive 2-column action controls
- 44px+ touch targets
- Larger canvas presentation
- Larger puzzle cells and answer buttons
- Improved score / best / status cards
- HTML start screen with a single `PLAY NOW` action
- Safe `localStorage` wrappers so isolated WhatsApp HTML contexts do not crash on storage access
- `click`, `pointerup`, and `touchend` start compatibility
- Reduced-motion CSS fallback

## Game menu
`-gamemenu`, `-games`, `-arcade`, and `-gamecenter` now route through the HTML Game Menu.

The menu contains all 31 games, source categories, live search/filtering, and exact chat commands.

## Compatibility
If the WhatsApp client accepts the native HTML primitive, the interactive HTML is sent. The existing HTML bubble/image fallback remains available for clients that reject the native rich payload.
