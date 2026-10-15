const { getChannelInfo } = require('../../lib/channelInfo');

const FAKE_FORWARD = getChannelInfo();

const styles = ['亗 {name} 亗', '乂 {name} 乂', '『{name}』', '么 {name} 么', '꧁༺ {name} ༻꧂', '★彡 {name} 彡★', 'ᎠᎬᏙᎥᏞ {name}', '么『{name}』么'];

module.exports = {
  command: 'ffname',
  aliases: ['ffnames', 'namechng', 'ffstylish'],
  category: 'freefire',
  description: 'Generate stylish Free Fire names',
  usage: '.ffname <name>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const name = args.join(' ').trim();
    if (!name) return sock.sendMessage(chatId, { text: '❌ Name dein. Example: .ffname Shadow' }, { quoted: message });
    const text = `✨ *STYLISH FREE FIRE NAMES*\n\n${styles.map((style, index) => `${index + 1}. ${style.replace('{name}', name)}`).join('\n')}`;
    return sock.sendMessage(chatId, { text, ...FAKE_FORWARD }, { quoted: message });
  }
};