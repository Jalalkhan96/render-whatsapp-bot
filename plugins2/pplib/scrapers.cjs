'use strict';
/**
 * pplib/scrapers.cjs — shared zero-dependency scraper library for the PP bot.
 *
 * Safe comic-site helpers rewritten in CommonJS for the ABIX bot.
 * Node 18+ (native fetch). No npm packages.
 *
 * Adult video extractors and their registry are removed from this build.
 * Webtoon: webtoonSearchSeries, webtoonListEpisodes, webtoonEpisodeImages,
 *          tapasListEpisodes, tapasEpisodeImages, tapasSearchSeries (login-gated)
 */

class ExtractionError extends Error {}

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- generic helpers ---------------- */

function parseIso8601Duration(value) {
  if (!value) return null;
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(String(value).trim());
  if (!m) return null;
  return parseFloat(m[1] || 0) * 3600 + parseFloat(m[2] || 0) * 60 + parseFloat(m[3] || 0);
}

function parseDurationString(value) {
  if (!value) return null;
  const v = String(value).trim().toLowerCase();
  let m = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(v);
  if (m) {
    const parts = [m[1], m[2], m[3]].filter(Boolean).map(Number);
    return parts.reduce((s, p) => s * 60 + p, 0);
  }
  let secs = 0, found = false;
  for (const wm of v.matchAll(/(\d+(?:\.\d+)?)\s*(h|hour|hrs|min|sec|s)\b/g)) {
    found = true;
    const num = parseFloat(wm[1]);
    const u = wm[2][0];
    if (u === "h") secs += num * 3600;
    else if (u === "m") secs += num * 60;
    else secs += num;
  }
  return found ? Math.round(secs) : null;
}

function jsUnescape(value) {
  let prev;
  let v = String(value);
  while (prev !== v) {
    prev = v;
    v = v.replace(/\\\//g, "/").replace(/\\u0026/gi, "&");
  }
  if (v.includes("\\u")) {
    try { v = JSON.parse(`"${v.replace(/"/g, '\\"')}"`); } catch { /* keep */ }
  }
  return v;
}

const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  comma: ",", excl: "!", quest: "?", hellip: "…", mdash: "—", ndash: "–",
  ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’",
  laquo: "«", raquo: "»", copy: "©", reg: "®", trade: "™",
  times: "×", divide: "÷", plusmn: "±", deg: "°", euro: "€", pound: "£",
};

function htmlUnescape(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (_, name) =>
      Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name) ? NAMED_ENTITIES[name] : `&${name};`
    );
}

function extractJsonLd(html, wantType = null) {
  const blocks = [];
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1].trim());
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item && typeof item === "object" && (wantType === null || item["@type"] === wantType)) {
          blocks.push(item);
        }
      }
    } catch { /* malformed, skip */ }
  }
  return blocks;
}

function ogMeta(html, prop) {
  const esc = prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const attr of ["property", "name"]) {
    const m = new RegExp(`<meta[^>]+${attr}="${esc}"[^>]+content="([^"]+)"`, "i").exec(html);
    if (m) return m[1];
  }
  return null;
}

function titleFrom(html) {
  const t = ogMeta(html, "og:title");
  if (t) return t.replace(/\s+/g, " ").trim();
  const m = /<title>([\s\S]*?)<\/title>/i.exec(html);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

function directUrlEntry(quality, url, ext = null) {
  url = String(url).trim();
  ext = ext || (url.endsWith(".m3u8") ? "m3u8" : url.split("?")[0].split(".").pop().slice(0, 8) || "mp4");
  if (!["mp4", "webm", "m3u8", "mpd", "html"].includes(ext)) ext = "mp4";
  return {
    quality: typeof quality === "number" ? `${quality}p` : String(quality),
    url,
    ext,
  };
}

function sortByQualityDesc(list) {
  const score = (q) => {
    const m = /^(\d+)/.exec(String(q));
    return m ? parseInt(m[1], 10) : 0;
  };
  list.sort((a, b) => score(b.quality) - score(a.quality));
  return list;
}

function searchHit({ title, url, duration = null, thumbnail = null }) {
  return {
    title: title ? String(title).replace(/\s+/g, " ").trim() : null,
    url,
    duration: typeof duration === "number" ? duration : null,
    thumbnail: thumbnail || null,
  };
}

/* ---------------- session (browser-like fetch + cookie jar) ---------------- */

function makeSession(platform) {
  const cookies = new Map();
  async function fetchText(url, { referer = null, tries = 2, timeout = 30000, accept = "text/html,application/xhtml+xml", headers = {} } = {}) {
    let last = null;
    for (let attempt = 0; attempt < tries; attempt++) {
      try {
        const h = {
          "User-Agent": CHROME_UA,
          Accept: accept,
          "Accept-Language": "en-US,en;q=0.9",
          "Upgrade-Insecure-Requests": "1",
          ...headers,
        };
        if (referer) h["Referer"] = referer;
        const ck = [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
        if (ck) h["Cookie"] = ck;
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeout);
        const res = await fetch(url, { headers: h, signal: ctrl.signal, redirect: "follow" });
        clearTimeout(timer);
        const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
        for (const sc of setCookies) {
          const m = /^([^=;]+)=([^;]*)/.exec(sc);
          if (m) cookies.set(m[1].trim(), m[2]);
        }
        if (res.status === 404) throw new ExtractionError(`${platform}: page not found (404): ${url}`);
        if (res.status === 429) throw new ExtractionError(`${platform}: rate-limited (429); retry later`);
        if (res.status >= 400) throw new ExtractionError(`${platform}: HTTP ${res.status} fetching ${url}`);
        return await res.text();
      } catch (e) {
        if (e instanceof ExtractionError) throw e;
        last = e;
        await sleep(2000);
      }
    }
    throw new ExtractionError(`${platform}: failed to fetch ${url}: ${last?.message || last}`);
  }
  async function fetchJson(url, opts = {}) {
    const text = await fetchText(url, { accept: "application/json", ...opts });
    try { return JSON.parse(text); }
    catch (e) { throw new ExtractionError(`${platform}: bad JSON from ${url}: ${e.message}`); }
  }
  return { fetch: fetchText, fetchJson, cookies };
}

function fmtDur(secs) {
  if (typeof secs !== "number" || secs <= 0) return "?";
  const s = Math.round(secs);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`
           : `${m}:${String(r).padStart(2, "0")}`;
}

/* Adult video extractors were removed from this build. */

/* ================= WEBTOON / COMIC SITES ================= */

const WEBTOON_ORIGIN = "https://www.webtoons.com";
const TAPAS_ORIGIN = "https://tapas.io";

async function webtoonSearchSeries(query, limit = 5) {
  const s = makeSession("webtoons");
  const url = `${WEBTOON_ORIGIN}/en/search?keyword=${encodeURIComponent(query)}`;
  const html = await s.fetch(url, { referer: WEBTOON_ORIGIN + "/" });
  const results = [];
  const seen = new Set();
  for (const li of html.matchAll(/<li>([\s\S]*?)<\/li>/gi)) {
    const block = li[1];
    if (!block.includes("_card_item")) continue;
    const href =
      /<a[^>]*class="link _card_item"[^>]*href="([^"]+)"/i.exec(block)?.[1] ||
      /<a[^>]*href="([^"]+)"[^>]*class="link _card_item"/i.exec(block)?.[1];
    if (!href || seen.has(href)) continue;
    seen.add(href);
    const thumb = /<img[^>]+src="([^"]+)"/i.exec(block)?.[1] || null;
    const title = /<strong class="title">([^<]+)<\/strong>/i.exec(block)?.[1]?.trim() || null;
    const author = /<div class="author">([^<]+)<\/div>/i.exec(block)?.[1]?.trim() || null;
    if (!title) continue;
    results.push({
      site: "webtoons",
      title: htmlUnescape(title),
      url: href.startsWith("http") ? href : WEBTOON_ORIGIN + href,
      author: author ? htmlUnescape(author) : null,
      thumbnail: thumb ? htmlUnescape(thumb) : null,
    });
    if (results.length >= limit) break;
  }
  return results;
}

function webtoonTitleNo(url) {
  const m = /[?&]title_no=(\d+)/.exec(url);
  if (!m) throw new ExtractionError(`webtoons: cannot parse title_no from ${url}`);
  return m[1];
}

function webtoonListBase(url) {
  const titleNo = webtoonTitleNo(url);
  const u = new URL(url);
  if (/\/list\/?$/.test(u.pathname)) return `${WEBTOON_ORIGIN}${u.pathname}?title_no=${titleNo}`;
  const parts = u.pathname.split("/").filter(Boolean);
  parts.pop();
  return `${WEBTOON_ORIGIN}/${parts.join("/")}/list?title_no=${titleNo}`;
}

function webtoonParseList(html) {
  const episodes = [];
  const itemRe = /<li[^>]*class="[^"]*_episodeItem[^"]*"[^>]*data-episode-no="(\d+)"[^>]*>([\s\S]*?)<\/li>/g;
  let m;
  while ((m = itemRe.exec(html)) !== null) {
    const no = parseInt(m[1], 10);
    const block = m[2];
    const href = /href="([^"]*viewer\?[^"]*)"/.exec(block)?.[1];
    if (!href) continue;
    const title = /<span class="subj"><span>([^<]+)<\/span><\/span>/.exec(block)?.[1]?.trim() || null;
    const date = /<span class="date">([^<]+)<\/span>/.exec(block)?.[1]?.trim() || null;
    episodes.push({
      no,
      title: title ? htmlUnescape(title) : null,
      url: href.startsWith("http") ? href : WEBTOON_ORIGIN + href,
      date,
      free: null,
    });
  }
  return episodes;
}

async function webtoonListEpisodes(seriesUrl, maxPages = 60) {
  const s = makeSession("webtoons");
  let base = webtoonListBase(seriesUrl);
  const first = await s.fetch(`${base}&page=1`, { referer: WEBTOON_ORIGIN + "/" });
  const pg = /<a href="([^"]+)[?&]page=2" class=pg_page>/.exec(first)?.[1];
  if (pg) base = (pg.startsWith("http") ? pg : WEBTOON_ORIGIN + pg).replace(/[?&]$/, "");
  const all = [];
  const seen = new Set();
  const addPage = (html) => {
    let added = 0;
    for (const e of webtoonParseList(html)) {
      if (!seen.has(e.no)) { seen.add(e.no); all.push(e); added++; }
    }
    return added;
  };
  addPage(first);
  for (let page = 2; page <= maxPages; page += 4) {
    const batch = [];
    for (let p = page; p < page + 4; p++) {
      batch.push(
        s.fetch(`${base}&page=${p}`, { referer: WEBTOON_ORIGIN + "/", tries: 2 }).catch(() => "")
      );
    }
    const htmls = await Promise.all(batch);
    let added = 0;
    for (const html of htmls) if (html) added += addPage(html);
    if (added === 0) break;
    await sleep(500);
  }
  if (!all.length) throw new ExtractionError(`webtoons: no episodes found for ${seriesUrl}`);
  all.sort((a, b) => a.no - b.no);
  return all;
}

async function webtoonEpisodeImages(episodeUrl) {
  const s = makeSession("webtoons");
  const html = await s.fetch(episodeUrl, { referer: WEBTOON_ORIGIN + "/" });
  const images = [];
  const seen = new Set();
  for (const tag of html.matchAll(/<img\b[^>]*>/gi)) {
    const t = tag[0];
    if (!/\b_images\b/.test(t)) continue;
    const src = /data-url="([^"]+)"/.exec(t)?.[1];
    if (!src || seen.has(src)) continue;
    seen.add(src);
    images.push(htmlUnescape(src));
  }
  if (!images.length) throw new ExtractionError(`webtoons: no page images found — episode may be locked: ${episodeUrl}`);
  const epNo = /[?&]episode_no=(\d+)/.exec(episodeUrl)?.[1];
  return { title: titleFrom(html), episode_no: epNo ? parseInt(epNo, 10) : null, images, webpage_url: episodeUrl };
}

function tapasSeriesId(url) {
  const m = /\/series\/(\d+)/.exec(url);
  if (!m) throw new ExtractionError(`tapas: cannot parse series id from ${url}`);
  return m[1];
}

async function tapasListEpisodes(seriesUrl) {
  const s = makeSession("tapas");
  const id = tapasSeriesId(seriesUrl);
  const html = await s.fetch(`${TAPAS_ORIGIN}/series/${id}/info`, { referer: TAPAS_ORIGIN + "/" });
  const episodes = [];
  const blocks = html.split('<li class="episode-list__item">').slice(1);
  for (const block of blocks) {
    const end = block.indexOf("</li>");
    const item = end === -1 ? block : block.slice(0, end);
    const href = /href="(\/episode\/\d+)"/.exec(item)?.[1];
    if (!href) continue;
    const no = parseInt(/data-scene-number="(\d+)"/.exec(item)?.[1] || "0", 10);
    const charging = /data-is-charging="(true|false)"/.exec(item)?.[1];
    let title = /<span class="title__body">([^<]*)<\/span>/.exec(item)?.[1]?.trim() || null;
    if (!title) title = /<p class="scene">([^<]*)<\/p>/.exec(item)?.[1]?.trim() || null;
    const additional = /<p class="additional">([\s\S]*?)<\/p>/.exec(item)?.[1] || "";
    const date = /<span>([^<]+)<\/span>/.exec(additional)?.[1]?.trim() || null;
    episodes.push({
      no: no || null,
      title: title ? htmlUnescape(title) : null,
      url: TAPAS_ORIGIN + href,
      date,
      free: charging == null ? null : charging === "false",
    });
  }
  if (!episodes.length) throw new ExtractionError(`tapas: no episodes found for ${seriesUrl}`);
  episodes.sort((a, b) => (a.no || 0) - (b.no || 0));
  return episodes;
}

async function tapasEpisodeImages(episodeUrl) {
  const s = makeSession("tapas");
  const html = await s.fetch(episodeUrl, { referer: TAPAS_ORIGIN + "/" });
  const images = [];
  const seen = new Set();
  for (const tag of html.matchAll(/<img\b[^>]*>/gi)) {
    const src = /src="(https:\/\/us-a\.tapas\.io\/pc\/[^"]+)"/.exec(tag[0])?.[1];
    if (!src || seen.has(src)) continue;
    seen.add(src);
    images.push(htmlUnescape(src));
  }
  if (!images.length) throw new ExtractionError(`tapas: no page images found — episode may be locked: ${episodeUrl}`);
  return { title: titleFrom(html), episode_no: null, images, webpage_url: episodeUrl };
}

async function tapasSearchSeries(query, limit = 5) {
  const s = makeSession("tapas");
  const html = await s.fetch(`${TAPAS_ORIGIN}/search?q=${encodeURIComponent(query)}&t=COMICS`, { referer: TAPAS_ORIGIN + "/" });
  const results = [];
  const seen = new Set();
  for (const m of html.matchAll(/<a[^>]+href="(\/series\/\d+[^"]*)"[^>]*>([\s\S]{0,800}?)<\/a>/gi)) {
    const href = m[1];
    if (seen.has(href)) continue;
    seen.add(href);
    const block = m[2];
    const title = /class="title"[^>]*>([^<]+)</i.exec(block)?.[1]?.trim()
      || /<strong[^>]*>([^<]+)<\/strong>/i.exec(block)?.[1]?.trim() || null;
    if (!title) continue;
    const thumb = /<img[^>]+src="([^"]+)"/i.exec(block)?.[1] || null;
    results.push({
      site: "tapas",
      title: htmlUnescape(title),
      url: TAPAS_ORIGIN + href.split("?")[0],
      author: null,
      thumbnail: thumb ? htmlUnescape(thumb) : null,
    });
    if (results.length >= limit) break;
  }
  if (!results.length) {
    throw new ExtractionError(
      "tapas: series search needs login — the search API returns HTTP 401 for anonymous sessions"
    );
  }
  return results;
}

/* Download a remote file to a Buffer with browser headers (for CDN Referer). */
async function downloadBuffer(url, referer) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": CHROME_UA,
        "Accept-Language": "en-US,en;q=0.9",
        ...(referer ? { Referer: referer } : {}),
      },
    });
    if (!res.ok) throw new ExtractionError(`download failed: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "";
    return { buffer: buf, contentType };
  } finally {
    clearTimeout(timer);
  }
}

/* ================= REGISTRIES ================= */

const VIDEO_SITES = Object.freeze({});

/** Best progressive MP4 from a general media result (skip HLS for WhatsApp).
 *  Guards against image URLs that were incorrectly labelled as MP4. */
function bestMp4(info) {
  const urls = (info && info.direct_urls) || [];
  const mp4s = urls.filter(
    (e) => e.ext === "mp4" && !/\.(jpe?g|png|gif|webp|bmp|avif)(\?|#|$)/i.test(e.url.split("?")[0])
  );
  if (mp4s.length) { sortByQualityDesc(mp4s); return mp4s[0]; }
  return null;
}

/** Playable (non-image) direct URLs for the links-fallback message. */
function playableUrls(info) {
  const urls = (info && info.direct_urls) || [];
  return urls.filter(
    (e) => ["mp4", "webm", "m3u8", "mpd"].includes(e.ext) &&
      !/\.(jpe?g|png|gif|webp|bmp|avif)(\?|#|$)/i.test(e.url.split("?")[0])
  );
}

module.exports = {
  ExtractionError,
  VIDEO_SITES: Object.freeze({}),
  fmtDur,
  bestMp4,
  playableUrls,
  downloadBuffer,
  webtoonSearchSeries,
  webtoonListEpisodes,
  webtoonEpisodeImages,
  tapasSearchSeries,
  tapasListEpisodes,
  tapasEpisodeImages,
};
