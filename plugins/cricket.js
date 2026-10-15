const settings = require('../settings');
const axios = require('axios');

const API_URL = process.env.CRICKET_DRIVE_API_URL || 'PASTE_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE';
const CHANNEL_JID = process.env.NEWSLETTER_JID || '120363413637544342@newsletter';
const CHANNEL_NAME = process.env.NEWSLETTER_NAME || 'ABIX-AE';
const CACHE_TIME = 10 * 60 * 1000;
const cache = new Map();

const FAKE_FORWARD = {
  forwardingScore: 1,
  isForwarded: true,
  forwardedNewsletterMessageInfo: {
    newsletterJid: CHANNEL_JID,
    newsletterName: CHANNEL_NAME,
    serverMessageId: -1
  }
};

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

async function getDriveFiles(type) {
  if (API_URL.includes('PASTE_GOOGLE')) throw new Error('CRICKET_DRIVE_API_URL configure nahi hai');

  const cached = cache.get(type);
  if (cached && Date.now() - cached.time < CACHE_TIME) return cached.items;

  const { data } = await axios.get(API_URL, { params: { type, t: Date.now() }, timeout: 30000 });
  if (!data.success || !Array.isArray(data.data)) throw new Error(data.error || 'Drive list empty hai');

  cache.set(type, { items: data.data, time: Date.now() });
  return data.data;
}

function getFileId(item) {
  return item.id || item.url?.match(/(?:id=|\/d\/)([a-zA-Z0-9_-]+)/)?.[1];
}

async function downloadDriveFile(item) {
  const fileId = getFileId(item);
  if (!fileId) throw new Error('Drive file ID nahi mili');

  const response = await axios.get(`https://drive.google.com/uc?export=download&id=${fileId}`, {
    responseType: 'arraybuffer',
    maxContentLength: 80 * 1024 * 1024,
    maxBodyLength: 80 * 1024 * 1024,
    timeout: 120000,
    maxRedirects: 5
  });

  if ((response.headers['content-type'] || '').includes('text/html')) {
    throw new Error('Drive file download nahi hua; file ko Anyone with the link par share karein');
  }
  return Buffer.from(response.data);
}

async function downloadThumbnail(item) {
  if (!item.thumbnailUrl) return undefined;
  try {
    const response = await axios.get(item.thumbnailUrl, {
      responseType: 'arraybuffer',
      timeout: 20000,
      maxContentLength: 2 * 1024 * 1024
    });
    return Buffer.from(response.data);
  } catch (error) {
    console.warn('Cricket thumbnail unavailable:', error.message);
    return undefined;
  }
}

async function sendRandomImage(sock, message, chatId, type, playerName) {
  const files = await getDriveFiles(type);
  if (!files.length) throw new Error(`${playerName} ki Drive folder empty hai`);

  const item = randomItem(files);
  const image = await downloadDriveFile(item);
  await sock.sendMessage(chatId, {
    image,
    caption: `🏏 *${playerName}*\n📸 ${item.name || 'Random picture'}\n\n📢 ${CHANNEL_NAME} se`,
    contextInfo: FAKE_FORWARD
  }, { quoted: message });
}

async function sendRandomVideo(sock, message, chatId) {
  const files = await getDriveFiles('video');
  if (!files.length) throw new Error('Cricket video folders empty hain');

  const item = randomItem(files);
  const video = await downloadDriveFile(item);
  const thumbnail = await downloadThumbnail(item);
  await sock.sendMessage(chatId, {
    video,
    jpegThumbnail: thumbnail,
    caption: `🏏 *Cricket Video*\n🎬 ${item.name || 'Random video'}\n\n📢 ${CHANNEL_NAME} se`,
    contextInfo: FAKE_FORWARD
  }, { quoted: message });
}

const commands = {
  babar: {
    handler: (sock, message, chatId) => sendRandomImage(sock, message, chatId, 'babar', 'Babar Azam')
  },
  king: {
    handler: (sock, message, chatId) => sendRandomImage(sock, message, chatId, 'amir', 'Mohammad Amir')
  },
  kingvideo: {
    handler: (sock, message, chatId) => sendRandomVideo(sock, message, chatId)
  }
};

module.exports = {
  command: 'cricmenu',
  aliases: ['cricketmenu'],
  category: 'cricket',
  description: 'Cricket commands aur Urdu help menu',
  usage: `${settings.prefixes[0] || '-'}cricmenu`,
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const prefix = context.prefix || '-';
    const commandName = String(args?.[0] || '').toLowerCase();

    try {
      if (commands[commandName]) {
        await sock.sendPresenceUpdate('composing', chatId);
        await commands[commandName].handler(sock, message, chatId);
        return;
      }

      await sock.sendMessage(chatId, {
        text: `╭━━━〔 🏏 *CRICKET ZONE* 〕━━━╮
      ┃
      ┃  📸 *PLAYER DROPS*
      ┃  ├─ ⚡ *${prefix}babar*
      ┃  │  Babar Azam ki 1 random picture
      ┃  └─ 👑 *${prefix}king*
      ┃     Mohammad Amir ki 1 random picture
      ┃
      ┃  🎬 *VIDEO ARENA*
      ┃  └─ 🎥 *${prefix}kingvideo*
      ┃     3 Drive folders se random video
      ┃     Thumbnail + caption ke sath
      ┃
      ┣━━━━━━━━━━━━━━━━━━━━━━
      ┃  🔧 *SETUP*
      ┃  Google Apps Script deploy karein
      ┃  URL ko \`CRICKET_DRIVE_API_URL\` mein set karein
      ┃  Drive access: *Anyone with link • Viewer*
      ┃
      ┣━━━━━━━━━━━━━━━━━━━━━━
      ┃  💡 *WORKFLOW*
      ┃  Bot sub-folders scan karta hai, random file
      ┃  choose karta hai aur channel-style forward
      ┃  metadata ke sath send karta hai.
      ┃
      ╰━━━〔 ✨ *${CHANNEL_NAME}* 〕━━━╯`,
        contextInfo: FAKE_FORWARD
      }, { quoted: message });
    } catch (error) {
      console.error('Cricket command error:', error);
      await sock.sendMessage(chatId, {
        text: `❌ Cricket media nahi mil saka.\n_${error.message}_\n\n${prefix}cricmenu se help dekhein.`,
        contextInfo: FAKE_FORWARD
      }, { quoted: message });
    } finally {
      await sock.sendPresenceUpdate('paused', chatId).catch(() => {});
    }
  }
};

module.exports.sendRandomImage = sendRandomImage;
module.exports.sendRandomVideo = sendRandomVideo;
