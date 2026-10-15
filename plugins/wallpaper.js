const axios = require('axios');

const CHANNEL_JID = process.env.NEWSLETTER_JID || '120363413637544342@newsletter';
const CHANNEL_LINK = 'https://whatsapp.com/channel/0029VbE7AW8GOj9rTFZnej0y';

const FAKE_FORWARD = {
  forwardingScore: 1,
  isForwarded: true,
  forwardedNewsletterMessageInfo: {
    newsletterJid: CHANNEL_JID,
    newsletterName: 'ABIX-AE',
    serverMessageId: -1
  }
};

const WP_CATEGORIES = [
  'nature', 'anime', 'cars', 'space', 'city', 'abstract',
  'animals', 'beach', 'mountains', 'flowers', 'gaming', 'dark',
  'minimal', 'architecture', 'art', 'technology', 'forest', 'sunset',
  'ocean', 'fantasy', 'sports', 'food', 'travel', 'winter'
];

const MENU_TEXT =
  `╭───「 🖼️ *4K WALLPAPER BOT* 」\n` +
  `│\n` +
  `│ 📌 *Commands:*\n` +
  `│ • \`.wp <search>\` — Search wallpapers\n` +
  `│ • \`.wp popular\` — Most popular\n` +
  `│ • \`.wp featured\` — Featured picks\n` +
  `│ • \`.wp random\` — Random wallpaper\n` +
  `│ • \`.wp recent\` — Latest wallpapers\n` +
  `│ • \`.wp category <name>\` — Browse category\n` +
  `│\n` +
  `│ 📝 *Examples:*\n` +
  `│ • .wp anime\n` +
  `│ • .wp nature landscape\n` +
  `│ • .wp category cars\n` +
  `│ • .wp popular\n` +
  `│\n` +
  `│ 🗂️ *Categories:*\n` +
  `│ ${WP_CATEGORIES.join(' • ')}\n` +
  `│\n` +
  `╰───「 ✨ ABIX-AE 」`;

/**
 * Fetch wallpapers from multiple free APIs
 */
async function fetchWallpapers(query, mode = 'search') {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json'
  };

  // Mode: popular, featured, recent, random, search, category
  try {
    // Source 1: Wallhaven API (free, high quality)
    let wallhavenUrl = 'https://wallhaven.cc/api/v1/search?';
    const params = new URLSearchParams();
    params.append('categories', '111'); // general + anime + people
    params.append('purity', '100');     // SFW only
    params.append('atleast', '1920x1080');
    params.append('ratios', '16x9,16x10');
    params.append('sorting', 'relevance');
    params.append('order', 'desc');
    params.append('page', '1');

    if (mode === 'popular') {
      params.set('sorting', 'favorites');
    } else if (mode === 'featured' || mode === 'random') {
      params.set('sorting', 'random');
    } else if (mode === 'recent') {
      params.set('sorting', 'date_added');
    } else if (mode === 'category' && query) {
      params.append('q', query);
      params.set('categories', '111');
    } else if (query) {
      params.append('q', query);
    }

    const res = await axios.get(wallhavenUrl + params.toString(), {
      timeout: 20000,
      headers
    });

    if (res.data?.data?.length) {
      return res.data.data.map(wp => ({
        url: wp.path,
        thumbUrl: wp.thumbs?.large || wp.thumbs?.original || wp.path,
        resolution: wp.resolution || '1920x1080',
        category: wp.category || 'general',
      }));
    }
  } catch (e) {
    console.error('[WP] Wallhaven error:', e.message);
  }

  // Source 2: LoremFlickr (keyword-related, high quality, keyless)
  try {
    const keyword = (query || 'wallpaper').split(/\s+/).filter(Boolean);
    const tag = (keyword[0] || 'nature') + (keyword[1] ? ',' + keyword[1] : '');
    const lumos = [];
    const seeds = ['', `?lock=${Math.floor(Math.random() * 9999)}`];
    for (const s of seeds) {
      lumos.push({
        url: `https://loremflickr.com/2560/1440/${encodeURIComponent(tag)}${s}`,
        thumbUrl: `https://loremflickr.com/800/450/${encodeURIComponent(tag)}${s}`,
        resolution: '2560x1440',
        category: query || 'random',
      });
    }
    return lumos;
  } catch (e) {
    console.error('[WP] LoremFlickr error:', e.message);
  }

  // Source 3: Unsplash (free, 4K)
  try {
    let unsplashUrl;
    const unsplashKey = process.env.UNSPLASH_KEY || 'demo'; // can work without key in limited mode
    const searchQ = query || 'wallpaper 4k';

    if (mode === 'random') {
      unsplashUrl = `https://api.unsplash.com/photos/random?query=${encodeURIComponent(searchQ)}&orientation=landscape&count=5&client_id=${unsplashKey}`;
    } else if (mode === 'popular') {
      unsplashUrl = `https://api.unsplash.com/photos?order_by=popular&per_page=10&client_id=${unsplashKey}`;
    } else {
      unsplashUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(searchQ)}&orientation=landscape&per_page=10&client_id=${unsplashKey}`;
    }

    const res = await axios.get(unsplashUrl, { timeout: 15000, headers });
    const photos = Array.isArray(res.data) ? res.data : (res.data?.results || []);

    if (photos.length) {
      return photos.map(p => ({
        url: p.urls?.full || p.urls?.regular,
        thumbUrl: p.urls?.regular || p.urls?.small,
        resolution: `${p.width || 0}x${p.height || 0}`,
        category: p.alt_description || query || 'wallpaper',
      }));
    }
  } catch (e) {
    console.error('[WP] Unsplash error:', e.message);
  }

  // Source 3: Picsum (always available, random beautiful images)
  const picsumImages = [];
  const count = 5;
  for (let i = 0; i < count; i++) {
    const seed = mode === 'random'
      ? Math.floor(Math.random() * 1000)
      : (query ? query.charCodeAt(0) * 17 + i * 31 : i * 73 + 100);
    picsumImages.push({
      url: `https://picsum.photos/seed/${seed}/2560/1440`,
      thumbUrl: `https://picsum.photos/seed/${seed}/800/450`,
      resolution: '2560x1440',
      category: query || 'random',
    });
  }
  return picsumImages;
}

async function downloadWallpaper(url) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 60000,
    maxContentLength: 25 * 1024 * 1024,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
    }
  });

  const contentType = String(response.headers['content-type'] || '').toLowerCase();
  const looksLikeImage = Buffer.isBuffer(response.data) &&
    (response.data.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) ||
      response.data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ||
      response.data.subarray(0, 4).toString() === 'RIFF' ||
      response.data.subarray(0, 4).toString() === 'WEBP');
  if (!contentType.startsWith('image/') && !looksLikeImage) {
    throw new Error('Wallpaper image response nahi mili');
  }
  return Buffer.from(response.data);
}

module.exports = {
  command: 'wallpaper',
  aliases: ['wp', 'wpmenu', '4k', 'wall', 'wallp'],
  category: 'utility',
  description: '4K Wallpaper Bot — search, browse and download stunning wallpapers',
  usage: '.wp <search|popular|featured|random|recent|category <name>>',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;

    // Show prompt if no args
    if (!args.length) {
      return await sock.sendMessage(chatId, {
        text: `🔎 *Enter your wallpaper name*\n\nExample:\n   .wp sukunna\n   .wp nature landscape\n\nCommands:\n   .wpr — random wallpaper (sab categories)\n   .wp popular / featured / random / recent\n   .wp category <name>\n\nCategories:\n${WP_CATEGORIES.join(' • ')}`,
        contextInfo: FAKE_FORWARD
      }, { quoted: message });
    }

    const subCmd = args[0].toLowerCase();
    let query = args.slice(1).join(' ').trim();
    let mode = 'search';

    // Determine mode
    if (subCmd === 'popular') {
      mode = 'popular';
      query = '';
    } else if (subCmd === 'featured') {
      mode = 'featured';
      query = '';
    } else if (subCmd === 'random') {
      mode = 'random';
      query = '';
    } else if (subCmd === 'recent') {
      mode = 'recent';
      query = '';
    } else if (subCmd === 'category') {
      mode = 'category';
      if (!query) {
        return await sock.sendMessage(chatId, {
          text:
            `📂 *Available Categories:*\n\n` +
            WP_CATEGORIES.map(c => `• \`.wp category ${c}\``).join('\n'),
          contextInfo: FAKE_FORWARD
        }, { quoted: message });
      }
    } else {
      // Treat entire args as search query
      mode = 'search';
      query = args.join(' ').trim();
    }

    try {
      await sock.sendMessage(chatId, { react: { text: '🖼️', key: message.key } });
      await sock.sendMessage(chatId, {
        text: `🔍 *Searching wallpapers...*\n_Mode: ${mode}${query ? ` | Query: "${query}"` : ''}_`,
        contextInfo: FAKE_FORWARD
      }, { quoted: message });

      const wallpapers = await fetchWallpapers(query, mode);

      if (!wallpapers || !wallpapers.length) {
        return await sock.sendMessage(chatId, {
          text: `❌ *No wallpapers found!*\nTry a different search query or category.`,
          contextInfo: FAKE_FORWARD
        }, { quoted: message });
      }

      // Send 1 random wallpaper from the results
      const wp = wallpapers[Math.floor(Math.random() * Math.min(wallpapers.length, 5))];

      let image;
      let selected = wp;
      const candidates = [wp, ...wallpapers.filter(item => item !== wp)].filter(item => item?.url);
      let lastDownloadError;
      for (const candidate of candidates) {
        try {
          image = await downloadWallpaper(candidate.url);
          selected = candidate;
          break;
        } catch (error) {
          lastDownloadError = error;
          console.warn('[WALLPAPER] Candidate skipped:', error.message);
        }
      }
      if (!image) throw lastDownloadError || new Error('No wallpaper image could be downloaded');

      const modeLabel = {
        popular: '🔥 Popular',
        featured: '⭐ Featured',
        random: '🎲 Random',
        recent: '🆕 Recent',
        category: `📂 Category: ${query}`,
        search: `🔍 "${query}"`
      }[mode] || query;
      const caption =
        `╭───「 🖼️ *4K WALLPAPER* 」\n` +
        `│\n` +
        `│ 🎨 *Type:* ${modeLabel}\n` +
        `│ 📐 *Resolution:* ${selected.resolution || '4K'}\n` +
        `│\n` +
        `│ 💡 *More wallpapers:*\n` +
        `│ .wp ${mode !== 'search' ? mode : query}\n` +
        `│\n` +
        `╰───「 ✨ ABIX-AE 」`;

      await sock.sendMessage(chatId, {
        image,
        caption,
        contextInfo: FAKE_FORWARD
      }, { quoted: message });

      await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });

    } catch (err) {
      console.error('[WALLPAPER] Error:', err.message);
      await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
      await sock.sendMessage(chatId, {
        text: '❌ *Wallpaper fetch failed!*\nPlease try again later.',
        contextInfo: FAKE_FORWARD
      }, { quoted: message });
    }
  }
};
