'use strict';
// Per-site test for aaj (Aaj). Run: node tests/sites/aaj.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('aaj').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
