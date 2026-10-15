/*****************************************************************************
 *                                                                           *
 *                     Developed By Qasim Ali                                *
 *                                                                           *
 *  🌐  GitHub   : https://github.com/GlobalTechInfo                         *
 *  ▶️  YouTube  : https://youtube.com/@GlobalTechInfo                       *
 *  💬  WhatsApp : https://whatsapp.com/channel/0029VagJIAr3bbVBCpEkAM07     *
 *                                                                           *
 *    © 2026 GlobalTechInfo. All rights reserved.                            *
 *                                                                           *
 *    Description: This file is part of the ABIX-AE Project.                 *
 *                 Unauthorized copying or distribution is prohibited.       *
 *                                                                           *
 *****************************************************************************/


const DEFAULT_CHANNEL_NAME = 'ABIX-AE';
const CHANNEL_NAME = String(
  process.env.HST_CHANNEL_NAME ||
  process.env.CHANNEL_NAME ||
  DEFAULT_CHANNEL_NAME
).trim();
const DEFAULT_CHANNEL_LINK = 'https://whatsapp.com/channel/0029VagJIAr3bbVBCpEkAM07';
const CHANNEL_LINK = String(
  process.env.HST_CHANNEL_LINK ||
  process.env.WHATSAPP_CHANNEL_URL ||
  process.env.CHANNEL_URL ||
  DEFAULT_CHANNEL_LINK
).trim();

function channelHeader() {
  return CHANNEL_LINK
    ? `📢 *Follow our channel:*\n*${CHANNEL_NAME}*\n${CHANNEL_LINK}\n\n`
    : '';
}

module.exports = {
  command: 'forwarded',
  aliases: ['viral', 'fakeforward'],
  category: 'tools',
  description: 'Send text with a fake "Frequently Forwarded" tag',
  usage: '.viral <text> OR reply to a message',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    
    try {
      let txt = "";
      const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      
      if (quoted) {
        txt = quoted.conversation || 
              quoted.extendedTextMessage?.text || 
              quoted.imageMessage?.caption || 
              quoted.videoMessage?.caption || 
              "";
      } 
      
      if (!txt || txt.trim() === "") {
        txt = args?.join(' ') || "";
      }

      if (!txt || txt.trim() === "") {
        return await sock.sendMessage(chatId, { 
          text: 'Please provide text or reply to a message to forward.' 
        }, { quoted: message });
      }

      await sock.sendMessage(chatId, { 
        text: channelHeader() + txt,
        contextInfo: { 
          isForwarded: true, 
          forwardingScore: 999 
        } 
      });

    } catch (err) {
      console.error('Forwarding Spoof Error:', err);
      await sock.sendMessage(chatId, { text: '❌ Failed to spoof forwarding.' });
    }
  }
};

/*****************************************************************************
 *                                                                           *
 *                     Developed By Qasim Ali                                *
 *                                                                           *
 *  🌐  GitHub   : https://github.com/GlobalTechInfo                         *
 *  ▶️  YouTube  : https://youtube.com/@GlobalTechInfo                       *
 *  💬  WhatsApp : https://whatsapp.com/channel/0029VagJIAr3bbVBCpEkAM07     *
 *                                                                           *
 *    © 2026 GlobalTechInfo. All rights reserved.                            *
 *                                                                           *
 *    Description: This file is part of the ABIX-AE Project.                 *
 *                 Unauthorized copying or distribution is prohibited.       *
 *                                                                           *
 *****************************************************************************/

