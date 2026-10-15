const settings = require('../settings');
const {
  DEFAULT_TIMEZONE,
  formatTime,
  offsetLabel,
  resolveTimezone,
} = require('./tzu');

function safeText(value) {
  return String(value || '').replace(/[\u0000-\u001f]/g, '').trim();
}

module.exports = {
  command: 'time',
  aliases: ['tz', 'clock', 'worldtime', 'localtime', 'tzu'],
  category: 'utility',
  description: 'Show current time for a city, country, or IANA timezone',
  usage: '-time Karachi | -tz Asia/Karachi | -clock | -tzu Dubai',

  async handler(sock, message, args = [], context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const query = Array.isArray(args) ? args.join(' ').trim() : safeText(args);

    try {
      await sock.sendPresenceUpdate?.('composing', chatId);
    } catch {}

    try {
      // -clock / -time without an argument should always work.
      const target = query || settings.timeZone || DEFAULT_TIMEZONE;
      const location = await resolveTimezone(target);
      const now = new Date();
      const current = formatTime(location.zone, now);
      const offset = offsetLabel(location.zone, now);

      const text = [
        '🕐 *WORLD TIME*',
        '',
        `📍 *${location.name}*`,
        `🕒 *${current}*`,
        `🌍 *Timezone:* ${location.zone}`,
        `⏱️ *Offset:* ${offset}`,
        '',
        '_Examples: -time Karachi | -tz Asia/Karachi | -clock | -tzu Dubai_'
      ].join('\n');

      return await sock.sendMessage(chatId, { text }, { quoted: message });
    } catch (error) {
      console.error('[TIME/TZ] failed:', error);
      return await sock.sendMessage(chatId, {
        text: [
          '❌ *Timezone not found.*',
          '',
          'Try one of these:',
          '• `-clock`',
          '• `-time Karachi`',
          '• `-tz Asia/Karachi`',
          '• `-tz Dubai`',
          '• `-tz London`',
          '• `-tz America/New_York`',
          '• `-tzu Tokyo`'
        ].join('\n')
      }, { quoted: message });
    }
  }
};
