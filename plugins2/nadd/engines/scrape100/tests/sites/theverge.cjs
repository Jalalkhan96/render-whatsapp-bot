'use strict';
// Per-site test for theverge (The Verge). Run: node tests/sites/theverge.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('theverge').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
