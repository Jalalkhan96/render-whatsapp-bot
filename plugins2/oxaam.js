'use strict';

/**
 * ABIX OXAAM PUBLIC WEB SCRAPER — NO API
 *
 * Flat plugin for /home/container/plugins2/oxaam.js
 *
 * Commands:
 *   -oxammenu
 *   -oxaam <public-path-or-url>
 *   -oxaamsearch <query>
 *   -oxaamsites
 *   -oxaamservices
 *   -oxaamlinks
 *   -oxaamlogin
 *   -oxaamcrawl [limit]
 *   -oxaamdump [limit]
 *   -oxaamstatus
 *
 * Public-data scope only:
 *   - crawls public same-origin pages
 *   - extracts visible text, titles, headings, metadata, links, images,
 *     JSON-LD, article metadata, public forms and public service labels
 *   - never submits login/register/password forms
 *   - never reads browser cookies, sessions, tokens or stored credentials
 *   - skips obvious private/admin/API endpoints
 *
 * Node.js 20+; uses the project's existing cheerio dependency if available,
 * otherwise falls back to a lightweight HTML parser.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const SITE = 'https://www.oxaam.com/';
const HOST = 'www.oxaam.com';
const TMP_DIR = path.join(os.tmpdir(), 'abix-oxaam');
const MAX_PAGES = envInt('OXAAM_MAX_PAGES', 1, 500, 100);
const MAX_RESULTS = envInt('OXAAM_MAX_RESULTS', 1, 25, 8);
const MAX_BYTES = envInt('OXAAM_MAX_PAGE_BYTES', 100 * 1024, 12 * 1024 * 1024, 4 * 1024 * 1024);
const TIMEOUT_MS = envInt('OXAAM_TIMEOUT_MS', 5000, 45000, 15000);
const DELAY_MS = envInt('OXAAM_DELAY_MS', 250, 10000, 700);
const COOLDOWN_MS = envInt('OXAAM_COOLDOWN_MS', 2000, 60000, 5000);
const CRAWL_CONCURRENCY = envInt('OXAAM_CONCURRENCY', 1, 5, 2);

const UA = process.env.OXAAM_USER_AGENT ||
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/154 Safari/537.36 ABIX-Oxaam-PublicCrawler/1.0';

const PRIVATE_PATH_RE = [
  /(^|\/)admin(?:\/|$)/i,
  /(^|\/)dashboard(?:\/|$)/i,
  /(^|\/)account(?:\/|$)/i,
  /(^|\/)profile(?:\/|$)/i,
  /(^|\/)settings(?:\/|$)/i,
  /(^|\/)api(?:\/|$)/i,
  /(^|\/)ajax(?:\/|$)/i,
  /logout/i,
  /reset[-_]?password/i,
  /forgot[-_]?password/i,
  /token/i,
  /session/i,
  /wp-admin/i,
  /wp-login/i
];

const AUTH_PUBLIC_PATHS = new Set(['/login.php', '/register.php', '/forgot_password.php', '/freeservice.php']);
const cache = new Map();
const lastRun = new Map();
const robotsCache = { loaded: false, disallow: [] };

let cheerio = null;
try { cheerio = require('cheerio'); } catch (_) {}

function envInt(name, min, max, fallback) {
  const n = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function clean(v) { return String(v ?? '').replace(/\s+/g, ' ').trim(); }
function unique(arr) { return [...new Set(arr.filter(Boolean))]; }
function clampText(v, max = 12000) { const s = clean(v); return s.length > max ? s.slice(0, max) + '…' : s; }

function isHttp(url) {
  try { const u = new URL(url); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch { return false; }
}

function normalizeUrl(raw, base = SITE) {
  try {
    let value = String(raw || '').trim();
    if (!value || /^(javascript:|mailto:|tel:|data:|#)/i.test(value)) return null;
    value = value.replace(/&amp;/gi, '&').replace(/\\/g, '');
    const u = new URL(value, base);
    if (!isHttp(u.href)) return null;
    u.hash = '';
    u.username = '';
    u.password = '';
    if (u.hostname === 'oxaam.com') u.hostname = HOST;
    return u.href;
  } catch { return null; }
}

function isSameOrigin(url) {
  try {
    const u = new URL(url);
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname === HOST;
  } catch { return false; }
}

function pathname(url) {
  try { return new URL(url).pathname || '/'; } catch { return ''; }
}

function isPublicCandidate(url) {
  if (!isHttp(url) || !isSameOrigin(url)) return false;
  const p = pathname(url);
  if (AUTH_PUBLIC_PATHS.has(p)) return true;
  return !PRIVATE_PATH_RE.some(re => re.test(p));
}

function decodeHtml(s) {
  return String(s || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function parseHtmlBasic(html, baseUrl) {
  const title = clean((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [,''])[1]);
  const description = clean((html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([\s\S]*?)["']/i) || [,''])[1]);
  const headings = [];
  for (const m of html.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)) headings.push(clean(stripTags(m[2])));
  const links = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const u = normalizeUrl(m[1], baseUrl); if (u) links.push({ url: u, text: clean(stripTags(m[2])) });
  }
  const forms = [];
  for (const fm of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const attrs = fm[1] || '';
    const body = fm[2] || '';
    const action = (attrs.match(/\baction=["']([^"']+)["']/i) || [,''])[1];
    const method = clean((attrs.match(/\bmethod=["']([^"']+)["']/i) || [,'GET'])[1]).toUpperCase();
    const fields = [];
    for (const im of body.matchAll(/<(input|select|textarea|button)\b([^>]*)>/gi)) {
      const a = im[2] || '';
      fields.push({
        tag: im[1].toLowerCase(),
        type: clean((a.match(/\btype=["']([^"']+)["']/i) || [,''])[1]).toLowerCase(),
        name: clean((a.match(/\bname=["']([^"']*)["']/i) || [,''])[1]),
        placeholder: clean((a.match(/\bplaceholder=["']([^"']*)["']/i) || [,''])[1])
      });
    }
    forms.push({ action: normalizeUrl(action, baseUrl), method, fields });
  }
  const images = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = (tag.match(/\b(?:src|data-src|data-lazy-src)=["']([^"']+)["']/i) || [,''])[1];
    const alt = clean((tag.match(/\balt=["']([^"']*)["']/i) || [,''])[1]);
    const u = normalizeUrl(src, baseUrl); if (u) images.push({ url: u, alt });
  }
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  text = stripTags(text);
  return { title, description, headings: unique(headings), links, images, text: clampText(text, 16000), meta: {}, jsonLd: [], forms };
}

function stripTags(s) {
  return decodeHtml(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function parseHtml(html, baseUrl) {
  if (!cheerio) return parseHtmlBasic(html, baseUrl);
  const $ = cheerio.load(html, { decodeEntities: true });
  const title = clean($('title').first().text());
  const description = clean($('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '');
  const headings = [];
  $('h1,h2,h3,h4,h5,h6').each((_, el) => { const t = clean($(el).text()); if (t) headings.push(t); });
  const links = [];
  $('a[href]').each((_, el) => {
    const u = normalizeUrl($(el).attr('href'), baseUrl);
    if (u) links.push({ url: u, text: clean($(el).text()), rel: clean($(el).attr('rel') || '') });
  });
  const images = [];
  $('img').each((_, el) => {
    const raw = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
    const u = normalizeUrl(raw, baseUrl);
    if (u) images.push({ url: u, alt: clean($(el).attr('alt') || '') });
  });
  const meta = {};
  $('meta[name],meta[property]').each((_, el) => {
    const key = $(el).attr('name') || $(el).attr('property');
    const value = clean($(el).attr('content') || '');
    if (key && value && !/password|token|secret|cookie|authorization/i.test(key)) meta[key] = value;
  });
  const jsonLd = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) jsonLd.push(...parsed.slice(0, 20));
      else if (parsed && typeof parsed === 'object') jsonLd.push(parsed);
    } catch (_) {}
  });
  const forms = [];
  $('form').each((_, form) => {
    const fields = [];
    $(form).find('input,select,textarea,button').each((__, el) => {
      const type = clean($(el).attr('type') || el.name || el.tagName || '').toLowerCase();
      const name = clean($(el).attr('name') || '');
      const placeholder = clean($(el).attr('placeholder') || '');
      // Store structure, never values/entered credentials.
      fields.push({ tag: String(el.tagName || '').toLowerCase(), type, name, placeholder });
    });
    forms.push({ action: normalizeUrl($(form).attr('action') || '', baseUrl), method: clean($(form).attr('method') || 'GET').toUpperCase(), fields });
  });
  const bodyText = clampText($('body').text(), 24000);
  return {
    title,
    description,
    headings: unique(headings),
    links,
    images,
    text: bodyText,
    meta,
    jsonLd: jsonLd.slice(0, 30),
    forms
  };
}

async function fetchPublic(url) {
  const normalized = normalizeUrl(url);
  if (!normalized || !isPublicCandidate(normalized)) throw new Error('URL is outside the allowed public Oxaam scope');
  const cached = cache.get(normalized);
  if (cached && Date.now() - cached.time < 60_000) return cached.data;

  const response = await fetch(normalized, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.8'
    },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('text/html') && !type.includes('application/xhtml+xml') && !type.includes('xml')) {
    return { url: normalized, status: response.status, contentType: type, title: '', description: '', headings: [], links: [], images: [], text: '', meta: {}, jsonLd: [], forms: [] };
  }
  const len = Number(response.headers.get('content-length') || 0);
  if (len > MAX_BYTES) throw new Error('Page exceeds configured size limit');
  const html = await response.text();
  if (Buffer.byteLength(html, 'utf8') > MAX_BYTES) throw new Error('Page exceeds configured size limit');
  const data = { url: normalized, status: response.status, contentType: type, ...parseHtml(html, response.url || normalized) };
  cache.set(normalized, { time: Date.now(), data });
  return data;
}

async function loadRobots() {
  if (robotsCache.loaded) return robotsCache.disallow;
  robotsCache.loaded = true;
  try {
    const r = await fetch(new URL('/robots.txt', SITE), { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    const text = await r.text();
    let active = false;
    const out = [];
    for (const lineRaw of text.split(/\r?\n/)) {
      const line = lineRaw.split('#')[0].trim();
      if (!line) continue;
      const [kRaw, vRaw] = line.split(':');
      const k = String(kRaw || '').trim().toLowerCase();
      const v = String(vRaw || '').trim();
      if (k === 'user-agent') active = v === '*' || /ABIX-Oxaam-PublicCrawler/i.test(v);
      else if (active && k === 'disallow' && v) out.push(v);
    }
    robotsCache.disallow = out;
    return out;
  } catch { return []; }
}

function robotsAllows(url, disallow) {
  const p = pathname(url);
  return !disallow.some(rule => rule && p.startsWith(rule));
}

function extractServiceNames(page) {
  const labels = [];
  const add = x => {
    const s = clean(x);
    if (!s || s.length < 2 || s.length > 120) return;
    if (/^(home|login|register|read more|learn more|sign in|sign up|forgot password|contact|privacy|terms)$/i.test(s)) return;
    labels.push(s);
  };
  for (const h of page.headings || []) add(h);
  for (const l of page.links || []) add(l.text);
  for (const ld of page.jsonLd || []) {
    if (!ld || typeof ld !== 'object') continue;
    for (const key of ['name','headline','brand']) add(ld[key]?.name || ld[key]);
  }
  return unique(labels);
}

function extractExternalSites(page) {
  const domains = [];
  for (const l of page.links || []) {
    try {
      const u = new URL(l.url);
      if (u.hostname !== HOST && !u.hostname.endsWith('.' + HOST)) domains.push({ domain: u.hostname, url: u.origin, text: l.text });
    } catch (_) {}
  }
  const map = new Map();
  for (const x of domains) if (!map.has(x.domain)) map.set(x.domain, x);
  return [...map.values()];
}

function looksLikeArticle(url, page) {
  const p = pathname(url);
  return /\/articles?\//i.test(p) || /\/article\//i.test(p) || /article/i.test(page?.jsonLd?.[0]?.['@type'] || '') || /Article/i.test(String(page?.jsonLd?.[0]?.['@type'] || ''));
}

async function crawl(startUrl = SITE, limit = MAX_PAGES) {
  const disallow = await loadRobots();
  const max = Math.min(MAX_PAGES, Math.max(1, Number(limit) || MAX_PAGES));
  const queue = [normalizeUrl(startUrl) || SITE];
  const seen = new Set();
  const pages = [];
  const errors = [];

  while (queue.length && pages.length < max) {
    const batch = [];
    while (queue.length && batch.length < CRAWL_CONCURRENCY && pages.length + batch.length < max) {
      const url = queue.shift();
      if (!url || seen.has(url) || !isPublicCandidate(url) || !robotsAllows(url, disallow)) continue;
      seen.add(url); batch.push(url);
    }
    if (!batch.length) break;
    const results = await Promise.all(batch.map(async url => {
      try { return { ok: true, page: await fetchPublic(url) }; }
      catch (e) { return { ok: false, url, error: e.message }; }
    }));
    for (const result of results) {
      if (!result.ok) { errors.push(result); continue; }
      const page = result.page;
      pages.push({
        url: page.url,
        status: page.status,
        title: page.title,
        description: page.description,
        headings: page.headings,
        text: page.text,
        images: page.images,
        links: page.links,
        externalSites: extractExternalSites(page),
        serviceNames: extractServiceNames(page),
        article: looksLikeArticle(page.url, page),
        forms: page.forms,
        jsonLd: page.jsonLd,
        meta: page.meta
      });
      for (const l of page.links || []) {
        if (pages.length + queue.length >= max * 2) break;
        if (isPublicCandidate(l.url) && !seen.has(l.url) && robotsAllows(l.url, disallow)) queue.push(l.url);
      }
      await sleep(DELAY_MS);
    }
  }

  return {
    site: SITE,
    startedAt: new Date().toISOString(),
    pageLimit: max,
    pages,
    errors,
    totals: {
      pages: pages.length,
      articles: pages.filter(p => p.article).length,
      images: unique(pages.flatMap(p => (p.images || []).map(i => i.url))).length,
      links: unique(pages.flatMap(p => (p.links || []).map(i => i.url))).length,
      services: unique(pages.flatMap(p => p.serviceNames || [])).length,
      externalSites: unique(pages.flatMap(p => (p.externalSites || []).map(i => i.domain))).length
    }
  };
}

async function searchSite(query, limit = MAX_RESULTS) {
  const data = await crawl(SITE, Math.min(MAX_PAGES, Math.max(20, Math.min(80, limit * 10))));
  const q = clean(query).toLowerCase();
  const scored = data.pages.map(p => {
    const hay = [p.title, p.description, ...(p.headings || []), p.text].join(' ').toLowerCase();
    let score = 0;
    for (const token of q.split(/\s+/).filter(Boolean)) if (hay.includes(token)) score += 1;
    if ((p.title || '').toLowerCase().includes(q)) score += 5;
    return { score, page: p };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(x => x.page);
}

async function publicLoginInfo() {
  const urls = [
    new URL('/login.php', SITE).href,
    new URL('/register.php', SITE).href,
    new URL('/forgot_password.php', SITE).href,
    new URL('/freeservice.php', SITE).href
  ];
  const out = [];
  for (const url of urls) {
    try {
      const page = await fetchPublic(url);
      out.push({
        url: page.url,
        status: page.status,
        title: page.title,
        description: page.description,
        forms: (page.forms || []).map(f => ({ action: f.action, method: f.method, fields: f.fields })) ,
        visibleText: clampText(page.text, 5000)
      });
    } catch (e) { out.push({ url, error: e.message }); }
  }
  return out;
}

async function sendJson(sock, jid, msg, filename, data) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const file = path.join(TMP_DIR, `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${safe}`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  try {
    await sock.sendMessage(jid, { document: fs.readFileSync(file), mimetype: 'application/json', fileName: safe }, { quoted: msg });
  } finally {
    try { fs.unlinkSync(file); } catch (_) {}
  }
}

function menu() {
  return [
    '┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓',
    '┃       🌐 OXAAM PUBLIC HUB     ┃',
    '┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛',
    '',
    '📖 *Public site scraper*',
    '',
    '🔎 -oxaam <url/path>',
    '   Fetch one public Oxaam page',
    '',
    '🔍 -oxaamsearch <query>',
    '   Search discovered public pages',
    '',
    '🌐 -oxaamsites',
    '   Extract linked external site names/domains',
    '',
    '🧰 -oxaamservices',
    '   Extract public service/tool labels',
    '',
    '🔗 -oxaamlinks',
    '   Show important public links',
    '',
    '🔐 -oxaamlogin',
    '   Show public login/register/reset structure',
    '',
    '🕷️ -oxaamcrawl [limit]',
    '   Crawl public same-domain pages',
    '',
    '📦 -oxaamdump [limit]',
    '   Export crawl data as JSON',
    '',
    '❤️ -oxaamstatus',
    '   Check public homepage',
    '',
    '⚠️ Public data only: no passwords, cookies, sessions, tokens, or private dashboards.'
  ].join('\n');
}

function formatPage(page) {
  const lines = [
    `🌐 *${page.title || 'Oxaam page'}*`,
    `🔗 ${page.url}`,
    page.description ? `\n📝 ${clampText(page.description, 1000)}` : '',
    page.headings?.length ? `\n📌 *Headings:*\n${page.headings.slice(0, 12).map((h, i) => `${i + 1}. ${h}`).join('\n')}` : '',
    page.externalSites?.length ? `\n🌎 *External sites:*\n${page.externalSites.slice(0, 12).map(x => `• ${x.domain}${x.text ? ` — ${x.text}` : ''}`).join('\n')}` : '',
    page.serviceNames?.length ? `\n🧰 *Service labels:*\n${page.serviceNames.slice(0, 20).map(x => `• ${x}`).join('\n')}` : '',
    page.text ? `\n📄 *Public text:*\n${clampText(page.text, 5000)}` : ''
  ];
  return lines.filter(Boolean).join('\n');
}

async function run({ sock, message, args = [], context = {} }) {
  const jid = context.chatId || message?.key?.remoteJid;
  if (!jid) return;
  const raw = clean(context.rawText || context.messageText || context.userMessage || '');
  const command = String(context.command || context.commandName || raw.split(/\s+/)[0] || '').replace(/^[.!#$-]+/, '').toLowerCase();
  const now = Date.now();
  const last = lastRun.get(jid) || 0;
  if (now - last < COOLDOWN_MS && command !== 'oxammenu') {
    return sock.sendMessage(jid, { text: '⏳ Please wait a few seconds before another Oxaam scrape.' }, { quoted: message });
  }
  lastRun.set(jid, now);

  try {
    if (command === 'oxammenu' || command === 'oxaammenu') return sock.sendMessage(jid, { text: menu() }, { quoted: message });

    if (command === 'oxaamstatus') {
      const page = await fetchPublic(SITE);
      return sock.sendMessage(jid, { text: `✅ Oxaam public site is reachable.\n\nTitle: ${page.title || 'N/A'}\nStatus: ${page.status}\nPublic links: ${(page.links || []).length}\nImages: ${(page.images || []).length}` }, { quoted: message });
    }

    if (command === 'oxaamlogin') {
      const info = await publicLoginInfo();
      return sendJson(sock, jid, message, 'oxaam-public-login-info.json', { note: 'Public page/form structure only. No credentials or sessions collected.', pages: info });
    }

    if (command === 'oxaamsearch') {
      const query = clean(args.join(' '));
      if (!query) return sock.sendMessage(jid, { text: '⚠️ Usage: -oxaamsearch <query>' }, { quoted: message });
      const pages = await searchSite(query, MAX_RESULTS);
      if (!pages.length) return sock.sendMessage(jid, { text: `❌ No public Oxaam pages matched *${query}*.` }, { quoted: message });
      const text = `🔍 *Oxaam results for:* ${query}\n\n${pages.map((p, i) => `${i + 1}. *${p.title || p.url}*\n${p.url}\n${clampText(p.description || p.text, 500)}`).join('\n\n')}`;
      return sock.sendMessage(jid, { text }, { quoted: message });
    }

    if (command === 'oxaamsites' || command === 'oxaamservices' || command === 'oxaamlinks') {
      const crawlData = await crawl(SITE, Math.min(MAX_PAGES, 40));
      if (command === 'oxaamsites') {
        const sites = unique(crawlData.pages.flatMap(p => (p.externalSites || []).map(x => `${x.domain}${x.text ? ` — ${x.text}` : ''}`)));
        return sock.sendMessage(jid, { text: `🌐 *Public external sites discovered:*\n\n${sites.slice(0, 80).map((x, i) => `${i + 1}. ${x}`).join('\n') || 'None discovered.'}` }, { quoted: message });
      }
      if (command === 'oxaamservices') {
        const services = unique(crawlData.pages.flatMap(p => p.serviceNames || []));
        return sock.sendMessage(jid, { text: `🧰 *Public Oxaam service/tool labels:*\n\n${services.slice(0, 120).map((x, i) => `${i + 1}. ${x}`).join('\n') || 'No service labels discovered in the crawled public pages.'}` }, { quoted: message });
      }
      const links = unique(crawlData.pages.flatMap(p => (p.links || []).map(x => x.url)));
      return sock.sendMessage(jid, { text: `🔗 *Public Oxaam links:*\n\n${links.slice(0, 100).map((x, i) => `${i + 1}. ${x}`).join('\n')}` }, { quoted: message });
    }

    if (command === 'oxaamcrawl' || command === 'oxaamdump') {
      const limit = Math.min(MAX_PAGES, Math.max(1, Number.parseInt(args[0] || '', 10) || 25));
      const data = await crawl(SITE, limit);
      if (command === 'oxaamdump') return sendJson(sock, jid, message, `oxaam-public-${limit}.json`, data);
      return sock.sendMessage(jid, { text: `🕷️ *Oxaam public crawl complete*\n\nPages: ${data.totals.pages}\nArticles: ${data.totals.articles}\nImages: ${data.totals.images}\nLinks: ${data.totals.links}\nServices: ${data.totals.services}\nExternal sites: ${data.totals.externalSites}\nErrors: ${data.errors.length}\n\nUse -oxaamdump ${limit} to receive the JSON export.` }, { quoted: message });
    }

    if (command === 'oxaam') {
      const target = args.join(' ').trim() || '/';
      const url = /^https?:\/\//i.test(target) ? target : new URL(target.startsWith('/') ? target : `/${target}`, SITE).href;
      const page = await fetchPublic(url);
      return sock.sendMessage(jid, { text: formatPage(page) }, { quoted: message });
    }
  } catch (error) {
    console.error('[OXAAM] command error:', error);
    return sock.sendMessage(jid, { text: `❌ Oxaam scraper failed: ${error.message}` }, { quoted: message });
  }
}

module.exports = {
  command: 'oxammenu',
  aliases: ['oxaammenu', 'oxaam', 'oxaamsearch', 'oxaamsites', 'oxaamservices', 'oxaamlinks', 'oxaamlogin', 'oxaamcrawl', 'oxaamdump', 'oxaamstatus'],
  category: 'scraper',
  description: 'Public Oxaam web scraper; no API keys; no credential harvesting',
  handler: run,
  menu,
  // Exported helpers are useful for unit tests and CLI integration.
  public: {
    fetchPublic,
    crawl,
    searchSite,
    publicLoginInfo,
    parseHtml,
    extractServiceNames,
    extractExternalSites
  }
};
