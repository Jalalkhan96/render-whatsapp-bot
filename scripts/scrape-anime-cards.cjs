'use strict';

/**
 * Local anime-card metadata/image scraper.
 *
 * This intentionally uses public source pages/assets rather than a third-party
 * card API. It is resumable and stores metadata locally. Image downloads are
 * opt-in with --download.
 *
 * Usage:
 *   node scripts/scrape-anime-cards.cjs
 *   node scripts/scrape-anime-cards.cjs --download
 *   node scripts/scrape-anime-cards.cjs --seed-file ./data/anime-cards/seed-cards.json --download
 *   node scripts/scrape-anime-cards.cjs --seed-url https://example.test/cards.json --download
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { normalizeCard, loadCards, saveCards } = require('../lib/animeCard.cjs');

const ROOT = path.join(__dirname, '..');
const CARD_DIR = path.join(ROOT, 'data', 'anime-cards');
const ASSET_DIR = path.join(ROOT, 'assets', 'anime-cards', 'cards');
const STATE_FILE = path.join(CARD_DIR, 'scrape-state.json');
const DEFAULT_SEED = path.join(CARD_DIR, 'seed-cards.json');

const args = process.argv.slice(2);
const has = (x) => args.includes(x);
function valueOf(flag, fallback = '') { const i = args.indexOf(flag); return i >= 0 ? String(args[i + 1] || fallback) : fallback; }

const state = readJson(STATE_FILE, { sources: {}, downloaded: {}, lastRun: null });
fs.mkdirSync(CARD_DIR, { recursive: true });
fs.mkdirSync(ASSET_DIR, { recursive: true });

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); }

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'ABIX-AE-AnimeCardScraper/1.0', Accept: 'text/html,application/json;q=0.9,*/*;q=0.8' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function extractJsonBlocks(html) {
  const found = [];
  const patterns = [
    /<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi,
    /<script[^>]*>(\{[\s\S]{20,}\})<\/script>/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(html))) {
      try { found.push(JSON.parse(m[1])); } catch {}
    }
  }
  return found;
}

function flattenCards(value, out = []) {
  if (Array.isArray(value)) { for (const v of value) flattenCards(v, out); return out; }
  if (!value || typeof value !== 'object') return out;
  if ((value.id || value.card_id || value.cardId) && (value.image || value.imageUrl || value.image_url || value.url)) out.push(value);
  for (const v of Object.values(value)) flattenCards(v, out);
  return out;
}

function extractImageLinks(html, baseUrl) {
  const out = new Set();
  const re = /(?:src|data-src|href|content)=["']([^"']+\.(?:png|jpe?g|webp|gif)(?:\?[^"']*)?)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    try { out.add(new URL(m[1], baseUrl).href); } catch {}
  }
  return [...out];
}

function inferCardFromUrl(url, index) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const file = decodeURIComponent(u.pathname.split('/').pop() || '').replace(/\.[^.]+$/, '');
  const pieces = file.split(/[;,|]/).map(s => s.trim()).filter(Boolean);
  const tierMatch = u.pathname.match(/\/cards\/(\d+)\//i);
  const tier = tierMatch ? Number(tierMatch[1]) : null;
  if (!file) return null;
  return normalizeCard({
    id: `asset-${crypto.createHash('sha1').update(url).digest('hex').slice(0, 12)}`,
    character: pieces[0] || `Card ${index + 1}`,
    series: pieces[2] || pieces[1] || 'Unknown Series',
    tier,
    edition: pieces[3] || 'Original',
    imageUrl: url,
    sourceUrl: u.origin,
  }, index);
}

async function collectSource(url) {
  const html = await fetchText(url);
  const cards = [];
  for (const block of extractJsonBlocks(html)) cards.push(...flattenCards(block));
  for (const imageUrl of extractImageLinks(html, url)) {
    const card = inferCardFromUrl(imageUrl, cards.length);
    if (card) cards.push(card);
  }
  return cards;
}

async function downloadAssets(cards) {
  let downloaded = 0;
  for (const card of cards) {
    if (!card.imageUrl || !/^https?:\/\//i.test(card.imageUrl)) continue;
    const key = crypto.createHash('sha256').update(card.imageUrl).digest('hex').slice(0, 24);
    if (state.downloaded[key]) continue;
    try {
      const response = await fetch(card.imageUrl, { headers: { 'User-Agent': 'ABIX-AE-AnimeCardScraper/1.0', Referer: (() => { try { return new URL(card.imageUrl).origin + '/'; } catch { return undefined; } })() } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length || buffer.length > 15 * 1024 * 1024) throw new Error('invalid/oversized asset');
      const ext = /\.gif(?:$|\?)/i.test(card.imageUrl) ? 'gif' : /\.webp(?:$|\?)/i.test(card.imageUrl) ? 'webp' : 'png';
      const file = `${key}.${ext}`;
      fs.writeFileSync(path.join(ASSET_DIR, file), buffer);
      state.downloaded[key] = { file, id: card.id, downloadedAt: new Date().toISOString() };
      downloaded++;
      if (downloaded % 50 === 0) console.log(`[cards] downloaded ${downloaded}`);
    } catch (error) {
      console.warn(`[cards] asset failed ${card.id}: ${error.message}`);
    }
  }
  return downloaded;
}

async function main() {
  const seedFile = valueOf('--seed-file', DEFAULT_SEED);
  const seedUrl = valueOf('--seed-url', '');
  const sources = [];
  if (fs.existsSync(seedFile)) {
    const seed = readJson(seedFile, []);
    if (Array.isArray(seed)) sources.push(...seed);
  }
  const effectiveSeedUrl = seedUrl || process.env.ANIME_CARD_SEED_URL || 'https://raw.githubusercontent.com/davidprospero123/api-anime/main/cartas.json';
  if (effectiveSeedUrl) {
    const remote = await fetchText(effectiveSeedUrl);
    try { const parsed = JSON.parse(remote); if (Array.isArray(parsed)) sources.push(...parsed); } catch {}
  }

  const pageSources = valueOf('--source', process.env.ANIME_CARD_SOURCE || 'https://eula-cardapi.suhotech.xyz/');
  for (const url of pageSources.split(',').map(x => x.trim()).filter(Boolean)) {
    if (state.sources[url]) continue;
    try {
      const found = await collectSource(url);
      sources.push(...found);
      state.sources[url] = { ok: true, count: found.length, fetchedAt: new Date().toISOString() };
      console.log(`[cards] ${url} -> ${found.length} candidate cards`);
    } catch (error) {
      state.sources[url] = { ok: false, error: error.message, fetchedAt: new Date().toISOString() };
      console.warn(`[cards] source failed ${url}: ${error.message}`);
    }
  }

  const existing = loadCards();
  const merged = new Map(existing.map(c => [c.id, c]));
  for (const raw of sources) { const card = normalizeCard(raw); if (card.imageUrl || card.character) merged.set(card.id, card); }
  const cards = saveCards([...merged.values()]);
  if (has('--download')) await downloadAssets(cards);
  state.lastRun = new Date().toISOString();
  writeJson(STATE_FILE, state);
  console.log(`[cards] database size: ${cards.length}`);
  console.log(`[cards] assets: ${fs.readdirSync(ASSET_DIR).length}`);
}

main().catch(error => { console.error('[cards] fatal:', error); process.exitCode = 1; });
