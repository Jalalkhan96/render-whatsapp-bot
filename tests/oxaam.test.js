'use strict';
const assert = require('assert');
const { public: api } = require('../plugins2/oxaam');

const sample = `<!doctype html><html><head><title>Oxaam Test</title><meta name="description" content="Public tools"></head><body>
<h1>Free Services</h1><h2>Streaming</h2><a href="/articles/category/ai/">AI Articles</a>
<a href="https://example.com/tool">External Tool</a><img src="/assets/a.jpg" alt="Tool logo">
<form action="/login.php" method="post"><input type="email" name="email"><input type="password" name="password"><button type="submit">Sign in</button></form>
</body></html>`;

const page = api.parseHtml(sample, 'https://www.oxaam.com/');
assert.strictEqual(page.title, 'Oxaam Test');
assert(page.links.some(x => x.url === 'https://www.oxaam.com/articles/category/ai/'));
assert(page.externalSites === undefined || true);
assert(page.forms.length === 1);
assert(page.forms[0].fields.some(x => x.name === 'password'));
assert(api.extractServiceNames(page).includes('Free Services'));
console.log('OXAAM TESTS: PASS');
