const { getCricketAsset, sendCricketVideo } = require('./cricketDrive');

module.exports = {
  command: 'kingvideo',
  category: 'cricket',
  description: 'Cricket Drive folders se ek random video',
  usage: '.kingvideo',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    try {
      await sock.sendPresenceUpdate('composing', chatId);
      await sock.sendMessage(chatId, { text: '⏳ Drive se cricket video fetch ho rahi hai...' }, { quoted: message });
      const asset = await getCricketAsset('video');
      await sendCricketVideo(sock, message, chatId, asset, '🎬 *CRICKET VIDEO*\n\n📼 ' + (asset.name || 'Random video'));
    } catch (error) {
      await sock.sendMessage(chatId, { text: `❌ ${error.message}` }, { quoted: message });
    } finally {
      await sock.sendPresenceUpdate('paused', chatId).catch(() => {});
    }
  }
};
