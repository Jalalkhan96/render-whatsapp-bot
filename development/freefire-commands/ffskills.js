const { fetchInfo, basic, skill, field } = require('../../lib/freefire');
const { getChannelInfo } = require('../../lib/channelInfo');
const { funnyError } = require('../../lib/funny');

const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'ffskills',
  aliases: ['ffskill', 'ffpet'],
  category: 'freefire',
  description: 'Show equipped Free Fire character and pet data',
  usage: '.ffskills <uid>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    if (!args[0]) return sock.sendMessage(chatId, { text: '❌ UID dein. Example: .ffskills 123456789' }, { quoted: message });
    try {
      const data = await fetchInfo(args[0]);
      const player = basic(data);
      const details = skill(data);
      const text = `🧩 *FREE FIRE SKILLS*\n\n👤 Player: *${field(player.nickname)}*\n🧬 Character: ${field(details.characterId || details.character || data.characterInfo?.characterId)}\n🐾 Pet: ${field(details.petId || details.pet || data.petInfo?.id, 'Not available')}\n📦 Equipped skill: ${field(details.skillId || details.skill, 'Not available')}\n\n_Note: API response ke mutabiq available fields dikhaye gaye hain._`;
      return sock.sendMessage(chatId, { text, ...FAKE_FORWARD }, { quoted: message });
    } catch (error) {
      return sock.sendMessage(chatId, { text: `🧩 *FF Skills* → ${funnyError(error)}`, ...FAKE_FORWARD }, { quoted: message });
    }
  }
};