const { getCricketAsset, sendCricketImage } = require('./cricketDrive');

module.exports = {
  command: 'babar',
  category: 'cricket',
  description: 'Babar Azam ki Drive se ek random picture',
  usage: '.babar',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    try {
      await sock.sendPresenceUpdate('composing', chatId);
      await sock.sendMessage(chatId, { text: '⏳ Drive se Babar ki picture fetch ho rahi hai...' }, { quoted: message });
      const asset = await getCricketAsset('babar');
      await sendCricketImage(sock, message, chatId,  asset, '🏏 *BABAR AZAM*\n\n📸 ' + (asset.name || 'Random picture'));
    } catch (error) {
      await sock.sendMessage(chatId, { text: `❌ ${error.message}` }, { quoted: message });
    } finally {
      await sock.sendPresenceUpdate('paused', chatId).catch(() => {});
    }
  }
};
