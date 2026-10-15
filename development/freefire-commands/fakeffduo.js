const axios = require('axios');
const { getChannelInfo } = require('../../lib/channelInfo');
const { funnyError } = require('../../lib/funny');

const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'fakeffduo',
  aliases: ['ffduo'],
  category: 'esports',
  description: 'Generate Fake FF Duo Image',
  usage: '.fakeffduo <nama1> <nama2>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;

    if (args.length < 2) {
      return await sock.sendMessage(chatId, { text: `❌ Format salah!\n\nContoh:\n.fakeffduo Jagoan Beban`, ...FAKE_FORWARD }, { quoted: message });
    }

    const nama1 = args[0];
    const nama2 = args.slice(1).join(' ');

    await sock.sendMessage(chatId, { text: '⏳ Sedang membuat gambar...' }, { quoted: message });

    const urls = [
      `https://api.zenkey.my.id/api/maker/ff-duo?text1=${encodeURIComponent(nama1)}&text2=${encodeURIComponent(nama2)}`,
      `http://api.zenkey.my.id/api/maker/ff-duo?text1=${encodeURIComponent(nama1)}&text2=${encodeURIComponent(nama2)}`
    ];

    let lastError;
    for (const url of urls) {
      try {
        const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
        if (response.data && response.data.length > 100) {
          await sock.sendMessage(chatId, {
            image: response.data,
            caption: `🎮 *FAKE FF DUO*\n\n👤 *Player 1:* ${nama1}\n👤 *Player 2:* ${nama2}`,
            ...FAKE_FORWARD
          }, { quoted: message });
          return;
        }
        lastError = new Error('API returned empty image.');
      } catch (e) {
        lastError = e;
      }
    }

    console.log('FAKEFFDUO ERROR:', lastError?.message || lastError);
    await sock.sendMessage(chatId, { text: `🎮 *FF Duo* → ${funnyError(lastError || 'network')}`, ...FAKE_FORWARD }, { quoted: message });
  }
};