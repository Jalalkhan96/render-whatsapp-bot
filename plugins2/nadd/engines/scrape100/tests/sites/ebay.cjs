'use strict';
// Per-site test for ebay (eBay). Run: node tests/sites/ebay.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('ebay').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
