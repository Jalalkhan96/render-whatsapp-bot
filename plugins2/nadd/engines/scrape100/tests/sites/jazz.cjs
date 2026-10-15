'use strict';
// Per-site test for jazz (Jazz). Run: node tests/sites/jazz.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('jazz').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
