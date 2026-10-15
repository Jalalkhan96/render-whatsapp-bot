'use strict';

/**
 * ABIX MovieBox+ search/link integration.
 *
 * Commands:
 *   -mbx <movie or series name>
 *   -mbxsearch <movie or series name>
 *   -mbxinfo <subject-id>
 *
 * This integration is intentionally LINK/METADATA ONLY.
 * It does not copy or redistribute full copyrighted movies/episodes.
 * If the upstream response exposes a legitimate official/public watch URL,
 * that URL is returned to the user.
 */

const path = require('path');
const { MovieBoxClient, subject } = require('./moviebox-sdk');

const SDK_ROOT = path.join(__dirname, 'moviebox-sdk');

function text(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value).replace(/\s+/g, ' ').trim();
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function safeUrl(value) {
  const raw = text(value);
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function collectObjects(value, out = [], seen = new Set(), depth = 0) {
  if (!value || depth > 6) return out;
  if (typeof value !== 'object') return out;
  if (seen.has(value)) return out;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) collectObjects(item, out, seen, depth + 1);
    return out;
  }

  out.push(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') {
      collectObjects(child, out, seen, depth + 1);
    }
  }
  return out;
}

function extractItems(payload) {
  const objects = collectObjects(payload);
  const results = [];
  const seen = new Set();

  for (const obj of objects) {
    const id = firstDefined(
      obj.subjectId,
      obj.id,
      obj.sid,
      obj.subject_id,
      obj.idStr
    );

    const title = firstDefined(
      obj.title,
      obj.name,
      obj.subjectName,
      obj.originalTitle,
      obj.enTitle
    );

    const pageUrl = firstDefined(
      obj.webUrl,
      obj.shareUrl,
      obj.url,
      obj.detailUrl,
      obj.shareURL,
      obj.link
    );

    const image = firstDefined(
      obj.cover,
      obj.coverUrl,
      obj.poster,
      obj.posterUrl,
      obj.image,
      obj.imageUrl,
      obj.thumbnail,
      obj.thumbnailUrl
    );

    const year = firstDefined(obj.year, obj.releaseYear, obj.pubYear);
    const score = firstDefined(obj.score, obj.rating, obj.imdbScore);
    const genre = firstDefined(obj.genre, obj.genres, obj.categoryName);
    const type = firstDefined(obj.type, obj.subjectType, obj.mediaType, obj.contentType);

    const looksLikeSubject = id || title || pageUrl || image;
    if (!looksLikeSubject) continue;

    const key = `${text(id)}|${text(title)}|${text(pageUrl)}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      id: text(id),
      title: text(title, 'Untitled'),
      pageUrl: safeUrl(pageUrl),
      image: safeUrl(image),
      year: text(year),
      score: score === null ? '' : text(score),
      genre: Array.isArray(genre) ? genre.map(text).filter(Boolean).join(', ') : text(genre),
      type: text(type)
    });
  }

  return results
    .filter(item => item.title !== 'Untitled' || item.id || item.pageUrl)
    .slice(0, 10);
}

function pickPlaybackUrl(payload) {
  const objects = collectObjects(payload);
  const candidates = [];

  for (const obj of objects) {
    for (const key of [
      'webUrl', 'shareUrl', 'watchUrl', 'playUrl', 'streamUrl', 'videoUrl',
      'downloadUrl', 'resourceUrl', 'url', 'link'
    ]) {
      const value = safeUrl(obj[key]);
      if (value) candidates.push(value);
    }
  }

  return candidates.find(url => /(^|\/)watch|moviebox|inmoviebox|aoneroom/i.test(url)) || candidates[0] || null;
}

function getArgText(args = []) {
  return args
    .map(text)
    .filter(Boolean)
    .join(' ')
    .trim();
}

function getEnvNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function makeClient() {
  const env = process.env.MOVIEBOX_ENV || 'prod';
  const failover = text(process.env.MOVIEBOX_FAILOVER)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  return new MovieBoxClient({
    env,
    failover,
    timeoutMs: getEnvNumber('MOVIEBOX_TIMEOUT_MS', 15000),
    token: process.env.MOVIEBOX_TOKEN || undefined,
  });
}


async function safeSend(sock, message, context, textValue) {
  const jid = context?.chatId || message?.key?.remoteJid || message?.chat;
  if (!jid) throw new Error('Unable to determine chat JID.');
  return sock.sendMessage(jid, { text: String(textValue) }, { quoted: message });
}

function formatSearch(results, query) {
  const lines = [
    '🎬 *MOVIEBOX+ SEARCH*',
    `🔎 *Query:* ${query}`,
    ''
  ];

  results.slice(0, 5).forEach((item, index) => {
    lines.push(`*${index + 1}. ${item.title}*`);
    if (item.year) lines.push(`📅 ${item.year}`);
    if (item.type) lines.push(`🎞️ ${item.type}`);
    if (item.score) lines.push(`⭐ ${item.score}`);
    if (item.genre) lines.push(`🏷️ ${item.genre}`);
    if (item.id) lines.push(`🆔 ${item.id}`);
    if (item.pageUrl) lines.push(`🔗 ${item.pageUrl}`);
    lines.push('');
  });

  lines.push('ℹ️ Movie/series links are returned from the available upstream response.');
  return lines.join('\n').trim();
}

module.exports = {
  command: 'mbx',
  aliases: ['mbxsearch', 'mbxmovie', 'mbxseries', 'moviebox', 'movieboxsearch'],
  category: 'download',
  description: 'Search MovieBox+ for movies and series and return available public/watch links.',
  async handler(sock, message, args, context = {}) {
    const query = getArgText(args);
    if (!query) {
      return safeSend(sock, message, context, '❌ Usage: -mbx <movie name or series name>');
    }

    const client = makeClient();

    try {
      let payload;
      try {
        payload = await subject.search(client, {
          keyword: query,
          type: 0,
          page: 1,
          pageSize: 10,
        });
      } catch (error) {
        // Current MovieBox+ deployments use POST for the legacy search endpoint.
        // Try the v2 POST search once before reporting the upstream failure.
        if (error?.status === 404 || error?.status === 405) {
          payload = await subject.searchV2Post(client, {
            keyword: query,
            type: 0,
            page: 1,
            pageSize: 10,
          });
        } else {
          throw error;
        }
      }

      const results = extractItems(payload);
      if (!results.length) {
        return safeSend(sock, message, context,
          `❌ No MovieBox+ results found for *${query}*.\n\n` +
          'The upstream service may require app-specific request signing or may be temporarily unavailable.'
        );
      }

      if (!global.__abixMbxSessions) global.__abixMbxSessions = new Map();
      const sender = text(
        context.sender || message.key?.participant || message.participant || message.sender,
        'unknown'
      );
      const chat = text(context.chat || message.key?.remoteJid || message.chat, 'unknown');
      const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      global.__abixMbxSessions.set(token, {
        sender,
        chat,
        query,
        results,
        createdAt: Date.now(),
      });

      for (const [k, v] of global.__abixMbxSessions) {
        if (Date.now() - v.createdAt > 15 * 60 * 1000) global.__abixMbxSessions.delete(k);
      }

      const body = formatSearch(results, query) +
        `\n\n📌 *Session:* ${token}\nUse *-mbxinfo <subject-id>* for details when an ID is shown.`;

      return safeSend(sock, message, context, body);
    } catch (error) {
      console.error('[MBX] search failed:', error?.message || error);
      const status = error?.status ? `HTTP ${error.status}` : 'request failed';
      return safeSend(sock, message, context,
        `❌ MovieBox+ search failed (${status}).\n` +
        'This integration only uses the available MovieBox+ client endpoints; it does not bypass app authentication/signing.'
      );
    }
  }
};

// Keep helpers available for the companion info plugin without creating a second
// command registration.
module.exports.extractItems = extractItems;
module.exports.pickPlaybackUrl = pickPlaybackUrl;
module.exports.makeClient = makeClient;
module.exports.subject = subject;
module.exports.SDK_ROOT = SDK_ROOT;
