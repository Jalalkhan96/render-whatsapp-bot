'use strict';
// Per-site test for washingtonpost (Washington Post). Run: node tests/sites/washingtonpost.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('washingtonpost').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
