'use strict';
const settings = require('../settings');
const { getSite, sites, checkHome } = require('./ppcommon');
module.exports = {
  command: 'pptest', aliases: ['ppcheck'], category: 'owner', ownerOnly: true,
  description: 'Owner-only site availability diagnostic', usage: '-pptest <site>',
  async handler(sock, message, args = [], context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const prefix = context.prefix || settings.prefixes?.[0] || '-';
    const key = String(args?.[0] || '').trim().toLowerCase();
    if (!key) return sock.sendMessage(chatId, { text: `Usage: ${prefix}pptest <site>\n\n${sites.map(s => s.key).join(' • ')}` }, { quoted: message });
    const site = getSite(key);
    if (!site) return sock.sendMessage(chatId, { text: `❌ Unknown target.\nUse ${prefix}ppsites.` }, { quoted: message });

    const result = await checkHome(site);
    const status = result.ok ? 'ONLINE ✅' : 'UNAVAILABLE ❌';
    return sock.sendMessage(chatId, {
      text: `🧪 *${site.label} DIAGNOSTIC*\n\nStatus: *${status}*\nHTTP: ${result.status || '-'} ${result.statusText || ''}\nLatency: ${result.latency}ms\nRegistry: ${site.module}\nMedia retrieval: DISABLED`,
      contextInfo: {},
    }, { quoted: message });
  },
};
