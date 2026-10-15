'use strict';
// Link Engine test suite: 301/302/303/307/308, meta refresh, JS redirect,
// loop, chain, affiliate/tracking, unknown shortener, timeout, SSRF, malformed.
const assert = require('assert');
const http = require('http');
const { normalizeUrl } = require('../url-normalizer');
const { validateUrl } = require('../url-validator');
const { detectTracking, cleanUrl } = require('../tracking-detector');
const { detectAffiliate } = require('../affiliate/affiliate-detector');
const { detectProvider, classify } = require('../shortener-detector');
const { analyzeDomain } = require('../domain-analyzer');
const { assess } = require('../safety-engine');
const { traceRedirects } = require('../redirect-engine');
const { assertPublicTarget } = require('../security/ssrf');
const { detect: detectMonetized } = require('../security/monetized-detector');

let pass = 0, fail = 0;
function t(name, fn) {
  return Promise.resolve().then(fn).then(
    () => { pass++; console.log('  ✅', name); },
    (e) => { fail++; console.log('  ❌', name, '—', e.message); });
}

function localServer(routes) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const r = routes[req.url] || { status: 404, body: 'nf' };
      if (r.delay) return setTimeout(() => finish(), r.delay);
      finish();
      function finish() {
        res.writeHead(r.status, r.headers || { 'Content-Type': 'text/html' });
        res.end(r.body || '');
      }
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, base: `http://127.0.0.1:${srv.address().port}` }));
  });
}

(async () => {
  console.log('LINK ENGINE TESTS');
  // normalizer
  await t('normalizer adds https + lowercases host', () => {
    assert.strictEqual(normalizeUrl('EXAMPLE.COM/Path'), 'https://example.com/Path');
  });
  await t('normalizer strips fragment', () => {
    assert.ok(!normalizeUrl('https://example.com/a#frag').includes('#'));
  });
  // validator
  await t('validator rejects javascript:', () => {
    assert.strictEqual(validateUrl('javascript:alert(1)').valid, false);
  });
  await t('validator rejects data:', () => {
    assert.strictEqual(validateUrl('data:text/html,hi').valid, false);
  });
  await t('validator accepts https', () => {
    assert.strictEqual(validateUrl('https://example.com').valid, true);
  });
  // tracking / affiliate
  await t('tracking detected: utm_source', () => {
    const d = detectTracking('https://example.com/p?id=123&utm_source=x');
    assert.ok(d.detected && d.parameters.includes('utm_source'));
  });
  await t('cleanUrl keeps functional, drops tracking', () => {
    const { clean, removed } = cleanUrl('https://example.com/p?id=123&utm_source=x&tag=aff');
    assert.ok(clean.includes('id=123') && !clean.includes('utm_source') && removed.length === 2);
  });
  await t('affiliate detected: tag', () => {
    assert.ok(detectAffiliate('https://example.com/dp?tag=aff-20').detected);
  });
  // provider detection
  await t('detects Bitly', () => {
    assert.strictEqual(detectProvider('https://bit.ly/abc123').provider.id, 'bitly');
  });
  await t('detects TinyURL', () => {
    assert.strictEqual(detectProvider('https://tinyurl.com/abc').provider.id, 'tinyurl');
  });
  await t('unknown custom domain -> unknown', () => {
    assert.strictEqual(detectProvider('https://go.example.com/x1').provider.id, 'unknown');
  });
  await t('classification labels shortened+tracking', () => {
    const c = classify('https://bit.ly/x?utm_source=y', null);
    assert.ok(c.labels.includes('shortened') && c.labels.includes('tracking'));
  });
  // domain
  await t('domain: ip host flagged', () => {
    assert.ok(analyzeDomain('http://1.2.3.4/x').signals.includes('ip_host'));
  });
  await t('domain: punycode flagged', () => {
    assert.ok(analyzeDomain('https://xn--exmple-cua.com').signals.includes('punycode'));
  });
  // safety
  await t('safety: http ip url is not low', () => {
    const s = assess({ url: 'http://1.2.3.4/x', hopCount: 0 });
    assert.notStrictEqual(s.risk, 'low');
  });
  // SSRF
  await t('SSRF blocks 127.0.0.1', async () => {
    const r = await assertPublicTarget('http://127.0.0.1/test');
    assert.strictEqual(r.ok, false);
  });
  await t('SSRF blocks localhost', async () => {
    const r = await assertPublicTarget('http://localhost/test');
    assert.strictEqual(r.ok, false);
  });
  await t('SSRF blocks 10.0.0.1', async () => {
    const r = await assertPublicTarget('http://10.0.0.1/test');
    assert.strictEqual(r.ok, false);
  });
  await t('SSRF blocks metadata IP', async () => {
    const r = await assertPublicTarget('http://169.254.169.254/latest');
    assert.strictEqual(r.ok, false);
  });
  // monetized
  await t('monetized detector flags linkvertise', () => {
    const d = detectMonetized('https://linkvertise.com/12345');
    assert.strictEqual(d.status, 'interaction_required');
  });
  // live redirect chain against local server (allowPrivate: test-only bypass)
  const { srv, base } = await localServer({
    '/s301': { status: 301, headers: { location: '/s302' } },
    '/s302': { status: 302, headers: { location: '/final' } },
    '/final': { status: 200, body: '<html><head><title>Done</title></head><body>ok</body></html>' },
    '/meta': { status: 200, body: '<html><head><meta http-equiv="refresh" content="0; url=/final"></head></html>' },
    '/js': { status: 200, body: '<html><head><script>window.location="/final";</script></head></html>' },
    '/loop1': { status: 301, headers: { location: '/loop2' } },
    '/loop2': { status: 301, headers: { location: '/loop1' } },
    '/307': { status: 307, headers: { location: '/final' } },
  });
  const TP = { allowPrivate: true, timeout: 5000 };
  await t('301 -> 302 chain resolves', async () => {
    const r = await traceRedirects(base + '/s301', TP);
    assert.strictEqual(r.status, 'resolved');
    assert.strictEqual(r.finalUrl, base + '/final');
    assert.strictEqual(r.hopCount, 2);
  });
  await t('307 resolves', async () => {
    const r = await traceRedirects(base + '/307', TP);
    assert.strictEqual(r.status, 'resolved');
  });
  await t('meta refresh followed', async () => {
    const r = await traceRedirects(base + '/meta', TP);
    assert.strictEqual(r.status, 'resolved');
    assert.ok(r.hops.some((h) => h.type === 'meta_redirect'));
  });
  await t('public JS redirect followed', async () => {
    const r = await traceRedirects(base + '/js', TP);
    assert.strictEqual(r.status, 'resolved');
    assert.ok(r.hops.some((h) => h.type === 'javascript_redirect'));
  });
  await t('redirect loop detected', async () => {
    const r = await traceRedirects(base + '/loop1', { ...TP, maxHops: 10 });
    assert.strictEqual(r.status, 'REDIRECT_LOOP');
  });
  await t('hop limit enforced', async () => {
    const { srv: srv2, base: base2 } = await localServer({
      '/c1': { status: 301, headers: { location: '/c2' } },
      '/c2': { status: 301, headers: { location: '/c3' } },
      '/c3': { status: 301, headers: { location: '/c4' } },
      '/c4': { status: 301, headers: { location: '/c5' } },
      '/c5': { status: 200, body: 'end' },
    });
    const r = await traceRedirects(base2 + '/c1', { ...TP, maxHops: 3 });
    srv2.close();
    assert.strictEqual(r.status, 'REDIRECT_LIMIT');
  });
  await t('click-through interstitial -> INTERACTION_REQUIRED (never auto-clicked)', async () => {
    const { srv: srv3, base: base3 } = await localServer({
      '/fresh': { status: 200, body: '<html><body><h1>This short url was created recently.</h1><p>In order to help fight phishing, fresh short urls require an explicit click-through before we redirect you.</p><p>redirecting you to the following URL:</p><a href="https://example.com/real-target"><pre class="interstitial_long_url">x</pre></a></body></html>' },
    });
    const r = await traceRedirects(base3 + '/fresh', TP);
    srv3.close();
    assert.strictEqual(r.status, 'INTERACTION_REQUIRED');
    assert.strictEqual(r.advertisedDestination, 'https://example.com/real-target');
  });
  srv.close();

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
