# Ping card update

`-ping` now sends a normal WhatsApp image bubble whose artwork is generated from
an SVG template. This follows the supplied `html-bubble` concept: the HTML/SVG
is rendered server-side and WhatsApp receives a picture, not a `.html` file.

Dynamic fields:
- Bot name from `BOT_NAME` / `settings.botName`
- Requesting user
- Latency
- Quality label
- Heap used
- Process RSS
- Node.js version
- Platform/architecture
- Process uptime
- Pakistan-local request time
- Host/chat diagnostics

The existing `sharp` dependency is used for SVG → PNG, so no new npm package is
required. `Puppeteer` is only needed for the separate `-htmlbubble` command.
