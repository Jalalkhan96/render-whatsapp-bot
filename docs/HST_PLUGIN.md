# ABIX HST.SH Code Share Plugin

Adds `-hst` to the existing ABIX Baileys command architecture without changing `messageHandler.js` or introducing a second upload service.

## Commands

```text
-hst <code>
-hst              # reply to a text/code message
-hst              # reply to a code document
-hstmenu
```

## Link formats

For a generated key such as `egunovokil`, the plugin returns:

```text
https://hst.sh/egunovokil
https://hst.sh/raw/egunovokil
```

The first is the normal share/view page; the second is the raw source/code endpoint.

## Behavior

1. The existing command router invokes `plugins2/hst.js`.
2. The plugin first checks for inline code after `-hst`.
3. When there is no inline code, it reads the quoted text or quoted document.
4. Code is kept in memory only; no permanent temp file is created.
5. The plugin sends the text directly to `POST https://hst.sh/documents` with `text/plain` content.
6. HST.SH returns a paste key. The plugin turns it into both `https://hst.sh/<key>` (share/view link) and `https://hst.sh/raw/<key>` (direct raw-code link).
7. The response is sent in the same chat and quoted to the user's original message.
8. The channel promotion is placed at the top of the response.

HST.SH is a Hastebin-style service. Public references document the `/documents` raw-text upload flow and a response containing a paste key, which is then combined with the host URL. See the implementation notes and sources used during development.

## Configuration

Optional `.env` settings:

```env
HST_BASE_URL=https://hst.sh
HST_CHANNEL_LINK=https://your-channel-link
HST_MAX_CHARS=400000
HST_MAX_BYTES=2097152
HST_TIMEOUT_MS=20000
HST_COOLDOWN_MS=3000
HST_MAX_REQUESTS_PER_WINDOW=10
HST_RATE_WINDOW_MS=60000
```

`HST_CHANNEL_LINK` overrides the default ABIX channel link. Replace it with the channel you actually want users to follow.

## Security

HST.SH creates publicly shareable pastes. Never use `-hst` for passwords, API keys, OAuth tokens, cookies, WhatsApp session material, database credentials, or other secrets.

## Integration

Copy only:

```text
plugins2/hst.js
```

into the existing bot. The current command loader already loads `plugins2` commands, so no change to `messageHandler.js` is required.

The plugin uses Node.js 20's built-in `fetch()` and the existing `@whiskeysockets/baileys` dependency for quoted-document downloads.
