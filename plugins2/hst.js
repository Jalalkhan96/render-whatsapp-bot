'use strict';

/**
 * ABIX HST.SH Code Uploader
 *
 * Commands:
 *   -hst <code>
 *   -hst              (reply to a text/code/document message)
 *   -hstmenu
 *
 * HST.SH uses the Hastebin-style raw upload endpoint:
 *   POST https://hst.sh/documents
 * with the paste body as plain text. A successful response contains a key,
 * producing both:
 *   https://hst.sh/<key>
 *   https://hst.sh/raw/<key>
 */

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const HST_BASE_URL = String(process.env.HST_BASE_URL || 'https://hst.sh').replace(/\/+$/, '');
const HST_UPLOAD_URL = `${HST_BASE_URL}/documents`;

// Existing ABIX channel link from the current message handler; env can override it.
const DEFAULT_CHANNEL_NAME = 'ABIX-AE';
const CHANNEL_NAME = String(
    process.env.HST_CHANNEL_NAME ||
    process.env.CHANNEL_NAME ||
    DEFAULT_CHANNEL_NAME
).trim();
const DEFAULT_CHANNEL_LINK = 'https://whatsapp.com/channel/0029VagJIAr3bbVBCpEkAM07';
const CHANNEL_LINK = String(
    process.env.HST_CHANNEL_LINK ||
    process.env.WHATSAPP_CHANNEL_URL ||
    process.env.CHANNEL_URL ||
    DEFAULT_CHANNEL_LINK
).trim();

const MAX_CHARS = Math.max(1000, Number(process.env.HST_MAX_CHARS || 400000));
const MAX_BYTES = Math.max(1024, Number(process.env.HST_MAX_BYTES || 2 * 1024 * 1024));
const REQUEST_TIMEOUT_MS = Math.max(5000, Number(process.env.HST_TIMEOUT_MS || 20000));
const COOLDOWN_MS = Math.max(1000, Number(process.env.HST_COOLDOWN_MS || 3000));
const MAX_REQUESTS_PER_WINDOW = Math.max(1, Number(process.env.HST_MAX_REQUESTS_PER_WINDOW || 10));
const RATE_WINDOW_MS = Math.max(10000, Number(process.env.HST_RATE_WINDOW_MS || 60000));

const rateState = new Map();

function normalizeCommand(value) {
    return String(value || '').trim().replace(/^[.!#$\/\-]+/, '').toLowerCase();
}

function getJid(message, context) {
    return context?.chatId || message?.key?.remoteJid || null;
}

function getSenderId(message, context) {
    return context?.senderId || message?.key?.participant || message?.key?.remoteJid || 'unknown';
}

function getQuotedMessage(message) {
    const source = message?.message || {};
    const candidates = [
        source.extendedTextMessage?.contextInfo,
        source.imageMessage?.contextInfo,
        source.videoMessage?.contextInfo,
        source.documentMessage?.contextInfo,
        source.audioMessage?.contextInfo,
        source.stickerMessage?.contextInfo,
        source.buttonsResponseMessage?.contextInfo,
        source.templateButtonReplyMessage?.contextInfo,
        source.listResponseMessage?.contextInfo
    ];

    for (const info of candidates) {
        if (info?.quotedMessage) return info.quotedMessage;
    }
    return null;
}

function firstTextFromMessage(messageLike) {
    if (!messageLike) return '';
    return (
        messageLike.conversation ||
        messageLike.extendedTextMessage?.text ||
        messageLike.imageMessage?.caption ||
        messageLike.videoMessage?.caption ||
        messageLike.documentMessage?.caption ||
        messageLike.buttonsResponseMessage?.selectedDisplayText ||
        messageLike.templateButtonReplyMessage?.selectedDisplayText ||
        messageLike.listResponseMessage?.title ||
        ''
    );
}

function cleanCode(text) {
    let value = String(text || '').replace(/^\uFEFF/, '');
    value = value.trim();

    // Preserve the actual code while removing a surrounding Markdown fence.
    const fenced = value.match(/^```([^\n]*)\n([\s\S]*?)\n```$/);
    if (fenced) value = fenced[2].trim();

    return value;
}

function parseInlineCode(context) {
    const raw = String(context?.rawText || context?.messageText || '').trim();
    if (!raw) return '';

    const prefix = String(context?.prefix || '').trim();
    let body = raw;

    // Remove the configured prefix only once.
    if (prefix && body.startsWith(prefix)) body = body.slice(prefix.length).trimStart();

    // This plugin has aliases, but the dispatcher normally passes the selected
    // command in raw text. Remove the first token only, leaving the rest intact.
    const firstSpace = body.search(/\s/);
    if (firstSpace === -1) return '';

    body = body.slice(firstSpace + 1);
    return cleanCode(body);
}

function getDocumentMeta(quotedMessage) {
    const doc = quotedMessage?.documentMessage;
    if (!doc) return null;

    return {
        message: doc,
        filename: String(doc.fileName || 'code.txt').trim() || 'code.txt',
        mimetype: String(doc.mimetype || 'text/plain').toLowerCase()
    };
}

function looksLikeBinary(buffer, mimetype, filename) {
    const name = String(filename || '').toLowerCase();
    const allowedBinaryTextMimes = new Set([
        'application/json',
        'application/javascript',
        'application/x-javascript',
        'application/typescript',
        'application/x-typescript',
        'application/xml',
        'application/x-yaml',
        'application/yaml',
        'text/plain',
        'text/javascript',
        'text/typescript',
        'text/css',
        'text/html',
        'text/xml',
        'text/x-python',
        'text/x-java-source',
        'text/x-c',
        'text/x-c++src'
    ]);

    if (allowedBinaryTextMimes.has(mimetype) || mimetype.startsWith('text/')) return false;

    // Extensions give us a safe fallback for code documents whose MIME type is generic.
    if (/\.(js|jsx|ts|tsx|mjs|cjs|json|py|java|kt|kts|c|h|cc|cpp|hpp|cs|php|rb|go|rs|swift|dart|css|scss|html|htm|xml|yml|yaml|sql|sh|bash|bat|ps1|md|txt|toml|ini|env)$/i.test(name)) {
        return false;
    }

    // NUL bytes are a strong signal that the file is not plain source text.
    const probe = buffer.subarray(0, Math.min(buffer.length, 8192));
    return probe.includes(0);
}

async function readQuotedDocument(quotedMessage) {
    const meta = getDocumentMeta(quotedMessage);
    if (!meta) return null;

    const chunks = [];
    let total = 0;

    const stream = await downloadContentFromMessage(meta.message, 'document');
    for await (const chunk of stream) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buf.length;
        if (total > MAX_BYTES) {
            throw new Error(`document is too large (limit ${MAX_BYTES.toLocaleString()} bytes)`);
        }
        chunks.push(buf);
    }

    const buffer = Buffer.concat(chunks);
    if (looksLikeBinary(buffer, meta.mimetype, meta.filename)) {
        throw new Error('the replied document does not look like a text/code file');
    }

    const text = buffer.toString('utf8');
    return {
        text: cleanCode(text),
        filename: meta.filename
    };
}

function checkRateLimit(senderId) {
    const key = String(senderId || 'unknown');
    const now = Date.now();
    const state = rateState.get(key) || { windowStart: now, count: 0, last: 0 };

    if (now - state.windowStart >= RATE_WINDOW_MS) {
        state.windowStart = now;
        state.count = 0;
    }

    if (now - state.last < COOLDOWN_MS) {
        return { ok: false, reason: `please wait ${Math.ceil((COOLDOWN_MS - (now - state.last)) / 1000)}s` };
    }

    if (state.count >= MAX_REQUESTS_PER_WINDOW) {
        return { ok: false, reason: `rate limit reached (${MAX_REQUESTS_PER_WINDOW} uploads/minute)` };
    }

    state.last = now;
    state.count += 1;
    rateState.set(key, state);

    // Keep the map small on long-running servers.
    if (rateState.size > 2000) {
        for (const [entryKey, entry] of rateState) {
            if (now - entry.windowStart > RATE_WINDOW_MS * 2) rateState.delete(entryKey);
        }
    }

    return { ok: true };
}

async function postToHst(text) {
    const body = Buffer.from(text, 'utf8');

    if (body.length > MAX_BYTES) {
        throw new Error(`code is too large (limit ${MAX_BYTES.toLocaleString()} bytes)`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(HST_UPLOAD_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Content-Length': String(body.length)
            },
            body,
            signal: controller.signal
        });

        const raw = await response.text();
        let data;
        try {
            data = JSON.parse(raw);
        } catch {
            data = null;
        }

        if (!response.ok) {
            const message = data?.message || data?.error || raw?.slice(0, 200) || `HTTP ${response.status}`;
            throw new Error(`hst.sh rejected the upload: ${message}`);
        }

        const key = data?.key || data?.id || data?.name;
        if (!key) {
            throw new Error('hst.sh returned no paste key');
        }

        const encodedKey = encodeURIComponent(String(key));

        return {
            key: String(key),
            url: `${HST_BASE_URL}/${encodedKey}`,
            rawUrl: `${HST_BASE_URL}/raw/${encodedKey}`
        };
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw new Error('hst.sh upload timed out');
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

function channelHeader() {
    return CHANNEL_LINK
        ? `📢 *Follow our channel:*\n*${CHANNEL_NAME}*\n${CHANNEL_LINK}\n\n`
        : '';
}

function menuText(prefix) {
    const p = prefix || '-';
    return [
        '╭━━━〔 *HST.SH CODE SHARE* 〕━━━╮',
        '┃',
        `┃ 📤 ${p}hst <code>`,
        `┃ ↩️ ${p}hst  — reply to code/text`,
        `┃ 📄 ${p}hst  — reply to a code file`,
        `┃ ℹ️ ${p}hstmenu`,
        '┃',
        '┃ Creates a public shareable HST.SH link.',
        '┃ The result is sent back in this chat',
        '┃ and quoted to the original message.',
        '┃',
        '┃ ⚠️ Do not upload passwords, API keys,',
        '┃ session tokens, or other secrets.',
        '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯'
    ].join('\n');
}

async function safeSend(sock, jid, text, message) {
    return sock.sendMessage(jid, { text }, { quoted: message });
}

module.exports = {
    command: 'hst',
    aliases: ['hstmenu'],
    category: 'tools',
    description: 'Upload code/text to hst.sh and return a shareable link',
    permission: 'public',

    async handler(sock, message, args = [], context = {}) {
        const jid = getJid(message, context);
        if (!jid) return;

        const senderId = getSenderId(message, context);
        const prefix = String(context?.prefix || process.env.PREFIX || '-');
        const currentCommand = normalizeCommand(
            String(context?.rawText || '').trim().split(/\s+/)[0]
        );

        if (currentCommand === 'hstmenu' || String(args?.[0] || '').toLowerCase() === 'menu' || String(args?.[0] || '').toLowerCase() === 'help') {
            return safeSend(sock, jid, channelHeader() + menuText(prefix), message);
        }

        const limit = checkRateLimit(senderId);
        if (!limit.ok) {
            return safeSend(sock, jid, `❌ *HST.SH* ${limit.reason}.`, message);
        }

        let code = parseInlineCode(context);
        let filename = '';
        let source = 'inline';

        if (!code) {
            const quoted = getQuotedMessage(message);
            if (quoted) {
                const quotedDocument = getDocumentMeta(quoted);
                if (quotedDocument) {
                    const result = await readQuotedDocument(quoted);
                    code = result?.text || '';
                    filename = result?.filename || '';
                    source = 'document';
                } else {
                    code = cleanCode(firstTextFromMessage(quoted));
                    source = 'reply';
                }
            }
        }

        if (!code) {
            return safeSend(
                sock,
                jid,
                channelHeader() +
                `❌ *No code/text found.*\n\n` +
                `Use:\n${prefix}hst <code>\n\n` +
                `or reply to a code/text/document with ${prefix}hst`,
                message
            );
        }

        if (code.length > MAX_CHARS) {
            return safeSend(
                sock,
                jid,
                `❌ Code is too large. Limit: ${MAX_CHARS.toLocaleString()} characters.`,
                message
            );
        }

        const bytes = Buffer.byteLength(code, 'utf8');
        if (!bytes) {
            return safeSend(sock, jid, '❌ The code is empty.', message);
        }
        if (bytes > MAX_BYTES) {
            return safeSend(sock, jid, `❌ Code is too large. Limit: ${MAX_BYTES.toLocaleString()} bytes.`, message);
        }

        try {
            const result = await postToHst(code);
            const size = `${bytes.toLocaleString()} bytes`;
            const sourceText = source === 'document' && filename ? `\n📄 File: *${filename}*` : '';

            const response = [
                channelHeader().trimEnd(),
                '✅ *Code uploaded successfully*',
                '',
                `🔗 *Share link:*\n${result.url}`,
                `📄 *Raw/code link:*\n${result.rawUrl}`,
                `📦 Size: ${size}`,
                sourceText.trim(),
                '',
                'Anyone with the link can open the paste.'
            ].filter(Boolean).join('\n');

            return safeSend(sock, jid, response, message);
        } catch (error) {
            console.error('[HST] upload error:', error?.stack || error);
            return safeSend(
                sock,
                jid,
                channelHeader() +
                `❌ *HST.SH upload failed.*\n${String(error?.message || 'Unknown upload error').slice(0, 300)}`,
                message
            );
        }
    }
};
