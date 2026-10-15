"use strict";
// 9to5Google adapter — transport: rss (official RSS 2.0 feed); search via public
// WordPress JSON search endpoint.
// Verified live 2026-10-05: https://9to5google.com/feed/ (RSS 2.0) and
// https://9to5google.com/wp-json/wp/v2/search?search={q} both return 200.
const cheerio = require("cheerio");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FEED_URL = "https://9to5google.com/feed/";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, { timeoutMs = 25000, headers = {}, attempts = 3 } = {}) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/xml, application/json, */*", ...headers },
        signal: ctl.signal,
        redirect: "follow",
      });
      clearTimeout(timer);
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        lastErr = new Error("HTTP " + res.status + " for " + url);
        await sleep(1000 * Math.pow(2, i));
        continue;
      }
      if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
      return await res.text();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (err.message && err.message.startsWith("HTTP")) throw err;
      await sleep(1000 * Math.pow(2, i));
    }
  }
  throw lastErr;
}

function stripHtml(html) {
  if (!html) return "";
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  return $.root().text().replace(/\s+/g, " ").trim();
}

function canonicalize(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|igshid)/i.test(k)) u.searchParams.delete(k);
    }
    return u.toString();
  } catch {
    return url;
  }
}

function firstImage(html) {
  if (!html) return null;
  const m = html.match(/<img[^>]+src="([^"]+)"/i);
  return m ? m[1].replace(/&amp;/g, "&") : null;
}

function decodeEntities(str) {
  if (!str) return "";
  return cheerio.load("<div>" + str + "</div>")("div").text();
}

function normalize(raw) {
  const { item, $ } = raw;
  const e = $(item);
  const cats = [];
  e.find("category").each((i, c) => {
    const t = $(c).text().trim();
    if (t) cats.push(t);
  });
  const desc = e.find("description").text() || "";
  return {
    source: "9to5google",
    sourceUrl: "https://9to5google.com/",
    category: cats[0] || "technology",
    title: decodeEntities(e.find("title").text()).trim(),
    description: stripHtml(desc).slice(0, 500),
    content: undefined,
    url: canonicalize(e.find("link").text().trim()),
    image: firstImage(desc),
    author: e.find("dc\\:creator").text().trim() || null,
    publishedAt: e.find("pubDate").text() ? new Date(e.find("pubDate").text()).toISOString() : null,
    updatedAt: null,
    country: "INT",
    language: "en",
    tags: cats,
    metadata: {},
    scrapedAt: new Date().toISOString(),
  };
}

async function fetchItems() {
  const xml = await fetchWithRetry(FEED_URL);
  const $ = cheerio.load(xml, { xml: true });
  return { $, items: $("item").toArray() };
}

async function latest(opts = {}) {
  const limit = Math.min(opts.limit || 30, 30);
  const { $, items } = await fetchItems();
  const seen = new Set();
  const out = [];
  for (const el of items) {
    const rec = normalize({ item: el, $ });
    if (!rec.url || seen.has(rec.url)) continue;
    seen.add(rec.url);
    out.push(rec);
    if (out.length >= limit) break;
  }
  await sleep(1000);
  return out;
}

async function search(query, opts = {}) {
  if (!query || !query.trim()) return [];
  const limit = Math.min(opts.limit || 15, 30);
  // Prefer the official WP search API (verified); fall back to feed filtering.
  try {
    const qs = new URLSearchParams({ search: query.trim(), per_page: String(limit) });
    const body = await fetchWithRetry("https://9to5google.com/wp-json/wp/v2/search?" + qs.toString());
    const results = JSON.parse(body);
    const seen = new Set();
    const out = [];
    for (const r of Array.isArray(results) ? results : []) {
      if (r.type !== "post") continue;
      const rec = {
        source: "9to5google",
        sourceUrl: "https://9to5google.com/",
        category: "technology",
        title: decodeEntities(r.title).trim(),
        description: null,
        content: undefined,
        url: canonicalize(r.url),
        image: null,
        author: null,
        publishedAt: null,
        updatedAt: null,
        country: "INT",
        language: "en",
        tags: [],
        metadata: { subtype: r.subtype, wpId: r.id },
        scrapedAt: new Date().toISOString(),
      };
      if (!rec.url || seen.has(rec.url)) continue;
      seen.add(rec.url);
      out.push(rec);
      if (out.length >= limit) break;
    }
    await sleep(1000);
    return out;
  } catch {
    // fall through to feed filter
  }
  const q = query.trim().toLowerCase();
  const { $, items } = await fetchItems();
  const seen = new Set();
  const out = [];
  for (const el of items) {
    const rec = normalize({ item: el, $ });
    const hay = (rec.title + " " + rec.description).toLowerCase();
    if (!hay.includes(q)) continue;
    if (!rec.url || seen.has(rec.url)) continue;
    seen.add(rec.url);
    out.push(rec);
    if (out.length >= limit) break;
  }
  await sleep(1000);
  return out;
}

async function scrape(url, opts = {}) {
  const html = await fetchWithRetry(String(url), { headers: { Accept: "text/html" } });
  const $ = cheerio.load(html);
  let ld = null;
  $('script[type="application/ld+json"]').each((i, el) => {
    try {
      const d = JSON.parse($(el).text());
      const graph = Array.isArray(d) ? d : d["@graph"] ? d["@graph"] : [d];
      const art = graph.find((x) => x && /NewsArticle|Article/.test(x["@type"] || ""));
      if (art) ld = art;
    } catch {}
  });
  const og = (p) => $(`meta[property="${p}"]`).attr("content") || null;
  const paras = [];
  $("article p, .post-content p, .entry-content p").each((i, el) => {
    const t = $(el).text().trim();
    if (t.length > 40) paras.push(t);
  });
  return {
    source: "9to5google",
    sourceUrl: "https://9to5google.com/",
    category: "technology",
    title: (ld && ld.headline) || og("og:title") || $("h1").first().text().trim() || null,
    description: og("og:description") || (ld && ld.description) || null,
    content: paras.length ? paras.join("\n\n") : null,
    url: canonicalize(og("og:url") || String(url)),
    image: og("og:image"),
    author:
      (ld && ld.author && (Array.isArray(ld.author) ? ld.author.map((a) => a.name).filter(Boolean).join(", ") : ld.author.name)) ||
      null,
    publishedAt: (ld && ld.datePublished && new Date(ld.datePublished).toISOString()) || null,
    updatedAt: (ld && ld.dateModified && new Date(ld.dateModified).toISOString()) || null,
    country: "INT",
    language: "en",
    tags: [],
    metadata: {},
    scrapedAt: new Date().toISOString(),
  };
}

module.exports = {
  id: "9to5google",
  name: "9to5Google",
  country: "INT",
  category: "technology",
  baseUrl: "https://9to5google.com/",
  language: "en",
  enabled: true,
  priority: 66,
  transport: "rss",
  providerRequiredReason: null,
  rateLimit: { delayMs: 1000 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    latest: "https://9to5google.com/feed/",
    search: "https://9to5google.com/wp-json/wp/v2/search?search={query}&per_page={n}",
  },
  selectors: {
    // RSS 2.0 (verified): item > title, link, dc:creator, pubDate, category[],
    // description (contains first <img>), post-id. Search via WP JSON fields:
    // title, url, type, subtype, id.
  },
  schedule: { frequency: "medium" },
  latest,
  search,
  scrape,
  normalize,
};
