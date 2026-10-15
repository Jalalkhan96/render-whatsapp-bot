'use strict';
// Per-site test for coingecko (CoinGecko). Run: node tests/sites/coingecko.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('coingecko').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
