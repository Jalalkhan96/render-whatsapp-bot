# ABIX-AE Development Code

Code in this directory is intentionally not loaded by the production command
loader.

## Free Fire

- `freefire-commands/` contains all Free Fire WhatsApp commands.
- `freefire-lib.js` contains the Free Fire API client and response formatting.
- `freefire-api/` contains the separate Railway proxy and the old Discord bot
  source under `freefire-api/botff/`.

The production bot currently does not register or mount these files. This keeps
unfinished Free Fire commands out of the live menu and command router while
preserving the implementation for later provider testing.

To re-enable the commands later, move the files back into their original
locations and configure a verified upstream provider. Do not enable the
commands while the provider returns 401, 402, 404, or timeout responses.
