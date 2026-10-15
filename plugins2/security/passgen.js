const crypto = require('crypto');
const { getChannelInfo } = require('../../lib/channelInfo');

const FAKE_FORWARD = getChannelInfo();

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+[]{}<>?';

module.exports = {
  command: 'passgen',
  aliases: ['generatepass', 'pwdgen', 'genpass'],
  category: 'security',
  description: 'Generate a strong random password',
  usage: '.passgen [length]',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    let len = parseInt(args[0], 10);
    if (!len || len < 12) len = 16;
    if (len > 128) len = 128;

    const buf = crypto.randomBytes(len);
    let pass = '';
    for (let i = 0; i < len; i++) pass += CHARS[buf[i] % CHARS.length];

    const text =
      `╭───「 🔑 *PASSWORD GENERATOR* 」\n` +
      `╰───────────────○\n\n` +
      `🔐 *Password:* \`${pass}\`\n` +
      `📏 *Length:* ${len} chars\n` +
      `🔡 *Charset:* upper + lower + digits + symbols\n` +
      `🎲 *Source:* crypto.randomBytes (secure)\n\n` +
      `⚠️ Password kaam ke baad copy kar lo — bot dubaara nahi dikhayega.`;

    await sock.sendMessage(chatId, { text, contextInfo: FAKE_FORWARD }, { quoted: message });
  }
};