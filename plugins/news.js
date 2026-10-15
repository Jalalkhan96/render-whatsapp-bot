const { getNews, SOURCES } = require('../lib/newsrss');
const { getChannelInfo } = require('../lib/channelInfo');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const FAKE_FORWARD = getChannelInfo({ newsletterName: 'ABIX-AE' });
const latestByChat = new Map();
const NEWS_CACHE_FILE = path.join(__dirname, '../data/latest-news.json');
const NEWS_CACHE_TTL = 24 * 60 * 60 * 1000;

function loadCachedNews() {
  try {
    if (!fs.existsSync(NEWS_CACHE_FILE)) return;
    const saved = JSON.parse(fs.readFileSync(NEWS_CACHE_FILE, 'utf8'));
    if (!saved || typeof saved !== 'object') return;
    for (const [chatId, value] of Object.entries(saved)) {
      if (
        value &&
        Number.isFinite(value.savedAt) &&
        Date.now() - value.savedAt < NEWS_CACHE_TTL &&
        Array.isArray(value.items)
      ) {
        latestByChat.set(chatId, value);
      }
    }
  } catch (error) {
    console.warn('[NEWS] Saved headline cache could not be loaded:', error.message);
  }
}

function saveCachedNews() {
  try {
    const dataDir = path.dirname(NEWS_CACHE_FILE);
    fs.mkdirSync(dataDir, { recursive: true });
    const serializable = Object.fromEntries(latestByChat);
    fs.writeFileSync(NEWS_CACHE_FILE, JSON.stringify(serializable), 'utf8');
  } catch (error) {
    console.warn('[NEWS] Saved headline cache could not be written:', error.message);
  }
}

loadCachedNews();

async function sendNewsDetail(sock, message, chatId, item) {
  const loading = await sock.sendMessage(chatId, {
    text: `🔎 خبر نمبر ${item.number} کھولی جا رہی ہے...\nبراہِ کرم تھوڑا انتظار کریں۔`,
    contextInfo: FAKE_FORWARD.contextInfo
  }, { quoted: message });

  try {
    const response = await axios.get(item.link, {
      timeout: 25000,
      maxRedirects: 8,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ABIX-AE News Reader/1.0)' }
    });
    const $ = cheerio.load(response.data);
    $('script, style, noscript, iframe, video, audio, source, form').remove();
    const title = $('meta[property="og:title"]').attr('content') || $('title').text().trim() || item.title;
    const description = $('meta[property="og:description"]').attr('content') || '';
    const paragraphs = $('article p, main p, [role="main"] p, p')
      .map((_, el) => $(el).text().replace(/\s+/g, ' ').trim()).get()
      .filter(text => text.length > 35);
    const body = [...new Set(paragraphs)].slice(0, 80);
    const text = `📰 *${title}*\n\n${description ? `${description}\n\n` : ''}${body.join('\n\n') || 'Article text page se extract nahi ho saka.'}\n\n🔗 Source: ${item.link}\n⚠️ ABIX-AE نے صرف public article text پڑھا ہے۔`;
    await sock.sendMessage(chatId, { text, contextInfo: FAKE_FORWARD.contextInfo }, { quoted: message });

    const imageUrls = [...new Set([
      $('meta[property="og:image"]').attr('content'),
      ...$('article img, main img').map((_, el) => $(el).attr('src')).get()
    ])].filter(url => /^https?:\/\//i.test(url)).slice(0, 3);
    for (const imageUrl of imageUrls) {
      try {
        const image = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 12000, maxContentLength: 8 * 1024 * 1024 });
        await sock.sendMessage(chatId, { image: Buffer.from(image.data), caption: `🖼️ ${title}`, contextInfo: FAKE_FORWARD.contextInfo }, { quoted: message });
      } catch (error) {
        console.warn('[NEWS] Image skipped:', error.message);
      }
    }

    const pdfHtml = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;padding:28px;line-height:1.55}h1{font-size:24px}p{font-size:13px;color:#222}.source{color:#666;font-size:10px}</style></head><body><h1>${escapeHtml(title)}</h1>${body.map(p => `<p>${escapeHtml(p)}</p>`).join('')}<p class="source">${escapeHtml(item.link)}</p></body></html>`;
    const pdf = await axios.get(`https://api.html2pdf.app/v1/generate?html=${encodeURIComponent(pdfHtml)}&apiKey=free`, {
      responseType: 'arraybuffer', timeout: 30000, maxContentLength: 15 * 1024 * 1024
    });
    if (!String(pdf.headers['content-type'] || '').includes('pdf')) {
      throw new Error('PDF service returned an invalid response');
    }
    await sock.sendMessage(chatId, {
      document: Buffer.from(pdf.data),
      mimetype: 'application/pdf',
      fileName: `abix-news-${item.number}.pdf`,
      caption: `📄 Article PDF: ${title}`,
      contextInfo: FAKE_FORWARD.contextInfo
    }, { quoted: message });
  } catch (error) {
    console.warn('[NEWS] Article detail unavailable:', error.message);
    await sock.sendMessage(chatId, {
      text: `⚠️ Full article page open nahi ho saki.\n\n📰 *${item.title}*\n🔗 ${item.link}\n\nSource page ne access block kiya ya temporarily unavailable hai. Video download nahi ki gayi.`,
      contextInfo: FAKE_FORWARD.contextInfo
    }, { quoted: message });
  } finally {
    if (loading?.key) {
      try { await sock.sendMessage(chatId, { delete: loading.key }); } catch {}
    }
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

async function handleNumericReply(sock, message, text) {
  if (!/^[1-8]$/.test(String(text).trim())) return false;
  const chatId = message.key.remoteJid;
  const cached = latestByChat.get(chatId);
  if (!cached) return false;
  if (Date.now() - cached.savedAt >= NEWS_CACHE_TTL) {
    latestByChat.delete(chatId);
    saveCachedNews();
    return false;
  }
  const item = cached.items[Number(text) - 1];
  if (!item) return false;
  await sendNewsDetail(sock, message, chatId, { ...item, number: Number(text) });
  return true;
}

module.exports = {
  command: 'news',
  aliases: ['headlines', 'latestnews', 'newspk', 'paknews', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8'],
  category: 'info',
  description: 'Latest news from Pakistan & famous sites (BBC, Al Jazeera, CNN, Dawn, Geo...)',
  usage: '.news <source|country>  •  .n1 to .n8 for headline details  •  .newsmenu for list',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const shortcut = String(context.userMessage || '').match(/^[.!/#]n([1-8])$/i);
    const requested = shortcut ? shortcut[1] : (args[0] || 'pakistan').toLowerCase().trim();
    const source = /^\d+$/.test(requested) ? 'pakistan' : requested;

    try {
      if (/^[1-8]$/.test(requested) && await handleNumericReply(sock, message, requested)) return;
      await sock.sendMessage(chatId, {
        react: { text: '📰', key: message.key }
      });
      await sock.sendMessage(chatId, {
        text: `🔄 Fetching latest news...\n_${SOURCES[source]?.label || source}_`,
        contextInfo: FAKE_FORWARD.contextInfo
      }, { quoted: message });

      const { label, items } = await getNews(source);

      if (!items.length) {
        return await sock.sendMessage(chatId, {
          text: '❌ No news found. Try `.newsmenu` for available sources.',
          contextInfo: FAKE_FORWARD.contextInfo
        }, { quoted: message });
      }

      latestByChat.set(chatId, { label, items, savedAt: Date.now() });
      saveCachedNews();
      const lines = items.map((it, i) => {
        const when = it.pubDate ? `\n   _${new Date(it.pubDate).toLocaleTimeString()} | ${it.source || label}_` : '';
        return `📰 ${i + 1}. *${it.title}*\n   ${it.link}${when}`;
      }).join('\n\n');

      const text =
        `╭───「 ${label} 」\n` +
        `│ Latest headlines:\n` +
        `╰───────────────○\n\n` +
        lines + '\n\n' +
        `💡 More: .news <source>  •  .newsmenu`;

      await sock.sendMessage(chatId, { text: `${text}\n\n↪️ Detail ke liye sirf number bhejein: 1, 2, 3...`, contextInfo: FAKE_FORWARD.contextInfo }, { quoted: message });
      await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
    } catch (err) {
      console.error('[NEWS] Error:', err.message);
      await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
      await sock.sendMessage(chatId, {
        text: '❌ News fetch failed. Web kam nahi kar raha — baad mein try karo.\n`.newsmenu` for sources.',
        contextInfo: FAKE_FORWARD.contextInfo
      }, { quoted: message });
    }
  }
};

module.exports.handleNumericReply = handleNumericReply;