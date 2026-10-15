'use strict';
/**
 * Zero-dependency HTML extraction helpers.
 * Selector strategy per spec: JSON-LD -> OpenGraph -> semantic HTML ->
 * primary selector -> fallback selector. Never fabricate fields.
 */

function decodeEntities(s) {
  if (!s) return '';
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripTags(s) {
  return String(s || '').replace(/<[^>]*>/g, '');
}

function cleanText(s) {
  return decodeEntities(stripTags(s)).replace(/\s+/g, ' ').trim();
}

function pageTitle(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html || '');
  return m ? cleanText(m[1]) : '';
}

/** content of <meta property="x" ...> or <meta name="x" ...> (either attr order) */
function metaContent(html, key) {
  if (!html || !key) return '';
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp('<meta[^>]+(?:property|name)=["\']' + esc + '["\'][^>]*content=["\']([^"\']*)["\']', 'i'),
    new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']' + esc + '["\']', 'i'),
  ];
  for (const p of patterns) {
    const m = p.exec(html);
    if (m) return decodeEntities(m[1]).trim();
  }
  return '';
}

function openGraph(html) {
  const keys = ['og:title', 'og:description', 'og:image', 'og:url', 'og:site_name', 'og:audio', 'music:duration', 'og:video'];
  const out = {};
  for (const k of keys) {
    const v = metaContent(html, k);
    if (v) out[k] = v;
  }
  return out;
}

/** Parse all <script type="application/ld+json"> blocks; returns array of objects. */
function jsonLd(html) {
  const out = [];
  if (!html) return out;
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  let guard = 0;
  while ((m = re.exec(html)) && guard++ < 50) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed)) out.push(...parsed);
      else if (parsed && typeof parsed === 'object') out.push(parsed);
    } catch (e) { /* skip malformed blocks */ }
  }
  return out;
}

/** Find MusicRecording / Song / MusicAlbum node inside JSON-LD graph. */
function jsonLdMusicNode(html) {
  const blocks = jsonLd(html);
  const want = ['MusicRecording', 'Song', 'MusicAlbum', 'MusicGroup'];
  for (const b of blocks) {
    const nodes = b['@graph'] && Array.isArray(b['@graph']) ? b['@graph'] : [b];
    for (const n of nodes) {
      const t = n['@type'];
      const types = Array.isArray(t) ? t : [t];
      if (types.some((x) => want.includes(x))) return n;
    }
  }
  return null;
}

/** Best-effort anchor extraction: [{ href, text }] — capped, for result lists. */
function anchors(html, limit = 2000) {
  const out = [];
  if (!html) return out;
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < limit) {
    const text = cleanText(m[2]);
    if (text) out.push({ href: m[1].trim(), text });
  }
  return out;
}

/** Resolve possibly-relative href against base. */
function absUrl(base, href) {
  if (!href) return '';
  try {
    return new URL(href, base).toString();
  } catch (e) {
    return href;
  }
}

/** "3:45" | "03:45" | "PT3M45S" | "225" | "225000" -> ms (null if unknown) */
function durationToMs(s) {
  if (s == null) return null;
  if (typeof s === 'number') return s > 10000 ? Math.round(s) : Math.round(s * 1000);
  const str = String(s).trim();
  if (!str) return null;
  let m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i.exec(str);
  if (m) {
    const h = parseInt(m[1] || '0', 10), min = parseInt(m[2] || '0', 10), sec = parseFloat(m[3] || '0');
    return Math.round(((h * 3600) + (min * 60) + sec) * 1000);
  }
  m = /^(?:(\d+):)?([0-5]?\d):([0-5]\d)(?:\.\d+)?$/.exec(str);
  if (m) {
    const h = parseInt(m[1] || '0', 10), min = parseInt(m[2], 10), sec = parseInt(m[3], 10);
    return ((h * 3600) + (min * 60) + sec) * 1000;
  }
  m = /^(\d+(?:\.\d+)?)$/.exec(str);
  if (m) {
    const n = parseFloat(m[1]);
    return n > 10000 ? Math.round(n) : Math.round(n * 1000);
  }
  return null;
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return '';
  const s = Math.round(ms / 1000);
  const mnt = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, '0');
  return mnt + ':' + sec;
}

module.exports = {
  decodeEntities, stripTags, cleanText, pageTitle,
  metaContent, openGraph, jsonLd, jsonLdMusicNode,
  anchors, absUrl, durationToMs, formatDuration,
};
