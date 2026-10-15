const settings = require('../settings');

module.exports = {
  command: 'prefix',
  aliases: ['prefixes'],
  category: 'general',
  description: 'Show the current ABIX system/chat prefix',
  usage: 'Prefix',
  isPrefixless: true,
  async handler(sock, message, args, context = {}) {
    const prefix = settings.prefixes?.[0] || '-';
    const text = [
      'Hey,ABIX-AE𓆪 speaking! ⚡',
      `⚙️ 𝑺𝒚𝒔𝒕𝒆𝒎 𝑷𝒓𝒆𝒇𝒊𝒙 :- ${prefix}`,
      `🛸 𝑪𝒉𝒂𝒕 𝑷𝒓𝒆𝒇𝒊𝒙 :- ${prefix}`
    ].join('\n');
    return sock.sendMessage(context.chatId || message.key.remoteJid, { text }, { quoted: message });
  },
};
