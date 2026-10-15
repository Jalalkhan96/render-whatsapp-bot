const axios = require('axios');
const { sendInteractiveCarousel } = require('../lib/interactiveMenu');
let fetchLatest, fetchLive, fetchCommentary, fetchMedia, fetchMediaDetail, tracker;
try {
  ({ fetchLatest, fetchLive, fetchCommentary, fetchMedia, fetchMediaDetail } = require('../cricbussupdate/scraper'));
  tracker = require('../cricbussupdate/tracker');
} catch (error) {
  console.warn('[CRICBUZZ] Optional scraper package unavailable; using safe empty fallback:', error.message);
  fetchLatest = async () => [];
  fetchLive = async () => [];
  fetchCommentary = async () => ({ lines: [] });
  fetchMedia = async () => [];
  fetchMediaDetail = async (item) => item || {};
  tracker = {
    list: () => [],
    stop: () => false,
    start: async () => undefined,
  };
}

const mediaByChat = new Map();
const CATALOG_PREVIEW = [
  'cricscore', 'cricfixtures', 'cricseries', 'cricmatches', 'cricresults', 'cricschedule',
  'cricteam', 'cricplayer', 'cricstats', 'cricranking', 'cricrecords', 'cricnews',
  'cricupdates', 'cricbreaking', 'cricinjury', 'crictransfer', 'cricretirement',
  'crichighlights', 'criccommentary', 'cricscorecard', 'cricvenue', 'cricweather',
  'pakcricket', 'pakscore', 'pakfixtures', 'pakseries', 'pakplayers', 'pakteam',
  'pakranking', 'paknews', 'pakrecords', 'pakwomen', 'paku19', 'pakdomestic',
  'babarstats', 'babarrecords', 'babarnews', 'cricalert', 'cricreminder',
  'cricpoll', 'cricquiz', 'cricprediction',
];

function chatIdOf(message, context) {
  return context.chatId || message.key.remoteJid;
}

function send(sock, chatId, message, text) {
  return sock.sendMessage(chatId, { text }, { quoted: message });
}

function formatItems(items, limit = 10) {
  return items.slice(0, limit).map((item, index) => `${index + 1}. ${item.title}\n${item.url}`).join('\n\n');
}

async function menu(sock, message, context) {
  const chatId = chatIdOf(message, context);
  const prefix = context.prefix || '-';
  const makeButton = (label, id) => ({
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({ display_text: label, id: `${prefix}${id}` }),
  });
  const cards = [
    {
      header: { title: '🏏 LIVE & UPDATES' },
      body: [
        '🏏 *CRICKET CENTER*',
        '',
        '📰 Latest news and breaking updates',
        '🔴 Live matches and current scores',
        '📊 Ball-by-ball commentary',
        '🔔 Automatic match tracking',
        '',
        'Commands:',
        `${prefix}cricketnews`,
        `${prefix}cricketlive`,
        `${prefix}cricketball <id/link>`,
        `${prefix}crickettrack <id/link>`,
      ].join('\n'),
      buttons: [
        makeButton('📰 NEWS', 'cricketnews'),
        makeButton('🔴 LIVE', 'cricketlive'),
        makeButton('📊 COMMENTARY', 'cricketball'),
        makeButton('🔔 TRACK', 'crickettrack'),
      ],
    },
    {
      header: { title: '🎬 MEDIA HUB' },
      body: [
        '🎬 *CRICKET MEDIA*',
        '',
        '🎥 Featured videos with top 5 selection',
        '🖼️ Cricket images and photo gallery',
        '⬇️ Download media from the selected card',
        '',
        `${prefix}cricketvideo [search]`,
        `${prefix}cricketimage [search]`,
        '',
        'Tip: use `video`/`image` to switch media type.',
      ].join('\n'),
      buttons: [
        makeButton('🎥 VIDEOS', 'cricketvideo'),
        makeButton('🖼️ IMAGES', 'cricketimage'),
      ],
    },
    {
      header: { title: '🇵🇰 PAKISTAN & PLAYERS' },
      body: [
        '🇵🇰 *PAKISTAN CRICKET*',
        '',
        'Pakistan team, players, rankings and records',
        'Babar Azam news, stats and records',
        '',
        CATALOG_PREVIEW
          .filter(item => item.startsWith('pak') || item.startsWith('babar'))
          .map(item => `${prefix}${item}`)
          .join('  '),
      ].join('\n'),
      buttons: [
        makeButton('🇵🇰 PAKISTAN', 'pakcricket'),
        makeButton('👑 BABAR', 'babarnews'),
        makeButton('🏆 RANKING', 'pakranking'),
      ],
    },
    {
      header: { title: '📚 CRICKET COMMANDS' },
      body: [
        '📚 *COMMAND DIRECTORY*',
        '',
        'Scores • fixtures • series • results',
        'Teams • players • stats • records',
        'News • injuries • transfers • weather',
        '',
        CATALOG_PREVIEW
          .filter(item => !item.startsWith('pak') && !item.startsWith('babar'))
          .map(item => `${prefix}${item}`)
          .join('  '),
      ].join('\n'),
      buttons: [
        makeButton('🏏 SCORE', 'cricscore'),
        makeButton('📅 FIXTURES', 'cricfixtures'),
        makeButton('📊 STATS', 'cricstats'),
        makeButton('📖 RECORDS', 'cricrecords'),
      ],
    },
  ];
  try {
    return await sendInteractiveCarousel(sock, chatId, {
      body: '🏏 *CRICKET ONLY MENU*\n\nSwipe through live updates, media, Pakistan cricket and command categories.',
      footer: 'ABIX Cricket • Select a category',
      cards,
    }, { quoted: message });
  } catch (error) {
    console.error('[CRICBUZZ] Cricket menu carousel failed:', error.message);
    return send(sock, chatId, message, cards.map(card => card.body).join('\n\n━━━━━━━━━━━━\n\n'));
  }
}

async function mediaMenu(sock, message, context, type, requestedIndex, query = '') {
  const chatId = chatIdOf(message, context);
  const cached = mediaByChat.get(chatId);
  const item = requestedIndex && cached?.[type]?.[requestedIndex - 1];
  if (item) {
    const detail = type === 'image' ? item : await fetchMediaDetail(item);
    const mediaUrl = type === 'video' ? detail.videoUrl : (detail.imageUrl || item.thumbnailUrl);
    if (!mediaUrl) return send(sock, chatId, message, `ℹ️ اس ${type} کی downloadable file دستیاب نہیں۔`);
    const response = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      maxContentLength: type === 'video' ? 30 * 1024 * 1024 : 8 * 1024 * 1024,
      headers: { 'User-Agent': 'ABIX-AE Cricbuzz Update Prototype/1.0' },
    });
    const contentType = String(response.headers['content-type'] || '');
    if (!contentType.startsWith(type === 'video' ? 'video/' : 'image/')) {
      throw new Error(`Cricbuzz نے ${type} media کے بجائے ${contentType || 'unknown response'} دیا`);
    }
    const buffer = Buffer.from(response.data);
    return sock.sendMessage(chatId, type === 'video'
      ? { video: buffer, caption: `🎬 ${detail.title}`, mimetype: contentType.split(';')[0] }
      : { image: buffer, caption: `🖼️ ${detail.title}`, mimetype: contentType.split(';')[0] }, { quoted: message });
  }

  let items = await fetchMedia(type);
  if (query) {
    const filtered = items.filter(item => item.title.toLowerCase().includes(query.toLowerCase()));
    if (filtered.length) items = filtered;
  }
  if (!items.length) return send(sock, chatId, message, `ℹ️ کوئی ${type} دستیاب نہیں ملا۔`);
  mediaByChat.set(chatId, { ...(mediaByChat.get(chatId) || {}), [type]: items.slice(0, 5) });
  const cards = items.slice(0, 5).map((media, index) => ({
    header: { title: `${type === 'video' ? '🎬' : '🖼️'} ${index + 1}`, media: { url: media.thumbnailUrl }, mediaType: 'image' },
    body: media.title,
    footer: `ABIX Cricket • ${index + 1}/5`,
    buttons: [{
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({ display_text: '⬇️ DOWNLOAD', id: `-cricket${type} ${index + 1}` }),
    }],
  }));
  return sendInteractiveCarousel(sock, chatId, {
    body: `${type === 'video' ? '🎬 FEATURED VIDEOS' : '🖼️ FEATURED IMAGES'}\n\nTop 5 منتخب کریں:`,
    footer: 'ABIX Cricket',
    cards,
  }, { quoted: message });
}

async function handler(sock, message, args, context = {}) {
  const chatId = chatIdOf(message, context);
  const command = String(context.commandName || context.userMessage || '').split(/\s+/)[0].replace(/^[^a-z]+/i, '').toLowerCase();
  try {
    if (command === 'cricketonlymenu') return menu(sock, message, context);
    if (command === 'cricketnews') {
      const items = await fetchLatest();
      return send(sock, chatId, message, items.length ? `📰 *LATEST CRICKET UPDATES*\n\n${formatItems(items)}` : 'ℹ️ کوئی نیا update نہیں ملا۔');
    }
    if (command === 'cricketlive') {
      const items = await fetchLive();
      return send(sock, chatId, message, items.length ? `🔴 *LIVE GAMES*\n\n${formatItems(items)}` : 'ℹ️ اس وقت live game نہیں ملا۔');
    }
    if (command === 'cricketball') {
      const target = args.join(' ').trim();
      if (!target) return send(sock, chatId, message, 'Usage: -cricketball <match id یا link>');
      const result = await fetchCommentary(target);
      return send(sock, chatId, message, result.lines.length ? `🏏 *BALL-BY-BALL UPDATE*\n\n${result.lines.join('\n')}` : 'ℹ️ اس match کی commentary دستیاب نہیں۔');
    }
    if (command === 'cricketvideo') {
      if (String(args[0] || '').toLowerCase() === 'image') {
        args.shift();
        return mediaMenu(sock, message, context, 'image', 0, args.join(' '));
      }
      const index = /^\d+$/.test(args[0] || '') ? Number(args.shift()) : 0;
      return mediaMenu(sock, message, context, 'video', index, args.join(' '));
    }
    if (command === 'cricketimage') {
      if (String(args[0] || '').toLowerCase() === 'video') {
        args.shift();
        return mediaMenu(sock, message, context, 'video', 0, args.join(' '));
      }
      const index = /^\d+$/.test(args[0] || '') ? Number(args.shift()) : 0;
      return mediaMenu(sock, message, context, 'image', index, args.join(' '));
    }
    if (command === 'crickettrack') {
      const sub = String(args[0] || '').toLowerCase();
      if (sub === 'list') {
        const active = tracker.list(chatId);
        return send(sock, chatId, message, active.length ? `🔔 *ACTIVE TRACKERS*\n\n${active.map(item => `• ${item.match}`).join('\n')}` : 'ℹ️ کوئی active tracker نہیں۔');
      }
      if (sub === 'stop') {
        const match = args.slice(1).join(' ').trim();
        return send(sock, chatId, message, match && tracker.stop(chatId, match) ? '✅ Tracker بند کر دیا گیا۔' : '❌ Tracker نہیں ملا۔');
      }
      const match = args.join(' ').trim();
      if (!match) return send(sock, chatId, message, 'Usage: -crickettrack <match id یا link>');
      await tracker.start(chatId, match, async result => {
        const text = result.lines.length ? `🔔 *MATCH UPDATE*\n\n${result.lines.join('\n')}` : 'ℹ️ نیا update نہیں ملا۔';
        await sock.sendMessage(chatId, { text });
      });
      return send(sock, chatId, message, '✅ Match tracking شروع ہے۔ نئی over/ball commentary خود آئے گی۔');
    }
    return menu(sock, message, context);
  } catch (error) {
    console.error('[CRICBUZZ] Command failed:', error.message);
    return send(sock, chatId, message, `⚠️ Cricbuzz media ابھی دستیاب نہیں۔ ${error.response?.status === 403 ? 'Host پر CRICBUZZ_COOKIE configure کریں یا کچھ دیر بعد دوبارہ کوشش کریں۔' : 'کچھ دیر بعد دوبارہ کوشش کریں۔'}`);
  }
}

async function catalogHandler(sock, message, args, context = {}) {
  const chatId = chatIdOf(message, context);
  const command = String(context.commandName || context.userMessage || '').split(/\s+/)[0].replace(/^[^a-z]+/i, '').toLowerCase();
  try {
    if (/news|updates|breaking|injury|transfer|retirement|highlights/.test(command)) {
      const items = await fetchLatest();
      return send(sock, chatId, message, items.length ? `🏏 *${command.toUpperCase()}*\n\n${formatItems(items, 8)}` : 'ℹ️ کوئی update نہیں ملا۔');
    }
    if (/ball|over|wickets|partnership|toss|scorecard|score|live|matches|results|fixtures|schedule|series|points|standings|playoffs|commentary/.test(command)) {
      if (/commentary|ball|over/.test(command)) {
        const target = args.join(' ').trim();
        if (!target) return send(sock, chatId, message, `Usage: -${command} <match id یا link>`);
        const result = await fetchCommentary(target);
        return send(sock, chatId, message, result.lines.length ? `🏏 *${command.toUpperCase()}*\n\n${result.lines.join('\n')}` : 'ℹ️ commentary دستیاب نہیں۔');
      }
      const items = await fetchLive();
      return send(sock, chatId, message, items.length ? `🏏 *${command.toUpperCase()}*\n\n${formatItems(items, 10)}` : 'ℹ️ اس وقت data دستیاب نہیں۔');
    }
    const items = await fetchLatest();
    return send(sock, chatId, message, items.length ? `🏏 *${command.toUpperCase()}*\n\n${formatItems(items, 8)}` : 'ℹ️ اس وقت data دستیاب نہیں۔');
  } catch (error) {
    console.error(`[CRICBUZZ] ${command} failed:`, error.message);
    return send(sock, chatId, message, '⚠️ Cricbuzz data ابھی دستیاب نہیں۔ کچھ دیر بعد دوبارہ کوشش کریں۔');
  }
}

const catalogCommands = [
  'cricscore', 'criclive', 'cricfixtures', 'cricseries', 'cricmatches', 'cricresults',
  'cricschedule', 'cricserieslist', 'cricpoints', 'cricstandings', 'cricplayoffs',
  'cricteam', 'cricteams', 'cricplayer', 'cricplayers', 'cricprofile', 'cricstats',
  'cricbatting', 'cricbowling', 'cricfielding', 'cricallrounder', 'cricranking',
  'cricrecord', 'cricrecords', 'cricnews', 'cricupdates', 'cricbreaking', 'cricinjury',
  'crictransfer', 'cricretirement', 'crichighlights', 'criccommentary', 'cricscorecard',
  'cricovers', 'cricwickets', 'cricpartnership', 'crictoss', 'cricvenue', 'cricweather',
  'cricumpires', 'criccaptain', 'criccoach', 'cricarchive',
  'pakcricket', 'pakscore', 'pakfixtures', 'pakseries', 'pakplayers', 'pakteam',
  'pakranking', 'paknews', 'pakrecords', 'pakwomen', 'paku19', 'pakdomestic',
  'babarstats', 'babarrecords', 'babarnews',
  'cricalert', 'cricreminder', 'cricpoll', 'cricquiz', 'cricprediction',
];

module.exports = [
  { command: 'cricketonlymenu', aliases: ['cricketmenubuzz'], category: 'cricket', description: 'Cricket live, news and tracking menu', usage: '-cricketonlymenu', handler },
  { command: 'cricketnews', aliases: ['cricnewsbuzz'], category: 'cricket', description: 'Latest cricket updates', usage: '-cricketnews', handler },
  { command: 'cricketlive', aliases: ['criclivebuzz'], category: 'cricket', description: 'Live cricket games', usage: '-cricketlive', handler },
  { command: 'cricketball', aliases: ['cricball'], category: 'cricket', description: 'Ball-by-ball match commentary', usage: '-cricketball <id/link>', handler },
  { command: 'crickettrack', aliases: ['crictrack'], category: 'cricket', description: 'Track one match updates', usage: '-crickettrack <id/link>', handler },
  { command: 'cricketvideo', aliases: ['cricvideo'], category: 'cricket', description: 'Top 5 Cricbuzz videos with download', usage: '-cricketvideo', handler },
  { command: 'cricketimage', aliases: ['cricimage', 'cricketphotos'], category: 'cricket', description: 'Top 5 Cricbuzz images with download', usage: '-cricketimage', handler },
  ...catalogCommands.map(command => ({
    command,
    aliases: [],
    category: 'cricket',
    description: `Cricbuzz ${command} data`,
    usage: `-${command}`,
    handler: catalogHandler,
  })),
];
