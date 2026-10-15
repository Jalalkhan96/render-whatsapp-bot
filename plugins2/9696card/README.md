# 9696 Style Card — No Forward / No Caption

This patch makes every anime card use the **9696 Style Card** branding and sends the rendered card as a clean standalone image.

## Commands
- `-9696card <name>`
- `-9696card <name> <style>`
- `-9696card <name> design <1-12>`
- `-card <name>`
- `-card design <1-12>`
- `-9696random [style]`
- `-9696styles`

## Important behavior
- No `SHOOB` branding.
- No `Forwarded`/newsletter wrapper.
- No caption outside the card image.
- `_skipForwardContext` is set on card messages, so the global ABIX synthetic newsletter wrapper is bypassed.
- Numeric designs `1-12` map to the 12 9696 styles.

The card itself is generated from the 9696 visual layout and sent as an image because WhatsApp's undocumented AI HTML primitive is transported through `botForwardedMessage`; using that transport necessarily produces the forwarded-style envelope.
