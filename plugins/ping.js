'use strict';

const { sendSvgBubble } = require('../lib/html-bubble.cjs');
const { buildPingCardSvg } = require('../lib/pingCard.cjs');

let pingInFlight = 0;
const MAX_PING_RENDERS = 1;

module.exports = {
  command: 'ping',
  aliases: ['p', 'pong'],
  category: 'general',
  description: 'Show bot response time with a memory-safe latency check.',
  usage: '-ping',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message?.key?.remoteJid;
    if (!chatId) throw new Error('Chat ID is missing.');

    const start = process.hrtime.bigint();
    const latency = Number(process.hrtime.bigint() - start) / 1e6;

    // Safe default: a text ping allocates essentially no media buffer. Enable
    // the styled image explicitly with PING_IMAGE=true when needed.
    const imageMode = !/^(0|false|no|off)$/i.test(String(process.env.PING_IMAGE || 'true'));
    const reactionMode = /^(1|true|yes|on)$/i.test(String(process.env.PING_REACT || 'false'));

    if (reactionMode) {
      try { await sock.sendMessage(chatId, { react: { text: '🏓', key: message.key } }); } catch {}
    }

    if (!imageMode) {
      const mem = process.memoryUsage();
      const heapMb = (mem.heapUsed / 1024 / 1024).toFixed(1);
      const rssMb = (mem.rss / 1024 / 1024).toFixed(1);
      return sock.sendMessage(chatId, {
        text: `🏓 *Pong!* ${latency.toFixed(1)} ms\n💾 RAM: ${rssMb} MB RSS / ${heapMb} MB heap\n⚡ Media rendering is disabled for safe low-memory ping.`,
      });
    }

    if (pingInFlight >= MAX_PING_RENDERS) {
      return sock.sendMessage(chatId, {
        text: `🏓 *Pong!* ${latency.toFixed(1)} ms\n\nPing image renderer is busy; skipped media rendering to protect memory.`,
      });
    }

    pingInFlight += 1;
    try {
      const svg = buildPingCardSvg({ latency, message, context, chatId });
      return await sendSvgBubble(sock, chatId, svg, {
        density: 72,
        compressionLevel: 9,
        cache: false,
        noForward: true,
      });
    } finally {
      pingInFlight = Math.max(0, pingInFlight - 1);
    }
  },
};
