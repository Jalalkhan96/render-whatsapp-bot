'use strict';
// Per-site test for marketwatch (MarketWatch). Run: node tests/sites/marketwatch.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('marketwatch').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
