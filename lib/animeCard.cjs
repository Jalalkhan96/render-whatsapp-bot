'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const CARD_DIR = path.join(ROOT, 'data', 'anime-cards');
const ASSET_DIR = path.join(ROOT, 'assets', 'anime-cards', 'cards');
const CARDS_FILE = path.join(CARD_DIR, 'cards.json');
const SEED_FILE = path.join(CARD_DIR, 'seed-cards.json');
const INDEX_FILE = path.join(CARD_DIR, 'index.json');

const DESIGNS = Object.freeze([
  { id: 'neon', label: '⚡ Neon', accent: '#38bdf8', bg1: '#07111f', bg2: '#0f2742' },
  { id: 'sakura', label: '🌸 Sakura', accent: '#f472b6', bg1: '#2a1228', bg2: '#5b214c' },
  { id: 'gold', label: '👑 Gold', accent: '#fbbf24', bg1: '#20180a', bg2: '#5a4308' },
  { id: 'cyber', label: '🧬 Cyber', accent: '#a78bfa', bg1: '#121027', bg2: '#28205a' },
  { id: 'midnight', label: '🌙 Midnight', accent: '#60a5fa', bg1: '#030712', bg2: '#111827' },
  { id: 'glass', label: '🪩 Glass', accent: '#2dd4bf', bg1: '#062321', bg2: '#123d39' },
]);

function ensureDirs() {
  fs.mkdirSync(CARD_DIR, { recursive: true });
  fs.mkdirSync(ASSET_DIR, { recursive: true });
}

function safeReadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function normalizeCard(raw, index = 0) {
  const source = raw || {};
  const id = String(source.id ?? source.card_id ?? source.cardId ?? `${index + 1}`).trim();
  const character = String(source.character ?? source.name ?? source.title ?? 'Unknown Character').trim();
  const series = String(source.series ?? source.anime ?? source.title_name ?? 'Unknown Series').trim();
  const tierRaw = source.tier ?? source.rarity ?? source.rank ?? null;
  const tier = tierRaw == null ? null : Number.isFinite(Number(tierRaw)) ? Number(tierRaw) : String(tierRaw).trim();
  const imageUrl = String(source.imageUrl ?? source.image_url ?? source.image ?? source.url ?? '').trim();
  const gifUrl = String(source.gifUrl ?? source.gif_url ?? source.gif ?? '').trim();
  return {
    id, character, series, tier,
    edition: String(source.edition ?? source.variant ?? 'Original').trim() || 'Original',
    imageUrl,
    gifUrl,
    sourceUrl: String(source.sourceUrl ?? source.source ?? imageUrl).trim(),
    tags: Array.isArray(source.tags) ? source.tags.map(String).slice(0, 20) : [],
  };
}

function saveCards(cards) {
  ensureDirs();
  const normalized = cards.map((c, i) => normalizeCard(c, i));
  const unique = [];
  const seen = new Set();
  for (const card of normalized) {
    const key = card.id || `${card.character}|${card.series}|${card.imageUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(card);
  }
  fs.writeFileSync(CARDS_FILE, JSON.stringify(unique, null, 2) + '\n');
  const index = { generatedAt: new Date().toISOString(), count: unique.length, byId: {}, bySeries: {}, byCharacter: {}, byTier: {} };
  for (const card of unique) {
    index.byId[card.id] = card;
    const add = (obj, key, value) => { if (!key) return; (obj[key] ||= []).push(value); };
    add(index.bySeries, card.series.toLowerCase(), card.id);
    add(index.byCharacter, card.character.toLowerCase(), card.id);
    add(index.byTier, String(card.tier ?? 'unknown').toLowerCase(), card.id);
  }
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2) + '\n');
  return unique;
}

function loadCards() {
  ensureDirs();
  let cards = safeReadJson(CARDS_FILE, []);
  if (!Array.isArray(cards) || cards.length === 0) cards = safeReadJson(SEED_FILE, []);
  if (!Array.isArray(cards)) cards = [];
  return cards.map(normalizeCard);
}

function getDesign(input) {
  if (Number.isInteger(input) || /^\d+$/.test(String(input || ''))) return DESIGNS[Number(input) % DESIGNS.length];
  const found = DESIGNS.find(d => d.id === String(input || '').toLowerCase());
  return found || DESIGNS[Math.floor(Math.random() * DESIGNS.length)];
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function truncate(value, max) {
  const s = String(value || '');
  return s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1))}…`;
}

function hashKey(card) {
  return crypto.createHash('sha256').update(`${card.id}|${card.imageUrl}|${card.gifUrl}`).digest('hex').slice(0, 16);
}

async function fetchImage(url) {
  if (!/^https?:\/\//i.test(url)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': process.env.ANIME_CARD_UA || 'ABIX-AE-AnimeCard/1.0',
        Referer: (() => { try { return new URL(url).origin + '/'; } catch { return undefined; } })(),
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > 12 * 1024 * 1024) throw new Error('Invalid/oversized image');
    return buffer;
  } finally {
    clearTimeout(timeout);
  }
}

async function getAssetBuffer(card) {
  const candidates = [card.imageUrl, card.gifUrl].filter(Boolean);
  for (const url of candidates) {
    const key = crypto.createHash('sha256').update(url).digest('hex').slice(0, 24);
    for (const ext of ['png', 'webp', 'gif']) {
      const local = path.join(ASSET_DIR, `${key}.${ext}`);
      if (fs.existsSync(local)) {
        try { return fs.readFileSync(local); } catch {}
      }
    }
    try {
      const buf = await fetchImage(url);
      if (buf) return buf;
    } catch (error) {
      console.warn(`[ANIME-CARD] image fetch failed for ${card.id}: ${error.message}`);
    }
  }
  return null;
}

function placeholderDataUri(card, design) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="620" height="820"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${design.bg1}"/><stop offset="1" stop-color="${design.bg2}"/></linearGradient></defs><rect width="620" height="820" rx="36" fill="url(#g)"/><circle cx="310" cy="300" r="150" fill="${design.accent}" opacity=".12"/><text x="310" y="330" text-anchor="middle" fill="${design.accent}" font-size="90">🎴</text><text x="310" y="430" text-anchor="middle" fill="#fff" font-size="30" font-family="Arial" font-weight="700">${escapeXml(truncate(card.character, 24))}</text></svg>`;
  return Buffer.from(svg);
}

async function renderCard(card, options = {}) {
  ensureDirs();
  const design = getDesign(options.design);
  let input = await getAssetBuffer(card);
  if (!input) input = placeholderDataUri(card, design);

  const image = await sharp(input, { animated: true })
    .resize(560, 520, { fit: 'cover', position: 'centre' })
    .flatten({ background: design.bg1 })
    .png()
    .toBuffer();

  const imageB64 = image.toString('base64');
  const tierText = card.tier == null ? 'T?' : `T${card.tier}`;
  const starCount = typeof card.tier === 'number' ? Math.max(1, Math.min(6, card.tier)) : 3;
  const stars = '★'.repeat(starCount) + '☆'.repeat(6 - starCount);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="620" height="900" viewBox="0 0 620 900">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${design.bg1}"/><stop offset="1" stop-color="${design.bg2}"/></linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity=".45"/></filter>
    <clipPath id="clip"><rect x="30" y="140" width="560" height="520" rx="30"/></clipPath>
  </defs>
  <rect width="620" height="900" rx="36" fill="url(#bg)"/>
  <rect x="16" y="16" width="588" height="868" rx="30" fill="none" stroke="${design.accent}" stroke-opacity=".58" stroke-width="3"/>
  <circle cx="80" cy="75" r="26" fill="${design.accent}" opacity=".18"/><circle cx="540" cy="75" r="40" fill="${design.accent}" opacity=".08"/>
  <text x="40" y="88" fill="#fff" font-family="Arial" font-size="28" font-weight="900">SHOOB-STYLE CARD</text>
  <text x="40" y="118" fill="${design.accent}" font-family="Arial" font-size="13" font-weight="800">ABIX LOCAL CARD ENGINE • ${escapeXml(design.label)}</text>
  <rect x="26" y="136" width="568" height="528" rx="34" fill="#000" opacity=".22" filter="url(#shadow)"/>
  <image x="30" y="140" width="560" height="520" preserveAspectRatio="xMidYMid slice" href="data:image/png;base64,${imageB64}" clip-path="url(#clip)"/>
  <rect x="30" y="140" width="560" height="520" rx="30" fill="none" stroke="#fff" stroke-opacity=".10"/>
  <rect x="42" y="154" width="92" height="40" rx="20" fill="${design.accent}"/>
  <text x="88" y="181" text-anchor="middle" fill="#08111b" font-family="Arial" font-size="20" font-weight="900">${escapeXml(tierText)}</text>
  <text x="40" y="725" fill="#fff" font-family="Arial" font-size="31" font-weight="900">${escapeXml(truncate(card.character, 27))}</text>
  <text x="40" y="756" fill="${design.accent}" font-family="Arial" font-size="17" font-weight="700">${escapeXml(truncate(card.series, 40))}</text>
  <text x="40" y="793" fill="#d1d5db" font-family="Arial" font-size="20" font-weight="700">${stars}</text>
  <text x="40" y="824" fill="#94a3b8" font-family="Arial" font-size="13">ID ${escapeXml(card.id)} • ${escapeXml(card.edition)}</text>
  <text x="40" y="854" fill="#64748b" font-family="Arial" font-size="11">Local cache • source metadata preserved • design ${escapeXml(design.id)}</text>
</svg>`;

  const out = await sharp(Buffer.from(svg)).png().toBuffer();
  const filename = `${hashKey(card)}-${design.id}.png`;
  return { buffer: out, filename, design };
}

function findCard(query) {
  const cards = loadCards();
  const q = String(query || '').trim().toLowerCase();
  if (!q) return null;
  return cards.find(c => c.id === q) || cards.find(c => c.character.toLowerCase() === q) || cards.find(c => c.character.toLowerCase().includes(q)) || cards.find(c => c.series.toLowerCase().includes(q)) || null;
}

function randomCard() {
  const cards = loadCards();
  return cards.length ? cards[Math.floor(Math.random() * cards.length)] : null;
}

function caption(card, design) {
  return [
    `🎴 *ANIME CARD • ${design.label}*`,
    '',
    `👤 *${card.character}*`,
    `🎬 ${card.series}`,
    `⭐ Tier: *${card.tier == null ? '?' : `T${card.tier}`}*`,
    `🆔 ID: ${card.id}`,
    `🎨 ${card.edition}`,
    '',
    `Use *-card ${card.id}* or *-card design 1* for another style.`,
  ].join('\n');
}

async function sendCard(sock, jid, message, card, options = {}) {
  if (!card) {
    return sock.sendMessage(jid, { text: '🎴 No card data is available yet. Run `npm run cards:scrape` on the bot server first.' }, { quoted: message });
  }
  try {
    const rendered = await renderCard(card, options);
    return await sock.sendMessage(jid, { image: rendered.buffer, caption: caption(card, rendered.design) }, { quoted: message });
  } catch (error) {
    console.error('[ANIME-CARD] render/send failed:', error);
    return sock.sendMessage(jid, { text: caption(card, getDesign(options.design)) }, { quoted: message });
  }
}

async function sendRandomCard(sock, jid, message, options = {}) {
  return sendCard(sock, jid, message, randomCard(), options);
}

function stats() {
  const cards = loadCards();
  return {
    count: cards.length,
    series: new Set(cards.map(c => c.series.toLowerCase())).size,
    tiers: cards.reduce((a, c) => { const k = String(c.tier ?? 'unknown'); a[k] = (a[k] || 0) + 1; return a; }, {}),
    designs: DESIGNS.map(d => d.id),
  };
}

module.exports = {
  DESIGNS,
  loadCards,
  saveCards,
  randomCard,
  findCard,
  renderCard,
  sendCard,
  sendRandomCard,
  caption,
  stats,
  getDesign,
  normalizeCard,
};
