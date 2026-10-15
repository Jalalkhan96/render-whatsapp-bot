'use strict';
// Per-site test for yahoo-finance (Yahoo Finance). Run: node tests/sites/yahoo-finance.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('yahoo-finance').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
