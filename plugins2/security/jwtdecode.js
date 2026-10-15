const { getChannelInfo } = require('../../lib/channelInfo');
const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'jwtdecode',
  aliases: ['jwtinspect', 'decodejwt'],
  category: 'security',
  description: 'Decode JWT header and payload locally (does not verify)',
  usage: '.jwtdecode <token>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    try {
      const parts = (args[0] || '').split('.');
      if (parts.length !== 3) throw new Error('JWT ke 3 parts required hain');
      const decode = value => JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
      const header = decode(parts[0]);
      const payload = decode(parts[1]);
      await sock.sendMessage(chatId, { text: `🪪 *JWT INSPECT*\n\n*Header:*\n\`\`\`${JSON.stringify(header, null, 2)}\`\`\`\n*Payload:*\n\`\`\`${JSON.stringify(payload, null, 2).slice(0, 2500)}\`\`\`\n\n⚠️ Signature verify nahi ki gayi.`, contextInfo: FAKE_FORWARD.contextInfo }, { quoted: message });
    } catch (error) {
      await sock.sendMessage(chatId, { text: `❌ JWT decode nahi hua: ${error.message}`, contextInfo: FAKE_FORWARD.contextInfo }, { quoted: message });
    }
  }
};
