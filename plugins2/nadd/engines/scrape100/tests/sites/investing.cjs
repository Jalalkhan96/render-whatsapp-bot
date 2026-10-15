'use strict';
// Per-site test for investing (Investing.com). Run: node tests/sites/investing.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('investing').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
