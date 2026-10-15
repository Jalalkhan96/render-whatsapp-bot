'use strict';
// link-manager: the orchestrator. One URL in -> normalized intelligence object out.
const { normalizeUrl } = require('./url-normalizer');
const { validateUrl } = require('./url-validator');
const { traceRedirects } = require('./redirect-engine');
const { expandWithFallback } = require('./resolver-engine');
const { detectProvider, classify } = require('./shortener-detector');
const { analyze } = require('./destination-analyzer');
const { detectTracking, cleanUrl } = require('./tracking-detector');
const { detectAffiliate } = require('./affiliate/affiliate-detector');
const { assess } = require('./safety-engine');
const { detect: detectMonetized } = require('./security/monetized-detector');
const { get: cacheGet, set: cacheSet } = require('./cache');
const logger = require('./logger');
const { providers, findByDomain, getById } = require('./providers/registry');
const health = require('./health-manager');

const PRIVACY = /token|session|auth|password|secret|key|code|invite/i;

function isPrivateUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    for (const [k] of u.searchParams) if (PRIVACY.test(k)) return true;
    return /reset|verify|invite|login|unsubscribe/i.test(u.pathname);
  } catch (_) { return false; }
}

async function analyzeUrl(input, opts = {}) {
  const started = Date.now();
  const v = validateUrl(input);
  if (!v.valid) return { inputUrl: input, status: 'INVALID_URL', reason: v.reason, scrapedAt: new Date().toISOString() };

  let normalized;
  try { normalized = normalizeUrl(input); } catch (e) { return { inputUrl: input, status: 'INVALID_URL', reason: e.message, scrapedAt: new Date().toISOString() }; }

  const priv = isPrivateUrl(normalized);
  if (!opts.skipCache && !priv) {
    const hit = cacheGet(normalized);
    if (hit) { logger.info('cache hit', { input: new URL(normalized).hostname }); return { ...hit, cached: true }; }
  }
  logger.info('input', { input: new URL(normalized).hostname });

  const detected = detectProvider(normalized);
  const classification = classify(normalized, null);

  // Sequential: generic HTTP resolution first (fast, no third party), then provider fallbacks if asked
  const chain = await expandWithFallback(normalized, {
    providers: opts.providers || ['generic'],
    verify: !!opts.verify,
    traceOpts: opts.traceOpts,
  });

  const trace = chain.attempts.find((a) => a.trace) ? chain.attempts.find((a) => a.trace).trace
    : await traceRedirects(normalized, opts.traceOpts || {});
  const cls = classify(normalized, trace);

  const finalUrl = trace.finalUrl || normalized;
  const advertised = trace.advertisedDestination || null;
  // For click-through interstitials, run intel on the ADVERTISED destination
  // (shown in the page) while honestly reporting that a click is still required.
  const dest = analyze(advertised || finalUrl);
  const safety = assess({ url: (advertised || finalUrl), hopCount: trace.hopCount, tracking: dest.tracking });
  const monetized = detectMonetized(normalized);

  const hops = trace.hops.map((h, i) => ({ hop: i + 1, url: h.url, statusCode: h.statusCode, location: h.location, type: h.type || null }));

  const result = {
    inputUrl: input,
    normalizedUrl: normalized,
    classification: cls.labels,
    provider: { id: detected.provider.id, name: detected.provider.name, confidence: detected.provider.confidence },
    redirects: hops,
    finalDestination: {
      url: dest.destination.url, hostname: dest.destination.hostname,
      domain: dest.destination.domain, scheme: dest.destination.scheme,
      path: dest.destination.path,
    },
    tracking: { detected: dest.tracking.detected, parameters: dest.tracking.parameters },
    affiliate: { detected: dest.affiliate.detected, parameters: dest.affiliate.parameters },
    security: { risk: safety.risk, signals: safety.signals },
    monetized,
    advertisedDestination: advertised,
    interstitialPage: trace.status === 'INTERACTION_REQUIRED' ? finalUrl : null,
    status: trace.status === 'resolved' ? 'resolved'
      : trace.status === 'INTERACTION_REQUIRED' ? 'INTERACTION_REQUIRED'
      : trace.status,
    private: priv,
    scrapedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
  };

  logger.info('complete', { final: dest.destination.hostname, tracking: result.tracking.parameters.length, risk: safety.risk, status: result.status });
  if (!priv) cacheSet(normalized, result);
  return result;
}

// ---- shortening ----
async function shortenWith(url, providerId, opts = {}) {
  const v = validateUrl(url);
  if (!v.valid) return { ok: false, status: 'INVALID_URL', reason: v.reason };
  const normalized = normalizeUrl(url);
  const load = (id) => { try { return require('./shorteners/' + id); } catch (_) { return null; } };
  const order = providerId ? [providerId] : providers.filter((p) => p.type === 'shortener' && p.enabled).map((p) => p.id);
  for (const pid of order) {
    const adapter = load(pid);
    if (!adapter) continue;
    const h = health.get(pid);
    if (h.status === 'inactive') { logger.warn('skipping inactive provider', { provider: pid }); continue; }
    const t0 = Date.now();
    let r;
    try { r = await adapter.shorten(normalized, opts); }
    catch (e) { r = { ok: false, status: 'ERROR', detail: e.message }; }
    health.record(pid, r.ok, Date.now() - t0, r.status === 'AUTH_REQUIRED' ? 'authentication_required' : undefined);
    logger.info(r.ok ? 'shortened' : 'shorten failed', { provider: pid, status: r.status });
    if (r.ok) return { ok: true, provider: pid, shortUrl: r.shortUrl, input: normalized };
    if (r.status === 'AUTH_REQUIRED') continue; // try next provider
    if (opts.stopOnError) return r;
  }
  return { ok: false, status: 'ALL_PROVIDERS_FAILED' };
}

async function autoShorten(url, opts = {}) {
  // free public APIs first (no quota burn), then key-based by health
  const freeFirst = providers.filter((p) => p.type === 'shortener' && p.kind === 'free').map((p) => p.id);
  const rest = providers.filter((p) => p.type === 'shortener' && p.kind !== 'free' && p.kind !== 'expand_only').map((p) => p.id);
  for (const pid of [...freeFirst, ...rest]) {
    const r = await shortenWith(url, pid, opts);
    if (r.ok) return r;
  }
  return { ok: false, status: 'ALL_PROVIDERS_FAILED' };
}

// ---- link preview (small metadata only) ----
async function linkPreview(url) {
  const r = await analyzeUrl(url);
  if (r.status !== 'resolved') return r;
  const { get } = require('./shorteners/_base');
  let title = null, description = null, image = null;
  try {
    const page = await get(r.finalDestination.url);
    const html = (page.text || '').slice(0, 65536);
    const pick = (re) => { const m = html.match(re); return m ? m[1] : null; };
    title = pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)
      || pick(/<title[^>]*>([^<]+)</i);
    description = pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i)
      || pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i);
    image = pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i);
  } catch (_) {}
  return { ...r, preview: { title, description, image } };
}

// ---- virustotal (optional, only with explicit opt-in + non-private URL) ----
async function virustotalCheck(url, apiKey) {
  const key = apiKey || process.env.VIRUSTOTAL_API_KEY;
  if (!key) return { status: 'AUTH_REQUIRED', detail: 'VIRUSTOTAL_API_KEY missing' };
  if (isPrivateUrl(url)) return { status: 'SKIPPED_PRIVATE', detail: 'private URLs are never sent to external scanners' };
  const { post } = require('./shorteners/_base');
  const r = await post('https://www.virustotal.com/api/v3/urls', { url }, { 'x-apikey': key }, (j) => ({ id: j.data && j.data.id }));
  return r.ok ? { status: 'SUBMITTED', id: r.id } : { status: r.status, detail: r.detail };
}

// ---- history (in-memory of this process; safe metadata only) ----
const historyLog = [];
function logHistory(entry) {
  const u = (() => { try { return new URL(entry.normalizedUrl); } catch (_) { return null; } })();
  historyLog.push({
    input: u ? u.hostname + u.pathname : entry.inputUrl,
    provider: entry.provider && entry.provider.id,
    finalHost: (() => { try { return new URL(entry.finalDestination.url).hostname; } catch (_) { return null; } })(),
    status: entry.status, risk: entry.security && entry.security.risk,
    at: entry.scrapedAt,
  });
  if (historyLog.length > 200) historyLog.shift();
}

module.exports = {
  analyzeUrl, shortenWith, autoShorten, linkPreview, virustotalCheck,
  cleanLink: (url) => cleanUrl(normalizeUrl(url)),
  getHistory: () => [...historyLog].reverse(),
  logHistory, isPrivateUrl, providers, findByDomain, getById,
};
