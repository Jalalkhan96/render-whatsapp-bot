'use strict';
// Per-site test for fbr (FBR). Run: node tests/sites/fbr.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('fbr').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
