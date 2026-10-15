# ABIX-AE Integration

The original WA Broadcast Suite files are kept intact under this directory,
but ABIX does **not** start the suite's standalone `index.cjs`. Instead,
`index.js` adapts its command modules to the existing ABIX command loader and
reuses the already-connected ABIX Baileys socket.

## Menu

- `-bcastmenu`
- aliases: `-broadcastmenu`, `-broadcastsuite`, `-wbs`

## Commands

`-cast`, `-caststatus`, `-castreport`, `-castpause`, `-castresume`,
`-caststop`, `-filter`, `-groupcast`, `-groups`, `-members`, `-makegroups`,
`-addmembers`, `-autoreply`, `-survey`, `-surveyreport`, `-warm`, `-warmstop`,
`-exportchats`, `-lines`

All imported commands are owner-only at the ABIX command layer.

## Data layout

- Input files: `plugins2/wa-broadcast-suite/inbox/`
- Campaign/survey/report data: `data/wa-broadcast-suite/`
- Reports: `data/wa-broadcast-suite/reports/`

This avoids mixing broadcast state with the main bot data files.

## Runtime behavior

The suite's original standalone `index.cjs` remains available as a reference,
but is intentionally not launched by ABIX. This prevents a second WhatsApp
connection, duplicate Baileys runtime, duplicate dependency tree, or duplicate
session directory.
