const { loadSocialHub } = require('../lib/social/socialHub');
const { normalizeItems } = require('../lib/social/normalize');
const { getChannelInfo } = require('../lib/channelInfo');
const axios = require('axios');
const { sendInteractiveCarousel } = require('../lib/interactiveMenu');

function input(args, usage) {
  const value = args.join(' ').trim();
  if (!value) throw new Error(`Usage: ${usage}`);
  return value;
}

function truncate(value, max = 500) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

function formatNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0';
  if (number >= 1e6) return `${(number / 1e6).toFixed(1)}M`;
  if (number >= 1e3) return `${(number / 1e3).toFixed(1)}K`;
  return String(number);
}

async function getImage(url) {
  if (!url) return null;
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
      maxContentLength: 8 * 1024 * 1024,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    return Buffer.from(response.data);
  } catch (error) {
    console.warn('[SOCIAL] Thumbnail skipped:', error.message);
    return null;
  }
}

async function sendResultCarousel(sock, message, chatId, command, platform, items) {
  if (!items.length) {
    await sock.sendMessage(chatId, {
      text: `❌ No ${platform} results found.`,
      ...getChannelInfo(),
    }, { quoted: message });
    return;
  }

  if (platform === 'pinterest') {
    const cards = (await Promise.all(items.slice(0, 5).map(async item => ({
      header: {
        title: '',
        media: await getImage(item.media.image),
        mediaType: 'image',
      },
      body: '',
      footer: '',
      buttons: [],
    })))).filter(card => card.header.media);
    if (!cards.length) {
      return sock.sendMessage(chatId, {
        text: '❌ No Pinterest images found.',
        ...getChannelInfo(),
      }, { quoted: message });
    }
    return sendInteractiveCarousel(sock, chatId, {
      body: '📌 *PINTEREST SEARCH*',
      footer: 'ABIX • Pinterest Images',
      cards,
    }, { quoted: message });
  }

  if (platform === 'facebook') {
    const cards = items.slice(0, 5).map((item, index) => {
      const creator = truncate(item.author?.name || item.author?.username || 'Unknown', 45);
      const title = truncate(item.title || item.text || 'Facebook result', 90);
      const buttons = [];
      if (item.media?.audio) buttons.push({
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({ display_text: '🎧 AUDIO', id: `${command} ${item.media.audio}` }),
      });
      if (item.media?.video) buttons.push({
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({ display_text: '🎬 VIDEO', id: `${command} ${item.media.video}` }),
      });
      if (item.url) buttons.push({
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({ display_text: '🔗 OPEN', id: item.url }),
      });
      return {
        header: { title: '👑 FB SEARCH' },
        body: [
          '╭──〔 👑 FB SEARCH 〕──╮',
          '│ 🎬 Facebook Result',
          '│',
          `│ 👤 Creator: ${creator}`,
          `│ 📅 Date: ${item.createdAt || 'Unknown'}`,
          `│ 📝 ${title}`,
          '│',
          '╰──────────────────────────╯',
        ].join('\n'),
        footer: `Powered by TEAM ABIX • ${index + 1}/${Math.min(items.length, 5)}`,
        buttons,
      };
    });
    return sendInteractiveCarousel(sock, chatId, {
      body: '👑 *FB SEARCH*',
      footer: 'Powered by TEAM ABIX',
      cards,
    }, { quoted: message });
  }

  const cards = await Promise.all(items.slice(0, 5).map(async (item, index) => {
    const title = truncate(item.title || item.text || 'Untitled result');
    const author = item.author.username || item.author.name || 'Unknown';
    const image = await getImage(item.media.image || item.author.avatar);
    const hashtags = item.hashtags?.length
      ? `\n#${item.hashtags.slice(0, 8).join(' #')}`
      : '';
    const stats = item.stats || {};

    return {
      header: {
        title: `📱 ${platform.toUpperCase()} RESULT ${index + 1}`,
        media: image,
        mediaType: 'image',
      },
      body: [
        `╭───────────────╮`,
        `│ 📱 ${platform.toUpperCase()} Result ${index + 1}`,
        `├───────────────┤`,
        `│ 👤 ${truncate(author, 45)}`,
        `│`,
        `│ 📝 ${title}`,
        `│`,
        `│ 👁️ ${formatNumber(stats.views)} views`,
        `│ ❤️ ${formatNumber(stats.likes)} likes`,
        `│ 💬 ${formatNumber(stats.comments)} comments`,
        `│ 🔄 ${formatNumber(stats.shares)} shares`,
        ...(hashtags ? [`│`, `│ ${hashtags.trim()}`] : []),
        `╰───────────────╯`,
        item.url ? `🔗 ${item.url}` : '',
      ].filter(Boolean).join('\n'),
      footer: `ABIX • ${platform} ${index + 1}/${Math.min(items.length, 5)}`,
      buttons: item.url
        ? [{
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
              display_text: '🔗 OPEN RESULT',
              id: `${command} ${item.url}`,
            }),
          }]
        : [],
    };
  }));

  await sendInteractiveCarousel(sock, chatId, {
    body: `🔍 *${platform.toUpperCase()} ${command.toUpperCase()}*\n\nResults: *${cards.length}*\n\n👈 Swipe left/right 👉`,
    footer: `ABIX • ${platform} Search`,
    cards,
  }, { quoted: message });
}

async function runSocial({ platform, type, method, args, usage }) {
  const value = input(args, usage);
  const hub = await loadSocialHub();
  let result;
  if (type === 'comments' || type === 'posts' || type === 'video' || type === 'post' || type === 'thread') {
    result = await hub[method](value);
  } else if (type === 'jobs') {
    result = await hub[method](value, '');
  } else {
    result = await hub[method](value);
  }
  return normalizeItems(result, platform, type);
}

function command(command, method, platform, type = 'search') {
  return {
    command,
    heavy: true,
    category: 'social',
    description: `${platform} ${type} via the Apify Social Hub`,
    usage: `.${command} <query or URL>`,
    async handler(sock, message, args, context = {}) {
      const chatId = context.chatId || message.key.remoteJid;
      try {
        const items = await runSocial({
          platform, type, method, args, usage: `.${command} <query or URL>`,
        });
        await sendResultCarousel(sock, message, chatId, command, platform, items);
      } catch (error) {
        console.error(`[SOCIAL:${command}]`, error.message);
        await sock.sendMessage(chatId, {
          text: error.message.startsWith('Usage:')
            ? `❌ ${error.message}`
            : '❌ Social search service is temporarily unavailable.',
          ...getChannelInfo(),
        }, { quoted: message });
      }
    },
  };
}

module.exports = [
  command('ttcomments', 'tiktokComments', 'tiktok', 'comments'),
  command('ttvideo', 'tiktokVideo', 'tiktok', 'video'),
  command('igsearch', 'instagramSearch', 'instagram'),
  command('igprofile', 'instagramProfile', 'instagram', 'profile'),
  command('igcomments', 'instagramComments', 'instagram', 'comments'),
  command('fbsearch', 'facebookSearch', 'facebook'),
  command('fbposts', 'facebookPosts', 'facebook', 'posts'),
  command('fbcomments', 'facebookComments', 'facebook', 'comments'),
  command('fbpeople', 'facebookSearch', 'facebook', 'people'),
  command('fbpages', 'facebookSearch', 'facebook', 'pages'),
  command('fbgroups', 'facebookSearch', 'facebook', 'groups'),
  command('fbvideos', 'facebookSearch', 'facebook', 'videos'),
  command('fbevents', 'facebookSearch', 'facebook', 'events'),
  command('fbplaces', 'facebookSearch', 'facebook', 'places'),
  command('fbtop', 'facebookSearch', 'facebook', 'top'),
  command('fball', 'facebookSearch', 'facebook', 'all'),
  command('redditsearch', 'redditSearch', 'reddit'),
  command('redditpost', 'redditPost', 'reddit', 'post'),
  command('subreddit', 'redditSubreddit', 'reddit', 'subreddit'),
  command('pinsearch', 'pinterestSearch', 'pinterest'),
  command('pinboard', 'pinterestBoard', 'pinterest', 'board'),
  command('pinprofile', 'pinterestProfile', 'pinterest', 'profile'),
  command('ytvideo', 'youtubeVideo', 'youtube', 'video'),
  command('ytchannel', 'youtubeChannel', 'youtube', 'channel'),
  command('xsearch', 'xSearch', 'x'),
  command('xprofile', 'xProfile', 'x', 'profile'),
  command('linkedinpeople', 'linkedinPeople', 'linkedin', 'people'),
  command('linkedinposts', 'linkedinPosts', 'linkedin', 'posts'),
  command('linkedinjobs', 'linkedinJobs', 'linkedin', 'jobs'),
  command('threadsearch', 'threadsSearch', 'threads'),
  command('threadprofile', 'threadsProfile', 'threads', 'profile'),
  command('thread', 'threadsThread', 'threads', 'thread'),
  command('snapprofile', 'snapchatProfiles', 'snapchat', 'profile'),
];
