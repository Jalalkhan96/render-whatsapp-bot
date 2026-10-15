# MYBOT Native WhatsApp Code Blocks

This feature targets the WhatsApp message UI shown in the reference screenshot: a dedicated code card with a language label, syntax highlighting, copy action, scrolling for long code, and WhatsApp's native rich-response rendering.

## What changed

- `native-code-block.cjs` parses fenced Markdown blocks such as ` ```javascript ... ``` `.
- `plugins2/codeblock.js` adds `-code`, `-codeblock`, `-codeview`, and `-cb`.
- `lib/channelInfo.js` auto-converts fenced code in outgoing text messages before the normal text sender runs.
- `lib/messageHandler.js` and `index.js` call the socket patch early so command replies, chatbot replies, moderation messages, Bix messages and other outgoing bot messages share the same behavior.
- The old PNG/image code renderer is **not** used for automatic code formatting.

## Required runtime

The original bot was pinned to `@whiskeysockets/baileys` `7.0.0-rc.9`. The native Rich Response API is not available there. This patch keeps the CommonJS bot architecture and installs `@nuiisweety/baileys` `0.1.21` through an npm alias at the existing package name `@whiskeysockets/baileys`.

After extracting the patch, run:

```bash
npm install --no-audit --no-fund
npm run preflight
```

Do **not** run `npm ci` before refreshing the lockfile, because this patch intentionally changes the Baileys dependency through an npm alias.

## Commands

```text
-code javascript const x = 10;
-code python print("hello")
```

You can also reply to an existing text/code message:

```text
-code javascript
```

The helper understands common aliases such as `js`, `ts`, `py`, `c++`, `cs`, `sh`, `ps1`, `yml`, `mysql`, `postgresql`, `sqlite`, etc.

## Automatic behavior

Any outgoing bot text containing a fenced block is intercepted:

```text
Here is the example:
```javascript
const x = 1;
console.log(x);
```
Copy this into your project.
```

On a compatible runtime this is converted to a single Rich Response message containing normal text + native code + trailing text. On an unsupported runtime/client it safely falls back to the original triple-backtick text instead of sending a generated image.

For messages that must remain literal Markdown, pass `_skipCodeBlockAutoFormat: true` to the message content.
