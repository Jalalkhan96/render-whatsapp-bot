const crypto = require('crypto');
const { getChannelInfo } = require('../../lib/channelInfo');
const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'entropy',
  aliases: ['passwordentropy', 'entropyscan'],
  category: 'security',
  description: 'Estimate password entropy offline',
  usage: '.entropy <password>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const value = args.join(' ');
    if (!value) return sock.sendMessage(chatId, { text: '⚡ Password do. Ye offline check hai.', contextInfo: FAKE_FORWARD.contextInfo }, { quoted: message });
    let alphabet = 0;
    if (/[a-z]/.test(value)) alphabet += 26;
    if (/[A-Z]/.test(value)) alphabet += 26;
    if (/[0-9]/.test(value)) alphabet += 10;
    if (/[^a-zA-Z0-9]/.test(value)) alphabet += 33;
    const bits = alphabet ? Math.round(value.length * Math.log2(alphabet) * 10) / 10 : 0;
    const verdict = bits < 40 ? '🔴 Weak' : bits < 60 ? '🟡 Fair' : '🟢 Better';
    const digest = crypto.createHash('sha256').update(value).digest('hex').slice(0, 8);
    await sock.sendMessage(chatId, { text: `🧮 *ENTROPY CHECK*\n\n📏 Length: ${value.length}\n📊 Estimate: ${bits} bits\n${verdict}\n\n🔒 Local fingerprint: \`${digest}\`\n⚠️ Password server par nahi bheja gaya.`, contextInfo: FAKE_FORWARD.contextInfo }, { quoted: message });
  }
};
