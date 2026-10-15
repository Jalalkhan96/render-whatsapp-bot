'use strict';

/**
 * Native WhatsApp HTML game sender + Chromium image fallback.
 *
 * Native mode tries WhatsApp's observed GenAI HTML primitive. A plain HTML
 * document is never sent as the game message. If the native rich payload is
 * rejected by the client/relay layer, the same HTML can be rendered to PNG
 * by lib/html-bubble.cjs so the user still receives the game artwork.
 *
 * NOTE: the PNG fallback is visual only; JavaScript cannot execute inside a
 * normal image message. Interactive play requires a client that supports the
 * native rich HTML primitive.
 */

const crypto = require('crypto');
const meta = require('./richHtmlGameMeta.json');
const { sendHtmlBubble } = require('./html-bubble.cjs');

const HTML_PRIMITIVE = 'GenAIaeacdsnwHtmlPrimitive';
const MAX_HTML_BYTES = 60 * 1024;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function _stPayload(html, title, options = {}) {
  const responseId = crypto.randomUUID();
  const trustedSources = Array.isArray(options.trustedSources)
    ? options.trustedSources
    : ['nixel.dev'];

  return {
    messageContextInfo: clone(meta.messageContextInfo || {}),
    botForwardedMessage: {
      message: {
        richResponseMessage: {
          messageType: 1,
          submessages: [{ messageType: 2, messageText: String(title || 'GAME') }],
          unifiedResponse: {
            data: Buffer.from(JSON.stringify({
              response_id: responseId,
              sections: [{
                view_model: {
                  primitive: {
                    __typename: HTML_PRIMITIVE,
                    payload: html,
                    trusted_sources: trustedSources,
                  },
                  __typename: 'GenAISingleLayoutViewModel',
                },
              }],
            }), 'utf8').toString('base64'),
          },
          contextInfo: clone(meta.contextInfo || {}),
        },
      },
    },
  };
}

function buildNativeHtmlGame(html, options = {}) {
  if (typeof html !== 'string' || !html.trim()) {
    throw new TypeError('Game HTML must be a non-empty string.');
  }

  const bytes = Buffer.byteLength(html, 'utf8');
  if (bytes > MAX_HTML_BYTES) {
    throw new Error(`Game HTML is too large for the native rich payload (${bytes} bytes > ${MAX_HTML_BYTES}).`);
  }

  return _stPayload(html, options.title || 'GAME', options);
}

async function sendNativeHtmlGame(sock, jid, html, options = {}) {
  if (!sock || typeof sock.relayMessage !== 'function') {
    throw new Error('This bot connection does not expose relayMessage().');
  }
  if (!jid) throw new Error('Chat JID is required.');
  const payload = buildNativeHtmlGame(html, options);
  return sock.relayMessage(jid, payload, {});
}

async function sendNativeHtmlGameWithFallback(sock, jid, html, options = {}) {
  const mode = String(process.env.WA_GAME_MODE || 'auto').toLowerCase();
  const caption = String(options.fallbackCaption || `🎮 ${options.title || 'Game'}\nInteractive mode is unavailable on this WhatsApp client.`);

  if (mode !== 'image') {
    try {
      const result = await sendNativeHtmlGame(sock, jid, html, options);
      return { mode: 'native', result };
    } catch (nativeError) {
      if (mode === 'native') throw nativeError;
      try {
        await sendHtmlBubble(sock, jid, html, {
          quoted: options.quoted,
          caption,
          theme: options.theme || 'dark',
        });
        return { mode: 'image-fallback', nativeError };
      } catch (fallbackError) {
        fallbackError.nativeError = nativeError;
        throw fallbackError;
      }
    }
  }

  await sendHtmlBubble(sock, jid, html, {
    quoted: options.quoted,
    caption,
    theme: options.theme || 'dark',
  });
  return { mode: 'image', result: true };
}

function inspectNativeHtmlGame(html) {
  const bytes = Buffer.byteLength(String(html || ''), 'utf8');
  return {
    ok: bytes > 0 && bytes <= MAX_HTML_BYTES,
    bytes,
    maxBytes: MAX_HTML_BYTES,
    primitive: HTML_PRIMITIVE,
    hasScript: /<script\b/i.test(String(html || '')),
    hasRemoteResource: /(?:src|href)\s*=\s*["']https?:\/\//i.test(String(html || '')),
  };
}

module.exports = {
  HTML_PRIMITIVE,
  MAX_HTML_BYTES,
  _stPayload,
  buildNativeHtmlGame,
  sendNativeHtmlGame,
  sendNativeHtmlGameWithFallback,
  inspectNativeHtmlGame,
};
