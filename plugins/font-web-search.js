'use strict';

const scraper = require('../lib/fontWebScraper');
const fontPlugin = require('./font-downloader');

function reply(sock, message, context, text) {
  const jid = context?.chatId || message?.key?.remoteJid;
  if (!jid) return Promise.resolve();
  return sock.sendMessage(jid, { text: String(text).slice(0, 4000) }, { quoted: message });
}

module.exports = {
  command: 'fontwebsearch',
  aliases: ['fontweb', 'webfontsearch'],
  category: 'utility',
  description: 'Search DaFont live using the supplied scraping code, then send font files.',
  usage: '-fontwebsearch <query>',
  handler: async (sock, message, args = [], context = {}) => {
    const query = String((Array.isArray(args) ? args : []).join(' ') || '').trim();
    if (!query) return reply(sock, message, context, `🌐 *LIVE FONT SEARCH*\nUsage: ${(context?.prefix || '-')}fontwebsearch <query>\nExample: ${(context?.prefix || '-')}fontwebsearch graffiti`);
    try {
      await reply(sock, message, context, `🌐 Scraping DaFont live for “${query.slice(0, 100)}”…`);
      const result = await scraper.searchDaFont(query, 10);
      if (!result.rows.length) return reply(sock, message, context, `No live DaFont results found for “${query.slice(0, 100)}”. Try a simpler query.`);
      return fontPlugin.deliverFontRows(sock, message, context, result.rows, {
        title: `LIVE WEB SEARCH: ${query}`,
        maxFiles: 10,
        emptyText: 'The live search returned no downloadable font entries.',
      });
    } catch (error) {
      console.error('[FONT WEB SEARCH]', error?.message || error);
      return reply(sock, message, context, `❌ Live font scrape failed: ${String(error?.message || 'request failed').slice(0, 220)}. Normal -font commands still use Turso.`);
    }
  },
  _test: scraper._test,
};
