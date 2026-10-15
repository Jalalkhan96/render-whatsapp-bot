const { listProviders, getProvider, lookup } = require('./billscrap');

function menuText() {
  const sections = listProviders().map(section =>
    `*${section.category.toUpperCase()}*\n${section.providers.map(name => `• ${name}`).join('\n')}`
  );
  return `╭━━━〔 🧾 *BILL SCRAP* 〕━━━╮
┃ Official Pakistani electricity/gas bill lookup
┃
${sections.map(section => `┃ ${section.replace(/\n/g, '\n┃ ')}`).join('\n┃\n')}
┃
┃ Use: *-bill PROVIDER NUMBER*
┃ Example: *-bill LESCO 12345678901234*
╰━━━━━━━━━━━━━━━━━━━━━━╯`;
}

module.exports = {
  command: 'billscrap',
  aliases: ['billmenu', 'billhelp'],
  category: 'utility',
  description: 'Electricity aur gas bill lookup menu',
  usage: '-billscrap',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    await sock.sendMessage(chatId, { text: menuText() }, { quoted: message });
  }
};

module.exports.menuText = menuText;
