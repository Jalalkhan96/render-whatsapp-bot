"use strict";
// Hugging Face adapter — transport: api (public Hub API, no key required)
// Verified live 2026-10-05:
//   https://huggingface.co/api/models?sort=likes&direction=-1&limit=3 -> JSON
//   https://huggingface.co/api/datasets?sort=likes&direction=-1&limit=1 -> JSON
const cheerio = require("cheerio"); // available per contract; JSON API needs no DOM parsing

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, { timeoutMs = 25000, attempts = 3 } = {}) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
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

// raw: { item, kind: "model" | "dataset" }
function normalize(raw) {
  const { item, kind } = raw;
  const pageUrl =
    kind === "dataset"
      ? "https://huggingface.co/datasets/" + item.id
      : "https://huggingface.co/" + item.id;
  const owner = item.id.includes("/") ? item.id.split("/")[0] : item.author || null;
  const tags = Array.isArray(item.tags) ? item.tags.slice(0, 12) : [];
  return {
    source: "huggingface",
    category: "trending",
    title: item.id,
    description: item.description || item.cardData?.description || null,
    url: pageUrl,
    image: null,
    author: owner,
    publishedAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
    language: "en",
    tags: [kind, ...tags],
    metadata: {
      stars: null,
      forks: null,
      downloads: typeof item.downloads === "number" ? item.downloads : null,
      likes: typeof item.likes === "number" ? item.likes : null,
      kind,
      pipelineTag: item.pipeline_tag || null,
      library: item.library_name || null,
    },
    scrapedAt: new Date().toISOString(),
  };
}

async function fetchList(kind, params, limit) {
  const qs = new URLSearchParams({
    sort: "likes",
    direction: "-1",
    limit: String(Math.min(limit, 100)),
    ...params,
  });
  const url = "https://huggingface.co/api/" + (kind === "dataset" ? "datasets" : "models") + "?" + qs.toString();
  const body = await fetchWithRetry(url);
  const items = JSON.parse(body);
  return Array.isArray(items) ? items : [];
}

async function latest(opts = {}) {
  const limit = Math.min(opts.limit || 30, 30);
  const kind = opts.type === "datasets" || opts.type === "dataset" ? "dataset" : "model";
  const params = {};
  if (opts.language && kind === "model") params.filter = opts.language; // e.g. language:en
  const seen = new Set();
  const out = [];
  const items = await fetchList(kind, params, limit);
  for (const item of items) {
    if (!item || !item.id) continue;
    const rec = normalize({ item, kind });
    if (seen.has(rec.url)) continue;
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
  const kind = opts.type === "datasets" || opts.type === "dataset" ? "dataset" : "model";
  const seen = new Set();
  const out = [];
  const items = await fetchList(kind, { search: query.trim() }, limit);
  for (const item of items) {
    if (!item || !item.id) continue;
    const rec = normalize({ item, kind });
    if (seen.has(rec.url)) continue;
    seen.add(rec.url);
    out.push(rec);
    if (out.length >= limit) break;
  }
  await sleep(1000);
  return out;
}

async function scrape(url, opts = {}) {
  const m = String(url).match(/huggingface\.co\/(?:datasets\/)?([^/?#]+(?:\/[^/?#]+)?)/);
  if (!m) throw new Error("Not a Hugging Face URL: " + url);
  const id = m[1];
  const isDataset = /\/datasets\//.test(String(url));
  const apiUrl = "https://huggingface.co/api/" + (isDataset ? "datasets/" : "models/") + id;
  const body = await fetchWithRetry(apiUrl);
  const item = JSON.parse(body);
  if (!item || !item.id) throw new Error("Model/dataset not found: " + url);
  return normalize({ item, kind: isDataset ? "dataset" : "model" });
}

module.exports = {
  id: "huggingface",
  name: "Hugging Face",
  country: "INT",
  category: "ai",
  baseUrl: "https://huggingface.co/",
  language: "en",
  enabled: true,
  priority: 70,
  transport: "api",
  providerRequiredReason: null,
  rateLimit: { delayMs: 1000 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    latestModels: "https://huggingface.co/api/models?sort=likes&direction=-1&limit={n}",
    latestDatasets: "https://huggingface.co/api/datasets?sort=likes&direction=-1&limit={n}",
    searchModels: "https://huggingface.co/api/models?search={query}&sort=likes&direction=-1&limit={n}",
    modelDetail: "https://huggingface.co/api/models/{id}",
  },
  selectors: {
    // JSON API fields (verified): id, likes, downloads, tags[], pipeline_tag,
    // library_name, createdAt, modelId, author, description, lastModified (datasets)
  },
  schedule: { frequency: "medium" },
  latest,
  search,
  scrape,
  normalize,
};
