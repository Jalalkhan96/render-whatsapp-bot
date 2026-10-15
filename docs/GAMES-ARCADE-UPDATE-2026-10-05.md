# Game Arcade + Ping Update — 2026-10-05

## Game Arcade

The WhatsApp Game Arcade now contains the game set shown in the supplied reference screenshots:

- trivia / math hard, wyr, rps, math, hangman, 2048, breakout, car/race,
  casino, connect4, dino, doom, flappy, frogger, galaxy, knifehit, maze,
  memory, mines, pong, quiz, snake, solars, stack, tetris, tictactoe, whack,
  piano, shooter and simon.

Commands:

- `-games` — page 1
- `-games 2` — page 2
- `-gamemenu` — same arcade
- Individual game commands use the command names above.

Dino, Flappy Bird and Snake continue to use their dedicated HTML game files.
The other games use a single self-contained lightweight HTML arcade template,
which keeps the deployment footprint small and avoids 30 duplicated HTML files.

## WhatsApp delivery

The bot first tries the native HTML rich message path. When the connected WhatsApp
client/relay does not accept that primitive, the same game HTML is rendered as a
normal PNG image. A normal PNG cannot execute JavaScript, so interactive gameplay
on those clients is not claimed.

## Ping memory hardening

`-ping` now:

- renders the SVG at 96dpi instead of 180dpi;
- disables image caching;
- serializes the heavy SVG render to one in-flight ping;
- avoids sending a reaction unless `PING_REACT=true`;
- falls back to lightweight text while another ping image is rendering.

The shared SVG renderer default was also reduced from 192dpi to 96dpi.
