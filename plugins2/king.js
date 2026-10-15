const { getCricketAsset, sendCricketImage } = require('./cricketDrive');

module.exports = {
  command: 'king',
  category: 'cricket',
  description: 'Mohammad Amir ki Drive se ek random picture',
  usage: '.king',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    try {
      await sock.sendPresenceUpdate('composing', chatId);
      await sock.sendMessage(chatId, { text: '⏳ Drive se Amir ki picture fetch ho rahi hai...' }, { quoted: message });
      const asset = await getCricketAsset('amir');
      await sendCricketImage(sock, message, chatId, asset, '🏏 *MOHAMMAD AMIR*\n\n📸 ' + (asset.name || 'Random picture'));
    } catch (error) {
      await sock.sendMessage(chatId, { text: `❌ ${error.message}` }, { quoted: message });
    } finally {
      await sock.sendPresenceUpdate('paused', chatId).catch(() => {});
    }
  }
};
