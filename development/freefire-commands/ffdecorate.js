const { getChannelInfo } = require('../../lib/channelInfo');

const FAKE_FORWARD = getChannelInfo();

const DECORATIONS = [
  ['◢◤ {name} ◥◣', 'Sharp Corners'],
  ['『{name}』', 'Japanese Brackets'],
  ['꧁༺ {name} ༻꧂', 'Royal Frame'],
  ['★彡 {name} 彡★', 'Star Wave'],
  ['▄︻デ {name} ═══━', 'Sniper'],
  ['◦•●◉✿ {name} ✿◉●•◦', 'Flower'],
  ['╰‿╯ {name} ╰‿╯', 'Smile'],
  ['ᴛᴇᴀᴍ {name} ☆', 'Team Tag'],
  ['乂 {name} 乂', 'Cross Guard'],
  ['× {name} ×', 'Minimal X'],
  ['❖ {name} ❖', 'Diamond'],
  ['➤ {name} ◆', 'Arrow Diamond'],
  ['░▒▓ {name} ▓▒░', 'Gradient'],
  ['「{name}」', 'Simple Bracket'],
  ['✞ {name} ✞', 'Cross']
];

module.exports = {
  command: 'ffdecorate',
  aliases: ['ffdeco', 'decoreff'],
  category: 'freefire',
  description: 'Quick-decorate a name with Free Fire style symbols',
  usage: '.ffdecorate <name>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const name = args.join(' ').trim();
    if (!name) {
      return sock.sendMessage(chatId, { text: '❌ Name dein. Example: .ffdecorate Shadow' }, { quoted: message });
    }
    if (name.length > 30) {
      return sock.sendMessage(chatId, { text: '❌ Name must be 30 characters or less.' }, { quoted: message });
    }
    const lines = DECORATIONS.map(([template, label]) => {
      const decorated = template.replace('{name}', name);
      return `*${label}:*\n\`${decorated}\``;
    }).join('\n\n');
    const text = `🎨 *FREE FIRE NAME DECORATOR*\n\n${lines}\n\n_Long-press to copy!_`;
    return sock.sendMessage(chatId, { text, ...FAKE_FORWARD }, { quoted: message });
  }
};