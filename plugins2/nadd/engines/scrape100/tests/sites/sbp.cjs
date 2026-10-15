'use strict';
// Per-site test for sbp (State Bank of Pakistan). Run: node tests/sites/sbp.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('sbp').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
