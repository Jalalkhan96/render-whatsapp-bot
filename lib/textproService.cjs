'use strict';

const { TextPro } = require('./textpro.cjs');
const {
  SITE_CONFIGS,
  POPULAR_TEMPLATES,
  NEW_TEMPLATES,
  ALL_TEMPLATES,
  resolveTemplate,
  resolveSiteKey,
  getSiteConfig,
  getSiteTemplates,
  siteKeyForUrl,
  isAllowedEffectUrl,
} = require('./textproCatalog.cjs');

let activeJobs = 0;
const lastStartedByUser = new Map();
const latestCache = new Map();

function numberEnv(name, fallback, min, max) {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
function maxConcurrentJobs() { return numberEnv('TEXT_PRO_MAX_CONCURRENT_JOBS', 2, 1, 6); }
function userCooldownMs() { return numberEnv('TEXT_PRO_USER_COOLDOWN_MS', 7000, 0, 120000); }
function textProEnabled() {
  const value = String(process.env.TEXT_PRO_ENABLED ?? 'true').trim().toLowerCase();
  return !['0', 'false', 'no', 'off', 'disabled'].includes(value);
}

function reserveJob(identity) {
  if (!textProEnabled()) {
    const error = new Error('Text effects are disabled. Set TEXT_PRO_ENABLED=true in .env.');
    error.code = 'TEXT_PRO_DISABLED';
    throw error;
  }
  if (activeJobs >= maxConcurrentJobs()) {
    const error = new Error('The effect generator is busy. Please try again in a moment.');
    error.code = 'TEXT_PRO_BUSY';
    throw error;
  }
  const key = String(identity || 'unknown');
  const now = Date.now();
  const previous = lastStartedByUser.get(key) || 0;
  const remaining = userCooldownMs() - (now - previous);
  if (previous && remaining > 0) {
    const error = new Error(`Please wait ${Math.ceil(remaining / 1000)} second(s) before generating another image.`);
    error.code = 'TEXT_PRO_COOLDOWN';
    throw error;
  }
  lastStartedByUser.set(key, now);
  activeJobs += 1;
  while (lastStartedByUser.size > 10000) {
    const oldest = lastStartedByUser.keys().next().value;
    if (oldest === undefined) break;
    lastStartedByUser.delete(oldest);
  }
  return () => { activeJobs = Math.max(0, activeJobs - 1); };
}

function siteLabel(template) {
  const site = resolveSiteKey(template?.site || template?.url) || siteKeyForUrl(template?.url) || 'textpro';
  return SITE_CONFIGS[site].label;
}

async function generateTextProImage(templateInput, texts, identity, onProgress = null) {
  const template = typeof templateInput === 'string' ? resolveTemplate(templateInput) : templateInput;
  if (!template?.url || !isAllowedEffectUrl(template.url)) {
    throw new Error('Unknown effect template. Supported sites: TextPro.me, Ephoto360 English, and BirthdayCake24.');
  }
  const site = siteKeyForUrl(template.url);
  if (!site) throw new Error('This effect site is not supported.');
  if (!Array.isArray(texts)) texts = [texts];
  texts = texts.map(value => String(value ?? '').trim());
  if (!texts.length || texts.some(value => !value)) throw new Error('Text fields cannot be empty.');
  const maxLength = numberEnv('TEXT_PRO_MAX_TEXT_LENGTH', 240, 20, 1000);
  if (texts.some(value => value.length > maxLength)) throw new Error(`Each text field must be ${maxLength} characters or fewer.`);

  const release = reserveJob(identity);
  try {
    const client = new TextPro((message) => {
      if (process.env.TEXT_PRO_VERBOSE === 'true') console.log(`[Effects:${site}] ${message}`);
      if (typeof onProgress === 'function') { try { onProgress(message); } catch {} }
    });
    const result = await client.generate(template.url, texts, {
      pollMs: numberEnv('TEXT_PRO_POLL_INTERVAL_MS', 3500, 1000, 15000),
      maxPolls: numberEnv('TEXT_PRO_MAX_POLL_ATTEMPTS', 10, 1, 20),
    });
    const buffer = await client.downloadBuffer(result.imageUrl);
    return { ...result, buffer, template, site, siteLabel: SITE_CONFIGS[site].label };
  } finally {
    release();
  }
}

function niceSlug(url) {
  try { return new URL(url).pathname.split('/').pop().replace(/\.html?$/i, '').replace(/-\d+$/, '').replace(/-/g, ' '); }
  catch { return 'Text effect'; }
}

function normalizedDynamicTemplate(item, siteKey, index, group) {
  const url = String(item?.url || '');
  if (!isAllowedEffectUrl(url) || siteKeyForUrl(url) !== siteKey) return null;
  const known = ALL_TEMPLATES.find(entry => entry.url === new URL(url).href.replace(/\/$/, ''));
  const slug = new URL(url).pathname.split('/').pop().replace(/\.html?$/i, '');
  const id = (slug.match(/-(\d+)$/) || [])[1];
  return {
    ...(known || {}),
    key: known?.key || `${siteKey}-${group}-${id || index}`,
    command: known?.command || null,
    title: String(item.title || known?.title || niceSlug(url)).slice(0, 140),
    url: new URL(url).href,
    inputs: known?.inputs || 1,
    group,
    site: siteKey,
  };
}

async function getLatestTemplates({ refresh = false, limit = 18, site = 'textpro' } = {}) {
  const siteKey = resolveSiteKey(site) || 'textpro';
  const config = getSiteConfig(siteKey);
  const cacheMs = numberEnv('TEXT_PRO_NEW_CACHE_MS', 10 * 60 * 1000, 0, 24 * 60 * 60 * 1000);
  const cached = latestCache.get(siteKey);
  if (!refresh && cached && Date.now() - cached.savedAt < cacheMs) return cached.value.slice(0, limit);

  try {
    const client = new TextPro();
    const found = await client.listLatest(
      Math.max(1, Math.min(50, limit)), config.baseUrl, config.latestUrl, config.latestHeading,
    );
    const cleaned = [];
    const seen = new Set();
    for (const item of found) {
      const normalized = normalizedDynamicTemplate(item, siteKey, cleaned.length, 'new');
      if (!normalized || seen.has(normalized.url)) continue;
      seen.add(normalized.url);
      cleaned.push(normalized);
      if (cleaned.length >= Math.max(1, Math.min(50, limit))) break;
    }
    if (!cleaned.length) throw new Error('No effect links were found on the current page.');
    latestCache.set(siteKey, { value: cleaned, savedAt: Date.now() });
    return cleaned.slice(0, limit);
  } catch (error) {
    console.warn(`[Effects:${siteKey}] Live latest templates unavailable: ${error.message}`);
    const fallback = getSiteTemplates(siteKey, 'new');
    latestCache.set(siteKey, { value: fallback, savedAt: Date.now() });
    return fallback.slice(0, limit);
  }
}

async function searchTextPro(query, limit = 20, site = 'textpro') {
  const q = String(query || '').trim().slice(0, 100);
  if (!q) throw new Error('Enter a search keyword. Example: /tpsearch neon');
  const siteKey = resolveSiteKey(site) || 'textpro';
  const config = getSiteConfig(siteKey);
  const needle = q.toLowerCase();
  try {
    const client = new TextPro();
    const found = await client.search(q, Math.max(1, Math.min(30, Number(limit) || 20)), config.baseUrl);
    const out = [];
    for (const [index, item] of found.entries()) {
      const normalized = normalizedDynamicTemplate(item, siteKey, index, 'search');
      if (normalized) out.push(normalized);
    }
    if (out.length) return out.slice(0, limit);
  } catch (error) {
    const localMatches = getSiteTemplates(siteKey, 'all').filter(item =>
      `${item.title} ${item.key} ${item.command}`.toLowerCase().includes(needle));
    if (localMatches.length) return localMatches.slice(0, Math.max(1, Math.min(30, Number(limit) || 20)));
    throw error;
  }
  const localMatches = getSiteTemplates(siteKey, 'all').filter(item =>
    `${item.title} ${item.key} ${item.command}`.toLowerCase().includes(needle));
  return localMatches.slice(0, Math.max(1, Math.min(30, Number(limit) || 20)));
}

function status() {
  return {
    enabled: textProEnabled(), activeJobs, maxConcurrentJobs: maxConcurrentJobs(),
    cooldownMs: userCooldownMs(), sites: Object.keys(SITE_CONFIGS),
  };
}

module.exports = {
  generateTextProImage,
  getLatestTemplates,
  searchTextPro,
  status,
  POPULAR_TEMPLATES,
  NEW_TEMPLATES,
  SITE_CONFIGS,
  siteLabel,
};
