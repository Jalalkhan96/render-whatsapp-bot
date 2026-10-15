'use strict';
// Per-site test for forbes (Forbes). Run: node tests/sites/forbes.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('forbes').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
