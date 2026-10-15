const { fetchInfo, fetchBan, basic, field } = require('../../lib/freefire');
const { getChannelInfo } = require('../../lib/channelInfo');
const { funnyError } = require('../../lib/funny');

const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'ffcheck',
  aliases: ['ffban', 'ffstatus'],
  category: 'freefire',
  description: 'Check Free Fire UID availability and account status',
  usage: '.ffcheck <uid>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    if (!args[0]) return sock.sendMessage(chatId, { text: '❌ UID dein. Example: .ffcheck 123456789' }, { quoted: message });
    const uid = String(args[0]);
    try {
      await sock.sendMessage(chatId, { react: { text: '🔍', key: message.key } });
      const ban = await fetchBan(uid);
      const data = await fetchInfo(uid);
      const player = basic(data);
      const isBanned = ban && (ban.banned === true || ban.isBanned === true || ban.status === 'BANNED');
      const status = isBanned ? '*🔴 BANNED*' : '*🟢 ACTIVE*';
      const text = `🔎 *FREE FIRE ACCOUNT CHECK*\n\n🆔 UID: ${field(player.accountId || player.uid, uid)}\n👤 Name: ${field(player.nickname)}\n🌍 Region: ${field(player.region)}\n📌 Status: ${status}\n🎚️ Level: ${field(player.level)}\n🏆 BR Points: ${field(player.rankingPoints)}\n${isBanned ? '\n⚠️ Ye account ban hai!' : '\n✅ Ye account active hai.'}`;
      return sock.sendMessage(chatId, { text, ...FAKE_FORWARD }, { quoted: message });
    } catch (error) {
      return sock.sendMessage(chatId, { text: `🔎 *FF Check* → ${funnyError(error)}`, ...FAKE_FORWARD }, { quoted: message });
    }
  }
};