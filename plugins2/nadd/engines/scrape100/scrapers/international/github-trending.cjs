"use strict";
// GitHub Trending adapter — transport: http (single public page fetch, no auth)
// Verified live 2026-10-05: https://github.com/trending returns 200 with
// article.Box-row cards. Polite: one page per call, 1s+ delay between calls.
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
        headers: { "User-Agent": USER_AGENT, Accept: "text/html", ...headers },
        signal: ctl.signal,
        redirect: "follow",
      });
      clearTimeout(timer);
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        lastErr = new Error("HTTP " + res.status + " for " + url);
        await sleep(1500 * Math.pow(2, i));
        continue;
      }
      if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
      return await res.text();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (err.message && err.message.startsWith("HTTP")) throw err;
      await sleep(1500 * Math.pow(2, i));
    }
  }
  throw lastErr;
}

function parseCompactNumber(str) {
  if (!str) return null;
  const m = String(str).trim().replace(/,/g, "").match(/^([\d.]+)\s*([kKmM]?)/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  const suf = m[2].toLowerCase();
  if (suf === "k") n *= 1000;
  else if (suf === "m") n *= 1000000;
  return Math.round(n);
}

function canonicalize(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid)/i.test(k)) u.searchParams.delete(k);
    }
    return u.toString();
  } catch {
    return url;
  }
}

function repoNameFromUrl(url) {
  try {
    const p = new URL(url).pathname.replace(/^\/+|\/+$/g, "");
    const parts = p.split("/");
    return parts.length >= 2 ? parts[0] + "/" + parts[1] : p;
  } catch {
    return url;
  }
}

// raw: { row: cheerio element, $, timeframe }
function normalize(raw) {
  const { row, $, timeframe } = raw;
  const r = $(row);
  const href = r.find("h2 a").attr("href") || "";
  const url = canonicalize("https://github.com" + href);
  const fullName = repoNameFromUrl(url);
  const owner = fullName.split("/")[0] || null;
  const lang = r.find("span[itemprop=programmingLanguage]").first().text().trim() || null;
  const muted = r.find("a.Link--muted");
  const stars = parseCompactNumber(muted.eq(0).text());
  const forks = parseCompactNumber(muted.eq(1).text());
  const metaText = r.find("div.f6").text().replace(/\s+/g, " ").trim();
  const todayMatch = metaText.match(/([\d,.]+)\s+stars?\s+(today|this week|this month)/i);
  return {
    source: "github-trending",
    category: "trending",
    title: fullName,
    description: r.find("p.col-9").first().text().trim() || null,
    url,
    image: null,
    author: owner,
    publishedAt: null,
    language: "en",
    tags: [timeframe || "daily", ...(lang ? [lang] : [])],
    metadata: {
      stars,
      forks,
      downloads: null,
      likes: null,
      language: lang,
      starsGained: todayMatch ? parseCompactNumber(todayMatch[1]) : null,
      starsGainedPeriod: todayMatch ? todayMatch[2] : null,
    },
    scrapedAt: new Date().toISOString(),
  };
}

async function latest(opts = {}) {
  const limit = Math.min(opts.limit || 30, 30);
  const timeframe = ["daily", "weekly", "monthly"].includes(opts.timeframe) ? opts.timeframe : "daily";
  const since = timeframe === "daily" ? "daily" : timeframe === "weekly" ? "weekly" : "monthly";
  const qs = new URLSearchParams({ since });
  if (opts.language) qs.set("l", String(opts.language));
  const url = "https://github.com/trending?" + qs.toString();
  const html = await fetchWithRetry(url);
  const $ = cheerio.load(html);
  const seen = new Set();
  const out = [];
  $("article.Box-row").each((i, el) => {
    const rec = normalize({ row: el, $, timeframe });
    if (!rec.url || seen.has(rec.url)) return;
    seen.add(rec.url);
    out.push(rec);
    if (out.length >= limit) return false;
  });
  await sleep(1500); // polite delay for GitHub
  return out;
}

async function search(query, opts = {}) {
  if (!query || !query.trim()) return [];
  const limit = Math.min(opts.limit || 15, 30);
  const qs = new URLSearchParams({ q: query.trim(), type: "repositories" });
  const url = "https://github.com/search?" + qs.toString();
  const html = await fetchWithRetry(url);
  const $ = cheerio.load(html);
  const seen = new Set();
  const out = [];
  $("div[data-testid=results-list] > div").each((i, el) => {
    const e = $(el);
    const href = e.find("a").first().attr("href") || "";
    if (!/^\/[^/]+\/[^/]+$/.test(href)) return;
    const repoUrl = canonicalize("https://github.com" + href);
    if (seen.has(repoUrl)) return;
    seen.add(repoUrl);
    const title = e.find("a").first().text().replace(/\s+/g, " ").trim();
    const descEl = e.find("p, div").filter((j, x) => $(x).text().trim().length > 20).first();
    out.push({
      source: "github-trending",
      category: "trending",
      title: title || repoNameFromUrl(repoUrl),
      description: descEl.text().trim().slice(0, 300) || null,
      url: repoUrl,
      image: null,
      author: repoNameFromUrl(repoUrl).split("/")[0],
      publishedAt: null,
      language: "en",
      tags: ["search"],
      metadata: { stars: null, forks: null, downloads: null, likes: null },
      scrapedAt: new Date().toISOString(),
    });
    if (out.length >= limit) return false;
  });
  await sleep(1500);
  return out;
}

async function scrape(url, opts = {}) {
  const repoUrl = canonicalize(String(url));
  const html = await fetchWithRetry(repoUrl, { headers: { Accept: "text/html" } });
  const $ = cheerio.load(html);
  const og = (p) => $(`meta[property="${p}"]`).attr("content") || null;
  const fullName = repoNameFromUrl(repoUrl);
  const embeddedStars = html.match(/"stargazerCount":(\d+)/);
  const forkText = $('a[href$="/forks"] strong, a[href$="/network/members"] strong').first().text().trim();
  const topics = [];
  $('a[href^="/topics/"]').each((i, el) => {
    const t = $(el).text().trim();
    if (t && topics.length < 10) topics.push(t);
  });
  return {
    source: "github-trending",
    category: "trending",
    title: fullName,
    description: og("og:description") || null,
    url: repoUrl,
    image: og("og:image") || null,
    author: fullName.split("/")[0] || null,
    publishedAt: null,
    language: "en",
    tags: topics,
    metadata: {
      stars: embeddedStars ? parseInt(embeddedStars[1], 10) : null,
      forks: parseCompactNumber(forkText),
      downloads: null,
      likes: null,
    },
    scrapedAt: new Date().toISOString(),
  };
}

module.exports = {
  id: "github-trending",
  name: "GitHub Trending",
  country: "INT",
  category: "trending",
  baseUrl: "https://github.com/trending",
  language: "en",
  enabled: true,
  priority: 69,
  transport: "http",
  providerRequiredReason: null,
  rateLimit: { delayMs: 1500 },
  limits: { maxPages: 1, maxResults: 30 },
  endpoints: {
    latest: "https://github.com/trending?since={daily|weekly|monthly}&l={language}",
    search: "https://github.com/search?q={query}&type=repositories",
  },
  selectors: {
    // Verified: article.Box-row rows; h2 a[@href] repo path; p.col-9 description;
    // span[itemprop=programmingLanguage]; a.Link--muted[0] stars, [1] forks;
    // div.f6 meta text ("N stars today"). Search: div[data-testid=results-list] > div.
    // Repo page: og:title/og:description/og:image, embedded "stargazerCount",
    // a[href$="/forks"] strong, a[href^="/topics/"].
  },
  schedule: { frequency: "medium" },
  latest,
  search,
  scrape,
  normalize,
};
