# myBOT Font Downloader — numbered selection update

## Main flow

`-font` now fetches a numbered DaFont list and stores that list for the requesting user/chat.

Then download one or more entries with:

- `-fd 1`
- `-fd 1,3,4`
- `-fd 1,3 4`

The selection is scoped to chat + sender and expires after 20 minutes. Up to 10 entries from the active list can be selected in one command.

## Other list-producing commands

Selections are also stored by:

- `-font search <name>`
- `-font random`
- `-font random <type>`
- `-font type <type>`
- `-font lang <language>`
- `-font license <filter>`
- `-font urdu`

For Urdu/Arabic-script lists, `-fd` downloads the selected Google Font files.
For DaFont lists, `-fd` downloads the corresponding DaFont ZIP.

## DaFont download fix

The downloader now reads the current `dl.dafont.com/dl/?f=...` link when present and falls back to resolving the font page before constructing a safe direct download URL.

No new npm dependency is required.
