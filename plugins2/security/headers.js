const axios = require('axios');
const { getChannelInfo } = require('../../lib/channelInfo');
const { funnyError } = require('../../lib/funny');

const FAKE_FORWARD = getChannelInfo();

const MISSING = new Set(['strict-transport-security', 'content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy']);

module.exports = {
  command: 'headers',
  aliases: ['httpcheck', 'sitescan', 'hdr'],
  category: 'security',
  description: 'Check website HTTP security headers & exposure',
  usage: '.headers <url>',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    let url = (args[0] || '').trim();
    if (!/^https?:\/\//.test(url)) url = 'https://' + url;
    if (!url) {
      return await sock.sendMessage(chatId, {
        text: '⚡ Enter a URL.\nExample: .headers google.com',
        contextInfo: FAKE_FORWARD
      }, { quoted: message });
    }

    try {
      const res = await axios.get(url, {
        timeout: 20000,
        maxRedirects: 3,
        validateStatus: () => true,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });

      const h = res.headers || {};
      const sec = {};
      const missing = [];
      for (const k of MISSING) {
        for (const key of Object.keys(h)) {
          if (key.toLowerCase() === k) sec[k] = h[key];
        }
        if (!sec[k]) missing.push(k);
      }

      let text =
        `╭───「 🔒 *HEADER SCAN* 」\n` +
        `│ ${url}\n` +
        `╰───────────────○\n\n` +
        `📟 *Status:* ${res.status} ${res.statusText || ''}\n` +
        `🖥️ *Server:* ${h.server || h['x-powered-by'] || 'Hidden'}\n` +
        `🏷️ *Content-Type:* ${h['content-type'] || 'N/A'}\n` +
        `🕐 *Cache:* ${h['cache-control'] || 'N/A'}\n\n` +
        `*🔐 Security Headers:*\n` +
        (Object.keys(sec).length ? Object.entries(sec).map(([k, v]) => `✅ ${k}: ${String(v).slice(0, 60)}`).join('\n') : '_(none present)_') +
        '\n\n' +
        (missing.length ? `⚠️ Missing:\n` + missing.map(m => `   ❌ ${m}`).join('\n') : '🎉 All core security headers present!');

      await sock.sendMessage(chatId, { text, contextInfo: FAKE_FORWARD }, { quoted: message });
    } catch (err) {
      console.error('[HEADERS] Error:', err.message);
      await sock.sendMessage(chatId, {
        text: funnyError(err),
        contextInfo: FAKE_FORWARD
      }, { quoted: message });
    }
  }
};