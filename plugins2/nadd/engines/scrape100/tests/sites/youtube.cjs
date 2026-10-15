'use strict';
// Per-site test for youtube (YouTube). Run: node tests/sites/youtube.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('youtube').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
