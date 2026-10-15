const fetch = require('node-fetch');

// 1. Paste your Google Apps Script Web App URL here
const API_URL = "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec";

// In-memory cache variables
let cachedMemes = [];
let lastFetchTime = 0;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes cache

/**
 * Core function to talk to your Apps Script API and Cache it
 */
async function getMemesList() {
    if (cachedMemes.length > 0 && (Date.now() - lastFetchTime < CACHE_DURATION)) {
        return cachedMemes;
    }
    
    console.log("Fetching new data from Google Apps Script...");
    const url = `${API_URL}?t=${Date.now()}`;
    const response = await fetch(url);
    const result = await response.json();
    
    if (result.success && result.data) {
        cachedMemes = result.data;
        lastFetchTime = Date.now();
    }
    return cachedMemes;
}

module.exports = {
  command: 'gmeme',
  aliases: ['randommeme', 'searchmeme'],
  category: 'fun',
  description: 'Search for a meme or get a random one from your Google Apps script library. Usage: .gmeme [search term]',
  usage: '.gmeme [search term]',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const searchTerm = args.join(' ').trim().toLowerCase();

    try {
      let memeData = null;
      
      const memesList = await getMemesList();
      if (!memesList || memesList.length === 0) {
          return await sock.sendMessage(chatId, { text: `❌ Your library is empty or couldn't be fetched.` }, { quoted: message });
      }

      if (searchTerm) {
        // Search meme by name LOCALLY (Super Fast)
        const matchedMemes = memesList.filter(m => (m.name || '').toLowerCase().includes(searchTerm));
        if (matchedMemes.length > 0) {
            memeData = matchedMemes[0];
        } else {
            return await sock.sendMessage(chatId, { text: `❌ No memes found matching "${searchTerm}".` }, { quoted: message });
        }
      } else {
        // Fetch a completely random meme LOCALLY (Super Fast)
        const randomIndex = Math.floor(Math.random() * memesList.length);
        memeData = memesList[randomIndex];
      }

      // Download and send the meme media to the chat
      if (memeData) {
        let downloadUrl = memeData.url;
        
        // Convert Google Drive viewer links to direct download links
        if (downloadUrl.includes('drive.google.com')) {
            if (downloadUrl.includes('export=view')) {
                downloadUrl = downloadUrl.replace('export=view', 'export=download');
            } else if (downloadUrl.includes('/file/d/')) {
                const match = downloadUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
                if (match && match[1]) {
                    downloadUrl = `https://drive.google.com/uc?export=download&id=${match[1]}`;
                }
            }
        }

        const mediaRes = await fetch(downloadUrl);
        if (!mediaRes.ok) throw new Error('Failed to download media from URL');
        
        const mediaBuffer = await mediaRes.buffer();
        const contentType = mediaRes.headers.get('content-type') || '';
        
        if (contentType.includes('text/html') || mediaBuffer.toString('utf8', 0, 15).includes('<!DOCTYPE')) {
            await sock.sendMessage(chatId, { text: '❌ Error: The file link returned an HTML page instead of media. Make sure the Google Drive file is set to "Anyone with the link can view" and is not exceeding the virus scan size limit.' }, { quoted: message });
            return;
        }
        
        const fileName = (memeData.name || '').toLowerCase();

        // Check if the file is audio (mp3, ogg, m4a, wav)
        if (contentType.includes('audio') || fileName.endsWith('.mp3') || fileName.endsWith('.ogg') || fileName.endsWith('.m4a') || fileName.endsWith('.wav')) {
            await sock.sendMessage(chatId, {
                audio: mediaBuffer,
                mimetype: (contentType && contentType.includes('audio')) ? contentType : (fileName.endsWith('.mp3') ? 'audio/mpeg' : 'audio/mp4'),
                ptt: false // change to true if you want it to look like a voice note
            }, { quoted: message });
        } 
        // Check if the file is video (mp4, mov)
        else if (contentType.includes('video') || fileName.endsWith('.mp4') || fileName.endsWith('.mov')) {
            await sock.sendMessage(chatId, {
                video: mediaBuffer,
                caption: `🎥 *${memeData.name}*`,
            }, { quoted: message });
        } else {
            await sock.sendMessage(chatId, {
                image: mediaBuffer,
                caption: `🖼️ *${memeData.name}*`,
            }, { quoted: message });
        }
      }

    } catch (error) {
      console.error('gmeme Command Error:', error);
      await sock.sendMessage(chatId, {
        text: '❌ Failed to fetch meme. Please check if your API URL is correctly set and try again.',
        quoted: message
      });
    }
  }
};
