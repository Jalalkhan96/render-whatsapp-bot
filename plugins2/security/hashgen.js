const crypto = require('crypto');
const { getChannelInfo } = require('../../lib/channelInfo');

const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'hashgen',
  aliases: ['hash', 'gethash'],
  category: 'security',
  description: 'Generate MD5/SHA-1/SHA-256/SHA-512 hashes of any text',
  usage: '.hashgen <text>',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const text = args.join(' ').trim();
    if (!text) {
      return await sock.sendMessage(chatId, {
        text: '⚡ Enter text to hash.\nExample: .hashgen Hello World',
        contextInfo: FAKE_FORWARD
      }, { quoted: message });
    }

    const md5 = crypto.createHash('md5').update(text).digest('hex');
    const sha1 = crypto.createHash('sha1').update(text).digest('hex');
    const sha256 = crypto.createHash('sha256').update(text).digest('hex');
    const sha512 = crypto.createHash('sha512').update(text).digest('hex');

    const msg = `🧬 *Hash Generator*\n\n_Input:_ \`${text.slice(0, 30)}\`\n\n` +
      `*MD5*\n\`${md5}\`\n\n` +
      `*SHA-1*\n\`${sha1}\`\n\n` +
      `*SHA-256*\n\`${sha256}\`\n\n` +
      `*SHA-512*\n\`${sha512}\`\n\n` +
      `🔒 Uses Node crypto — 100% offline.`;

    await sock.sendMessage(chatId, { text: msg, contextInfo: FAKE_FORWARD }, { quoted: message });
  }
};