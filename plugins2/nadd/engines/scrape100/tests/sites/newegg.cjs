'use strict';
// Per-site test for newegg (Newegg). Run: node tests/sites/newegg.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('newegg').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
