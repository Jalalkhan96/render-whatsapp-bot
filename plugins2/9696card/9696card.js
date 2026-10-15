'use strict';

const axios = require('axios');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const crypto = require('crypto');

const JIKAN = 'https://api.jikan.moe/v4';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const STYLES = {
  gold: {
    name: 'GOLD', icon: '✦', accent: '#F7C63A', accent2: '#8C6505', bg1: '#2B2108', bg2: '#5B4208', panel: '#17120A', text: '#FFF8E6', muted: '#B9AA84'
  },
  neon: {
    name: 'NEON', icon: '◆', accent: '#5EF6FF', accent2: '#9B5CFF', bg1: '#0A0E1B', bg2: '#2C0A3B', panel: '#0A0D16', text: '#F2FBFF', muted: '#95AFC3'
  },
  crimson: {
    name: 'CRIMSON', icon: '◆', accent: '#FF4C58', accent2: '#7B0A18', bg1: '#25070B', bg2: '#5C0D16', panel: '#140709', text: '#FFF2F2', muted: '#C29BA0'
  },
  ocean: {
    name: 'OCEAN', icon: '◆', accent: '#57C7FF', accent2: '#0B5D85', bg1: '#061722', bg2: '#0A3850', panel: '#08131C', text: '#EFFBFF', muted: '#91B8C9'
  },
  emerald: {
    name: 'EMERALD', icon: '◆', accent: '#66E39B', accent2: '#126744', bg1: '#06180F', bg2: '#0B3E29', panel: '#07130E', text: '#EFFEF5', muted: '#93B7A4'
  },
  sakura: {
    name: 'SAKURA', icon: '✿', accent: '#FF9FC5', accent2: '#8F4765', bg1: '#250F18', bg2: '#542036', panel: '#160B10', text: '#FFF2F8', muted: '#C6A4B1'
  },
  royal: {
    name: 'ROYAL', icon: '♛', accent: '#B78CFF', accent2: '#4D2A91', bg1: '#110D22', bg2: '#2D1B58', panel: '#0D0A17', text: '#F8F2FF', muted: '#B8A8CF'
  },
  obsidian: {
    name: 'OBSIDIAN', icon: '◈', accent: '#E4E6EA', accent2: '#626773', bg1: '#0A0B0E', bg2: '#1D2027', panel: '#090A0D', text: '#F5F6F8', muted: '#9FA4AF'
  },
  cyber: {
    name: 'CYBER', icon: '⬢', accent: '#F2FF36', accent2: '#1E7300', bg1: '#0A1005', bg2: '#183009', panel: '#080C05', text: '#F7FFE8', muted: '#9EB38B'
  },
  frost: {
    name: 'FROST', icon: '❄', accent: '#AEE9FF', accent2: '#356D8D', bg1: '#08151E', bg2: '#173B4C', panel: '#071017', text: '#EEFAFF', muted: '#9BBCC9'
  },
  celestial: {
    name: 'CELESTIAL', icon: '✧', accent: '#FFD88A', accent2: '#7251C5', bg1: '#101127', bg2: '#322255', panel: '#0B0B18', text: '#FFF9EF', muted: '#B2A9C6'
  },
  sunset: {
    name: 'SUNSET', icon: '☼', accent: '#FFB164', accent2: '#BA3C64', bg1: '#29100A', bg2: '#55223E', panel: '#160B08', text: '#FFF4EA', muted: '#C5A99D'
  }
};

function cleanText(value, fallback = '') {
  return String(value || fallback).replace(/[\u0000-\u001F]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function ellipsis(text, max) {
  const s = cleanText(text);
  return s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function fmtNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'N/A';
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

function stars(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return '☆☆☆☆☆';
  const filled = Math.max(0, Math.min(5, Math.round(n / 2)));
  return `${'★'.repeat(filled)}${'☆'.repeat(5 - filled)}`;
}

const DESIGN_KEYS = Object.keys(STYLES);

function styleKey(input) {
  const raw = String(input ?? '').trim().toLowerCase();
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    return DESIGN_KEYS[n - 1] || 'gold';
  }
  const key = raw.replace(/[^a-z]/g, '');
  return STYLES[key] ? key : 'gold';
}

function designFromArgs(args) {
  const list = Array.isArray(args) ? args.map(String) : [];
  for (let i = 0; i < list.length - 1; i++) {
    if (/^design$/i.test(list[i]) && /^\d{1,2}$/.test(list[i + 1])) {
      const n = Number(list[i + 1]);
      if (n >= 1 && n <= DESIGN_KEYS.length) return DESIGN_KEYS[n - 1];
    }
  }
  for (const token of list) {
    if (/^d\d{1,2}$/i.test(token)) {
      const n = Number(token.slice(1));
      if (n >= 1 && n <= DESIGN_KEYS.length) return DESIGN_KEYS[n - 1];
    }
  }
  return null;
}

function randomStyle() {
  const keys = Object.keys(STYLES);
  return keys[Math.floor(Math.random() * keys.length)];
}

function splitQuery(rawArgs) {
  const raw = rawArgs.join(' ').trim();
  if (!raw) return { query: '', style: 'gold' };
  const parts = raw.split(/\s+/);
  const last = parts.at(-1) || '';
  const named = STYLES[styleKey(last)] && !/^\d+$/.test(last);
  if (named && STYLES[String(last).toLowerCase()]) {
    return { query: parts.slice(0, -1).join(' '), style: styleKey(last) };
  }
  return { query: raw, style: 'gold' };
}

async function getJson(url, params = {}) {
  const response = await axios.get(url, {
    params,
    timeout: 15000,
    headers: { 'User-Agent': 'ABIX-9696Card/1.0' },
    validateStatus: (status) => status >= 200 && status < 500
  });
  if (response.status >= 400) throw new Error(`Jikan HTTP ${response.status}`);
  return response.data;
}

function imageUrlFrom(data) {
  return cleanText(
    data?.images?.webp?.large_image_url ||
    data?.images?.jpg?.large_image_url ||
    data?.images?.webp?.image_url ||
    data?.images?.jpg?.image_url
  );
}

async function findCharacter(query) {
  const data = await getJson(`${JIKAN}/characters`, { q: query, limit: 5, order_by: 'favorites', sort: 'desc' });
  return data?.data?.[0] || null;
}

async function findAnime(query) {
  const data = await getJson(`${JIKAN}/anime`, { q: query, limit: 5, order_by: 'score', sort: 'desc' });
  return data?.data?.[0] || null;
}

async function getCharacterFull(id) {
  if (!id) return null;
  try {
    const data = await getJson(`${JIKAN}/characters/${id}/full`);
    return data?.data || null;
  } catch {
    return null;
  }
}

async function downloadImage(url) {
  if (!/^https?:\/\/cdn\.myanimelist\.net\//i.test(url)) {
    throw new Error('Unsupported image source');
  }

  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 20000,
    maxContentLength: MAX_IMAGE_BYTES,
    maxBodyLength: MAX_IMAGE_BYTES,
    headers: { 'User-Agent': 'Mozilla/5.0' },
    validateStatus: (s) => s >= 200 && s < 300
  });

  const buffer = Buffer.from(response.data);
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new Error('Image is too large');
  return buffer;
}

function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function optimizeImageForHtml(imageBuffer) {
  const source = await loadImage(imageBuffer);
  const attempts = [
    { w: 720, h: 900, q: 0.66 },
    { w: 640, h: 800, q: 0.60 },
    { w: 600, h: 750, q: 0.55 },
    { w: 560, h: 700, q: 0.50 },
    { w: 520, h: 650, q: 0.45 },
    { w: 480, h: 600, q: 0.40 },
  ];
  let best = null;
  for (const attempt of attempts) {
    const canvas = createCanvas(attempt.w, attempt.h);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, attempt.w, attempt.h);
    const scale = Math.max(attempt.w / source.width, attempt.h / source.height);
    const dw = source.width * scale;
    const dh = source.height * scale;
    ctx.drawImage(source, (attempt.w - dw) / 2, (attempt.h - dh) / 2, dw, dh);
    const output = canvas.toBuffer('image/jpeg', attempt.q);
    best = output;
    if (output.length <= 34000) break;
  }
  if (!best?.length) throw new Error('Unable to prepare card image.');
  return best;
}

function roundedRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function fitContain(src, boxW, boxH) {
  const scale = Math.min(boxW / src.width, boxH / src.height);
  return {
    w: Math.max(1, Math.round(src.width * scale)),
    h: Math.max(1, Math.round(src.height * scale)),
  };
}

function wrapLines(ctx, text, maxWidth, maxLines = 6) {
  const words = cleanText(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      line = test;
    } else if (line) {
      lines.push(line);
      line = word;
      if (lines.length >= maxLines) break;
    } else {
      lines.push(word);
      line = '';
      if (lines.length >= maxLines) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

async function render9696Image(model, styleName) {
  const style = STYLES[styleName] || STYLES.gold;
  if (!Buffer.isBuffer(model.imageBuffer) || !model.imageBuffer.length) throw new Error('Card image is unavailable.');
  const source = await loadImage(model.imageBuffer);
  const W = 900;
  const H = 1200;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, style.bg1);
  bg.addColorStop(1, style.bg2);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = style.accent;
  ctx.lineWidth = 5;
  roundedRect(ctx, 14, 14, W - 28, H - 28, 32);
  ctx.stroke();

  ctx.fillStyle = style.accent;
  ctx.font = '900 26px Arial';
  ctx.fillText(`9696 STYLE CARD • ${style.name}`, 48, 64);

  ctx.fillStyle = style.text;
  ctx.font = '900 46px Arial';
  ctx.fillText(ellipsis(model.name, 26), 48, 118);

  ctx.fillStyle = style.muted;
  ctx.font = '700 24px Arial';
  ctx.fillText(ellipsis(model.series, 42), 48, 154);

  const mx = 34, my = 180, mw = 832, mh = 700;
  ctx.fillStyle = style.panel;
  roundedRect(ctx, mx, my, mw, mh, 28);
  ctx.fill();
  ctx.strokeStyle = `${style.accent}66`;
  ctx.lineWidth = 2;
  ctx.stroke();

  const fit = fitContain(source, mw - 20, mh - 20);
  const ix = mx + (mw - fit.w) / 2;
  const iy = my + (mh - fit.h) / 2;
  ctx.save();
  roundedRect(ctx, mx + 10, my + 10, mw - 20, mh - 20, 20);
  ctx.clip();
  ctx.drawImage(source, ix, iy, fit.w, fit.h);
  ctx.restore();

  const cardTop = 905;
  ctx.fillStyle = style.accent;
  ctx.font = '900 22px Arial';
  ctx.fillText(`${style.icon} ${model.kind.toUpperCase()}`, 48, cardTop);

  ctx.fillStyle = style.text;
  ctx.font = '900 34px Arial';
  ctx.fillText(ellipsis(model.name, 32), 48, cardTop + 48);

  ctx.fillStyle = style.muted;
  ctx.font = '600 20px Arial';
  ctx.fillText(`ID ${model.id} • ${model.source}`, 48, cardTop + 79);

  const stats = [
    ['SCORE', Number.isFinite(Number(model.score)) ? Number(model.score).toFixed(1) : 'N/A'],
    ['FAVORITES', fmtNumber(model.favorites)],
    ['EPISODES', model.episodes ?? 'N/A'],
  ];
  const colW = 250;
  stats.forEach((item, i) => {
    const x = 48 + i * (colW + 15);
    ctx.fillStyle = style.panel;
    roundedRect(ctx, x, cardTop + 96, colW, 64, 14);
    ctx.fill();
    ctx.fillStyle = style.accent;
    ctx.font = '800 15px Arial';
    ctx.fillText(item[0], x + 14, cardTop + 120);
    ctx.fillStyle = style.text;
    ctx.font = '900 20px Arial';
    ctx.fillText(ellipsis(String(item[1]), 16), x + 14, cardTop + 146);
  });

  ctx.fillStyle = style.muted;
  ctx.font = '600 17px Arial';
  const lines = wrapLines(ctx, model.description || '', W - 96, 3);
  lines.forEach((line, i) => ctx.fillText(line, 48, cardTop + 190 + i * 24));

  ctx.fillStyle = style.accent;
  ctx.font = '800 15px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('9696 STYLE CARD', W / 2, H - 34);
  ctx.textAlign = 'left';

  return canvas.toBuffer('image/jpeg', 0.84);
}

async function send9696Card(sock, chatId, buffer) {
  if (!sock || typeof sock.sendMessage !== 'function') throw new Error('WhatsApp sender is unavailable.');
  return sock.sendMessage(chatId, {
    image: buffer,
    _skipForwardContext: true,
  });
}

async function resolveModel(query) {
  let character = null;
  try { character = await findCharacter(query); } catch {}

  if (character) {
    const full = await getCharacterFull(character.mal_id);
    const imageUrl = imageUrlFrom(full || character);
    if (!imageUrl) throw new Error('Character image unavailable');
    const sourceBuffer = await downloadImage(imageUrl);
    const htmlImageBuffer = await optimizeImageForHtml(sourceBuffer);
    const firstAnime = full?.anime?.[0]?.anime?.name || 'Anime Character';
    return {
      kind: 'Character',
      id: character.mal_id,
      name: cleanText(character.name, query),
      series: cleanText(firstAnime, 'Anime Character'),
      source: 'MYANIMELIST',
      imageBuffer: sourceBuffer,
      htmlImageBuffer,
      description: ellipsis(full?.about || 'Anime character card generated from public metadata.', 420),
      favorites: character.favorites,
      score: null,
      episodes: full?.anime?.length || null,
    };
  }

  const anime = await findAnime(query);
  if (!anime) throw new Error(`No anime or character found for "${query}"`);
  const imageUrl = imageUrlFrom(anime);
  if (!imageUrl) throw new Error('Anime image unavailable');
  const sourceBuffer = await downloadImage(imageUrl);
  const htmlImageBuffer = await optimizeImageForHtml(sourceBuffer);
  return {
    kind: 'Anime',
    id: anime.mal_id,
    name: cleanText(anime.title, query),
    series: cleanText(anime.title_japanese || anime.title, 'Anime'),
    source: 'MYANIMELIST',
    imageBuffer: sourceBuffer,
    htmlImageBuffer,
    description: ellipsis(anime.synopsis || 'Anime card generated from public metadata.', 420),
    favorites: anime.members,
    score: anime.score,
    episodes: anime.episodes,
  };
}

function menuText(prefix) {
  return [
    '*9696 STYLE CARD MENU*',
    '',
    `${prefix}9696card <character/anime> [style]`,
    `${prefix}9696card <character/anime> design <1-12>`,
    `${prefix}card design <1-12>  • random character`,
    `${prefix}9696random [style]`,
    `${prefix}9696styles`,
    '',
    '*Styles:*',
    Object.entries(STYLES).map(([key, value], i) => `• ${i + 1}. ${key} — ${value.name}`).join('\n'),
  ].join('\n');
}

async function handler(sock, message, args, context = {}) {
  const chatId = context.chatId || message.key.remoteJid;
  const prefix = context.prefix || '-';
  const sub = String(args[0] || '').toLowerCase();

  try {
    if (sub === 'menu' || sub === 'help') return sock.sendMessage(chatId, { text: menuText(prefix), _skipForwardContext: true });
    if (sub === 'styles' || sub === 'style') {
      return sock.sendMessage(chatId, { text: ['*9696 CARD DESIGNS*', '', ...Object.entries(STYLES).map(([k, v], i) => `${i + 1}. ${v.icon} *${k}* — ${v.name}`)].join('\n'), _skipForwardContext: true });
    }
    if (sub === 'random') {
      const style = args[1] && STYLES[styleKey(args[1])] ? styleKey(args[1]) : randomStyle();
      const common = ['Naruto', 'One Piece', 'Bleach', 'Demon Slayer', 'Jujutsu Kaisen', 'Tenten', 'Sakura', 'Mikasa'];
      const query = common[Math.floor(Math.random() * common.length)];
      const model = await resolveModel(query);
      const cardImage = await render9696Image(model, style);
      return await send9696Card(sock, chatId, cardImage);
    }
    if (!args.length) return sock.sendMessage(chatId, { text: menuText(prefix), _skipForwardContext: true });

    const requestedDesign = designFromArgs(args);
    const cleanedArgs = requestedDesign
      ? args.filter((value, index) => !/^design$/i.test(String(value)) && !(index > 0 && /^design$/i.test(String(args[index - 1]))))
      : args;
    const { query: parsedQuery, style: parsedStyle } = splitQuery(cleanedArgs);
    const style = requestedDesign || parsedStyle;
    const randomQueries = ['Naruto', 'Madara', 'Tenten', 'Sakura', 'Mikasa', 'Itachi', 'Gojo', 'Nezuko', 'Levi', 'Tanjiro'];
    const query = parsedQuery || (requestedDesign ? randomQueries[Math.floor(Math.random() * randomQueries.length)] : '');
    if (!query) return sock.sendMessage(chatId, { text: menuText(prefix), _skipForwardContext: true });

    const model = await resolveModel(query);
    const cardImage = await render9696Image(model, style);
    return await send9696Card(sock, chatId, cardImage);
  } catch (error) {
    console.error('9696card:', error.message || error);
    return sock.sendMessage(chatId, { text: `❌ 9696 card failed: ${error.message || 'Unable to generate card.'}`, _skipForwardContext: true });
  }
}

module.exports = {
  command: '9696card',
  aliases: ['card9696', 'animecard', 'card', '9696'],
  category: 'anime',
  description: 'Generate a 9696 native HTML anime/character card with multiple designs.',
  usage: '-9696card <character/anime> [style|design 1-12]',
  noFakeForward: true,
  handler,
  STYLES,
};
