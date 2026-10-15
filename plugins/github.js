const moment = require('moment-timezone');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

module.exports = {
  command: 'script',
  aliases: ['repo', 'sc'],
  category: 'info',
  description: 'Get information about the ABIX-AE GitHub repository',
  usage: '.script',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;

    try {
      const res = await fetch('https://api.github.com/repos/GlobalTechInfo/ABIX-AE');
      if (!res.ok) throw new Error('Error fetching repository data');
      const json = await res.json();

      let txt = `*乂  ABIX-AE  乂*\n\n`;
      txt += `✩  *Name* : ${json.name}\n`;
      txt += `✩  *Watchers* : ${json.watchers_count}\n`;
      txt += `✩  *Size* : ${(json.size / 1024).toFixed(2)} MB\n`;
      txt += `✩  *Last Updated* : ${moment(json.updated_at).format('DD/MM/YY - HH:mm:ss')}\n`;
      txt += `✩  *URL* : ${json.html_url}\n`;
      txt += `✩  *Forks* : ${json.forks_count}\n`;
      txt += `✩  *Stars* : ${json.stargazers_count}\n\n`;
      txt += `💥 *ABIX-AE*`;

      const videoPath = path.join(__dirname, '../assets/bot_top.mp4');
      const imageCandidates = [
        path.join(__dirname, '../assets/bot_top_image.jpg'),
        path.join(__dirname, '../assets/bot_top_image.jpeg'),
        path.join(__dirname, '../assets/bot_top_image.png'),
        path.join(__dirname, '../assets/bot_top_image.webp'),
      ];
      const imagePath = imageCandidates.find(fs.existsSync) || null;
      const mediaPath = fs.existsSync(videoPath) ? videoPath : imagePath;
      if (!mediaPath) throw new Error('No bot-top media asset is available.');
      const mediaBuffer = fs.readFileSync(mediaPath);

      await sock.sendMessage(chatId, {
        ...(mediaPath === videoPath
          ? { video: mediaBuffer, gifPlayback: true, mimetype: 'video/mp4' }
          : { image: mediaBuffer }),
        caption: txt,
      }, { quoted: message });
    } catch (error) {
      console.error('Error in github command:', error);
      await sock.sendMessage(chatId, { text: '❌ Error fetching repository information.' }, { quoted: message });
    }
  }
};
