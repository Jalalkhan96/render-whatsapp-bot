"use strict";
// TechCrunch adapter — transport: api (official WordPress JSON API)
// Verified live 2026-10-05: https://techcrunch.com/wp-json/wp/v2/posts returns JSON.
// Author note: TechCrunch disables /users and embeds authors only via the `author`
// taxonomy (slug like "cap-anthony-ha"); display names are derived from the slug.
const cheerio = require("cheerio");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, { timeoutMs = 25000, headers = {}, attempts = 3 } = {}) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...headers },
        signal: ctl.signal,
        redirect: "follow",
      });
      clearTimeout(timer);
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        lastErr = new Error("HTTP " + res.status + " for " + url);
        await sleep(1000 * Math.pow(2, i));
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      await sleep(1000 * Math.pow(2, i));
    }
  }
  throw lastErr;
}

function decodeEntities(str) {
  if (!str) return "";
  return cheerio.load("<div>" + str + "</div>")("div").text();
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

// slug "cap-anthony-ha" -> "Anthony Ha"; "cap-kirsten-korosec" -> "Kirsten Korosec"
function authorNameFromSlug(slug) {
  if (!slug) return null;
  const cleaned = slug.replace(/^(cap|guest)-/, "").replace(/-/g, " ");
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase()) || null;
}

function normalize(raw) {
  const emb = raw._embedded || {};
  const terms = ((emb["wp:term"] || []).flat() || []).filter(Boolean);
  const categories = terms.filter((t) => t.taxonomy === "category").map((t) => t.name);
  const tags = terms.filter((t) => t.taxonomy === "post_tag").map((t) => t.name);
  const authorTerm = terms.find((t) => t.taxonomy === "author");
  const media = emb["wp:featuredmedia"] && emb["wp:featuredmedia"][0];
  return {
    source: "techcrunch",
    sourceUrl: "https://techcrunch.com/",
    category: categories[0] || "technology",
    title: decodeEntities(raw.title && raw.title.rendered).trim(),
    description: stripHtml(raw.excerpt && raw.excerpt.rendered),
    content: raw.content && raw.content.rendered ? stripHtml(raw.content.rendered) : undefined,
    url: canonicalize(raw.link),
    image: (media && media.source_url) || null,
    author: authorNameFromSlug(authorTerm && authorTerm.slug),
    publishedAt: raw.date ? new Date(raw.date).toISOString() : null,
    updatedAt: raw.modified ? new Date(raw.modified).toISOString() : null,
    country: "INT",
    language: "en",
    tags: [...categories, ...tags].map(decodeEntities),
    metadata: {
      id: raw.id,
      authorSlug: authorTerm && authorTerm.slug,
      categories,
    },
    scrapedAt: new Date().toISOString(),
  };
}

async function fetchPosts(params, limit) {
  const perPage = Math.min(limit, 100);
  const qs = new URLSearchParams({ per_page: String(perPage), _embed: "1", ...params });
  const url = "https://techcrunch.com/wp-json/wp/v2/posts?" + qs.toString();
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
  const posts = await res.json();
  return Array.isArray(posts) ? posts.slice(0, limit) : [];
}

async function latest(opts = {}) {
  const limit = Math.min(opts.limit || 30, 30);
  const seen = new Set();
  const out = [];
  const posts = await fetchPosts({}, limit);
  for (const p of posts) {
    const rec = normalize(p);
    if (!rec.url || seen.has(rec.url)) continue;
    seen.add(rec.url);
    delete rec.content; // keep latest light; full text comes from scrape()
    out.push(rec);
    if (out.length >= limit) break;
  }
  await sleep(1000); // polite delay
  return out;
}

async function search(query, opts = {}) {
  if (!query || !query.trim()) return [];
  const limit = Math.min(opts.limit || 15, 30);
  const seen = new Set();
  const out = [];
  const posts = await fetchPosts({ search: query.trim() }, limit);
  for (const p of posts) {
    const rec = normalize(p);
    if (!rec.url || seen.has(rec.url)) continue;
    seen.add(rec.url);
    delete rec.content;
    out.push(rec);
    if (out.length >= limit) break;
  }
  await sleep(1000);
  return out;
}

async function scrape(url, opts = {}) {
  const slug = String(url).split("/").filter(Boolean).pop();
  const qs = new URLSearchParams({ slug, _embed: "1" });
  const apiUrl = "https://techcrunch.com/wp-json/wp/v2/posts?" + qs.toString();
  const res = await fetchWithRetry(apiUrl);
  if (!res.ok) throw new Error("HTTP " + res.status + " for " + apiUrl);
  const posts = await res.json();
  if (!Array.isArray(posts) || posts.length === 0) throw new Error("Article not found: " + url);
  return normalize(posts[0]);
}

module.exports = {
  id: "techcrunch",
  name: "TechCrunch",
  country: "INT",
  category: "technology",
  baseUrl: "https://techcrunch.com/",
  language: "en",
  enabled: true,
  priority: 61,
  transport: "api",
  providerRequiredReason: null,
  rateLimit: { delayMs: 1000 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    latest: "https://techcrunch.com/wp-json/wp/v2/posts?per_page={n}&_embed=1",
    search: "https://techcrunch.com/wp-json/wp/v2/posts?search={query}&per_page={n}&_embed=1",
    article: "https://techcrunch.com/wp-json/wp/v2/posts?slug={slug}&_embed=1",
  },
  selectors: {
    // JSON API fields (verified): title.rendered, excerpt.rendered, content.rendered,
    // link, date, modified, _embedded["wp:featuredmedia"][0].source_url,
    // _embedded["wp:term"][] with taxonomy category|post_tag|author
  },
  schedule: { frequency: "medium" },
  latest,
  search,
  scrape,
  normalize,
};
