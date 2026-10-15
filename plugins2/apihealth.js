'use strict';

const { probeActorSet, getConfiguredApiInventory, configuredApifyTokens } = require('../lib/api-health');
const ACTORS = require('../plugin3/apify-rotator-kit/lib/actors/registry');

const ACTOR_MAP = {
  YouTube: ACTORS.youtube?.scraper,
  TikTok: ACTORS.tiktok?.scraper,
  Instagram: ACTORS.instagram?.searchScraper,
  Facebook: ACTORS.facebook?.searchScraper,
  Reddit: ACTORS.reddit?.scraper,
  Pinterest: ACTORS.pinterest?.scraper,
  X: ACTORS.x?.scraper,
  LinkedIn: ACTORS.linkedin?.jobsScraper,
  Threads: ACTORS.threads?.scraper,
  Snapchat: ACTORS.snapchat?.scraper,
};

module.exports = {
  command: 'apihealth',
  aliases: ['apistatus'],
  category: 'owner',
  ownerOnly: true,
  description: 'Check configured API providers and Apify actor availability',
  usage: '-apihealth',
  async handler(sock, message, args, context = {}) {
    if (!context.isOwner && !await isOwner(message.key.participant || message.key.senderPn || message.key.remoteJid, sock, message.key.remoteJid)) {
      return sock.sendMessage(message.key.remoteJid, { text: '❌ Owner only.' }, { quoted: message });
    }
    const lines = ['🩺 *API HEALTH*', ''];
    for (const item of getConfiguredApiInventory()) {
      lines.push(`${item.configured ? '✅' : '⚠️'} ${item.name}: ${item.configured ? 'configured' : 'configuration required'}`);
    }
    lines.push(`🔑 Apify token pool: *${configuredApifyTokens().length}*`);
    if (String(args[0] || '').toLowerCase() === 'apify') {
      const actorResults = await probeActorSet(ACTOR_MAP);
      lines.push('', '*APIFY ACTORS*');
      for (const result of actorResults) lines.push(`${result.status === 'PASS' ? '✅' : '❌'} ${result.platform}: ${result.status}`);
    } else {
      lines.push('', `Use *${context.prefix || '-'}apihealth apify* for live Apify actor checks.`);
    }
    return sock.sendMessage(message.key.remoteJid, { text: lines.join('\n') }, { quoted: message });
  },
};
