'use strict';
// Per-site test for bestbuy (Best Buy). Run: node tests/sites/bestbuy.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('bestbuy').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
