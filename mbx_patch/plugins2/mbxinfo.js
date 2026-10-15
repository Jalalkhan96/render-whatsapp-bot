'use strict';

const mbx = require('./moviebox');

async function safeSend(sock, message, context, textValue) {
  const jid = context?.chatId || message?.key?.remoteJid || message?.chat;
  if (!jid) throw new Error('Unable to determine chat JID.');
  return sock.sendMessage(jid, { text: String(textValue) }, { quoted: message });
}

function clean(value) {
  return String(value || '').trim();
}

module.exports = {
  command: 'mbxinfo',
  aliases: ['mbxdetails', 'movieboxinfo'],
  category: 'download',
  description: 'Get MovieBox+ details for a movie/series subject ID.',
  async handler(sock, message, args, context = {}) {
    const subjectId = clean(args?.[0]);
    if (!subjectId) return safeSend(sock, message, context, '❌ Usage: -mbxinfo <subject-id>');

    try {
      const client = mbx.makeClient();
      const detail = await mbx.subject.detail(client, { subjectId });
      const payload = detail?.data ?? detail;
      const items = mbx.extractItems(payload);
      const main = items[0] || {};
      const playback = mbx.pickPlaybackUrl(payload);

      const lines = [
        '🎬 *MOVIEBOX+ DETAILS*',
        `🆔 ${subjectId}`,
        main.title ? `🎞️ *${main.title}*` : '',
        main.year ? `📅 ${main.year}` : '',
        main.type ? `📺 ${main.type}` : '',
        main.score ? `⭐ ${main.score}` : '',
        main.genre ? `🏷️ ${main.genre}` : '',
        main.pageUrl ? `🔗 ${main.pageUrl}` : '',
        playback ? `▶️ ${playback}` : '',
      ].filter(Boolean);

      if (lines.length === 2) {
        lines.push('ℹ️ The upstream service returned no public watch URL for this subject.');
      }

      return safeSend(sock, message, context, lines.join('\n'));
    } catch (error) {
      console.error('[MBX] detail failed:', error?.message || error);
      return safeSend(sock, message, context,
        `❌ Could not fetch MovieBox+ details for *${subjectId}*. ` +
        `${error?.status ? `HTTP ${error.status}. ` : ''}` +
        'The upstream service may require app-specific request signing.'
      );
    }
  }
};
