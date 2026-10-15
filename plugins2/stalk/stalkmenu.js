const settings = require('../../settings');
module.exports = {
  command: 'stalkmenu',
  aliases: ['osintmenu', 'publicprofile'],
  category: 'stalk',
  description: 'Public-profile lookup menu',
  usage: `${settings.prefixes[0]}stalkmenu`,

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const prefix = context.prefix || settings.prefixes[0] || '-';
    const text =
      `╭───「 🔎 *PUBLIC PROFILE MENU* 」\n` +
      `│ Sirf public information — privacy ka khayal rakhein\n` +
      `╰───────────────○\n\n` +
      `📸 *Instagram*\n` +
      `└ ⚡ \`${prefix}instalk <username>\`\n` +
      `└ ⚡ \`${prefix}stalk ig <username>\`\n\n` +
      `🎵 *TikTok*\n` +
      `└ ⚡ \`${prefix}stalk tt <username>\`\n\n` +
      `🔗 *Public Profile Fun*\n` +
      `└ ⚡ \`${prefix}sociallinks <username>\`\n` +
      `└ ⚡ \`${prefix}profilecard <platform> <username>\`\n` +
      `└ ⚡ \`${prefix}handlecheck <username>\`\n\n` +
      `🧰 *Username Tools*\n` +
      `└ ⚡ \`${prefix}usernameinfo <username>\`\n` +
      `└ ⚡ \`${prefix}usernamegen <name>\`\n` +
      `└ ⚡ \`${prefix}handlelinks <username>\`\n\n` +
      `🌐 *Public Profiles*\n` +
      `└ ⚡ \`${prefix}github <username>\`\n` +
      `└ ⚡ \`${prefix}avatar <platform> <username>\`\n` +
      `└ ⚡ \`${prefix}userfind <username>\`\n\n` +
      `📱 *Profile Tools*\n` +
      `└ ⚡ \`${prefix}profileqr <platform> <username>\`\n` +
      `└ ⚡ \`${prefix}socialqr <platform> <username>\`\n` +
      `└ ⚡ \`${prefix}vcard <name> <username>\`\n\n` +
      `🎭 *Fun Tools*\n` +
      `└ ⚡ \`${prefix}usernameaesthetic <username>\`\n` +
      `└ ⚡ \`${prefix}stalkscore <username>\`\n` +
      `└ ⚡ \`${prefix}socialcompare <platform> <user1> <user2>\`\n\n` +
      `⚠️ Private accounts, passwords, live location ya hidden data ka lookup nahi hota.\n` +
      `💡 Public profile URL hi use karein.`;

    await sock.sendMessage(chatId, { text, contextInfo: {} }, { quoted: message });
  }
};
