const fetch = require('node-fetch');

// 1. Paste your Google Apps Script Web App URL here for the XML Drive Folder
const API_URL = "https://script.google.com/macros/";
// In-memory cache variables
let cachedXmls = [];
let lastFetchTime = 0;
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes cache

async function getXmlList() {
    if (cachedXmls.length > 0 && (Date.now() - lastFetchTime < CACHE_DURATION)) {
        return cachedXmls;
    }
    
    console.log("Fetching new XML data from Google Apps Script...");
    const url = `${API_URL}?t=${Date.now()}`;
    const response = await fetch(url);
    const result = await response.json();
    
    if (result.success && result.data) {
        cachedXmls = result.data;
        lastFetchTime = Date.now();
    }
    return cachedXmls;
}

module.exports = {
  command: 'getxml',
  aliases: ['randomxml', 'xml'],
  category: 'tools',
  description: 'Search for an XML preset or get a random one. Usage: .getxml [search term]',
  usage: '.getxml [search term]',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    
    // Check which command was used
    const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    const prefix = context.prefix || '.';
    const usedAlias = text.slice(prefix.length).trim().split(' ')[0].toLowerCase();
    
    const searchTerm = args.join(' ').trim().toLowerCase();

    try {
      // Typing indicator ON — user ko lagega bot kuch kar raha hai
      await sock.sendPresenceUpdate('composing', chatId);

      let xmlData = null;
      
      const xmlList = await getXmlList();
      if (!xmlList || xmlList.length === 0) {
          await sock.sendPresenceUpdate('paused', chatId);
          return await sock.sendMessage(chatId, { text: `❌ API se XML list load nahi ho saki ya library khali hai.` }, { quoted: message });
      }

      if (usedAlias === 'randomxml' || !searchTerm) {
        // Fetch a completely random XML
        const randomIndex = Math.floor(Math.random() * xmlList.length);
        xmlData = xmlList[randomIndex];
      } else {
        // Search XML by name
        const matchedXmls = xmlList.filter(m => (m.name || '').toLowerCase().includes(searchTerm));
        if (matchedXmls.length > 0) {
            // Agar ek se zyada files match karein, toh un mein se koi 1 random select karega
            const randomMatchIndex = Math.floor(Math.random() * matchedXmls.length);
            xmlData = matchedXmls[randomMatchIndex];
        } else {
            return await sock.sendMessage(chatId, { text: `❌ No XML found matching "${searchTerm}".` }, { quoted: message });
        }
      }

      // Download and send the XML file
      if (xmlData) {
        let fileId = null;

        // Google Drive file ID extract karo
        if (xmlData.url.includes('drive.google.com')) {
            const match = xmlData.url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
            if (match && match[1]) {
                fileId = match[1];
            }
        }

        if (!fileId) {
            return await sock.sendMessage(chatId, { text: '❌ Google Drive file ID nahi mili. Apps Script se URL theek bhejwa karein.' }, { quoted: message });
        }

        // Typing indicator jaari rakhna — download ho raha hai
        await sock.sendPresenceUpdate('composing', chatId);
        await sock.sendMessage(chatId, { text: `⏳ *${xmlData.name}* download ho rahi hai...` }, { quoted: message });

        // Step 1: Pehle normal download URL se request karo
        const firstUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
        const firstRes = await fetch(firstUrl, { redirect: 'follow' });
        const firstBuffer = await firstRes.buffer();
        const firstText = firstBuffer.toString('utf8', 0, 500);

        let finalBuffer = firstBuffer;

        // Step 2: Agar Google ne confirmation page diya (badi files ke liye)
        if (firstText.includes('confirm=') || firstText.includes('<!DOCTYPE') || firstText.includes('<html')) {
            // Confirmation token dhoondo
            const tokenMatch = firstText.match(/confirm=([0-9A-Za-z_-]+)/);
            const confirm = tokenMatch ? tokenMatch[1] : 't';
            
            // Ab confirm token ke saath dobara download karo
            const confirmUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=${confirm}`;
            const confirmRes = await fetch(confirmUrl, { redirect: 'follow' });
            finalBuffer = await confirmRes.buffer();
        }

        let fileName = xmlData.name || 'preset';
        if (!fileName.toLowerCase().endsWith('.xml')) {
            fileName += '.xml';
        }

        // Typing band karo, file bhej do
        await sock.sendPresenceUpdate('paused', chatId);

        // Send as document
        await sock.sendMessage(chatId, {
            document: finalBuffer,
            mimetype: 'application/xml',
            fileName: fileName,
            caption: `📂 *${xmlData.name}*\n\n✨ Powered by ABIX-AE`,
            contextInfo: {
                forwardingScore: 1,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363413637544342@newsletter',
                    newsletterName: 'ABIX-AE',
                    serverMessageId: -1
                }
            }
        }, { quoted: message });
      }

    } catch (error) {
      console.error('XML Command Error:', error);
      await sock.sendPresenceUpdate('paused', chatId);
      await sock.sendMessage(chatId, {
        text: '❌ XML fetch karne mein masla pesh aaya. API URL check karein.',
        quoted: message
      });
    }
  }
};
