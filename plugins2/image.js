'use strict';

// Legacy image-selection helpers kept because messageHandler imports handleSelection.
// The canonical `image` command now lives in plugins2/googleImageSearch.js.
const imageSearch = require('../lib/imageSearch');

function userKey(context, message) {
  return context?.senderId || message?.key?.participant || message?.key?.remoteJid;
}

async function handleSelection(sock, message, chatId, senderId, value) {
  const session = imageSearch.getSession(senderId);
  if (!session || !/^(?:[1-9]|10)$/.test(String(value))) return false;
  const index = (session.page - 1) * 10 + Number(value) - 1;
  const result = session.results[index];
  if (!result) {
    await sock.sendMessage(chatId, { text: '❌ Invalid image result number.' }, { quoted: message });
    return true;
  }
  try {
    const image = await imageSearch.downloadImage(result.imageUrl);
    await sock.sendMessage(chatId, { image: image.buffer, mimetype: image.mime, caption: `🖼️ *${result.title}*\n🔗 ${result.sourceUrl}` }, { quoted: message });
  } catch (error) {
    await sock.sendMessage(chatId, { text: `⚠️ Result #${value} could not be downloaded.` }, { quoted: message });
  }
  return true;
}

module.exports = { userKey, handleSelection };
